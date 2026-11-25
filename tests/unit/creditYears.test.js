import { describe, it, expect } from 'vitest';
import { vnYear, closeYearOf, creditRowsForPeriod, creditPeriodYears, LIFETIME } from '../../src/creditYears.js';

// G2: credit by close year — hand-computed example.
// Project CRP, pool 100, lead 10% (10 cp), 4 non-dropped tasks of 22.5 cp each (90 / 4).
//   t1 Completed 2026-06 (Lan 100%)      t2 Completed 2027-02 (Lan 70 / Minh 30)
//   t3 InProgress (Minh 100%)            t4 Completed, no date, project creditYear 2026 (Minh 100%)
//   t5 Dropped (ignored)
const project = {
  id: 'crp', name: 'CRP', creditYear: 2026,
  programs: [{ id: 'g', workstreams: [{ id: 'w', tasks: [
    { id: 't1', status: 'Completed', approvedAt: '2026-06-10T03:00:00.000Z' },
    { id: 't2', status: 'Completed', approvedAt: '2027-02-01T03:00:00.000Z' },
    { id: 't3', status: 'InProgress' },
    { id: 't4', status: 'Completed' },
    { id: 't5', status: 'Dropped' },
  ] }] }],
};
const row = (taskId, picName, sharePct) => ({ taskId, picName, picId: picName, sharePct, taskCp: 22.5, projected: 22.5 * sharePct / 100, actual: 0, credited: false, isProjectLead: false });
const breakdown = [
  { taskId: null, picName: 'Ha', picId: 'Ha', sharePct: 100, taskCp: 10, projected: 10, actual: 0, isProjectLead: true },
  row('t1', 'Lan', 100), row('t2', 'Lan', 70), row('t2', 'Minh', 30), row('t3', 'Minh', 100), row('t4', 'Minh', 100),
];
const sum = (rows, who, k) => Math.round(rows.filter((r) => r.picName === who).reduce((s, r) => s + r[k], 0) * 1000) / 1000;

describe('G2 credit by close year', () => {
  it('CY-1 VN year boundary and fallback year', () => {
    expect(vnYear('2026-12-31T16:59:59.000Z')).toBe(2026);
    expect(vnYear('2026-12-31T17:00:00.000Z')).toBe(2027);
    expect(closeYearOf({ approvedAt: '2027-01-01T01:00:00Z' }, project)).toBe(2027);
    expect(closeYearOf({}, project)).toBe(2026);
  });
  it('CY-2 year 2026 (past year seen from 2027): t1 + t4 earned; no open work; lead 2/4', () => {
    const rows = creditRowsForPeriod({ project, breakdown, period: 2026, currentYear: 2027 });
    expect(sum(rows, 'Lan', 'actual')).toBe(22.5);
    expect(sum(rows, 'Minh', 'actual')).toBe(22.5);
    expect(sum(rows, 'Minh', 'projected')).toBe(22.5);
    expect(sum(rows, 'Ha', 'actual')).toBe(5);
    expect(sum(rows, 'Ha', 'projected')).toBe(5);
  });
  it('CY-3 year 2027 (current): t2 earned, t3 remaining; lead 1/4 earned, 2/4 projected', () => {
    const rows = creditRowsForPeriod({ project, breakdown, period: 2027, currentYear: 2027 });
    expect(sum(rows, 'Lan', 'actual')).toBe(15.75);
    expect(sum(rows, 'Minh', 'actual')).toBe(6.75);
    expect(sum(rows, 'Minh', 'projected')).toBe(29.25);
    expect(sum(rows, 'Ha', 'actual')).toBe(2.5);
    expect(sum(rows, 'Ha', 'projected')).toBe(5);
  });
  it('CY-4 lifetime = all closed + remaining = the whole pool', () => {
    const rows = creditRowsForPeriod({ project, breakdown, period: LIFETIME, currentYear: 2027 });
    const total = Math.round(rows.reduce((s, r) => s + r.projected, 0) * 1000) / 1000;
    expect(total).toBe(100);
    expect(sum(rows, 'Ha', 'actual')).toBe(7.5);
  });
  it('CY-5 years offered', () => {
    expect(creditPeriodYears({ crp: project }, 2027)).toEqual([2027, 2026]);
  });
});
