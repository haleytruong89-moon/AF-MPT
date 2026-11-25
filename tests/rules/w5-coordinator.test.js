import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// W5 Coordinator (HOD 25/11): coordinatorUids on the project doc (Owner only).
// May: create / edit / cancel actions in any work stream or none; decisions with or
// without a claim, in any program; RAID of any program. May not: delete, tasks, work
// stream roles, the project doc, role_changed events. Must be an active project member.

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' }; // PM of prg1
const COORD = { uid: 'u_coord', email: 'coord@smartosc.com' }; // Coordinator, no other role
const MEMBER = { uid: 'u_member', email: 'member@smartosc.com' }; // no role
const OUTSIDER = { uid: 'u_out', email: 'out@smartosc.com' }; // Coordinator listed but not a project member
const DEACT = { uid: 'u_deact', email: 'deact@smartosc.com' }; // Coordinator listed, deactivated

const WS = 'workspaces/main';
const P1 = `${WS}/projects/p1`;
const programMeta = {
  prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: null, start: null, end: null },
  prg2: { name: 'Program 2', order: 1, pmUid: null, deputyUid: null, start: null, end: null },
};
const IN_PROJECT = [PM, COORD, MEMBER, DEACT];
const project = (over = {}) => ({
  name: 'P', memberIds: IN_PROJECT.map((u) => u.uid), roles: {}, programs: [], programMeta,
  memberUids: IN_PROJECT.map((u) => u.uid), visibility: 'restricted', schemaVersion: 2,
  coordinatorUids: [COORD.uid, OUTSIDER.uid, DEACT.uid], ...over,
});
const ws = (programId) => ({ workspaceId: 'main', projectId: 'p1', programId, name: 'WS', order: 0, leadUid: null, start: null, end: null, version: 1 });
const action = (over = {}) => ({ workspaceId: 'main', projectId: 'p1', id: 'a', title: 'Follow up', status: 'Pending', workstreamId: null, version: 1, ...over });
const decision = (over = {}) => ({ workspaceId: 'main', projectId: 'p1', order: 0, id: 'd', title: 'Decision', status: 'Open', version: 1, ...over });
const raid = (programId, over = {}) => ({ workspaceId: 'main', projectId: 'p1', programId, items: [], version: 1, ...over });
const member = (email, status = 'active') => ({ email, displayName: email, aliases: [], department: 'AF', status, updatedAt: '2026-11-25T00:00:00Z', updatedBy: OWNER.email });

const as = (u) => asUser(u.uid, u.email);
const put = async (u, path, data) => setDoc(doc(await as(u), path), { updatedBy: u.uid, ...data });
const up = async (u, path, data) => updateDoc(doc(await as(u), path), { version: 2, updatedBy: u.uid, ...data });
const del = async (u, path) => deleteDoc(doc(await as(u), path));

