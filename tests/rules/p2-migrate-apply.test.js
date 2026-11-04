import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import {
  applyMigration, prepareMigration, exitCodeFor, rollbackMigration, prepareRollback, formatRollbackPreview,
} from '../../scripts/p2-migrate.mjs';
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
  afterAll(async () => { await cleanup(); });

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
    expect(rec.history.every((h) => h.at instanceof Timestamp)).toBe(true);
    expect(r.edits).toBeNull();
    expect(exitCodeFor(r)).toBe(0);
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
    const firstHash = (await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() })).planHash;
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

    // The hash HOD approved before the v1 save no longer matches: refused, record untouched.
    expect(prep.planHash).not.toBe(firstHash);
    await expect(run({ expectHash: firstHash })).rejects.toMatchObject({ code: 'PLAN_CHANGED' });
    expect((await record()).data().history).toHaveLength(1);

    const r = await run({ expectHash: prep.planHash });
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
    // Drift from the v2 edit is expected: reported, not an error.
    expect(r.verify.ok).toBe(false);
    expect(r.edits.edited).toEqual([{ kind: 'tasks', id: 't2', version: 2, updatedBy: 'uidZ' }]);
    expect(exitCodeFor(r)).toBe(0);
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

  it('MIG-7: plan hash gate: a changed plan is refused before any write; a same-hash re-run is accepted', async () => {
    const prep = await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() });
    expect(prep.planHash).toMatch(/^[0-9a-f]{16}$/);
    const changed = seedProject.actionItems.map((a, i) => (i === 0 ? { ...a, title: 'Changed after preview' } : a));
    await db.doc(BASE).update({ actionItems: changed, rev: 10, writeId: 'w10' });
    let wrote = false;
    await expect(run({ expectHash: prep.planHash, writeManifest: () => { wrote = true; } }))
      .rejects.toMatchObject({ code: 'PLAN_CHANGED' });
    expect(wrote).toBe(false);
    expect((await record()).exists).toBe(false);
    expect(await countOf(`${BASE}/tasks`)).toBe(0);
    expect('schemaVersion' in (await db.doc(BASE).get()).data()).toBe(false);

    // A crash before the flip: the re-run sees the same plan (same hash) and applies.
    const p2 = await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() });
    const crash = async () => { throw Object.assign(new Error('crash'), { code: 'CRASH' }); };
    await expect(run({ expectHash: p2.planHash, hooks: { beforeFlip: crash } })).rejects.toMatchObject({ code: 'CRASH' });
    const p3 = await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() });
    expect(p3.planHash).toBe(p2.planHash);
    const r = await run({ expectHash: p2.planHash });
    expect(r.verify.ok).toBe(true);
    expect((await db.doc(BASE).get()).data().schemaVersion).toBe(2);
  });

  it('MIG-8: the switched status commits with the flip; a stuck prepared + v2 project recovers post-flip', async () => {
    const crash = async () => { throw Object.assign(new Error('crash'), { code: 'CRASH' }); };
    await expect(run({ hooks: { afterFlip: crash } })).rejects.toMatchObject({ code: 'CRASH' });
    expect((await db.doc(BASE).get()).data().schemaVersion).toBe(2);
    expect((await record()).data().status).toBe('switched');
    expect((await record()).data().history.map((h) => h.status)).toEqual(['prepared', 'switched']);
    const r = await run();
    expect(r.mode).toBe('post-flip');
    expect(r.activityCopied).toBe(3);
    expect(r.verify.ok).toBe(true);
    expect((await record()).data().status).toBe('verified');

    // Legacy stuck state (flip landed, status write did not).
    await db.doc(RECORD_PATH(PID)).update({ status: 'prepared' });
    expect((await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() })).mode).toBe('post-flip');
    const r2 = await run();
    expect(r2.mode).toBe('post-flip');
    expect((await record()).data().status).toBe('verified');

    // A prepared record for another v1 rev is not recovered.
    await db.doc(RECORD_PATH(PID)).update({ status: 'prepared', v1Rev: 3 });
    expect((await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() })).mode).toBe('blocked');
  });

  it('MIG-9: memberIds / roles / visibility changed between prepare and flip -> REV_CHANGED', async () => {
    for (const change of [{ memberIds: [] }, { roles: { uidZ: 'owner', uid1: 'operator' } }, { visibility: 'department' }]) {
      await resetData();
      await seed();
      await expect(run({ hooks: { beforeFlip: async () => { await db.doc(BASE).update(change); } } }))
        .rejects.toMatchObject({ code: 'REV_CHANGED' });
      expect('schemaVersion' in (await db.doc(BASE).get()).data()).toBe(false);
      expect((await record()).data().status).toBe('prepared');
    }
  });

  it('MIG-11: a memberIds uid without an active members doc is warned and covered by the plan hash', async () => {
    const before = await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() });
    expect(before.accessLoss).toEqual([]);
    await db.doc(`${WS}/members/uidOld`).set({ email: 'old@smartosc.com', displayName: 'Old Person', status: 'deactivated' });
    await db.doc(BASE).update({ memberIds: ['uidZ', 'uidOld'], roles: { uidZ: 'owner', uidOld: 'operator' } });
    const prep = await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() });
    expect(prep.accessLoss.map((m) => m.uid)).toEqual(['uidOld']);
    const w = prep.plan.report.issues.warnings.find((x) => x.code === 'member-not-active');
    expect(w.detail).toContain('Old Person');
    expect(prep.planHash).not.toBe(before.planHash);
    // Approving the earlier preview does not approve the access loss.
    await expect(run({ expectHash: before.planHash })).rejects.toMatchObject({ code: 'PLAN_CHANGED' });
    const r = await run({ expectHash: prep.planHash });
    expect(r.verify.ok).toBe(true);
  });

  it('MIG-12: the before-image is re-taken from the live doc on every prepared run', async () => {
    const crash = async () => { throw Object.assign(new Error('crash'), { code: 'CRASH' }); };
    await expect(run({ hooks: { beforeFlip: crash } })).rejects.toMatchObject({ code: 'CRASH' });
    expect((await record()).data().before).toEqual({});
    await db.doc(BASE).update({ visibility: 'department', rev: 10, writeId: 'w10' });
    await run();
    expect((await record()).data().before).toEqual({ visibility: 'department' });
    await rollbackMigration(db, {
      pid: PID, FieldValue, Timestamp, writeLostReport: () => {},
    });
    expect((await db.doc(BASE).get()).data().visibility).toBe('department');
  });

  it('MIG-10: a switch that never verified exits 2 on any mismatch, even with v2 edits present', async () => {
    const crash = async () => { throw Object.assign(new Error('crash'), { code: 'CRASH' }); };
    await expect(run({ hooks: { afterFlip: crash } })).rejects.toMatchObject({ code: 'CRASH' });
    expect((await record()).data().status).toBe('switched');
    await db.doc(`${BASE}/tasks/t2`).update({ version: 2, updatedBy: 'uidZ', name: 'Edited' });
    await db.doc(`${BASE}/tasks/t1`).delete(); // a real missing sub-doc
    const r = await run();
    expect(r.mode).toBe('post-flip');
    expect(r.wasVerified).toBe(false);
    expect(r.verify.ok).toBe(false);
    expect(r.edits.edited.length).toBeGreaterThan(0);
    expect(exitCodeFor(r)).toBe(2);
    expect((await record()).data().status).toBe('switched');
  });
});

