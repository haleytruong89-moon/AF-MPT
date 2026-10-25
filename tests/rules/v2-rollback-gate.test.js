import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// P2.4 fix round 1: v2 sub-docs only live while the parent project is
// schemaVersion 2. After a rollback the project is v1 again but the stamped
// sub-docs may still exist; a stale v2 tab must not read or write them.
// Each case runs twice on the same seed, differing only in the parent's
// schemaVersion: v2 (control, allowed) and v1 (denied). programMeta and
// memberUids are kept on the v1 parent so only schemaVersion decides.

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' }; // PM of prg1
const ASG = { uid: 'u_asg', email: 'asg@smartosc.com' }; // PIC of t1 / a1
const CON = { uid: 'u_con', email: 'con@smartosc.com' }; // contributor of t1
const VIEWER = { uid: 'u_viewer', email: 'viewer@smartosc.com' };
const ALL = [PM, ASG, CON, VIEWER];

const WS = 'workspaces/main';
const P = `${WS}/projects/p1`;

const programMeta = {
  prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: null, start: null, end: null },
};

const project = (schemaVersion) => ({
  name: 'P',
  memberIds: [OWNER.uid, ...ALL.map((u) => u.uid)],
  roles: { [OWNER.uid]: 'owner' },
  programs: [],
  programMeta,
  memberUids: ALL.map((u) => u.uid),
  visibility: 'restricted',
  ...(schemaVersion === 2 ? { schemaVersion: 2 } : {}),
});

const base = { workspaceId: 'main', projectId: 'p1' };
const ws = () => ({ ...base, programId: 'prg1', name: 'WS', order: 0, leadUid: null, start: null, end: null, version: 1 });
const task = (over = {}) => ({
  ...base, programId: 'prg1', workstreamId: 'w1', order: 0, name: 'Task', status: 'InProgress',
  health: 'Green', updates: [], checkIns: [], start: null, end: null,
  picUid: ASG.uid, contributorUids: [CON.uid], version: 1, ...over,
});
const action = () => ({
  ...base, order: 0, title: 'Action', status: 'Pending', picUid: ASG.uid, workstreamId: 'w1', updates: [], version: 1,
});
const raid = () => ({ ...base, programId: 'prg1', items: [], version: 1 });
const decision = (over = {}) => ({ ...base, order: 0, title: 'D', status: 'Open', version: 1, ...over });

const member = (email) => ({
  email, displayName: email, aliases: [], department: 'AF', status: 'active',
  updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
});

async function seed(schemaVersion) {
  await resetData();
  await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
  for (const u of ALL) await seedDoc(`${WS}/members/${u.uid}`, member(u.email));
  await seedDoc(P, project(schemaVersion));
  await seedDoc(`${P}/workstreams/w1`, ws());
  await seedDoc(`${P}/tasks/t1`, task());
  await seedDoc(`${P}/actions/a1`, action());
  await seedDoc(`${P}/raid/prg1`, raid());
  await seedDoc(`${P}/decisions/d1`, decision({ viaProgramId: 'prg1' }));
  await seedDoc(`${P}/activity/e1`, { authorUid: VIEWER.uid, type: 'x', projectId: 'p1' });
}

const as = (u) => asUser(u.uid, u.email);
const up = async (u, path, data) => updateDoc(doc(await as(u), path), { version: 2, updatedBy: u.uid, ...data });
const put = async (u, path, data) => setDoc(doc(await as(u), path), { updatedBy: u.uid, ...data });
const by = (u) => ({ text: 'n', authorUid: u.uid });

const CASES = [
  ['Owner task update', () => up(OWNER, `${P}/tasks/t1`, { name: 'x' })],
  ['Owner task create', () => put(OWNER, `${P}/tasks/n1`, task())],
  ['Owner task delete', async () => deleteDoc(doc(await as(OWNER), `${P}/tasks/t1`))],
  ['Owner workstream create', () => put(OWNER, `${P}/workstreams/w9`, ws())],
  ['Owner workstream update', () => up(OWNER, `${P}/workstreams/w1`, { name: 'x' })],
  ['Owner action create', () => put(OWNER, `${P}/actions/a9`, action())],
  ['Owner RAID update', () => up(OWNER, `${P}/raid/prg1`, { items: [{ id: 'r1' }] })],
  ['Owner decision create', () => put(OWNER, `${P}/decisions/d9`, decision())],
  ['Owner decision delete', async () => deleteDoc(doc(await as(OWNER), `${P}/decisions/d1`))],
  ['PM task update', () => up(PM, `${P}/tasks/t1`, { name: 'x' })],
  ['PM decision update', () => up(PM, `${P}/decisions/d1`, { title: 'x', viaProgramId: 'prg1' })],
  ['Assignee task update', () => up(ASG, `${P}/tasks/t1`, { status: 'Planned', updates: [by(ASG)] })],
  ['contributor appends an update', () => up(CON, `${P}/tasks/t1`, { updates: [by(CON)] })],
  ['action PIC closes the action', () => up(ASG, `${P}/actions/a1`, { status: 'Done', updates: [by(ASG)] })],
  ['activity create', async () => setDoc(doc(await as(VIEWER), `${P}/activity/n1`),
    { authorUid: VIEWER.uid, type: 'x', projectId: 'p1', createdAt: serverTimestamp() })],
  ['member reads a task', async () => getDoc(doc(await as(VIEWER), `${P}/tasks/t1`))],
  ['member lists tasks', async () => getDocs(collection(await as(VIEWER), `${P}/tasks`))],
  ['member reads workstreams / actions / raid / decisions', async () => {
    const db = await as(VIEWER);
    await getDocs(collection(db, `${P}/workstreams`));
    await getDoc(doc(db, `${P}/actions/a1`));
    await getDoc(doc(db, `${P}/raid/prg1`));
    await getDoc(doc(db, `${P}/decisions/d1`));
  }],
  ['member lists activity', async () => getDocs(collection(await as(VIEWER), `${P}/activity`))],
  ['PM reads a task', async () => getDoc(doc(await as(PM), `${P}/tasks/t1`))],
];

describe('P2.4 v2 sub-collections are gated on the parent schemaVersion 2', () => {
  beforeEach(async () => { await resetData(); });
  afterAll(cleanup);

  for (const [name, op] of CASES) {
    it(`RBG ${name}: allowed on a v2 parent, denied on a v1 (rolled-back) parent`, async () => {
      await seed(2);
      await assertSucceeds(op());
      await seed(1);
      await assertFails(op());
    });
  }

  it('RBG a project doc with schemaVersion 1 (explicit) is treated as v1', async () => {
    await seed(2);
    await seedDoc(P, { ...project(2), schemaVersion: 1 });
    await assertFails(up(OWNER, `${P}/tasks/t1`, { name: 'x' }));
    await assertFails(getDoc(doc(await as(VIEWER), `${P}/tasks/t1`)));
  });

  it('RBG sub-docs of a missing project are denied', async () => {
    await seed(2);
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
    await assertFails(put(OWNER, `${P}/tasks/n1`, task()));
  });
});
