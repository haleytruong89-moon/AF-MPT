import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteField, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';
import {
  scenarios, seedScenario, writeScenario,
  approvalScenarios, seedApprovalScenario, writeApprovalScenario,
} from './p3-scenarios.js';

// P3 Task 2: task close transitions on a schemaVersion 2 project (Rulings
// P3-1, P3-3, P3-4, P3-6, P3-7, P3-18, P3-20).
//   submit (open -> Submitted + closeRequest), withdraw (requester only),
//   approve (status == outcome, approvedByUid == me, history Approved),
//   reject (-> InProgress, history Rejected with a reason), reassign (PM /
//   Owner, history Reassigned), direct close by a manager who is not the
//   PIC (approvedByUid == me), reopen (manager), never self-approval.
// Fixtures copied from v2-p23.test.js.

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' }; // workspace Owner, no per-project role
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' }; // PM of prg1
const DEPUTY = { uid: 'u_deputy', email: 'deputy@smartosc.com' }; // deputy of prg1
const PM2 = { uid: 'u_pm2', email: 'pm2@smartosc.com' }; // PM of prg2
const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' }; // Sub-PM of p1/w1
const ASG = { uid: 'u_asg', email: 'asg@smartosc.com' }; // PIC of t1
const VIEWER = { uid: 'u_viewer', email: 'viewer@smartosc.com' }; // contributor on tc
const OUTSIDER = { uid: 'u_out', email: 'out@smartosc.com' };

const WS = 'workspaces/main';
const P1 = `${WS}/projects/p1`; // schemaVersion 2
const T1 = `${P1}/tasks/t1`;

const programMeta = {
  prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: DEPUTY.uid, start: null, end: null },
  prg2: { name: 'Program 2', order: 1, pmUid: PM2.uid, deputyUid: null, start: null, end: null },
};

const ALL = [PM, DEPUTY, PM2, LEAD, ASG, VIEWER];

const project = (over = {}) => ({
  name: 'P',
  memberIds: ALL.map((u) => u.uid),
  roles: {},
  programs: [],
  programMeta,
  memberUids: ALL.map((u) => u.uid),
  visibility: 'restricted',
  schemaVersion: 2,
  ...over,
});

const ws = (pid, programId, leadUid) => ({
  workspaceId: 'main', projectId: pid, programId, name: 'WS', order: 0,
  leadUid, start: null, end: null, version: 1,
});

const task = (over = {}) => ({
  workspaceId: 'main', projectId: 'p1', programId: 'prg1', workstreamId: 'w1', order: 0,
  id: 't', name: 'Task', status: 'InProgress', health: 'Green',
  updates: [{ text: 'old', authorUid: PM.uid }], checkIns: [],
  start: null, end: null, picUid: ASG.uid, contributorUids: [], version: 1, ...over,
});

const member = (email, status = 'active') => ({
  email, displayName: email, aliases: [], department: 'AF', status,
  updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
});

const as = (u) => asUser(u.uid, u.email);
const by = (u, text = 'n') => ({ text, authorUid: u.uid });

// v2 writes: stamp updatedBy, bump version (seeds are at version 1).
const up = async (u, path, data) => updateDoc(doc(await as(u), path), { version: 2, updatedBy: u.uid, ...data });
const put = async (u, path, data) => setDoc(doc(await as(u), path), { updatedBy: u.uid, ...data });

const cr = (requester, approver, over = {}) => ({
  id: 'cr1', outcome: 'Completed', requestedByUid: requester.uid, requestedBy: requester.email,
  approverUid: approver.uid, submittedAt: '2026-10-24T00:00:00Z', prevStatus: 'InProgress', note: '', ...over,
});
const hist = (status, decider, over = {}) => ({
  id: 'cr1', status, decidedByUid: decider.uid, decidedAt: '2026-10-25T00:00:00Z', ...over,
});
const submitted = (requester, approver, over = {}) => task({
  status: 'Submitted', closeRequest: cr(requester, approver), closeRequestHistory: [], ...over,
});

