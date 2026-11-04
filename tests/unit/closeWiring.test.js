import { describe, it, expect, vi } from 'vitest';
import {
  chokeMessage, isCloseOutcome, directoryByUid, closeIntentFor, runCloseFlow, replaceTask, closeControlModel,
  DENIED_MESSAGE, NEEDS_REASON_MESSAGE,
} from '../../src/closeWiring.js';
import { applyCloseIntent, reassignClose } from '../../src/closeFlow.js';

// Same fixture as closeFlow.test.js: Owner O, PM P, Deputy D (p1), Sub-PM L (w1), Assignee A.
const info = (picUid, extra = {}) => ({ programId: 'p1', workstreamId: 'w1', picUid, contributorUids: [], ...extra });
function mkRoles(over = {}) {
  return {
    ownerUids: ['O'],
    programs: { p1: { pmUid: 'P', deputyUid: 'D', start: null, end: null } },
    workstreams: { w1: { programId: 'p1', leadUid: 'L', start: '2026-01-01', end: '2026-12-31' } },
    tasks: { tA: info('A'), tC: info('A', { contributorUids: ['L'] }) },
    ...over,
  };
}
const R = mkRoles();
const NOW = '2026-11-04T09:00:00.000Z';
const me = (uid) => ({ uid, name: `Name ${uid}` });
const task = (id, status, extra = {}) => ({ id, name: `Task ${id}`, status, updates: [], ...extra });

describe('chokeMessage (verbatim copy)', () => {
  it('denied / needs-reason / submit / others', () => {
    expect(chokeMessage('denied')).toBe("You can't change this task's status — ask your Sub-PM or PM.");
    expect(chokeMessage('denied')).toBe(DENIED_MESSAGE);
    expect(chokeMessage('needs-reason')).toBe('Use Reject to give a reason.');
    expect(chokeMessage('needs-reason')).toBe(NEEDS_REASON_MESSAGE);
    expect(chokeMessage('submit', 'lybk')).toBe('Submitted for approval — lybk will review.');
    expect(chokeMessage('direct')).toBe(null);
    expect(chokeMessage('legacy')).toBe(null);
  });
  it('isCloseOutcome: plain edits and refusals are not close writes', () => {
    for (const o of ['legacy', 'unchanged', 'denied', 'needs-reason']) expect(isCloseOutcome(o)).toBe(false);
    for (const o of ['submit', 'direct', 'approve', 'reject', 'withdraw', 'reopen', 'prepared']) expect(isCloseOutcome(o)).toBe(true);
  });
});

describe('directoryByUid', () => {
  const d = directoryByUid([
    { uid: 'L', email: 'l@x', displayName: 'lybk', status: 'active' },
    { uid: 'P', email: 'p@x', displayName: '', status: 'deactivated' },
    { uid: null, email: 'inv@x', displayName: 'Invite', status: 'active' },
  ]);
  it('nameOf: displayName, else email, else the uid', () => {
    expect(d.nameOf('L')).toBe('lybk');
    expect(d.nameOf('P')).toBe('p@x');
    expect(d.nameOf('ZZ')).toBe('ZZ');
    expect(d.nameOf(null)).toBe('');
  });
  it('isActive: deactivated false, unknown true', () => {
    expect(d.isActive('L')).toBe(true);
    expect(d.isActive('P')).toBe(false);
    expect(d.isActive('ZZ')).toBe(true);
  });
});

describe('closeIntentFor (inactive approver, carry 6)', () => {
  it('skips a deactivated default approver', () => {
    const r = closeIntentFor({ roles: R, oldTask: task('tA', 'InProgress'), nextTask: task('tA', 'Completed'), me: me('A'), now: NOW, isActive: (u) => u !== 'L' });
    expect(r.outcome).toBe('submit');
    expect(r.task.closeRequest.approverUid).toBe('P');
    expect(r.steps[r.steps.length - 1]).toBe(r.task);
  });
  it('keeps the default approver when active; legacy untouched', () => {
    const r = closeIntentFor({ roles: R, oldTask: task('tA', 'InProgress'), nextTask: task('tA', 'Completed'), me: me('A'), now: NOW });
    expect(r.task.closeRequest.approverUid).toBe('L');
    const v1 = closeIntentFor({ roles: null, oldTask: task('tA', 'InProgress'), nextTask: task('tA', 'Completed'), me: me('A'), now: NOW });
    expect(v1.outcome).toBe('legacy');
    expect(v1.task.status).toBe('Completed');
  });
  it('Owner never creates a request for their own task (direct close)', () => {
    const r = closeIntentFor({ roles: R, oldTask: task('tA', 'InProgress'), nextTask: task('tA', 'Completed'), me: me('O'), now: NOW });
    expect(r.outcome).toBe('direct');
    expect(r.task.closeRequest).toBeUndefined();
  });
});

