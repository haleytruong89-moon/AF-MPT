// P2.1 pure split / assemble between the v1 project tree (one Firestore doc with
// programs[].workstreams[].tasks[] and actionItems[]) and the v2 documents
// (project meta + workstream / task / action docs). No I/O, no mutation of inputs.
// assembleProject(...splitProject(p)) deep-equals p exactly (modulo the v2-only
// meta fields programMeta / memberUids, which assemble strips).
import { canonicalPerson } from './directory.js';

// v2-only field names. A v1 key with the same name is not overwritten: its value is
// parked in `__v1` on the doc (and reported in report.collisions); assembleProject
// restores it.
const STASH = '__v1';

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

const WS_V2 = ['workspaceId', 'projectId', 'programId', 'order', 'leadUid', 'start', 'end', 'version'];
const TASK_V2 = ['workspaceId', 'projectId', 'programId', 'workstreamId', 'order', 'picUid', 'picEmail', 'contributorUids', 'version'];
const ACTION_V2 = ['workspaceId', 'projectId', 'order', 'picUid', 'picEmail', 'workstreamId', 'version'];

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
  if (Object.keys(stash).length) data[STASH] = stash;
  return data;
}

function unwrap(data, v2Keys) {
  const out = { ...data };
  const stash = out[STASH];
  delete out[STASH];
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

// report.duplicateIds: task ids as-is; workstreams as `workstream:<id>`, actions as `action:<id>`.
export function splitProject(project, { wid, dirIndex = null, uidByEmail = new Map() } = {}) {
  const projectId = project.id;
  const report = {
    counts: { programs: 0, workstreams: 0, tasks: 0, actions: 0 },
    unresolved: [],
    duplicateIds: [],
    collisions: [],
  };
  const groups = new Set(
    (project.contributorRegistry || [])
      .map((g) => String(typeof g === 'string' ? g : g?.name || '').trim())
      .filter(Boolean),
  );
  const memberUids = new Set(Array.isArray(project.memberIds) ? project.memberIds : []);

  // -> { uid, email }; both null for blank, group or unresolved values.
  const resolve = (raw, field, where) => {
    const none = { uid: null, email: null };
    if (raw == null || (typeof raw === 'string' && !raw.trim())) return none;
    const s = typeof raw === 'string' ? raw : String(raw);
    if (groups.has(s.trim())) return none;
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
  const wsIds = makeDocIds();
  const taskIds = makeDocIds();
  const actionIds = makeDocIds();

  (project.programs || []).forEach((prog, pi) => {
    report.counts.programs++;
    programMeta[prog.id] = { name: prog.name, order: pi, pmUid: null, deputyUid: null, start: null, end: null };
    (prog.workstreams || []).forEach((ws, wi) => {
      report.counts.workstreams++;
      const { docId: wsDocId, dup } = wsIds(ws.id, `__ws${pi}_${wi}`);
      if (dup) report.duplicateIds.push(`workstream:${ws.id}`);
      // Every v1 workstream key except `tasks` is kept (id, name, and difficultyPreset /
      // difficultyMultiplier / weight only when present, plus any unknown key), so
      // presence/absence and unexpected keys round-trip exactly.
      const { tasks: wsTasks, ...wsRest } = ws;
      workstreams.push({
        id: wsDocId,
        data: withV2(wsRest, {
          workspaceId: wid, projectId, programId: prog.id, order: wi, leadUid: null, start: null, end: null, version: 1,
        }, 'workstream', ws.id, report.collisions),
      });
      (wsTasks || []).forEach((t, ti) => {
        report.counts.tasks++;
        const { docId, dup: tdup } = taskIds(t.id, `__task_${wsDocId}_${ti}`);
        if (tdup) report.duplicateIds.push(String(t.id));
        const where = t.id ?? docId;
        const pic = resolve(t.pic, 'task.pic', where);
        const contributorUids = [];
        for (const c of Array.isArray(t.contributors) ? t.contributors : []) {
          const r = resolve(c, 'task.contributors', where);
          if (r.uid && !contributorUids.includes(r.uid)) contributorUids.push(r.uid);
        }
        tasks.push({
          id: docId,
          data: withV2(t, {
            workspaceId: wid, projectId, programId: prog.id, workstreamId: wsDocId, order: ti,
            picUid: pic.uid, picEmail: pic.email, contributorUids, version: 1,
          }, 'task', t.id, report.collisions),
        });
      });
    });
  });

  const wsOf = taskWorkstreamOf(project);
  (project.actionItems || []).forEach((a, ai) => {
    report.counts.actions++;
    const { docId, dup } = actionIds(a.id, `__action_${ai}`);
    if (dup) report.duplicateIds.push(`action:${a.id}`);
    const pic = resolve(a.pic, 'action.pic', a.id ?? docId);
    const hit = a.relatedTaskId != null ? wsOf.get(a.relatedTaskId) : null;
    actions.push({
      id: docId,
      data: withV2(a, {
        workspaceId: wid, projectId, order: ai, picUid: pic.uid, picEmail: pic.email,
        workstreamId: hit ? hit.workstreamId : null, version: 1,
      }, 'action', a.id, report.collisions),
    });
  });

  const meta = { ...project, programMeta, memberUids: [...memberUids].sort() };
  return { meta, workstreams, tasks, actions, report };
}

const byOrder = (a, b) => (a.data.order ?? 0) - (b.data.order ?? 0);

// Rebuild the exact v1 project. Programs come from meta.programs (ids, names, raid and
// any other program key); their workstreams are replaced by the docs. A workstream whose
// v1 original (still inside meta.programs) had no `tasks` key keeps it absent.
export function assembleProject(meta, workstreams, tasks, actions) {
  const { programMeta: _pm, memberUids: _mu, ...project } = meta;
  void _pm;
  void _mu;
  const tasksByWs = new Map();
  for (const t of [...tasks].sort(byOrder)) {
    const k = t.data.workstreamId;
    if (!tasksByWs.has(k)) tasksByWs.set(k, []);
    tasksByWs.get(k).push(unwrap(t.data, TASK_V2));
  }
  const wsByProgram = new Map();
  for (const w of [...workstreams].sort(byOrder)) {
    const k = w.data.programId;
    if (!wsByProgram.has(k)) wsByProgram.set(k, []);
    wsByProgram.get(k).push(w);
  }
  project.programs = (meta.programs || []).map((prog) => {
    const original = new Map((prog.workstreams || []).map((w) => [w.id, w]));
    const out = { ...prog };
    const docs = wsByProgram.get(prog.id);
    if (docs || hasOwn(prog, 'workstreams')) {
      out.workstreams = (docs || []).map((w) => {
        const ws = unwrap(w.data, WS_V2);
        const orig = original.get(ws.id);
        const list = tasksByWs.get(w.id) || [];
        if (list.length || !orig || hasOwn(orig, 'tasks')) ws.tasks = list;
        return ws;
      });
    }
    return out;
  });
  if (hasOwn(meta, 'actionItems') || actions.length) {
    project.actionItems = [...actions].sort(byOrder).map((a) => unwrap(a.data, ACTION_V2));
  }
  return project;
}
