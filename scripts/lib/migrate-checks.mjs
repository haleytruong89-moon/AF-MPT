// P2.4 Task 2: pure pre-checks, order check, count report and v2-edit detection for the
// in-place v1 -> v2 switch. No I/O. Constants shared with migrate-plan.mjs live here
// (the plan module re-exports them) to avoid an import cycle.
import { isDeepStrictEqual } from 'node:util';
import { assembleProject, splitProject } from '../../src/migrateV2.js';
import { compareTrees } from '../p2-compare.mjs';
import { normaliseForV2 } from './migrate-normalise.mjs';

export const MIGRATE_STAMP = 'p2-migrate';
export const MAX_PROJECT_DOC_BYTES = 900 * 1024;
export const SUBCOLS = ['workstreams', 'tasks', 'actions', 'raid', 'decisions'];

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const KINDS_WITH_ENTRIES = ['updates', 'checkIns', 'history', 'comments'];

// Paths (original v1 indices) of lists that are themselves null.
function nullListPaths(doc) {
  const out = [];
  const chk = (obj, key, path) => { if (isObj(obj) && hasOwn(obj, key) && obj[key] === null) out.push(path); };
  for (const k of ['programs', 'actionItems', 'decisions']) chk(doc, k, k);
  arr(doc.programs).forEach((p, pi) => {
    if (!isObj(p)) return;
    chk(p, 'workstreams', `programs[${pi}].workstreams`);
    arr(p.workstreams).forEach((w, wi) => {
      if (!isObj(w)) return;
      chk(w, 'tasks', `programs[${pi}].workstreams[${wi}].tasks`);
      arr(w.tasks).forEach((t, ti) => {
        for (const k of KINDS_WITH_ENTRIES) chk(t, k, `programs[${pi}].workstreams[${wi}].tasks[${ti}].${k}`);
      });
    });
  });
  arr(doc.actionItems).forEach((a, ai) => {
    for (const k of KINDS_WITH_ENTRIES) chk(a, k, `actionItems[${ai}].${k}`);
  });
  return out;
}

export function precheckProject(doc, { pid, dirIndex = null, uidByEmail = new Map(), maxBytes = MAX_PROJECT_DOC_BYTES } = {}) {
  const blocking = [];
  const warnings = [];
  const block = (code, detail) => blocking.push({ code, detail: String(detail) });
  const warn = (code, detail) => warnings.push({ code, detail: String(detail) });

  if (!doc || typeof doc !== 'object') {
    block('not-found', pid);
    return { blocking, warnings, normalised: null, split: null };
  }
  if (doc.deletedAt) block('deleted', String(doc.deletedAt));
  if (doc.schemaVersion !== 2) {
    const present = ['programMeta', 'memberUids', 'v1Absent'].filter((k) => hasOwn(doc, k));
    if (present.length) block('v2-fields-present', present.join(', '));
  }
  arr(doc.programs).forEach((p, i) => {
    if (isObj(p) && hasOwn(p, 'raid') && !Array.isArray(p.raid)) block('raid-not-array', `programs[${i}].raid`);
  });

  const normalised = normaliseForV2(doc, { pid });
  const split = splitProject(normalised.project, { wid: 'main', dirIndex, uidByEmail });

  // v1-stamp: same check as the pilot copy (the stamp would overwrite a v1 updatedBy).
  const lists = { workstreams: split.workstreams, tasks: split.tasks, actions: split.actions, decisions: split.decisions };
  for (const [kind, docs] of Object.entries(lists)) {
    for (const d of docs) {
      if (hasOwn(d.data, 'updatedBy') || (d.data.__v1 && hasOwn(d.data.__v1, 'updatedBy'))) block('v1-stamp', `${kind}/${d.id}`);
    }
  }

  const merged = {
    ...doc,
    programMeta: split.meta.programMeta,
    memberUids: split.meta.memberUids,
    visibility: doc.visibility ?? 'restricted',
    schemaVersion: 2,
    ...(split.meta.v1Absent ? { v1Absent: split.meta.v1Absent } : {}),
  };
  const bytes = Buffer.byteLength(JSON.stringify(merged), 'utf8');
  if (bytes >= maxBytes) block('doc-too-large', `${bytes} bytes >= ${maxBytes}`);

  const back = assembleProject(split.meta, split.workstreams, split.tasks, split.actions, split.raid, split.decisions);
  if (!isDeepStrictEqual(back.project, normalised.project)) block('round-trip', 'assemble(split(normalised)) differs from normalised');
  const o = back.orphans;
  const orphanIds = [...o.workstreams, ...o.tasks, ...o.actions, ...o.raid, ...o.missingRaid];
  if (orphanIds.length) block('orphans', orphanIds.join(', '));

  for (const p of nullListPaths(doc)) warn('null-list', p);
  for (const a of split.actions) {
    if (a.data.workstreamId == null) warn('action-ws-null', a.id);
  }
  for (const u of split.report.unresolved) warn('pic-unresolved', u.where);
  for (const [kind, docs] of [['tasks', split.tasks], ['actions', split.actions]]) {
    for (const d of docs) {
      if (d.data.picEmail && !d.data.picUid) warn('pic-invite-only', `${kind}/${d.id}`);
    }
  }
  if (split.report.collisions.length) warn('key-collisions', split.report.collisions.length);
  if (!Array.isArray(doc.memberIds) || !doc.memberIds.length) warn('no-members', pid);
  if (normalised.idMap.length) warn('ids-generated', normalised.idMap.length);
  if (normalised.removedNulls.length) warn('nulls-removed', normalised.removedNulls.length);
  return { blocking, warnings, normalised, split };
}

