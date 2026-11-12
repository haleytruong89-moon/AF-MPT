import { describe, it, expect } from 'vitest';
import {
  managerLevel, directApprover, eligibleApprovers, canCloseDirectly, canDecideClose,
  applyCloseIntent, reassignClose, closeEventsFor, deadlineApprover, canApproveDeadline,
  canActivateRaid, canWriteRaid, canEditCreditSplit, canEditCreditFields,
  mitigationApprover, canDecideApproval, canReassignApproval, approvalReassignTargets,
} from '../../src/closeFlow.js';

// Fixture: Owner O, PM P, Deputy D (program p1), Sub-PM L (ws w1), Assignee A.
const info = (picUid, extra = {}) => ({ programId: 'p1', workstreamId: 'w1', picUid, contributorUids: [], ...extra });
function mkRoles(over = {}) {
  return {
    ownerUids: ['O'],
    programs: { p1: { pmUid: 'P', deputyUid: 'D', start: null, end: null }, p2: { pmUid: 'P2', deputyUid: null, start: null, end: null } },
    workstreams: {
      w1: { programId: 'p1', leadUid: 'L', start: '2026-01-01', end: '2026-12-31' },
      w2: { programId: 'p2', leadUid: 'L2', start: null, end: null },
    },
    tasks: { tA: info('A'), tL: info('L'), tP: info('P'), tD: info('D'), tO: info('O'), tC: info('A', { contributorUids: ['L'] }) },
    ...over,
  };
}
const R = mkRoles();
const NOW = '2026-11-04T09:00:00.000Z';
const me = (uid) => ({ uid, name: `Name ${uid}` });
const task = (id, status, extra = {}) => ({ id, name: `Task ${id}`, status, updates: [], ...extra });
const withRoles = (fn) => mkRoles(fn(mkRoles()));

describe('managerLevel', () => {
  it('owner / pm / lead / null', () => {
    expect(managerLevel(R, 'tA', 'O')).toBe('owner');
    expect(managerLevel(R, 'tA', 'P')).toBe('pm');
    expect(managerLevel(R, 'tA', 'D')).toBe('pm');
    expect(managerLevel(R, 'tA', 'L')).toBe('lead');
    expect(managerLevel(R, 'tA', 'A')).toBe(null);
    expect(managerLevel(R, 'tA', 'L2')).toBe(null);
  });
  it('a lead whose ws program is not in programMeta is no manager (rules leadOfWs)', () => {
    const r = withRoles(() => ({ workstreams: { w1: { programId: 'zz', leadUid: 'L', start: null, end: null } } }));
    expect(managerLevel(r, 'tA', 'L')).toBe(null);
  });
  it('unknown task: owner still owner, others null', () => {
    expect(managerLevel(R, 'nope', 'O')).toBe('owner');
    expect(managerLevel(R, 'nope', 'P')).toBe(null);
  });
});

describe('directApprover', () => {
  it('A -> L', () => expect(directApprover(R, 'tA', 'A')).toBe('L'));
  it('A with no lead -> P', () => {
    const r = withRoles((b) => ({ workstreams: { ...b.workstreams, w1: { ...b.workstreams.w1, leadUid: null } } }));
    expect(directApprover(r, 'tA', 'A')).toBe('P');
  });
  it('A with no lead and no PM -> D, else O', () => {
    const r = withRoles((b) => ({
      workstreams: { ...b.workstreams, w1: { ...b.workstreams.w1, leadUid: null } },
      programs: { ...b.programs, p1: { pmUid: null, deputyUid: 'D', start: null, end: null } },
    }));
    expect(directApprover(r, 'tA', 'A')).toBe('D');
    const r2 = { ...r, programs: { ...r.programs, p1: { pmUid: null, deputyUid: null, start: null, end: null } } };
    expect(directApprover(r2, 'tA', 'A')).toBe('O');
  });
  it('L -> P', () => expect(directApprover(R, 'tL', 'L')).toBe('P'));
  it('P -> O and D -> O', () => {
    expect(directApprover(R, 'tP', 'P')).toBe('O');
    expect(directApprover(R, 'tD', 'D')).toBe('O');
  });
  it('O -> null', () => expect(directApprover(R, 'tO', 'O')).toBe(null));
  it('skips a contributor-manager (C4 / eligibleWith)', () => expect(directApprover(R, 'tC', 'A')).toBe('P'));
  it('no one eligible -> null', () => {
    const r = withRoles((b) => ({ ownerUids: [], programs: { ...b.programs, p1: { pmUid: null, deputyUid: null } },
      workstreams: { ...b.workstreams, w1: { ...b.workstreams.w1, leadUid: null } } }));
    expect(directApprover(r, 'tA', 'A')).toBe(null);
  });
});

