import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// W2 R4 + R8: workspace writes need an active member; only Owners create
// projects; sign-in provider pinned to google.com.
const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const MEMBER = { uid: 'u_member', email: 'member@smartosc.com' };
const STRANGER = { uid: 'u_stranger', email: 'stranger@smartosc.com' }; // domain account, no member doc
const DEACT = { uid: 'u_deact', email: 'deact@smartosc.com' };
const NEWBIE = { uid: 'u_newbie', email: 'newbie@smartosc.com' };
const META = 'workspaces/main';
const MEMBERS = `${META}/members`;
const INVITES = `${META}/invites`;
const P1 = `${META}/projects/p1`;

const entry = (u, status = 'active') => ({
  email: u.email, displayName: 'X', aliases: [], department: 'AF', status,
  updatedAt: '2026-11-12T00:00:00Z', updatedBy: OWNER.email,
});

describe('W2 R4/R8: workspace writes, project create, provider pin', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(META, { seeded: true, workspaceOwner: OWNER.email, ownerUids: [OWNER.uid], userPreferences: {}, config: { a: 1 } });
    await seedDoc(`${MEMBERS}/${OWNER.uid}`, entry(OWNER));
    await seedDoc(`${MEMBERS}/${MEMBER.uid}`, entry(MEMBER));
    await seedDoc(`${MEMBERS}/${DEACT.uid}`, entry(DEACT, 'deactivated'));
    await seedDoc(P1, { name: 'P1', memberIds: [MEMBER.uid], roles: { [MEMBER.uid]: 'owner' } });
  });
  afterAll(cleanup);

  const newProject = (u) => ({ name: 'N', memberIds: [u.uid], roles: { [u.uid]: 'owner' } });

  it('W2-R4-1 project create: Owner allowed; active member and stranger denied', async () => {
    await assertSucceeds(setDoc(doc(await asUser(OWNER.uid, OWNER.email), `${META}/projects/n1`), newProject(OWNER)));
    await assertFails(setDoc(doc(await asUser(MEMBER.uid, MEMBER.email), `${META}/projects/n2`), newProject(MEMBER)));
    await assertFails(setDoc(doc(await asUser(STRANGER.uid, STRANGER.email), `${META}/projects/n3`), newProject(STRANGER)));
  });

  it('W2-R4-1b project create: legacy-email Owner (ownerUids empty) allowed', async () => {
    await seedDoc(META, { seeded: true, workspaceOwner: OWNER.email, ownerUids: [] });
    await assertSucceeds(setDoc(doc(await asUser(OWNER.uid, OWNER.email), `${META}/projects/n9`), newProject(OWNER)));
  });

  it('W2-R4-2 meta update (workspaceName): stranger and deactivated member denied; active member allowed', async () => {
    await assertFails(updateDoc(doc(await asUser(STRANGER.uid, STRANGER.email), META), { workspaceName: 'X' }));
    await assertFails(updateDoc(doc(await asUser(DEACT.uid, DEACT.email), META), { workspaceName: 'X' }));
    await assertSucceeds(updateDoc(doc(await asUser(MEMBER.uid, MEMBER.email), META), { workspaceName: 'X' }));
  });

  it('W2-R4-3 config is Owner-only: active member denied, Owner allowed; unchanged config echo passes', async () => {
    const m = await asUser(MEMBER.uid, MEMBER.email);
    await assertFails(updateDoc(doc(m, META), { config: { a: 2 } }));
    await assertSucceeds(setDoc(doc(m, META), { config: { a: 1 }, userPreferences: { S: { x: 1 } } }, { merge: true }));
    await assertSucceeds(updateDoc(doc(await asUser(OWNER.uid, OWNER.email), META), { config: { a: 2 } }));
  });

  it('W2-R4-4 Owner may still write non-owner fields without any member doc', async () => {
    await resetData();
    await seedDoc(META, { seeded: true, workspaceOwner: OWNER.email, userPreferences: {} });
    await assertSucceeds(updateDoc(doc(await asUser(OWNER.uid, OWNER.email), META), { userPreferences: { O: { x: 1 } } }));
  });

  it('W2-R8-1 a non-Google provider (password) token is denied reads and writes; google.com passes', async () => {
    const pw = await asUser(MEMBER.uid, MEMBER.email, true, 'password');
    await assertFails(getDoc(doc(pw, P1)));
    await assertFails(getDoc(doc(pw, META)));
    await assertFails(updateDoc(doc(pw, META), { workspaceName: 'X' }));
    const g = await asUser(MEMBER.uid, MEMBER.email, true, 'google.com');
    await assertSucceeds(getDoc(doc(g, P1)));
    await assertSucceeds(getDoc(doc(g, META)));
  });

  it('W2-R4-5 self-claim walk: invite read, member create, then first workspaces/main merge write (userPreferences only)', async () => {
    await seedDoc(`${INVITES}/${NEWBIE.email}`, {
      email: NEWBIE.email, displayName: 'Newbie', aliases: ['N'], department: 'AF', status: 'active',
      updatedAt: '2026-11-12T00:00:00Z', updatedBy: OWNER.email,
    });
    const db = await asUser(NEWBIE.uid, NEWBIE.email);
    // Before claiming, a meta write is refused.
    await assertFails(setDoc(doc(db, META), { userPreferences: { Newbie: { x: 1 } } }, { merge: true }));
    // The app lists members + invites, then claims.
    await assertSucceeds(getDocs(collection(db, MEMBERS)));
    await assertSucceeds(getDocs(collection(db, INVITES)));
    await assertSucceeds(getDoc(doc(db, `${INVITES}/${NEWBIE.email}`)));
    await assertSucceeds(setDoc(doc(db, `${MEMBERS}/${NEWBIE.uid}`), {
      email: NEWBIE.email, displayName: 'Newbie', aliases: ['N'], department: 'AF',
      status: 'active', updatedAt: serverTimestamp(), updatedBy: NEWBIE.email,
    }));
    // First meta write after the claim: merge touching only userPreferences.
    await assertSucceeds(setDoc(doc(db, META), { userPreferences: { Newbie: { lastSeenMyWorkAt: '2026-11-12T00:00:00Z' } } }, { merge: true }));
  });
});
