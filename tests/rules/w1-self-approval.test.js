import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, updateDoc } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';
import { OWNER, PM, DEPUTY, LEAD, ASG, P1, realTask, seedScenario } from './p3-scenarios.js';

// Wave 1 H4 (Ruling W1-1): a non-Owner manager (PM / Deputy / Sub-PM) never
// decides a close request on a task they are PIC of.
//   eligibleWith: the task's picUid is never named approver on submit /
//     reassign (non-Owner branch); an Owner stays eligible.
//   canDecide: a non-Owner whose uid is the stored picUid never approves /
//     rejects, whether named (approverUid) or through the PM branch.
//   The Owner branch is unchanged: an Owner still decides / closes a task
//   they are PIC of.
// Fixtures: p3-scenarios.js (realTask = a migrated App task at version 7 with
// one closeRequestHistory entry; prg1 PM / DEPUTY; w1 Sub-PM LEAD).

const T = `${P1}/tasks/tr`;
const base = realTask();

const cr = (requester, approver, over = {}) => ({
  id: 'cr1', outcome: 'Completed', requestedByUid: requester.uid, requestedBy: requester.email,
  approverUid: approver.uid, submittedAt: '2026-11-10T00:00:00Z', prevStatus: 'InProgress', note: '', ...over,
});
const hist = (status, decider, over = {}) => ({
  id: 'cr1', status, decidedByUid: decider.uid, decidedAt: '2026-11-11T00:00:00Z', ...over,
});

// The task with PIC u (optionally Submitted with request c).
const picTask = (u, over = {}) => realTask({ picUid: u.uid, picEmail: u.email, pic: u.email.split('@')[0], ...over });
const submittedPic = (u, c) => picTask(u, { status: 'Submitted', closeRequest: c });

const seed = (t) => seedScenario(seedDoc, { seed: t });
// v2 write on the seeded task: version 7 -> 8, stamped by the caller.
const up = async (u, data) =>
  updateDoc(doc(await asUser(u.uid, u.email), T), { version: base.version + 1, updatedBy: u.uid, ...data });

const approve = (u) => ({
  status: 'Completed', closeRequest: null, approvedByUid: u.uid, approvedAt: '2026-11-11T00:00:00Z',
  closeRequestHistory: [hist('Approved', u), ...base.closeRequestHistory],
});
const reject = (u) => ({
  status: 'InProgress', closeRequest: null,
  closeRequestHistory: [hist('Rejected', u, { reason: 'missing evidence' }), ...base.closeRequestHistory],
});

describe('W1 H4: no self-approval by a PIC manager (non-Owner)', () => {
  beforeEach(async () => {
    await resetData();
  });
  afterAll(cleanup);

  it('W1-H4-01 Sub-PM submits the PM\'s task naming the PM: denied', async () => {
    await seed(picTask(PM));
    await assertFails(up(LEAD, { status: 'Submitted', closeRequest: cr(LEAD, PM) }));
  });

  it('W1-H4-02 Sub-PM submits the PM\'s task naming the Deputy: allowed; naming an Owner: allowed', async () => {
    await seed(picTask(PM));
    await assertSucceeds(up(LEAD, { status: 'Submitted', closeRequest: cr(LEAD, DEPUTY) }));
    await seed(picTask(PM));
    await assertSucceeds(up(LEAD, { status: 'Submitted', closeRequest: cr(LEAD, OWNER) }));
  });

  it('W1-H4-03 PM-PIC named as approver approves / rejects: denied', async () => {
    await seed(submittedPic(PM, cr(LEAD, PM)));
    await assertFails(up(PM, approve(PM)));
    // Reject touches only Assignee keys, so it is also tried through the Assignee branch.
    await assertFails(up(PM, reject(PM)));
  });

  it('W1-H4-04 PM-PIC approves through the PM branch (Deputy named): denied; Deputy approves: allowed', async () => {
    await seed(submittedPic(PM, cr(LEAD, DEPUTY)));
    await assertFails(up(PM, approve(PM)));
    await assertFails(up(PM, reject(PM)));
    await assertSucceeds(up(DEPUTY, approve(DEPUTY)));
  });

  // Seeded state is artificial (the requester is neither the PIC nor a manager): it only isolates
  // the new picUid term, which is what separates the denied approve from the allowed PM approve.
  it('W1-H4-05 Sub-PM-PIC named as approver approves / rejects: denied; PM approves: allowed', async () => {
    await seed(submittedPic(LEAD, cr(ASG, LEAD)));
    await assertFails(up(LEAD, approve(LEAD)));
    await assertFails(up(LEAD, reject(LEAD)));
    await assertSucceeds(up(PM, approve(PM)));
  });

  it('W1-H4-06 PM reassigns to the PIC (Deputy): denied; to an Owner: allowed', async () => {
    await seed(submittedPic(DEPUTY, cr(LEAD, PM)));
    const ra = (to) => ({
      closeRequest: cr(LEAD, to), closeRequestHistory: [hist('Reassigned', PM), ...base.closeRequestHistory],
    });
    await assertFails(up(PM, ra(DEPUTY)));
    await assertSucceeds(up(PM, ra(OWNER)));
  });

  it('W1-H4-06b rollout escape: PM-PIC named approver of a pending request reassigns it to the Deputy / an Owner: allowed; to self: denied', async () => {
    const ra = (to) => ({
      closeRequest: cr(LEAD, to), closeRequestHistory: [hist('Reassigned', PM), ...base.closeRequestHistory],
    });
    await seed(submittedPic(PM, cr(LEAD, PM)));
    await assertFails(up(PM, ra(PM)));
    await assertSucceeds(up(PM, ra(DEPUTY)));
    await seed(submittedPic(PM, cr(LEAD, PM)));
    await assertSucceeds(up(PM, ra(OWNER)));
  });

  it('W1-H4-07 control: the PM decides when the PIC is someone else', async () => {
    await seed(realTask({ status: 'Submitted', closeRequest: cr(ASG, PM) }));
    await assertSucceeds(up(PM, approve(PM)));
  });

  it('W1-H4-08 Owner-PIC approves a request on their own task: still allowed (W1-1)', async () => {
    await seed(submittedPic(OWNER, cr(LEAD, OWNER)));
    await assertSucceeds(up(OWNER, approve(OWNER)));
  });

  it('W1-H4-09 Owner-PIC closes their own open task directly: still allowed (W1-1)', async () => {
    await seed(picTask(OWNER));
    await assertSucceeds(up(OWNER, { status: 'Completed', approvedByUid: OWNER.uid }));
  });
});
