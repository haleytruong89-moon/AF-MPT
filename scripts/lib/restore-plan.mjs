// P2.4b Task 2: pure restore plan for one v2 project. Diffs the restore target (backup
// tree + retained live items, restore-target.mjs) doc by doc against the live v2 docs:
// create / update only, never delete (Ruling P4b-3). Keeps the live v2-only fields with
// the App planner's own helpers (carryDoc, overlay, keepOrder, META_SKIP, KEEP_PROGRAM;
// Rulings P4b-4, P4b-14, P4b-15), never patches access fields (P4b-5), reports history
// loss (P4b-6, P4b-16), edited entries (P4b-16) and credit loss (P4b-17), hashes the plan with the live fingerprint
// (P4b-9) and builds the snapshot file (P4b-10). No I/O, never mutates its inputs.
//
// Live = { meta: object, docs: { [kind]: Array<{ id, data }> } } with plain-JSON data
// (the I/O layer converts Timestamps first).
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { assembleProject, splitProject } from '../../src/migrateV2.js';
import { carryDoc, overlay, keepOrder, META_SKIP, KEEP_PROGRAM } from '../../src/planV2Save.js';
import { appValueFromV2 } from '../../src/readV2.js';
import { stableJson } from './migrate-normalise.mjs';
import { SUBCOLS, MAX_PROJECT_DOC_BYTES } from './migrate-checks.mjs';
import { buildRestoreTarget, TASK_DROPPED, ACTION_CANCELLED } from './restore-target.mjs';

export { SUBCOLS, MAX_PROJECT_DOC_BYTES, TASK_DROPPED, ACTION_CANCELLED };
export const RESTORE_STAMP = 'p2-restore';
export const RESTORES_PATH = (restoreId) => `workspaces/main/restores/${restoreId}`;
export const restoreIdOf = (pid, planHash) => `${pid}_${planHash}`;
// Sub-doc ops + project patch + activity event + restore record, in one transaction.
export const MAX_TX_OPS = 450;

