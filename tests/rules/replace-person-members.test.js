import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, updateDoc, arrayUnion, arrayRemove, deleteField, serverTimestamp } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// Replace person (spec §8): the Owner adds / removes one project member with the same
// patch shape as the role change transaction (add) and MembersModal (remove).
const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' };
const X = { uid: 'u_x', email: 'x@smartosc.com' };
const Y = { uid: 'u_y', email: 'y@smartosc.com' };
const WS = 'workspaces/main';
const P1 = `${WS}/projects/p1`;
const member = (email) => ({ email, displayName: email, aliases: [], department: 'AF', status: 'active', updatedAt: '2026-11-25T00:00:00Z', updatedBy: OWNER.email });

async function seed() {
  await resetData();
  await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
  for (const u of [OWNER, PM, X, Y]) await seedDoc(`${WS}/members/${u.uid}`, member(u.email));
  await seedDoc(P1, {
    name: 'P', schemaVersion: 2, visibility: 'restricted', programs: [],
    programMeta: { g1: { name: 'G', order: 0, pmUid: PM.uid, deputyUid: null, start: null, end: null } },
    memberIds: [OWNER.uid, PM.uid, X.uid], memberUids: [OWNER.uid, PM.uid, X.uid],
    roles: { [OWNER.uid]: 'owner', [PM.uid]: 'member', [X.uid]: 'member' },
  });
}
const add = () => ({ memberUids: arrayUnion(Y.uid), memberIds: arrayUnion(Y.uid), [`roles.${Y.uid}`]: 'member', updatedAt: serverTimestamp() });
const remove = () => ({ memberUids: arrayRemove(X.uid), memberIds: arrayRemove(X.uid), [`roles.${X.uid}`]: deleteField(), updatedAt: serverTimestamp() });
const as = async (u) => asUser(u.uid, u.email);

describe('Replace person: project member add / remove', () => {
  afterAll(cleanup);
  beforeEach(seed);

  it('RPM-1 the Owner adds a member', async () => {
    await assertSucceeds(updateDoc(doc(await as(OWNER), P1), add()));
  });
  it('RPM-2 the Owner removes a member', async () => {
    await assertSucceeds(updateDoc(doc(await as(OWNER), P1), remove()));
  });
  it('RPM-3 a PM cannot add or remove members', async () => {
    await assertFails(updateDoc(doc(await as(PM), P1), add()));
    await assertFails(updateDoc(doc(await as(PM), P1), remove()));
  });
});
