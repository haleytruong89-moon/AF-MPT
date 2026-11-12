import { describe, it, expect } from 'vitest';
import {
  canEditRole, pickerPeople, validateRoleChange, rolesAfter, reroutePlan, roleChangeEvent, rowsForRoles,
  scopeNameOf, roleChangeConfirmLines, roleSavedMessage, rerouteFailedMessage,
  focusRoleRows, mindNodeRoleText,
} from '../../src/roleAssign.js';

function mkRoles() {
  return {
    ownerUids: ['o'],
    programs: { p1: { pmUid: 'pm1', deputyUid: 'd1' }, p2: { pmUid: 'pm2', deputyUid: null } },
    workstreams: {
      w1: { programId: 'p1', leadUid: 'l1' },
      w2: { programId: 'p1', leadUid: null },
      w3: { programId: 'p2', leadUid: null },
    },
    tasks: {
      t1: { programId: 'p1', workstreamId: 'w1', picUid: 'a', contributorUids: [] },
      t2: { programId: 'p1', workstreamId: 'w2', picUid: 'a', contributorUids: [] },
      t3: { programId: 'p2', workstreamId: 'w3', picUid: 'a', contributorUids: [] },
    },
  };
}
const R = mkRoles();
const sub = (id, approverUid, extra = {}) => ({
  id,
  status: 'Submitted',
  closeRequest: { approverUid, requestedByUid: 'a', outcome: 'Completed' },
  closeRequestHistory: [],
  ...extra,
});
const plan = (change, tasks, isActive) => {
  const after = rolesAfter(R, change);
  return reroutePlan({ before: R, after, change, tasks, isActive });
};

describe('canEditRole', () => {
  const me = (uid, extra = {}) => ({ uid, isOwner: false, readOnly: false, isActive: () => true, ...extra });
  it('owner edits everything', () => {
    for (const k of ['pm', 'deputy', 'lead']) expect(canEditRole(R, me('o', { isOwner: true }), k, 'p1')).toBe(true);
  });
  it('PM cannot edit pm/deputy; can edit lead of own program only', () => {
    expect(canEditRole(R, me('pm1'), 'pm', 'p1')).toBe(false);
    expect(canEditRole(R, me('pm1'), 'deputy', 'p1')).toBe(false);
    expect(canEditRole(R, me('pm1'), 'lead', 'p1')).toBe(true);
    expect(canEditRole(R, me('pm1'), 'lead', 'p2')).toBe(false);
  });
  it('deputy edits lead; lead does not', () => {
    expect(canEditRole(R, me('d1'), 'lead', 'p1')).toBe(true);
    expect(canEditRole(R, me('l1'), 'lead', 'p1')).toBe(false);
  });
  it('inactive PM and readOnly cannot', () => {
    expect(canEditRole(R, me('pm1', { isActive: () => false }), 'lead', 'p1')).toBe(false);
    expect(canEditRole(R, me('o', { isOwner: true, readOnly: true }), 'pm', 'p1')).toBe(false);
    expect(canEditRole(R, me('pm1', { readOnly: true }), 'lead', 'p1')).toBe(false);
  });
});

describe('pickerPeople', () => {
  const dir = [
    { uid: 'u2', displayName: 'Zed', email: 'z@x', status: 'active' },
    { uid: 'u1', displayName: 'Amy', email: 'a@x', status: 'active' },
    { uid: 'u3', displayName: 'Gone', email: 'g@x', status: 'deactivated' },
    { displayName: 'Invite', email: 'i@x', status: 'invited' },
  ];
  it('owner gets all active with uid, sorted', () => {
    expect(pickerPeople({ dirEntries: dir, memberUids: [], isOwner: true }).map((p) => p.uid)).toEqual(['u1', 'u2']);
  });
  it('PM gets only members', () => {
    expect(pickerPeople({ dirEntries: dir, memberUids: ['u2', 'u3'], isOwner: false })).toEqual([{ uid: 'u2', name: 'Zed', email: 'z@x' }]);
  });
});

