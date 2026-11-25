// Audit 25/11 wave 4b (spec docs/superpowers/specs/2026-11-25-ux-audit-waves-design.md):
// MB-9 approved close requests stay in "Sent for approval" for 7 days; MB-6 deadline change
// requests I sent (pending, last resolution, rejection in Needs attention for 14 days). Pure.
export const APPROVED_SENT_DAYS = 7;
export const REJECTED_DEADLINE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const arr = (v) => (Array.isArray(v) ? v : []);
const within = (iso, now, days) => {
  const t = iso ? Date.parse(iso) : NaN;
  return !Number.isNaN(t) && now.getTime() - t <= days * DAY_MS && t <= now.getTime() + DAY_MS;
};

function eachTask(projects, fn) {
  const list = Array.isArray(projects) ? projects : Object.values(projects || {});
  for (const project of list) {
    if (!project) continue;
    for (const program of arr(project.programs)) for (const workstream of arr(program.workstreams)) for (const task of arr(workstream.tasks)) fn({ project, program, workstream, task });
  }
}

/**
 * MB-9: close requests I sent that were approved in the last 7 days (newest first).
 * -> [{ project, program, workstream, task, entry }] where entry = the history entry.
 */
export function recentlyApprovedSent(projects, uid, now = new Date()) {
  const out = [];
  if (!uid) return out;
  eachTask(projects, (it) => {
    const t = it.task;
    if (t.status !== 'Completed' && t.status !== 'Dropped') return;
    const h = arr(t.closeRequestHistory)[0];
    if (!h || h.status !== 'Approved' || h.requestedByUid !== uid) return;
    if (!within(h.decidedAt, now, APPROVED_SENT_DAYS)) return;
    out.push({ ...it, entry: h });
  });
  return out.sort((a, b) => Date.parse(b.entry.decidedAt) - Date.parse(a.entry.decidedAt));
}

/** Is this deadline request mine? uid first (v2), else the stored requester name. */
const isMine = (req, { uid, isMe }) => {
  if (!req) return false;
  if (uid && req.requestedByUid) return req.requestedByUid === uid;
  return typeof isMe === 'function' && !!isMe(req.requestedBy);
};

/** MB-6: deadline change requests I sent that wait for the Owner (oldest first). */
export function pendingDeadlineSent(projects, { uid = null, isMe = null } = {}) {
  const out = [];
  eachTask(projects, (it) => {
    const r = it.task.deadlineRequest;
    if (r && isMine(r, { uid, isMe })) out.push({ ...it, request: r });
  });
  return out.sort((a, b) => Date.parse(a.request.requestedAt || 0) - Date.parse(b.request.requestedAt || 0));
}

/** The last approved / rejected deadline request of a task (history is oldest first), or null. */
export function lastDeadlineResolution(task) {
  const h = arr(task?.deadlineRequestHistory);
  for (let i = h.length - 1; i >= 0; i--) if (h[i]?.status === 'approved' || h[i]?.status === 'rejected') return h[i];
  return null;
}

/** One-line text for the last resolution: "Rejected by Ha on 3 Dec: note" / "Approved by Ha on 3 Dec". */
export function deadlineResolutionText(entry, fmt = (iso) => iso) {
  if (!entry) return '';
  const head = `${entry.status === 'approved' ? 'Approved' : 'Rejected'} by ${entry.resolvedBy || 'the Owner'}${entry.resolvedAt ? ` on ${fmt(entry.resolvedAt)}` : ''}`;
  const note = entry.status === 'rejected' && entry.resolverNote ? `: ${entry.resolverNote}` : '';
  return head + note;
}

/**
 * MB-6: my deadline request was rejected in the last 14 days and I have not sent a new one
 * -> { resolvedBy, resolvedAt, note, newDate } or null (Needs attention item).
 */
export function rejectedDeadlineItem(task, { uid = null, isMe = null, now = new Date() } = {}) {
  if (!task || task.deadlineRequest) return null;
  if (task.status !== 'Planned' && task.status !== 'InProgress' && task.status !== undefined) return null;
  const last = arr(task.deadlineRequestHistory).slice(-1)[0];
  if (!last || last.status !== 'rejected' || !isMine(last, { uid, isMe })) return null;
  if (!within(last.resolvedAt, now, REJECTED_DEADLINE_DAYS)) return null;
  return { resolvedBy: last.resolvedBy || 'the Owner', resolvedAt: last.resolvedAt, note: last.resolverNote || '', newDate: last.newDate || null };
}
