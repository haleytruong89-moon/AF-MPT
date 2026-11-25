import { describe, it, expect } from 'vitest';
import { effortMatrix, cellText, effortTable } from '../../src/effortReport.js';

// G5, hand-computed. Project A (CRP): Lan 10 cp on t1 (Completed, on time); t2 shared 50/50,
// 8 cp (Completed late: Lan 4 + Minh 4); Minh open t3, 6 cp.
// Project B (closed): Lan 5 cp on t4 (Completed, no close date); lead Minh 2 earned of 3.
const A = { id: 'A', name: 'CRP', programs: [{ id: 'g', name: 'G', workstreams: [{ id: 'w', name: 'W', tasks: [
  { id: 't1', status: 'Completed', end: '2026-03-31', approvedAt: '2026-03-30T03:00:00.000Z' },
  { id: 't2', status: 'Completed', end: '2026-03-31', approvedAt: '2026-04-05T03:00:00.000Z' },
  { id: 't3', status: 'InProgress' },
] }] }] };
const B = { id: 'B', name: 'AF 2026 Operation', lifecycle: 'closed', programs: [{ id: 'g', name: 'G', workstreams: [{ id: 'w', name: 'W', tasks: [{ id: 't4', status: 'Completed' }] }] }] };
const row = (o) => ({ programName: 'G', workstreamName: 'W', isProjectLead: false, ...o });
const perProject = new Map([
  ['A', { project: A, breakdown: [
    row({ picId: 'lan', picName: 'Lan', taskId: 't1', taskName: 'T1', sharePct: 100, taskCp: 10, actual: 10, projected: 10, credited: true }),
    row({ picId: 'lan', picName: 'Lan', taskId: 't2', taskName: 'T2', sharePct: 50, taskCp: 8, actual: 4, projected: 4, credited: true }),
    row({ picId: 'minh', picName: 'Minh', taskId: 't2', taskName: 'T2', sharePct: 50, taskCp: 8, actual: 4, projected: 4, credited: true }),
    row({ picId: 'minh', picName: 'Minh', taskId: 't3', taskName: 'T3', sharePct: 100, taskCp: 6, actual: 0, projected: 6, credited: false }),
  ] }],
  ['B', { project: B, breakdown: [
    row({ picId: 'lan', picName: 'Lan', taskId: 't4', taskName: 'T4', sharePct: 100, taskCp: 5, actual: 5, projected: 5, credited: true }),
    { picId: 'minh', picName: 'Minh', taskId: null, taskName: 'Minh (project lead, 10%)', programName: '— Project Lead —', workstreamName: '', isProjectLead: true, sharePct: 100, taskCp: 3, actual: 2, projected: 3, credited: false },
  ] }],
]);

describe('G5 effort report', () => {
  const m = effortMatrix(perProject);
  it('EF-1 totals by person, by project and overall', () => {
    expect(m.people.map((p) => [p.id, p.total.cp, p.total.tasks, p.total.remaining])).toEqual([['lan', 19, 3, 0], ['minh', 6, 1, 7]]);
    expect(m.projects.map((p) => [p.id, p.total.cp, p.total.tasks, p.closed])).toEqual([['A', 18, 3, false], ['B', 7, 1, true]]);
    expect(m.total).toMatchObject({ cp: 25, tasks: 4, remaining: 7 });
  });
  it('EF-2 cell drill-down: timing from the close date, lead row, open row', () => {
    expect(m.cell('lan', 'A').rows.map((r) => [r.taskId, r.timing])).toEqual([['t2', 'late'], ['t1', 'on-time']]);
    expect(m.cell('lan', 'B').rows[0]).toMatchObject({ taskId: 't4', timing: 'unknown', closedOn: null });
    expect(m.cell('minh', 'B').rows[0]).toMatchObject({ lead: true, cp: 2, remaining: 1, open: false });
    expect(m.cell('minh', 'A').rows.find((r) => r.taskId === 't3')).toMatchObject({ open: true, cp: 0, remaining: 6 });
    expect(m.cell('nobody', 'A')).toBeNull();
  });
  it('EF-3 cell text and copy tables both ways', () => {
    expect(cellText(m.cell('minh', 'A'))).toBe('4 (1)');
    expect(cellText(m.cell('minh', 'A'), { showRemaining: true })).toBe('4 (1) +6 left');
    expect(effortTable(m, 'person')).toEqual({
      header: ['Person', 'CRP', 'AF 2026 Operation', 'Total'],
      rows: [['Lan', '14 (2)', '5 (1)', '19 (3)'], ['Minh', '4 (1)', '2 (0)', '6 (1)']],
    });
    expect(effortTable(m, 'project').rows).toEqual([['CRP', '14 (2)', '4 (1)', '18 (3)'], ['AF 2026 Operation', '5 (1)', '2 (0)', '7 (1)']]);
  });
});
