import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { apprReq } from './p3-scenarios.js';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// Wave 2 R6: a person removed from a project (not in memberUids, restricted)
// or deactivated in the People directory can no longer write their tasks or
// actions: Assignee, contributor and action-PIC branches also require
// project membership (projectMemberIn) next to the active members/{uid}.

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PIC = { uid: 'u_pic', email: 'pic@smartosc.com' }; // task + action PIC
const CON = { uid: 'u_con', email: 'con@smartosc.com' }; // task contributor
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' };
const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' }; // Sub-PM of w1

const WS = 'workspaces/main';
const P1 = `${WS}/projects/p1`;
const programMeta = {
  prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: null, start: null, end: null },
};

const project = (over = {}) => ({
  name: 'P', memberIds: [], roles: {}, programs: [], programMeta,
  memberUids: [PIC.uid, CON.uid, PM.uid, LEAD.uid], visibility: 'restricted', schemaVersion: 2, ...over,
});
const member = (email, status = 'active') => ({
  email, displayName: email, aliases: [], department: 'AF', status,
  updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
});
const task = () => ({
  workspaceId: 'main', projectId: 'p1', programId: 'prg1', workstreamId: 'w1', order: 0,
  id: 't1', name: 'T', status: 'InProgress', health: 'Green',
  picUid: PIC.uid, contributorUids: [CON.uid], updates: [], checkIns: [],
  updatedBy: OWNER.uid, version: 1,
});
const action = () => ({
  workspaceId: 'main', projectId: 'p1', workstreamId: 'w1', id: 'a1', title: 'A',
  status: 'Pending', picUid: PIC.uid, updates: [], updatedBy: OWNER.uid, version: 1,
});
const newUpd = (u) => ({ id: 'u1', text: 'note', date: '2026-11-12', author: u.email, authorUid: u.uid, isBlocker: false });

const up = async (u, path, data) =>
  updateDoc(doc(await asUser(u.uid, u.email), path), { version: 2, updatedBy: u.uid, ...data });
const picTask = (u = PIC) => up(u, `${P1}/tasks/t1`, { health: 'Amber', updates: [newUpd(u)] });
const conTask = (u = CON) => up(u, `${P1}/tasks/t1`, { updates: [newUpd(u)] });
const picAction = (u = PIC) => up(u, `${P1}/actions/a1`, { status: 'Done', updates: [newUpd(u)] });

async function seed({ projectOver = {}, status = {} } = {}) {
  await resetData();
  await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
  for (const u of [PIC, CON, PM, LEAD]) await seedDoc(`${WS}/members/${u.uid}`, member(u.email, status[u.uid] || 'active'));
  const pr = project(projectOver);
  for (const k of Object.keys(pr)) if (pr[k] === undefined) delete pr[k];
  await seedDoc(P1, pr);
  await seedDoc(`${P1}/workstreams/w1`, {
    workspaceId: 'main', projectId: 'p1', programId: 'prg1', name: 'WS', order: 0,
    leadUid: LEAD.uid, start: null, end: null, version: 1,
    updatedBy: OWNER.uid,
  });
  await seedDoc(`${P1}/raid/prg1`, { workspaceId: 'main', projectId: 'p1', programId: 'prg1', items: [], version: 1, updatedBy: OWNER.uid });
  await seedDoc(`${P1}/tasks/t1`, task());
  await seedDoc(`${P1}/actions/a1`, action());
}

