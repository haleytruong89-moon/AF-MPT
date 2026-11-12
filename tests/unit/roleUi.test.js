import { describe, it, expect } from 'vitest';
import { datesWithinWs, canEditTaskDates, uiCaps, myRoleSummary, canEditRaid, canEditDecision, canDeleteRaidOrDecision, isWorkspaceOwner, canDropMove } from '../../src/roleUi.js';

const info = (picUid, extra = {}) => ({ programId: 'p1', workstreamId: 'w1', picUid, contributorUids: [], ...extra });
const roles = {
  ownerUids: ['O'],
  programs: { p1: { pmUid: 'P', deputyUid: 'D' }, p2: { pmUid: 'P2', deputyUid: null } },
  workstreams: {
    w1: { programId: 'p1', leadUid: 'L', start: '2026-01-01', end: '2026-12-31' },
    w2: { programId: 'p2', leadUid: 'L2', start: null, end: null },
    wOrphan: { programId: 'zz', leadUid: 'X', start: null, end: null },
  },
  tasks: { tA: info('A'), tOrphan: { programId: 'zz', workstreamId: 'wOrphan', picUid: 'Q' } },
};
const project = {
  programs: [
    { id: 'p1', name: 'Planning', workstreams: [{ id: 'w1', name: 'FX hedging' }] },
    { id: 'p2', name: 'Reporting', workstreams: [{ id: 'w2', name: 'Monthly pack' }] },
  ],
};
const ALL_TRUE = { programEdit: true, wsAdd: true, wsEdit: true, wsDates: true, wsDelete: true, taskAdd: true, taskEdit: true, wsMove: true, taskMove: true };
const ALL_FALSE = Object.fromEntries(Object.keys(ALL_TRUE).map((k) => [k, false]));
const caps = (uid, over = {}) => uiCaps({ isOwner: false, isV2: true, roles, uid, programId: 'p1', wsId: 'w1', ...over });

describe('datesWithinWs (mirrors rules withinWs)', () => {
  const ws = { start: '2026-01-01', end: '2026-12-31' };
  it('inside, on the bounds, outside', () => {
    expect(datesWithinWs('2026-01-01', '2026-12-31', ws)).toBe(true);
    expect(datesWithinWs('2025-12-31', '2026-06-01', ws)).toBe(false);
    expect(datesWithinWs('2026-06-01', '2027-01-01', ws)).toBe(false);
  });
  it('null ws bound = no limit; null ws dates = no limit', () => {
    expect(datesWithinWs('1999-01-01', '2099-01-01', { start: null, end: null })).toBe(true);
    expect(datesWithinWs('1999-01-01', '2026-06-01', { start: null, end: '2026-12-31' })).toBe(true);
    expect(datesWithinWs('1999-01-01', '2099-01-01', {})).toBe(true);
    expect(datesWithinWs('2027-01-01', '2027-02-01', { start: '2026-01-01', end: null })).toBe(true);
  });
  it('null task date passes', () => {
    expect(datesWithinWs(null, null, ws)).toBe(true);
    expect(datesWithinWs(null, '2027-01-01', ws)).toBe(false);
    expect(datesWithinWs('2025-01-01', null, ws)).toBe(false);
  });
  it('null ws object = no limit', () => {
    expect(datesWithinWs('2026-01-01', '2026-02-01', null)).toBe(true);
  });
});

describe('canEditTaskDates', () => {
  const a = (uid, over = {}) => canEditTaskDates({ isOwner: false, isV2: true, roles, taskId: 'tA', uid, ...over });
  it('owner always', () => {
    expect(a('x', { isOwner: true })).toBe(true);
    expect(a('x', { isOwner: true, isV2: false })).toBe(true);
  });
  it('v2 pm / deputy / lead true; assignee, viewer false', () => {
    expect(a('P')).toBe(true);
    expect(a('D')).toBe(true);
    expect(a('L')).toBe(true);
    expect(a('A')).toBe(false);
    expect(a('V')).toBe(false);
    expect(a('L2')).toBe(false);
  });
  it('v1 non-owner false', () => {
    expect(a('P', { isV2: false })).toBe(false);
  });
});

