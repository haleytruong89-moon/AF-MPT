import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, deleteField } from 'firebase/firestore';
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

// P2.1 Task 3: ownerUids[] with the legacy workspaceOwner email as fallback.
describe('P2.1: ownerUids with legacy email fallback', () => {
  const CO = { uid: 'u_co', email: 'co@smartosc.com' }; // owner by uid only
  const MEMBERS = 'workspaces/main/members';
  const INVITES = 'workspaces/main/invites';
  const entry = (email) => ({
    email, displayName: 'X', aliases: [], department: 'AF', status: 'active',
    updatedAt: '2026-10-23T00:00:00Z', updatedBy: OWNER.email,
  });

  beforeEach(async () => {
    await resetData();
    await seedDoc(META, { ...baseMeta(), ownerUids: [CO.uid] });
  });
  afterAll(cleanup);

  it('OU-1 a uid in ownerUids can update owner fields', async () => {
    const db = await asUser(CO.uid, CO.email);
    await assertSucceeds(updateDoc(doc(db, META), { defaultView: 'gantt' }));
    await assertSucceeds(updateDoc(doc(db, META), {
      ownershipLog: [...baseMeta().ownershipLog, { id: 'own_2', action: 'note', to: CO.email }],
    }));
  });

  it('OU-2 legacy email-only owner still can (ownerUids present without them, or absent)', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertSucceeds(updateDoc(doc(db, META), { defaultView: 'gantt' }));
    await seedDoc(META, baseMeta());
    await assertSucceeds(updateDoc(doc(db, META), { defaultView: 'board' }));
  });

  it('OU-3 a non-owner cannot add themselves to ownerUids', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertFails(updateDoc(doc(db, META), { ownerUids: [CO.uid, USER.uid] }));
    await assertFails(setDoc(doc(db, META), { ownerUids: [USER.uid] }, { merge: true }));
    await assertFails(updateDoc(doc(db, META), { ownerUids: [USER.uid] }));
    await seedDoc(META, baseMeta()); // no ownerUids yet
    await assertFails(updateDoc(doc(db, META), { ownerUids: [USER.uid] }));
  });

  it('OU-4 the Owner cannot set ownerUids to [], remove it, or make it a non-list', async () => {
    for (const who of [OWNER, CO]) {
      const db = await asUser(who.uid, who.email);
      await assertFails(updateDoc(doc(db, META), { ownerUids: [] }));
      await assertFails(updateDoc(doc(db, META), { ownerUids: deleteField() }));
      await assertFails(updateDoc(doc(db, META), { ownerUids: CO.uid }));
      await assertFails(updateDoc(doc(db, META), { ownerUids: { [CO.uid]: true } }));
    }
  });

  it('OU-5 the Owner may update only ownerUids (workspaceOwner untouched)', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertSucceeds(updateDoc(doc(db, META), { ownerUids: [CO.uid, OWNER.uid] }));
    await seedDoc(META, baseMeta()); // first write of the field
    await assertSucceeds(updateDoc(doc(db, META), { ownerUids: [OWNER.uid] }));
  });

  it('OU-6 a uid owner may change owner fields when workspaceOwner is absent', async () => {
    const { workspaceOwner: _drop, ...noEmail } = baseMeta();
    void _drop;
    await seedDoc(META, { ...noEmail, ownerUids: [CO.uid] });
    const db = await asUser(CO.uid, CO.email);
    await assertSucceeds(updateDoc(doc(db, META), { defaultView: 'gantt' }));
  });

  it('OU-7 create may not set ownerUids', async () => {
    await resetData();
    const db = await asUser(USER.uid, USER.email);
    await assertFails(setDoc(doc(db, META), { seeded: true, ownerUids: [USER.uid] }));
  });

  it('OU-8 non-owner ordinary writes still pass, including a stale identical ownerUids echo', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertSucceeds(updateDoc(doc(db, META), { userPreferences: { Staff: { x: 1 } } }));
    await assertSucceeds(setDoc(doc(db, META), {
      ...baseMeta(), ownerUids: [CO.uid], userPreferences: { Staff: { x: 2 } },
    }, { merge: true }));
  });

  it('OU-9 ownerUids as a map does not grant ownership', async () => {
    await seedDoc(META, { seeded: true, ownerUids: { [USER.uid]: true } });
    const db = await asUser(USER.uid, USER.email);
    await assertFails(updateDoc(doc(db, META), { defaultView: 'gantt' }));
  });

  it('OU-10 directory owner writes are allowed via ownerUids (members and invites)', async () => {
    const db = await asUser(CO.uid, CO.email);
    const m = doc(db, `${MEMBERS}/u_x`);
    await assertSucceeds(setDoc(m, entry('x@smartosc.com')));
    await assertSucceeds(updateDoc(m, { department: 'HR' }));
    await assertSucceeds(deleteDoc(m));
    const i = doc(db, `${INVITES}/y@smartosc.com`);
    await assertSucceeds(setDoc(i, entry('y@smartosc.com')));
    await assertSucceeds(updateDoc(i, { department: 'HR' }));
    await assertSucceeds(deleteDoc(i));
  });

  it('OU-11 directory: legacy email owner still can; a non-owner cannot', async () => {
    const owner = await asUser(OWNER.uid, OWNER.email);
    await assertSucceeds(setDoc(doc(owner, `${MEMBERS}/u_y`), entry('y@smartosc.com')));
    await assertSucceeds(setDoc(doc(owner, `${INVITES}/z@smartosc.com`), entry('z@smartosc.com')));
    const user = await asUser(USER.uid, USER.email);
    await assertFails(setDoc(doc(user, `${MEMBERS}/u_z`), entry('z@smartosc.com')));
    await assertFails(setDoc(doc(user, `${INVITES}/w@smartosc.com`), entry('w@smartosc.com')));
  });
});