// docs: [{ id, data }]. Per group: 'tied' (two docs share an order value) and 'missing'
// (order absent or not a number). A fresh split gives no issues.
export function checkOrders(docs, groupKey) {
  const groups = new Map();
  for (const d of docs) {
    const g = groupKey(d);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(d);
  }
  const out = [];
  for (const [group, list] of groups) {
    const byOrder = new Map();
    const missing = [];
    for (const d of list) {
      const ord = d.data?.order;
      if (typeof ord !== 'number' || Number.isNaN(ord)) { missing.push(d.id); continue; }
      if (!byOrder.has(ord)) byOrder.set(ord, []);
      byOrder.get(ord).push(d.id);
    }
    const tied = [...byOrder.values()].filter((ids) => ids.length > 1).flat();
    if (tied.length) out.push({ group, kind: 'tied', ids: tied });
    if (missing.length) out.push({ group, kind: 'missing', ids: missing });
  }
  return out;
}

// Task doc ids whose workstreamId is not a workstream doc, or whose programId differs from it.
export function taskLinkMismatches(wsDocs, taskDocs) {
  const prog = new Map(wsDocs.map((w) => [w.id, w.data?.programId]));
  return taskDocs
    .filter((t) => !prog.has(t.data?.workstreamId) || prog.get(t.data.workstreamId) !== t.data?.programId)
    .map((t) => t.id);
}

const count = (x) => (Array.isArray(x) ? x.length : Number(x) || 0);

function v1Counts(v1Raw) {
  const c = { programs: 0, workstreams: 0, tasks: 0, actions: 0, decisions: 0, raid: 0 };
  c.programs = arr(v1Raw?.programs).length;
  for (const p of arr(v1Raw?.programs)) {
    if (!isObj(p)) continue;
    c.raid += arr(p.raid).length;
    c.workstreams += arr(p.workstreams).length;
    for (const w of arr(p.workstreams)) if (isObj(w)) c.tasks += arr(w.tasks).length;
  }
  c.actions = arr(v1Raw?.actionItems).length;
  c.decisions = arr(v1Raw?.decisions).length;
  return c;
}

