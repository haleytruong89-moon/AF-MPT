// W3-B3 (M3): My Work items derived from task data. Pure.

export const REJECTED_ITEM_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A close request I sent that was rejected: shown in Needs attention until I resubmit
 * or close the task, for at most 14 days (HOD 16/11).
 * uid = signed-in uid (null in View as: then the requester is matched by isMe(task.pic)).
 * -> { reason, decidedBy, decidedAt } or null.
 */
export function rejectedCloseItem(task, { uid = null, isMe = null, now = new Date() } = {}) {
  if (!task || (task.status !== 'Planned' && task.status !== 'InProgress')) return null;
  const h = Array.isArray(task.closeRequestHistory) ? task.closeRequestHistory[0] : null;
  if (!h || h.status !== 'Rejected') return null;
  const mine = uid ? h.requestedByUid === uid : typeof isMe === 'function' && isMe(task.pic);
  if (!mine) return null;
  const at = h.decidedAt ? new Date(h.decidedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  if (now.getTime() - at.getTime() > REJECTED_ITEM_DAYS * DAY_MS) return null;
  return { reason: h.reason ?? '', decidedBy: h.decidedBy ?? 'the approver', decidedAt: h.decidedAt };
}
