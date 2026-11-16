import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';
import { newV2ProjectDoc } from '../../src/persistence.js';

// W3-A3 (O1/O2): the app creates new projects directly as v2 (newV2ProjectDoc) and
// deletes them softly (deletedAt). No rules change: these pin that the existing rules
// accept exactly the doc the app writes.
const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const MEMBER = { uid: 'u_member', email: 'member@smartosc.com' };
const OTHER = { uid: 'u_other', email: 'other@smartosc.com' };
const META = 'workspaces/main';
const entry = (u) => ({ email: u.email, displayName: 'X', aliases: [], department: 'AF', status: 'active', updatedAt: '2026-11-16T00:00:00Z', updatedBy: OWNER.email });
const v2Doc = (creator, memberUids = []) => newV2ProjectDoc({ id: 'x', name: 'New', teamMembers: [] }, { uid: creator.uid, now: serverTimestamp(), memberUids });

describe('W3-A3: create a v2 project, then soft delete', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(META, { seeded: true, workspaceOwner: OWNER.email, ownerUids: [OWNER.uid], userPreferences: {} });
    for (const u of [OWNER, MEMBER, OTHER]) await seedDoc(`${META}/members/${u.uid}`, entry(u));
  });
  afterAll(cleanup);

  it('W3-A3-1 Owner creates the v2 doc the app builds; a member cannot', async () => {
    await assertSucceeds(setDoc(doc(await asUser(OWNER.uid, OWNER.email), `${META}/projects/n1`), v2Doc(OWNER, [MEMBER.uid])));
    await assertFails(setDoc(doc(await asUser(MEMBER.uid, MEMBER.email), `${META}/projects/n2`), v2Doc(MEMBER)));
  });

  it('W3-A3-2 an assigned member reads it; a non-member does not (restricted)', async () => {
    await assertSucceeds(setDoc(doc(await asUser(OWNER.uid, OWNER.email), `${META}/projects/n1`), v2Doc(OWNER, [MEMBER.uid])));
    await assertSucceeds(getDoc(doc(await asUser(MEMBER.uid, MEMBER.email), `${META}/projects/n1`)));
    await assertFails(getDoc(doc(await asUser(OTHER.uid, OTHER.email), `${META}/projects/n1`)));
  });

  it('W3-A3-3 soft delete (deletedAt): Owner allowed, member denied', async () => {
    await assertSucceeds(setDoc(doc(await asUser(OWNER.uid, OWNER.email), `${META}/projects/n1`), v2Doc(OWNER, [MEMBER.uid])));
    await assertFails(setDoc(doc(await asUser(MEMBER.uid, MEMBER.email), `${META}/projects/n1`), { deletedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(doc(await asUser(OWNER.uid, OWNER.email), `${META}/projects/n1`), { deletedAt: serverTimestamp() }, { merge: true }));
  });
});
