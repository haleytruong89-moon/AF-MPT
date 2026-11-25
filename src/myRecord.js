// Audit 25/11 wave 4 (MB-14, MB-15; HOD Q6): a member's own record — closed work by period,
// on time / late, and credit by year with per-task rows. Only the person's own items. Pure.
import { closeTiming } from './delivery.js';
import { closeYearOf, creditRowsForPeriod, creditPeriodYears } from './creditYears.js';

const arr = (v) => (Array.isArray(v) ? v : []);

/** Period select: -> { from: Date, to: Date (exclusive) } in local time. */
export const PERIODS = [
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisQuarter', label: 'This quarter' },
  { key: 'thisYear', label: 'This year' },
  { key: 'lastYear', label: 'Last year' },
];
export function periodRange(key, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === 'lastMonth') return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
  if (key === 'thisQuarter') { const q = Math.floor(m / 3) * 3; return { from: new Date(y, q, 1), to: new Date(y, q + 3, 1) }; }
  if (key === 'thisYear') return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
  if (key === 'lastYear') return { from: new Date(y - 1, 0, 1), to: new Date(y, 0, 1) };
  return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
}

/** My cp on one task from a project's credit breakdown (isMe on picName). */
function myCp(breakdown, taskId, isMe) {
  return arr(breakdown).filter((b) => b.taskId === taskId && isMe(b.picName)).reduce((s, b) => s + (b.actual || 0), 0);
}

/**
 * Tasks I was PIC or contributor on, Completed or Dropped, closed (approvedAt) in [from, to).
 * creditsOf(project) -> computeProjectCredits(project).breakdown (App-provided).
 * -> { rows: [{ project, task, role, closedOn, approverUid, timing, cp }], summary }
 */
export function closedByMe({ projects, isMe, from, to, creditsOf = () => [] }) {
  const rows = [];
  for (const project of Object.values(projects || {})) {
    if (!project) continue;
    let breakdown = null;
    for (const pg of arr(project.programs)) {
      for (const ws of arr(pg.workstreams)) {
        for (const task of arr(ws.tasks)) {
          if (task?.status !== 'Completed' && task?.status !== 'Dropped') continue;
          const pic = isMe(task.pic);
          const contributor = !pic && arr(task.contributors).some(isMe);
          if (!pic && !contributor) continue;
          const timing = closeTiming(task);
          if (timing.closedOn) {
            if (timing.closedOn < from || timing.closedOn >= to) continue;
          } else {
            // G2 option B: no close date -> the project's credit year; shown only when the
            // period covers that whole year (This year / Last year).
            const y = closeYearOf(task, project);
            if (y == null || !(from <= new Date(y, 0, 1) && to >= new Date(y + 1, 0, 1))) continue;
          }
          if (breakdown === null) breakdown = creditsOf(project) || [];
          rows.push({
            project, program: pg, workstream: ws, task, role: pic ? 'PIC' : 'Contributor',
            closedOn: timing.closedOn, approverUid: task.approvedByUid || null,
            timing: task.status === 'Dropped' ? { kind: 'dropped', lateDays: 0 } : timing,
            cp: task.status === 'Completed' ? myCp(breakdown, task.id, isMe) : 0,
          });
        }
      }
    }
  }
  rows.sort((a, b) => (b.closedOn ? b.closedOn.getTime() : 0) - (a.closedOn ? a.closedOn.getTime() : 0));
  const summary = {
    closed: rows.filter((r) => r.task.status === 'Completed').length,
    dropped: rows.filter((r) => r.task.status === 'Dropped').length,
    onTime: rows.filter((r) => r.timing.kind === 'on-time').length,
    late: rows.filter((r) => r.timing.kind === 'late').length,
    cp: Math.round(rows.reduce((s, r) => s + r.cp, 0) * 10) / 10,
  };
  return { rows, summary };
}

/** Years offered in My record: years with closed tasks or a project credit year, plus `fallback`. */
export function creditYears(projects, fallback = new Date().getFullYear()) {
  return creditPeriodYears(projects, fallback);
}

/**
 * My credit for one year (G2: by close date; open tasks count in the current year only),
 * my rows from the breakdown. -> [{ project, locked, rows: [{ taskId, taskName, sharePct, projected, earned, credited }], projected, earned }]
 */
export function myCreditByYear({ projects, isMe, year, creditsOf = () => [], currentYear = new Date().getFullYear() }) {
  const out = [];
  for (const project of Object.values(projects || {})) {
    if (!project) continue;
    // G2: rows of this year by close date (open tasks only in the current year), every project.
    const rows = creditRowsForPeriod({ project, breakdown: creditsOf(project), period: year, currentYear })
      .filter((b) => isMe(b.picName))
      .map((b) => ({ taskId: b.taskId, taskName: b.taskName, sharePct: b.sharePct, projected: b.projected || 0, earned: b.actual || 0, credited: !!b.credited }));
    if (!rows.length) continue;
    const r1 = (n) => Math.round(n * 10) / 10;
    out.push({
      project, locked: !!project.weightsLocked, rows,
      projected: r1(rows.reduce((s, r) => s + r.projected, 0)),
      earned: r1(rows.reduce((s, r) => s + r.earned, 0)),
    });
  }
  return out.sort((a, b) => b.projected - a.projected);
}

/** Tab-separated text (pastes as a table in Sheets / Excel / Docs). */
export function toTsv(header, rows) {
  const clean = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ');
  return [header, ...rows].map((r) => r.map(clean).join('\t')).join('\n');
}