describe('uiCaps', () => {
  it('v1 or Owner: everything true', () => {
    expect(caps('V', { isV2: false })).toEqual(ALL_TRUE);
    expect(caps('V', { isOwner: true })).toEqual(ALL_TRUE);
  });
  it('v2 PM and Deputy of the program', () => {
    const exp = { ...ALL_FALSE, wsAdd: true, wsEdit: true, wsDelete: true, taskAdd: true, taskEdit: true, wsMove: true, taskMove: true };
    expect(caps('P')).toEqual(exp);
    expect(caps('D')).toEqual(exp);
  });
  it('rules: PM may not change ws dates or program (wsUpdateOk) -> wsDates false', () => {
    expect(caps('P').wsDates).toBe(false);
    expect(caps('P').programEdit).toBe(false);
  });
  it('v2 Sub-PM of the ws: tasks only (no workstream writes, rules ~487)', () => {
    expect(caps('L')).toEqual({ ...ALL_FALSE, taskAdd: true, taskEdit: true, taskMove: true });
  });
  it('v2 Viewer / assignee: all false', () => {
    expect(caps('V')).toEqual(ALL_FALSE);
    expect(caps('A')).toEqual(ALL_FALSE);
  });
  it('PM of another program / Sub-PM of another ws: false', () => {
    expect(caps('P2')).toEqual(ALL_FALSE);
    expect(caps('L2')).toEqual(ALL_FALSE);
  });
  it('program-level scope (no wsId): PM may add tasks, Sub-PM may not', () => {
    expect(caps('P', { wsId: null }).taskAdd).toBe(true);
    expect(caps('L', { wsId: null }).taskAdd).toBe(false);
  });
  it('rules leadOfWs: a Sub-PM whose ws program is not in programMeta has no rights', () => {
    expect(caps('X', { programId: 'zz', wsId: 'wOrphan' })).toEqual(ALL_FALSE);
  });
  it('rules wsInProgram: Sub-PM of a ws in a different program than programId has no task rights', () => {
    expect(caps('L', { programId: 'p2', wsId: 'w1' }).taskAdd).toBe(false);
  });
  it('missing roles: all false on v2', () => {
    expect(uiCaps({ isOwner: false, isV2: true, roles: null, uid: 'P', programId: 'p1', wsId: 'w1' })).toEqual(ALL_FALSE);
  });
});

describe('myRoleSummary', () => {
  it('Owner outranks everything', () => {
    const r = { ...roles, ownerUids: ['P'] };
    expect(myRoleSummary(r, 'P', project)).toEqual({ label: 'Owner', detail: ['Owner', 'PM · Planning'] });
  });
  it('PM', () => {
    expect(myRoleSummary(roles, 'P', project)).toEqual({ label: 'PM · Planning', detail: ['PM · Planning'] });
  });
  it('Deputy', () => {
    expect(myRoleSummary(roles, 'D', project).label).toBe('Deputy · Planning');
  });
  it('Sub-PM', () => {
    expect(myRoleSummary(roles, 'L', project)).toEqual({ label: 'Sub-PM · FX hedging', detail: ['Sub-PM · FX hedging'] });
  });
  it('detail lists every role held; label is the highest', () => {
    const r = { ...roles, workstreams: { ...roles.workstreams, w2: { programId: 'p2', leadUid: 'P', start: null, end: null } } };
    expect(myRoleSummary(r, 'P', project)).toEqual({ label: 'PM · Planning', detail: ['PM · Planning', 'Sub-PM · Monthly pack'] });
  });
  it('Assignee = PIC of a task', () => {
    expect(myRoleSummary(roles, 'A', project)).toEqual({ label: 'Assignee', detail: ['Assignee'] });
  });
  it('Sub-PM who is also assignee: label Sub-PM, detail has both', () => {
    const r = { ...roles, tasks: { ...roles.tasks, tL: info('L') } };
    expect(myRoleSummary(r, 'L', project)).toEqual({ label: 'Sub-PM · FX hedging', detail: ['Sub-PM · FX hedging', 'Assignee'] });
  });
  it('View only', () => {
    expect(myRoleSummary(roles, 'V', project)).toEqual({ label: 'View only', detail: ['View only'] });
    expect(myRoleSummary(null, 'V', project)).toEqual({ label: 'View only', detail: ['View only'] });
    expect(myRoleSummary(roles, null, project).label).toBe('View only');
  });
  it('falls back to the id when the name is unknown', () => {
    expect(myRoleSummary(roles, 'P', { programs: [] }).label).toBe('PM · p1');
  });
});

