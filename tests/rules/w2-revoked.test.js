import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, updateDoc } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// Wave 2 R6: a person removed from a project (not in memberUids, restricted)
// or deactivated in the People directory can no longer write their tasks or
// actions: Assignee, contributor and action-PIC branches also require
// project membership (projectMemberIn) next to the active members/{uid}.

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PIC = { uid: 'u_pic', email: 'pic@smartosc.com' }; // task + action PIC
const CON = { uid: 'u_con', email: 'con@smartosc.com' }; // task contributor
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' };

const WS = 'workspaces/main';
const P1 = `${WS}/projects/p1`;
const programMeta = {
  prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: null, start: null, end: null },
};

const project = (over = {}) => ({
  name: 'P', memberIds: [], roles: {}, programs: [], programMeta,
  memberUids: [PIC.uid, CON.uid, PM.uid], visibility: 'restricted', schemaVersion: 2, ...over,
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
  for (const u of [PIC, CON, PM]) await seedDoc(`${WS}/members/${u.uid}`, member(u.email, status[u.uid] || 'active'));
  await seedDoc(P1, project(projectOver));
  await seedDoc(`${P1}/workstreams/w1`, {
    workspaceId: 'main', projectId: 'p1', programId: 'prg1', name: 'WS', order: 0,
    leadUid: null, start: null, end: null, version: 1,
  });
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
});
