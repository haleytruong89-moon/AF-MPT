// P2.4b Task 1: pure restore target. Reads one project out of an in-app Backup JSON
// and builds the tree a restore writes: the normalised backup tree plus every live item
// the backup lacks (Rulings P4b-1, P4b-2). No I/O, never mutates its inputs.
//
// Retained items are deep copies of the live items, re-attached where they live:
//  - a task at the end of its live workstream (status -> Dropped);
//  - a workstream at the end of its live program; a program at the end of programs
//    (both unchanged, with only their absent children appended under them);
//  - an action at the end of actionItems (status -> Cancelled unless Done / Cancelled);
//  - a decision at the end of decisions (unchanged).
// Ids are compared per kind, project-wide (as splitProject keys its docs).
import { isDeepStrictEqual } from 'node:util';
import { assembleProject, splitProject } from '../../src/migrateV2.js';
import { normaliseForV2 } from './migrate-normalise.mjs';

export const TASK_DROPPED = 'Dropped';
export const ACTION_CANCELLED = 'Cancelled';
const ACTION_KEPT = new Set(['Done', ACTION_CANCELLED]);

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const keyOf = (id) => (id === undefined || id === null ? null : String(id));

// -> { project, activityCount, blocked }. Issue = { code, detail }.
export function readBackupProject(backup, pid) {
  const out = { project: null, activityCount: 0, blocked: [] };
  if (!isObj(backup) || !isObj(backup.meta) || !isObj(backup.projects)) {
    out.blocked.push({ code: 'backup-invalid', detail: 'expected { meta, projects, activity }' });
    return out;
  }
  const raw = hasOwn(backup.projects, pid) ? backup.projects[pid] : undefined;
  if (raw === undefined || raw === null) {
    out.blocked.push({ code: 'pid-not-in-backup', detail: String(pid) });
    return out;
  }
  if (!isObj(raw)) {
    out.blocked.push({ code: 'backup-invalid', detail: `projects.${pid} is not an object` });
    return out;
  }
  const { __v2: _v2, ...rest } = structuredClone(raw);
  void _v2;
  out.project = { ...rest, id: pid };
  const act = isObj(backup.activity) ? backup.activity[pid] : undefined;
  out.activityCount = Array.isArray(act) ? act.length : isObj(act) && Array.isArray(act.entries) ? act.entries.length : 0;
  return out;
}

// P3.1 final review I2: a retained live Submitted task (now Dropped) must not keep a
// pending close request. The request is cleared and a 'Withdrawn' decision entry is
// prepended to closeRequestHistory in the closeFlow histEntry shape, decided by
// 'p2-restore' with reason 'restore'. decidedAt is null: the plan is hashed for HOD
// approval, so it holds no clock value (the restore's activity event and restores/
// record carry the time). The id is derived from the task id (deterministic).
export const TASK_SUBMITTED = 'Submitted';
const RESTORE_BY = 'p2-restore';
function withdrawForRestore(t) {
  const cr = isObj(t.closeRequest) ? t.closeRequest : {};
  const entry = {
    id: `crh_restore_${keyOf(t.id)}`,
    outcome: cr.outcome ?? null,
    requestedByUid: cr.requestedByUid ?? null,
    approverUid: cr.approverUid ?? null,
    status: 'Withdrawn',
    decidedByUid: RESTORE_BY,
    decidedBy: RESTORE_BY,
    decidedAt: null,
    reason: 'restore',
    before: { status: TASK_SUBMITTED },
    after: { status: t.status },
  };
  t.closeRequest = null;
  t.closeRequestHistory = [entry, ...arr(t.closeRequestHistory)];
}

const nameOf = (item) => item.name ?? item.title ?? null;
const statusOf = (item) => (item.status === undefined ? null : item.status);