describe('eligibleApprovers (mirror of rules eligibleApprover / eligibleWith)', () => {
  it('L requester -> [P, D, O]', () => expect(eligibleApprovers(R, 'tL', 'L')).toEqual(['P', 'D', 'O']));
  it('A requester -> [L, P, D, O]', () => expect(eligibleApprovers(R, 'tA', 'A')).toEqual(['L', 'P', 'D', 'O']));
  it('PM / Deputy requester -> owners only', () => {
    expect(eligibleApprovers(R, 'tP', 'P')).toEqual(['O']);
    expect(eligibleApprovers(R, 'tD', 'D')).toEqual(['O']);
  });
  it('excludes contributor-managers but keeps an Owner contributor', () => {
    const r = withRoles((b) => ({ tasks: { ...b.tasks, tX: info('A', { contributorUids: ['L', 'P', 'O'] }) } }));
    expect(eligibleApprovers(r, 'tX', 'A')).toEqual(['D', 'O']);
  });
  it('excludes a lead whose WS program is not in programMeta (can never decide)', () => {
    const r = withRoles((b) => ({ workstreams: { ...b.workstreams, w1: { ...b.workstreams.w1, programId: 'zz' } } }));
    expect(eligibleApprovers(r, 'tA', 'A')).toEqual(['P', 'D', 'O']);
    expect(directApprover(r, 'tA', 'A')).toBe('P');
  });
  it('unique, never the requester', () => {
    const r = withRoles((b) => ({ ownerUids: ['O', 'P'], programs: { ...b.programs, p1: { pmUid: 'P', deputyUid: 'P' } } }));
    expect(eligibleApprovers(r, 'tA', 'A')).toEqual(['L', 'P', 'O']);
    expect(eligibleApprovers(r, 'tA', 'L')).toEqual(['P', 'O']);
  });
});

describe('canCloseDirectly', () => {
  it('L on A task -> true', () => expect(canCloseDirectly(R, 'tA', 'L')).toBe(true));
  it('L on own task -> false', () => expect(canCloseDirectly(R, 'tL', 'L')).toBe(false));
  it('A -> false', () => expect(canCloseDirectly(R, 'tA', 'A')).toBe(false));
  it('O on own task -> true', () => expect(canCloseDirectly(R, 'tO', 'O')).toBe(true));
  it('P on D task -> true; P on own -> false', () => {
    expect(canCloseDirectly(R, 'tD', 'P')).toBe(true);
    expect(canCloseDirectly(R, 'tP', 'P')).toBe(false);
  });
  it('contributor-manager must submit (C2)', () => expect(canCloseDirectly(R, 'tC', 'L')).toBe(false));
});

describe('canDecideClose (mirror of rules canDecide + Owner branch)', () => {
  const t = { ...task('tA', 'Submitted'), closeRequest: { requestedByUid: 'A', approverUid: 'L', outcome: 'Completed' } };
  it('named approver, PM/Deputy, Owner yes; requester and outsider no', () => {
    expect(canDecideClose(R, t, 'L')).toBe(true);
    expect(canDecideClose(R, t, 'P')).toBe(true);
    expect(canDecideClose(R, t, 'D')).toBe(true);
    expect(canDecideClose(R, t, 'O')).toBe(true);
    expect(canDecideClose(R, t, 'A')).toBe(false);
    expect(canDecideClose(R, t, 'L2')).toBe(false);
  });
  it('PM/Deputy cannot decide the request of the other (pair)', () => {
    const tp = { ...task('tP', 'Submitted'), closeRequest: { requestedByUid: 'P', approverUid: 'O', outcome: 'Completed' } };
    expect(canDecideClose(R, tp, 'D')).toBe(false);
    expect(canDecideClose(R, tp, 'P')).toBe(false);
    expect(canDecideClose(R, tp, 'O')).toBe(true);
  });
  it('a lead not named cannot decide', () => {
    const tx = { ...t, closeRequest: { ...t.closeRequest, approverUid: 'P' } };
    expect(canDecideClose(R, tx, 'L')).toBe(false);
  });
  it('contributor-manager cannot decide (C4), Owner can', () => {
    const r = withRoles((b) => ({ tasks: { ...b.tasks, tA: info('A', { contributorUids: ['L', 'P', 'O'] }) } }));
    expect(canDecideClose(r, t, 'L')).toBe(false);
    expect(canDecideClose(r, t, 'P')).toBe(false);
    expect(canDecideClose(r, t, 'D')).toBe(true);
    expect(canDecideClose(r, t, 'O')).toBe(true);
  });
  it('a named approver who is no longer a manager cannot decide (rules manager branch)', () => {
    const tx = { ...t, closeRequest: { ...t.closeRequest, approverUid: 'L2' } };
    expect(canDecideClose(R, tx, 'L2')).toBe(false);
  });
  it('Owner decides own request (C3); not Submitted -> false', () => {
    const to = { ...task('tO', 'Submitted'), closeRequest: { requestedByUid: 'O', approverUid: 'P', outcome: 'Completed' } };
    expect(canDecideClose(R, to, 'O')).toBe(true);
    expect(canDecideClose(R, task('tA', 'InProgress'), 'O')).toBe(false);
  });
});