// Wave 2 R5 (Ruling W2-4): RAID / decisions are edited within one's own program.
describe('canEditRaid / canEditDecision / canDeleteRaidOrDecision', () => {
  // P is PM of p1 and Sub-PM of w2 (in p2) in rMix; decisions carry the stored claim's program.
  const rd = {
    ...roles,
    decisions: { d1: { programId: 'p1' }, d2: { programId: 'p2' }, dNone: { programId: null } },
  };
  const raid = (uid, programId, over = {}) => canEditRaid({ isOwner: false, isV2: true, roles: rd, uid, programId, ...over });
  const dec = (uid, id, over = {}) => canEditDecision({ isOwner: false, isV2: true, roles: rd, uid, decision: { id }, ...over });

  it('Owner and v1: always true', () => {
    expect(raid('V', 'p1', { isOwner: true })).toBe(true);
    expect(raid('V', 'p1', { isV2: false })).toBe(true);
    expect(dec('V', 'dNone', { isOwner: true })).toBe(true);
    expect(dec('V', 'd1', { isV2: false })).toBe(true);
  });
  it('RAID: PM / Deputy of the program, Sub-PM of a ws in it', () => {
    expect(raid('P', 'p1')).toBe(true);
    expect(raid('D', 'p1')).toBe(true);
    expect(raid('L', 'p1')).toBe(true);
    expect(raid('L2', 'p2')).toBe(true);
  });
  it('RAID: a role in another program does not help', () => {
    expect(raid('P', 'p2')).toBe(false);
    expect(raid('L', 'p2')).toBe(false);
    expect(raid('P2', 'p1')).toBe(false);
    expect(raid('X', 'zz')).toBe(false); // ws of a program not in programMeta
    expect(raid('A', 'p1')).toBe(false);
    expect(raid(null, 'p1')).toBe(false);
    expect(raid('P', null)).toBe(false);
  });
  it('RAID: PM of p1 who is also Sub-PM of a ws in p2 edits both', () => {
    const rMix = { ...rd, workstreams: { ...rd.workstreams, w2: { programId: 'p2', leadUid: 'P', start: null, end: null } } };
    expect(canEditRaid({ isOwner: false, isV2: true, roles: rMix, uid: 'P', programId: 'p2' })).toBe(true);
    expect(canEditRaid({ isOwner: false, isV2: true, roles: rMix, uid: 'L2', programId: 'p2' })).toBe(false);
  });
  it('decision: claim on the stored program only', () => {
    expect(dec('P', 'd1')).toBe(true);
    expect(dec('L', 'd1')).toBe(true);
    expect(dec('P2', 'd1')).toBe(false);
    expect(dec('L2', 'd1')).toBe(false);
    expect(dec('L2', 'd2')).toBe(true);
    expect(dec('P', 'd2')).toBe(false);
  });
  it('decision without a stored program (Owner-created / migrated): Owner only', () => {
    expect(dec('P', 'dNone')).toBe(false);
    expect(dec('L', 'dNone')).toBe(false);
  });
  it('decision not saved yet (not in the stored roles): anyone who may create one', () => {
    expect(dec('P2', 'dNew')).toBe(true);
    expect(dec('L', 'dNew')).toBe(true);
    expect(dec('A', 'dNew')).toBe(false);
    expect(dec('X', 'dNew')).toBe(false);
    expect(canEditDecision({ isOwner: false, isV2: true, roles: { ...roles }, uid: 'P', decision: { id: 'd1' } })).toBe(true);
  });
  it('create gate: an empty decision ({}) = "holds any PM / Deputy / Sub-PM role"', () => {
    const create = (uid, over = {}) => canEditDecision({ isOwner: false, isV2: true, roles: rd, uid, decision: {}, ...over });
    expect(create('P')).toBe(true);
    expect(create('D')).toBe(true);
    expect(create('P2')).toBe(true);
    expect(create('L2')).toBe(true);
    expect(create('A')).toBe(false); // Assignee only
    expect(create('V')).toBe(false); // no role
    expect(create('X')).toBe(false); // lead of a ws whose program is not in programMeta
    expect(create(null)).toBe(false);
    expect(create('V', { isOwner: true })).toBe(true);
    expect(create('V', { isV2: false })).toBe(true);
  });
  it('delete: Owner only on v2; v1 unchanged', () => {
    expect(canDeleteRaidOrDecision({ isOwner: true, isV2: true })).toBe(true);
    expect(canDeleteRaidOrDecision({ isOwner: false, isV2: true })).toBe(false);
    expect(canDeleteRaidOrDecision({ isOwner: false, isV2: false })).toBe(true);
  });
});

