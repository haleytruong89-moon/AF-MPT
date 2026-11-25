import { describe, it, expect } from 'vitest';
import { managerInbox, approvalEvidence, lastTouch } from '../../src/managerInbox.js';

// Audit 25/11 wave 3: the manager's lens.
const now = new Date('2026-11-25T10:00:00');
const roles = {
  ownerUids: ['u_owner'],
  programs: { g1: { pmUid: 'u_pm', deputyUid: null }, g2: { pmUid: 'u_other' } },
  workstreams: { w1: { programId: 'g1', leadUid: 'u_sub' }, w2: { programId: 'g2', leadUid: null } },
  tasks: {
    late: { programId: 'g1', workstreamId: 'w1', picUid: 'u_a' },
    blocked: { programId: 'g1', workstreamId: 'w1', picUid: 'u_a' },
    sub: { programId: 'g1', workstreamId: 'w1', picUid: 'u_a' },
    fresh: { programId: 'g1', workstreamId: 'w1', picUid: 'u_a' },
    future: { programId: 'g1', workstreamId: 'w1', picUid: 'u_a' },
    other: { programId: 'g2', workstreamId: 'w2', picUid: 'u_a' },
  },
};
const upd = (ts, extra = {}) => ({ timestamp: ts, text: 'note', authorUid: 'u_a', ...extra });
const project = {
  id: 'p', name: 'P', __v2: { roles },
  programs: [
    { id: 'g1', name: 'Finance', workstreams: [{ id: 'w1', name: 'Close', tasks: [
      { id: 'late', name: 'late', status: 'InProgress', start: '2026-11-01', end: '2026-11-20', updates: [upd('2026-11-24T09:00:00')] },
      { id: 'blocked', name: 'blocked', status: 'InProgress', start: '2026-11-01', end: '2026-12-20', updates: [upd('2026-11-24T09:00:00', { isBlocker: true })], deadlineRequest: { newDate: '2026-12-30' } },
      { id: 'sub', name: 'sub', status: 'Submitted', end: '2026-11-20', closeRequest: { approverUid: 'u_sub', submittedAt: '2026-11-21T09:00:00' } },
      { id: 'fresh', name: 'fresh', status: 'Planned', start: '2026-11-01', end: '2026-12-20', updates: [] },
      { id: 'future', name: 'future', status: 'Planned', start: '2026-12-10', end: '2026-12-20', updates: [] },
    ] }] },
    { id: 'g2', name: 'Tax', workstreams: [{ id: 'w2', name: 'VAT', tasks: [{ id: 'other', name: 'other', status: 'InProgress', end: '2026-11-01' }] }] },
  ],
};

describe('managerInbox', () => {
  it('MI-1 PM: overdue, blockers, stale, deadline requests, requests waiting at a Sub-PM; nothing from other programs', () => {
    const m = managerInbox({ p: project }, 'u_pm', now);
    expect(m.managesAny).toBe(true);
    expect(m.onlyLead).toBe(false);
    expect(m.overdue.map((x) => [x.task.id, x.lateDays])).toEqual([['late', 5]]);
    expect(m.blockers.map((x) => x.task.id)).toEqual(['blocked']);
    expect(m.stale.map((x) => [x.task.id, x.daysSinceUpdate])).toEqual([['fresh', null]]);
    expect(m.deadlineRequests.map((x) => x.task.id)).toEqual(['blocked']);
    expect(m.waitingAtOthers.map((x) => x.task.id)).toEqual(['sub']);
  });
  it('MI-2 Sub-PM: same work, but requests named to them are not "waiting at others"', () => {
    const m = managerInbox({ p: project }, 'u_sub', now);
    expect(m.onlyLead).toBe(true);
    expect(m.waitingAtOthers).toEqual([]);
    expect(m.overdue.map((x) => x.task.id)).toEqual(['late']);
  });
  it('MI-3 a member or the Owner-only level manages nothing here', () => {
    expect(managerInbox({ p: project }, 'u_a', now).managesAny).toBe(false);
    expect(managerInbox({ p: project }, 'u_owner', now).managesAny).toBe(false);
  });
  it('MI-4 a blocker I raised myself is not listed', () => {
    const p2 = structuredClone(project);
    p2.programs[0].workstreams[0].tasks[1].updates[0].authorUid = 'u_pm';
    expect(managerInbox({ p: p2 }, 'u_pm', now).blockers).toEqual([]);
  });
});

describe('approvalEvidence / lastTouch', () => {
  it('AE-1 late submission and the newest update', () => {
    const t = { end: '2026-11-20', closeRequest: { submittedAt: '2026-11-23T09:00:00' }, updates: [upd('2026-11-22T09:00:00', { text: 'old' }), upd('2026-11-23T08:00:00', { text: 'final' })] };
    expect(approvalEvidence(t)).toEqual({ due: '2026-11-20', timing: 'submitted 3 days late', lastUpdate: { at: '2026-11-23T08:00:00', text: 'final' } });
    expect(approvalEvidence({ end: '2026-11-25', closeRequest: { submittedAt: '2026-11-23T09:00:00' } }).timing).toBe('submitted on time');
    expect(approvalEvidence({}).timing).toBeNull();
  });
  it('AE-2 lastTouch takes the newest of updates and check-ins', () => {
    expect(lastTouch({ updates: [upd('2026-11-01T00:00:00')], checkIns: [{ timestamp: '2026-11-05T00:00:00' }] })).toBe(Date.parse('2026-11-05T00:00:00'));
    expect(lastTouch({})).toBeNull();
  });
});