// Wave 1 H4 (Ruling W1-1): a non-Owner manager never decides a close request
// on a task they are PIC of (rules eligibleWith / canDecide picUid checks).
describe('H4: no self-approval by a PIC manager (non-Owner)', () => {
  it('the PM who is PIC is not eligible for a Sub-PM request', () => {
    expect(eligibleApprovers(R, 'tP', 'L')).toEqual(['D', 'O']);
    expect(directApprover(R, 'tP', 'L')).toBe('D');
  });
  it('the Deputy / Sub-PM who is PIC is not eligible either', () => {
    expect(eligibleApprovers(R, 'tD', 'L')).toEqual(['P', 'O']);
    expect(eligibleApprovers(R, 'tL', 'A')).toEqual(['P', 'D', 'O']);
  });
  it('an Owner who is PIC stays eligible', () => {
    expect(eligibleApprovers(R, 'tO', 'L')).toEqual(['P', 'D', 'O']);
  });
  it('canDecideClose: PM-PIC named as approver -> false; Deputy / Owner -> true', () => {
    const tp = { ...task('tP', 'Submitted'), closeRequest: { requestedByUid: 'L', approverUid: 'P', outcome: 'Completed' } };
    expect(canDecideClose(R, tp, 'P')).toBe(false);
    expect(canDecideClose(R, tp, 'D')).toBe(true);
    expect(canDecideClose(R, tp, 'O')).toBe(true);
  });
  it('canDecideClose: PM-PIC via the PM branch (Deputy named) -> false', () => {
    const tp = { ...task('tP', 'Submitted'), closeRequest: { requestedByUid: 'L', approverUid: 'D', outcome: 'Completed' } };
    expect(canDecideClose(R, tp, 'P')).toBe(false);
  });
  it('canDecideClose: the PM decides when the PIC is someone else', () => {
    const ta = { ...task('tA', 'Submitted'), closeRequest: { requestedByUid: 'A', approverUid: 'P', outcome: 'Completed' } };
    expect(canDecideClose(R, ta, 'P')).toBe(true);
  });
  it('canDecideClose: Owner who is PIC still decides (W1-1)', () => {
    const to = { ...task('tO', 'Submitted'), closeRequest: { requestedByUid: 'L', approverUid: 'O', outcome: 'Completed' } };
    expect(canDecideClose(R, to, 'O')).toBe(true);
  });
  it('applyCloseIntent: a non-Owner submit with no eligible approver -> no-approver', () => {
    const r0 = withRoles((b) => ({ ownerUids: [], programs: { ...b.programs, p1: { pmUid: 'P', deputyUid: null } } }));
    const r = applyCloseIntent({ roles: r0, oldTask: task('tP', 'InProgress'), nextTask: task('tP', 'Completed'), me: me('P'), now: NOW });
    expect(r.outcome).toBe('no-approver');
    expect(r.steps).toEqual([]);
  });
});