describe('W5 Coordinator rules', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
    for (const u of [PM, COORD, MEMBER, OUTSIDER]) await seedDoc(`${WS}/members/${u.uid}`, member(u.email));
    await seedDoc(`${WS}/members/${DEACT.uid}`, member(DEACT.email, 'deactivated'));
    await seedDoc(P1, project());
    await seedDoc(`${P1}/workstreams/w1`, ws('prg1'));
    await seedDoc(`${P1}/workstreams/w2`, ws('prg2'));
    await seedDoc(`${P1}/actions/aNone`, action({ id: 'aNone', updatedBy: OWNER.uid }));
    await seedDoc(`${P1}/actions/aW2`, action({ id: 'aW2', workstreamId: 'w2', updatedBy: OWNER.uid }));
    await seedDoc(`${P1}/decisions/dNone`, decision({ id: 'dNone', updatedBy: OWNER.uid }));
    await seedDoc(`${P1}/decisions/dP1`, decision({ id: 'dP1', viaProgramId: 'prg1', updatedBy: PM.uid }));
    await seedDoc(`${P1}/raid/prg2`, raid('prg2', { updatedBy: OWNER.uid }));
    await seedDoc(`${P1}/tasks/t1`, { workspaceId: 'main', projectId: 'p1', id: 't1', name: 'T', programId: 'prg1', workstreamId: 'w1', status: 'Planned', version: 1, updatedBy: OWNER.uid });
  });
  afterAll(cleanup);

  it('CO-1 actions: Coordinator creates with no work stream or in any, edits, cancels; cannot delete', async () => {
    await assertSucceeds(put(COORD, `${P1}/actions/n1`, action({ id: 'n1' })));
    await assertSucceeds(put(COORD, `${P1}/actions/n2`, action({ id: 'n2', workstreamId: 'w2' })));
    await assertSucceeds(up(COORD, `${P1}/actions/aNone`, { title: 'Renamed', pic: 'Lan' }));
    await assertSucceeds(up(COORD, `${P1}/actions/aW2`, { status: 'Cancelled', workstreamId: 'w1' }));
    await assertFails(del(COORD, `${P1}/actions/aNone`));
  });

  it('CO-2 actions: a member without the role and the PM of another program are still refused', async () => {
    await assertFails(put(MEMBER, `${P1}/actions/m1`, action({ id: 'm1' })));
    await assertFails(up(MEMBER, `${P1}/actions/aNone`, { title: 'x' }));
    await assertFails(put(PM, `${P1}/actions/m2`, action({ id: 'm2', workstreamId: 'w2' })));
    await assertSucceeds(put(PM, `${P1}/actions/m3`, action({ id: 'm3', workstreamId: 'w1' })));
  });

  it('CO-3 decisions: Coordinator creates with or without a claim, edits an Owner-only one; cannot delete', async () => {
    await assertSucceeds(put(COORD, `${P1}/decisions/n1`, decision({ id: 'n1' })));
    await assertSucceeds(put(COORD, `${P1}/decisions/n2`, decision({ id: 'n2', viaProgramId: 'prg2' })));
    await assertSucceeds(up(COORD, `${P1}/decisions/dNone`, { title: 'Edited' }));
    await assertSucceeds(up(COORD, `${P1}/decisions/dP1`, { title: 'Edited' }));
    await assertFails(del(COORD, `${P1}/decisions/dNone`));
    await assertFails(up(MEMBER, `${P1}/decisions/dNone`, { title: 'x' }));
  });

  it('CO-4 RAID: Coordinator writes any program without a claim; programId must match; cannot delete', async () => {
    await assertSucceeds(up(COORD, `${P1}/raid/prg2`, { items: [{ id: 'r1', status: 'Pending approval' }] }));
    await assertSucceeds(put(COORD, `${P1}/raid/prg1`, raid('prg1')));
    await assertFails(put(COORD, `${P1}/raid/prgX`, raid('prgX')));
    await assertFails(del(COORD, `${P1}/raid/prg2`));
    await assertFails(up(MEMBER, `${P1}/raid/prg2`, { items: [{ id: 'r2' }] }));
  });

  it('CO-5 no task, work stream, project doc or role_changed writes for a Coordinator', async () => {
    await assertFails(up(COORD, `${P1}/tasks/t1`, { name: 'x' }));
    await assertFails(put(COORD, `${P1}/tasks/t2`, { workspaceId: 'main', projectId: 'p1', id: 't2', name: 'N', programId: 'prg1', workstreamId: 'w1', status: 'Planned', version: 1 }));
    await assertFails(up(COORD, `${P1}/workstreams/w1`, { leadUid: COORD.uid }));
    await assertFails(updateDoc(doc(await as(COORD), P1), { coordinatorUids: [COORD.uid, MEMBER.uid] }));
    await assertFails(setDoc(doc(await as(COORD), `${P1}/activity/e1`), {
      id: 'e1', type: 'role_changed', description: 'x', authorUid: COORD.uid, createdAt: serverTimestamp(),
    }));
  });

  it('CO-6 listed but not a project member, or deactivated: refused', async () => {
    await assertFails(put(OUTSIDER, `${P1}/actions/o1`, action({ id: 'o1' })));
    await assertFails(put(DEACT, `${P1}/actions/o2`, action({ id: 'o2' })));
    await assertFails(up(DEACT, `${P1}/decisions/dNone`, { title: 'x' }));
  });

  it('CO-7 only the Owner sets coordinatorUids; removing someone ends their rights', async () => {
    await assertFails(updateDoc(doc(await as(PM), P1), { coordinatorUids: [PM.uid] }));
    await assertSucceeds(updateDoc(doc(await as(OWNER), P1), { coordinatorUids: [MEMBER.uid] }));
    await assertSucceeds(put(MEMBER, `${P1}/actions/x1`, action({ id: 'x1' })));
    await assertFails(put(COORD, `${P1}/actions/x2`, action({ id: 'x2' })));
  });
});
