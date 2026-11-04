import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { applyMigration, prepareRollback } from '../../scripts/p2-migrate.mjs';
import { prepareRestore, readLive, applyRestore, restoreExitCode, formatRestorePreview } from '../../scripts/p2-restore.mjs';
import { buildSnapshot, RESTORES_PATH, restoreIdOf, RESTORE_STAMP } from '../../scripts/lib/restore-plan.mjs';
import { loadV2Lists, assembleFromSnapshots, appValueFromV2 } from '../../src/readV2.js';
import { resetData, cleanup, asUser } from './helpers.js';

// P2.4b Tasks 3-4: the restore preview reads Firestore and writes nothing; the apply is
// hash-gated, writes the snapshot first and everything else in one transaction
// (Admin SDK via FIRESTORE_EMULATOR_HOST).
const app = initializeApp({ projectId: 'demo-afmpt' }, 'p2-restore-test');
const db = getFirestore(app);
const WS = 'workspaces/main';
const PID = 'proj_fx';
const BASE = `${WS}/projects/${PID}`;
const fixture = JSON.parse(readFileSync(new URL('../fixtures/v1-project.json', import.meta.url), 'utf8'));
const seedProject = { ...fixture, memberIds: ['uidZ'], roles: { uidZ: 'owner' }, rev: 9, writeId: 'w9' };

async function seed() {
  await db.doc(WS).set({ workspaceOwner: 'hattt4@smartosc.com', ownerUids: ['u_hod'] });
  await db.doc(`${WS}/members/u_hod`).set({ email: 'hattt4@smartosc.com', displayName: 'Ha Truong', status: 'active' });
  await db.doc(`${WS}/members/uid1`).set({ email: 'alice@smartosc.com', displayName: 'Alice Nguyen', status: 'active' });
  await db.doc(`${WS}/members/uidZ`).set({ email: 'zara@smartosc.com', displayName: 'Zara Pham', status: 'active' });
  await db.doc(BASE).set(seedProject);
  await db.doc(`${WS}/activity/${PID}`).set({
    entries: [
      { id: 'e2', author: 'zara@smartosc.com', authorName: 'Zara Pham', action: 'Added task', timestamp: '2026-10-02T10:00:00.000Z' },
      { id: 'e1', author: 'zara@smartosc.com', authorName: 'Zara Pham', action: 'Created project', timestamp: '2026-10-01T10:00:00.000Z' },
    ],
  });
}

// Every doc under workspaces/main (project, sub-collections, members, records) as path -> JSON.
async function dumpAll() {
  const out = {};
  const walk = async (ref) => {
    for (const col of await ref.listCollections()) {
      for (const d of (await col.get()).docs) {
        out[d.ref.path] = JSON.stringify(d.data());
        await walk(d.ref);
      }
    }
  };
  const root = db.doc(WS);
  out[WS] = JSON.stringify((await root.get()).data());
  await walk(root);
  return out;
}

// A pre-migration (v1 shape) backup: ids normalise exactly as the migration did (Ruling P4b-1).
const backupOfFixture = () => ({ meta: { projectIds: [PID] }, projects: { [PID]: structuredClone(fixture) }, activity: {} });