describe('validateRoleChange', () => {
  it('rejects deputy = pm and pm = deputy', () => {
    expect(validateRoleChange(R, { kind: 'deputy', programId: 'p1', fromUid: 'd1', toUid: 'pm1' })).toBe('PM and Deputy must be different people.');
    expect(validateRoleChange(R, { kind: 'pm', programId: 'p1', fromUid: 'pm1', toUid: 'd1' })).toBe('PM and Deputy must be different people.');
  });
  it('no change', () => {
    expect(validateRoleChange(R, { kind: 'pm', programId: 'p1', fromUid: 'pm1', toUid: 'pm1' })).toBe('No change.');
  });
  it('ok otherwise', () => {
    expect(validateRoleChange(R, { kind: 'pm', programId: 'p1', fromUid: 'pm1', toUid: 'y' })).toBeNull();
    expect(validateRoleChange(R, { kind: 'lead', programId: 'p1', wsId: 'w1', fromUid: 'l1', toUid: null })).toBeNull();
  });
});

describe('rolesAfter', () => {
  it('returns a new object and leaves input untouched', () => {
    const snap = JSON.stringify(R);
    const a = rolesAfter(R, { kind: 'pm', programId: 'p1', fromUid: 'pm1', toUid: 'y' });
    const b = rolesAfter(R, { kind: 'lead', programId: 'p1', wsId: 'w2', fromUid: null, toUid: 'x' });
    expect(a.programs.p1.pmUid).toBe('y');
    expect(b.workstreams.w2.leadUid).toBe('x');
    expect(JSON.stringify(R)).toBe(snap);
  });
});

describe('reroutePlan', () => {
  it('(a) change lead l1 -> x moves request', () => {
    expect(plan({ kind: 'lead', programId: 'p1', wsId: 'w1', fromUid: 'l1', toUid: 'x' }, [sub('t1', 'l1')]))
      .toEqual([{ taskId: 't1', fromUid: 'l1', toUid: 'x' }]);
  });
  it('(b) fill blank lead moves from pm1 to x', () => {
    expect(plan({ kind: 'lead', programId: 'p1', wsId: 'w2', fromUid: null, toUid: 'x' }, [sub('t2', 'pm1')]))
      .toEqual([{ taskId: 't2', fromUid: 'pm1', toUid: 'x' }]);
  });
  it('(c) Reassigned history keeps it', () => {
    const t = sub('t2', 'pm1', { closeRequestHistory: [{ status: 'Reassigned' }] });
    expect(plan({ kind: 'lead', programId: 'p1', wsId: 'w2', fromUid: null, toUid: 'x' }, [t])).toEqual([]);
  });
  it('(d) Reassigned but approver lost the role -> moved', () => {
    const t = sub('t1', 'l1', { closeRequestHistory: [{ status: 'Reassigned' }] });
    expect(plan({ kind: 'lead', programId: 'p1', wsId: 'w1', fromUid: 'l1', toUid: 'x' }, [t]))
      .toEqual([{ taskId: 't1', fromUid: 'l1', toUid: 'x' }]);
  });
  it('(e) new lead is requester -> next eligible; equal to current -> none', () => {
    const t = sub('t2', 'o');
    t.closeRequest.requestedByUid = 'x';
    expect(plan({ kind: 'lead', programId: 'p1', wsId: 'w2', fromUid: null, toUid: 'x' }, [t]))
      .toEqual([{ taskId: 't2', fromUid: 'o', toUid: 'pm1' }]);
    const t2 = sub('t2', 'pm1');
    t2.closeRequest.requestedByUid = 'x';
    expect(plan({ kind: 'lead', programId: 'p1', wsId: 'w2', fromUid: null, toUid: 'x' }, [t2])).toEqual([]);
  });
  it('(f) inactive new approver -> next active', () => {
    expect(plan({ kind: 'lead', programId: 'p1', wsId: 'w2', fromUid: null, toUid: 'x' }, [sub('t2', 'o')], (u) => u !== 'x'))
      .toEqual([{ taskId: 't2', fromUid: 'o', toUid: 'pm1' }]);
  });
  it('(g) out of scope and non-Submitted ignored', () => {
    const tasks = [sub('t3', 'pm2'), sub('t1', 'l1'), { id: 't2', status: 'InProgress', closeRequest: null }];
    expect(plan({ kind: 'lead', programId: 'p1', wsId: 'w2', fromUid: null, toUid: 'x' }, tasks)).toEqual([]);
  });
  it('(h) pm change moves request in ws without lead', () => {
    expect(plan({ kind: 'pm', programId: 'p1', fromUid: 'pm1', toUid: 'y' }, [sub('t2', 'pm1')]))
      .toEqual([{ taskId: 't2', fromUid: 'pm1', toUid: 'y' }]);
  });
});

