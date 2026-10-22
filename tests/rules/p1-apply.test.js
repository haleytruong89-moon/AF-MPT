import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { applyPlan, rollbackManifest } from '../../scripts/p1-build-directory.mjs';
import { resetData, cleanup } from './helpers.js';

// Admin SDK talks to the emulator via FIRESTORE_EMULATOR_HOST (set by emulators:exec).
const app = initializeApp({ projectId: 'demo-afmpt' }, 'p1-apply-test');
const db = getFirestore(app);

const MEMBER_PATH = 'workspaces/main/members/u_a';
const INVITE_NEW = 'workspaces/main/invites/new@smartosc.com';
const INVITE_OLD = 'workspaces/main/invites/old@smartosc.com';

const plan = {
  errors: [],
  unmapped: [],
  members: [{ uid: 'u_a', data: { email: 'a@smartosc.com', displayName: 'A Person', aliases: ['A'], status: 'active' } }],
  invites: [
    { email: 'new@smartosc.com', data: { email: 'new@smartosc.com', displayName: 'New Person', aliases: ['New'], status: 'active' } },
    { email: 'old@smartosc.com', data: { email: 'old@smartosc.com', displayName: 'Old Changed', aliases: [], status: 'active' } },
  ],
};

describe('P1 apply / rollback against the emulator', () => {
  beforeEach(async () => { await resetData(); });
  afterAll(async () => { await cleanup(); await deleteApp(app); });

  it('applies the plan, then rollback removes new docs and restores the old one', async () => {
    const oldTs = new Timestamp(1700000000, 123000000);
    await db.doc(INVITE_OLD).set({ email: 'old@smartosc.com', displayName: 'Old', aliases: ['O'], status: 'pending', updatedAt: oldTs });

    let manifestJson;
    const r = await applyPlan(db, plan, {
      FieldValue, Timestamp,
      writeManifest: (m) => { manifestJson = JSON.stringify(m); },
    });
    expect(r).toEqual({ written: 3, members: 1, invites: 2 });

    const member = await db.doc(MEMBER_PATH).get();
    expect(member.exists).toBe(true);
    expect(member.data().displayName).toBe('A Person');
    expect(member.data().updatedAt).toBeInstanceOf(Timestamp);
    const created = await db.doc(INVITE_NEW).get();
    expect(created.data().email).toBe('new@smartosc.com');
    const overwritten = await db.doc(INVITE_OLD).get();
    expect(overwritten.data().displayName).toBe('Old Changed');

    const manifest = JSON.parse(manifestJson);
    const rb = await rollbackManifest(db, manifest, { Timestamp });
    expect(rb).toEqual({ restored: 1, deleted: 2 });

    expect((await db.doc(MEMBER_PATH).get()).exists).toBe(false);
    expect((await db.doc(INVITE_NEW).get()).exists).toBe(false);
    const restored = await db.doc(INVITE_OLD).get();
    expect(restored.data().displayName).toBe('Old');
    expect(restored.data().status).toBe('pending');
    expect(restored.data().updatedAt).toBeInstanceOf(Timestamp);
    expect(restored.data().updatedAt.seconds).toBe(oldTs.seconds);
  });
});
