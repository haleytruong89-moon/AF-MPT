import { describe, it, expect } from 'vitest';
import { workingDaysSince, escalationTargets, approvalBuckets } from '../../src/approvalsInbox.js';

const L = (y, m, d, h = 10) => new Date(y, m - 1, d, h);
const iso = (...a) => L(...a).toISOString();
// 2026-11-06 is a Friday.
const FRI = iso(2026, 11, 6), SAT = iso(2026, 11, 7);

describe('workingDaysSince', () => {
  it('Fri -> next Wed = 3, Fri -> Tue = 2', () => {
    expect(workingDaysSince(FRI, L(2026, 11, 11))).toBe(3);
    expect(workingDaysSince(FRI, L(2026, 11, 10))).toBe(2);
  });
  it('Saturday request counts from Monday', () => {
    expect(workingDaysSince(SAT, L(2026, 11, 11))).toBe(3);
    expect(workingDaysSince(SAT, L(2026, 11, 10))).toBe(2);
  });
  it('same day = 0, and weekend after Friday = 0', () => {
    expect(workingDaysSince(FRI, L(2026, 11, 6, 18))).toBe(0);
    expect(workingDaysSince(FRI, L(2026, 11, 8))).toBe(0);
  });
});

const mkRoles = () => ({
  ownerUids: ['O'],
  programs: { p1: { pmUid: 'P', deputyUid: 'D' } },
  workstreams: { w1: { programId: 'p1', leadUid: 'L' } },
  tasks: {
    t1: { programId: 'p1', workstreamId: 'w1', picUid: 'A', contributorUids: [] },
  },
});
const mkTask = (approverUid, over = {}) => ({
  id: 't1', name: 'T', status: 'Submitted',
  closeRequest: { requestedByUid: 'A', approverUid, requestedAt: FRI, outcome: 'Completed' }, ...over,
});

describe('escalationTargets', () => {
  const R = mkRoles();
  it('lead approver -> PM and Deputy only', () => {
    expect(escalationTargets(R, mkTask('L')).sort()).toEqual(['D', 'P']);
  });
  it('PM approver -> Owners', () => {
    expect(escalationTargets(R, mkTask('P'))).toEqual(['O']);
  });
  it('Owner approver -> []', () => {
    expect(escalationTargets(R, mkTask('O'))).toEqual([]);
  });
  it('excludes requester and PIC', () => {
    const t = mkTask('L'); t.closeRequest.requestedByUid = 'P';
    expect(escalationTargets(R, t)).toEqual(['D']);
    const R2 = mkRoles(); R2.tasks.t1.picUid = 'D';
    expect(escalationTargets(R2, mkTask('L'))).toEqual(['P']);
    const R3 = mkRoles(); R3.tasks.t1.picUid = 'O';
    expect(escalationTargets(R3, mkTask('P'))).toEqual([]);
  });
});

function mkProjects(task, v2 = true) {
  const project = {
    id: 'pr', name: 'PR',
    programs: [{ id: 'p1', name: 'P', workstreams: [{ id: 'w1', name: 'W', tasks: [task, { id: 'x', status: 'Planned' }] }] }],
  };
  if (v2) project.__v2 = { roles: mkRoles() };
  return { pr: project };
}

describe('approvalBuckets', () => {
  it('approver sees it in needsMine, not escalated', () => {
    const b = approvalBuckets(mkProjects(mkTask('L')), 'L', L(2026, 11, 9));
    expect(b.needsMine).toHaveLength(1);
    const it0 = b.needsMine[0];
    expect(it0.task.id).toBe('t1');
    expect(it0.project.id).toBe('pr');
    expect(it0.program.id).toBe('p1');
    expect(it0.workstream.id).toBe('w1');
    expect(it0.waitingDays).toBe(1);
    expect(it0.escalated).toBe(false);
  });
  it('PM sees lead-approved task only after 3 working days, escalated true', () => {
    const p = mkProjects(mkTask('L'));
    expect(approvalBuckets(p, 'P', L(2026, 11, 10)).needsMine).toHaveLength(0);
    const b = approvalBuckets(p, 'P', L(2026, 11, 11));
    expect(b.needsMine).toHaveLength(1);
    expect(b.needsMine[0].escalated).toBe(true);
    expect(b.needsMine[0].waitingDays).toBe(3);
  });
  it('flags escalated on the approver own item once past 3 days', () => {
    const b = approvalBuckets(mkProjects(mkTask('L')), 'L', L(2026, 11, 11));
    expect(b.needsMine[0].escalated).toBe(true);
  });
  it('sent bucket for requester', () => {
    const b = approvalBuckets(mkProjects(mkTask('L')), 'A', L(2026, 11, 9));
    expect(b.sent).toHaveLength(1);
    expect(b.needsMine).toHaveLength(0);
  });
  it('ignores v1 projects and non-Submitted tasks', () => {
    const b = approvalBuckets(mkProjects(mkTask('L'), false), 'L', L(2026, 11, 11));
    expect(b).toEqual({ needsMine: [], sent: [] });
    const b2 = approvalBuckets(mkProjects(mkTask('L', { status: 'InProgress' })), 'L', L(2026, 11, 11));
    expect(b2.needsMine).toHaveLength(0);
  });
  it('sorts by waitingDays desc', () => {
    const t1 = mkTask('L');
    const t2 = { ...mkTask('L'), id: 't1b' }; t2.closeRequest = { ...t2.closeRequest, requestedAt: iso(2026, 11, 9) };
    const R = mkRoles(); R.tasks.t1b = R.tasks.t1;
    const p = mkProjects(t2); p.pr.programs[0].workstreams[0].tasks.unshift(t1);
    p.pr.__v2.roles = R;
    const b = approvalBuckets(p, 'L', L(2026, 11, 11));
    expect(b.needsMine.map((i) => i.task.id)).toEqual(['t1', 't1b']);
  });
});