describe('runCloseFlow', () => {
  const base = { me: me('L'), now: NOW, isActive: () => true };
  it('one step: saves once, no re-plan when nothing was flushed', async () => {
    const oldTask = task('tA', 'InProgress');
    const nextTask = task('tA', 'Completed');
    const initial = closeIntentFor({ roles: R, oldTask, nextTask, ...base });
    const saveStep = vi.fn(async () => 'ok');
    const getRoles = vi.fn(() => R);
    const r = await runCloseFlow({ ...base, initial, oldTask, nextTask, getRoles, flush: async () => false, saveStep });
    expect(r).toMatchObject({ status: 'ok', outcome: 'direct' });
    expect(saveStep).toHaveBeenCalledTimes(1);
    expect(saveStep.mock.calls[0][0]).toBe(initial.task);
    expect(getRoles).not.toHaveBeenCalled();
  });
  it('flushed: re-plans from the same old -> next with fresh roles', async () => {
    const oldTask = task('tA', 'InProgress');
    const nextTask = task('tA', 'Completed');
    const initial = closeIntentFor({ roles: R, oldTask, nextTask, ...base }); // direct (L not PIC)
    // The flushed edit made L the PIC: L must submit now.
    const fresh = mkRoles({ tasks: { tA: info('L') } });
    const saveStep = vi.fn(async () => 'ok');
    const r = await runCloseFlow({ ...base, initial, oldTask, nextTask, getRoles: () => fresh, flush: async () => true, saveStep });
    expect(r.outcome).toBe('submit');
    expect(r.task.status).toBe('Submitted');
    expect(r.task.closeRequest.approverUid).toBe('P');
    expect(saveStep).toHaveBeenCalledTimes(1);
  });
  it('flushed and now denied: nothing saved', async () => {
    const oldTask = task('tA', 'InProgress');
    const nextTask = task('tA', 'Completed');
    const initial = closeIntentFor({ roles: R, oldTask, nextTask, ...base });
    const noLead = mkRoles({ workstreams: { w1: { programId: 'p1', leadUid: 'X', start: null, end: null } } });
    const saveStep = vi.fn(async () => 'ok');
    const r = await runCloseFlow({ ...base, initial, oldTask, nextTask, getRoles: () => noLead, flush: async () => true, saveStep });
    expect(r).toMatchObject({ status: 'denied', outcome: 'denied', task: oldTask });
    expect(saveStep).not.toHaveBeenCalled();
  });
  it('credit step then close: two saves in order; the close is re-checked after the credit step (carry 3)', async () => {
    const oldTask = task('tA', 'InProgress', { contributors: [] });
    const nextTask = task('tA', 'Completed', { contributors: ['Name L'] });
    const initial = closeIntentFor({ roles: R, oldTask, nextTask, ...base });
    expect(initial.outcome).toBe('direct');
    expect(initial.steps).toHaveLength(2);
    let roles = R;
    const saved = [];
    const saveStep = async (t) => {
      saved.push(t);
      // The credit step made L a contributor (planner derived contributorUids).
      if (saved.length === 1) roles = mkRoles({ tasks: { tA: info('A', { contributorUids: ['L'] }) } });
      return 'ok';
    };
    const r = await runCloseFlow({ ...base, initial, oldTask, nextTask, getRoles: () => roles, flush: async () => false, saveStep });
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ status: 'InProgress', contributors: ['Name L'] });
    expect(saved[0].approvedByUid).toBeUndefined();
    expect(r.outcome).toBe('submit');
    expect(saved[1]).toMatchObject({ status: 'Submitted', contributors: ['Name L'] });
    expect(saved[1].closeRequest.approverUid).toBe('P');
    expect(r.task).toBe(saved[1]);
  });
  it('credit step then close: still direct when roles allow it', async () => {
    const oldTask = task('tA', 'InProgress', { contributors: [] });
    const nextTask = task('tA', 'Completed', { contributors: ['Name X'] });
    const initial = closeIntentFor({ roles: R, oldTask, nextTask, ...base });
    const saved = [];
    const r = await runCloseFlow({ ...base, initial, oldTask, nextTask, getRoles: () => R, flush: async () => false, saveStep: async (t) => { saved.push(t); return 'ok'; } });
    expect(r.outcome).toBe('direct');
    expect(saved.map((t) => t.status)).toEqual(['InProgress', 'Completed']);
    expect(saved[1]).toMatchObject({ approvedByUid: 'L', contributors: ['Name X'] });
  });
  it('a failed step stops the rest and reports the last saved state', async () => {
    const oldTask = task('tA', 'InProgress', { contributors: [] });
    const nextTask = task('tA', 'Completed', { contributors: ['Name X'] });
    const initial = closeIntentFor({ roles: R, oldTask, nextTask, ...base });
    const saveStep = vi.fn(async () => 'denied');
    const r = await runCloseFlow({ ...base, initial, oldTask, nextTask, getRoles: () => R, flush: async () => false, saveStep });
    expect(r).toMatchObject({ status: 'save-failed', saveStatus: 'denied', task: oldTask });
    expect(saveStep).toHaveBeenCalledTimes(1);
  });
  it('a prepared reject (CloseControl) saves once', async () => {
    const sub = applyCloseIntent({ roles: R, oldTask: task('tA', 'InProgress'), nextTask: task('tA', 'Completed'), me: me('A'), now: NOW }).task;
    const rej = applyCloseIntent({ roles: R, oldTask: sub, nextTask: { ...sub, status: 'InProgress' }, me: me('L'), now: NOW, reason: 'redo' }).task;
    const initial = closeIntentFor({ roles: R, oldTask: sub, nextTask: rej, ...base });
    expect(initial.outcome).toBe('prepared');
    const saveStep = vi.fn(async () => 'ok');
    const r = await runCloseFlow({ ...base, initial, oldTask: sub, nextTask: rej, getRoles: () => R, flush: async () => true, saveStep });
    expect(r.outcome).toBe('prepared');
    expect(saveStep).toHaveBeenCalledWith(rej);
  });
});

