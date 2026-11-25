import { describe, it, expect } from 'vitest';
import { planClosedAt, decideClosedAtRollback, endOfDayVn, eventTime, formatClosedAtPreview } from '../../scripts/lib/closedat-plan.mjs';
import { parseArgs } from '../../scripts/p2-backfill-closed-at.mjs';

// G1: close dates for tasks closed before P3.1.
const doc = { name: 'CRP', schemaVersion: 2 };
const task = (id, data) => ({ id, data: { name: id, version: 2, ...data } });
const ev = (description, createdAt) => ({ id: description, data: { description, createdAt } });
const state = (tasks, activity = []) => ({ doc, tasks, activity });

describe('G1 planClosedAt', () => {
  it('CA-1 newest matching Activity line wins; status must match', () => {
    const p = planClosedAt({ pid: 'p', state: state(
      [task('VAT filing', { status: 'Completed', end: '2026-06-30' })],
      [
        ev('Changed "VAT filing" status: In Progress → Completed', '2026-06-01T03:00:00.000Z'),
        ev('Changed "VAT filing" status: Completed → In Progress', '2026-06-02T03:00:00.000Z'),
        ev('Changed "VAT filing" status: In Progress → Completed (from My Work)', '2026-06-05T03:00:00.000Z'),
        ev('Changed "VAT filing" status: Planned → Dropped', '2026-06-09T03:00:00.000Z'),
      ],
    ) });
    expect(p.changes).toEqual([{ id: 'VAT filing', name: 'VAT filing', status: 'Completed', version: 2, approvedAt: '2026-06-05T03:00:00.000Z', source: 'activity' }]);
    expect(p.counts).toEqual({ activity: 1, sharedName: 0, endDate: 0, unknown: 0 });
  });
  it('CA-2 shared name -> newest matching line, marked approximate; no line -> end of the planned end day (VN); no end -> unknown', () => {
    const p = planClosedAt({ pid: 'p', state: state([
      task('a', { status: 'Dropped', end: '2026-05-10' }),
      { id: 'd1', data: { name: 'dup', status: 'Completed', end: '2026-04-01', version: 1 } },
      { id: 'd2', data: { name: 'dup', status: 'Planned', version: 1 } },
      task('b', { status: 'Completed' }),
    ], [ev('Changed "dup" status: Planned → Completed', '2026-03-01T00:00:00.000Z')]) });
    expect(p.changes.map((c) => [c.id, c.approvedAt, c.source])).toEqual([
      ['d1', '2026-03-01T00:00:00.000Z', 'activity-shared-name'],
      ['a', '2026-05-10T16:59:59.000Z', 'end-date'],
    ]);
    expect(p.unknown).toEqual([{ id: 'b', name: 'b', status: 'Completed' }]);
  });
  it('CA-3 tasks already dated, or open, are untouched; hash stable and version-sensitive', () => {
    const s = state([task('x', { status: 'Completed', approvedAt: '2026-11-01T00:00:00.000Z', end: '2026-11-01' }), task('y', { status: 'InProgress', end: '2026-11-01' }), task('z', { status: 'Completed', end: '2026-11-02' })]);
    const p = planClosedAt({ pid: 'p', state: s });
    expect(p.changes.map((c) => c.id)).toEqual(['z']);
    expect(planClosedAt({ pid: 'p', state: structuredClone(s) }).planHash).toBe(p.planHash);
    const s2 = structuredClone(s); s2.tasks[2].data.version = 3;
    expect(planClosedAt({ pid: 'p', state: s2 }).planHash).not.toBe(p.planHash);
    expect(formatClosedAtPreview(p).join('\n')).toContain(`--expect ${p.planHash}`);
  });
  it('CA-4 blocked on a v1 project', () => {
    expect(planClosedAt({ pid: 'p', state: { doc: { schemaVersion: 1 }, tasks: [], activity: [] } }).blocked[0].code).toBe('not-v2');
  });
  it('CA-5 helpers', () => {
    expect(endOfDayVn('2026-12-31')).toBe('2026-12-31T16:59:59.000Z');
    expect(endOfDayVn(null)).toBeNull();
    expect(eventTime({ createdAt: { toDate: () => new Date('2026-01-02T00:00:00Z') } })).toBe('2026-01-02T00:00:00.000Z');
    expect(eventTime({ timestamp: '2026-01-03T00:00:00Z' })).toBe('2026-01-03T00:00:00.000Z');
  });
});

describe('G1 rollback and args', () => {
  it('CA-R1 removes only values still as applied', () => {
    const manifest = { kind: 'p2-backfill-closed-at', pid: 'p', planHash: 'h', changes: [{ id: 'a', approvedAt: '2026-01-01T00:00:00.000Z', source: 'activity' }, { id: 'b', approvedAt: '2026-01-02T00:00:00.000Z', source: 'end-date' }] };
    const r = decideClosedAtRollback({ manifest, state: state([
      task('a', { status: 'Completed', approvedAt: '2026-01-01T00:00:00.000Z', approvedAtSource: 'activity', version: 3 }),
      task('b', { status: 'Completed', approvedAt: '2026-02-02T00:00:00.000Z', approvedAtSource: 'end-date', version: 3 }),
    ]) });
    expect(r.restores.map((x) => x.id)).toEqual(['a']);
    expect(r.skipped).toEqual([{ id: 'b', why: 'changed since the apply' }]);
    expect(decideClosedAtRollback({ manifest: { kind: 'other', pid: 'p' }, state: state([]) }).blocked[0].code).toBe('bad-manifest');
  });
  it('CA-A1 parseArgs', () => {
    expect(parseArgs(['--summary'])).toMatchObject({ summary: true, error: null });
    expect(parseArgs(['p1', '--apply']).error).toMatch(/--expect/);
    expect(parseArgs(['p1', '--apply', '--expect', '0123456789abcdef']).error).toBeNull();
    expect(parseArgs(['a/b']).error).toMatch(/project id/);
  });
});
