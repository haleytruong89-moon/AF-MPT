import { describe, it, expect } from 'vitest';
import { computeActivityIndex, computeActivityIndexWithTrend, rankCoachingPriorities, cadenceScore, taskHandInDate, deliverySample } from '../../src/coaching.js';

// Audit 27/11, hand-computed. Today = Wed 10 Dec 2026; task window 12 weeks, action window 4 weeks.
const NOW = new Date(2026, 11, 10, 12, 0);
const T = (o) => ({ status: 'Planned', health: 'green', updates: [], ...o });
const appr = (decidedAt, submittedAt) => [{ status: 'Approved', decidedAt, submittedAt }];
const project = (tasks, actions = [], decisions = []) => ({ p: { id: 'p', programs: [{ id: 'g', workstreams: [{ id: 'w', tasks }] }], actionItems: actions, decisions } });
const run = (p, o = {}) => computeActivityIndex(p, { now: NOW, ...o });

describe('Coaching engine (audit 27/11)', () => {
  it('CG-1 CO-1 / Q3: hand-in date decides on time; late approval of an on-time submission is on time; Submitted not rated', () => {
    const m = run(project([
      // submitted 09/11 (due 10/11), approved 25/11 -> on time (Q3 A)
      T({ id: 'a', pic: 'Lan', status: 'Completed', end: '2026-11-10', approvedAt: '2026-11-25T03:00:00Z', closeRequestHistory: appr('2026-11-25T03:00:00Z', '2026-11-09T03:00:00Z') }),
      // direct close 20/11, due 10/11 -> late
      T({ id: 'b', pic: 'Lan', status: 'Completed', end: '2026-11-10', approvedAt: '2026-11-20T03:00:00Z' }),
      // closed before approvals existed: not rated
      T({ id: 'c', pic: 'Lan', status: 'Completed', end: '2026-11-10' }),
      // waiting for approval: not rated
      T({ id: 'd', pic: 'Lan', status: 'Submitted', end: '2026-11-10' }),
      // still open past due: late
      T({ id: 'e', pic: 'Lan', status: 'InProgress', end: '2026-11-10', updates: [{ timestamp: '2026-12-08T00:00:00Z', author: 'Lan' }] }),
    ])).get('Lan');
    expect([m.delivery.hardTotal, m.delivery.hardOnTime]).toEqual([3, 1]);
    expect(m.delivery.weightedRate).toBe(33);
    expect(deliverySample(m)).toBe(3);
    expect(m.composite.dimensions.delivery).toBe(33); // CO-3: 3 rated tasks, no action needed
  });

  it('CG-2 CO-2: actions rated by completion date; Done without one not rated', () => {
    const m = run(project([], [
      { id: 'a1', pic: 'Minh', status: 'Done', dueDate: '2026-11-20', completedAt: '2026-11-19T00:00:00Z', timestamp: '2026-09-01T00:00:00Z' },
      // created long ago, due before the window, finished late inside it -> counted, late
      { id: 'a2', pic: 'Minh', status: 'Done', dueDate: '2026-10-15', completedAt: '2026-11-20T00:00:00Z', timestamp: '2026-09-01T00:00:00Z' },
      { id: 'a3', pic: 'Minh', status: 'Done', dueDate: '2026-11-25', timestamp: '2026-09-01T00:00:00Z' },
      { id: 'a4', pic: 'Minh', status: 'Open', dueDate: '2026-12-01' },
      { id: 'a5', pic: 'Minh', status: 'Cancelled', dueDate: '2026-12-01' },
    ])).get('Minh');
    expect([m.delivery.total, m.delivery.onTime, m.delivery.late]).toEqual([3, 1, 2]);
    expect(m.delivery.rate).toBe(33);
  });

  it('CG-3 CO-6: a comment on a task without a PIC counts as engagement', () => {
    const r = run(project([T({ id: 'x', end: '2026-12-20', updates: [{ timestamp: '2026-12-01T00:00:00Z', author: 'An' }] })]));
    expect(r.get('An').engagement).toMatchObject({ crossTaskUpdates: 1, total: 1 });
  });

  it('CG-4 CO-7 cadence scale matches the thresholds', () => {
    expect([cadenceScore(0), cadenceScore(7), cadenceScore(14), cadenceScore(16), cadenceScore(40)]).toEqual([100, 85, 70, 60, 0]);
  });

  it('CG-5 CO-5: previous period does not overlap the current one', () => {
    // A task due 1 Dec (current task window) must not show up in the previous period.
    const p = project([T({ id: 't', pic: 'Lan', status: 'InProgress', end: '2026-12-01' })]);
    const cur = computeActivityIndexWithTrend(p, { now: NOW });
    expect(cur.get('Lan').delivery.hardTotal).toBe(1);
    const prev = computeActivityIndex(p, { now: NOW, taskFrom: new Date(2026, 5, 24), taskTo: new Date(2026, 8, 16, 23), actionFrom: new Date(2026, 9, 15), actionTo: new Date(2026, 10, 11, 23) });
    expect(prev.get('Lan')?.delivery.hardTotal ?? 0).toBe(0);
  });

  it('CG-6 hand-in date helper and the priorities banner use the same sample as the table', () => {
    expect(taskHandInDate({ status: 'Completed', approvedAt: 'A', closeRequestHistory: [{ status: 'Approved', decidedAt: 'A', submittedAt: 'S' }] })).toBe('S');
    expect(taskHandInDate({ status: 'Completed', approvedAt: 'B', closeRequestHistory: [{ status: 'Approved', decidedAt: 'A', submittedAt: 'S' }] })).toBe('B');
    expect(taskHandInDate({ status: 'Submitted' })).toBeNull();
    const m = run(project([
      T({ id: 'l1', pic: 'Lan', status: 'InProgress', end: '2026-11-01' }),
      T({ id: 'l2', pic: 'Lan', status: 'InProgress', end: '2026-11-02' }),
      T({ id: 'l3', pic: 'Lan', status: 'InProgress', end: '2026-11-03' }),
    ]));
    const top = rankCoachingPriorities(m, 3);
    expect(top[0].pic).toBe('Lan'); // 0% delivery on 3 tasks: red, even with no action
  });
});
