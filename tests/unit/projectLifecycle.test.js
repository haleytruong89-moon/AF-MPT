import { describe, it, expect } from 'vitest';
import { isClosedProject, openTasksOf, closePatch, reopenPatch, nextYearName, copyStructure } from '../../src/projectLifecycle.js';

// G4: project Closed / Reopen, copy structure.
const project = {
  id: 'p', name: 'AF 2026 Operation',
  programs: [
    { id: 'g1', name: 'Close', weight: 60, workstreams: [{ id: 'w1', name: 'Month-end', weight: 50, tasks: [{ id: 't1', status: 'Completed' }, { id: 't2', status: 'InProgress' }] }, { id: 'w2', name: 'Year-end', tasks: [{ id: 't3', status: 'Dropped' }] }] },
    { id: 'g2', name: 'Tax', workstreams: [] },
  ],
};

describe('G4 project lifecycle', () => {
  it('PL-1 close is refused while tasks are open; ok once closed / dropped', () => {
    const r = closePatch(project, { by: 'Ha' });
    expect(r.ok).toBe(false);
    expect(r.open.map((o) => o.task.id)).toEqual(['t2']);
    const done = structuredClone(project); done.programs[0].workstreams[0].tasks[1].status = 'Completed';
    const c = closePatch(done, { by: 'Ha', now: '2026-12-31T10:00:00.000Z' });
    expect(c.ok).toBe(true);
    expect(c.project).toMatchObject({ lifecycle: 'closed', closedAt: '2026-12-31T10:00:00.000Z', closedBy: 'Ha' });
    expect(isClosedProject(c.project)).toBe(true);
    expect(reopenPatch(c.project)).toMatchObject({ lifecycle: 'active', closedAt: null, closedBy: null });
    expect(openTasksOf(done)).toEqual([]);
  });
  it('PL-2 next year name', () => {
    expect(nextYearName('AF 2026 Operation')).toBe('AF 2027 Operation');
    expect(nextYearName('Treasury 2026')).toBe('Treasury 2027');
    expect(nextYearName('KRA 2025 - 2026 plan')).toBe('KRA 2025 - 2027 plan');
    expect(nextYearName('CRP')).toBe('CRP (copy)');
  });
  it('PL-3 copy structure: programs and work streams with weights, no tasks, roles mapped to new ids', () => {
    let n = 0;
    const idOf = (k) => `${k}_${++n}`;
    const roles = { programs: { g1: { pmUid: 'u_pm', deputyUid: 'u_dep' }, g2: { pmUid: null } }, workstreams: { w1: { leadUid: 'u_sub' } } };
    const { programs, roleMoves } = copyStructure(project, { idOf, roles });
    expect(programs).toEqual([
      { id: 'pg_1', name: 'Close', weight: 60, workstreams: [{ id: 'ws_2', name: 'Month-end', weight: 50, tasks: [] }, { id: 'ws_3', name: 'Year-end', tasks: [] }], raid: [] },
      { id: 'pg_4', name: 'Tax', workstreams: [], raid: [] },
    ]);
    expect(roleMoves).toEqual([
      { kind: 'lead', programId: 'pg_1', wsId: 'ws_2', toUid: 'u_sub' },
      { kind: 'pm', programId: 'pg_1', toUid: 'u_pm' },
      { kind: 'deputy', programId: 'pg_1', toUid: 'u_dep' },
    ]);
  });
});
