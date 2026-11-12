// P3 close flow (Task 6). Pure: no React, no Firestore, no App imports.
//
// Mirrors the Firestore rules shipped with P3.1 (firestore.rules, "P3 close
// transitions" in the tasks block and the approvals block). Every function
// here must agree with its rules counterpart, or a save is denied; the
// rules-parity table is in .superpowers/sdd/2026-10-24-p3-approvals/task-6-report.md.
//
// roles = V2Roles (readV2.rolesFromLoaded): the STORED (server) snapshot, which
// is what the rules read as resource.data (picUid, contributorUids, program /
// ws of the task). me = { uid, name }; now = ISO string.
import { statusOf, OPEN_STATUSES } from './taskStatus.js';

const CLOSED = ['Completed', 'Dropped'];
const isOpen = (s) => OPEN_STATUSES.includes(s);
const isClosed = (s) => CLOSED.includes(s);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Rules closeKeys(): a change to any of these makes the write a close transition.
const CLOSE_KEYS = ['status', 'closeRequest', 'closeRequestHistory', 'approvedByUid', 'approvedAt', 'closedByUid'];
// Rules creditKeys() (P3-C5); the tree carries pic / contributors, the planner derives the uids.
const CREDIT_KEYS = ['picUid', 'picEmail', 'pic', 'contributors', 'contributorUids', 'creditShares', 'creditSharesMode'];

function same(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}
const differs = (a, b, keys) => keys.some((k) => !same(a?.[k], b?.[k]));

