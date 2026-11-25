// G5 (spec docs/superpowers/specs/2026-11-25-credit-by-year-design.md): effort report,
// person x project for a period (a year or Lifetime). Pure.
// Input: perProject = Map<pid, { project, breakdown }> where breakdown are the period rows of
// creditRowsForPeriod (src/creditYears.js). A cell = cp earned (Completed in the period +
// project lead share), tasks closed (Completed task rows; a shared task counts once per
// person), remaining cp (open tasks; only present in the current year / Lifetime) and the
// task rows behind it.
import { closeTiming } from './delivery.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const round1 = (n) => Math.round(n * 10) / 10;

function taskIndex(project) {
  const m = new Map();
  for (const p of arr(project?.programs)) for (const w of arr(p.workstreams)) for (const t of arr(w.tasks)) m.set(t.id, t);
  return m;
}

const emptyCell = () => ({ cp: 0, tasks: 0, remaining: 0, rows: [] });
const add = (a, b) => { a.cp += b.cp; a.tasks += b.tasks; a.remaining += b.remaining; };

/**
 * -> { people: [{ id, name, total }], projects: [{ id, name, closed, total }],
 *      cell(personId, pid) -> cell | null, total }
 * people / projects sorted by cp desc, then remaining desc, then name; total = { cp, tasks, remaining }.
 * Cell rows: { taskId, taskName, programName, workstreamName, cp, remaining, share, open, closedOn, timing, lead }.
 */
export function effortMatrix(perProject) {
  const cells = new Map();
  const people = new Map();
  const projects = new Map();
  const total = emptyCell();
  for (const [pid, { project, breakdown }] of perProject || new Map()) {
    const tasks = taskIndex(project);
    for (const b of arr(breakdown)) {
      const key = `${b.picId}\u0000${pid}`;
      if (!cells.has(key)) cells.set(key, emptyCell());
      const c = cells.get(key);
      const done = !!b.credited || (b.isProjectLead && b.actual > 0);
      const part = {
        cp: b.actual || 0,
        tasks: b.credited && !b.isProjectLead ? 1 : 0,
        remaining: Math.max(0, (b.projected || 0) - (b.actual || 0)),
      };
      add(c, part);
      const t = b.taskId ? tasks.get(b.taskId) : null;
      // G3: rows from a closed-year snapshot carry their frozen close date / timing.
      const timing = 'snapTiming' in b
        ? { kind: b.snapTiming || null, closedOn: b.snapClosedOn ? new Date(b.snapClosedOn) : null }
        : (t && b.credited ? closeTiming(t) : null);
      c.rows.push({
        taskId: b.taskId || null, taskName: b.taskName, programName: b.programName, workstreamName: b.workstreamName,
        cp: b.actual || 0, remaining: part.remaining, share: b.sharePct, open: !done,
        closedOn: timing?.closedOn || null, timing: timing?.kind || null, lead: !!b.isProjectLead,
      });
      if (!people.has(b.picId)) people.set(b.picId, { id: b.picId, name: b.picName, total: emptyCell() });
      add(people.get(b.picId).total, part);
      if (!projects.has(pid)) projects.set(pid, { id: pid, name: project?.name || pid, closed: project?.lifecycle === 'closed', total: emptyCell() });
      add(projects.get(pid).total, part);
      add(total, part);
    }
  }
  const order = (a, b) => b.total.cp - a.total.cp || b.total.remaining - a.total.remaining || String(a.name).localeCompare(String(b.name));
  for (const c of cells.values()) c.rows.sort((a, b) => (b.closedOn ? b.closedOn.getTime() : 0) - (a.closedOn ? a.closedOn.getTime() : 0) || b.cp - a.cp);
  return {
    people: [...people.values()].sort(order),
    projects: [...projects.values()].sort(order),
    cell: (personId, pid) => cells.get(`${personId}\u0000${pid}`) || null,
    total,
  };
}

/** Cell text: "12.5 (3)" = cp (tasks closed); with showRemaining, "+4 left" for open cp. */
export function cellText(c, { showRemaining = false } = {}) {
  if (!c) return '';
  const base = c.cp > 0 || c.tasks > 0 ? `${round1(c.cp)} (${c.tasks})` : '';
  const rem = showRemaining && c.remaining > 0 ? `+${round1(c.remaining)} left` : '';
  return [base, rem].filter(Boolean).join(' ');
}

/**
 * Table for copy: by = 'person' (rows people, columns projects) or 'project' (the reverse).
 * -> { header: string[], rows: string[][] } with a Total column; cells "cp (tasks)".
 */
export function effortTable(m, by = 'person', opts = {}) {
  const rowsOf = by === 'person' ? m.people : m.projects;
  const colsOf = by === 'person' ? m.projects : m.people;
  const cellOf = (r, c) => (by === 'person' ? m.cell(r.id, c.id) : m.cell(c.id, r.id));
  const header = [by === 'person' ? 'Person' : 'Project', ...colsOf.map((c) => c.name), 'Total'];
  const rows = rowsOf.map((r) => [r.name, ...colsOf.map((c) => cellText(cellOf(r, c), opts)), cellText(r.total, opts)]);
  return { header, rows };
}