// -> { tree, retained, idMap, removedNulls, blocked }.
export function buildRestoreTarget(backupProject, liveTree, { pid } = {}) {
  const blocked = [];
  arr(backupProject?.programs).forEach((p, i) => {
    if (isObj(p) && hasOwn(p, 'raid') && !Array.isArray(p.raid)) {
      blocked.push({ code: 'raid-not-array', detail: `programs[${i}].raid` });
    }
  });

  const { project: tree, idMap, removedNulls } = normaliseForV2(backupProject, { pid });
  const retained = [];

  // Target items by kind and id (first occurrence; ids are unique after normalising).
  const index = { program: new Map(), workstream: new Map(), task: new Set(), action: new Set(), decision: new Set() };
  for (const p of arr(tree.programs)) {
    if (!isObj(p)) continue;
    if (keyOf(p.id) !== null && !index.program.has(keyOf(p.id))) index.program.set(keyOf(p.id), p);
    for (const w of arr(p.workstreams)) {
      if (!isObj(w)) continue;
      if (keyOf(w.id) !== null && !index.workstream.has(keyOf(w.id))) index.workstream.set(keyOf(w.id), w);
      for (const t of arr(w.tasks)) if (isObj(t) && keyOf(t.id) !== null) index.task.add(keyOf(t.id));
    }
  }
  for (const a of arr(tree.actionItems)) if (isObj(a) && keyOf(a.id) !== null) index.action.add(keyOf(a.id));
  for (const d of arr(tree.decisions)) if (isObj(d) && keyOf(d.id) !== null) index.decision.add(keyOf(d.id));

  const has = (kind, id) => {
    const k = keyOf(id);
    return k !== null && index[kind].has(k);
  };
  const keep = (kind, item, newStatus, parentId) => {
    retained.push({
      kind, id: keyOf(item.id), name: nameOf(item), liveStatus: statusOf(item), newStatus, parentId: keyOf(parentId),
    });
  };
  const pushTo = (obj, key, item) => {
    if (!Array.isArray(obj[key])) obj[key] = [];
    obj[key].push(item);
  };

  for (const lp of arr(liveTree?.programs)) {
    if (!isObj(lp)) continue;
    let tp;
    if (has('program', lp.id)) tp = index.program.get(keyOf(lp.id));
    else {
      const { workstreams: _w, ...rest } = structuredClone(lp);
      void _w;
      tp = hasOwn(lp, 'workstreams') ? { ...rest, workstreams: [] } : rest;
      pushTo(tree, 'programs', tp);
      if (keyOf(lp.id) !== null) index.program.set(keyOf(lp.id), tp);
      keep('program', lp, null, null);
    }
    for (const lw of arr(lp.workstreams)) {
      if (!isObj(lw)) continue;
      let tw;
      if (has('workstream', lw.id)) tw = index.workstream.get(keyOf(lw.id));
      else {
        const { tasks: _t, ...rest } = structuredClone(lw);
        void _t;
        tw = hasOwn(lw, 'tasks') ? { ...rest, tasks: [] } : rest;
        pushTo(tp, 'workstreams', tw);
        if (keyOf(lw.id) !== null) index.workstream.set(keyOf(lw.id), tw);
        keep('workstream', lw, null, lp.id);
      }
      for (const lt of arr(lw.tasks)) {
        if (!isObj(lt) || has('task', lt.id)) continue;
        const t = structuredClone(lt);
        const newStatus = lt.status === TASK_DROPPED ? null : TASK_DROPPED;
        if (newStatus) t.status = newStatus;
        if (lt.status === TASK_SUBMITTED) withdrawForRestore(t);
        pushTo(tw, 'tasks', t);
        if (keyOf(lt.id) !== null) index.task.add(keyOf(lt.id));
        keep('task', lt, newStatus, lw.id);
      }
    }
  }
  for (const la of arr(liveTree?.actionItems)) {
    if (!isObj(la) || has('action', la.id)) continue;
    const a = structuredClone(la);
    const newStatus = ACTION_KEPT.has(la.status) ? null : ACTION_CANCELLED;
    if (newStatus) a.status = newStatus;
    pushTo(tree, 'actionItems', a);
    if (keyOf(la.id) !== null) index.action.add(keyOf(la.id));
    keep('action', la, newStatus, null);
  }
  for (const ld of arr(liveTree?.decisions)) {
    if (!isObj(ld) || has('decision', ld.id)) continue;
    pushTo(tree, 'decisions', structuredClone(ld));
    if (keyOf(ld.id) !== null) index.decision.add(keyOf(ld.id));
    keep('decision', ld, null, null);
  }

  const s = splitProject(tree, { wid: 'main' });
  const back = assembleProject(s.meta, s.workstreams, s.tasks, s.actions, s.raid, s.decisions).project;
  if (!isDeepStrictEqual(back, tree)) blocked.push({ code: 'round-trip', detail: 'assemble(split(target)) differs from target' });

  return { tree, retained, idMap, removedNulls, blocked };
}
