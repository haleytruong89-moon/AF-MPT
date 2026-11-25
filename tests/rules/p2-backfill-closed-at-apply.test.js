import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { applyClosedAt, readClosedAtState, prepareClosedAtRollback, rollbackClosedAt } from '../../scripts/p2-backfill-closed-at.mjs';
import { planClosedAt, CLOSEDAT_STAMP } from '../../scripts/lib/closedat-plan.mjs';
import { resetData, cleanup } from './helpers.js';

// G1: close dates for old tasks (Admin SDK via FIRESTORE_EMULATOR_HOST).
const app = initializeApp({ projectId: 'demo-afmpt' }, 'p2-backfill-closed-at-test');
const db = getFirestore(app);
const PID = 'proj_ca';
const BASE = `workspaces/main/projects/${PID}`;

async function seed() {
  await db.doc('workspaces/main').set({ workspaceOwner: 'hattt4@smartosc.com', ownerUids: ['u_hod'] });
  await db.doc(BASE).set({ name: 'CRP', schemaVersion: 2, visibility: 'restricted', memberUids: ['u_hod'], memberIds: ['u_hod'], programMeta: {} });
  const t = (name, status, end, extra = {}) => ({ workspaceId: 'main', projectId: PID, programId: 'g', workstreamId: 'w', name, status, end, version: 1, updatedBy: 'p2-migrate', ...extra });
  await db.doc(`${BASE}/tasks/t1`).set(t('VAT filing', 'Completed', '2026-06-30'));
  await db.doc(`${BASE}/tasks/t2`).set(t('CIT', 'Dropped', '2026-05-10'));
  await db.doc(`${BASE}/tasks/t3`).set(t('Open', 'InProgress', '2026-12-10'));
  await db.doc(`${BASE}/tasks/t4`).set(t('Dated', 'Completed', '2026-11-01', { approvedAt: '2026-11-02T01:00:00.000Z' }));
  await db.doc(`${BASE}/activity/a1`).set({ id: 'a1', type: 'status_change', description: 'Changed "VAT filing" status: In Progress → Completed', createdAt: Timestamp.fromDate(new Date('2026-06-05T03:00:00Z')) });
}

let manifests = [];
const run = (extra = {}) => applyClosedAt(db, { pid: PID, FieldValue, writeManifest: (m) => { manifests.push(JSON.parse(JSON.stringify(m))); }, ...extra });
const data = async (path) => (await db.doc(path).get()).data();

describe('G1 p2-backfill-closed-at against the emulator', () => {
  beforeEach(async () => { await resetData(); await seed(); manifests = []; });
  afterAll(async () => { await cleanup(); });

  it('CAA-1 apply writes the dates (activity, end date), leaves open / dated tasks, logs one event', async () => {
    const prep = planClosedAt({ pid: PID, state: await readClosedAtState(db, PID) });
    const r = await run({ expectHash: prep.planHash });
    expect(r.verify).toEqual({ ok: true, mismatches: [] });
    expect(await data(`${BASE}/tasks/t1`)).toMatchObject({ approvedAt: '2026-06-05T03:00:00.000Z', approvedAtSource: 'activity', version: 2, updatedBy: CLOSEDAT_STAMP });
    expect(await data(`${BASE}/tasks/t2`)).toMatchObject({ approvedAt: '2026-05-10T16:59:59.000Z', approvedAtSource: 'end-date', version: 2 });
    expect((await data(`${BASE}/tasks/t3`)).approvedAt).toBeUndefined();
    expect(await data(`${BASE}/tasks/t4`)).toMatchObject({ approvedAt: '2026-11-02T01:00:00.000Z', version: 1 });
    const acts = (await db.collection(`${BASE}/activity`).get()).docs.map((d) => d.data().type);
    expect(acts.sort()).toEqual(['closed_dates_backfilled', 'status_change']);
    expect((await run()).noop).toBe(true);
  });

  it('CAA-2 stale hash -> PLAN_CHANGED; a task edited before commit -> STATE_CHANGED; nothing written', async () => {
    await expect(run({ expectHash: '0123456789abcdef' })).rejects.toMatchObject({ code: 'PLAN_CHANGED' });
    await expect(run({ hooks: { beforeCommit: async () => { await db.doc(`${BASE}/tasks/t1`).update({ version: 9 }); } } })).rejects.toMatchObject({ code: 'STATE_CHANGED' });
    expect((await data(`${BASE}/tasks/t2`)).approvedAt).toBeUndefined();
  });

  it('CAA-3 rollback removes the written dates, skips one changed since', async () => {
    await run();
    await db.doc(`${BASE}/tasks/t2`).update({ approvedAt: '2026-05-20T00:00:00.000Z' });
    const prep = await prepareClosedAtRollback(db, { manifest: manifests[0] });
    expect(prep.skipped.map((s) => s.id)).toEqual(['t2']);
    const r = await rollbackClosedAt(db, { manifest: manifests[0], expectHash: prep.hash, FieldValue });
    expect(r.verify.ok).toBe(true);
    const t1 = await data(`${BASE}/tasks/t1`);
    expect(t1.approvedAt).toBeUndefined();
    expect(t1.approvedAtSource).toBeUndefined();
    expect((await data(`${BASE}/tasks/t2`)).approvedAt).toBe('2026-05-20T00:00:00.000Z');
  });
});
