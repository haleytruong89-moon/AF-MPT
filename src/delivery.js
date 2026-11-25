// Audit 25/11 wave 3 (PM-21 + HOD Q2): delivery per person for a manager — open, awaiting
// approval, overdue, closed this year on time / late. No credit points (Q2). Pure.
import { isOverdueTask } from './taskStatus.js';
import { vnYear } from './creditYears.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const DAY = 24 * 60 * 60 * 1000;
const dayOf = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Spec definition: closed on = approvedAt (direct close and approval both stamp it).
 * -> { kind: 'on-time' | 'late' | 'no-due' | 'unknown', lateDays, closedOn }
 */
export function closeTiming(task) {
  const closed = task?.approvedAt ? new Date(task.approvedAt) : null;
  if (!closed || Number.isNaN(closed.getTime())) return { kind: 'unknown', lateDays: 0, closedOn: null };
  // G1: a date filled by the backfill from a shared task name or the planned end is right for
  // the year but not for the day: never counted as on time / late.
  if (task.approvedAtSource && task.approvedAtSource !== 'activity') return { kind: 'approx', lateDays: 0, closedOn: closed };
  const end = dayOf(task.end);
  if (!end) return { kind: 'no-due', lateDays: 0, closedOn: closed };
  const late = Math.round((startOfDay(closed) - end) / DAY);
  return late > 0 ? { kind: 'late', lateDays: late, closedOn: closed } : { kind: 'on-time', lateDays: 0, closedOn: closed };
}

function tasksOf(node) {
  if (!node) return [];
  if (Array.isArray(node.tasks)) return node.tasks;
  if (Array.isArray(node.workstreams)) return node.workstreams.flatMap((w) => arr(w.tasks));
  if (Array.isArray(node.programs)) return node.programs.flatMap((p) => arr(p.workstreams).flatMap((w) => arr(w.tasks)));
  return [];
}

/**
 * node = project / program / work stream; keyOf(raw) merges names (directory).
 * -> rows sorted by open desc: { key, label, open, awaiting, overdue, onTime, late, unknown }
 * Closed counts only tasks Completed with a close date in `year` (unknown = Completed, no date).
 */
export function personDelivery(node, { keyOf = (raw) => raw, labelOf = null, year = new Date().getFullYear(), now = new Date() } = {}) {
  const rows = new Map();
  const row = (raw) => {
    const key = keyOf(raw);
    if (!rows.has(key)) rows.set(key, { key, label: labelOf ? labelOf(raw) : raw, open: 0, awaiting: 0, overdue: 0, onTime: 0, late: 0, unknown: 0 });
    return rows.get(key);
  };
  for (const t of tasksOf(node)) {
    if (!t?.pic) continue;
    const s = t.status || 'Planned';
    if (s === 'Planned' || s === 'InProgress') {
      const r = row(t.pic);
      r.open++;
      if (isOverdueTask(t, now)) r.overdue++;
    } else if (s === 'Submitted') {
      row(t.pic).awaiting++;
    } else if (s === 'Completed') {
      const ct = closeTiming(t);
      if (ct.kind === 'unknown') { row(t.pic).unknown++; continue; }
      if (vnYear(t.approvedAt) !== year) continue; // G2: year in Vietnam
      const r = row(t.pic);
      if (ct.kind === 'late') r.late++;
      else if (ct.kind === 'on-time') r.onTime++;
      else if (ct.kind === 'approx') r.unknown++;
    }
  }
  return [...rows.values()].sort((a, b) => b.open - a.open || String(a.label).localeCompare(String(b.label)));
}