describe('applyCloseIntent', () => {
  const run = (uid, oldTask, nextTask, extra = {}) =>
    applyCloseIntent({ roles: R, oldTask, nextTask, me: me(uid), now: NOW, ...extra });

  it('A sets Completed on an InProgress task -> submit', () => {
    const r = run('A', task('tA', 'InProgress'), task('tA', 'Completed'));
    expect(r.outcome).toBe('submit');
    expect(r.task.status).toBe('Submitted');
    expect(r.task.closeRequest).toMatchObject({ outcome: 'Completed', requestedByUid: 'A', approverUid: 'L', prevStatus: 'InProgress', requestedBy: 'Name A', submittedAt: NOW });
    expect(typeof r.task.closeRequest.id).toBe('string');
    expect(r.task.approvedByUid).toBeUndefined();
    expect(r.steps).toEqual([r.task]);
  });
  it('submit from Planned keeps prevStatus Planned; Dropped outcome', () => {
    const r = run('A', task('tA', 'Planned'), task('tA', 'Dropped'));
    expect(r.task.closeRequest).toMatchObject({ outcome: 'Dropped', prevStatus: 'Planned' });
  });
  it('L approves -> approve, stamped, history', () => {
    const sub = run('A', task('tA', 'InProgress'), task('tA', 'Completed')).task;
    const r = run('L', sub, { ...sub, status: 'Completed' });
    expect(r.outcome).toBe('approve');
    expect(r.task.approvedByUid).toBe('L');
    expect(r.task.approvedAt).toBe(NOW);
    expect(r.task.closedByUid).toBe('A');
    expect(r.task.closeRequest).toBe(null);
    expect(r.task.closeRequestHistory[0]).toMatchObject({
      status: 'Approved', outcome: 'Completed', requestedByUid: 'A', approverUid: 'L', decidedByUid: 'L',
      decidedBy: 'Name L', decidedAt: NOW, reason: null, before: { status: 'Submitted' }, after: { status: 'Completed' },
    });
    expect(r.task.closeRequestHistory).toHaveLength(1);
  });
  it('history is prepended, old entries kept as suffix', () => {
    const old = { id: 'h0', status: 'Rejected' };
    const sub = { ...run('A', task('tA', 'InProgress'), task('tA', 'Completed')).task, closeRequestHistory: [old] };
    const r = run('L', sub, { ...sub, status: 'Completed' });
    expect(r.task.closeRequestHistory).toHaveLength(2);
    expect(r.task.closeRequestHistory[1]).toBe(old);
  });
  it('L sets Dropped on a Completed-outcome request -> denied, task unchanged', () => {
    const sub = run('A', task('tA', 'InProgress'), task('tA', 'Completed')).task;
    const r = run('L', sub, { ...sub, status: 'Dropped' });
    expect(r.outcome).toBe('denied');
    expect(r.task).toBe(sub);
    expect(r.steps).toEqual([]);
  });
  it('L sets InProgress without reason -> needs-reason; with reason -> reject', () => {
    const sub = run('A', task('tA', 'InProgress'), task('tA', 'Completed')).task;
    expect(run('L', sub, { ...sub, status: 'InProgress' }).outcome).toBe('needs-reason');
    expect(run('L', sub, { ...sub, status: 'InProgress' }, { reason: '   ' }).outcome).toBe('needs-reason');
    const r = run('L', sub, { ...sub, status: 'InProgress' }, { reason: 'x' });
    expect(r.outcome).toBe('reject');
    expect(r.task.status).toBe('InProgress');
    expect(r.task.closeRequest).toBe(null);
    expect(r.task.updates[0]).toMatchObject({ text: 'Close request rejected: x', author: 'Name L', authorUid: 'L', timestamp: NOW, isBlocker: false });
    expect(r.task.closeRequestHistory[0]).toMatchObject({ status: 'Rejected', reason: 'x', decidedByUid: 'L', after: { status: 'InProgress' } });
  });
  it('decider choosing Planned is a reject to InProgress', () => {
    const sub = run('A', task('tA', 'Planned'), task('tA', 'Completed')).task;
    const r = run('P', sub, { ...sub, status: 'Planned' }, { reason: 'no' });
    expect(r.outcome).toBe('reject');
    expect(r.task.status).toBe('InProgress');
  });
  it('A sets InProgress on own Submitted task -> withdraw to prevStatus', () => {
    const sub = run('A', task('tA', 'Planned'), task('tA', 'Completed')).task;
    const r = run('A', sub, { ...sub, status: 'InProgress' });
    expect(r.outcome).toBe('withdraw');
    expect(r.task.status).toBe('Planned');
    expect(r.task.closeRequest).toBe(null);
    expect(r.task.closeRequestHistory[0]).toMatchObject({ status: 'Withdrawn', decidedByUid: 'A', after: { status: 'Planned' } });
  });
  it('an outsider changing a Submitted task status -> denied', () => {
    const sub = run('A', task('tA', 'InProgress'), task('tA', 'Completed')).task;
    expect(run('L2', sub, { ...sub, status: 'InProgress' }, { reason: 'x' }).outcome).toBe('denied');
    expect(run('L2', sub, { ...sub, status: 'Completed' }).outcome).toBe('denied');
  });
  it('requester cannot approve own request', () => {
    const sub = run('L', task('tL', 'InProgress'), task('tL', 'Completed')).task;
    expect(sub.closeRequest.approverUid).toBe('P');
    expect(run('L', sub, { ...sub, status: 'Completed' }).outcome).toBe('denied');
  });
  it('L closes A task directly -> direct, stamped', () => {
    const r = run('L', task('tA', 'InProgress'), task('tA', 'Completed'));
    expect(r.outcome).toBe('direct');
    expect(r.task).toMatchObject({ status: 'Completed', approvedByUid: 'L', approvedAt: NOW, closedByUid: 'L' });
    expect(r.task.closeRequest).toBeUndefined();
    expect(r.task.closeRequestHistory).toBeUndefined();
  });
  it('L on own task submits to P; contributor-manager submits', () => {
    expect(run('L', task('tL', 'InProgress'), task('tL', 'Completed')).outcome).toBe('submit');
    const r = run('L', task('tC', 'InProgress'), task('tC', 'Completed'));
    expect(r.outcome).toBe('submit');
    expect(r.task.closeRequest.approverUid).toBe('P');
  });
  it('Owner closes own task directly; never submits', () => {
    const r = run('O', task('tO', 'InProgress'), task('tO', 'Dropped'));
    expect(r.outcome).toBe('direct');
    expect(r.task.approvedByUid).toBe('O');
  });
  it('a non-PIC non-manager cannot submit -> denied', () => {
    expect(run('L2', task('tA', 'InProgress'), task('tA', 'Completed')).outcome).toBe('denied');
  });
  it('raw Submitted without closeRequest -> denied', () => {
    expect(run('A', task('tA', 'InProgress'), task('tA', 'Submitted')).outcome).toBe('denied');
  });
  it('A reopens a Completed task -> denied; L reopens -> reopen clears stamps', () => {
    const done = task('tA', 'Completed', { approvedByUid: 'L', approvedAt: NOW, closedByUid: 'A' });
    expect(run('A', done, { ...done, status: 'InProgress' }).outcome).toBe('denied');
    const r = run('L', done, { ...done, status: 'InProgress' });
    expect(r.outcome).toBe('reopen');
    expect(r.task).toMatchObject({ status: 'InProgress', approvedByUid: null, approvedAt: null, closedByUid: null });
  });
  it('Completed -> Dropped: Owner only', () => {
    const done = task('tA', 'Completed', { approvedByUid: 'L' });
    expect(run('L', done, { ...done, status: 'Dropped' }).outcome).toBe('denied');
    const r = run('O', done, { ...done, status: 'Dropped' });
    expect(r.outcome).toBe('direct');
    expect(r.task.approvedByUid).toBe('O');
  });
  it('Owner approves any request (incl. own) and rejects with reason', () => {
    const sub = run('A', task('tA', 'InProgress'), task('tA', 'Completed')).task;
    expect(run('O', sub, { ...sub, status: 'Completed' }).outcome).toBe('approve');
    expect(run('O', sub, { ...sub, status: 'InProgress' }).outcome).toBe('needs-reason');
  });
  it('open move and non-close edits pass through as unchanged', () => {
    const r1 = run('A', task('tA', 'Planned'), task('tA', 'InProgress'));
    expect(r1.outcome).toBe('unchanged');
    expect(r1.task.status).toBe('InProgress');
    const sub = run('A', task('tA', 'InProgress'), task('tA', 'Completed')).task;
    const next = { ...sub, updates: [{ id: 'u1', text: 'hi' }] };
    const r2 = run('A', sub, next);
    expect(r2.outcome).toBe('unchanged');
    expect(r2.task).toBe(next);
  });
  it('close keys changed without a valid transition -> denied', () => {
    const sub = run('A', task('tA', 'InProgress'), task('tA', 'Completed')).task;
    expect(run('P', sub, { ...sub, closeRequest: { ...sub.closeRequest, approverUid: 'D' } }).outcome).toBe('denied');
    expect(run('A', task('tA', 'InProgress'), { ...task('tA', 'InProgress'), approvedByUid: 'A' }).outcome).toBe('denied');
  });
  it('roles null -> legacy, nextTask unchanged', () => {
    const next = task('tA', 'Completed');
    const r = applyCloseIntent({ roles: null, oldTask: task('tA', 'InProgress'), nextTask: next, me: me('A'), now: NOW });
    expect(r.outcome).toBe('legacy');
    expect(r.task).toBe(next);
  });

  describe("re-applying a result is 'prepared' (CloseControl -> onUpdate -> choke point)", () => {
    const base = task('tA', 'InProgress');
    const sub = run('A', base, task('tA', 'Completed')).task;
    const cases = {
      submit: ['A', base, sub],
      approve: ['L', sub, run('L', sub, { ...sub, status: 'Completed' }).task],
      reject: ['L', sub, run('L', sub, { ...sub, status: 'InProgress' }, { reason: 'x' }).task],
      withdraw: ['A', sub, run('A', sub, { ...sub, status: 'InProgress' }).task],
      reassign: ['P', sub, reassignClose({ roles: R, task: sub, me: me('P'), toUid: 'D', now: NOW })],
      direct: ['L', base, run('L', base, task('tA', 'Completed')).task],
      reopen: ['L', task('tA', 'Completed', { approvedByUid: 'L' }), run('L', task('tA', 'Completed', { approvedByUid: 'L' }), task('tA', 'InProgress', { approvedByUid: 'L' })).task],
    };
    for (const [name, [uid, oldTask, result]] of Object.entries(cases)) {
      it(name, () => {
        const input = structuredClone(result);
        const r = run(uid, oldTask, input);
        expect(r.outcome).toBe('prepared');
        expect(r.task).toEqual(result);
      });
    }
  });

  describe('credit fields never ride with a close (C5) — two steps', () => {
    it('manager direct close + credit edit -> credit step first, then close', () => {
      const oldT = task('tA', 'InProgress', { contributors: [] });
      const r = run('L', oldT, task('tA', 'Completed', { contributors: ['Name X'] }));
      expect(r.outcome).toBe('direct');
      expect(r.steps).toHaveLength(2);
      expect(r.steps[0]).toMatchObject({ status: 'InProgress', contributors: ['Name X'] });
      expect(r.steps[0].approvedByUid).toBeUndefined();
      expect(r.steps[1]).toBe(r.task);
      expect(r.task).toMatchObject({ status: 'Completed', contributors: ['Name X'], approvedByUid: 'L' });
    });
    it('reopen + credit edit -> reopen first, then credit edit', () => {
      const done = task('tA', 'Completed', { approvedByUid: 'L', pic: 'Name A' });
      const r = run('L', done, { ...done, status: 'InProgress', pic: 'Name B' });
      expect(r.outcome).toBe('reopen');
      expect(r.steps).toHaveLength(2);
      expect(r.steps[0]).toMatchObject({ status: 'InProgress', pic: 'Name A', approvedByUid: null });
      expect(r.steps[1]).toMatchObject({ status: 'InProgress', pic: 'Name B', approvedByUid: null });
    });
    it('reject + credit edit -> reject first; approve + credit edit -> denied', () => {
      const sub = run('A', task('tA', 'InProgress', { creditShares: null }), task('tA', 'Completed', { creditShares: null })).task;
      const rj = run('L', sub, { ...sub, status: 'InProgress', creditShares: { a: 100 } }, { reason: 'x' });
      expect(rj.outcome).toBe('reject');
      expect(rj.steps).toHaveLength(2);
      expect(rj.steps[0].creditShares).toBe(null);
      expect(rj.steps[1].creditShares).toEqual({ a: 100 });
      expect(run('L', sub, { ...sub, status: 'Completed', creditShares: { a: 100 } }).outcome).toBe('denied');
    });
    it('Owner: one step', () => {
      const r = run('O', task('tA', 'InProgress', { pic: 'a' }), task('tA', 'Completed', { pic: 'b' }));
      expect(r.outcome).toBe('direct');
      expect(r.steps).toHaveLength(1);
    });
    it('manager submit with a credit edit (task open) stays one step', () => {
      const r = run('L', task('tL', 'InProgress', { contributors: [] }), task('tL', 'Completed', { contributors: ['x'] }));
      expect(r.outcome).toBe('submit');
      expect(r.steps).toHaveLength(1);
    });
  });
});

