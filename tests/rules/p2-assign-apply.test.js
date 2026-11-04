import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, FieldPath, Timestamp } from 'firebase-admin/firestore';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import {
  applyAssign, prepareAssign, prepareAssignRollback, rollbackAssign, STAMP,
} from '../../scripts/p2-assign.mjs';
import { resetData, cleanup, asUser } from './helpers.js';

// P2.4c: role assignment on an already-migrated v2 project (Admin SDK via FIRESTORE_EMULATOR_HOST).
const app = initializeApp({ projectId: 'demo-afmpt' }, 'p2-assign-test');
const db = getFirestore(app);
const WS = 'workspaces/main';
const PID = 'proj_v2';
const OTHER = 'proj_other';
const BASE = `${WS}/projects/${PID}`;

const projectDoc = (name) => ({
  name, schemaVersion: 2, visibility: 'restricted', memberUids: ['u_hod'], memberIds: ['u_hod'],
  programMeta: { prgA: { name: 'Finance', order: 0 }, prgB: { name: 'Tax', order: 1 } },
});
const wsDoc = (pid, programId, name) => ({ workspaceId: 'main', projectId: pid, programId, name, version: 1, updatedBy: 'p2-migrate' });
const taskDoc = (pid, programId, workstreamId) => ({
  workspaceId: 'main', projectId: pid, programId, workstreamId, name: 'T', status: 'Planned', version: 1, updatedBy: 'p2-migrate',
});

async function seedProject(pid, name) {
  const base = `${WS}/projects/${pid}`;
  await db.doc(base).set(projectDoc(name));
  await db.doc(`${base}/workstreams/wsA1`).set(wsDoc(pid, 'prgA', 'Close'));
  await db.doc(`${base}/workstreams/wsB1`).set(wsDoc(pid, 'prgB', 'VAT'));
  await db.doc(`${base}/tasks/tA`).set(taskDoc(pid, 'prgA', 'wsA1'));
  await db.doc(`${base}/tasks/tB`).set(taskDoc(pid, 'prgB', 'wsB1'));
}

async function seed() {
  await db.doc(WS).set({ workspaceOwner: 'hattt4@smartosc.com', ownerUids: ['u_hod'] });
  await db.doc(`${WS}/members/u_hod`).set({ email: 'hattt4@smartosc.com', displayName: 'Ha Truong', status: 'active' });
  await db.doc(`${WS}/members/uid1`).set({ email: 'alice@smartosc.com', displayName: 'Alice Nguyen', status: 'active' });
  await db.doc(`${WS}/members/uid2`).set({ email: 'bob@smartosc.com', displayName: 'Bob Tran', status: 'active' });
  await seedProject(PID, 'Ops 2026');
  await seedProject(OTHER, 'Other 2026');
}

const assignments = {
  programs: [{ Project: '', 'Program id': 'prgA', Program: '', 'PM email': 'alice@smartosc.com', 'Deputy email': '' }],
  workstreams: [{ Project: '', 'Workstream id': 'wsB1', Program: '', Workstream: '', 'Sub-PM email': 'bob@smartosc.com', Start: '', End: '' }],
};

let manifests = [];
const run = (extra = {}) => applyAssign(db, {
  pid: PID, assignments, FieldValue, FieldPath, Timestamp,
  writeManifest: (m) => { manifests.push(JSON.parse(JSON.stringify(m))); },
  ...extra,
});
const data = async (path) => (await db.doc(path).get()).data();
const activity = async (pid = PID) => (await db.collection(`${WS}/projects/${pid}/activity`).get()).docs.map((d) => d.data());
async function snapshotProject(pid) {
  const base = `${WS}/projects/${pid}`;
  const out = { doc: await data(base) };
  for (const k of ['workstreams', 'tasks', 'activity']) {
    out[k] = Object.fromEntries((await db.collection(`${base}/${k}`).get()).docs.map((d) => [d.id, d.data()]));
  }
  return out;
}
const taskEdit = (uid) => ({ status: 'InProgress', version: 2, updatedBy: uid });

