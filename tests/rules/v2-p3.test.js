import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';
import { scenarios, seedScenario, writeScenario } from './p3-scenarios.js';

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
    await assertFails(up(LEAD, T1, { 'blockerResolutions.u2': res(LEAD), 'blockerResolutions.u3': res(LEAD) }));
    await assertFails(up(OWNER, T1, { 'blockerResolutions.u2': res(ASG) }));
    await assertSucceeds(up(OWNER, T1, { 'blockerResolutions.u2': res(OWNER) }));
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
