// P2.1 pure split / assemble between the v1 project tree (one Firestore doc with
// programs[].workstreams[].tasks[] and actionItems[]) and the v2 documents
// (project meta + workstream / task / action docs). No I/O, no mutation of inputs.
//
// Source of truth after the switch (Ruling C): `meta.programMeta` owns program-level
// data; the v1 `programs[]` / `actionItems[]` arrays that stay inside meta are FROZEN
// (rollback copy) and never read by assembleProject. assembleProject(...splitProject(p))
// deep-equals p exactly (v2-only meta fields programMeta / memberUids / v1Absent are
// stripped).
//
// Presence flags (so absent v1 keys stay absent):
//  - meta.v1Absent: ['programs'], ['actionItems'] and/or ['decisions'] when the v1 project lacks them.
//  - programMeta[k].__absent: subset of ['id', 'workstreams', 'raid'] missing on the v1 program.
//
// RAID lives in its own doc per program (doc id = the programMeta key, so duplicate
// programs stay apart): { workspaceId, projectId, programId, items, version: 1 }. A v1
// program without a `raid` key gets no raid doc (flag 'raid' in __absent). On assemble a
// program NOT flagged absent whose raid doc is missing gets `raid: []` and its key is
// listed in orphans.missingRaid so callers can detect the gap.
//  - workstream doc .__absent: ['tasks'] when the v1 workstream has no `tasks` key.
import { canonicalPerson } from './directory.js';
import { foldName } from './identity.js';
import { foldResolutions } from './blockerResolutions.js';

// v2-only field names. A v1 key with the same name is not overwritten: its value is
// parked in `__v1` on the doc (and reported in report.collisions); assembleProject
// restores it.
const STASH = '__v1';
const ABSENT = '__absent';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Map<taskId, {programId, workstreamId}> (first occurrence wins on duplicate ids).
export function taskWorkstreamOf(project) {
  const map = new Map();
  for (const p of project?.programs || []) {
    for (const w of p?.workstreams || []) {
      for (const t of w?.tasks || []) {
        if (t && t.id != null && !map.has(t.id)) map.set(t.id, { programId: p.id, workstreamId: w.id });
      }
    }
  }
  return map;
}

const PROGRAM_V2 = ['order', 'pmUid', 'deputyUid', 'start', 'end'];
// Write stamps / claims added by v2 writers. Never part of the v1 tree: assemble strips
// them; a v1 value with the same name is stashed at split time and restored.
const STAMPS = ['updatedBy', 'updatedAt', 'viaProgramId', 'viaWorkstreamId'];
const WS_V2 = ['workspaceId', 'projectId', 'programId', 'order', 'leadUid', 'start', 'end', 'version', ...STAMPS];
// blockerResolutions (P3 Task 8, Ruling P3-8): v2-only append-only map, folded into
// the matching updates entries on assemble and never part of the v1 tree.
const TASK_V2 = ['workspaceId', 'projectId', 'programId', 'workstreamId', 'order', 'picUid', 'picEmail', 'contributorUids', 'blockerResolutions', 'version', ...STAMPS];
// Reserved v2 names a v1 doc of that kind may not carry at top level (stashed on split).
const RESERVED = { task: ['blockerResolutions'] };
const ACTION_V2 = ['workspaceId', 'projectId', 'order', 'picUid', 'picEmail', 'workstreamId', 'version', ...STAMPS];
const DECISION_V2 = ['workspaceId', 'projectId', 'order', 'version', ...STAMPS];

// Copy `base`, add v2 fields, parking colliding v1 values in the stash.
function withV2(base, v2Fields, kind, id, collisions) {
  const data = { ...base };
  const stash = {};
  for (const key of Object.keys(v2Fields)) {
    if (hasOwn(base, key)) {
      stash[key] = base[key];
      collisions.push({ kind, id: id ?? null, key });
    }
    data[key] = v2Fields[key];
  }
  // `version` is already a v2 field on docs; the other stamps are reserved names.
  if (kind !== 'program') {
    for (const key of [...STAMPS, ...(RESERVED[kind] || [])]) {
      if (hasOwn(base, key) && !hasOwn(stash, key)) {
        stash[key] = base[key];
        collisions.push({ kind, id: id ?? null, key });
        delete data[key];
      }
    }
  }
  if (Object.keys(stash).length) data[STASH] = stash;
  return data;
}

function unwrap(data, v2Keys) {
  const out = { ...data };
  const stash = out[STASH];
  delete out[STASH];
  delete out[ABSENT];
  for (const k of v2Keys) delete out[k];
  if (stash) Object.assign(out, stash);
  return out;
}

// Unique doc ids: the v1 id, then `${id}__dup2`, `__dup3`... for repeats; a
// placeholder for a missing id (the stored v1 object keeps having no `id`).
function makeDocIds() {
  const seen = new Map();
  return (id, fallback) => {
    const base = id == null || id === '' ? fallback : String(id);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { docId: n === 1 ? base : `${base}__dup${n}`, dup: n > 1 };
  };
}

