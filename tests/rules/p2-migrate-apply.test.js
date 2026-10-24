import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { applyMigration, prepareMigration } from '../../scripts/p2-migrate.mjs';
import { normaliseForV2 } from '../../scripts/lib/migrate-normalise.mjs';
import { SUBCOLS, RECORD_PATH, MIGRATE_STAMP } from '../../scripts/lib/migrate-plan.mjs';
import { loadV2Lists, assembleFromSnapshots, appValueFromV1, appValueFromV2 } from '../../src/readV2.js';
import { resetData, cleanup, asUser } from './helpers.js';

// P2.4 Task 5: in-place v1 -> v2 switch of one project (Admin SDK via FIRESTORE_EMULATOR_HOST).
const app = initializeApp({ projectId: 'demo-afmpt' }, 'p2-migrate-test');
const db = getFirestore(app);
const WS = 'workspaces/main';
const PID = 'proj_fx';
const BASE = `${WS}/projects/${PID}`;
const fixture = JSON.parse(readFileSync(new URL('../fixtures/v1-project.json', import.meta.url), 'utf8'));
const seedProject = { ...fixture, memberIds: ['uidZ'], roles: { uidZ: 'owner' }, rev: 9, writeId: 'w9' };
const entry = (id, ts, action) => ({ id, author: 'zara@smartosc.com', authorName: 'Zara Pham', action, timestamp: ts });
const seedEntries = [
  entry('e3', '2026-10-03T10:00:00.000Z', 'Updated task'),
  entry('e2', '2026-10-02T10:00:00.000Z', 'Added task'),
  entry('e1', '2026-10-01T10:00:00.000Z', 'Created project'),
];

async function seed() {
  await db.doc(WS).set({ workspaceOwner: 'hattt4@smartosc.com', ownerUids: ['u_hod'] });
  await db.doc(`${WS}/members/u_hod`).set({ email: 'hattt4@smartosc.com', displayName: 'Ha Truong', status: 'active' });
  await db.doc(`${WS}/members/uid1`).set({ email: 'alice@smartosc.com', displayName: 'Alice Nguyen', status: 'active' });
  await db.doc(`${WS}/members/uidZ`).set({ email: 'zara@smartosc.com', displayName: 'Zara Pham', status: 'active' });
  await db.doc(BASE).set(seedProject);
  await db.doc(`${WS}/activity/${PID}`).set({ entries: seedEntries });
}

let manifests = [];
const run = (extra = {}) => applyMigration(db, {
  pid: PID, assignments: null, now: Timestamp.now(), Timestamp, FieldValue,
  writeManifest: (m) => { manifests.push(JSON.parse(JSON.stringify(m))); },
  ...extra,
});
const countOf = async (path) => (await db.collection(path).get()).size;
const record = async () => (await db.doc(RECORD_PATH(PID)).get());