describe('P3 task close transitions', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
    for (const u of ALL.concat([OUTSIDER])) {
      await seedDoc(`${WS}/members/${u.uid}`, member(u.email));
    }
    await seedDoc(P1, project());
    await seedDoc(`${P1}/workstreams/w1`, ws('p1', 'prg1', LEAD.uid));
    await seedDoc(T1, task());
  });
  afterAll(cleanup);

  it('P3-01 ASG submits t1 as Completed naming LEAD: allowed', async () => {
    await assertSucceeds(up(ASG, T1, { status: 'Submitted', closeRequest: cr(ASG, LEAD) }));
  });

  it('P3-02 ASG submit naming ASG / OUTSIDER: denied; naming PM / OWNER: allowed', async () => {
    await assertFails(up(ASG, T1, { status: 'Submitted', closeRequest: cr(ASG, ASG) }));
    await assertFails(up(ASG, T1, { status: 'Submitted', closeRequest: cr(ASG, OUTSIDER) }));
    // Wrong requester / outcome / extra close keys are denied too.
    await assertFails(up(ASG, T1, { status: 'Submitted', closeRequest: cr(PM, LEAD) }));
    await assertFails(up(ASG, T1, { status: 'Submitted', closeRequest: cr(ASG, LEAD, { outcome: 'Submitted' }) }));
    await assertFails(up(ASG, T1, {
      status: 'Submitted', closeRequest: cr(ASG, LEAD), closeRequestHistory: [hist('Approved', ASG)],
    }));
    await assertSucceeds(up(ASG, T1, { status: 'Submitted', closeRequest: cr(ASG, PM) }));
    await seedDoc(T1, task());
    await assertSucceeds(up(ASG, T1, { status: 'Submitted', closeRequest: cr(ASG, OWNER, { outcome: 'Dropped' }) }));
  });

  it('P3-03 ASG sets Completed directly, or Submitted without closeRequest: denied', async () => {
    await assertFails(up(ASG, T1, { status: 'Completed' }));
    await assertFails(up(ASG, T1, { status: 'Completed', approvedByUid: ASG.uid }));
    await assertFails(up(ASG, T1, { status: 'Dropped', approvedByUid: ASG.uid }));
    await assertFails(up(ASG, T1, { status: 'Submitted' }));
    // Open moves still work.
    await assertSucceeds(up(ASG, T1, { status: 'Planned' }));
  });

  it('P3-04 ASG withdraws (-> InProgress, history[0] Withdrawn by ASG): allowed; LEAD withdrawing ASG\'s request: denied', async () => {
    await seedDoc(T1, submitted(ASG, LEAD));
    const w = { status: 'InProgress', closeRequest: null, closeRequestHistory: [hist('Withdrawn', ASG)] };
    await assertFails(up(LEAD, T1, { ...w, closeRequestHistory: [hist('Withdrawn', LEAD)] }));
    // History entry decided by someone else / missing: denied.
    await assertFails(up(ASG, T1, { ...w, closeRequestHistory: [hist('Withdrawn', LEAD)] }));
    await assertFails(up(ASG, T1, { status: 'InProgress', closeRequest: null }));
    await assertSucceeds(up(ASG, T1, w));
    // Back to Planned (prevStatus) is accepted too.
    await seedDoc(T1, submitted(ASG, LEAD));
    await assertSucceeds(up(ASG, T1, { ...w, status: 'Planned' }));
  });

  it('P3-05 LEAD approves (Completed, approvedByUid LEAD, history Approved): allowed; wrong stamp / outcome denied', async () => {
    await seedDoc(T1, submitted(ASG, LEAD));
    const a = { status: 'Completed', closeRequest: null, approvedByUid: LEAD.uid, closeRequestHistory: [hist('Approved', LEAD)] };
    await assertFails(up(LEAD, T1, { ...a, approvedByUid: ASG.uid }));
    await assertFails(up(LEAD, T1, { ...a, status: 'Dropped' }));
    await assertFails(up(LEAD, T1, { ...a, closeRequestHistory: [] }));
    await assertSucceeds(up(LEAD, T1, a));
  });

  it('P3-06 ASG approves own request: denied', async () => {
    await seedDoc(T1, submitted(ASG, LEAD));
    await assertFails(up(ASG, T1, {
      status: 'Completed', closeRequest: null, approvedByUid: ASG.uid, closeRequestHistory: [hist('Approved', ASG)],
    }));
    // Even when the request names the requester (bad data), self-approval is denied.
    await seedDoc(`${P1}/tasks/t5`, submitted(LEAD, LEAD, { picUid: LEAD.uid }));
    await assertFails(up(LEAD, `${P1}/tasks/t5`, {
      status: 'Completed', closeRequest: null, approvedByUid: LEAD.uid, closeRequestHistory: [hist('Approved', LEAD)],
    }));
  });

  it('P3-07 LEAD rejects with reason \'missing evidence\': allowed; reason \'\': denied', async () => {
    await seedDoc(T1, submitted(ASG, LEAD));
    const r = (reason) => ({
      status: 'InProgress', closeRequest: null, closeRequestHistory: [hist('Rejected', LEAD, { reason })],
    });
    await assertFails(up(LEAD, T1, r('')));
    await assertFails(up(LEAD, T1, { ...r('x'), status: 'Planned' }));
    await assertSucceeds(up(LEAD, T1, r('missing evidence')));
  });

  it('P3-08 PM approves a request addressed to LEAD: allowed; DEPUTY approves PM\'s own request: denied; OWNER approves: allowed', async () => {
    const approve = (u) => ({
      status: 'Completed', closeRequest: null, approvedByUid: u.uid, closeRequestHistory: [hist('Approved', u)],
    });
    await seedDoc(T1, submitted(ASG, LEAD));
    await assertSucceeds(up(PM, T1, approve(PM)));
    // PM's own task, submitted to OWNER: DEPUTY (same level) may not decide.
    await seedDoc(`${P1}/tasks/t6`, submitted(PM, OWNER, { picUid: PM.uid }));
    await assertFails(up(DEPUTY, `${P1}/tasks/t6`, approve(DEPUTY)));
    // A PM of another program is not a decider.
    await seedDoc(T1, submitted(ASG, LEAD));
    await assertFails(up(PM2, T1, approve(PM2)));
    await assertSucceeds(up(OWNER, `${P1}/tasks/t6`, approve(OWNER)));
  });

  it('P3-09 LEAD submits own task naming PM: allowed; LEAD direct-close: own denied, ASG\'s with stamp allowed', async () => {
    await seedDoc(`${P1}/tasks/t7`, task({ picUid: LEAD.uid }));
    await assertFails(up(LEAD, `${P1}/tasks/t7`, { status: 'Completed', approvedByUid: LEAD.uid }));
    await assertSucceeds(up(LEAD, `${P1}/tasks/t7`, { status: 'Submitted', closeRequest: cr(LEAD, PM) }));
    // LEAD naming another Sub-PM level (itself) is denied; PM's own -> Owner only.
    await seedDoc(`${P1}/tasks/t8`, task({ picUid: PM.uid }));
    await assertFails(up(PM, `${P1}/tasks/t8`, { status: 'Submitted', closeRequest: cr(PM, DEPUTY) }));
    await assertFails(up(PM, `${P1}/tasks/t8`, { status: 'Submitted', closeRequest: cr(PM, LEAD) }));
    await assertSucceeds(up(PM, `${P1}/tasks/t8`, { status: 'Submitted', closeRequest: cr(PM, OWNER) }));
    // Direct close of ASG's task.
    await assertFails(up(LEAD, T1, { status: 'Completed' }));
    await assertFails(up(LEAD, T1, { status: 'Dropped', approvedByUid: ASG.uid }));
    await assertSucceeds(up(LEAD, T1, { status: 'Completed', approvedByUid: LEAD.uid }));
  });

  it('P3-10 PM reassigns LEAD->DEPUTY with history Reassigned: allowed; ASG reassigns: denied; PM reassigns to ASG: denied', async () => {
    await seedDoc(T1, submitted(ASG, LEAD));
    const ra = (u, to) => ({
      closeRequest: cr(ASG, to), closeRequestHistory: [hist('Reassigned', u)],
    });
    await assertFails(up(ASG, T1, ra(ASG, DEPUTY)));
    await assertFails(up(PM, T1, ra(PM, ASG)));
    await assertFails(up(PM, T1, ra(PM, OUTSIDER)));
    // Changing anything else in the request is denied.
    await assertFails(up(PM, T1, { ...ra(PM, DEPUTY), closeRequest: cr(ASG, DEPUTY, { outcome: 'Dropped' }) }));
    await assertFails(up(PM, T1, { closeRequest: cr(ASG, DEPUTY) }));
    await assertSucceeds(up(PM, T1, ra(PM, DEPUTY)));
  });

  it('P3-11 OWNER sets Completed without approvedByUid: denied; with approvedByUid OWNER: allowed', async () => {
    await assertFails(up(OWNER, T1, { status: 'Completed' }));
    await assertFails(up(OWNER, T1, { status: 'Completed', approvedByUid: PM.uid }));
    await assertSucceeds(up(OWNER, T1, { status: 'Completed', approvedByUid: OWNER.uid }));
  });

  it('P3-12 LEAD reopens Completed -> InProgress: allowed; ASG reopens: denied', async () => {
    await seedDoc(T1, task({ status: 'Completed', approvedByUid: LEAD.uid }));
    await assertFails(up(ASG, T1, { status: 'InProgress' }));
    // Reopen may not rewrite the close history.
    await assertFails(up(LEAD, T1, { status: 'InProgress', closeRequestHistory: [hist('Approved', LEAD)] }));
    // Review round 1: reopen clears the approval stamp.
    await assertFails(up(LEAD, T1, { status: 'InProgress' }));
    await assertFails(up(LEAD, T1, { status: 'InProgress', approvedByUid: null, approvedAt: '2026-10-25' }));
    await assertSucceeds(up(LEAD, T1, { status: 'InProgress', approvedByUid: null, approvedAt: null }));
  });

  it('P3-13 ASG appends an update while Submitted: allowed; ASG changes closeRequest.outcome while Submitted: denied', async () => {
    await seedDoc(T1, submitted(ASG, LEAD));
    await assertSucceeds(up(ASG, T1, { updates: [by(ASG), ...task().updates] }));
    await assertFails(up(ASG, T1, { closeRequest: cr(ASG, LEAD, { outcome: 'Dropped' }), version: 3 }));
    await assertFails(up(ASG, T1, { closeRequest: cr(ASG, PM), version: 3 }));
  });

  it('P3-14 VIEWER (contributor) submits: denied', async () => {
    await seedDoc(`${P1}/tasks/tc`, task({ contributorUids: [VIEWER.uid] }));
    await assertFails(up(VIEWER, `${P1}/tasks/tc`, { status: 'Submitted', closeRequest: cr(VIEWER, LEAD) }));
    // The contributor's append-only update still works.
    await assertSucceeds(up(VIEWER, `${P1}/tasks/tc`, { updates: [by(VIEWER), ...task().updates] }));
  });

  it('P3-15 LEAD creates a task with status Completed: denied; with InProgress: allowed', async () => {
    const t = (status) => task({ id: 'n', status, version: 1 });
    await assertFails(put(LEAD, `${P1}/tasks/n1`, t('Completed')));
    await assertFails(put(LEAD, `${P1}/tasks/n1`, t('Submitted')));
    await assertSucceeds(put(LEAD, `${P1}/tasks/n1`, t('InProgress')));
  });

  // ── Review round 1: no self-credit via picUid / contributorUids ──
  it('P3-16 PM swaps picUid to self and closes in one write: denied', async () => {
    await assertFails(up(PM, T1, { picUid: PM.uid, status: 'Completed', approvedByUid: PM.uid }));
    await assertFails(up(LEAD, T1, { picUid: LEAD.uid, status: 'Dropped', approvedByUid: LEAD.uid }));
    // Another pic + close in one write is denied too (two writes instead).
    await assertFails(up(PM, T1, { picUid: VIEWER.uid, status: 'Completed', approvedByUid: PM.uid }));
  });

  it('P3-17 pic swap after close: PM / LEAD denied; Owner allowed', async () => {
    await seedDoc(T1, task({ status: 'Completed', approvedByUid: LEAD.uid }));
    await assertFails(up(PM, T1, { picUid: PM.uid }));
    await assertFails(up(LEAD, T1, { picUid: LEAD.uid }));
    await seedDoc(T1, task({ status: 'Dropped', approvedByUid: LEAD.uid }));
    await assertFails(up(PM, T1, { picUid: VIEWER.uid }));
    await assertSucceeds(up(OWNER, T1, { picUid: VIEWER.uid }));
  });

  it('P3-18 pic swap on a Submitted task, then approve: denied (alone and in the approve write)', async () => {
    await seedDoc(T1, submitted(ASG, LEAD));
    await assertFails(up(PM, T1, { picUid: PM.uid }));
    await assertFails(up(LEAD, T1, { picUid: LEAD.uid }));
    await assertFails(up(DEPUTY, T1, {
      picUid: PM.uid, status: 'Completed', closeRequest: null, approvedByUid: DEPUTY.uid,
      closeRequestHistory: [hist('Approved', DEPUTY)],
    }));
    // Control: the same approve without the pic change is allowed.
    await assertSucceeds(up(DEPUTY, T1, {
      status: 'Completed', closeRequest: null, approvedByUid: DEPUTY.uid,
      closeRequestHistory: [hist('Approved', DEPUTY)],
    }));
  });

  it('P3-19 Ruling P3-C2: a manager listed as contributor may not direct-close; may submit', async () => {
    await seedDoc(`${P1}/tasks/tk`, task({ contributorUids: [LEAD.uid] }));
    await assertFails(up(LEAD, `${P1}/tasks/tk`, { status: 'Completed', approvedByUid: LEAD.uid }));
    await seedDoc(`${P1}/tasks/tq`, task({ contributorUids: [PM.uid] }));
    await assertFails(up(PM, `${P1}/tasks/tq`, { status: 'Dropped', approvedByUid: PM.uid }));
    // Submitting (to PM) is the way for a contributor-manager.
    await assertSucceeds(up(LEAD, `${P1}/tasks/tk`, { status: 'Submitted', closeRequest: cr(LEAD, PM) }));
  });

  // ── Review round 1: close history protected; status present ──
  it('P3-20 direct close may not touch closeRequest / closeRequestHistory; manager may not delete status', async () => {
    await assertFails(up(LEAD, T1, {
      status: 'Completed', approvedByUid: LEAD.uid, closeRequestHistory: [hist('Approved', LEAD)],
    }));
    await assertFails(up(LEAD, T1, { status: 'Completed', approvedByUid: LEAD.uid, closeRequest: cr(ASG, LEAD) }));
    await assertFails(up(LEAD, T1, { status: deleteField() }));
    await assertFails(up(PM, T1, { status: deleteField() }));
    await assertSucceeds(up(LEAD, T1, { status: 'Planned' }));
  });

  // ── P3 Task 3: append-only blockerResolutions (Ruling P3-8, closes Ruling W) ──
  // (Brief ids P3-20..22 renumbered P3-21..23: P3-20 is taken by review round 1.)
  const res = (u, over = {}) => ({
    resolvedAt: '2026-10-25T00:00:00Z', resolvedBy: u.email, resolution: 'fixed', authorUid: u.uid, ...over,
  });

  it('P3-21 ASG adds blockerResolutions.u1 {resolvedAt, resolvedBy, resolution, authorUid: ASG}: allowed', async () => {
    await assertSucceeds(up(ASG, T1, { 'blockerResolutions.u1': res(ASG) }));
    // authorUid of someone else: denied.
    await seedDoc(T1, task());
    await assertFails(up(ASG, T1, { 'blockerResolutions.u1': res(ASG, { authorUid: LEAD.uid }) }));
  });

  it('P3-22 contributor VIEWER adds one with authorUid VIEWER: allowed; with authorUid ASG: denied', async () => {
    await seedDoc(T1, task({ contributorUids: [VIEWER.uid] }));
    await assertFails(up(VIEWER, T1, { 'blockerResolutions.u1': res(VIEWER, { authorUid: ASG.uid }) }));
    await assertSucceeds(up(VIEWER, T1, { 'blockerResolutions.u1': res(VIEWER) }));
    // A non-contributor still cannot write the map.
    await seedDoc(T1, task({ contributorUids: [] }));
    await assertFails(up(VIEWER, T1, { 'blockerResolutions.u1': res(VIEWER) }));
  });

  it('P3-23 ASG adds two keys in one write: denied; ASG edits an existing key: denied; LEAD edits an existing key: allowed', async () => {
    await assertFails(up(ASG, T1, { 'blockerResolutions.u1': res(ASG), 'blockerResolutions.u2': res(ASG) }));
    await seedDoc(T1, task({ blockerResolutions: { u1: res(ASG) } }));
    await assertFails(up(ASG, T1, { 'blockerResolutions.u1': res(ASG, { resolution: 'edited' }) }));
    await assertFails(up(ASG, T1, { blockerResolutions: {} }));
    // Contributor may not remove or edit either.
    await seedDoc(T1, task({ contributorUids: [VIEWER.uid], blockerResolutions: { u1: res(ASG) } }));
    await assertFails(up(VIEWER, T1, { blockerResolutions: { u2: res(VIEWER) } }));
    await seedDoc(T1, task({ blockerResolutions: { u1: res(ASG) } }));
    await assertSucceeds(up(LEAD, T1, { 'blockerResolutions.u1': res(ASG, { resolution: 'edited' }) }));
    // A manager adding two keys at once, or a key authored by someone else: denied (all writers).
    await seedDoc(T1, task({ blockerResolutions: { u1: res(ASG) } }));
    await assertFails(up(LEAD, T1, { 'blockerResolutions.u2': res(LEAD), 'blockerResolutions.u3': res(LEAD) }));
    await assertFails(up(OWNER, T1, { 'blockerResolutions.u2': res(ASG) }));
    await assertSucceeds(up(OWNER, T1, { 'blockerResolutions.u2': res(OWNER) }));
    // Follow-up: clearing the map (null) or deleting the field is denied for LEAD and OWNER too.
    for (const u of [LEAD, OWNER]) {
      await seedDoc(T1, task({ blockerResolutions: { u1: res(ASG) } }));
      await assertFails(up(u, T1, { blockerResolutions: null }));
      await assertFails(up(u, T1, { blockerResolutions: deleteField() }));
      // Paired allow: an edit of the existing key.
      await assertSucceeds(up(u, T1, { 'blockerResolutions.u1': res(ASG, { resolution: `edited by ${u.uid}` }) }));
    }
  });

  // ── Ruling P3-C4: a manager listed as contributor cannot decide that task's close request ──
  it('P3-24 P3-C4: LEAD / PM in contributorUids cannot approve or reject; a non-contributor manager can', async () => {
    const approve = (u) => ({
      status: 'Completed', closeRequest: null, approvedByUid: u.uid, closeRequestHistory: [hist('Approved', u)],
    });
    const reject = (u) => ({
      status: 'InProgress', closeRequest: null, closeRequestHistory: [hist('Rejected', u, { reason: 'no' })],
    });
    await seedDoc(T1, submitted(ASG, LEAD, { contributorUids: [LEAD.uid] }));
    await assertFails(up(LEAD, T1, approve(LEAD)));
    await assertFails(up(LEAD, T1, reject(LEAD)));
    // Dropping self from contributorUids in the same write does not help.
    await assertFails(up(LEAD, T1, { ...approve(LEAD), contributorUids: [] }));
    await assertSucceeds(up(PM, T1, approve(PM)));
    await seedDoc(T1, submitted(ASG, LEAD, { contributorUids: [PM.uid] }));
    await assertFails(up(PM, T1, approve(PM)));
    await assertFails(up(PM, T1, reject(PM)));
    await assertSucceeds(up(LEAD, T1, reject(LEAD)));
  });

  // ── Ruling P3-C5: credit fields frozen after close for non-Owner managers ──
  it('P3-25 P3-C5: PM adds self to contributorUids on a Completed task: denied; on an open task: allowed', async () => {
    await seedDoc(T1, task({ status: 'Completed', approvedByUid: LEAD.uid }));
    await assertFails(up(PM, T1, { contributorUids: [PM.uid] }));
    await assertFails(up(PM, T1, { contributors: ['pm'] }));
    await assertFails(up(LEAD, T1, { pic: 'lead', picEmail: LEAD.email }));
    await assertSucceeds(up(OWNER, T1, { contributorUids: [PM.uid] }));
    await seedDoc(T1, task());
    await assertSucceeds(up(PM, T1, { contributorUids: [PM.uid], contributors: ['pm'] }));
  });

  it('P3-26 P3-C5: DEPUTY approve that also adds self as contributor: denied; DEPUTY adds self on an open task: allowed', async () => {
    await seedDoc(T1, submitted(ASG, LEAD));
    const a = {
      status: 'Completed', closeRequest: null, approvedByUid: DEPUTY.uid,
      closeRequestHistory: [hist('Approved', DEPUTY)],
    };
    await assertFails(up(DEPUTY, T1, { ...a, contributorUids: [DEPUTY.uid] }));
    await assertFails(up(DEPUTY, T1, { ...a, contributors: ['deputy'] }));
    await assertFails(up(DEPUTY, T1, { contributorUids: [DEPUTY.uid] }));
    await seedDoc(T1, task());
    await assertSucceeds(up(DEPUTY, T1, { contributorUids: [DEPUTY.uid] }));
  });

  it('P3-27 P3-C5: creditShares change after close: denied (Owner allowed); direct close may not touch credit fields', async () => {
    const shares = { [PM.uid]: 50, [ASG.uid]: 50 };
    await seedDoc(T1, task({ status: 'Completed', approvedByUid: LEAD.uid }));
    await assertFails(up(PM, T1, { creditShares: shares }));
    await assertFails(up(LEAD, T1, { creditSharesMode: 'manual' }));
    await seedDoc(T1, task({ status: 'Dropped', approvedByUid: LEAD.uid }));
    await assertFails(up(LEAD, T1, { creditShares: shares }));
    // Follow-up, Ruling P3-C6′: this PM write sets manual mode, so the allow
    // on an open task became a deny (manual mode is Owner-only; auto-mode
    // shares stay allowed, see P3-28). The Owner remains allowed.
    await seedDoc(T1, task());
    await assertFails(up(PM, T1, { creditShares: shares, creditSharesMode: 'manual' }));
    await assertSucceeds(up(OWNER, T1, { creditShares: shares, creditSharesMode: 'manual' }));
    // Direct close (from open) with a credit field in the same write: denied.
    await seedDoc(T1, task());
    await assertFails(up(LEAD, T1, { status: 'Completed', approvedByUid: LEAD.uid, contributors: ['lead'] }));
    await assertFails(up(LEAD, T1, { status: 'Completed', approvedByUid: LEAD.uid, pic: 'lead' }));
    await assertFails(up(LEAD, T1, { status: 'Completed', approvedByUid: LEAD.uid, creditShares: shares }));
    await assertSucceeds(up(LEAD, T1, { status: 'Completed', approvedByUid: LEAD.uid }));
  });

  // ── Ruling P3-C6′ (PROVISIONAL): auto-mode shares by managers, manual mode Owner-only ──
  it('P3-28 P3-C6′: auto shares with a contributor edit allowed; manual mode (set, edit, leave) Owner-only', async () => {
    const auto = { [ASG.uid]: 70, [VIEWER.uid]: 30 };
    const manual = { [ASG.uid]: 50, [VIEWER.uid]: 50 };
    // Auto mode (absent or 'auto'): the App recomputes shares from pic + contributors.
    await assertSucceeds(up(PM, T1, { contributorUids: [VIEWER.uid], contributors: ['viewer'], creditShares: auto }));
    await seedDoc(T1, task({ creditSharesMode: 'auto' }));
    await assertSucceeds(up(LEAD, T1, { contributorUids: [VIEWER.uid], creditShares: auto, creditSharesMode: 'auto' }));
    // Switch to manual: PM / LEAD denied, Owner allowed (same write).
    await seedDoc(T1, task());
    await assertFails(up(PM, T1, { creditSharesMode: 'manual' }));
    await assertFails(up(LEAD, T1, { creditShares: manual, creditSharesMode: 'manual' }));
    await assertSucceeds(up(OWNER, T1, { creditShares: manual, creditSharesMode: 'manual' }));
    // Shares edit on a manual task: PM denied (with or without restating the mode), Owner allowed.
    await seedDoc(T1, task({ creditSharesMode: 'manual', creditShares: manual }));
    await assertFails(up(PM, T1, { creditShares: auto }));
    await assertFails(up(PM, T1, { creditShares: auto, creditSharesMode: 'manual' }));
    await assertSucceeds(up(OWNER, T1, { creditShares: auto }));
    // Switch manual -> auto is an Owner decision.
    await seedDoc(T1, task({ creditSharesMode: 'manual', creditShares: manual }));
    await assertFails(up(PM, T1, { creditSharesMode: 'auto', creditShares: auto }));
    await assertFails(up(LEAD, T1, { creditSharesMode: 'auto' }));
    await assertSucceeds(up(OWNER, T1, { creditSharesMode: 'auto', creditShares: auto }));
    // A contributor edit on a manual task that leaves the split alone is not a split change.
    await seedDoc(T1, task({ creditSharesMode: 'manual', creditShares: manual }));
    await assertSucceeds(up(PM, T1, { contributorUids: [VIEWER.uid] }));
    // The Assignee never writes credit fields.
    await seedDoc(T1, task());
    await assertFails(up(ASG, T1, { creditShares: auto }));
  });

  // ── Follow-up: a contributor-manager is not an eligible approver (mirror of P3-C4) ──
  it('P3-29 submit naming a contributor-manager: denied; naming a non-contributor manager: allowed; reassign likewise', async () => {
    await seedDoc(T1, task({ contributorUids: [LEAD.uid] }));
    await assertFails(up(ASG, T1, { status: 'Submitted', closeRequest: cr(ASG, LEAD) }));
    await assertSucceeds(up(ASG, T1, { status: 'Submitted', closeRequest: cr(ASG, PM) }));
    await seedDoc(T1, submitted(ASG, PM, { contributorUids: [LEAD.uid] }));
    const ra = (to) => ({ closeRequest: cr(ASG, to), closeRequestHistory: [hist('Reassigned', PM)] });
    await assertFails(up(PM, T1, ra(LEAD)));
    await assertSucceeds(up(PM, T1, ra(DEPUTY)));
  });
});