// report.duplicateIds: task ids as-is; others as `program:<id>`, `workstream:<id>`, `action:<id>`.
export function splitProject(project, { wid, dirIndex = null, uidByEmail = new Map() } = {}) {
  const projectId = project.id;
  const report = {
    counts: { programs: 0, workstreams: 0, tasks: 0, actions: 0, decisions: 0 },
    unresolved: [],
    duplicateIds: [],
    collisions: [],
  };
  const groups = new Set(
    (project.contributorRegistry || [])
      .map((g) => foldName(typeof g === 'string' ? g : g?.name || ''))
      .filter(Boolean),
  );
  const memberUids = new Set(Array.isArray(project.memberIds) ? project.memberIds : []);

  // -> { uid, email }; both null for blank, group or unresolved values.
  const resolve = (raw, field, where) => {
    const none = { uid: null, email: null };
    if (raw == null || (typeof raw === 'string' && !raw.trim())) return none;
    const s = typeof raw === 'string' ? raw : String(raw);
    if (groups.has(foldName(s))) return none;
    const p = canonicalPerson(dirIndex, s);
    if (!p.known) {
      report.unresolved.push({ field, raw: s, where });
      return none;
    }
    const uid = (uidByEmail && uidByEmail.get(p.id)) || null;
    if (uid) memberUids.add(uid);
    return { uid, email: p.id };
  };

  const programMeta = {};
  const workstreams = [];
  const tasks = [];
  const actions = [];
  const raid = [];
  const decisions = [];
  const progIds = makeDocIds();
  const wsIds = makeDocIds();
  const taskIds = makeDocIds();
  const actionIds = makeDocIds();
  const decisionIds = makeDocIds();
  const taskWsDoc = new Map(); // v1 task id -> workstream DOC id (first occurrence wins)

  (project.programs || []).forEach((prog, pi) => {
    report.counts.programs++;
    const { docId: progKey, dup: pdup } = progIds(prog.id, `__program${pi}`);
    if (pdup) report.duplicateIds.push(`program:${prog.id}`);
    const { workstreams: progWs, raid: progRaid, ...progRest } = prog;
    const entry = withV2(progRest, { order: pi, pmUid: null, deputyUid: null, start: null, end: null }, 'program', prog.id, report.collisions);
    const absent = [];
    if (!hasOwn(prog, 'id')) absent.push('id');
    if (!hasOwn(prog, 'workstreams')) absent.push('workstreams');
    if (!hasOwn(prog, 'raid')) absent.push('raid');
    else raid.push({ id: progKey, data: { workspaceId: wid, projectId, programId: progKey, items: progRaid, version: 1 } });
    if (absent.length) entry[ABSENT] = absent;
    programMeta[progKey] = entry;
    (progWs || []).forEach((ws, wi) => {
      report.counts.workstreams++;
      const { docId: wsDocId, dup } = wsIds(ws.id, `__ws${pi}_${wi}`);
      if (dup) report.duplicateIds.push(`workstream:${ws.id}`);
      // Every v1 workstream key except `tasks` is kept (id, name, and difficultyPreset /
      // difficultyMultiplier / weight only when present, plus any unknown key), so
      // presence/absence and unexpected keys round-trip exactly.
      const { tasks: wsTasks, ...wsRest } = ws;
      const wsData = withV2(wsRest, {
        workspaceId: wid, projectId, programId: progKey, order: wi, leadUid: null, start: null, end: null, version: 1,
      }, 'workstream', ws.id, report.collisions);
      if (!hasOwn(ws, 'tasks')) wsData[ABSENT] = ['tasks'];
      workstreams.push({ id: wsDocId, data: wsData });
      (wsTasks || []).forEach((t, ti) => {
        report.counts.tasks++;
        const { docId, dup: tdup } = taskIds(t.id, `__task_${wsDocId}_${ti}`);
        if (tdup) report.duplicateIds.push(String(t.id));
        if (t.id != null && !taskWsDoc.has(t.id)) taskWsDoc.set(t.id, wsDocId);
        const pic = resolve(t.pic, 'task.pic', docId);
        const contributorUids = [];
        for (const c of Array.isArray(t.contributors) ? t.contributors : []) {
          const r = resolve(c, 'task.contributors', docId);
          if (r.uid && !contributorUids.includes(r.uid)) contributorUids.push(r.uid);
        }
        tasks.push({
          id: docId,
          data: withV2(t, {
            workspaceId: wid, projectId, programId: progKey, workstreamId: wsDocId, order: ti,
            picUid: pic.uid, picEmail: pic.email, contributorUids, version: 1,
          }, 'task', t.id, report.collisions),
        });
      });
    });
  });

  (project.actionItems || []).forEach((a, ai) => {
    report.counts.actions++;
    const { docId, dup } = actionIds(a.id, `__action_${ai}`);
    if (dup) report.duplicateIds.push(`action:${a.id}`);
    const pic = resolve(a.pic, 'action.pic', docId);
    const wsDoc = a.relatedTaskId != null ? taskWsDoc.get(a.relatedTaskId) : undefined;
    actions.push({
      id: docId,
      data: withV2(a, {
        workspaceId: wid, projectId, order: ai, picUid: pic.uid, picEmail: pic.email,
        workstreamId: wsDoc ?? null, version: 1,
      }, 'action', a.id, report.collisions),
    });
  });

  (project.decisions || []).forEach((d, di) => {
    report.counts.decisions++;
    const { docId, dup } = decisionIds(d?.id, `__decision_${di}`);
    if (dup) report.duplicateIds.push(`decision:${d.id}`);
    decisions.push({
      id: docId,
      data: withV2(d, { workspaceId: wid, projectId, order: di, version: 1 }, 'decision', d?.id, report.collisions),
    });
  });

  const meta = { ...project, programMeta, memberUids: [...memberUids].sort() };
  const v1Absent = ['programs', 'actionItems', 'decisions'].filter((k) => !hasOwn(project, k));
  if (v1Absent.length) meta.v1Absent = v1Absent;
  return { meta, workstreams, tasks, actions, raid, decisions, report };
}