describe('reassignClose', () => {
  const sub = applyCloseIntent({ roles: R, oldTask: task('tA', 'InProgress'), nextTask: task('tA', 'Completed'), me: me('A'), now: NOW }).task;
  it('P -> D', () => {
    const t = reassignClose({ roles: R, task: sub, me: me('P'), toUid: 'D', now: NOW });
    expect(t.status).toBe('Submitted');
    expect(t.closeRequest).toEqual({ ...sub.closeRequest, approverUid: 'D' });
    expect(t.closeRequestHistory[0]).toMatchObject({ status: 'Reassigned', decidedByUid: 'P', before: { approverUid: 'L' }, after: { approverUid: 'D' } });
  });
  it('A -> null; L (not PM) -> null; Owner ok', () => {
    expect(reassignClose({ roles: R, task: sub, me: me('A'), toUid: 'D', now: NOW })).toBe(null);
    expect(reassignClose({ roles: R, task: sub, me: me('L'), toUid: 'D', now: NOW })).toBe(null);
    expect(reassignClose({ roles: R, task: sub, me: me('O'), toUid: 'P', now: NOW })).not.toBe(null);
  });
  it('target must be eligible and different', () => {
    expect(reassignClose({ roles: R, task: sub, me: me('P'), toUid: 'A', now: NOW })).toBe(null);
    expect(reassignClose({ roles: R, task: sub, me: me('P'), toUid: 'L2', now: NOW })).toBe(null);
    expect(reassignClose({ roles: R, task: sub, me: me('P'), toUid: 'L', now: NOW })).toBe(null);
    expect(reassignClose({ roles: R, task: task('tA', 'InProgress'), me: me('P'), toUid: 'D', now: NOW })).toBe(null);
  });
  it('the requester never reassigns own request (C7 consistency)', () => {
    const subP = applyCloseIntent({ roles: R, oldTask: task('tP', 'InProgress'), nextTask: task('tP', 'Completed'), me: me('P'), now: NOW }).task;
    const r = mkRoles({ ownerUids: ['O', 'O2'] });
    expect(reassignClose({ roles: r, task: subP, me: me('P'), toUid: 'O2', now: NOW })).toBe(null);
  });
});

