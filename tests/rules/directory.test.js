import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const STAFF = { uid: 'u_staff', email: 'staff@smartosc.com' };
const NEW = { uid: 'u_new', email: 'new@smartosc.com' };
const GMAIL = { uid: 'u_gmail', email: 'someone@gmail.com' };
const META = 'workspaces/main';
const MEMBERS = 'workspaces/main/members';
const INVITES = 'workspaces/main/invites';

const invite = () => ({
  email: NEW.email,
  displayName: 'New Person',
  aliases: ['New', 'N. Person'],
  department: 'AF',
  status: 'active',
  updatedAt: '2026-10-22T00:00:00Z',
  updatedBy: OWNER.email,
});

// What the client sends when claiming its invite.
const claim = (over = {}) => {
  const { email, displayName, aliases, department } = invite();
  return {
    email, displayName, aliases, department,
    status: 'active',
    updatedAt: serverTimestamp(),
    updatedBy: NEW.email,
    ...over,
  };
};

const entry = (email) => ({
  email, displayName: 'X', aliases: [], department: 'AF', status: 'active',
  updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
});

describe('P1: members/invites directory', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(META, { seeded: true, workspaceOwner: OWNER.email });
    await seedDoc(`${INVITES}/${NEW.email}`, invite());
    await seedDoc(`${MEMBERS}/${STAFF.uid}`, entry(STAFF.email));
  });
  afterAll(cleanup);

  it('DIR-1 owner creates, updates and deletes members/u_x', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    const ref = doc(db, `${MEMBERS}/u_x`);
    await assertSucceeds(setDoc(ref, entry('x@smartosc.com')));
    await assertSucceeds(updateDoc(ref, { department: 'HR', status: 'deactivated' }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('DIR-2 owner creates, updates and deletes invites/x@smartosc.com', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    const ref = doc(db, `${INVITES}/x@smartosc.com`);
    await assertSucceeds(setDoc(ref, entry('x@smartosc.com')));
    await assertSucceeds(updateDoc(ref, { displayName: 'Y' }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('DIR-3 staff reads both collections', async () => {
    const db = await asUser(STAFF.uid, STAFF.email);
    await assertSucceeds(getDoc(doc(db, `${MEMBERS}/${STAFF.uid}`)));
    await assertSucceeds(getDocs(collection(db, MEMBERS)));
    await assertSucceeds(getDoc(doc(db, `${INVITES}/${NEW.email}`)));
    await assertSucceeds(getDocs(collection(db, INVITES)));
  });

  it('DIR-4 staff cannot create or update someone else\'s entry', async () => {
    const db = await asUser(STAFF.uid, STAFF.email);
    await assertFails(setDoc(doc(db, `${MEMBERS}/u_other`), entry('other@smartosc.com')));
    await assertFails(setDoc(doc(db, `${INVITES}/other@smartosc.com`), entry('other@smartosc.com')));
    await assertFails(updateDoc(doc(db, `${INVITES}/${NEW.email}`), { department: 'HR' }));
    await seedDoc(`${MEMBERS}/u_other`, entry('other@smartosc.com'));
    await assertFails(updateDoc(doc(db, `${MEMBERS}/u_other`), { department: 'HR' }));
  });

  it('DIR-5 staff cannot update or delete own entry', async () => {
    const db = await asUser(STAFF.uid, STAFF.email);
    await assertFails(updateDoc(doc(db, `${MEMBERS}/${STAFF.uid}`), { department: 'HR' }));
    await assertFails(updateDoc(doc(db, `${MEMBERS}/${STAFF.uid}`), { status: 'deactivated' }));
    await assertFails(deleteDoc(doc(db, `${MEMBERS}/${STAFF.uid}`)));
  });

  it('DIR-6 invited user claims own uid with identical fields and status active', async () => {
    const db = await asUser(NEW.uid, NEW.email);
    await assertSucceeds(setDoc(doc(db, `${MEMBERS}/${NEW.uid}`), claim()));
  });

  it('DIR-7 claim with a changed department fails', async () => {
    const db = await asUser(NEW.uid, NEW.email);
    await assertFails(setDoc(doc(db, `${MEMBERS}/${NEW.uid}`), claim({ department: 'HR' })));
  });

  it('DIR-8 claim with status deactivated fails', async () => {
    const db = await asUser(NEW.uid, NEW.email);
    await assertFails(setDoc(doc(db, `${MEMBERS}/${NEW.uid}`), claim({ status: 'deactivated' })));
  });

  it('DIR-9 claim to another uid fails', async () => {
    const db = await asUser(NEW.uid, NEW.email);
    await assertFails(setDoc(doc(db, `${MEMBERS}/u_someone_else`), claim()));
  });

  it('DIR-10 claim with no matching invite fails', async () => {
    const db = await asUser('u_noinvite', 'noinvite@smartosc.com');
    await assertFails(setDoc(doc(db, `${MEMBERS}/u_noinvite`), {
      ...claim(), email: 'noinvite@smartosc.com', updatedBy: 'noinvite@smartosc.com',
    }));
  });

  it('DIR-11 claim with an extra key fails', async () => {
    const db = await asUser(NEW.uid, NEW.email);
    await assertFails(setDoc(doc(db, `${MEMBERS}/${NEW.uid}`), claim({ role: 'owner' })));
  });

  it('DIR-12 gmail user cannot read members', async () => {
    const db = await asUser(GMAIL.uid, GMAIL.email);
    await assertFails(getDoc(doc(db, `${MEMBERS}/${STAFF.uid}`)));
    await assertFails(getDocs(collection(db, MEMBERS)));
  });

  it('DIR-13 claim of a deactivated invite fails', async () => {
    await seedDoc(`${INVITES}/${NEW.email}`, { ...invite(), status: 'deactivated' });
    const db = await asUser(NEW.uid, NEW.email);
    await assertFails(setDoc(doc(db, `${MEMBERS}/${NEW.uid}`), claim()));
  });

  it('DIR-14 claim with spoofed updatedBy fails', async () => {
    const db = await asUser(NEW.uid, NEW.email);
    await assertFails(setDoc(doc(db, `${MEMBERS}/${NEW.uid}`), claim({ updatedBy: OWNER.email })));
  });

  it('DIR-15 staff cannot delete someone else\'s member or invite', async () => {
    await seedDoc(`${MEMBERS}/u_other`, entry('other@smartosc.com'));
    const db = await asUser(STAFF.uid, STAFF.email);
    await assertFails(deleteDoc(doc(db, `${MEMBERS}/u_other`)));
    await assertFails(deleteDoc(doc(db, `${INVITES}/${NEW.email}`)));
  });

  it('DIR-16 claimer cannot update own entry after a successful claim', async () => {
    const db = await asUser(NEW.uid, NEW.email);
    const ref = doc(db, `${MEMBERS}/${NEW.uid}`);
    await assertSucceeds(setDoc(ref, claim()));
    await assertFails(updateDoc(ref, { department: 'HR' }));
  });

  it('DIR-17 owner match is case-insensitive', async () => {
    await seedDoc(META, { seeded: true, workspaceOwner: 'HATTT4@smartosc.com' });
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertSucceeds(setDoc(doc(db, `${MEMBERS}/u_x`), entry('x@smartosc.com')));
  });

  it('DIR-18 owner write fails when workspaceOwner is missing', async () => {
    await seedDoc(META, { seeded: true });
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertFails(setDoc(doc(db, `${MEMBERS}/u_x`), entry('x@smartosc.com')));
    await assertFails(setDoc(doc(db, `${INVITES}/x@smartosc.com`), entry('x@smartosc.com')));
  });
});
