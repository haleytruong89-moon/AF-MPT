import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

const ME = { uid: 'u_me', email: 'me@smartosc.com' };
const OTHER = { uid: 'u_other', email: 'other@smartosc.com' };
const META = 'workspaces/main';
const path = (uid) => `workspaces/main/users/${uid}`;

const mine = (over = {}) => ({
  uid: ME.uid, email: ME.email, name: 'Me', photo: null, lastSeen: serverTimestamp(), ...over,
});

describe('W1 H5: users/{uid} directory entries match the signed-in account', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(META, { seeded: true, workspaceOwner: 'hattt4@smartosc.com' });
  });
  afterAll(cleanup);

  it('H5-1 creates own entry with own email: allowed', async () => {
    const db = await asUser(ME.uid, ME.email);
    await assertSucceeds(setDoc(doc(db, path(ME.uid)), mine()));
  });

  it('H5-2 creates an entry under another uid: denied', async () => {
    const db = await asUser(ME.uid, ME.email);
    await assertFails(setDoc(doc(db, path(OTHER.uid)), mine({ uid: OTHER.uid, email: OTHER.email })));
  });

  it('H5-3 creates own entry carrying a different email: denied', async () => {
    const db = await asUser(ME.uid, ME.email);
    await assertFails(setDoc(doc(db, path(ME.uid)), mine({ email: 'boss@smartosc.com' })));
  });

  it('H5-4 creates own entry whose uid field differs from the doc id: denied', async () => {
    const db = await asUser(ME.uid, ME.email);
    await assertFails(setDoc(doc(db, path(ME.uid)), mine({ uid: OTHER.uid })));
  });

  it('H5-5 creates own entry with an extra key: denied', async () => {
    const db = await asUser(ME.uid, ME.email);
    await assertFails(setDoc(doc(db, path(ME.uid)), mine({ isAdmin: true })));
  });

  it('H5-6 updates name/lastSeen on a legacy doc with an extra key: allowed', async () => {
    await seedDoc(path(ME.uid), { uid: ME.uid, email: ME.email, name: 'Old', photo: null, legacy: 'x' });
    const db = await asUser(ME.uid, ME.email);
    await assertSucceeds(updateDoc(doc(db, path(ME.uid)), { name: 'New', lastSeen: serverTimestamp() }));
  });

  it('H5-7 the sign-in upsert (setDoc merge) passes on a legacy doc with an extra key', async () => {
    await seedDoc(path(ME.uid), { uid: ME.uid, email: ME.email, name: 'Old', photo: null, legacy: 'x' });
    const db = await asUser(ME.uid, ME.email);
    await assertSucceeds(setDoc(doc(db, path(ME.uid)), mine(), { merge: true }));
  });

  it('H5-8 update adding a new key: denied', async () => {
    await seedDoc(path(ME.uid), { uid: ME.uid, email: ME.email, name: 'Old', photo: null });
    const db = await asUser(ME.uid, ME.email);
    await assertFails(updateDoc(doc(db, path(ME.uid)), { isAdmin: true }));
  });

  it('H5-9 update changing email to another: denied', async () => {
    await seedDoc(path(ME.uid), { uid: ME.uid, email: ME.email, name: 'Old', photo: null });
    const db = await asUser(ME.uid, ME.email);
    await assertFails(updateDoc(doc(db, path(ME.uid)), { email: 'boss@smartosc.com' }));
  });

  it('H5-10 updating another user\'s entry: denied', async () => {
    await seedDoc(path(OTHER.uid), { uid: OTHER.uid, email: OTHER.email, name: 'O', photo: null });
    const db = await asUser(ME.uid, ME.email);
    await assertFails(updateDoc(doc(db, path(OTHER.uid)), { name: 'Hacked' }));
  });

  it('H5-11 deleting own entry: denied', async () => {
    await seedDoc(path(ME.uid), { uid: ME.uid, email: ME.email, name: 'Old', photo: null });
    const db = await asUser(ME.uid, ME.email);
    await assertFails(deleteDoc(doc(db, path(ME.uid))));
  });

  it('H5-12 any @smartosc.com user reads entries; non-domain user cannot', async () => {
    await seedDoc(path(OTHER.uid), { uid: OTHER.uid, email: OTHER.email, name: 'O', photo: null });
    await assertSucceeds(getDoc(doc(await asUser(ME.uid, ME.email), path(OTHER.uid))));
    await assertFails(getDoc(doc(await asUser('u_g', 'x@gmail.com'), path(OTHER.uid))));
  });
});