// ── Review round 1: realistic executor payloads (full doc set) on the real rules ──
describe('P3 realistic payloads (full task doc, executor shape)', () => {
  beforeEach(resetData);
  afterAll(cleanup);

  for (const s of scenarios) {
    it(`P3-R ${s.name}: allowed`, async () => {
      await seedScenario(seedDoc, s);
      await assertSucceeds(writeScenario(await as(s.actor), s));
    });
  }
});

// ── P3 Task 4: approvals/{reqId} (Rulings P3-2, P3-4, P3-9, P3-20, P3-C3) ──
// plan_import / scope_deadline: requested by the PM of scope.programId or the
// Sub-PM of scope.workstreamId, addressed to an Owner, decided by an Owner.
// mitigation_done: requested by any project reader, addressed to the PM /
// Deputy / an Owner (a Sub-PM of the program only by reassign, with a ws
// claim), decided by the named approver, the PM / Deputy (requester neither)
// or an Owner. Never the requester, except an Owner (P3-C3). Never deleted.
describe('P3 approvals requests', () => {
  const OWNER2 = { uid: 'u_owner2', email: 'owner2@smartosc.com' }; // second Owner (ownerUids only)
  const APR = `${P1}/approvals/r1`;
  const req = (type, requester, approver, over = {}) => ({
    workspaceId: 'main', projectId: 'p1', type,
    scope: type === 'mitigation_done' ? { programId: 'prg1' } : { programId: 'prg1', workstreamId: 'w1' },
    title: 'Request', payload: { k: 1 },
    requestedByUid: requester.uid, requestedBy: requester.email, approverUid: approver.uid,
    status: 'Pending', // createdAt: set by create() (server time) or absent on seeds
    decidedByUid: null, decidedAt: null, reason: null, reassignLog: [],
    version: 1, updatedBy: requester.uid, ...over,
  });
  // Create as u (createdAt = server time unless the data overrides it).
  const create = async (u, data, path = APR) =>
    setDoc(doc(await as(u), path), { createdAt: serverTimestamp(), ...data, updatedBy: u.uid });
  const decide = (u, status, reason) => up(u, APR, {
    status, decidedByUid: u.uid, decidedAt: serverTimestamp(), ...(reason === undefined ? {} : { reason }),
  });
  const withdraw = (u) => up(u, APR, { status: 'Withdrawn', decidedByUid: u.uid, decidedAt: serverTimestamp() });
  const logEntry = (u, from, to, extra = {}) => ({ at: '2026-10-26T00:00:00Z', byUid: u.uid, from: from.uid, to: to.uid, ...extra });
  const reassign = (u, from, to, extra = {}) => up(u, APR, { approverUid: to.uid, reassignLog: [logEntry(u, from, to, extra)] });

  beforeEach(async () => {
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid, OWNER2.uid], workspaceOwner: OWNER.email });
    for (const u of ALL.concat([OUTSIDER, OWNER])) {
      await seedDoc(`${WS}/members/${u.uid}`, member(u.email));
    }
    await seedDoc(P1, project());
    await seedDoc(`${P1}/workstreams/w1`, ws('p1', 'prg1', LEAD.uid));
    await seedDoc(`${P1}/workstreams/w2`, ws('p1', 'prg1', VIEWER.uid)); // prg1, another lead
    await seedDoc(`${P1}/workstreams/w3`, ws('p1', 'prg2', LEAD.uid)); // LEAD's ws in prg2
  });
  afterAll(cleanup);

  it('P3-30 LEAD creates plan_import for w1 approver OWNER: allowed; for wx: denied; approver PM: denied', async () => {
    await assertFails(create(LEAD, req('plan_import', LEAD, OWNER, { scope: { programId: 'prg1', workstreamId: 'w2' } })));
    await assertFails(create(LEAD, req('plan_import', LEAD, OWNER, { scope: { programId: 'prg1', workstreamId: 'w3' } })));
    await assertFails(create(LEAD, req('plan_import', LEAD, OWNER, { scope: { programId: 'prg1', workstreamId: 'nope' } })));
    await assertFails(create(LEAD, req('plan_import', LEAD, PM)));
    await assertFails(create(LEAD, req('plan_import', LEAD, LEAD)));
    // Wrong path fields / version / stamp / requester / type: denied.
    await assertFails(create(LEAD, req('plan_import', LEAD, OWNER, { projectId: 'p9' })));
    await assertFails(create(LEAD, req('plan_import', LEAD, OWNER, { version: 2 })));
    await assertFails(setDoc(doc(await as(LEAD), APR), {
      ...req('plan_import', LEAD, OWNER), createdAt: serverTimestamp(), updatedBy: PM.uid,
    }));
    await assertFails(create(LEAD, req('plan_import', PM, OWNER)));
    await assertFails(create(LEAD, req('task_close', LEAD, OWNER)));
    await assertSucceeds(create(LEAD, req('plan_import', LEAD, OWNER)));
    // LEAD's ws under its own program (prg2): allowed.
    await assertSucceeds(create(LEAD, req('plan_import', LEAD, OWNER, { scope: { programId: 'prg2', workstreamId: 'w3' } }),
      `${P1}/approvals/r2`));
  });

  it('P3-31 PM creates scope_deadline for prg1: allowed; ASG creates plan_import: denied', async () => {
    await assertFails(create(ASG, req('plan_import', ASG, OWNER)));
    await assertFails(create(ASG, req('scope_deadline', ASG, OWNER, { scope: { programId: 'prg1' } })));
    await assertFails(create(PM2, req('scope_deadline', PM2, OWNER, { scope: { programId: 'prg1' } })));
    // PM naming a ws of another program: denied.
    await assertFails(create(PM, req('scope_deadline', PM, OWNER, { scope: { programId: 'prg1', workstreamId: 'w3' } })));
    await assertSucceeds(create(PM, req('scope_deadline', PM, OWNER, { scope: { programId: 'prg1' } })));
    await assertSucceeds(create(DEPUTY, req('scope_deadline', DEPUTY, OWNER, { scope: { programId: 'prg1', workstreamId: 'w2' } }),
      `${P1}/approvals/r2`));
  });

  it('P3-32 ASG creates mitigation_done approver PM: allowed; OUTSIDER / status Approved / client createdAt: denied', async () => {
    await assertFails(create(OUTSIDER, req('mitigation_done', OUTSIDER, PM)));
    await assertFails(create(ASG, req('mitigation_done', ASG, PM, { status: 'Approved' })));
    await assertFails(create(ASG, req('mitigation_done', ASG, PM, { createdAt: '2026-10-24T00:00:00Z' })));
    await assertFails(create(ASG, req('mitigation_done', ASG, PM, { decidedByUid: ASG.uid })));
    await assertFails(create(ASG, req('mitigation_done', ASG, PM, { reassignLog: [{ byUid: ASG.uid }] })));
    // Approver: the PM / Deputy of that program or an Owner; the program must exist.
    await assertFails(create(ASG, req('mitigation_done', ASG, PM2)));
    await assertFails(create(ASG, req('mitigation_done', ASG, LEAD)));
    await assertFails(create(ASG, req('mitigation_done', ASG, PM, { scope: { programId: 'prgX' } })));
    await assertSucceeds(create(ASG, req('mitigation_done', ASG, PM)));
    await assertSucceeds(create(ASG, req('mitigation_done', ASG, OWNER), `${P1}/approvals/r2`));
  });

  it('P3-32b a request on a v1 project: denied; same request on v2: allowed', async () => {
    await seedDoc(P1, project({ schemaVersion: 1 }));
    await assertFails(create(ASG, req('mitigation_done', ASG, DEPUTY)));
    await seedDoc(P1, project());
    await assertSucceeds(create(ASG, req('mitigation_done', ASG, DEPUTY)));
  });

  it('P3-33 OWNER approves plan_import: allowed; PM approves plan_import: denied', async () => {
    await seedDoc(APR, req('plan_import', LEAD, OWNER));
    await assertFails(decide(PM, 'Approved'));
    await assertFails(decide(LEAD, 'Approved'));
    await assertFails(decide(DEPUTY, 'Rejected', 'no'));
    // Stamp = caller and server time.
    await assertFails(up(OWNER, APR, { status: 'Approved', decidedByUid: PM.uid, decidedAt: serverTimestamp() }));
    await assertFails(up(OWNER, APR, { status: 'Approved', decidedByUid: OWNER.uid, decidedAt: '2026-10-25T00:00:00Z' }));
    // The payload cannot change in a decision.
    await assertFails(up(OWNER, APR, { status: 'Approved', decidedByUid: OWNER.uid, decidedAt: serverTimestamp(), payload: { k: 2 } }));
    await assertSucceeds(decide(OWNER, 'Approved'));
    // A decided request is final.
    await assertFails(up(OWNER, APR, { version: 3, status: 'Rejected', decidedByUid: OWNER.uid, decidedAt: serverTimestamp(), reason: 'x' }));
  });

  it("P3-34 PM approves ASG's mitigation_done: allowed; ASG own / LEAD: denied; LEAD as reassigned approver: allowed", async () => {
    await seedDoc(APR, req('mitigation_done', ASG, DEPUTY));
    await assertFails(decide(ASG, 'Approved'));
    await assertFails(decide(LEAD, 'Approved'));
    await assertFails(decide(PM2, 'Approved'));
    await assertSucceeds(decide(PM, 'Approved'));
    // LEAD named as approver after a reassign.
    await seedDoc(APR, req('mitigation_done', ASG, LEAD, { reassignLog: [logEntry(PM, PM, LEAD, { viaWorkstreamId: 'w1' })] }));
    await assertSucceeds(decide(LEAD, 'Approved'));
  });

  it('P3-34b PM-requested mitigation_done: DEPUTY / PM denied, OWNER allowed; inactive approver denied', async () => {
    await seedDoc(APR, req('mitigation_done', PM, OWNER));
    await assertFails(decide(DEPUTY, 'Approved'));
    await assertFails(decide(PM, 'Approved'));
    await assertSucceeds(decide(OWNER, 'Approved'));
    await seedDoc(APR, req('mitigation_done', ASG, LEAD));
    await seedDoc(`${WS}/members/${LEAD.uid}`, member(LEAD.email, 'inactive'));
    await assertFails(decide(LEAD, 'Approved'));
    await assertSucceeds(decide(DEPUTY, 'Approved'));
  });

  it('P3-34c P3-C3: an Owner may decide their own request; others may not decide theirs', async () => {
    await seedDoc(APR, req('mitigation_done', OWNER, PM));
    await assertSucceeds(decide(OWNER, 'Approved'));
    await seedDoc(APR, req('mitigation_done', DEPUTY, PM));
    await assertFails(decide(DEPUTY, 'Approved'));
    await assertSucceeds(decide(PM, 'Approved'));
  });

  it('P3-35 reject without reason: denied; with reason: allowed', async () => {
    await seedDoc(APR, req('mitigation_done', ASG, PM));
    await assertFails(decide(PM, 'Rejected'));
    await assertFails(decide(PM, 'Rejected', ''));
    await assertFails(decide(PM, 'Rejected', null));
    await assertFails(decide(PM, 'Pending'));
    await assertSucceeds(decide(PM, 'Rejected', 'Not evidenced'));
    await seedDoc(APR, req('plan_import', LEAD, OWNER));
    await assertFails(decide(OWNER, 'Rejected'));
    await assertSucceeds(decide(OWNER, 'Rejected', 'Split by WS'));
  });

  it('P3-36 requester withdraws Pending: allowed; withdraws Approved: denied; non-requester withdraws: denied', async () => {
    await seedDoc(APR, req('mitigation_done', ASG, PM));
    await assertFails(withdraw(PM));
    await assertFails(withdraw(OWNER));
    await assertFails(up(ASG, APR, { status: 'Withdrawn', decidedByUid: PM.uid, decidedAt: serverTimestamp() }));
    await assertFails(up(ASG, APR, { status: 'Withdrawn', decidedByUid: ASG.uid, decidedAt: serverTimestamp(), title: 'y' }));
    await assertSucceeds(withdraw(ASG));
    await seedDoc(APR, req('mitigation_done', ASG, PM, { status: 'Approved', decidedByUid: PM.uid, decidedAt: '2026-10-25T00:00:00Z' }));
    await assertFails(withdraw(ASG));
    await seedDoc(APR, req('plan_import', LEAD, OWNER));
    await assertSucceeds(withdraw(LEAD));
  });

  it('P3-37 PM reassigns mitigation_done to LEAD with reassignLog+1: allowed; plan_import to PM: denied; to requester: denied', async () => {
    await seedDoc(APR, req('mitigation_done', ASG, PM));
    // LEAD needs a claim: a ws of the request's program that LEAD leads.
    await assertFails(reassign(PM, PM, LEAD));
    await assertFails(reassign(PM, PM, LEAD, { viaWorkstreamId: 'w3' }));
    await assertFails(reassign(PM, PM, LEAD, { viaWorkstreamId: 'w2' }));
    // The log entry names the caller and the from / to approvers; it grows by one.
    await assertFails(reassign(PM, LEAD, LEAD, { viaWorkstreamId: 'w1' }));
    await assertFails(up(PM, APR, { approverUid: LEAD.uid }));
    await assertFails(up(PM, APR, { approverUid: LEAD.uid, reassignLog: [logEntry(OWNER, PM, LEAD, { viaWorkstreamId: 'w1' })] }));
    // Not the PM / an Owner: denied.
    await assertFails(reassign(LEAD, PM, DEPUTY));
    await assertFails(reassign(ASG, PM, DEPUTY));
    // To the requester / someone outside the program: denied.
    await assertFails(reassign(PM, PM, ASG));
    await assertFails(reassign(PM, PM, PM2));
    await assertSucceeds(reassign(PM, PM, LEAD, { viaWorkstreamId: 'w1' }));
    // plan_import: only to an Owner.
    await seedDoc(APR, req('plan_import', LEAD, OWNER));
    await assertFails(reassign(PM, OWNER, PM));
    await assertFails(reassign(OWNER, OWNER, LEAD));
    await assertSucceeds(reassign(PM, OWNER, OWNER2));
  });

  it('P3-37b OWNER reassigns mitigation_done to DEPUTY; a second reassign must keep the first entry', async () => {
    await seedDoc(APR, req('mitigation_done', ASG, PM));
    await assertSucceeds(reassign(OWNER, PM, DEPUTY));
    const first = logEntry(OWNER, PM, DEPUTY);
    const second = logEntry(PM, DEPUTY, OWNER);
    await assertFails(up(PM, APR, { version: 3, approverUid: OWNER.uid, reassignLog: [second] }));
    await assertSucceeds(up(PM, APR, { version: 3, approverUid: OWNER.uid, reassignLog: [second, first] }));
  });

  it('P3-38 OWNER deletes a request: denied; requester edits payload after create: denied', async () => {
    await seedDoc(APR, req('mitigation_done', ASG, PM));
    await assertFails(deleteDoc(doc(await as(OWNER), APR)));
    await assertFails(deleteDoc(doc(await as(ASG), APR)));
    await assertFails(up(ASG, APR, { payload: { k: 2 } }));
    await assertFails(up(ASG, APR, { title: 'changed' }));
    await assertFails(up(OWNER, APR, { payload: { k: 2 } }));
    // Reads: project readers yes, others no; a v1 project no.
    await assertSucceeds(getDoc(doc(await as(VIEWER), APR)));
    await assertFails(getDoc(doc(await as(OUTSIDER), APR)));
    await seedDoc(P1, project({ schemaVersion: 1 }));
    await assertFails(getDoc(doc(await as(VIEWER), APR)));
    await assertFails(withdraw(ASG));
    await seedDoc(P1, project());
    await assertSucceeds(withdraw(ASG));
  });
});

describe('P3 approvals realistic payloads (client shape)', () => {
  beforeEach(resetData);
  afterAll(cleanup);

  for (const s of approvalScenarios) {
    it(`P3-RA ${s.name}: allowed`, async () => {
      await seedApprovalScenario(seedDoc, s);
      await assertSucceeds(writeApprovalScenario(await as(s.actor), s));
    });
  }
});
