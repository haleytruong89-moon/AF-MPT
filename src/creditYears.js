// G2 (spec docs/superpowers/specs/2026-11-25-credit-by-year-design.md): credit by the year a
// task was closed. Pure.
//  - year of a closed task = year of approvedAt in Vietnam (UTC+7); no approvedAt (closed
//    before P3.1, HOD 25/11 option B) = the project's creditYear.
//  - earned in year Y = cp of tasks Completed in Y; remaining = cp of open tasks, in the
//    current year only; 'lifetime' = every year + remaining.
//  - project lead: lead pool x (tasks Completed in the period / non-dropped tasks).
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const arr = (v) => (Array.isArray(v) ? v : []);
const OPEN = new Set(['Planned', 'InProgress', 'Submitted']);

export const LIFETIME = 'lifetime';

/** Calendar year of an ISO time in Vietnam, or null. */
export function vnYear(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : new Date(t + VN_OFFSET_MS).getUTCFullYear();
}

/** Year a closed task counts in (null when unknown). */
export function closeYearOf(task, project) {
  const y = vnYear(task?.approvedAt);
  if (y != null) return y;
  return typeof project?.creditYear === 'number' ? project.creditYear : null;
}

function tasksById(project) {
  const m = new Map();
  for (const p of arr(project?.programs)) for (const w of arr(p.workstreams)) for (const t of arr(w.tasks)) m.set(t.id, t);
  return m;
}

/**
 * breakdown = computeProjectCredits(project).breakdown. period = a year number or LIFETIME.
 * -> rows (same shape as breakdown) kept for the period, with projected / actual / credited
 *    recomputed: a Completed task in another year is dropped; an open task only counts in the
 *    current year and LIFETIME (projected, not earned).
 */
export function creditRowsForPeriod({ project, breakdown, period, currentYear = vnYear(new Date().toISOString()) }) {
  const tasks = tasksById(project);
  const lifetime = period === LIFETIME;
  const openCounts = lifetime || period === currentYear;
  let nonDropped = 0;
  let doneInPeriod = 0;
  let open = 0;
  for (const t of tasks.values()) {
    if (t.status === 'Dropped') continue;
    nonDropped++;
    if (t.status === 'Completed' && (lifetime || closeYearOf(t, project) === period)) doneInPeriod++;
    else if (OPEN.has(t.status || 'Planned')) open++;
  }
  const out = [];
  for (const b of arr(breakdown)) {
    if (b.isProjectLead) {
      if (!nonDropped) continue;
      const actual = b.taskCp * (doneInPeriod / nonDropped);
      const projected = b.taskCp * ((doneInPeriod + (openCounts ? open : 0)) / nonDropped);
      if (projected <= 0) continue;
      out.push({ ...b, actual, projected, credited: false });
      continue;
    }
    const t = tasks.get(b.taskId);
    const status = t?.status || b.taskStatus || 'Planned';
    if (status === 'Completed') {
      if (!lifetime && closeYearOf(t, project) !== period) continue;
      out.push({ ...b, actual: b.taskCp * (b.sharePct / 100), projected: b.taskCp * (b.sharePct / 100), credited: true, closeYear: closeYearOf(t, project) });
    } else if (OPEN.has(status)) {
      if (!openCounts) continue;
      out.push({ ...b, actual: 0, projected: b.taskCp * (b.sharePct / 100), credited: false });
    }
  }
  return out;
}

/** Years with closed tasks or a project credit year, plus the current year (newest first). */
export function creditPeriodYears(projects, currentYear = vnYear(new Date().toISOString())) {
  const ys = new Set([currentYear]);
  for (const p of Object.values(projects || {})) {
    if (!p) continue;
    if (typeof p.creditYear === 'number') ys.add(p.creditYear);
    for (const t of tasksById(p).values()) if (t.status === 'Completed') { const y = closeYearOf(t, p); if (y != null) ys.add(y); }
  }
  return [...ys].sort((a, b) => b - a);
}