describe('closeEventsFor', () => {
  const nameOf = (u) => `N(${u})`;
  const run = (uid, o, n, extra = {}) => applyCloseIntent({ roles: R, oldTask: o, nextTask: n, me: me(uid), now: NOW, ...extra }).task;
  const base = task('tA', 'InProgress');
  const sub = run('A', base, task('tA', 'Completed'));
  it('submit', () => {
    const ev = closeEventsFor(base, sub, nameOf);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: 'close_submitted', before: { status: 'InProgress' }, after: { status: 'Submitted' } });
    expect(ev[0].description).toContain('approver');
    expect(ev[0].description).toBe('Submitted "Task tA" as done — approver N(L)');
  });
  it('approve / reject / withdraw / reassign / direct / reopen', () => {
    expect(closeEventsFor(sub, run('L', sub, { ...sub, status: 'Completed' }), nameOf)[0].type).toBe('close_approved');
    const rj = closeEventsFor(sub, run('L', sub, { ...sub, status: 'InProgress' }, { reason: 'late' }), nameOf)[0];
    expect(rj.type).toBe('close_rejected');
    expect(rj.description).toContain('late');
    expect(closeEventsFor(sub, run('A', sub, { ...sub, status: 'InProgress' }), nameOf)[0].type).toBe('close_withdrawn');
    const ra = closeEventsFor(sub, reassignClose({ roles: R, task: sub, me: me('P'), toUid: 'D', now: NOW }), nameOf)[0];
    expect(ra).toMatchObject({ type: 'close_reassigned', before: { approverUid: 'L' }, after: { approverUid: 'D' } });
    expect(closeEventsFor(base, run('L', base, task('tA', 'Dropped')), nameOf)[0]).toMatchObject({ type: 'close_direct', after: { status: 'Dropped' } });
    const done = task('tA', 'Completed', { approvedByUid: 'L' });
    expect(closeEventsFor(done, run('L', done, { ...done, status: 'InProgress' }), nameOf)[0].type).toBe('close_reopened');
  });
  it('no close change -> []', () => {
    expect(closeEventsFor(base, { ...base, updates: [{ id: 'u' }] }, nameOf)).toEqual([]);
    expect(closeEventsFor(base, task('tA', 'Planned'), nameOf)).toEqual([]);
  });
});

