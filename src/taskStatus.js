// Task status helpers (P3). Pure, no App dependencies.
export const OPEN_STATUSES = ['Planned', 'InProgress'];

const WEIGHT = { Planned: 0, InProgress: 0.5, Submitted: 0.5, Completed: 1, Dropped: null };

export function statusOf(task) {
  return (task && task.status) || 'Planned';
}

// Overdue = end (local date) before today and status is open. Submitted,
// Completed and Dropped are never overdue (P3-Q6, provisional).
export function isOverdueTask(task, today) {
  if (!task || !task.end) return false;
  if (!OPEN_STATUSES.includes(statusOf(task))) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(task.end));
  const end = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(task.end);
  if (isNaN(end)) return false;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return end < t;
}

export function progressWeight(status) {
  return Object.prototype.hasOwnProperty.call(WEIGHT, status) ? WEIGHT[status] : 0;
}

export function isCreditedCompletion(task) {
  return statusOf(task) === 'Completed';
}