const STAMPS = ['version', 'updatedBy', 'updatedAt', 'viaProgramId', 'viaWorkstreamId'];
const RETAINED_KIND = { workstream: 'workstreams', task: 'tasks', action: 'actions', decision: 'decisions' };
// P3 close requests are history too (final review): shrinking the list is a loss.
const ENTRY_LISTS = { tasks: ['updates', 'checkIns', 'closeRequestHistory'], actions: ['updates'] };
const PREVIEW_CHARS = 60;
const blank = (v) => v == null || (typeof v === 'string' && !v.trim());
const hasPerson = (v) => (Array.isArray(v) ? v.some((x) => !blank(x)) : !blank(v));

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const strip = (data) => {
  const out = { ...(data || {}) };
  for (const k of STAMPS) delete out[k];
  return out;
};
const withoutKey = (o, k) => {
  const out = { ...(o || {}) };
  delete out[k];
  return out;
};
const versionOf = (data) => (typeof data?.version === 'number' ? data.version : 0);
const byKindId = (a, b) => SUBCOLS.indexOf(a.kind) - SUBCOLS.indexOf(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const liveLists = (live) => SUBCOLS.map((k) => arr(live?.docs?.[k]));

// sha256 of the live state without updatedAt stamps (Ruling P4b-9).
export function liveFingerprint(live) {
  const docs = {};
  for (const kind of SUBCOLS) {
    docs[kind] = arr(live?.docs?.[kind])
      .map((d) => [d.id, d.data?.version ?? null, sha256(stableJson(withoutKey(d.data, 'updatedAt')))])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  return sha256(stableJson({ meta: withoutKey(live?.meta, 'updatedAt'), docs }));
}

// 16 hex over everything HOD approves (Ruling P4b-9).
export function planHashOf(plan, { pid, backupSha256, allowHistoryLoss }) {
  return sha256(stableJson({
    pid,
    backupSha256: backupSha256 ?? null,
    allowHistoryLoss: !!allowHistoryLoss,
    fingerprint: plan.fingerprint,
    ops: plan.ops,
    metaPatch: plan.metaPatch,
    retained: plan.report?.retained ?? [],
    historyLost: plan.report?.historyLost ?? [],
    raidItemsLost: plan.report?.raidItemsLost ?? 0,
  })).slice(0, 16);
}

// --- history loss (Ruling P4b-6) ---
const withoutAuthor = (e) => (isObj(e) ? withoutKey(e, 'authorUid') : e);
const entryKey = (e) => (isObj(e) && e.id != null ? `id:${e.id}` : `c:${stableJson(withoutAuthor(e))}`);
function lostEntries(oldList, newList) {
  const left = new Map();
  for (const e of arr(newList)) left.set(entryKey(e), (left.get(entryKey(e)) || 0) + 1);
  const lost = [];
  for (const e of arr(oldList)) {
    const k = entryKey(e);
    if (left.get(k) > 0) left.set(k, left.get(k) - 1);
    else lost.push(e);
  }
  return lost;
}
function preview(e) {
  const t = isObj(e) ? (e.text ?? e.title ?? e.note ?? e.comment ?? e.description) : e;
  const s = typeof t === 'string' ? t : stableJson(withoutAuthor(e));
  return s.slice(0, PREVIEW_CHARS);
}
const describeEntries = (list) => list.map((e) => ({ id: isObj(e) && e.id != null ? String(e.id) : null, preview: preview(e) }));

// Per entry list: entries lost (live, not next) block (P4b-6); entries matched by id
// whose content changed are reported only (Ruling P4b-16), compared without the
// nested lists that are checked on their own and without authorUid.
function diffList(out, kind, id, list, oldList, newList, nested = []) {
  const lost = lostEntries(oldList, newList);
  if (lost.length) out.historyLost.push({ kind, id, list, entries: describeEntries(lost) });
  const shallow = (e) => {
    const o = withoutAuthor(e);
    for (const k of nested) delete o[k];
    return o;
  };
  const edited = [];
  for (const e of arr(oldList)) {
    if (!isObj(e) || e.id == null) continue;
    const n = arr(newList).find((x) => isObj(x) && x.id === e.id);
    if (n && !isDeepStrictEqual(shallow(e), shallow(n))) edited.push(n);
  }
  if (edited.length) out.editedEntries.push({ kind, id, list, entries: describeEntries(edited) });
  return lost;
}

function collectLosses(kind, id, old, next, out) {
  for (const k of ENTRY_LISTS[kind] || []) diffList(out, kind, id, k, old[k], next[k]);
  if (kind !== 'raid') return;
  out.raidItemsLost += diffList(out, kind, id, 'items', old.items, next.items, ['history', 'mitigationActions']).length;
  for (const item of arr(old.items)) {
    if (!isObj(item) || item.id == null) continue;
    const ni = arr(next.items).find((x) => isObj(x) && x.id === item.id);
    if (!ni) continue;
    diffList(out, kind, id, `items[${item.id}].history`, item.history, ni.history);
    diffList(out, kind, id, `items[${item.id}].mitigationActions`, item.mitigationActions, ni.mitigationActions, ['comments']);
    arr(item.mitigationActions).forEach((m, mi) => {
      if (!isObj(m)) return;
      const nm = m.id != null
        ? arr(ni.mitigationActions).find((x) => isObj(x) && x.id === m.id)
        : arr(ni.mitigationActions)[mi];
      if (m.id != null && !isObj(nm)) return; // the whole mitigation action is reported as lost
      const label = m.id != null ? m.id : mi;
      diffList(out, kind, id, `items[${item.id}].mitigationActions[${label}].comments`, m.comments, isObj(nm) ? nm.comments : []);
    });
  }
}

// Ruling P4b-19: per update op, the fields that change and the live fields the final doc
// no longer has. Removing a non-empty array or map is history loss (future fields such as
// P3 approval histories are covered without naming them); lists checked on their own
// (ENTRY_LISTS, RAID items) are not counted twice.
const isNonEmpty = (v) => (Array.isArray(v) ? v.length > 0 : isObj(v) && Object.keys(v).length > 0);
function fieldChanges(kind, id, old, fin, out, list) {
  const keys = [...new Set([...Object.keys(old), ...Object.keys(fin)])].sort();
  const changed = keys.filter((k) => !isDeepStrictEqual(old[k], fin[k]));
  const removed = Object.keys(old).filter((k) => !hasOwn(fin, k)).sort();
  list.push({ kind, id, changed, removed });
  const checked = new Set([...(ENTRY_LISTS[kind] || []), ...(kind === 'raid' ? ['items'] : [])]);
  for (const k of removed) {
    if (checked.has(k) || !isNonEmpty(old[k])) continue;
    const entries = Array.isArray(old[k])
      ? describeEntries(old[k])
      : Object.keys(old[k]).sort().map((x) => ({ id: x, preview: preview(old[k][x]) }));
    out.historyLost.push({ kind, id, list: `${k} (field removed)`, entries });
  }
  // A kept non-empty map (e.g. blockerResolutions) that loses a key loses history.
  for (const k of Object.keys(old).sort()) {
    if (checked.has(k) || !isObj(old[k]) || !isObj(fin[k])) continue;
    for (const key of Object.keys(old[k]).sort()) {
      if (hasOwn(fin[k], key)) continue;
      out.historyLost.push({ kind, id, list: `${k}.${key} (key removed)`, entries: [{ id: key, preview: preview(old[k][key]) }] });
    }
  }
}

const emptyReport = () => ({
  perKind: Object.fromEntries(SUBCOLS.map((k) => [k, { create: 0, update: 0, unchanged: 0, retained: 0 }])),
  retained: [], kept: [], historyLost: [], raidItemsLost: 0, editedEntries: [], creditLoss: [], programMeta: [], meta: [], fieldChanges: [],
  access: null, backupMemberIdsDiff: null, idMap: [], removedNulls: [], backupActivityCount: 0,
});

export function planRestore({
  pid, live, backupProject, dirIndex = null, uidByEmail = new Map(), allowHistoryLoss = false,
  hasMigrationRecord = false, backupSha256 = null, backupActivityCount = 0,
} = {}) {
  const blocked = [];
  const warnings = [];
  const block = (code, detail) => blocked.push({ code, detail: String(detail) });
  const warn = (code, detail) => warnings.push({ code, detail: String(detail) });
  const report = emptyReport();
  report.backupActivityCount = backupActivityCount;
  const lm = isObj(live?.meta) ? live.meta : null;
  const fingerprint = liveFingerprint(live);
  const result = (fields) => ({
    mode: 'blocked', blocked, warnings, refused: null, ops: [], metaPatch: null, report, fingerprint, planHash: null, target: null,
    ...fields,
  });

  if (!lm) block('not-found', pid);
  else {
    if (lm.deletedAt) block('deleted', lm.deletedAt);
    if (lm.schemaVersion !== 2) block('not-v2', lm.schemaVersion ?? 'none');
  }
  if (!isObj(backupProject)) block('backup-invalid', 'no project');
  if (blocked.length) return result({});

  report.access = {
    memberIds: arr(lm.memberIds).length,
    memberUids: arr(lm.memberUids).length,
    roles: isObj(lm.roles) ? Object.keys(lm.roles).length : 0,
    visibility: lm.visibility ?? null,
  };
  if (Array.isArray(backupProject.memberIds)) {
    const b = new Set(backupProject.memberIds.map(String));
    const l = new Set(arr(lm.memberIds).map(String));
    report.backupMemberIdsDiff = {
      added: [...b].filter((x) => !l.has(x)).sort(),
      removed: [...l].filter((x) => !b.has(x)).sort(),
    };
  }

  // Live tree. A missing RAID doc is the App's ensure-on-load placeholder (raid: []), not
  // a detached doc: it does not block.
  const liveDocs = Object.fromEntries(SUBCOLS.map((k) => [k, arr(live.docs?.[k])]));
  const assembled = assembleProject(lm, ...liveLists(live));
  const o = assembled.orphans;
  const orphanIds = [
    ...o.workstreams.map((id) => `workstreams/${id}`), ...o.tasks.map((id) => `tasks/${id}`),
    ...o.actions.map((id) => `actions/${id}`), ...o.raid.map((id) => `raid/${id}`),
  ];
  if (orphanIds.length) block('live-orphans', orphanIds.join(', '));
  // Ruling P4b-18: the tree is keyed by data.id; a doc whose data.id is missing or differs
  // from its doc id would be re-created under a new id instead of updated / retained.
  // RAID docs are keyed by programId, not id.
  const idMismatch = SUBCOLS.filter((k) => k !== 'raid')
    .flatMap((k) => liveDocs[k].filter((d) => d.data?.id == null || String(d.data.id) !== d.id).map((d) => `${k}/${d.id}`));
  if (idMismatch.length) {
    block('live-id-mismatch', idMismatch.join(', '));
    return result({});
  }

  const target = buildRestoreTarget(backupProject, assembled.project, { pid });
  blocked.push(...target.blocked);
  report.retained = target.retained;
  report.idMap = target.idMap;
  report.removedNulls = target.removedNulls;
  for (const r of target.retained) if (RETAINED_KIND[r.kind]) report.perKind[RETAINED_KIND[r.kind]].retained++;
  if (backupProject.name !== lm.name) warn('name-differs', `backup "${backupProject.name}" vs live "${lm.name}"`);
  if (target.idMap.length) warn('ids-generated', target.idMap.length);
  if (target.removedNulls.length) warn('nulls-removed', target.removedNulls.length);
  if (hasMigrationRecord) {
    warn('migration-rollback-affected', 'p2-migrate --rollback will report these docs as v2 edits; a rollback returns to the pre-migration v1 tree');
  }

  const split = splitProject(target.tree, { wid: 'main', dirIndex, uidByEmail });
  const stored = Object.fromEntries(SUBCOLS.map((k) => [k, new Map(liveDocs[k].map((d) => [d.id, d.data || {}]))]));
  for (const kind of ['actions', 'decisions']) {
    split[kind] = keepOrder(new Map(liveDocs[kind].map((d) => [d.id, { data: d.data || {} }])), split[kind]);
  }
  const unresolvedPic = new Set(split.report.unresolved
    .filter((u) => u.field === 'task.pic' || u.field === 'action.pic')
    .map((u) => `${u.field === 'task.pic' ? 'tasks' : 'actions'}/${u.where}`));

  const ops = [];
  const nextDocs = Object.fromEntries(SUBCOLS.map((k) => [k, []]));
  const skippedRaid = new Set();
  const losses = { historyLost: report.historyLost, editedEntries: report.editedEntries, raidItemsLost: 0 };
  const retainedTasks = new Set(target.retained.filter((r) => r.kind === 'task').map((r) => r.id));
  for (const kind of SUBCOLS) {
    const pk = report.perKind[kind];
    const seen = new Set();
    for (const { id, data } of split[kind]) {
      seen.add(id);
      const nd = strip(data);
      const lv = stored[kind].get(id);
      const picWarn = (fin, old) => {
        if ((kind === 'tasks' || kind === 'actions') && unresolvedPic.has(`${kind}/${id}`)
          && (!old || !isDeepStrictEqual(old.pic, fin.pic))) warn('pic-unresolved', `${kind}/${id}`);
      };
      // Ruling AH (as the App planner): without the directory a changed or new person
      // cannot be resolved; never write null uids for it.
      const personCheck = (fin, old) => {
        if (dirIndex || (kind !== 'tasks' && kind !== 'actions')) return;
        const changed = (k) => (!old || !isDeepStrictEqual(old[k], fin[k])) && hasPerson(fin[k]);
        if (changed('pic') || (kind === 'tasks' && changed('contributors'))) block('directory-unavailable', `${kind}/${id}`);
      };
      if (lv) {
        const old = strip(lv);
        const fin = carryDoc(kind, old, overlay(kind, old, nd));
        if (isDeepStrictEqual(fin, old)) {
          pk.unchanged++;
          nextDocs[kind].push({ id, data: lv });
          continue;
        }
        pk.update++;
        picWarn(fin, old);
        personCheck(fin, old);
        if (kind === 'tasks' && old.status === 'Completed' && fin.status !== 'Completed') {
          report.creditLoss.push({ id, name: fin.name ?? null, from: old.status, to: fin.status ?? null, retained: retainedTasks.has(id) });
        }
        collectLosses(kind, id, old, fin, losses);
        fieldChanges(kind, id, old, fin, losses, report.fieldChanges);
        ops.push({ kind, op: 'update', id, data: fin, expectVersion: versionOf(lv) });
        nextDocs[kind].push({ id, data: fin });
      } else {
        // Same as the App planner: an empty RAID list is never created as a doc.
        if (kind === 'raid' && Array.isArray(nd.items) && nd.items.length === 0) { skippedRaid.add(id); continue; }
        pk.create++;
        picWarn(nd, null);
        personCheck(nd, null);
        ops.push({ kind, op: 'create', id, data: nd, expectVersion: null });
        nextDocs[kind].push({ id, data: nd });
      }
    }
    // Ruling P4b-3: live docs without a counterpart stay as they are.
    for (const d of liveDocs[kind]) {
      if (seen.has(d.id)) continue;
      report.kept.push({ kind, id: d.id });
      nextDocs[kind].push(d);
    }
  }
  report.raidItemsLost = losses.raidItemsLost;
  ops.sort(byKindId);
  report.creditLoss.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Project doc: never deletes a field; access / bookkeeping keys are skipped.
  const metaPatch = {};
  const nm = split.meta;
  for (const k of Object.keys(nm)) {
    if (META_SKIP.has(k)) continue;
    if (!hasOwn(lm, k) || !isDeepStrictEqual(lm[k], nm[k])) {
      metaPatch[k] = nm[k];
      report.meta.push({ field: k, from: hasOwn(lm, k) ? lm[k] : null, to: nm[k] });
    }
  }
  // Live-only keys stay (no field delete); listed so HOD sees them.
  for (const k of Object.keys(lm)) {
    if (!META_SKIP.has(k) && !hasOwn(nm, k)) report.meta.push({ field: k, kept: true });
  }
  const storedPM = isObj(lm.programMeta) ? lm.programMeta : {};
  const nextPM = {};
  for (const [key, entry] of Object.entries(nm.programMeta || {})) {
    const s = storedPM[key];
    const e = { ...entry };
    if (s) {
      for (const k of KEEP_PROGRAM) if (hasOwn(s, k)) e[k] = s[k];
      if (skippedRaid.has(key)) {
        if (hasOwn(s, '__absent')) e.__absent = s.__absent;
        else delete e.__absent;
      }
    }
    nextPM[key] = e;
  }
  for (const [key, s] of Object.entries(storedPM)) if (!hasOwn(nextPM, key)) nextPM[key] = s;
  if (!isDeepStrictEqual(nextPM, storedPM)) {
    metaPatch.programMeta = nextPM;
    for (const key of Object.keys(nextPM)) {
      const a = storedPM[key] || {};
      const b = nextPM[key];
      const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((f) => !isDeepStrictEqual(a[f], b[f])).sort();
      if (fields.length) report.programMeta.push({ key, fields });
    }
  }
  const patch = Object.keys(metaPatch).length ? metaPatch : null;
  const dotted = Object.keys(metaPatch).filter((k) => k.includes('.'));
  if (dotted.length) block('dotted-field', `project field(s) with "." cannot be patched as one field: ${dotted.join(', ')}`);

  const bytes = Buffer.byteLength(JSON.stringify({ ...lm, ...(patch || {}) }), 'utf8');
  if (bytes >= MAX_PROJECT_DOC_BYTES) block('doc-too-large', `${bytes} bytes >= ${MAX_PROJECT_DOC_BYTES}`);
  const writes = ops.length + (patch ? 1 : 0) + 2;
  if (writes > MAX_TX_OPS) block('too-many-ops', `${writes} writes > ${MAX_TX_OPS}`);

  const nextMeta = { ...withoutKey(lm, 'updatedAt'), ...(patch || {}) };
  const targetTree = assembleProject(nextMeta, ...SUBCOLS.map((k) => nextDocs[k])).project;
  const refused = report.historyLost.length && !allowHistoryLoss ? 'history-loss' : null;
  const mode = blocked.length ? 'blocked' : !ops.length && !patch ? 'noop' : 'restore';
  const plan = result({ mode, refused, ops, metaPatch: patch, target: targetTree });
  if (mode === 'restore') plan.planHash = planHashOf(plan, { pid, backupSha256, allowHistoryLoss });
  return plan;
}

// The live state the apply should leave behind (verify input). Written docs get
// version / updatedBy; updatedAt (server time) is omitted on them and on the project doc.
export function expectedAfter(live, plan) {
  const meta = withoutKey(structuredClone(live.meta || {}), 'updatedAt');
  Object.assign(meta, structuredClone(plan.metaPatch || {}));
  const docs = Object.fromEntries(SUBCOLS.map((k) => [k, arr(live.docs?.[k]).map((d) => ({ id: d.id, data: structuredClone(d.data) }))]));
  for (const op of plan.ops || []) {
    const list = docs[op.kind];
    const data = { ...structuredClone(op.data), updatedBy: RESTORE_STAMP };
    if (op.op === 'create') list.push({ id: op.id, data: { ...data, version: 1 } });
    else {
      const i = list.findIndex((d) => d.id === op.id);
      const next = { id: op.id, data: { ...data, version: op.expectVersion + 1 } };
      if (i >= 0) list[i] = next;
      else list.push(next);
    }
  }
  return { meta, docs };
}

// Ruling P4b-10: Backup JSON shape (restorable by this script) plus the raw live docs.
export function buildSnapshot(live, plan, { pid, backupName, backupSha256, createdAt }) {
  const assembled = assembleProject(live.meta || {}, ...liveLists(live)).project;
  const { __v2: _v2, ...app } = appValueFromV2(assembled, pid, 0);
  void _v2;
  return {
    meta: { projectIds: [pid] },
    projects: { [pid]: app },
    activity: {},
    restoreSnapshot: {
      kind: 'p2-restore-snapshot',
      pid,
      planHash: plan.planHash,
      fingerprint: plan.fingerprint,
      backupFile: backupName,
      backupSha256,
      createdAt,
      docs: structuredClone(live.docs || {}),
      meta: structuredClone(live.meta || {}),
      ops: structuredClone(plan.ops || []),
    },
  };
}