describe('P2.4b restore preview (p2-restore) against the emulator', () => {
  beforeEach(async () => { await resetData(); await seed(); });
  afterAll(async () => { await cleanup(); });

  it('RS-0: preview plans one update for a renamed workstream and writes nothing', async () => {
    await applyMigration(db, {
      pid: PID, assignments: null, now: Timestamp.now(), Timestamp, FieldValue, writeManifest: () => {},
    });
    const backup = backupOfFixture();
    const w1 = backup.projects[PID].programs.flatMap((p) => p.workstreams).find((w) => w.id === 'w1');
    w1.name = 'WS One (from backup)';

    const before = await dumpAll();
    const prep = await prepareRestore(db, { pid: PID, backup, backupName: 'b.json', backupSha256: 'a'.repeat(64), Timestamp });
    expect(prep.blocked).toEqual([]);
    expect(prep.mode).toBe('restore');
    expect(prep.hasMigrationRecord).toBe(true);
    expect(prep.warnings.map((w) => w.code)).toContain('migration-rollback-affected');
    expect(prep.ops.map(({ kind, op, id }) => ({ kind, op, id }))).toEqual([{ kind: 'workstreams', op: 'update', id: 'w1' }]);
    expect(prep.planHash).toMatch(/^[0-9a-f]{16}$/);
    expect(await dumpAll()).toEqual(before);
  });

  // ------------------------------------------------------------------ apply (Task 4)

  const OTHER = 'proj_other';
  const migrate = (pid) => applyMigration(db, {
    pid, assignments: null, now: Timestamp.now(), Timestamp, FieldValue, writeManifest: () => {},
  });
  const T9 = {
    id: 't9', name: 'Late task', status: 'Completed', pic: '', contributors: [],
    updates: [{ id: 'u9', text: 'done it', authorUid: 'uidZ' }],
    workspaceId: 'main', projectId: PID, programId: 'pg1', workstreamId: 'w1', order: 99,
    picUid: null, picEmail: null, contributorUids: [], version: 1, updatedBy: 'uidZ',
  };

  // RS seed: proj_fx migrated, then App-like edits after the backup; proj_other migrated
  // and never touched. Returns the backup (the live tree before t9 and the w1 rename).
  async function seedApply() {
    await db.doc(`${WS}/projects/${OTHER}`).set({ ...seedProject, id: OTHER, name: 'Other Project' });
    await migrate(PID);
    await migrate(OTHER);
    await db.doc(BASE).update({ 'programMeta.pg1.pmUid': 'uid1' });
    const t2 = (await db.doc(`${BASE}/tasks/t2`).get()).data();
    await db.doc(`${BASE}/tasks/t2`).set({ ...t2, version: 2, updatedBy: 'uidZ', updates: [{ id: 'u7', text: 'x', authorUid: 'uidZ' }] });
    // The backup is taken here (Backup JSON shape, as the snapshot file).
    const { live } = await readLive(db, PID, null, Timestamp);
    const backup = buildSnapshot(live, { ops: [] }, { pid: PID, backupName: 'b.json', backupSha256: null, createdAt: null });
    delete backup.restoreSnapshot;
    const w1 = (await db.doc(`${BASE}/workstreams/w1`).get()).data();
    await db.doc(`${BASE}/workstreams/w1`).set({ ...w1, name: 'WS One (renamed live)', version: 2, updatedBy: 'uidZ' });
    await db.doc(`${BASE}/tasks/t9`).set(T9);
    return backup;
  }

  const SHA = 'b'.repeat(64);
  const prep = (backup, extra = {}) => prepareRestore(db, { pid: PID, backup, backupName: 'b.json', backupSha256: SHA, Timestamp, ...extra });
  const apply = (backup, extra = {}) => applyRestore(db, {
    pid: PID, backup, backupName: 'b.json', backupSha256: SHA, allowHistoryLoss: false, FieldValue, Timestamp,
    writeSnapshot: () => {}, ...extra,
  });
  const dumpUnder = async (prefix) => Object.fromEntries(
    Object.entries(await dumpAll()).filter(([k]) => k === prefix || k.startsWith(`${prefix}/`)),
  );
  const restoresCount = async () => (await db.collection(`${WS}/restores`).get()).size;
  const tasksOfBackup = (b) => b.projects[PID].programs.flatMap((pg) => pg.workstreams).flatMap((w) => w.tasks);

  it('RS-1: apply restores w1, drops t9 with its updates, keeps uids/access/activity, records, verifies; App reads it', async () => {
    const backup = await seedApply();
    const otherBefore = await dumpUnder(`${WS}/projects/${OTHER}`);
    expect(Object.keys(otherBefore).length).toBeGreaterThan(3);
    const metaBefore = (await db.doc(BASE).get()).data();
    const actBefore = Object.fromEntries((await db.collection(`${BASE}/activity`).get()).docs.map((d) => [d.id, JSON.stringify(d.data())]));
    expect(Object.keys(actBefore).length).toBe(2);

    const p = await prep(backup);
    expect(p.blocked).toEqual([]);
    expect(p.mode).toBe('restore');
    expect(p.refused).toBeNull();
    const snaps = [];
    const r = await apply(backup, {
      expectHash: p.planHash,
      writeSnapshot: async (obj) => {
        // Runs before Firestore changes: w1 still has the live (renamed) name.
        snaps.push({ obj, w1: (await db.doc(`${BASE}/workstreams/w1`).get()).data().name });
      },
    });
    expect(r.mode).toBe('restore');
    expect(r.restoreId).toBe(restoreIdOf(PID, p.planHash));
    expect(r.verify).toEqual({ ok: true, diffs: [] });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].w1).toBe('WS One (renamed live)');
    expect(snaps[0].obj.restoreSnapshot.planHash).toBe(p.planHash);

    const w1 = (await db.doc(`${BASE}/workstreams/w1`).get()).data();
    expect(w1).toMatchObject({ name: 'WS One', version: 3, updatedBy: RESTORE_STAMP });
    expect(w1.updatedAt).toBeInstanceOf(Timestamp);
    const t9 = (await db.doc(`${BASE}/tasks/t9`).get()).data();
    expect(t9.status).toBe('Dropped');
    expect(t9.updates).toEqual(T9.updates);
    expect(t9).toMatchObject({ version: 2, updatedBy: RESTORE_STAMP });
    const t2 = (await db.doc(`${BASE}/tasks/t2`).get()).data();
    expect(t2.updates[0].authorUid).toBe('uidZ');
    expect(t2).toMatchObject({ version: 2, updatedBy: 'uidZ' }); // unchanged, so not written

    const m = (await db.doc(BASE).get()).data();
    expect(m.schemaVersion).toBe(2);
    for (const k of ['memberIds', 'memberUids', 'roles', 'visibility', 'programs', 'actionItems', 'decisions', 'rev', 'writeId']) {
      expect(m[k]).toEqual(metaBefore[k]);
    }
    expect(m.programMeta.pg1.pmUid).toBe('uid1');

    const act = (await db.collection(`${BASE}/activity`).get()).docs;
    expect(act).toHaveLength(Object.keys(actBefore).length + 1);
    for (const d of act) if (d.id in actBefore) expect(JSON.stringify(d.data())).toBe(actBefore[d.id]);
    const ev = act.find((d) => !(d.id in actBefore));
    expect(ev.id).toBe(`restore_${p.planHash}`);
    expect(ev.data()).toMatchObject({
      id: ev.id, type: 'project_restore', author: RESTORE_STAMP, authorName: 'Restore (Admin script)', authorUid: null,
      projectId: PID, workspaceId: 'main', restoreId: r.restoreId,
    });
    expect(ev.data().description).toContain('b.json');
    expect(ev.data().createdAt).toBeInstanceOf(Timestamp);

    const rec = (await db.doc(RESTORES_PATH(r.restoreId)).get()).data();
    expect(rec).toMatchObject({
      pid: PID, planHash: p.planHash, fingerprint: p.fingerprint, backupFile: 'b.json', backupSha256: SHA,
      allowHistoryLoss: false, by: RESTORE_STAMP,
      counts: { create: 0, update: 2, retained: 1, droppedTasks: 1, cancelledActions: 0, historyLost: 0 },
    });
    expect(rec.at).toBeInstanceOf(Timestamp);
    expect(await dumpUnder(`${WS}/projects/${OTHER}`)).toEqual(otherBefore);

    // Re-run: nothing left to restore (Ruling P4b-12).
    expect((await prep(backup)).mode).toBe('noop');

    // The App read path, as a project member, loads the restored project (as MIG-2).
    const cz = await asUser('uidZ', 'zara@smartosc.com');
    const meta = (await getDoc(doc(cz, BASE))).data();
    const lists = await loadV2Lists({ collection, getDocs }, cz, 'main', PID);
    const { project, orphanCount } = assembleFromSnapshots({ meta, ...lists });
    const got = appValueFromV2(project, PID, orphanCount);
    expect(got.__v2).toEqual({ orphans: 0 });
    const tasks = got.programs.flatMap((pg) => pg.workstreams).flatMap((w) => w.tasks);
    expect(tasks.find((t) => t.id === 't9').status).toBe('Dropped');
    expect(got.programs.flatMap((pg) => pg.workstreams).find((w) => w.id === 'w1').name).toBe('WS One');
    await assertFails(getDoc(doc(cz, RESTORES_PATH(r.restoreId))));
    const hod = await asUser('u_hod', 'hattt4@smartosc.com');
    await assertFails(getDoc(doc(hod, RESTORES_PATH(r.restoreId))));
  });

  it('RS-2: a wrong --expect hash -> PLAN_CHANGED, no snapshot, nothing written', async () => {
    const backup = await seedApply();
    const before = await dumpAll();
    let called = 0;
    const err = await apply(backup, { expectHash: '0123456789abcdef', writeSnapshot: () => { called++; } }).catch((e) => e);
    expect(err).toMatchObject({ code: 'PLAN_CHANGED' });
    expect(restoreExitCode(err)).toBe(1);
    expect(called).toBe(0);
    expect(await restoresCount()).toBe(0);
    expect(await dumpAll()).toEqual(before);
  });

  it('RS-3: a save between preview and apply -> STATE_CHANGED, snapshot void, nothing written; new hash', async () => {
    const backup = await seedApply();
    const p = await prep(backup);
    let afterSave = null;
    let called = 0;
    const err = await apply(backup, {
      expectHash: p.planHash,
      writeSnapshot: () => { called++; },
      hooks: {
        beforeTx: async () => {
          const t1 = (await db.doc(`${BASE}/tasks/t1`).get()).data();
          await db.doc(`${BASE}/tasks/t1`).set({ ...t1, version: t1.version + 1, updatedBy: 'uidZ' });
          afterSave = await dumpAll();
        },
      },
    }).catch((e) => e);
    expect(err).toMatchObject({ code: 'STATE_CHANGED', snapshotVoid: true });
    expect(restoreExitCode(err)).toBe(1);
    expect(called).toBe(1);
    expect(await dumpAll()).toEqual(afterSave);
    expect(await restoresCount()).toBe(0);
    expect((await db.doc(`${BASE}/activity/restore_${p.planHash}`).get()).exists).toBe(false);
    const fresh = await prep(backup);
    expect(fresh.planHash).toMatch(/^[0-9a-f]{16}$/);
    expect(fresh.planHash).not.toBe(p.planHash);
  });

  it('RS-4: history loss refuses without the flag (exit 3); with it the snapshot keeps the lost entry', async () => {
    const backup = await seedApply();
    tasksOfBackup(backup).find((t) => t.id === 't2').updates = [];
    const refused = await prep(backup);
    expect(refused.refused).toBe('history-loss');
    const before = await dumpAll();
    let called = 0;
    const err = await apply(backup, { expectHash: refused.planHash, writeSnapshot: () => { called++; } }).catch((e) => e);
    expect(err).toMatchObject({ code: 'HISTORY_LOSS' });
    expect(restoreExitCode(err)).toBe(3);
    expect(called).toBe(0);
    expect(await dumpAll()).toEqual(before);

    const allowed = await prep(backup, { allowHistoryLoss: true });
    expect(allowed.refused).toBeNull();
    expect(allowed.planHash).not.toBe(refused.planHash);
    const snaps = [];
    const r = await apply(backup, { allowHistoryLoss: true, expectHash: allowed.planHash, writeSnapshot: (o) => { snaps.push(o); } });
    expect(r.verify.ok).toBe(true);
    expect(restoreExitCode(r)).toBe(0);
    expect(snaps).toHaveLength(1);
    const snapT2 = snaps[0].restoreSnapshot.docs.tasks.find((d) => d.id === 't2');
    expect(snapT2.data.updates.map((u) => u.id)).toContain('u7');
    expect((await db.doc(`${BASE}/tasks/t2`).get()).data().updates).toEqual([]);
    const rec = (await db.doc(RESTORES_PATH(r.restoreId)).get()).data();
    expect(rec.allowHistoryLoss).toBe(true);
    expect(rec.counts.historyLost).toBe(1);
  });

  // Assembled App value of the live project (the Backup JSON project shape).
  const liveTree = async () => buildSnapshot((await readLive(db, PID, null, Timestamp)).live, { ops: [] }, { pid: PID }).projects[PID];
  const versions = async () => {
    const { live } = await readLive(db, PID, null, Timestamp);
    return Object.fromEntries(Object.entries(live.docs).flatMap(([k, list]) => list.map((d) => [`${k}/${d.id}`, d.data.version])));
  };
  const activityCount = async () => (await db.collection(`${BASE}/activity`).get()).size;

  it('RS-6: a re-run after an apply is a noop that writes nothing; the preview says Nothing to restore (exit 0)', async () => {
    const backup = await seedApply();
    const p = await prep(backup);
    await apply(backup, { expectHash: p.planHash });
    const before = { versions: await versions(), activity: await activityCount(), records: await restoresCount(), all: await dumpAll() };

    const again = await prep(backup);
    expect(again.mode).toBe('noop');
    expect(again.planHash).toBeNull();
    let called = 0;
    // noop returns before the hash check: even a stale hash writes nothing.
    const r = await apply(backup, { expectHash: p.planHash, writeSnapshot: () => { called++; } });
    expect(r).toMatchObject({ mode: 'noop', restoreId: null, written: 0, verify: { ok: true, diffs: [] } });
    expect(restoreExitCode(r)).toBe(0);
    expect(called).toBe(0);
    expect(await versions()).toEqual(before.versions);
    expect(await activityCount()).toBe(before.activity);
    expect(await restoresCount()).toBe(before.records);
    expect(await dumpAll()).toEqual(before.all);

    const text = formatRestorePreview(again, { pid: PID }).join('\n');
    expect(text).toContain('Nothing to restore');
    expect(text).not.toMatch(/Plan hash:/);
  });

  it('RS-7: restoring from the snapshot of an apply reverses it; a backup-only task stays Dropped', async () => {
    const backup = await seedApply();
    tasksOfBackup(backup).find((t) => t.id === 't2').updates = [];
    backup.projects[PID].programs.flatMap((pg) => pg.workstreams).find((w) => w.id === 'w1').tasks
      .push({ id: 'tN', name: 'Backup only', status: 'Not Started', pic: '', contributors: [] });
    const treeBefore = await liveTree();
    const allowed = await prep(backup, { allowHistoryLoss: true });
    expect(allowed.ops.find((o) => o.id === 'tN')).toMatchObject({ kind: 'tasks', op: 'create' });
    const snaps = [];
    const first = await apply(backup, { allowHistoryLoss: true, expectHash: allowed.planHash, writeSnapshot: (o) => { snaps.push(o); } });
    expect(first.verify.ok).toBe(true);
    expect((await db.doc(`${BASE}/tasks/t9`).get()).data().status).toBe('Dropped');
    expect((await db.doc(`${BASE}/tasks/tN`).get()).data().status).toBe('Not Started');

    // The snapshot file is a Backup JSON (Ruling P4b-10): feed it back as --backup.
    const snapshot = JSON.parse(JSON.stringify(snaps[0]));
    const back = await prepareRestore(db, { pid: PID, backup: snapshot, backupName: 'snap.json', backupSha256: SHA, Timestamp });
    expect(back.blocked).toEqual([]);
    expect(back.refused).toBeNull();
    expect(back.mode).toBe('restore');
    expect(back.report.retained).toEqual([expect.objectContaining({ kind: 'task', id: 'tN', newStatus: 'Dropped' })]);
    const r = await applyRestore(db, {
      pid: PID, backup: snapshot, backupName: 'snap.json', backupSha256: SHA, allowHistoryLoss: false,
      expectHash: back.planHash, FieldValue, Timestamp, writeSnapshot: () => {},
    });
    expect(r.verify).toEqual({ ok: true, diffs: [] });
    expect((await db.doc(`${BASE}/tasks/t2`).get()).data().updates.map((u) => u.id)).toEqual(['u7']);
    expect((await db.doc(`${BASE}/tasks/t9`).get()).data().status).toBe('Completed');
    expect((await db.doc(`${BASE}/workstreams/w1`).get()).data().name).toBe('WS One (renamed live)');
    expect((await db.doc(`${BASE}/tasks/tN`).get()).data().status).toBe('Dropped');

    // Every item that existed before the first apply is back as it was; tN is the only extra.
    const treeAfter = await liveTree();
    const w1After = treeAfter.programs.flatMap((pg) => pg.workstreams).find((w) => w.id === 'w1');
    expect(w1After.tasks[w1After.tasks.length - 1].id).toBe('tN');
    w1After.tasks = w1After.tasks.filter((t) => t.id !== 'tN');
    expect(treeAfter).toEqual(treeBefore);

    expect(await restoresCount()).toBe(2);
    const events = (await db.collection(`${BASE}/activity`).get()).docs.filter((d) => d.id.startsWith('restore_'));
    expect(events.map((d) => d.id).sort()).toEqual([`restore_${allowed.planHash}`, `restore_${back.planHash}`].sort());
    expect((await prepareRestore(db, { pid: PID, backup: snapshot, backupName: 'snap.json', backupSha256: SHA, Timestamp })).mode).toBe('noop');
  });

  it('RS-8: after a restore, p2-migrate --rollback lists the restored docs as edited and refuses without force', async () => {
    const backup = await seedApply();
    const p = await prep(backup);
    await apply(backup, { expectHash: p.planHash });
    const rb = await prepareRollback(db, { pid: PID, force: false, deleteDocs: false });
    expect(rb.blocked).toEqual([]);
    expect(rb.refused).toBe(true);
    const edited = Object.fromEntries(rb.edits.edited.map((e) => [`${e.kind}/${e.id}`, e]));
    expect(edited['workstreams/w1']).toMatchObject({ version: 3, updatedBy: RESTORE_STAMP });
    expect(edited['tasks/t9']).toMatchObject({ version: 2, updatedBy: RESTORE_STAMP });
    expect(rb.edits.newActivity).toContain(`restore_${p.planHash}`);
    expect((await prepareRollback(db, { pid: PID, force: true, deleteDocs: false })).refused).toBe(false);
  });

  it('RS-5: a rolled-back project (schemaVersion 1) -> BLOCKED not-v2, nothing written', async () => {
    const backup = await seedApply();
    await db.doc(BASE).update({ schemaVersion: 1 });
    const before = await dumpAll();
    let called = 0;
    const err = await apply(backup, { expectHash: '0123456789abcdef', writeSnapshot: () => { called++; } }).catch((e) => e);
    expect(err).toMatchObject({ code: 'BLOCKED' });
    expect(err.blocked.map((b) => b.code)).toContain('not-v2');
    expect(restoreExitCode(err)).toBe(1);
    expect(called).toBe(0);
    expect(await dumpAll()).toEqual(before);
  });
});
