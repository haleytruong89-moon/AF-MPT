import { describe, it, expect } from 'vitest';
import { periodRange, closedByMe, creditYears, myCreditByYear, toTsv } from '../../src/myRecord.js';

// Audit 25/11 wave 4 (HOD Q6): my own record.
const now = new Date('2026-11-25T10:00:00');
const isMe = (raw) => raw === 'Lan' || raw === 'lan@smartosc.com';
const task = (id, status, extra = {}) => ({ id, name: id, status, pic: 'Lan', contributors: [], ...extra });
const project = {
  id: 'p', name: 'Ops', creditYear: 2026, weightsLocked: false,
  programs: [{ id: 'g', workstreams: [{ id: 'w', tasks: [
    task('onTime', 'Completed', { end: '2026-11-20', approvedAt: '2026-11-19T10:00:00', approvedByUid: 'u_pm' }),
    task('late', 'Completed', { end: '2026-11-01', approvedAt: '2026-11-04T10:00:00', approvedByUid: 'u_pm' }),
    task('contrib', 'Completed', { pic: 'Minh', contributors: ['Lan'], end: '2026-11-30', approvedAt: '2026-11-10T10:00:00' }),
    task('dropped', 'Dropped', { approvedAt: '2026-11-12T10:00:00' }),
    task('october', 'Completed', { end: '2026-10-01', approvedAt: '2026-10-02T10:00:00' }),
    task('open', 'InProgress'),
    task('other', 'Completed', { pic: 'Minh', approvedAt: '2026-11-11T10:00:00' }),
  ] }] }],
};
const breakdown = [
  { taskId: 'onTime', taskName: 'onTime', picName: 'Lan', sharePct: 100, taskCp: 10, projected: 10, actual: 10, credited: true },
  { taskId: 'late', taskName: 'late', picName: 'Lan', sharePct: 100, taskCp: 5, projected: 5, actual: 5, credited: true },
  { taskId: 'contrib', taskName: 'contrib', picName: 'Lan', sharePct: 30, taskCp: 10, projected: 3, actual: 3, credited: true },
  { taskId: 'contrib', taskName: 'contrib', picName: 'Minh', sharePct: 70, taskCp: 10, projected: 7, actual: 7, credited: true },
  { taskId: 'open', taskName: 'open', picName: 'Lan', sharePct: 100, taskCp: 4, projected: 4, actual: 0, credited: false },
];
const creditsOf = () => breakdown;

describe('myRecord', () => {
  it('MR-1 period ranges', () => {
    expect(periodRange('thisMonth', now)).toEqual({ from: new Date(2026, 10, 1), to: new Date(2026, 11, 1) });
    expect(periodRange('lastMonth', now).from).toEqual(new Date(2026, 9, 1));
    expect(periodRange('thisQuarter', now)).toEqual({ from: new Date(2026, 9, 1), to: new Date(2027, 0, 1) });
    expect(periodRange('lastYear', now).from).toEqual(new Date(2025, 0, 1));
  });
  it('MR-2 closed by me this month: PIC and contributor, Dropped listed apart, others and other months excluded', () => {
    const { from, to } = periodRange('thisMonth', now);
    const r = closedByMe({ projects: { p: project }, isMe, from, to, creditsOf });
    expect(r.rows.map((x) => [x.task.id, x.role, x.timing.kind, x.cp])).toEqual([
      ['onTime', 'PIC', 'on-time', 10], ['dropped', 'PIC', 'dropped', 0], ['contrib', 'Contributor', 'on-time', 3], ['late', 'PIC', 'late', 5],
    ]);
    expect(r.summary).toEqual({ closed: 3, dropped: 1, onTime: 2, late: 1, cp: 18 });
  });
  it('MR-3 credit by year: only my rows, totals, lock flag', () => {
    const c = myCreditByYear({ projects: { p: project }, isMe, year: 2026, creditsOf, currentYear: 2026 });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ locked: false, projected: 22, earned: 18 });
    expect(c[0].rows.map((r) => r.taskId)).toEqual(['onTime', 'late', 'contrib', 'open']);
    expect(myCreditByYear({ projects: { p: project }, isMe, year: 2025, creditsOf, currentYear: 2026 })).toEqual([]);
    expect(creditYears({ p: project, q: { creditYear: 2025 } }, 2026)).toEqual([2026, 2025]);
  });
  it('MR-4 TSV cleans tabs and new lines', () => {
    expect(toTsv(['a', 'b'], [['x\ty', 'line\nbreak']])).toBe('a\tb\nx y\tline break');
  });
});

describe('G2 option B in My record', () => {
  it('MR-5 a closed task with no date shows in the year view of its project year, not in month views', () => {
    const p = { id: 'q', name: 'MA', creditYear: 2026, programs: [{ id: 'g', workstreams: [{ id: 'w', tasks: [{ id: 'old', name: 'old', status: 'Completed', pic: 'Lan', end: '2026-05-01' }] }] }] };
    const y = periodRange('thisYear', now);
    const m = periodRange('thisMonth', now);
    const inYear = closedByMe({ projects: { q: p }, isMe, from: y.from, to: y.to });
    expect(inYear.rows.map((r) => [r.task.id, r.closedOn, r.timing.kind])).toEqual([['old', null, 'unknown']]);
    expect(closedByMe({ projects: { q: p }, isMe, from: m.from, to: m.to }).rows).toEqual([]);
  });
});
