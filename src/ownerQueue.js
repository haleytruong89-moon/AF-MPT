// W3-C3: everything waiting on the Owner, across projects. Pure.
// close    = v2 task Submitted with a close request (every request: the Owner may decide any)
// deadline = task with a pending deadline change request (open tasks only)
// raid     = RAID item waiting for activation (PendingApproval)
import { workingDaysSince, escalationTargets, ESCALATION_DAYS } from './approvalsInbox.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const CLOSED = new Set(['Completed', 'Dropped']);

/** -> items sorted by waitingDays desc, then project name. */
export function ownerQueue(projects, now = new Date()) {
  const out = [];
  const list = Array.isArray(projects) ? projects : Object.values(projects || {});
  const wait = (iso) => (iso ? workingDaysSince(iso, now) : 0);
  for (const project of list) {
    if (!project) continue;
    const roles = project.__v2?.roles || null;
    for (const program of arr(project.programs)) {
      for (const workstream of arr(program.workstreams)) {
        for (const task of arr(workstream.tasks)) {
          const status = task?.status || 'Planned';
          if (roles && status === 'Submitted' && task.closeRequest) {
            const waitingDays = wait(task.closeRequest.submittedAt);
            const escalated = waitingDays >= ESCALATION_DAYS && escalationTargets(roles, task).length > 0;
            out.push({ kind: 'close', project, program, workstream, task, waitingDays, escalated });
          }
          if (task?.deadlineRequest && !CLOSED.has(status)) {
            out.push({ kind: 'deadline', project, program, workstream, task, waitingDays: wait(task.deadlineRequest.requestedAt) });
          }
        }
      }
      for (const item of arr(program.raid)) {
        if (item?.status === 'PendingApproval') out.push({ kind: 'raid', project, program, item, waitingDays: wait(item.createdAt) });
      }
    }
  }
  return out.sort((a, b) => b.waitingDays - a.waitingDays || String(a.project.name || '').localeCompare(String(b.project.name || '')));
}

export const QUEUE_LABEL = { close: 'Close request', deadline: 'Deadline change', raid: 'RAID activation' };