describe('Wave 2 R6: removed or deactivated people stop writing', () => {
  afterAll(cleanup);

  describe('active project member (regression)', () => {
    beforeEach(() => seed());
    it('W2-RV-1 PIC updates own task', async () => { await assertSucceeds(picTask()); });
    it('W2-RV-2 contributor appends an update', async () => { await assertSucceeds(conTask()); });
    it('W2-RV-3 action PIC closes own action', async () => { await assertSucceeds(picAction()); });
  });

  describe('removed from memberUids (restricted)', () => {
    beforeEach(() => seed({ projectOver: { memberUids: [PM.uid] } }));
    it('W2-RV-4 removed PIC cannot update own task', async () => { await assertFails(picTask()); });
    it('W2-RV-5 removed contributor cannot add an update', async () => { await assertFails(conTask()); });
    it('W2-RV-6 removed action PIC cannot update the action', async () => { await assertFails(picAction()); });
    it('W2-RV-7 PM and Owner are unaffected', async () => {
      await assertSucceeds(up(PM, `${P1}/tasks/t1`, { health: 'Red' }));
      await assertSucceeds(up(OWNER, `${P1}/actions/a1`, { title: 'B' }));
    });
  });

  describe('deactivated in the People directory', () => {
    beforeEach(() => seed({ status: { [PIC.uid]: 'deactivated', [CON.uid]: 'deactivated' } }));
    it('W2-RV-8 deactivated PIC cannot update own task', async () => { await assertFails(picTask()); });
    it('W2-RV-9 deactivated contributor cannot add an update', async () => { await assertFails(conTask()); });
    it('W2-RV-10 deactivated action PIC cannot update the action', async () => { await assertFails(picAction()); });
  });

  describe('department visibility keeps active members in', () => {
    beforeEach(() => seed({ projectOver: { visibility: 'department', memberUids: [PM.uid] } }));
    it('W2-RV-11 PIC not listed in memberUids still writes on a department project', async () => {
      await assertSucceeds(picTask());
      await assertSucceeds(picAction());
    });
  });
  describe('removed managers (PM / Sub-PM) lose write rights', () => {
    const edits = {
      task: (u) => up(u, `${P1}/tasks/t1`, { health: 'Red' }),
      ws: (u) => up(u, `${P1}/workstreams/w1`, { name: 'WS2' }),
      raid: (u) => up(u, `${P1}/raid/prg1`, { items: [{ id: 'r1' }], viaProgramId: 'prg1' }),
    };
    describe('still members (regression)', () => {
      beforeEach(() => seed());
      it('W2-RV-12 PM edits task, workstream and RAID', async () => {
        await assertSucceeds(edits.task(PM));
        await assertSucceeds(edits.ws(PM));
        await assertSucceeds(edits.raid(PM));
      });
      it('W2-RV-13 Sub-PM edits a task of their workstream', async () => { await assertSucceeds(edits.task(LEAD)); });
    });
    describe('removed from memberUids', () => {
      beforeEach(() => seed({ projectOver: { memberUids: [PIC.uid, CON.uid] } }));
      it('W2-RV-14 removed PM denied on task, workstream, RAID', async () => {
        await assertFails(edits.task(PM));
        await assertFails(edits.ws(PM));
        await assertFails(edits.raid(PM));
      });
      it('W2-RV-15 removed Sub-PM denied on task edit', async () => { await assertFails(edits.task(LEAD)); });
    });
  });

  describe('membership fallbacks', () => {
    it('W2-RV-16 no memberUids: memberIds decides (member in, non-member out)', async () => {
      await seed({ projectOver: { memberUids: undefined, memberIds: [PIC.uid] } });
      await assertSucceeds(picTask());
      await assertFails(conTask());
    });
    it('W2-RV-17 no visibility set = restricted', async () => {
      await seed({ projectOver: { visibility: undefined, memberUids: [PM.uid] } });
      await assertFails(picTask());
    });
  });

  describe('removed PM and approvals (mitigation_done)', () => {
    const A = `${P1}/approvals/ra`;
    const reassign = async () => setDoc(doc(await asUser(PM.uid, PM.email), A), {
      ...apprReq('mitigation_done', CON, PM), approverUid: LEAD.uid,
      reassignLog: [{ at: '2026-10-26T00:00:00Z', byUid: PM.uid, from: PM.uid, to: LEAD.uid, viaWorkstreamId: 'w1' }],
      version: 2, updatedBy: PM.uid, updatedAt: serverTimestamp(),
    });
    const decide = async () => setDoc(doc(await asUser(PM.uid, PM.email), A), {
      ...apprReq('mitigation_done', CON, PM),
      status: 'Approved', decidedByUid: PM.uid, decidedAt: serverTimestamp(), reason: null,
      version: 2, updatedBy: PM.uid, updatedAt: serverTimestamp(),
    });
    describe('still a member (regression)', () => {
      beforeEach(async () => { await seed(); await seedDoc(A, apprReq('mitigation_done', CON, PM)); });
      it('W2-RV-18 PM reassigns a pending mitigation_done', async () => { await assertSucceeds(reassign()); });
      it('W2-RV-19 PM approves a mitigation_done', async () => { await assertSucceeds(decide()); });
    });
    describe('removed from memberUids', () => {
      beforeEach(async () => {
        await seed({ projectOver: { memberUids: [PIC.uid, CON.uid, LEAD.uid] } });
        await seedDoc(A, apprReq('mitigation_done', CON, PM));
      });
      it('W2-RV-20 removed PM cannot reassign', async () => { await assertFails(reassign()); });
      it('W2-RV-21 removed PM cannot approve', async () => { await assertFails(decide()); });
    });
  });
});