const byOrder = (a, b) => (a.data.order ?? 0) - (b.data.order ?? 0);

// Rebuild the v1 project from v2 data only. Programs come from meta.programMeta (sorted
// by order), workstreams / tasks / actions from their docs. meta.programs and
// meta.actionItems are frozen v1 copies and are ignored.
// Returns { project, orphans } where orphans are doc ids that attach to nothing:
// workstream docs whose programId is not in programMeta, task docs whose workstreamId is
// not a workstream doc or is itself an orphan workstream, raid docs whose id is not in
// programMeta; plus missingRaid = program keys that expected a raid doc but got none.
// (Action docs always attach; `actions` is kept for symmetry.)
export function assembleProject(meta, workstreams, tasks, actions, raid = [], decisions = []) {
  const { programMeta = {}, memberUids: _mu, v1Absent = [], programs: _p, actionItems: _a, decisions: _d, ...project } = meta;
  void _mu; void _p; void _a; void _d;
  const orphans = { workstreams: [], tasks: [], actions: [], raid: [], missingRaid: [] };
  const wsIdSet = new Set(workstreams.map((w) => w.id));

  const wsByProgram = new Map();
  const orphanWsIds = new Set();
  for (const w of [...workstreams].sort(byOrder)) {
    const k = w.data.programId;
    if (!hasOwn(programMeta, k)) { orphans.workstreams.push(w.id); orphanWsIds.add(w.id); continue; }
    if (!wsByProgram.has(k)) wsByProgram.set(k, []);
    wsByProgram.get(k).push(w);
  }
  const tasksByWs = new Map();
  for (const t of [...tasks].sort(byOrder)) {
    const k = t.data.workstreamId;
    if (!wsIdSet.has(k) || orphanWsIds.has(k)) { orphans.tasks.push(t.id); continue; }
    if (!tasksByWs.has(k)) tasksByWs.set(k, []);
    tasksByWs.get(k).push(unwrap(foldResolutions(t.data), TASK_V2));
  }
  const raidByProgram = new Map();
  for (const r of raid) {
    if (!hasOwn(programMeta, r.id)) { orphans.raid.push(r.id); continue; }
    if (!raidByProgram.has(r.id)) raidByProgram.set(r.id, r);
  }

  const entries = Object.entries(programMeta).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
  if (entries.length || !v1Absent.includes('programs')) {
    project.programs = entries.map(([key, entry]) => {
      const absent = entry[ABSENT] || [];
      const out = unwrap(entry, PROGRAM_V2);
      if (!hasOwn(out, 'id') && !absent.includes('id')) out.id = key;
      const rd = raidByProgram.get(key);
      if (rd) out.raid = rd.data.items;
      else if (!absent.includes('raid')) { out.raid = []; orphans.missingRaid.push(key); }
      const docs = wsByProgram.get(key) || [];
      if (docs.length || !absent.includes('workstreams')) {
        out.workstreams = docs.map((w) => {
          const ws = unwrap(w.data, WS_V2);
          const list = tasksByWs.get(w.id) || [];
          if (list.length || !(w.data[ABSENT] || []).includes('tasks')) ws.tasks = list;
          return ws;
        });
      }
      return out;
    });
  }
  if (actions.length || !v1Absent.includes('actionItems')) {
    project.actionItems = [...actions].sort(byOrder).map((a) => unwrap(a.data, ACTION_V2));
  }
  if (decisions.length || !v1Absent.includes('decisions')) {
    project.decisions = [...decisions].sort(byOrder).map((d) => unwrap(d.data, DECISION_V2));
  }
  return { project, orphans };
}