describe('P2.4 in-place migration (p2-migrate) against the emulator', () => {
  beforeEach(async () => { await resetData(); await seed(); manifests = []; });
  afterAll(async () => { await cleanup(); await deleteApp(app); });

  it('MIG-1: fresh apply flips the project, keeps v1 arrays frozen, copies activity, verifies', async () => {
    const prep = await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() });
    expect(prep.mode).toBe('fresh');
    expect(prep.blocked).toEqual([]);
    expect(prep.v1Rev).toBe(9);
    expect(prep.v1WriteId).toBe('w9');

    const r = await run();
    expect(r.mode).toBe('fresh');
    const p = (await db.doc(BASE).get()).data();
    expect(p.schemaVersion).toBe(2);
    expect(p.visibility).toBe('restricted');
    expect(p.memberUids).toContain('uidZ');
    expect(p.programs).toEqual(seedProject.programs);
    expect(p.actionItems).toEqual(seedProject.actionItems);
    expect(p.decisions).toEqual(seedProject.decisions);
    expect(p.rev).toBe(9);

    for (const kind of SUBCOLS) {
      expect(await countOf(`${BASE}/${kind}`)).toBe(prep.plan.report.docs[kind]);
    }
    const tasks = await db.collection(`${BASE}/tasks`).get();
    tasks.forEach((d) => expect(d.data()).toMatchObject({ version: 1, updatedBy: MIGRATE_STAMP, projectId: PID }));

    const act = await db.collection(`${BASE}/activity`).get();
    expect(act.size).toBe(3);
    act.forEach((d) => expect(d.data().copiedBy).toBe(MIGRATE_STAMP));
    expect(r.activityCopied).toBe(3);

    const rec = (await record()).data();
    expect(rec.status).toBe('verified');
    expect(rec.idMap).toHaveLength(2);
    expect(rec.v1Rev).toBe(9);
    expect(rec.history.map((h) => h.status)).toEqual(['prepared', 'switched', 'verified']);
    expect(r.verify.ok).toBe(true);

    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({ kind: 'p2-migrate', pid: PID, v1Rev: 9 });
    expect(manifests[0].idMap).toHaveLength(2);
  });

  it('MIG-2: the App read path, as a project member, loads the migrated project equal to the v1 tree', async () => {
    await run();
    const cz = await asUser('uidZ', 'zara@smartosc.com');
    const meta = (await getDoc(doc(cz, BASE))).data();
    const lists = await loadV2Lists({ collection, getDocs }, cz, 'main', PID);
    const { project, orphanCount } = assembleFromSnapshots({ meta, ...lists });
    const { __v2, ...got } = appValueFromV2(project, PID, orphanCount);
    expect(__v2).toEqual({ orphans: 0 });
    expect(got).toEqual(appValueFromV1(normaliseForV2(seedProject, { pid: PID }).project, PID));

    const out = await asUser('u_out', 'out@smartosc.com');
    await assertFails(getDoc(doc(out, `${BASE}/tasks/t1`)));
    const hod = await asUser('u_hod', 'hattt4@smartosc.com');
    await assertFails(getDoc(doc(hod, RECORD_PATH(PID))));
  });

  it('MIG-3: a v1 save between plan and flip -> REV_CHANGED, nothing visible; a re-run switches with no duplicates', async () => {
    await expect(run({ hooks: { beforeFlip: async () => { await db.doc(BASE).update({ rev: 10 }); } } }))
      .rejects.toMatchObject({ code: 'REV_CHANGED' });
    const p = (await db.doc(BASE).get()).data();
    expect('schemaVersion' in p).toBe(false);
    expect('programMeta' in p).toBe(false);
    expect(p.programs).toEqual(seedProject.programs);
    expect((await record()).data().status).toBe('prepared');

    const prep = await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() });
    expect(prep.mode).toBe('fresh');
    expect(prep.v1Rev).toBe(10);
    expect(prep.reconcile.toWrite).toEqual([]);
    expect(prep.reconcile.foreign).toEqual([]);

    const r = await run();
    expect(r.written).toBe(0);
    expect(r.verify.ok).toBe(true);
    expect(await countOf(`${BASE}/tasks`)).toBe(prep.plan.report.docs.tasks);
    expect((await db.doc(BASE).get()).data().schemaVersion).toBe(2);
    expect((await record()).data().status).toBe('verified');
  });

  it('MIG-4: a re-run after the switch never rewrites sub-docs and tops up the activity copy', async () => {
    await run();
    await db.doc(`${BASE}/tasks/t2`).update({ version: 2, updatedBy: 'uidZ', name: 'Edited' });
    const aref = db.doc(`${WS}/activity/${PID}`);
    const cur = (await aref.get()).data().entries;
    await aref.set({ entries: [entry('e4', '2026-10-04T10:00:00.000Z', 'Late v1 event'), ...cur] });

    const r = await run();
    expect(r.mode).toBe('post-flip');
    expect(r.written).toBe(0);
    expect(r.deleted).toBe(0);
    expect(r.activityCopied).toBe(1);
    expect((await db.doc(`${BASE}/tasks/t2`).get()).data()).toMatchObject({ version: 2, updatedBy: 'uidZ', name: 'Edited' });
    expect(await countOf(`${BASE}/activity`)).toBe(4);
    expect((await db.doc(`${BASE}/activity/e4`).get()).data().copiedBy).toBe(MIGRATE_STAMP);
  });

  it('MIG-5: foreign sub-docs refuse before any write; a v2 doc with no record is blocked', async () => {
    await db.doc(`${BASE}/tasks/x`).set({ name: 'stray', updatedBy: 'uidZ', version: 1 });
    let wrote = false;
    await expect(run({ writeManifest: () => { wrote = true; } })).rejects.toMatchObject({ code: 'FOREIGN_DOCS' });
    expect(wrote).toBe(false);
    expect((await record()).exists).toBe(false);
    expect('schemaVersion' in (await db.doc(BASE).get()).data()).toBe(false);
    expect((await db.collection(`${BASE}/tasks`).get()).docs.map((d) => d.id)).toEqual(['x']);

    await resetData();
    await seed();
    await db.doc(BASE).update({ schemaVersion: 2, programMeta: {}, memberUids: ['u_hod'], visibility: 'restricted' });
    const prep = await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() });
    expect(prep.mode).toBe('blocked');
    expect(prep.blocked.map((b) => b.code)).toContain('v2-not-migrated-here');
    await expect(run()).rejects.toMatchObject({ code: 'BLOCKED' });
    expect((await record()).exists).toBe(false);
  });

  it('MIG-6: a stale tab after the switch cannot save v1, its activity append is topped up by a re-run', async () => {
    await run();
    const cz = await asUser('uidZ', 'zara@smartosc.com');
    await assertFails(updateDoc(doc(cz, BASE), { name: 'x' }));

    const aref = doc(cz, `${WS}/activity/${PID}`);
    const cur = (await getDoc(aref)).data().entries;
    await assertSucceeds(updateDoc(aref, { entries: [entry('e_stale', '2026-10-24T09:00:00.000Z', 'Stale save'), ...cur] }));

    const r = await run();
    expect(r.mode).toBe('post-flip');
    expect(r.activityCopied).toBe(1);
    expect((await db.doc(`${BASE}/activity/e_stale`).get()).data()).toMatchObject({ copiedBy: MIGRATE_STAMP, authorUid: 'uidZ' });
  });
});