describe('roleChangeEvent', () => {
  const names = { pm1: 'Lybk', y: 'Trangvk' };
  const nameOf = (u) => names[u] || u;
  it('describes a change', () => {
    const e = roleChangeEvent({ kind: 'pm', programId: 'p1', fromUid: 'pm1', toUid: 'y' }, nameOf, 'CASH OUT');
    expect(e).toEqual({
      type: 'role_changed',
      description: 'Role changed: PM of CASH OUT, Lybk → Trangvk',
      before: { uid: 'pm1' },
      after: { uid: 'y' },
      programId: 'p1',
    });
  });
  it('renders null as dash and lead as Sub-PM', () => {
    const e = roleChangeEvent({ kind: 'lead', programId: 'p1', wsId: 'w2', fromUid: null, toUid: 'y' }, nameOf, 'WS');
    expect(e.description).toBe('Role changed: Sub-PM of WS, — → Trangvk');
    expect(e.before).toEqual({ uid: null });
    expect(e.programId).toBe('p1');
    expect(e.workstreamId).toBe('w2');
    expect(roleChangeEvent({ kind: 'deputy', programId: 'p1', fromUid: 'pm1', toUid: null }, nameOf, 'P').description)
      .toBe('Role changed: Deputy of P, Lybk → —');
  });
});

describe('rowsForRoles', () => {
  it('lists programs then their workstreams in tree order', () => {
    const project = {
      programs: [
        { id: 'p1', name: 'One', workstreams: [{ id: 'w1', name: 'W1' }, { id: 'w2', name: 'W2' }] },
        { id: 'p2', name: 'Two', workstreams: [{ id: 'w3', name: 'W3' }] },
      ],
    };
    expect(rowsForRoles(project, R)).toEqual([
      { kind: 'program', programId: 'p1', name: 'One', pmUid: 'pm1', deputyUid: 'd1' },
      { kind: 'ws', programId: 'p1', wsId: 'w1', name: 'W1', leadUid: 'l1' },
      { kind: 'ws', programId: 'p1', wsId: 'w2', name: 'W2', leadUid: null },
      { kind: 'program', programId: 'p2', name: 'Two', pmUid: 'pm2', deputyUid: null },
      { kind: 'ws', programId: 'p2', wsId: 'w3', name: 'W3', leadUid: null },
    ]);
  });
});

