import { describe, it, expect } from 'vitest';
import { OPEN_STATUSES, statusOf, isOverdueTask, progressWeight, isCreditedCompletion } from '../../src/taskStatus.js';

const now = new Date(2026, 9, 24);

describe('isOverdueTask (P3-Q6 provisional)', () => {
  it('open statuses past end are overdue', () => {
    expect(isOverdueTask({ status: 'InProgress', end: '2026-10-23' }, now)).toBe(true);
    expect(isOverdueTask({ status: 'Planned', end: '2026-10-23' }, now)).toBe(true);
  });
  it('missing status counts as Planned', () => {
    expect(isOverdueTask({ end: '2026-10-23' }, now)).toBe(true);
    expect(statusOf({})).toBe('Planned');
    expect(statusOf(null)).toBe('Planned');
  });
  it.each(['Submitted', 'Completed', 'Dropped'])('%s is never overdue', (s) => {
    expect(isOverdueTask({ status: s, end: '2026-10-01' }, now)).toBe(false);
  });
  it('due today is not overdue, even late in the day', () => {
    expect(isOverdueTask({ status: 'Planned', end: '2026-10-24' }, now)).toBe(false);
    expect(isOverdueTask({ status: 'Planned', end: '2026-10-24' }, new Date(2026, 9, 24, 23, 59))).toBe(false);
  });
  it('no end date or bad input is not overdue', () => {
    expect(isOverdueTask({ status: 'Planned', end: null }, now)).toBe(false);
    expect(isOverdueTask({ status: 'Planned', end: 'garbage' }, now)).toBe(false);
    expect(isOverdueTask(null, now)).toBe(false);
  });
  it('OPEN_STATUSES', () => expect(OPEN_STATUSES).toEqual(['Planned', 'InProgress']));
});

describe('progressWeight / isCreditedCompletion', () => {
  it('weights', () => {
    expect(progressWeight('Planned')).toBe(0);
    expect(progressWeight('InProgress')).toBe(0.5);
    expect(progressWeight('Submitted')).toBe(0.5);
    expect(progressWeight('Completed')).toBe(1);
    expect(progressWeight('Dropped')).toBeNull();
  });
  it('only Completed is credited', () => {
    expect(isCreditedCompletion({ status: 'Submitted' })).toBe(false);
    expect(isCreditedCompletion({ status: 'Completed' })).toBe(true);
  });
});
