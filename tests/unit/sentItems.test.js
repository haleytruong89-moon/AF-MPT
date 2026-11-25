import { describe, it, expect } from 'vitest';
import { recentlyApprovedSent, pendingDeadlineSent, lastDeadlineResolution, deadlineResolutionText, rejectedDeadlineItem } from '../../src/sentItems.js';

const NOW = new Date('2026-12-10T05:00:00.000Z');
const proj = (tasks) => ({ p: { id: 'p', name: 'CRP', programs: [{ id: 'g', name: 'G', workstreams: [{ id: 'w', name: 'W', tasks }] }] } });
const approved = (id, at, by = 'u_me', status = 'Completed') => ({
  id, name: id, status,
  closeRequestHistory: [{ status: 'Approved', requestedByUid: by, decidedBy: 'Ha', decidedByUid: 'u_ha', decidedAt: at }, { status: 'Rejected', requestedByUid: by, decidedAt: '2026-11-01T00:00:00Z' }],
});

describe('wave 4b sent items', () => {
  it('SI-1 MB-9 approved close requests I sent stay 7 days, newest first', () => {
    const projects = proj([
      approved('a', '2026-12-09T00:00:00.000Z'),
      approved('b', '2026-12-04T00:00:00.000Z', 'u_me', 'Dropped'),
      approved('old', '2026-12-02T00:00:00.000Z'),
      approved('other', '2026-12-09T00:00:00.000Z', 'u_other'),
      { ...approved('reopened', '2026-12-09T00:00:00.000Z'), status: 'InProgress' },
      { id: 'rej', status: 'InProgress', closeRequestHistory: [{ status: 'Rejected', requestedByUid: 'u_me', decidedAt: '2026-12-09T00:00:00Z' }] },
    ]);
    expect(recentlyApprovedSent(projects, 'u_me', NOW).map((x) => x.task.id)).toEqual(['a', 'b']);
    expect(recentlyApprovedSent(projects, 'u_me', NOW)[0].entry.decidedBy).toBe('Ha');
    expect(recentlyApprovedSent(projects, null, NOW)).toEqual([]);
  });

  it('SI-2 MB-6 pending deadline requests I sent: by uid, or by name when there is no uid', () => {
    const projects = proj([
      { id: 't1', deadlineRequest: { requestedBy: 'Lan', requestedByUid: 'u_me', requestedAt: '2026-12-05T00:00:00Z', newDate: '2026-12-20' } },
      { id: 't2', deadlineRequest: { requestedBy: 'Lan', requestedAt: '2026-12-01T00:00:00Z', newDate: '2026-12-21' } },
      { id: 't3', deadlineRequest: { requestedBy: 'Minh', requestedByUid: 'u_minh', requestedAt: '2026-12-01T00:00:00Z' } },
      { id: 't4' },
    ]);
    const isMe = (n) => n === 'Lan';
    expect(pendingDeadlineSent(projects, { uid: 'u_me', isMe }).map((x) => x.task.id)).toEqual(['t2', 't1']);
    expect(pendingDeadlineSent(projects, { uid: null, isMe }).map((x) => x.task.id)).toEqual(['t2', 't1']);
  });

  it('SI-3 MB-6 last resolution and its text', () => {
    const task = { deadlineRequestHistory: [
      { status: 'approved', resolvedBy: 'Ha', resolvedAt: '2026-11-01T00:00:00Z' },
      { status: 'rejected', resolvedBy: 'Ha', resolvedAt: '2026-12-03T00:00:00Z', resolverNote: 'Keep the audit date' },
      { status: 'cancelled', resolvedBy: 'Lan', resolvedAt: '2026-12-04T00:00:00Z' },
    ] };
    const last = lastDeadlineResolution(task);
    expect(last.status).toBe('rejected');
    expect(deadlineResolutionText(last, (iso) => iso.slice(0, 10))).toBe('Rejected by Ha on 2026-12-03: Keep the audit date');
    expect(deadlineResolutionText({ status: 'approved', resolvedBy: 'Ha', resolvedAt: '2026-11-01T00:00:00Z' }, (iso) => iso.slice(0, 10))).toBe('Approved by Ha on 2026-11-01');
    expect(lastDeadlineResolution({})).toBeNull();
  });

  it('SI-4 MB-6 a rejection of my request shows 14 days, until I send a new one', () => {
    const rej = (at, o = {}) => ({ id: 't', status: 'InProgress', deadlineRequestHistory: [{ status: 'rejected', requestedBy: 'Lan', requestedByUid: 'u_me', resolvedBy: 'Ha', resolvedAt: at, resolverNote: 'No', newDate: '2026-12-31' }], ...o });
    expect(rejectedDeadlineItem(rej('2026-12-01T00:00:00Z'), { uid: 'u_me', now: NOW })).toEqual({ resolvedBy: 'Ha', resolvedAt: '2026-12-01T00:00:00Z', note: 'No', newDate: '2026-12-31' });
    expect(rejectedDeadlineItem(rej('2026-11-20T00:00:00Z'), { uid: 'u_me', now: NOW })).toBeNull();
    expect(rejectedDeadlineItem(rej('2026-12-01T00:00:00Z', { deadlineRequest: { requestedBy: 'Lan' } }), { uid: 'u_me', now: NOW })).toBeNull();
    expect(rejectedDeadlineItem(rej('2026-12-01T00:00:00Z', { status: 'Completed' }), { uid: 'u_me', now: NOW })).toBeNull();
    expect(rejectedDeadlineItem(rej('2026-12-01T00:00:00Z'), { uid: 'u_other', now: NOW })).toBeNull();
  });
});