function newId(prefix, now) {
  const t = Date.parse(now);
  return `${prefix}_${(isNaN(t) ? Date.now() : t).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const isOwnerUid = (roles, uid) => !!uid && Array.isArray(roles?.ownerUids) && roles.ownerUids.includes(uid);
const taskInfo = (roles, taskId) => roles?.tasks?.[taskId] || {};
const programOf = (roles, prg) => (prg != null && roles?.programs?.[prg]) || {};
const wsOf = (roles, wsId) => (wsId != null && roles?.workstreams?.[wsId]) || null;
// Rules isPMOrDeputyUid(m, u).
const isPMOrDeputy = (m, u) => !!u && (u === m.pmUid || u === m.deputyUid);
const contributorUidsOf = (info) => (Array.isArray(info.contributorUids) ? info.contributorUids : []);

/** 'owner' | 'pm' | 'lead' | null for uid on task taskId (rules managerRole / leadOfWs). */
export function managerLevel(roles, taskId, uid) {
  if (!roles || !uid) return null;
  if (isOwnerUid(roles, uid)) return 'owner';
  const info = taskInfo(roles, taskId);
  if (isPMOrDeputy(programOf(roles, info.programId), uid)) return 'pm';
  const ws = wsOf(roles, info.workstreamId);
  // leadOfWs: the WS's program must exist in programMeta.
  if (ws && ws.leadUid && ws.leadUid === uid && ws.programId != null && roles.programs && hasOwn(roles.programs, ws.programId)) return 'lead';
  return null;
}

/**
 * Mirror of rules eligibleApprover / eligibleWith. Order [lead, pm, deputy, ...ownerUids],
 * unique, never the requester. A manager in the task's stored contributorUids is
 * excluded (P3-C4), and so is the task's PIC (wave 1 H4, Ruling W1-1); an Owner
 * stays eligible.
 */
export function eligibleApprovers(roles, taskId, requesterUid) {
  if (!roles) return [];
  const info = taskInfo(roles, taskId);
  const m = programOf(roles, info.programId);
  const contrib = contributorUidsOf(info);
  const out = [];
  const add = (u) => { if (u && u !== requesterUid && !out.includes(u)) out.push(u); };
  if (!isPMOrDeputy(m, requesterUid)) {
    const ws = wsOf(roles, info.workstreamId);
    // A lead whose WS program is not in programMeta never passes leadOfWs, so
    // could never decide: left out (rules eligibleWith alone would accept them).
    const lead = ws && ws.programId != null && hasOwn(roles.programs || {}, ws.programId) ? ws.leadUid : null;
    for (const u of [lead, m.pmUid, m.deputyUid]) if (u && u !== info.picUid && !contrib.includes(u)) add(u);
  }
  for (const u of roles.ownerUids || []) add(u);
  return out;
}

/** The approver a new close request names: null for an Owner (closes directly). */
export function directApprover(roles, taskId, requesterUid) {
  if (!roles || isOwnerUid(roles, requesterUid)) return null;
  return eligibleApprovers(roles, taskId, requesterUid)[0] ?? null;
}

/**
 * Rules closeFromOpen, direct-close branch (P3-3, P3-C2): an Owner, or a
 * PM/Deputy/Sub-PM of the task who is not its PIC and not a contributor.
 */
export function canCloseDirectly(roles, taskId, uid) {
  const lvl = managerLevel(roles, taskId, uid);
  if (lvl === 'owner') return true;
  if (!lvl) return false;
  const info = taskInfo(roles, taskId);
  return info.picUid !== uid && !contributorUidsOf(info).includes(uid);
}

/**
 * Rules canDecide (P3-4, P3-C4) reached through the manager branch, or the Owner
 * branch (P3-C3: an Owner decides anything, incl. their own request). A non-Owner
 * never decides on a task they are PIC of (wave 1 H4, Ruling W1-1).
 */
export function canDecideClose(roles, task, uid) {
  if (!roles || !task || statusOf(task) !== 'Submitted' || !isObj(task.closeRequest)) return false;
  const lvl = managerLevel(roles, task.id, uid);
  if (lvl === 'owner') return true;
  if (!lvl) return false;
  const cr = task.closeRequest;
  const info = taskInfo(roles, task.id);
  if (cr.requestedByUid === uid) return false;
  if (info.picUid === uid) return false;
  if (contributorUidsOf(info).includes(uid)) return false;
  const m = programOf(roles, info.programId);
  return cr.approverUid === uid || (lvl === 'pm' && !isPMOrDeputy(m, cr.requestedByUid));
}

// Rules closeSubmitOk: the PIC (Assignee branch) or a manager may submit.
export function canSubmit(roles, taskId, uid) {
  const lvl = managerLevel(roles, taskId, uid);
  return lvl === 'pm' || lvl === 'lead' || (!!uid && taskInfo(roles, taskId).picUid === uid);
}

function histEntry({ cr, status, me, now, reason = null, before, after, prefix = 'crh' }) {
  return {
    id: newId(prefix, now),
    outcome: cr.outcome ?? null,
    requestedByUid: cr.requestedByUid ?? null,
    approverUid: cr.approverUid ?? null,
    status,
    decidedByUid: me.uid,
    decidedBy: me.name ?? null,
    decidedAt: now,
    reason,
    before,
    after,
  };
}

const prepend = (list, e) => [e, ...(Array.isArray(list) ? list : [])];

// nextTask already carries a closeFlow transition (second pass = no-op).
function isPrepared(oldTask, nextTask, me) {
  const s0 = statusOf(oldTask);
  const s1 = statusOf(nextTask);
  const h0 = Array.isArray(oldTask.closeRequestHistory) ? oldTask.closeRequestHistory.length : 0;
  const h1 = Array.isArray(nextTask.closeRequestHistory) ? nextTask.closeRequestHistory.length : 0;
  if (h1 > h0) return true;
  if (s1 === 'Submitted' && s0 !== 'Submitted' && isObj(nextTask.closeRequest)) return true;
  if (isClosed(s1) && nextTask.approvedByUid === me.uid && oldTask.approvedByUid !== me.uid) return true;
  // reopen: the stamps are explicitly cleared (a raw edit would carry the old ones).
  if (isClosed(s0) && isOpen(s1) && ['approvedByUid', 'approvedAt', 'closedByUid'].every((k) => hasOwn(nextTask, k) && nextTask[k] === null)) return true;
  return false;
}

const credit = (from) => Object.fromEntries(CREDIT_KEYS.filter((k) => hasOwn(from, k)).map((k) => [k, from[k]]));
// Task t with the credit fields of `src` (keys absent in src removed).
function withCredit(t, src) {
  const out = { ...t };
  for (const k of CREDIT_KEYS) delete out[k];
  return { ...out, ...credit(src) };
}
// Task t with the close keys of `src`.
function withClose(t, src) {
  const out = { ...t };
  for (const k of CLOSE_KEYS) {
    if (hasOwn(src, k)) out[k] = src[k];
    else delete out[k];
  }
  return out;
}

const ok = (task, outcome, steps = [task]) => ({ task, outcome, steps });
const no = (oldTask, outcome = 'denied') => ({ task: oldTask, outcome, steps: [] });

/**
 * The choke point (Task 7 applyTaskUpdate): turns a raw status change into the
 * transition the rules accept. Returns { task, outcome, steps }: steps = the
 * successive task states to save, in order (last === task; [] when nothing may
 * be saved). Two steps only when a non-Owner manager's write would combine a
 * credit edit with a close (P3-C5): credit edit first for a direct close, the
 * transition first for a reject / withdraw / reopen. An approve with a credit
 * edit is denied (credit is frozen while Submitted and once closed).
 */
export function applyCloseIntent({ roles, oldTask, nextTask, me, now, reason }) {
  if (!roles) return ok(nextTask, 'legacy');
  const s0 = statusOf(oldTask);
  const s1 = statusOf(nextTask);
  if (!differs(oldTask, nextTask, CLOSE_KEYS)) return ok(nextTask, 'unchanged');
  if (isPrepared(oldTask, nextTask, me)) return ok(nextTask, 'prepared');
  if (s0 === s1) return no(oldTask);

  const taskId = oldTask.id;
  const lvl = managerLevel(roles, taskId, me.uid);
  const owner = lvl === 'owner';
  const creditEdit = !owner && differs(oldTask, nextTask, CREDIT_KEYS);
  // The raw next task with the stored close keys (rules: an open move or a
  // direct close never touches the request / history; stamps set below).
  const base = withClose(nextTask, oldTask);

  // Credit edit first, then the transition (task open throughout the first write).
  const creditThen = (final, outcome) => (creditEdit ? ok(final, outcome, [withClose(nextTask, oldTask), final]) : ok(final, outcome));
  // Transition first (credit fields as stored), then the credit edit on the now-open task.
  const thenCredit = (final, outcome) => (creditEdit ? ok(final, outcome, [withCredit(final, oldTask), final]) : ok(final, outcome));

  const stampClosed = (status) => ({ ...base, status, approvedByUid: me.uid, approvedAt: now, closedByUid: me.uid });

  if (isOpen(s0)) {
    if (isOpen(s1)) {
      // open move: no other close key may change.
      return differs(oldTask, nextTask, CLOSE_KEYS.filter((k) => k !== 'status')) ? no(oldTask) : ok(nextTask, 'unchanged');
    }
    if (!isClosed(s1)) return no(oldTask); // raw 'Submitted' without a request
    if (canCloseDirectly(roles, taskId, me.uid)) return creditThen(stampClosed(s1), 'direct');
    if (!canSubmit(roles, taskId, me.uid)) return no(oldTask);
    const approverUid = directApprover(roles, taskId, me.uid);
    // H4: no eligible approver (requester / PIC excluded, no Owner): tell the user.
    if (!approverUid) return no(oldTask, 'no-approver');
    const closeRequest = {
      id: newId('cr', now), outcome: s1, requestedByUid: me.uid, requestedBy: me.name ?? null,
      approverUid, submittedAt: now, prevStatus: s0, note: null,
    };
    // A manager's submit may carry a credit edit (task still open); an
    // Assignee cannot edit credit at all (rules key list) - not our concern here.
    return ok({ ...base, status: 'Submitted', closeRequest }, 'submit');
  }

  if (s0 === 'Submitted') {
    const cr = oldTask.closeRequest;
    if (!isObj(cr)) return no(oldTask);
    const decide = (status, histStatus, extra = {}) => ({
      ...base,
      status,
      closeRequest: null,
      closeRequestHistory: prepend(oldTask.closeRequestHistory,
        histEntry({ cr, status: histStatus, me, now, reason: extra.reason ?? null, before: { status: 'Submitted' }, after: { status } })),
    });
    if (isClosed(s1)) {
      // P3-7: an approval keeps the requested outcome.
      if (s1 !== cr.outcome || !canDecideClose(roles, oldTask, me.uid)) return no(oldTask);
      if (creditEdit) return no(oldTask);
      const t = decide(s1, 'Approved');
      return ok({ ...t, approvedByUid: me.uid, approvedAt: now, closedByUid: cr.requestedByUid ?? null }, 'approve');
    }
    if (isOpen(s1)) {
      if (cr.requestedByUid === me.uid) {
        const back = isOpen(cr.prevStatus) ? cr.prevStatus : 'InProgress';
        return thenCredit(decide(back, 'Withdrawn'), 'withdraw');
      }
      if (!canDecideClose(roles, oldTask, me.uid)) return no(oldTask);
      const r = typeof reason === 'string' ? reason.trim() : '';
      if (!r) return no(oldTask, 'needs-reason');
      const t = decide('InProgress', 'Rejected', { reason: r });
      const update = { id: newId('upd', now), timestamp: now, author: me.name ?? null, authorUid: me.uid, text: `Close request rejected: ${r}`, isBlocker: false };
      return thenCredit({ ...t, updates: prepend(t.updates, update) }, 'reject');
    }
    return no(oldTask);
  }

  if (isClosed(s0)) {
    if (isOpen(s1)) {
      // reopen (rules: manager branch; request keys untouched; stamps cleared).
      if (!lvl) return no(oldTask);
      return thenCredit({ ...base, status: s1, approvedByUid: null, approvedAt: null, closedByUid: null }, 'reopen');
    }
    // Completed <-> Dropped: the rules' manager transitions don't allow it; the Owner may.
    if (owner && isClosed(s1)) return ok(stampClosed(s1), 'direct');
    return no(oldTask);
  }
  return no(oldTask);
}

/**
 * Reassign a pending close request (rules closeFromSubmitted, reassign branch):
 * caller is the PM/Deputy of the task's program or an Owner; the new approver is
 * eligible for the original requester and differs from the current one. The
 * requester never reassigns their own request (P3-C7 kept consistent with the
 * approvals docs; stricter than the task rules).
 */
export function reassignClose({ roles, task, me, toUid, now }) {
  if (!roles || !task || statusOf(task) !== 'Submitted' || !isObj(task.closeRequest)) return null;
  const cr = task.closeRequest;
  const lvl = managerLevel(roles, task.id, me.uid);
  if (lvl !== 'owner' && lvl !== 'pm') return null;
  if (cr.requestedByUid === me.uid) return null;
  if (!toUid || toUid === cr.approverUid) return null;
  if (!eligibleApprovers(roles, task.id, cr.requestedByUid).includes(toUid)) return null;
  const entry = histEntry({
    cr: { ...cr, approverUid: toUid }, status: 'Reassigned', me, now,
    before: { status: 'Submitted', approverUid: cr.approverUid ?? null },
    after: { status: 'Submitted', approverUid: toUid },
  });
  return {
    ...task,
    closeRequest: { ...cr, approverUid: toUid },
    closeRequestHistory: prepend(task.closeRequestHistory, entry),
  };
}

const outcomeWord = (s) => (s === 'Dropped' ? 'dropped' : 'done');

/** Activity events (P3-19) for one task change. English descriptions. */
export function closeEventsFor(oldTask, newTask, nameOf = (u) => u) {
  if (!oldTask || !newTask) return [];
  const s0 = statusOf(oldTask);
  const s1 = statusOf(newTask);
  const name = newTask.name || oldTask.name || 'task';
  const n = (u) => (u ? nameOf(u) || u : 'unknown');
  const h0 = Array.isArray(oldTask.closeRequestHistory) ? oldTask.closeRequestHistory.length : 0;
  const hist = Array.isArray(newTask.closeRequestHistory) ? newTask.closeRequestHistory : [];
  const h = hist.length > h0 ? hist[0] : null;
  const ev = (type, description, before = { status: s0 }, after = { status: s1 }) => [{ type, description, before, after }];

  if (h?.status === 'Reassigned') {
    const from = h.before?.approverUid ?? oldTask.closeRequest?.approverUid ?? null;
    const to = h.after?.approverUid ?? newTask.closeRequest?.approverUid ?? null;
    return ev('close_reassigned', `Reassigned approval of "${name}" from ${n(from)} to ${n(to)}`,
      { status: s0, approverUid: from }, { status: s1, approverUid: to });
  }
  if (s0 === s1) return [];
  if (s1 === 'Submitted' && isObj(newTask.closeRequest)) {
    const cr = newTask.closeRequest;
    return ev('close_submitted', `Submitted "${name}" as ${outcomeWord(cr.outcome)} — approver ${n(cr.approverUid)}`);
  }
  if (h?.status === 'Approved') {
    return ev('close_approved', `Approved "${name}" as ${outcomeWord(s1)} (requested by ${n(h.requestedByUid)})`);
  }
  if (h?.status === 'Rejected') {
    return ev('close_rejected', `Rejected close request for "${name}" (requested by ${n(h.requestedByUid)}): ${h.reason || ''}`);
  }
  if (h?.status === 'Withdrawn') {
    return ev('close_withdrawn', `Withdrew close request for "${name}"`);
  }
  if (isClosed(s1)) return ev('close_direct', `Closed "${name}" as ${outcomeWord(s1)}`);
  if (isClosed(s0) && isOpen(s1)) return ev('close_reopened', `Reopened "${name}"`);
  return [];
}

// P3-10: the task { start: taskStart, end: newDate } lies within its WS window,
// exactly as rules withinWs(t, w) tests it: t.start >= w.start and t.end <= w.end,
// a null bound or a null task date passing that side.
const day = (v) => (v == null || v === '' ? null : String(v).slice(0, 10));
function withinWsWindow(roles, taskId, newDate, taskStart) {
  const ws = wsOf(roles, taskInfo(roles, taskId).workstreamId);
  if (!ws || !newDate) return false;
  const s = day(taskStart);
  const e = day(newDate);
  return (s == null || ws.start == null || s >= ws.start) && (ws.end == null || e <= ws.end);
}

/**
 * Approver of a task deadline request (P3-10): direct manager when the task
 * (taskStart, newDate) stays inside the WS window, else an Owner.
 */
export function deadlineApprover(roles, taskId, newDate, requesterUid, taskStart = null) {
  if (!roles || isOwnerUid(roles, requesterUid)) return null;
  if (withinWsWindow(roles, taskId, newDate, taskStart)) return directApprover(roles, taskId, requesterUid);
  return (roles.ownerUids || []).find((u) => u !== requesterUid) ?? null;
}

/**
 * May uid apply task.deadlineRequest? Never the requester; an Owner always;
 * inside the WS window an eligible manager (rules taskDatesOk / taskLeadWith let
 * a PM / Sub-PM write `end` within the window). Legacy requests without
 * requestedByUid go to the Owner.
 */
export function canApproveDeadline(roles, task, uid) {
  const req = task?.deadlineRequest;
  if (!roles || !isObj(req) || !uid) return false;
  if (req.requestedByUid && req.requestedByUid === uid) return false;
  if (isOwnerUid(roles, uid)) return true;
  if (!req.requestedByUid) return false;
  if (!withinWsWindow(roles, task.id, req.newDate, task.start)) return false;
  return managerLevel(roles, task.id, uid) !== null && eligibleApprovers(roles, task.id, req.requestedByUid).includes(uid);
}

/** P3-11 (UI-only rule): activate a RAID item = PM/Deputy of the program or an Owner. */
export function canActivateRaid(roles, programId, uid) {
  if (!roles || !uid) return false;
  return isOwnerUid(roles, uid) || isPMOrDeputy(programOf(roles, programId), uid);
}

/**
 * Q1 (pre wave 2): an Owner or any PM/Deputy/Sub-PM in the project. Since wave 2
 * R5 this only answers "may create a new decision"; editing RAID / an existing
 * decision needs a role in that program (roleUi canEditRaid / canEditDecision).
 */
export function canWriteRaid(roles, uid) {
  if (!roles || !uid) return false;
  if (isOwnerUid(roles, uid)) return true;
  if (Object.values(roles.programs || {}).some((m) => isPMOrDeputy(m || {}, uid))) return true;
  return Object.values(roles.workstreams || {}).some((w) =>
    w && w.leadUid === uid && w.programId != null && hasOwn(roles.programs || {}, w.programId));
}

/**
 * P3-C6′: the manual credit-split editor (and the auto/manual toggle) is
 * Owner-only. Managers' auto-mode shares are App-derived from contributors.
 */
export function canEditCreditSplit(role, _task) {
  return role === 'owner';
}

/** P3-C5: pic / contributors may be edited by an Owner at any status, by a PM / Sub-PM only while open. */
export function canEditCreditFields(role, task) {
  if (role === 'owner') return true;
  return (role === 'pm' || role === 'lead') && isOpen(statusOf(task));
}

// ── approvals/{reqId} docs (Task 11/12 consumers; rules approvals block) ──

/** mitigation_done approver on create (P3-9, P3-C8): PM, else Deputy, else an Owner. */
export function mitigationApprover(roles, programId, requesterUid) {
  // Rules approvalCreateWith: scope.programId must be in programMeta.
  if (!roles || programId == null || !hasOwn(roles.programs || {}, programId)) return null;
  const m = programOf(roles, programId);
  if (!isPMOrDeputy(m, requesterUid)) {
    for (const u of [m.pmUid, m.deputyUid]) if (u && u !== requesterUid) return u;
  }
  return (roles.ownerUids || []).find((u) => u !== requesterUid) ?? null;
}

/** Rules approvalDeciderOk (P3-4, P3-C3). Pending requests only. */
export function canDecideApproval(roles, req, uid) {
  if (!roles || !isObj(req) || req.status !== 'Pending' || !uid) return false;
  if (isOwnerUid(roles, uid)) return true;
  if (req.type !== 'mitigation_done' || req.requestedByUid === uid) return false;
  const m = programOf(roles, req.scope?.programId);
  return req.approverUid === uid || (isPMOrDeputy(m, uid) && !isPMOrDeputy(m, req.requestedByUid));
}

/** Rules approvalReassignOk caller test: PM/Deputy of the program or an Owner, never the requester (P3-C7). */
export function canReassignApproval(roles, req, uid) {
  if (!roles || !isObj(req) || req.status !== 'Pending' || !uid) return false;
  if (req.requestedByUid === uid) return false;
  return isOwnerUid(roles, uid) || isPMOrDeputy(programOf(roles, req.scope?.programId), uid);
}

/**
 * Rules approverForTypeOk: reassign targets [{ uid, viaWorkstreamId }].
 * plan_import / scope_deadline: Owners. mitigation_done: PM, Deputy, Sub-PMs of
 * the program's workstreams (viaWorkstreamId = the claim the reassignLog entry
 * must carry), Owners; the PM/Deputy/Sub-PM only when the requester is neither
 * PM nor Deputy (P3-C8). Never the requester or the current approver.
 */
export function approvalReassignTargets(roles, req) {
  if (!roles || !isObj(req)) return [];
  const prg = req.scope?.programId;
  const out = [];
  const add = (uid, viaWorkstreamId = null) => {
    if (uid && uid !== req.requestedByUid && uid !== req.approverUid && !out.some((o) => o.uid === uid)) out.push({ uid, viaWorkstreamId });
  };
  if (req.type === 'mitigation_done') {
    const m = programOf(roles, prg);
    if (!isPMOrDeputy(m, req.requestedByUid)) {
      add(m.pmUid);
      add(m.deputyUid);
      for (const [wsId, w] of Object.entries(roles.workstreams || {})) {
        if (w && w.programId === prg && w.leadUid) add(w.leadUid, wsId);
      }
    }
  } else if (req.type !== 'plan_import' && req.type !== 'scope_deadline') {
    return [];
  }
  for (const u of roles.ownerUids || []) add(u);
  return out;
}