describe('deadline routing (P3-10)', () => {
  it('within WS window -> direct manager; outside -> Owner', () => {
    expect(deadlineApprover(R, 'tA', '2026-11-30', 'A')).toBe('L');
    expect(deadlineApprover(R, 'tA', '2027-01-15', 'A')).toBe('O');
    // rules withinWs tests end <= ws.end and start >= ws.start only (no task start = passes).
    expect(deadlineApprover(R, 'tA', '2025-12-31', 'A')).toBe('L');
    expect(deadlineApprover(R, 'tL', '2026-11-30', 'L')).toBe('P');
  });
  it('null bound = no limit', () => {
    const r = withRoles((b) => ({ workstreams: { ...b.workstreams, w1: { ...b.workstreams.w1, start: null, end: null } } }));
    expect(deadlineApprover(r, 'tA', '2030-01-01', 'A')).toBe('L');
  });
  it('Owner requester -> null', () => expect(deadlineApprover(R, 'tO', '2026-11-30', 'O')).toBe(null));
  it('task start before the WS start -> Owner (rules withinWs checks both bounds)', () => {
    expect(deadlineApprover(R, 'tA', '2026-11-30', 'A', '2025-12-01')).toBe('O');
    expect(deadlineApprover(R, 'tA', '2026-11-30', 'A', '2026-02-01')).toBe('L');
    expect(deadlineApprover(R, 'tA', '2026-11-30', 'A', null)).toBe('L');
    const t = task('tA', 'InProgress', { start: '2025-12-01', deadlineRequest: { newDate: '2026-11-30', requestedByUid: 'A' } });
    expect(canApproveDeadline(R, t, 'L')).toBe(false);
    expect(canApproveDeadline(R, t, 'O')).toBe(true);
    expect(canApproveDeadline(R, { ...t, start: '2026-03-01' }, 'L')).toBe(true);
  });
  it('canApproveDeadline', () => {
    const t = (newDate, requestedByUid) => task('tA', 'InProgress', { deadlineRequest: { newDate, requestedByUid, requestedBy: 'Name A' } });
    expect(canApproveDeadline(R, t('2026-11-30', 'A'), 'L')).toBe(true);
    expect(canApproveDeadline(R, t('2026-11-30', 'A'), 'P')).toBe(true);
    expect(canApproveDeadline(R, t('2026-11-30', 'A'), 'O')).toBe(true);
    expect(canApproveDeadline(R, t('2026-11-30', 'A'), 'A')).toBe(false);
    expect(canApproveDeadline(R, t('2026-11-30', 'A'), 'L2')).toBe(false);
    expect(canApproveDeadline(R, t('2027-01-15', 'A'), 'L')).toBe(false);
    expect(canApproveDeadline(R, t('2027-01-15', 'A'), 'O')).toBe(true);
    expect(canApproveDeadline(R, t('2026-11-30', undefined), 'L')).toBe(false);
    expect(canApproveDeadline(R, t('2026-11-30', undefined), 'O')).toBe(true);
    expect(canApproveDeadline(R, task('tA', 'InProgress'), 'O')).toBe(false);
  });
});

describe('RAID (P3-11, Q1)', () => {
  it('canActivateRaid: PM/Deputy of the program or Owner', () => {
    expect(canActivateRaid(R, 'p1', 'P')).toBe(true);
    expect(canActivateRaid(R, 'p1', 'D')).toBe(true);
    expect(canActivateRaid(R, 'p1', 'O')).toBe(true);
    expect(canActivateRaid(R, 'p1', 'L')).toBe(false);
    expect(canActivateRaid(R, 'p1', 'P2')).toBe(false);
  });
  it('canWriteRaid: Owner or any PM/Deputy/lead', () => {
    for (const u of ['O', 'P', 'D', 'L', 'P2', 'L2']) expect(canWriteRaid(R, u)).toBe(true);
    expect(canWriteRaid(R, 'A')).toBe(false);
    expect(canWriteRaid(null, 'O')).toBe(false);
  });
});

