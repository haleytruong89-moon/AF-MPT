import { describe, it, expect } from 'vitest';
import { nodeSpan, nodePct, buildGanttRows, buildAllProjectsGanttRows, ganttTaskIndex } from '../../src/ganttRows.js';

// W3-C1: Gantt grouping.
const t = (id, status, start, end) => ({ id, name: id, status, start, end });
const project = {
  id: 'p1', name: 'P1',
  programs: [
    { id: 'pg1', name: 'Finance', workstreams: [
      { id: 'w1', name: 'Close', tasks: [t('b', 'Planned', '2026-03-01', '2026-03-10'), t('a', 'InProgress', '2026-01-05', '2026-02-01')] },
      { id: 'w2', name: 'Empty', tasks: [t('u', 'Planned', null, null)] },
    ] },
    { id: 'pg2', name: 'Tax', workstreams: [{ id: 'w3', name: 'VAT', tasks: [t('c', 'Completed', '2026-02-01', '2026-02-02')] }] },
  ],
};

describe('W3-C1 ganttRows', () => {
  it('GR-1 nodeSpan ignores Dropped and undated tasks', () => {
    const ws = { tasks: [t('x', 'Dropped', '2025-01-01', '2027-01-01'), t('y', 'Planned', '2026-02-01', '2026-02-05'), t('z', 'Planned', null, '2026-03-01')] };
    expect(nodeSpan(ws)).toEqual({ start: '2026-02-01', end: '2026-03-01' });
    expect(nodeSpan({ tasks: [t('u', 'Planned', null, null)] })).toEqual({ start: null, end: null });
  });

  it('GR-2 nodePct matches rollup (Completed 1, InProgress / Submitted 0.5, Planned 0, Dropped out)', () => {
    const ws = { tasks: [t('1', 'Completed'), t('2', 'InProgress'), t('3', 'Submitted'), t('4', 'Planned'), t('5', 'Dropped')] };
    expect(nodePct(ws)).toBe(50);
    expect(nodePct({ tasks: [t('5', 'Dropped')] })).toBe(0);
  });

  it('GR-3 group order, depths, tasks sorted by start', () => {
    const rows = buildGanttRows(project);
    expect(rows.map((r) => [r.kind, r.key, r.depth])).toEqual([
      ['program', 'pg:pg1', 0], ['workstream', 'ws:w1', 1], ['task', 't:a', 2], ['task', 't:b', 2],
      ['workstream', 'ws:w2', 1], ['task', 't:u', 2],
      ['program', 'pg:pg2', 0], ['workstream', 'ws:w3', 1], ['task', 't:c', 2],
    ]);
    expect(rows[0]).toMatchObject({ start: '2026-01-05', end: '2026-03-10', pct: 17 });
    expect(rows[4]).toMatchObject({ start: null, end: null });
  });

  it('GR-4 collapsed program hides its work streams and tasks; collapsed ws hides its tasks', () => {
    expect(buildGanttRows(project, { collapsed: new Set(['pg:pg1']) }).map((r) => r.key)).toEqual(['pg:pg1', 'pg:pg2', 'ws:w3', 't:c']);
    const r = buildGanttRows(project, { collapsed: new Set(['ws:w1']) });
    expect(r.map((x) => x.key).slice(0, 3)).toEqual(['pg:pg1', 'ws:w1', 'ws:w2']);
    expect(r[1].collapsed).toBe(true);
  });

  it('GR-5 scope filters to one program; an unknown scope shows all', () => {
    expect(buildGanttRows(project, { scopeProgramId: 'pg2' }).map((r) => r.key)).toEqual(['pg:pg2', 'ws:w3', 't:c']);
    expect(buildGanttRows(project, { scopeProgramId: 'other' })).toHaveLength(9);
  });

  it('GR-6 all-projects rows: projectIds order, missing ids skipped, no task rows', () => {
    const rows = buildAllProjectsGanttRows({ p1: project }, ['gone', 'p1']);
    expect(rows.map((r) => r.kind)).not.toContain('task');
    expect(rows.map((r) => r.key)).toEqual(['p:p1', 'pg:p1:pg1', 'ws:p1:w1', 'ws:p1:w2', 'pg:p1:pg2', 'ws:p1:w3']);
    const folded = buildAllProjectsGanttRows({ p1: project }, ['p1'], { collapsed: new Set(['pg:p1:pg1', 'pg:p1:pg2']) });
    expect(folded.map((r) => r.key)).toEqual(['p:p1', 'pg:p1:pg1', 'pg:p1:pg2']);
    expect(folded[0]).toMatchObject({ projectId: 'p1', start: '2026-01-05', end: '2026-03-10' });
  });

  it('GR-7 ganttTaskIndex skips group rows', () => {
    const rows = buildGanttRows(project);
    expect(ganttTaskIndex(rows)).toEqual({ a: 2, b: 3, u: 5, c: 8 });
  });
});
