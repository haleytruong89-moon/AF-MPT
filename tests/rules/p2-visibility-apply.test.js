import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { applyVisibility, prepareVisibilityRollback, rollbackVisibility, readVisibilityState, prepareVisibility, VIS_STAMP } from '../../scripts/p2-visibility.mjs';
import { resetData, cleanup, asUser } from './helpers.js';

// W3-B2 (B-5, D5): per-project visibility (Admin SDK via FIRESTORE_EMULATOR_HOST); needs the W3-B1 rules.
const app = initializeApp({ projectId: 'demo-afmpt' }, 'p2-visibility-test');
const db = getFirestore(app);
const WS = 'workspaces/main';
const PID = 'proj_vis';
const BASE = `${WS}/projects/${PID}`;
const OUT = { uid: 'u_out', email: 'out@smartosc.com' };

const member = (email) => ({ email, displayName: email, aliases: [], department: 'AF', status: 'active', updatedAt: '2026-11-16T00:00:00Z', updatedBy: 'hattt4@smartosc.com' });

async function seed() {
  await db.doc(WS).set({ workspaceOwner: 'hattt4@smartosc.com', ownerUids: ['u_hod'] });
  await db.doc(`${WS}/members/u_hod`).set(member('hattt4@smartosc.com'));
  await db.doc(`${WS}/members/${OUT.uid}`).set(member(OUT.email));
  await db.doc(BASE).set({ name: 'Ops 2026', schemaVersion: 2, visibility: 'restricted', memberUids: ['u_hod'], memberIds: ['u_hod'], roles: { u_hod: 'owner' }, programMeta: {}, rev: 5 });
  await db.doc(`${BASE}/tasks/t1`).set({ workspaceId: 'main', projectId: PID, name: 'T', status: 'InProgress', picUid: 'u_hod', contributorUids: [], version: 1 });
}

let manifests = [];
const run = (to, extra = {}) => applyVisibility(db, { pid: PID, to, FieldValue, writeManifest: (m) => { manifests.push(m); }, ...extra });
const data = async (path) => (await db.doc(path).get()).data();
const activity = async () => (await db.collection(`${BASE}/activity`).get()).docs.map((d) => d.data());
const deptList = async (c) => getDocs(query(collection(c, `${WS}/projects`), where('schemaVersion', '==', 2), where('visibility', '==', 'department')));

describe('W3-B2 p2-visibility against the emulator', () => {
  beforeEach(async () => { await resetData(); await seed(); manifests = []; });
  afterAll(async () => { await cleanup(); });

  it('VISA-1 to department: visibility + activity only (rev untouched); a non-member then reads a task and lists the project', async () => {
    const c0 = await asUser(OUT.uid, OUT.email);
    await assertFails(getDoc(doc(c0, `${BASE}/tasks/t1`)));
    const s = await readVisibilityState(db, PID);
    const prep = prepareVisibility({ pid: PID, state: s, members: s.members, to: 'department' });
    expect(prep.gain).toEqual([OUT.uid]);
    const r = await run('department', { expectHash: prep.planHash });
    expect(r.verify.ok).toBe(true);
    const p = await data(BASE);
    expect(p).toMatchObject({ visibility: 'department', rev: 5, memberUids: ['u_hod'] });
    const ev = await activity();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: 'visibility_changed', before: { visibility: 'restricted' }, after: { visibility: 'department' }, author: VIS_STAMP, authorUid: null });
    expect(manifests[0]).toMatchObject({ kind: 'p2-visibility', pid: PID, before: 'restricted', after: 'department' });

    const c = await asUser(OUT.uid, OUT.email);
    await assertSucceeds(getDoc(doc(c, `${BASE}/tasks/t1`)));
    const snap = await assertSucceeds(deptList(c));
    expect(snap.size).toBe(1);
  });

  it('VISA-2 a stale hash -> PLAN_CHANGED; a member change before commit -> STATE_CHANGED; nothing written', async () => {
    await expect(run('department', { expectHash: '0123456789abcdef' })).rejects.toMatchObject({ code: 'PLAN_CHANGED' });
    await expect(run('department', { hooks: { beforeCommit: async () => { await db.doc(BASE).update({ memberUids: ['u_hod', 'x'] }); } } }))
      .rejects.toMatchObject({ code: 'STATE_CHANGED' });
    expect((await data(BASE)).visibility).toBe('restricted');
    expect(await activity()).toEqual([]);
  });

  it('VISA-3 back to restricted is refused while an open task PIC is outside the project', async () => {
    await run('department');
    await db.doc(`${BASE}/tasks/t1`).update({ picUid: OUT.uid });
    await expect(run('restricted')).rejects.toMatchObject({ code: 'BLOCKED' });
    expect((await data(BASE)).visibility).toBe('department');
  });

  it('VISA-4 rollback restores the before-value and logs it', async () => {
    await run('department');
    const prep = await prepareVisibilityRollback(db, { manifest: manifests[0] });
    expect(prep).toMatchObject({ blocked: [], noop: false, to: 'restricted' });
    const r = await rollbackVisibility(db, { manifest: manifests[0], expectHash: prep.hash, FieldValue });
    expect(r.verify.ok).toBe(true);
    expect((await data(BASE)).visibility).toBe('restricted');
    expect((await activity()).map((e) => e.after.visibility).sort()).toEqual(['department', 'restricted']);
    expect((await prepareVisibilityRollback(db, { manifest: manifests[0] })).noop).toBe(true);
  });
});