describe('P2.4c p2-assign against the emulator', () => {
  beforeEach(async () => { await resetData(); await seed(); manifests = []; });
  afterAll(async () => { await cleanup(); });

  it('ASG-1: apply writes roles via FieldPath, grants access, bumps ws version, logs one event, verifies; roles take effect in the rules', async () => {
    // Before: neither Alice nor Bob may edit tasks.
    const ca0 = await asUser('uid1', 'alice@smartosc.com');
    await assertFails(updateDoc(doc(ca0, `${BASE}/tasks/tA`), taskEdit('uid1')));
    const cb0 = await asUser('uid2', 'bob@smartosc.com');
    await assertFails(updateDoc(doc(cb0, `${BASE}/tasks/tB`), taskEdit('uid2')));

    const prep = await prepareAssign(db, { pid: PID, assignments });
    expect(prep.errors).toEqual([]);
    const r = await run({ expectHash: prep.planHash });
    expect(r.noop).toBe(false);
    expect(r.verify).toEqual({ ok: true, mismatches: [] });

    const p = await data(BASE);
    // Dotted-path update: the rest of programMeta is untouched.
    expect(p.programMeta).toEqual({ prgA: { name: 'Finance', order: 0, pmUid: 'uid1' }, prgB: { name: 'Tax', order: 1 } });
    expect(p.memberUids).toEqual(['u_hod', 'uid1', 'uid2']);
    expect(p.memberIds).toEqual(['u_hod', 'uid1', 'uid2']);
    expect(p.updatedAt).toBeInstanceOf(Timestamp);
    const w = await data(`${BASE}/workstreams/wsB1`);
    expect(w).toMatchObject({ leadUid: 'uid2', version: 2, updatedBy: STAMP, name: 'VAT' });
    expect(w.updatedAt).toBeInstanceOf(Timestamp);
    expect((await data(`${BASE}/workstreams/wsA1`)).version).toBe(1);

    const ev = await activity();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: 'roles_assigned', author: STAMP, authorUid: null, projectId: PID });
    expect(ev[0].createdAt).toBeInstanceOf(Timestamp);

    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({ kind: 'p2-assign', pid: PID, planHash: prep.planHash });
    expect(manifests[0].programs[0].fields).toEqual([{ key: 'pmUid', had: false, before: null, after: 'uid1' }]);

    // After: the PM edits a task in their program, the Sub-PM in their workstream; not across.
    const ca = await asUser('uid1', 'alice@smartosc.com');
    await assertSucceeds(getDoc(doc(ca, `${BASE}/tasks/tA`)));
    await assertSucceeds(updateDoc(doc(ca, `${BASE}/tasks/tA`), taskEdit('uid1')));
    await assertFails(updateDoc(doc(ca, `${BASE}/tasks/tB`), taskEdit('uid1')));
    const cb = await asUser('uid2', 'bob@smartosc.com');
    await assertSucceeds(updateDoc(doc(cb, `${BASE}/tasks/tB`), taskEdit('uid2')));
    await assertFails(updateDoc(doc(cb, `${BASE}/tasks/tA`), { status: 'Completed', version: 3, updatedBy: 'uid2' }));
  });

  it('ASG-2: a re-run with the same rows is a noop (nothing written, no event)', async () => {
    await run();
    const before = await snapshotProject(PID);
    const prep = await prepareAssign(db, { pid: PID, assignments });
    expect(prep.noop).toBe(true);
    const r = await run();
    expect(r.noop).toBe(true);
    expect(manifests).toHaveLength(1);
    expect(await snapshotProject(PID)).toEqual(before);
  });

  it('ASG-3: a change between preview and commit -> STATE_CHANGED, nothing written; a stale hash -> PLAN_CHANGED', async () => {
    const before = await snapshotProject(PID);
    await expect(run({ hooks: { beforeCommit: async () => { await db.doc(`${BASE}/workstreams/wsB1`).update({ version: 5 }); } } }))
      .rejects.toMatchObject({ code: 'STATE_CHANGED' });
    const after = await snapshotProject(PID);
    expect(after.doc).toEqual(before.doc);
    expect(after.activity).toEqual({});
    expect(after.workstreams.wsB1).toEqual({ ...before.workstreams.wsB1, version: 5 });

    await expect(run({ hooks: { beforeCommit: async () => { await db.doc(BASE).update({ memberIds: ['u_hod', 'x'] }); } } }))
      .rejects.toMatchObject({ code: 'STATE_CHANGED' });
    expect((await data(BASE)).programMeta.prgA.pmUid).toBeUndefined();

    await expect(run({ expectHash: '0123456789abcdef' })).rejects.toMatchObject({ code: 'PLAN_CHANGED' });
    expect(await activity()).toEqual([]);
  });

  it('ASG-4: rollback from the manifest restores the before-values, keeps grants, logs an event', async () => {
    await run();
    const manifest = manifests[0];
    const prep = await prepareAssignRollback(db, { manifest });
    expect(prep.blocked).toEqual([]);
    expect(prep.skipped).toEqual([]);
    await expect(rollbackAssign(db, { manifest, expectHash: '0123456789abcdef', FieldValue, FieldPath }))
      .rejects.toMatchObject({ code: 'PLAN_CHANGED' });
    const r = await rollbackAssign(db, { manifest, expectHash: prep.hash, FieldValue, FieldPath });
    expect(r.verify).toEqual({ ok: true, mismatches: [] });

    const p = await data(BASE);
    expect(p.programMeta).toEqual({ prgA: { name: 'Finance', order: 0 }, prgB: { name: 'Tax', order: 1 } });
    expect(p.memberUids).toEqual(['u_hod', 'uid1', 'uid2']);
    const w = await data(`${BASE}/workstreams/wsB1`);
    expect('leadUid' in w).toBe(false);
    expect(w).toMatchObject({ version: 3, updatedBy: `${STAMP}-rollback` });
    expect((await activity()).map((e) => e.type).sort()).toEqual(['roles_assigned', 'roles_assignment_rolled_back']);

    // A second rollback finds nothing to restore (fields no longer hold the applied values).
    const again = await prepareAssignRollback(db, { manifest });
    expect(again.noop).toBe(true);
  });

  it('ASG-5: a second project is untouched by apply and rollback', async () => {
    const before = await snapshotProject(OTHER);
    await run();
    const prep = await prepareAssignRollback(db, { manifest: manifests[0] });
    await rollbackAssign(db, { manifest: manifests[0], expectHash: prep.hash, FieldValue, FieldPath });
    expect(await snapshotProject(OTHER)).toEqual(before);
  });

  it('ASG-6: blocked on a v1 project and on invalid rows (nothing written)', async () => {
    await db.doc(BASE).update({ schemaVersion: 1 });
    await expect(run()).rejects.toMatchObject({ code: 'BLOCKED' });
    await db.doc(BASE).update({ schemaVersion: 2 });
    const bad = { programs: [{ 'Program id': 'prgZZ', 'PM email': 'alice@smartosc.com' }], workstreams: [] };
    await expect(run({ assignments: bad })).rejects.toMatchObject({ code: 'INVALID' });
    expect(manifests).toEqual([]);
    expect(await activity()).toEqual([]);
  });
});