describe('credit editors (C5, C6′)', () => {
  it('split editor: Owner only', () => {
    expect(canEditCreditSplit('owner', task('tA', 'Completed'))).toBe(true);
    expect(canEditCreditSplit('pm', task('tA', 'InProgress'))).toBe(false);
    expect(canEditCreditSplit('lead', task('tA', 'InProgress'))).toBe(false);
    expect(canEditCreditSplit(null, task('tA', 'InProgress'))).toBe(false);
  });
  it('credit fields: Owner any status; managers only while open', () => {
    expect(canEditCreditFields('owner', task('tA', 'Submitted'))).toBe(true);
    expect(canEditCreditFields('pm', task('tA', 'InProgress'))).toBe(true);
    expect(canEditCreditFields('lead', task('tA', 'Planned'))).toBe(true);
    for (const s of ['Submitted', 'Completed', 'Dropped']) expect(canEditCreditFields('lead', task('tA', s))).toBe(false);
    expect(canEditCreditFields(null, task('tA', 'InProgress'))).toBe(false);
  });
});

describe('approvals docs helpers (mitigation_done, C7 / C8)', () => {
  const mit = (requestedByUid, approverUid) => ({ type: 'mitigation_done', status: 'Pending', requestedByUid, approverUid, scope: { programId: 'p1' } });
  it('mitigationApprover: PM, else Deputy, else Owner; PM/Deputy requester -> Owner', () => {
    expect(mitigationApprover(R, 'p1', 'A')).toBe('P');
    expect(mitigationApprover(R, 'p1', 'P')).toBe('O');
    expect(mitigationApprover(R, 'p1', 'D')).toBe('O');
    const r = withRoles((b) => ({ programs: { ...b.programs, p1: { pmUid: null, deputyUid: 'D' } } }));
    expect(mitigationApprover(r, 'p1', 'A')).toBe('D');
    expect(mitigationApprover(R, 'p1', 'L')).toBe('P');
  });
  it('mitigationApprover: program not in programMeta -> null', () => {
    expect(mitigationApprover(R, 'nope', 'A')).toBe(null);
    expect(mitigationApprover(R, null, 'A')).toBe(null);
  });
  it('canDecideApproval mirrors approvalDeciderOk', () => {
    expect(canDecideApproval(R, mit('A', 'D'), 'D')).toBe(true);
    expect(canDecideApproval(R, mit('A', 'D'), 'P')).toBe(true);
    expect(canDecideApproval(R, mit('A', 'D'), 'A')).toBe(false);
    expect(canDecideApproval(R, mit('A', 'D'), 'L')).toBe(false);
    expect(canDecideApproval(R, mit('P', 'O'), 'D')).toBe(false);
    expect(canDecideApproval(R, mit('O', 'P'), 'O')).toBe(true);
    expect(canDecideApproval(R, { ...mit('L', 'O'), type: 'plan_import' }, 'P')).toBe(false);
    expect(canDecideApproval(R, { ...mit('L', 'O'), type: 'plan_import' }, 'O')).toBe(true);
    expect(canDecideApproval(R, { ...mit('A', 'D'), status: 'Approved' }, 'O')).toBe(false);
  });
  it('canReassignApproval: PM/Deputy or Owner, never the requester (C7)', () => {
    expect(canReassignApproval(R, mit('A', 'P'), 'P')).toBe(true);
    expect(canReassignApproval(R, mit('A', 'P'), 'O')).toBe(true);
    expect(canReassignApproval(R, mit('A', 'P'), 'L')).toBe(false);
    expect(canReassignApproval(R, mit('P', 'O'), 'P')).toBe(false);
    expect(canReassignApproval(R, mit('O', 'P'), 'O')).toBe(false);
  });
  it('approvalReassignTargets: Sub-PM targets carry viaWorkstreamId; C8 pair excluded', () => {
    expect(approvalReassignTargets(R, mit('A', 'P'))).toEqual([
      { uid: 'D', viaWorkstreamId: null }, { uid: 'L', viaWorkstreamId: 'w1' }, { uid: 'O', viaWorkstreamId: null },
    ]);
    expect(approvalReassignTargets(R, mit('D', 'O'))).toEqual([]);
    expect(approvalReassignTargets(mkRoles({ ownerUids: ['O', 'O2'] }), mit('D', 'O'))).toEqual([{ uid: 'O2', viaWorkstreamId: null }]);
    expect(approvalReassignTargets(mkRoles({ ownerUids: ['O', 'O2'] }), { ...mit('L', 'O'), type: 'scope_deadline' }))
      .toEqual([{ uid: 'O2', viaWorkstreamId: null }]);
  });
});