// P2.4 Task 6: rollback (Ruling P4-7, hash gate P4-16).
describe('P2.4 migration rollback (p2-migrate --rollback) against the emulator', () => {
  beforeEach(async () => { await resetData(); await seed(); manifests = []; });

  let lost = [];
  const rb = (extra = {}) => rollbackMigration(db, {
    pid: PID, force: false, deleteDocs: false, FieldValue, Timestamp,
    writeLostReport: (o) => { lost.push(JSON.parse(JSON.stringify(o))); },
    ...extra,
  });
  const ALL = [...SUBCOLS, 'activity'];
  // Everything rollback could touch, with update times: equal dumps = nothing written.
  const dump = async () => {
    const snap = async (path) => { const s = await db.doc(path).get(); return s.exists ? { t: s.updateTime.toMillis(), d: s.data() } : null; };
    const out = { project: await snap(BASE), record: await snap(RECORD_PATH(PID)) };
    for (const k of ALL) {
      const docs = (await db.collection(`${BASE}/${k}`).get()).docs;
      out[k] = docs.map((d) => `${d.id}@${d.updateTime.toMillis()}`).sort();
    }
    return JSON.stringify(out);
  };
  const V2_FIELDS = ['schemaVersion', 'programMeta', 'memberUids', 'visibility'];
  beforeEach(() => { lost = []; });

  it('RB-1: rollback after a clean apply restores v1 fields, keeps memberIds and v2 docs; a re-apply verifies', async () => {
    await run();
    const afterApply = (await db.doc(BASE).get()).data();
    const r = await rb();
    expect(r.edits.clean).toBe(true);
    expect(r.flippedBack).toBe(true);
    expect(r.deleted).toBe(0);
    expect(lost).toEqual([]);
    const live = (await db.doc(BASE).get()).data();
    for (const k of V2_FIELDS) expect(k in live).toBe(false);
    expect(live.memberIds).toEqual(afterApply.memberIds);
    // Fix round 1: rev / writeId bumped so stale v1 tabs hit the conflict banner.
    expect(live.rev).toBe((afterApply.rev ?? 0) + 1);
    expect(live.writeId).toMatch(/^p2-rollback-/);
    expect(live.programs).toEqual(seedProject.programs);
    expect(appValueFromV1(live, PID)).toEqual(appValueFromV1(seedProject, PID));
    const rec = (await record()).data();
    expect(rec.status).toBe('rolled-back');
    expect(rec.history.map((h) => h.status)).toEqual(['prepared', 'switched', 'verified', 'rolled-back']);
    expect(rec.history.at(-1).at instanceof Timestamp).toBe(true);
    // v2 docs stay (no --delete-v2-docs), invisible again.
    expect(await countOf(`${BASE}/tasks`)).toBeGreaterThan(0);
    expect(r.leftover.length).toBeGreaterThan(0);

    // A second apply reuses the stamped docs and verifies.
    const prep = await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() });
    expect(prep.mode).toBe('fresh');
    expect(prep.reconcile.toWrite).toEqual([]);
    expect(prep.reconcile.foreign).toEqual([]);
    const r2 = await run({ expectHash: prep.planHash });
    expect(r2.verify.ok).toBe(true);
    expect((await db.doc(BASE).get()).data().schemaVersion).toBe(2);
    expect((await record()).data().status).toBe('verified');
  });

  it('RB-2: a v2 edit refuses rollback (EDITS_FOUND, nothing written); forced, the lost-data report comes before any write', async () => {
    await run();
    await db.doc(`${BASE}/tasks/t2`).update({ version: 2, updatedBy: 'uidZ', name: 'Edited in v2' });
    const before = await dump();
    const err = await rb().catch((e) => e);
    expect(err).toMatchObject({ code: 'EDITS_FOUND' });
    expect(err.edits.edited).toEqual([{ kind: 'tasks', id: 't2', version: 2, updatedBy: 'uidZ' }]);
    expect(lost).toEqual([]);
    expect(await dump()).toBe(before);
    expect((await db.doc(BASE).get()).data().schemaVersion).toBe(2);

    let seenVersion = 'not called';
    const calls = [];
    const r = await rollbackMigration(db, {
      pid: PID, force: true, deleteDocs: false, FieldValue, Timestamp,
      writeLostReport: async (o) => {
        calls.push(JSON.parse(JSON.stringify(o)));
        seenVersion = (await db.doc(BASE).get()).data().schemaVersion;
        expect(await dump()).toBe(before);
      },
    });
    expect(calls).toHaveLength(1);
    expect(seenVersion).toBe(2);
    expect(calls[0].docs.tasks.t2).toMatchObject({ version: 2, updatedBy: 'uidZ', name: 'Edited in v2' });
    expect(calls[0].edits.edited).toEqual([{ kind: 'tasks', id: 't2', version: 2, updatedBy: 'uidZ' }]);
    expect(r.flippedBack).toBe(true);
    expect('schemaVersion' in (await db.doc(BASE).get()).data()).toBe(false);
    // No --delete-v2-docs: the edited doc is kept.
    expect((await db.doc(`${BASE}/tasks/t2`).get()).exists).toBe(true);
    expect((await record()).data().status).toBe('rolled-back');
  });

  it('RB-3: --delete-v2-docs empties the sub-collections and copied activity; a client event refuses without force', async () => {
    await run();
    const r = await rb({ deleteDocs: true });
    for (const k of ALL) expect(await countOf(`${BASE}/${k}`)).toBe(0);
    expect(r.leftover).toEqual([]);
    expect(r.deleted).toBeGreaterThan(0);

    await resetData();
    await seed();
    await run();
    await db.doc(`${BASE}/activity/evt_client`).set({ action: 'Commented', author: 'Zara Pham', createdAt: Timestamp.now() });
    const before = await dump();
    await expect(rb({ deleteDocs: true })).rejects.toMatchObject({ code: 'EDITS_FOUND' });
    expect(await dump()).toBe(before);

    const r2 = await rb({ deleteDocs: true, force: true });
    expect(lost).toHaveLength(1);
    expect(lost[0].newActivity.map((a) => a.id)).toEqual(['evt_client']);
    expect(r2.leftover).toEqual([]);
    for (const k of ALL) expect(await countOf(`${BASE}/${k}`)).toBe(0);
  });

  it('RB-4: no record (or already rolled back) -> NOT_MIGRATED, nothing written', async () => {
    const before = await dump();
    await expect(rb()).rejects.toMatchObject({ code: 'NOT_MIGRATED' });
    expect(await dump()).toBe(before);
    expect((await record()).exists).toBe(false);

    await run();
    await rb();
    const after = await dump();
    await expect(rb()).rejects.toMatchObject({ code: 'NOT_MIGRATED' });
    expect(await dump()).toBe(after);
  });

  it('RB-5: the preview writes nothing; the hash gate refuses a changed or wrong plan; the restore re-checks in its transaction', async () => {
    await run();
    const before = await dump();
    const p = await prepareRollback(db, { pid: PID, force: false, deleteDocs: false });
    expect(p.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(p.blocked).toEqual([]);
    const text = formatRollbackPreview(p, { pid: PID }).join('\n');
    expect(text).toMatch(/schemaVersion +\(absent\) <- 2/);
    expect(text).toMatch(/visibility +\(absent\) <- "restricted"/);
    expect(text).toContain(`--expect ${p.hash}`);
    expect(await dump()).toBe(before);
    // Flags are part of the approved plan.
    expect((await prepareRollback(db, { pid: PID, force: false, deleteDocs: true })).hash).not.toBe(p.hash);
    expect((await prepareRollback(db, { pid: PID, force: true, deleteDocs: false })).hash).not.toBe(p.hash);
    // Stable across re-reads.
    expect((await prepareRollback(db, { pid: PID, force: false, deleteDocs: false })).hash).toBe(p.hash);

    await expect(rb({ expectHash: '0000000000000000' })).rejects.toMatchObject({ code: 'PLAN_CHANGED' });
    expect(await dump()).toBe(before);

    // An edit after the forced preview: refused before the lost-data report.
    const pf = await prepareRollback(db, { pid: PID, force: true, deleteDocs: false });
    await db.doc(`${BASE}/tasks/t1`).update({ version: 2, updatedBy: 'uidZ' });
    const e1 = await rb({ force: true, expectHash: pf.hash }).catch((e) => e);
    expect(e1).toMatchObject({ code: 'PLAN_CHANGED' });
    expect(e1.lostReportVoid).toBeFalsy(); // no lost-data file was written
    expect(lost).toEqual([]);
    expect((await db.doc(BASE).get()).data().schemaVersion).toBe(2);

    // An edit after the lost-data report (inside the window): the transaction refuses.
    const pf2 = await prepareRollback(db, { pid: PID, force: true, deleteDocs: false });
    const e2 = await rb({
      force: true, expectHash: pf2.hash,
      hooks: { beforeFlipBack: async () => { await db.doc(`${BASE}/tasks/t2`).update({ version: 2, updatedBy: 'uidZ' }); } },
    }).catch((e) => e);
    expect(e2).toMatchObject({ code: 'PLAN_CHANGED' });
    // Fix round 1: the lost-data file was written, but nothing was rolled back.
    expect(lost.length).toBe(1);
    expect(e2.lostReportVoid).toBe(true);
    expect((await db.doc(BASE).get()).data().schemaVersion).toBe(2);
    expect((await record()).data().status).toBe('verified');

    const pf3 = await prepareRollback(db, { pid: PID, force: true, deleteDocs: false });
    const r = await rb({ force: true, expectHash: pf3.hash });
    expect(r.flippedBack).toBe(true);
  });

  it('RB-6: migrate -> rollback -> migrate re-takes the before-image; a second rollback restores it', async () => {
    await run();
    const rev0 = (await db.doc(BASE).get()).data().rev ?? 0;
    await rb();
    expect((await db.doc(BASE).get()).data().rev).toBe(rev0 + 1);
    await db.doc(BASE).update({ visibility: 'department' }); // Owner changed it while back on v1
    const prep = await prepareMigration(db, { pid: PID, assignments: null, now: Timestamp.now() });
    expect(prep.record.before).toEqual({ visibility: 'department' });
    const r = await run({ expectHash: prep.planHash });
    expect(r.verify.ok).toBe(true);
    const rec = (await record()).data();
    expect(rec.before).toEqual({ visibility: 'department' });
    expect(rec.history.map((h) => h.status)).toEqual(['prepared', 'switched', 'verified', 'rolled-back', 'prepared', 'switched', 'verified']);
    const rev1 = (await db.doc(BASE).get()).data().rev ?? 0;
    await rb();
    const live = (await db.doc(BASE).get()).data();
    expect(live.rev).toBe(rev1 + 1);
    expect(live.writeId).toMatch(/^p2-rollback-/);
    expect(live.visibility).toBe('department');
    expect('schemaVersion' in live).toBe(false);
    expect('programMeta' in live).toBe(false);
  });

  // Fix round 1: wasVerified looks at the current cycle only (history accumulates
  // across migrate -> rollback cycles).
  it('MIG-10 after a migrate -> rollback cycle: a switch that never verified in this cycle exits 2', async () => {
    await run();
    await rb();
    expect((await record()).data().history.some((h) => h.status === 'verified')).toBe(true);
    const crash = async () => { throw Object.assign(new Error('crash'), { code: 'CRASH' }); };
    await expect(run({ hooks: { afterFlip: crash } })).rejects.toMatchObject({ code: 'CRASH' });
    expect((await record()).data().status).toBe('switched');
    await db.doc(`${BASE}/tasks/t2`).update({ version: 2, updatedBy: 'uidZ', name: 'Edited' });
    await db.doc(`${BASE}/tasks/t1`).delete();
    const r = await run();
    expect(r.mode).toBe('post-flip');
    expect(r.wasVerified).toBe(false);
    expect(r.verify.ok).toBe(false);
    expect(r.edits.edited.length).toBeGreaterThan(0);
    expect(exitCodeFor(r)).toBe(2);
    expect((await record()).data().status).toBe('switched');
  });
});

afterAll(async () => { await cleanup(); await deleteApp(app); });
