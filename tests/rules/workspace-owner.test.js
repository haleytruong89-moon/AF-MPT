import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const USER = { uid: 'u_user', email: 'staff@smartosc.com' };
const META = 'workspaces/main';

const baseMeta = () => ({
  seeded: true,
  workspaceOwner: OWNER.email,
  ownershipLog: [{ id: 'own_1', action: 'claim', to: OWNER.email }],
  defaultView: 'my-work',
  userPreferences: {},
});

describe('B1: workspace owner fields are owner-only', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(META, baseMeta());
  });
  afterAll(cleanup);

  it('B1-1 non-owner cannot set workspaceOwner to themselves', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertFails(updateDoc(doc(db, META), { workspaceOwner: USER.email }));
  });

  it('B1-2 non-owner cannot append to ownershipLog', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertFails(updateDoc(doc(db, META), {
      ownershipLog: [...baseMeta().ownershipLog, { id: 'own_2', action: 'claim', to: USER.email }],
    }));
  });

  it('B1-3 non-owner cannot change defaultView', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertFails(updateDoc(doc(db, META), { defaultView: 'gantt' }));
  });

  it('B1-4 non-owner stale full-meta merge (same owner fields) still succeeds', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertSucceeds(setDoc(doc(db, META), {
      ...baseMeta(),
      userPreferences: { Staff: { lastSeenMyWorkAt: '2026-10-14T00:00:00Z' } },
    }, { merge: true }));
  });

  it('B1-5 owner can transfer to another smartosc email', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertSucceeds(updateDoc(doc(db, META), {
      workspaceOwner: USER.email,
      ownershipLog: [...baseMeta().ownershipLog, { id: 'own_2', action: 'transfer', to: USER.email }],
    }));
  });

  it('B1-6 owner cannot release (set owner to null or empty)', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertFails(updateDoc(doc(db, META), { workspaceOwner: null }));
    await assertFails(updateDoc(doc(db, META), { workspaceOwner: '' }));
  });

  it('B1-7 nobody can claim an ownerless workspace from the client', async () => {
    await seedDoc(META, { seeded: true, userPreferences: {} });
    const db = await asUser(USER.uid, USER.email);
    await assertFails(updateDoc(doc(db, META), { workspaceOwner: USER.email }));
  });

  it('B1-8 owner cannot transfer to a non-domain email', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertFails(updateDoc(doc(db, META), { workspaceOwner: 'x@gmail.com' }));
  });

  it('B1-9 owner match is case-insensitive', async () => {
    await seedDoc(META, { ...baseMeta(), workspaceOwner: 'HaTTT4@SmartOSC.com' });
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertSucceeds(updateDoc(doc(db, META), { defaultView: 'gantt' }));
  });

  it('B1-10 owner can change defaultView', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertSucceeds(updateDoc(doc(db, META), { defaultView: 'gantt' }));
  });

  it('B1-11 nobody can delete the workspace doc', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertFails(deleteDoc(doc(db, META)));
  });

  it('B1-12 create may not set owner fields; plain create is allowed', async () => {
    await resetData();
    const db = await asUser(USER.uid, USER.email);
    await assertFails(setDoc(doc(db, META), { seeded: true, workspaceOwner: USER.email }));
    await assertSucceeds(setDoc(doc(db, META), { seeded: true }));
  });

  it('B1-13 domain user can still read meta', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertSucceeds(getDoc(doc(db, META)));
  });
});