describe('role change messages', () => {
  const names = { pm1: 'Lybk', y: 'Trangvk', x: 'Xuan', o: 'Ha' };
  const nameOf = (u) => names[u] || u;
  const project = { programs: [{ id: 'p1', name: 'CASH OUT', workstreams: [{ id: 'w1', name: 'Payments' }] }] };

  it('scopeNameOf: program for pm / deputy, workstream for lead', () => {
    expect(scopeNameOf(project, { kind: 'pm', programId: 'p1' })).toBe('CASH OUT');
    expect(scopeNameOf(project, { kind: 'lead', programId: 'p1', wsId: 'w1' })).toBe('Payments');
    expect(scopeNameOf(project, { kind: 'lead', programId: 'p1', wsId: 'zz' })).toBe('zz');
  });

  it('roleChangeConfirmLines: role line, moves line, member line', () => {
    const change = { kind: 'pm', programId: 'p1', fromUid: 'pm1', toUid: 'y' };
    expect(roleChangeConfirmLines({ change, nameOf, scopeName: 'CASH OUT' })).toEqual(['PM of CASH OUT: Lybk → Trangvk']);
    expect(roleChangeConfirmLines({
      change, nameOf, scopeName: 'CASH OUT',
      moves: [{ taskId: 't1', fromUid: 'pm1', toUid: 'y' }, { taskId: 't2', fromUid: 'o', toUid: 'y' }],
      addMemberUid: 'y',
    })).toEqual([
      'PM of CASH OUT: Lybk → Trangvk',
      '2 pending request(s) will move to Trangvk.',
      'Trangvk is not a member of this project and will be added.',
    ]);
    expect(roleChangeConfirmLines({ change: { kind: 'lead', programId: 'p1', wsId: 'w1', fromUid: null, toUid: null }, nameOf, scopeName: 'Payments' }))
      .toEqual(['Sub-PM of Payments: — → —']);
  });

  it('roleSavedMessage: names the new person, plain when cleared', () => {
    expect(roleSavedMessage('y', nameOf)).toBe('Saved. Trangvk should reload AF-MPT to get the new permissions.');
    expect(roleSavedMessage(null, nameOf)).toBe('Saved.');
  });

  it('rerouteFailedMessage: count and distinct old approvers', () => {
    expect(rerouteFailedMessage([{ fromUid: 'pm1' }, { fromUid: 'pm1' }], nameOf))
      .toBe('Role saved. 2 pending request(s) still point to Lybk; the PM or Owner can reassign them.');
  });
});

describe('focusRoleRows', () => {
  const rows = [
    { kind: 'program', programId: 'p1' },
    { kind: 'ws', programId: 'p1', wsId: 'w1' },
    { kind: 'ws', programId: 'p1', wsId: 'w2' },
    { kind: 'program', programId: 'p2' },
    { kind: 'ws', programId: 'p2', wsId: 'w3' },
  ];
  it('returns all rows without a focus', () => {
    expect(focusRoleRows(rows, null)).toBe(rows);
  });
  it('keeps one program and its workstreams', () => {
    expect(focusRoleRows(rows, { programId: 'p1' }).map((r) => r.wsId || r.programId)).toEqual(['p1', 'w1', 'w2']);
  });
  it('keeps one workstream with its program row', () => {
    expect(focusRoleRows(rows, { programId: 'p1', wsId: 'w2' }).map((r) => r.wsId || r.programId)).toEqual(['p1', 'w2']);
  });
});

describe('mindNodeRoleText', () => {
  const roles = { programs: { p1: { pmUid: 'u1' }, p2: {} }, workstreams: { w1: { leadUid: 'u2' } } };
  const nameOf = (u) => ({ u1: 'Ha', u2: 'Ly' })[u] || u;
  it('shows PM and Sub-PM names', () => {
    expect(mindNodeRoleText(roles, 'program', 'p1', nameOf)).toBe('PM Ha');
    expect(mindNodeRoleText(roles, 'workstream', 'w1', nameOf)).toBe('Sub-PM Ly');
  });
  it('says when the role is blank', () => {
    expect(mindNodeRoleText(roles, 'program', 'p2', nameOf)).toBe('No PM');
    expect(mindNodeRoleText(roles, 'workstream', 'w9', nameOf)).toBe('No Sub-PM');
  });
  it('is null without roles or for other nodes', () => {
    expect(mindNodeRoleText(null, 'program', 'p1', nameOf)).toBeNull();
    expect(mindNodeRoleText(roles, 'task', 't1', nameOf)).toBeNull();
  });
});
