// Audit 25/11 wave 5 PM-13 (spec docs/superpowers/specs/2026-11-25-ux-audit-waves-design.md):
// Meeting mode lists for one (scoped) project. Pure.
const arr = (v) => (Array.isArray(v) ? v : []);
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN = new Set(['Planned', 'InProgress']);
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (s) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

/**
 * Open tasks (Planned / In Progress) of the project: overdue (end before today, oldest first)
 * and due in the next 7 days (today .. today + 7, soonest first). Rows: { task, program, workstream, end, days }
 * where days = days overdue (overdue) or days left (dueSoon).
 */
export function meetingTaskLists(project, now = new Date()) {
  const today = dayStart(now);
  const horizon = new Date(today.getTime() + 7 * DAY_MS);
  const overdue = [];
  const dueSoon = [];
  for (const program of arr(project?.programs)) {
    for (const workstream of arr(program.workstreams)) {
      for (const task of arr(workstream.tasks)) {
        if (!OPEN.has(task?.status || 'Planned')) continue;
        const end = parseDay(task.end);
        if (!end) continue;
        const diff = Math.round((end - today) / DAY_MS);
        if (end < today) overdue.push({ task, program, workstream, end, days: -diff });
        else if (end <= horizon) dueSoon.push({ task, program, workstream, end, days: diff });
      }
    }
  }
  overdue.sort((a, b) => a.end - b.end);
  dueSoon.sort((a, b) => a.end - b.end);
  return { overdue, dueSoon };
}

/** First `n` items and how many were left out (shown as "+N more"). */
export function takeWithMore(list, n) {
  const a = arr(list);
  return { shown: a.slice(0, n), more: Math.max(0, a.length - n) };
}
