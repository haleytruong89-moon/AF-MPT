// P3 Task 7: the App-side glue around closeFlow (pure; no React, no Firestore).
// The App's applyTaskUpdate choke point and CloseControl use these so the
// sequencing (flush, step saves, re-check after a credit step) is unit-tested.
import { statusOf, OPEN_STATUSES } from './taskStatus.js';
import {
  applyCloseIntent, eligibleApprovers, canCloseDirectly, canDecideClose, managerLevel, canSubmit,
} from './closeFlow.js';

export const DENIED_MESSAGE = "You can't change this task's status — ask your Sub-PM or PM.";
export const NEEDS_REASON_MESSAGE = 'Use Reject to give a reason.';
export const READ_ONLY_MESSAGE = 'View as is read-only';
export const MANUAL_SPLIT_MESSAGE = 'Only the Owner can set a manual credit split';
export const NO_APPROVER_MESSAGE = 'No one else can approve this — set a Deputy or another PM';

/** Toast text for a choke-point outcome (null = no toast). */
export function chokeMessage(outcome, approverName) {
  if (outcome === 'denied') return DENIED_MESSAGE;
  if (outcome === 'needs-reason') return NEEDS_REASON_MESSAGE;
  if (outcome === 'no-approver') return NO_APPROVER_MESSAGE;
  if (outcome === 'submit') return `Submitted for approval — ${approverName || 'your approver'} will review.`;
  return null;
}

/** Toast when a re-plan after a flush changed the outcome (submit -> direct says "Closed"). */
export function replanMessage(outcome, approverName) {
  if (outcome === 'direct') return 'Closed';
  return chokeMessage(outcome, approverName);
}

/** An outcome that writes a close transition (v2), as opposed to a plain edit. */
export function isCloseOutcome(outcome) {
  return !['legacy', 'unchanged', 'denied', 'needs-reason', 'no-approver'].includes(outcome);
}

/** Directory helpers keyed by uid (invites have no uid and are skipped). */
export function directoryByUid(entries) {
  const byUid = new Map();
  for (const e of entries || []) if (e && e.uid) byUid.set(e.uid, e);
  return {
    nameOf: (uid) => {
      const e = uid ? byUid.get(uid) : null;
      return (e && (e.displayName || e.email)) || uid || '';
    },
    // Unknown uids count as active (the directory may still be loading).
    isActive: (uid) => byUid.get(uid)?.status !== 'deactivated',
  };
}

const replaceLast = (list, v) => [...list.slice(0, -1), v];

/**
 * applyCloseIntent, then (carry 6) when a submit names a deactivated approver,
 * name the first active eligible approver instead (rules accept any eligible one).
 */
export function closeIntentFor({ roles, oldTask, nextTask, me, now, reason, isActive = () => true }) {
  const r = applyCloseIntent({ roles, oldTask, nextTask, me, now, reason });
  if (r.outcome !== 'submit') return r;
  const cr = r.task.closeRequest;
  if (!cr || isActive(cr.approverUid)) return r;
  const alt = eligibleApprovers(roles, oldTask.id, me.uid).find((u) => isActive(u));
  if (!alt) return r;
  const task = { ...r.task, closeRequest: { ...cr, approverUid: alt } };
  return { ...r, task, steps: replaceLast(r.steps, task) };
}

/**
 * Save a close transition step by step (carry 2, 3).
 * - flush(): persists any pending debounced edit of the project first; returns
 *   null when nothing was pending, else that save's status. 'ok' -> the intent is
 *   re-planned against the refreshed roles (same oldTask -> nextTask); any other
 *   status aborts with 'flush-failed' and nothing is saved.
 * - saveStep(task): saves the project tree with this task state; returns the
 *   save status ('ok' | 'denied' | ...). One call per step, in order; a failed
 *   step stops the rest.
 * - After a credit step of a direct close, the close is re-checked from the
 *   saved state with fresh roles: a manager who became PIC / contributor
 *   submits instead (rules check the new contributorUids).
 * Returns { status, outcome, task }: task = the last state saved (oldTask when
 * nothing was saved); status = 'ok', 'flush-failed' / 'save-failed' (saveStatus = that save's status), or 'denied' / 'needs-reason' / 'no-approver' (refused before any write).
 */
