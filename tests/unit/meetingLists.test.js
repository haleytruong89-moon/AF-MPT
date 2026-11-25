import { describe, it, expect } from 'vitest';
import { meetingTaskLists, takeWithMore } from '../../src/meetingLists.js';

// Today = Wed 10 Dec 2026 (local).
const NOW = new Date(2026, 11, 10, 15, 0);
const project = { programs: [{ id: 'g', name: 'G', workstreams: [{ id: 'w', name: 'W', tasks: [
  { id: 'late2', status: 'InProgress', end: '2026-12-01' },
  { id: 'late1', status: 'Planned', end: '2026-12-09' },
  { id: 'today', status: 'InProgress', end: '2026-12-10' },
  { id: 'd7', status: 'Planned', end: '2026-12-17' },
  { id: 'd8', status: 'Planned', end: '2026-12-18' },
  { id: 'sub', status: 'Submitted', end: '2026-12-01' },
  { id: 'done', status: 'Completed', end: '2026-12-01' },
  { id: 'nodate', status: 'Planned' },
  { id: 'nostatus', end: '2026-12-12' },
] }] }] };

describe('PM-13 meeting lists', () => {
  it('ML-1 overdue oldest first, due in 7 days soonest first; Submitted / closed / no date left out', () => {
    const { overdue, dueSoon } = meetingTaskLists(project, NOW);
    expect(overdue.map((x) => [x.task.id, x.days])).toEqual([['late2', 9], ['late1', 1]]);
    expect(dueSoon.map((x) => [x.task.id, x.days])).toEqual([['today', 0], ['nostatus', 2], ['d7', 7]]);
  });
  it('ML-2 take with more', () => {
    expect(takeWithMore([1, 2, 3], 2)).toEqual({ shown: [1, 2], more: 1 });
    expect(takeWithMore([1], 5)).toEqual({ shown: [1], more: 0 });
    expect(takeWithMore(null, 5)).toEqual({ shown: [], more: 0 });
  });
});
