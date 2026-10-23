import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { applyWrites, rollbackManifest } from '../../scripts/lib/manifest.mjs';
import { planOwnerUids, membersByEmailFrom } from '../../scripts/p2-set-owner-uids.mjs';
import { resetData, cleanup } from './helpers.js';

// Admin SDK talks to the emulator via FIRESTORE_EMULATOR_HOST (set by emulators:exec).
const app = initializeApp({ projectId: 'demo-afmpt' }, 'p2-owner-uids-test');
const db = getFirestore(app);
const WS = 'workspaces/main';

describe('P2 ownerUids apply / rollback against the emulator', () => {
  beforeEach(async () => { await resetData(); });
  afterAll(async () => { await cleanup(); await deleteApp(app); });

  it('merges only ownerUids; rollback removes only ownerUids and keeps later client writes', async () => {
    const ts = new Timestamp(1700000000, 0);
    await db.doc(WS).set({ workspaceOwner: 'HaTTT4@smartosc.com', defaultView: 'my-work', userPreferences: { a: 1 }, updatedAt: ts });
    await db.doc(`${WS}/members/u_owner`).set({ email: 'hattt4@smartosc.com', status: 'active' });

    const docs = [];
    (await db.collection(`${WS}/members`).get()).forEach((d) => docs.push({ id: d.id, data: d.data() }));
    const plan = planOwnerUids((await db.doc(WS).get()).data(), membersByEmailFrom(docs));
    expect(plan).toEqual({ ownerUids: ['u_owner'] });

    let manifestJson;
    await applyWrites(db, [{ path: WS, data: { ownerUids: plan.ownerUids }, merge: true }], {
      Timestamp, writeManifest: (m) => { manifestJson = JSON.stringify(m); },
    });
    const after = (await db.doc(WS).get()).data();
    expect(after.ownerUids).toEqual(['u_owner']);
    expect(after.workspaceOwner).toBe('HaTTT4@smartosc.com');
    expect(after.userPreferences).toEqual({ a: 1 });
    expect(after.updatedAt.seconds).toBe(ts.seconds);

    // Re-planning is a no-op.
    expect(planOwnerUids(after, membersByEmailFrom(docs))).toEqual({ noop: true });

    // A client writes in between.
    await db.doc(WS).set({ userPreferences: { a: 2 } }, { merge: true });

    // The manifest holds only the written field's previous value (absent here).
    expect(JSON.parse(manifestJson).entries).toEqual([{ path: WS, merge: true, fields: ['ownerUids'], before: {} }]);

    const rb = await rollbackManifest(db, JSON.parse(manifestJson), { FieldValue, Timestamp });
    expect(rb).toEqual({ restored: 1, deleted: 0 });
    const back = (await db.doc(WS).get()).data();
    expect('ownerUids' in back).toBe(false);
    expect(back.userPreferences).toEqual({ a: 2 });
    expect(back.workspaceOwner).toBe('HaTTT4@smartosc.com');
    expect(back.defaultView).toBe('my-work');
  });
});
