// Approvals inbox helpers (wave 1, PR-D). Pure: no React, no Firestore.
// Working days are Mon-Fri in the local time zone, no holidays.
import { canDecideClose } from './closeFlow.js';
import { statusOf } from './taskStatus.js';

export const ESCALATION_DAYS = 3;

const isWorkDay = (d) => d.getDay() !== 0 && d.getDay() !== 6;

/** Mon-Fri days strictly after the local date of fromISO, up to and including the local date of now. */
export function workingDaysSince(fromISO, now) {
  const from = new Date(fromISO);
  if (isNaN(from.getTime()) || !(now instanceof Date) || isNaN(now.getTime())) return 0;
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let n = 0;
  for (cur.setDate(cur.getDate() + 1); cur <= end; cur.setDate(cur.getDate() + 1)) {
    if (isWorkDay(cur)) n++;
  }
  return n;
}

/**
 * Who may also decide a request that has waited too long. Ws lead approver ->
 * PM + Deputy; any other non-Owner approver -> Owners; Owner approver -> [].
 * Never the requester or the task's PIC.
 */
export function escalationTargets(roles, task) {
  const cr = task?.closeRequest;
  if (!roles || !cr || !cr.approverUid) return [];
  const owners = Array.isArray(roles.ownerUids) ? roles.ownerUids : [];
  if (owners.includes(cr.approverUid)) return [];
  const info = roles.tasks?.[task.id] || {};
  const ws = info.workstreamId != null ? roles.workstreams?.[info.workstreamId] : null;
  let pool;
  if (ws && ws.leadUid && ws.leadUid === cr.approverUid) {
    const m = (info.programId != null && roles.programs?.[info.programId]) || {};
    pool = [m.pmUid, m.deputyUid];
  } else {
    pool = owners;
  }
  const out = [];
  for (const u of pool) {
    if (u && u !== cr.requestedByUid && u !== info.picUid && !out.includes(u)) out.push(u);
  }
  return out;
}

/** { needsMine, sent } of Submitted tasks in v2 projects, longest-waiting first. */
export function approvalBuckets(projects, uid, now) {
  const needsMine = [];
  const sent = [];
  if (!uid) return { needsMine, sent };
  const list = Array.isArray(projects) ? projects : Object.values(projects || {});
  for (const project of list) {
    const roles = project?.__v2?.roles;
    if (!roles) continue;
    for (const program of project.programs || []) {
      for (const workstream of program.workstreams || []) {
        for (const task of workstream.tasks || []) {
          const cr = task?.closeRequest;
          if (!cr || statusOf(task) !== 'Submitted') continue;
          const waitingDays = workingDaysSince(cr.submittedAt, now);
          const targets = escalationTargets(roles, task);
          const item = { project, program, workstream, task, waitingDays, escalated: waitingDays >= ESCALATION_DAYS && targets.length > 0 };
          const mine = cr.approverUid === uid || (waitingDays >= ESCALATION_DAYS && targets.includes(uid));
          if (mine && canDecideClose(roles, task, uid)) needsMine.push(item);
          if (cr.requestedByUid === uid) sent.push(item);
        }
      }
    }
  }
  const byWait = (a, b) => b.waitingDays - a.waitingDays;
  return { needsMine: needsMine.sort(byWait), sent: sent.sort(byWait) };
}
