import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, updateDoc } from 'firebase/firestore';
import { applyBackfill, prepareBackfill, prepareBackfillRollback, rollbackBackfill } from '../../scripts/p2-backfill-uids.mjs';
import { BACKFILL_STAMP } from '../../scripts/lib/backfill-plan.mjs';
import { resetData, cleanup, asUser } from './helpers.js';

// W3-B2 (B-1, M1): uid backfill on a v2 project (Admin SDK via FIRESTORE_EMULATOR_HOST).
const app = initializeApp({ projectId: 'demo-afmpt' }, 'p2-backfill-uids-test');
const db = getFirestore(app);
const WS = 'workspaces/main';
const PID = 'proj_bf';
const BASE = `${WS}/projects/${PID}`;
const LAN = { uid: 'u_lan', email: 'lan@smartosc.com' };

const member = (email, displayName) => ({
  email, displayName, aliases: [], department: 'AF', status: 'active', updatedAt: '2026-11-16T00:00:00Z', updatedBy: 'hattt4@smartosc.com',
});
const task = (over = {}) => ({
  workspaceId: 'main', projectId: PID, programId: 'prgA', workstreamId: 'wsA', order: 0, name: 'T', status: 'InProgress', health: 'Green',
  pic: 'Lan Pham', picUid: null, contributors: [], contributorUids: [], updates: [], checkIns: [], version: 1, updatedBy: 'p2-migrate', ...over,
});

async function seed() {
  await db.doc(WS).set({ workspaceOwner: 'hattt4@smartosc.com', ownerUids: ['u_hod'] });
  await db.doc(`${WS}/members/u_hod`).set(member('hattt4@smartosc.com', 'Ha Truong'));
  await db.doc(`${WS}/members/${LAN.uid}`).set(member(LAN.email, 'Lan Pham'));
  await db.doc(BASE).set({
    name: 'Ops 2026', schemaVersion: 2, visibility: 'restricted', memberUids: ['u_hod'], memberIds: ['u_hod'], roles: { u_hod: 'owner' },
    programMeta: { prgA: { name: 'Finance', order: 0, pmUid: null, deputyUid: null, start: null, end: null } },
  });
  await db.doc(`${BASE}/workstreams/wsA`).set({ workspaceId: 'main', projectId: PID, programId: 'prgA', name: 'Close', order: 0, leadUid: null, start: null, end: null, version: 1, updatedBy: 'p2-migrate' });
  await db.doc(`${BASE}/tasks/t1`).set(task());
  await db.doc(`${BASE}/tasks/t2`).set(task({ status: 'Completed' }));
}

let manifests = [];
const run = (extra = {}) => applyBackfill(db, { pid: PID, FieldValue, writeManifest: (m) => { manifests.push(JSON.parse(JSON.stringify(m))); }, ...extra });
const data = async (path) => (await db.doc(path).get()).data();
const activity = async () => (await db.collection(`${BASE}/activity`).get()).docs.map((d) => d.data());
const lanEdit = async (version) => updateDoc(doc(await asUser(LAN.uid, LAN.email), `${BASE}/tasks/t1`), { health: 'Amber', version, updatedBy: LAN.uid });

describe('W3-B2 p2-backfill-uids against the emulator', () => {
  beforeEach(async () => { await resetData(); await seed(); manifests = []; });
  afterAll(async () => { await cleanup(); });

  it('BFA-1 apply links the PIC (closed task too), grants access, logs one event; the PIC can then update their task', async () => {
    await assertFails(lanEdit(2));
    const prep = await prepareBackfill(db, { pid: PID });
    expect(prep.blocked).toEqual([]);
    expect(prep.changes.map((c) => c.id)).toEqual(['t1', 't2']);
    const r = await run({ expectHash: prep.planHash });
    expect(r.verify).toEqual({ ok: true, mismatches: [] });

    const t1 = await data(`${BASE}/tasks/t1`);
    expect(t1).toMatchObject({ picUid: LAN.uid, picEmail: LAN.email, version: 2, updatedBy: BACKFILL_STAMP });
    expect(t1.updatedAt).toBeInstanceOf(Timestamp);
    expect(await data(`${BASE}/tasks/t2`)).toMatchObject({ picUid: LAN.uid, status: 'Completed', version: 2 });
    const p = await data(BASE);
    expect(p.memberUids).toEqual(['u_hod', LAN.uid]);
    expect(p.memberIds).toEqual(['u_hod', LAN.uid]);
    const ev = await activity();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: 'uids_backfilled', author: BACKFILL_STAMP, authorUid: null, projectId: PID });
    expect(manifests[0]).toMatchObject({ kind: 'p2-backfill-uids', pid: PID, planHash: prep.planHash });

    await assertSucceeds(lanEdit(3));
  });

  it('BFA-2 a re-run is a noop; a stale hash is PLAN_CHANGED with nothing written', async () => {
    await expect(run({ expectHash: '0123456789abcdef' })).rejects.toMatchObject({ code: 'PLAN_CHANGED' });
    expect(manifests).toEqual([]);
    expect((await data(`${BASE}/tasks/t1`)).picUid).toBeNull();
    await run();
    expect((await prepareBackfill(db, { pid: PID })).noop).toBe(true);
    expect((await run()).noop).toBe(true);
    expect(await activity()).toHaveLength(1);
  });

  it('BFA-3 a doc edited between preview and commit -> STATE_CHANGED, nothing written', async () => {
    await expect(run({ hooks: { beforeCommit: async () => { await db.doc(`${BASE}/tasks/t1`).update({ version: 7 }); } } }))
      .rejects.toMatchObject({ code: 'STATE_CHANGED' });
    expect((await data(`${BASE}/tasks/t1`)).picUid).toBeNull();
    expect((await data(`${BASE}/tasks/t2`)).picUid).toBeNull();
    expect((await data(BASE)).memberUids).toEqual(['u_hod']);
    expect(await activity()).toEqual([]);
  });

  it('BFA-4 rollback restores the before-values, keeps the grant, skips a doc edited after the apply', async () => {
    await run();
    await db.doc(`${BASE}/tasks/t2`).update({ picUid: 'u_hod' });
    const prep = await prepareBackfillRollback(db, { manifest: manifests[0] });
    expect(prep.skipped.map((s) => `${s.where} ${s.key}`)).toEqual(['tasks/t2 picUid']);
    const r = await rollbackBackfill(db, { manifest: manifests[0], expectHash: prep.hash, FieldValue });
    expect(r.verify).toEqual({ ok: true, mismatches: [] });
    const t1 = await data(`${BASE}/tasks/t1`);
    expect(t1.picUid).toBeNull();
    expect('picEmail' in t1).toBe(false);
    expect(t1).toMatchObject({ version: 3, updatedBy: `${BACKFILL_STAMP}-rollback` });
    expect((await data(`${BASE}/tasks/t2`)).picUid).toBe('u_hod');
    expect((await data(BASE)).memberUids).toEqual(['u_hod', LAN.uid]);
    expect((await activity()).map((e) => e.type).sort()).toEqual(['uids_backfill_rolled_back', 'uids_backfilled']);
  });
});