describe('replaceTask', () => {
  const p = { id: 'x', programs: [{ id: 'p1', workstreams: [{ id: 'w1', tasks: [task('t1', 'Planned', { closeRequest: 'keep?' }), task('t2', 'Planned')] }] }, { id: 'p2', workstreams: [] }] };
  it('replaces the exact object (absent keys stay absent) without touching others', () => {
    const t1 = task('t1', 'InProgress');
    const out = replaceTask(p, 't1', t1);
    expect(out.programs[0].workstreams[0].tasks[0]).toBe(t1);
    expect('closeRequest' in out.programs[0].workstreams[0].tasks[0]).toBe(false);
    expect(out.programs[0].workstreams[0].tasks[1]).toBe(p.programs[0].workstreams[0].tasks[1]);
    expect(out.programs[1]).toBe(p.programs[1]);
    expect(p.programs[0].workstreams[0].tasks[0].closeRequest).toBe('keep?');
  });
  it('unknown task: same project', () => expect(replaceTask(p, 'nope', task('nope', 'Planned'))).toBe(p));
});

describe('closeControlModel', () => {
  const sub = applyCloseIntent({ roles: R, oldTask: task('tA', 'InProgress'), nextTask: task('tA', 'Completed'), me: me('A'), now: NOW }).task;
  it('open: Assignee gets Submit buttons, Sub-PM direct buttons', () => {
    expect(closeControlModel({ task: task('tA', 'InProgress'), roles: R, me: me('A') }).buttons)
      .toEqual(['Planned', 'InProgress', 'submit-done', 'submit-dropped']);
    expect(closeControlModel({ task: task('tA', 'InProgress'), roles: R, me: me('L') }).buttons)
      .toEqual(['Planned', 'InProgress', 'Completed', 'Dropped']);
  });
  it('a contributor-manager submits (P3-C2)', () => {
    expect(closeControlModel({ task: task('tC', 'Planned'), roles: R, me: me('L') }).buttons).toContain('submit-done');
  });
  it('Submitted: requester Withdraw; approver Approve/Reject; PM Approve/Reject/Reassign', () => {
    const a = closeControlModel({ task: sub, roles: R, me: me('A') });
    expect(a.kind).toBe('submitted');
    expect(a.pending).toEqual({ approverUid: 'L', submittedAt: NOW });
    expect(a.buttons).toEqual(['withdraw']);
    expect(closeControlModel({ task: sub, roles: R, me: me('L') }).buttons).toEqual(['approve', 'reject']);
    const p = closeControlModel({ task: sub, roles: R, me: me('P') });
    expect(p.buttons).toEqual(['approve', 'reject', 'reassign']);
    expect(p.reassignTargets).toEqual(['P', 'D', 'O']);
  });
  it('Reassign targets exclude inactive members and the current approver', () => {
    const p = closeControlModel({ task: sub, roles: R, me: me('P'), isActive: (u) => u !== 'D' });
    expect(p.reassignTargets).toEqual(['P', 'O']);
  });
  it('every reassign target is accepted by reassignClose', () => {
    const p = closeControlModel({ task: sub, roles: R, me: me('O') });
    for (const u of p.reassignTargets) expect(reassignClose({ roles: R, task: sub, me: me('O'), toUid: u, now: NOW })).not.toBe(null);
  });
  it('closed: Reopen for managers only', () => {
    const done = task('tA', 'Completed', { approvedByUid: 'L' });
    expect(closeControlModel({ task: done, roles: R, me: me('L') }).buttons).toEqual(['reopen']);
    expect(closeControlModel({ task: done, roles: R, me: me('A') }).buttons).toEqual([]);
  });
  it('readOnly: no buttons, pill data kept', () => {
    const m = closeControlModel({ task: sub, roles: R, me: me('P'), readOnly: true });
    expect(m.buttons).toEqual([]);
    expect(m.pending.approverUid).toBe('L');
  });
});
