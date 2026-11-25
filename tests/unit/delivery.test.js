import { describe, it, expect } from 'vitest';
import { closeTiming, personDelivery } from '../../src/delivery.js';

// Audit 25/11 wave 3 (PM-21, Q2): delivery per person, no credit.
const now = new Date('2026-11-25T10:00:00');
const t = (pic, status, extra = {}) => ({ pic, status, ...extra });

describe('closeTiming', () => {
  it('CT-1 on time, late, no due date, unknown', () => {
    expect(closeTiming({ end: '2026-11-20', approvedAt: '2026-11-20T15:00:00' }).kind).toBe('on-time');
    expect(closeTiming({ end: '2026-11-20', approvedAt: '2026-11-23T09:00:00' })).toMatchObject({ kind: 'late', lateDays: 3 });
    expect(closeTiming({ approvedAt: '2026-11-23T09:00:00' }).kind).toBe('no-due');
    expect(closeTiming({ end: '2026-11-20' }).kind).toBe('unknown');
  });
});

describe('personDelivery', () => {
  const ws = { tasks: [
    t('Lan', 'InProgress', { end: '2026-11-01' }),
    t('Lan', 'Planned', { end: '2026-12-30' }),
    t('Lan', 'Submitted'),
    t('Lan', 'Completed', { end: '2026-11-20', approvedAt: '2026-11-20T10:00:00' }),
    t('Lan', 'Completed', { end: '2026-11-10', approvedAt: '2026-11-15T10:00:00' }),
    t('Lan', 'Completed', { end: '2025-11-10', approvedAt: '2025-11-15T10:00:00' }),
    t('Lan P', 'Completed', { end: '2026-01-10' }),
    t('Minh', 'Dropped'),
    t(null, 'Planned'),
  ] };
  it('PD-1 counts per person, aliases merged, other years left out, Dropped ignored', () => {
    const keyOf = (raw) => (raw === 'Lan P' ? 'Lan' : raw);
    expect(personDelivery(ws, { keyOf, year: 2026, now })).toEqual([
      { key: 'Lan', label: 'Lan', open: 2, awaiting: 1, overdue: 1, onTime: 1, late: 1, unknown: 1 },
    ]);
  });
});
