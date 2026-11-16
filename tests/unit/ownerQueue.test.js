import { describe, it, expect } from 'vitest';
import { ownerQueue } from '../../src/ownerQueue.js';

// W3-C3: Owner approvals strip.
const now = new Date('2026-11-16T10:00:00'); // Monday
const roles = { ownerUids: ['u_o'], programs: { pg: { pmUid: 'u_pm' } }, workstreams: { w: { programId: 'pg', leadUid: null } }, tasks: { t1: { programId: 'pg', workstreamId: 'w', picUid: 'u_a' } } };
const proj = (name, { v2 = true, tasks = [], raid = [] } = {}) => ({
  id: name, name, __v2: v2 ? { roles } : undefined,
  programs: [{ id: 'pg', name: 'Prog', raid, workstreams: [{ id: 'w', name: 'WS', tasks }] }],
});
const submitted = { id: 't1', name: 'T1', status: 'Submitted', closeRequest: { submittedAt: '2026-11-10T09:00:00', approverUid: 'u_pm', requestedByUid: 'u_a' } };
const deadline = (status = 'InProgress', requestedAt = '2026-11-13T09:00:00') => ({ id: 't2', name: 'T2', status, deadlineRequest: { requestedAt } });
const raid = { id: 'r1', title: 'Risk', status: 'PendingApproval', createdAt: '2026-11-12T09:00:00' };

describe('W3-C3 ownerQueue', () => {
  it('OQ-1 one item of each kind with working-day waits, sorted longest first', () => {
    const q = ownerQueue({ a: proj('A', { tasks: [submitted, deadline()], raid: [raid] }) }, now);
    expect(q.map((i) => [i.kind, i.waitingDays])).toEqual([['close', 4], ['raid', 2], ['deadline', 1]]);
    expect(q[0].escalated).toBe(true);
  });
  it('OQ-2 a v1 project gives deadline and raid items but no close item', () => {
    const q = ownerQueue({ a: proj('A', { v2: false, tasks: [submitted, deadline()], raid: [raid] }) }, now);
    expect(q.map((i) => i.kind).sort()).toEqual(['deadline', 'raid']);
  });
  it('OQ-3 a stale deadline request on a Completed / Dropped task is excluded', () => {
    expect(ownerQueue({ a: proj('A', { tasks: [deadline('Completed'), { ...deadline('Dropped'), id: 't3' }] }) }, now)).toEqual([]);
  });
  it('OQ-4 missing or invalid date -> 0; ties sorted by project name', () => {
    const q = ownerQueue({
      b: proj('B', { tasks: [deadline('InProgress', 'not a date')] }),
      a: proj('A', { raid: [{ ...raid, createdAt: undefined }] }),
    }, now);
    expect(q.map((i) => [i.project.name, i.waitingDays])).toEqual([['A', 0], ['B', 0]]);
  });
});