function removedCounts(removedNulls) {
  const r = { programs: 0, workstreams: 0, tasks: 0, actions: 0, decisions: 0, raid: 0 };
  for (const p of removedNulls) {
    if (/^programs\[\d+\]$/.test(p)) r.programs++;
    else if (/\.raid\[\d+\]$/.test(p)) r.raid++;
    else if (/\.workstreams\[\d+\]$/.test(p)) r.workstreams++;
    else if (/\.tasks\[\d+\]$/.test(p)) r.tasks++;
    else if (/^actionItems\[\d+\]$/.test(p)) r.actions++;
    else if (/^decisions\[\d+\]$/.test(p)) r.decisions++;
  }
  return r;
}

// live = { meta, workstreams, tasks, actions, raid, decisions, activity } (docs: [{id,data}]).
export function countReport({ v1Raw, normalised, live, v1ActivityCount = 0 }) {
  const v1 = v1Counts(v1Raw);
  const removed = removedCounts(normalised.removedNulls);
  const v2 = {
    programs: Object.keys(live.meta?.programMeta || {}).length,
    workstreams: count(live.workstreams),
    tasks: count(live.tasks),
    actions: count(live.actions),
    decisions: count(live.decisions),
    raid: arr(live.raid).reduce((n, r) => n + count(r?.data?.items), 0),
  };
  const kinds = ['programs', 'workstreams', 'tasks', 'actions', 'decisions', 'raid'];
  const rows = kinds.map((kind) => ({ kind, v1: v1[kind], removed: removed[kind], v2: v2[kind], ok: v1[kind] - removed[kind] === v2[kind] }));
  const act = count(live.activity);
  rows.push({ kind: 'activity', v1: v1ActivityCount, removed: 0, v2: act, ok: v1ActivityCount === act });

  const back = assembleProject(live.meta || {}, arr(live.workstreams), arr(live.tasks), arr(live.actions), arr(live.raid), arr(live.decisions));
  const roundTrip = compareTrees(normalised.project, back.project);
  const o = back.orphans;
  const orphanCount = o.workstreams.length + o.tasks.length + o.actions.length + o.raid.length + o.missingRaid.length;
  const linkMismatches = taskLinkMismatches(arr(live.workstreams), arr(live.tasks));
  const orderIssues = [
    ...checkOrders(arr(live.workstreams), (d) => `ws:${d.data?.programId}`),
    ...checkOrders(arr(live.tasks), (d) => `task:${d.data?.workstreamId}`),
    ...checkOrders(arr(live.actions), () => 'actions'),
    ...checkOrders(arr(live.decisions), () => 'decisions'),
  ];
  const ok = rows.every((r) => r.ok) && roundTrip.equal && orphanCount === 0 && linkMismatches.length === 0 && orderIssues.length === 0;
  return { rows, roundTrip, orphanCount, linkMismatches, orderIssues, ok };
}

// record = migration record; live = { meta, docs: { kind: [{id,data}] }, activity: [{id,data}] }.
export function detectV2Edits(record, live) {
  const edited = [];
  const deleted = [];
  for (const kind of SUBCOLS) {
    const docs = arr(live.docs?.[kind]);
    for (const d of docs) {
      if (d.data?.version !== 1 || d.data?.updatedBy !== MIGRATE_STAMP) {
        edited.push({ kind, id: d.id, version: d.data?.version, updatedBy: d.data?.updatedBy });
      }
    }
    const present = new Set(docs.map((d) => d.id));
    for (const id of arr(record?.docIds?.[kind])) if (!present.has(id)) deleted.push({ kind, id });
  }
  const programMetaChanged = !isDeepStrictEqual(live.meta?.programMeta, record?.written?.programMeta);
  const newActivity = arr(live.activity).filter((a) => !a.data?.copiedBy).map((a) => a.id);
  return {
    edited, deleted, programMetaChanged, newActivity,
    clean: !edited.length && !deleted.length && !programMetaChanged && !newActivity.length,
  };
}