export async function runCloseFlow({ initial, oldTask, nextTask, me, now, getRoles, flush, saveStep, isActive }) {
  const flushed = await flush();
  // A failed pre-close save aborts the close: nothing is written on top of it.
  if (flushed && flushed !== 'ok') return { status: 'flush-failed', saveStatus: flushed, outcome: initial.outcome, task: oldTask };
  const r = flushed ? closeIntentFor({ roles: getRoles(), oldTask, nextTask, me, now, isActive }) : initial;
  if (!r.steps.length) return { status: r.outcome, outcome: r.outcome, task: oldTask };
  let outcome = r.outcome;
  let prev = oldTask;
  for (let i = 0; i < r.steps.length; i++) {
    let step = r.steps[i];
    if (i > 0 && outcome === 'direct') {
      const again = closeIntentFor({ roles: getRoles(), oldTask: prev, nextTask: { ...prev, status: statusOf(step) }, me, now, isActive });
      if (!again.steps.length) return { status: again.outcome, outcome: again.outcome, task: prev };
      step = again.task;
      outcome = again.outcome;
    }
    const status = await saveStep(step);
    if (status !== 'ok') return { status: 'save-failed', saveStatus: status, outcome, task: prev };
    prev = step;
  }
  return { status: 'ok', outcome, task: prev };
}

/** The project with task `taskId` replaced by `task` (exact object, keys absent stay absent). */
export function replaceTask(project, taskId, task) {
  let hit = false;
  const programs = (project.programs || []).map((pg) => {
    let pgHit = false;
    const workstreams = (pg.workstreams || []).map((ws) => {
      const i = (ws.tasks || []).findIndex((t) => t.id === taskId);
      if (i < 0) return ws;
      pgHit = true;
      const tasks = [...ws.tasks];
      tasks[i] = task;
      return { ...ws, tasks };
    });
    if (!pgHit) return pg;
    hit = true;
    return { ...pg, workstreams };
  });
  return hit ? { ...project, programs } : project;
}

/**
 * What CloseControl shows. buttons: ids in display order —
 * open: 'Planned', 'InProgress', then 'Completed' + 'Dropped' (direct) or
 * 'submit-done' + 'submit-dropped' (only when canSubmit), none for anyone else; Submitted: 'withdraw' (requester),
 * 'approve' + 'reject' (canDecideClose), 'reassign' (Owner or PM/Deputy, not the
 * requester, with an active eligible target); closed: 'reopen' (managers).
 * readOnly: no buttons.
 */
export function closeControlModel({ task, roles, me, readOnly = false, isActive = () => true }) {
  const status = statusOf(task);
  const uid = me?.uid || null;
  const kind = status === 'Submitted' ? 'submitted' : OPEN_STATUSES.includes(status) ? 'open' : 'closed';
  const cr = task?.closeRequest && typeof task.closeRequest === 'object' ? task.closeRequest : null;
  const pending = kind === 'submitted' ? { approverUid: cr?.approverUid ?? null, submittedAt: cr?.submittedAt ?? null } : null;
  const out = { kind, status, buttons: [], pending, reassignTargets: [] };
  if (readOnly || !uid) return out;
  if (kind === 'open') {
    if (canCloseDirectly(roles, task.id, uid)) out.buttons = ['Planned', 'InProgress', 'Completed', 'Dropped'];
    else if (canSubmit(roles, task.id, uid)) out.buttons = ['Planned', 'InProgress', 'submit-done', 'submit-dropped'];
    // P3.1 M8: neither PIC, manager nor Owner (incl. a plain contributor): no buttons,
    // the rules would deny any status change.
    return out;
  }
  if (kind === 'submitted') {
    if (cr && cr.requestedByUid === uid) out.buttons.push('withdraw');
    if (canDecideClose(roles, task, uid)) out.buttons.push('approve', 'reject');
    const lvl = managerLevel(roles, task.id, uid);
    if (cr && (lvl === 'owner' || lvl === 'pm') && cr.requestedByUid !== uid) {
      out.reassignTargets = eligibleApprovers(roles, task.id, cr.requestedByUid)
        .filter((u) => u !== cr.approverUid && isActive(u));
      if (out.reassignTargets.length) out.buttons.push('reassign');
    }
    return out;
  }
  if (managerLevel(roles, task.id, uid)) out.buttons = ['reopen'];
  return out;
}
