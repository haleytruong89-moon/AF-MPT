// Audit 25/11 wave 3 (PM-1, PM-4, PM-5, PM-3): what needs a manager in the programs /
// work streams they manage, across projects. Pure.
import { managerLevel } from './closeFlow.js';
import { workingDaysSince } from './approvalsInbox.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const OPEN = new Set(['Planned', 'InProgress']);
const DAY = 24 * 60 * 60 * 1000;
export const STALE_DAYS = 7;

const dayOf = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Newest update / check-in time of a task (ms), or null. */
export function lastTouch(task) {
  let best = null;
  for (const e of [...arr(task?.updates), ...arr(task?.checkIns)]) {
    const t = e?.timestamp ? Date.parse(e.timestamp) : NaN;
    if (!Number.isNaN(t) && (best == null || t > best)) best = t;
  }
  return best;
}

/**
 * Managed = I am PM / Deputy of the task's program or Sub-PM of its work stream
 * (an Owner-only level does not count: the Owner has Portfolio).
 * -> { managesAny, onlyLead, waitingAtOthers, overdue, blockers, stale, deadlineRequests }
 * each list item = { project, program, workstream, task, ... }.
 */
export function managerInbox(projects, uid, now = new Date()) {
  const out = { managesAny: false, onlyLead: true, waitingAtOthers: [], overdue: [], blockers: [], stale: [], deadlineRequests: [] };
  if (!uid) return out;
  const today = startOfDay(now);
  const list = Array.isArray(projects) ? projects : Object.values(projects || {});
  for (const project of list) {
    const roles = project?.__v2?.roles;
    if (!roles) continue;
    for (const program of arr(project.programs)) {
      for (const workstream of arr(program.workstreams)) {
        for (const task of arr(workstream.tasks)) {
          const lvl = managerLevel(roles, task.id, uid);
          if (lvl !== 'pm' && lvl !== 'lead') continue;
          out.managesAny = true;
          if (lvl === 'pm') out.onlyLead = false;
          const base = { project, program, workstream, task };
          const status = task.status || 'Planned';
          const cr = task.closeRequest;
          if (status === 'Submitted' && cr && cr.approverUid && cr.approverUid !== uid && lvl === 'pm') {
            out.waitingAtOthers.push({ ...base, waitingDays: workingDaysSince(cr.submittedAt, now), escalated: false });
          }
          if (task.deadlineRequest && OPEN.has(status)) out.deadlineRequests.push({ ...base, request: task.deadlineRequest });
          if (!OPEN.has(status)) continue;
          const end = dayOf(task.end);
          if (end && end < today) out.overdue.push({ ...base, lateDays: Math.round((today - end) / DAY) });
          const b = arr(task.updates).find((u) => u && u.isBlocker && !u.resolvedAt && u.authorUid !== uid);
          if (b) out.blockers.push({ ...base, update: b });
          const start = dayOf(task.start);
          if (!start || start <= today) {
            const touched = lastTouch(task);
            const days = touched == null ? null : Math.floor((now.getTime() - touched) / DAY);
            if (touched == null || days >= STALE_DAYS) out.stale.push({ ...base, daysSinceUpdate: days });
          }
        }
      }
    }
  }
  if (!out.managesAny) out.onlyLead = false;
  out.overdue.sort((a, b) => b.lateDays - a.lateDays);
  out.stale.sort((a, b) => (b.daysSinceUpdate ?? 1e9) - (a.daysSinceUpdate ?? 1e9));
  out.waitingAtOthers.sort((a, b) => b.waitingDays - a.waitingDays);
  return out;
}

/**
 * PM-3: evidence line for an approval row. -> { due, timing, lastUpdate } strings / nulls.
 * timing: 'on time' / 'n days late' (submitted date vs planned end).
 */
export function approvalEvidence(task) {
  const end = dayOf(task?.end);
  const sub = task?.closeRequest?.submittedAt ? startOfDay(new Date(task.closeRequest.submittedAt)) : null;
  let timing = null;
  if (end && sub && !Number.isNaN(sub.getTime())) {
    const late = Math.round((sub - end) / DAY);
    timing = late > 0 ? `submitted ${late} day${late === 1 ? '' : 's'} late` : 'submitted on time';
  }
  const newest = arr(task?.updates).reduce((best, u) => (u?.timestamp && (!best || u.timestamp > best.timestamp) ? u : best), null);
  return { due: task?.end || null, timing, lastUpdate: newest ? { at: newest.timestamp, text: newest.text || '' } : null };
}