import { actionDeleteMode } from '../../src/roleUi.js';
describe('actionDeleteMode', () => {
  const act = (extra = {}) => ({ id: 'a1', workstreamId: 'w1', status: 'Pending', ...extra });
  const base = { isOwner: false, isV2: true, roles };
  it('Owner and v1 keep delete', () => {
    expect(actionDeleteMode({ ...base, isOwner: true, uid: 'O', action: act() })).toBe('delete');
    expect(actionDeleteMode({ ...base, isV2: false, uid: 'Z', action: act() })).toBe('delete');
  });
  it('v2 PM, Deputy and Sub-PM cancel', () => {
    for (const uid of ['P', 'D', 'L']) expect(actionDeleteMode({ ...base, uid, action: act() })).toBe('cancel');
  });
  it('v2 PIC, other program, no workstream, or already Cancelled get none', () => {
    expect(actionDeleteMode({ ...base, uid: 'A', action: act() })).toBe('none');
    expect(actionDeleteMode({ ...base, uid: 'P2', action: act() })).toBe('none');
    expect(actionDeleteMode({ ...base, uid: 'P', action: act({ workstreamId: null }) })).toBe('none');
    expect(actionDeleteMode({ ...base, uid: 'P', action: act({ status: 'Cancelled' }) })).toBe('none');
  });
});

describe('isWorkspaceOwner (O1, mirrors rules isOwnerIn)', () => {
  it('uid only', () => expect(isWorkspaceOwner({ ownerUids: ['U'] }, 'U', 'x@smartosc.com')).toBe(true));
  it('email only, case-insensitive, even when ownerUids is empty or lists someone else', () => {
    expect(isWorkspaceOwner({ ownerUids: [], workspaceOwner: 'Hod@SmartOSC.com' }, 'U', 'hod@smartosc.com')).toBe(true);
    expect(isWorkspaceOwner({ ownerUids: ['Z'], workspaceOwner: 'hod@smartosc.com' }, 'U', 'HOD@smartosc.com')).toBe(true);
  });
  it('both', () => expect(isWorkspaceOwner({ ownerUids: ['U'], workspaceOwner: 'a@smartosc.com' }, 'U', 'a@smartosc.com')).toBe(true));
  it('neither / missing data / display-name owner', () => {
    expect(isWorkspaceOwner({ ownerUids: ['Z'], workspaceOwner: 'a@smartosc.com' }, 'U', 'b@smartosc.com')).toBe(false);
    expect(isWorkspaceOwner(null, 'U', 'b@smartosc.com')).toBe(false);
    expect(isWorkspaceOwner({ workspaceOwner: 'Ha Truong' }, 'U', 'Ha Truong')).toBe(false);
    expect(isWorkspaceOwner({ ownerUids: ['U'] }, null, null)).toBe(false);
  });
});

describe('move caps and canDropMove (O2)', () => {
  it('PM / Deputy: ws and task move; Sub-PM: task only; stranger: none', () => {
    expect(caps('P')).toMatchObject({ wsMove: true, taskMove: true });
    expect(caps('D')).toMatchObject({ wsMove: true, taskMove: true });
    expect(caps('L')).toMatchObject({ wsMove: false, taskMove: true });
    expect(caps('V')).toMatchObject({ wsMove: false, taskMove: false });
  });
  const base = { isOwner: false, isV2: true, roles, uid: 'P', kind: 'task', sourcePgId: 'p1', targetPgId: 'p1', targetWsId: 'w1' };
  it('Owner and v1 may drop anywhere', () => {
    expect(canDropMove({ ...base, isOwner: true, uid: 'V', targetPgId: 'p2' })).toBe(true);
    expect(canDropMove({ ...base, isV2: false, uid: 'V', targetPgId: 'p2' })).toBe(true);
  });
  it('PM may not move across programs', () => {
    expect(canDropMove(base)).toBe(true);
    expect(canDropMove({ ...base, targetPgId: 'p2', targetWsId: 'w2' })).toBe(false);
    expect(canDropMove({ ...base, kind: 'ws', targetPgId: 'p2' })).toBe(false);
  });
  it('Sub-PM only into a work stream they lead; never a ws move', () => {
    expect(canDropMove({ ...base, uid: 'L' })).toBe(true);
    expect(canDropMove({ ...base, uid: 'L', targetWsId: 'w9' })).toBe(false);
    expect(canDropMove({ ...base, uid: 'L', kind: 'ws' })).toBe(false);
  });
});
