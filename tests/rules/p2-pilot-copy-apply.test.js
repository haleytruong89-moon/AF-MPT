import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { applyPilotCopy, assertPilotManifest, defaultNewPid, rollbackPilotCopy } from '../../scripts/p2-pilot-copy.mjs';
import { comparePilot } from '../../scripts/p2-compare.mjs';
import { resetData, cleanup } from './helpers.js';

// Admin SDK talks to the emulator via FIRESTORE_EMULATOR_HOST (set by emulators:exec).
const app = initializeApp({ projectId: 'demo-afmpt' }, 'p2-pilot-copy-test');
const db = getFirestore(app);
const WS = 'workspaces/main';
const SRC = 'proj_fx';
const NEW = defaultNewPid(SRC);
const fixture = JSON.parse(readFileSync(new URL('../fixtures/v1-project.json', import.meta.url), 'utf8'));

async function seed() {
  await db.doc(WS).set({ workspaceOwner: 'HaTTT4@smartosc.com' });
  await db.doc(`${WS}/members/u_hod`).set({ email: 'hattt4@smartosc.com', displayName: 'Ha Truong', status: 'active' });
  await db.doc(`${WS}/members/uid1`).set({ email: 'alice@smartosc.com', displayName: 'Alice Nguyen', status: 'active' });
  await db.doc(`${WS}/invites/bob@smartosc.com`).set({ email: 'bob@smartosc.com', displayName: 'Bob', status: 'invited' });
  await db.doc(`${WS}/projects/${SRC}`).set({
    ...fixture,
    roles: { uidZ: 'owner' },
    createdBy: 'uidZ',
    createdAt: new Timestamp(1700000000, 0),
    updatedAt: new Timestamp(1700000500, 0),
    rev: 9,
    googleChatWebhook: 'https://chat.example/hook',
  });
}

async function treeUnder(pid) {
  const ref = db.doc(`${WS}/projects/${pid}`);
  const snap = await ref.get();
  const cols = await ref.listCollections();
  return { exists: snap.exists, data: snap.exists ? snap.data() : null, cols: cols.map((c) => c.id).sort() };
}

describe('P2 pilot copy apply / compare / rollback against the emulator', () => {
  beforeEach(async () => { await resetData(); await seed(); });
  afterAll(async () => { await cleanup(); await deleteApp(app); });

  it('copies under newPid with an HOD-only ACL, compares equal, rolls back cleanly; source untouched', async () => {
    const sourceBefore = await treeUnder(SRC);
    let manifest;
    const r = await applyPilotCopy(db, {
      sourcePid: SRC, Timestamp, now: Timestamp.now(),
      writeManifest: (m) => { manifest = JSON.parse(JSON.stringify(m)); },
    });
    expect(r.newPid).toBe(NEW);
    expect(r.ownerUid).toBe('u_hod');

    const copy = await treeUnder(NEW);
    expect(copy.exists).toBe(true);
    expect(copy.cols).toEqual(['actions', 'decisions', 'raid', 'tasks', 'workstreams']);
    expect(copy.data.memberIds).toEqual(['u_hod']);
    expect(copy.data.roles).toEqual({ u_hod: 'owner' });
    expect(copy.data.memberUids).toEqual(['u_hod']);
    expect(copy.data.visibility).toBe('restricted');
    expect(copy.data.schemaVersion).toBe(2);
    expect('googleChatWebhook' in copy.data).toBe(false);
    const tasks = await db.collection(`${WS}/projects/${NEW}/tasks`).get();
    tasks.forEach((d) => {
      expect(d.data().version).toBe(1);
      expect(d.data().projectId).toBe(NEW);
      expect(d.data().updatedBy).toBe('p2-pilot-copy');
    });

    const decs = await db.collection(`${WS}/projects/${NEW}/decisions`).get();
    expect(decs.docs.map((d) => d.id)).toEqual(["d1"]);
    expect(decs.docs[0].data()).toMatchObject({ projectId: NEW, version: 1, updatedBy: "p2-pilot-copy", title: "Go" });

    // Every manifest entry is a new doc under NEW.
    expect(assertPilotManifest(manifest)).toBe(NEW);
    expect(manifest.entries).toHaveLength(r.written);

    // The copy assembles back to the source.
    const cmp = await comparePilot(db, SRC, NEW);
    expect(cmp.orphanCount).toBe(0);
    expect(cmp.diffs).toEqual([]);
    expect(cmp.equal).toBe(true);

    // A second apply refuses (target not empty) and writes nothing.
    let wrote = false;
    await expect(applyPilotCopy(db, {
      sourcePid: SRC, Timestamp, writeManifest: () => { wrote = true; },
    })).rejects.toThrow(/already exists/);
    expect(wrote).toBe(false);

    // Source untouched by the apply.
    expect(await treeUnder(SRC)).toEqual(sourceBefore);

    expect(manifest).toMatchObject({ kind: 'p2-pilot-copy', sourcePid: SRC, newPid: NEW });

    // A tampered manifest naming the SOURCE pid is refused; the source stays identical.
    const toSrc = (m) => ({ ...m, entries: m.entries.map((e) => ({ ...e, path: e.path.replace(`/projects/${NEW}`, `/projects/${SRC}`) })) });
    await expect(rollbackPilotCopy(db, toSrc(manifest), { FieldValue, Timestamp })).rejects.toThrow(/not under newPid/);
    await expect(rollbackPilotCopy(db, { ...toSrc(manifest), newPid: SRC, sourcePid: 'proj_other' }, { FieldValue, Timestamp }))
      .rejects.toThrow(/not a pilot copy/);
    expect(await treeUnder(SRC)).toEqual(sourceBefore);
    expect((await treeUnder(NEW)).exists).toBe(true);

    // Rollback deletes everything under NEW.
    const rb = await rollbackPilotCopy(db, manifest, { FieldValue, Timestamp });
    expect(rb).toMatchObject({ restored: 0, deleted: r.written, newPid: NEW, leftover: [] });
    expect(await treeUnder(NEW)).toEqual({ exists: false, data: null, cols: [] });
    expect(await treeUnder(SRC)).toEqual(sourceBefore);
  });

  it('refuses when a stray doc already sits in a sub-collection of newPid', async () => {
    await db.doc(`${WS}/projects/${NEW}/tasks/stray`).set({ x: 1 });
    await expect(applyPilotCopy(db, { sourcePid: SRC, Timestamp, writeManifest: () => {} }))
      .rejects.toThrow(/sub-collections: tasks/);
    expect((await db.doc(`${WS}/projects/${NEW}`).get()).exists).toBe(false);
  });

  it('applies PM / Sub-PM assignments: programMeta, leadUid, memberUids; rollback removes everything', async () => {
    const assignments = {
      programs: [{ Project: 'Fixture Project', 'Program id': 'pg1', Program: '', 'PM email': 'Alice@smartosc.com', 'Deputy email': '' }],
      workstreams: [{ Project: 'Fixture Project', 'Workstream id': 'w1', Program: '', Workstream: '', 'Sub-PM email': 'hattt4@smartosc.com', Start: '2026-01-01', End: '2026-06-30' }],
    };
    let manifest;
    const r = await applyPilotCopy(db, {
      sourcePid: SRC, Timestamp, now: Timestamp.now(), assignments,
      writeManifest: (m) => { manifest = JSON.parse(JSON.stringify(m)); },
    });
    const copy = (await db.doc(`${WS}/projects/${NEW}`).get()).data();
    expect(copy.programMeta.pg1).toMatchObject({ pmUid: 'uid1', deputyUid: null });
    expect(copy.memberUids).toEqual(expect.arrayContaining(['u_hod', 'uid1']));
    expect(copy.memberIds).toEqual(expect.arrayContaining(['u_hod', 'uid1']));
    const w1 = (await db.doc(`${WS}/projects/${NEW}/workstreams/w1`).get()).data();
    expect(w1).toMatchObject({ leadUid: 'u_hod', start: '2026-01-01', end: '2026-06-30' });

    const rb = await rollbackPilotCopy(db, manifest, { FieldValue, Timestamp });
    expect(rb).toMatchObject({ restored: 0, deleted: r.written, newPid: NEW, leftover: [] });
    expect(await treeUnder(NEW)).toEqual({ exists: false, data: null, cols: [] });
  });

  it('rejects assignments naming an invite-only email and writes nothing', async () => {
    const assignments = {
      programs: [{ Project: 'Fixture Project', 'Program id': 'pg1', 'PM email': 'bob@smartosc.com', 'Deputy email': '' }],
      workstreams: [],
    };
    await expect(applyPilotCopy(db, { sourcePid: SRC, Timestamp, assignments, writeManifest: () => {} }))
      .rejects.toThrow(/only invited/);
    expect((await treeUnder(NEW)).exists).toBe(false);
  });
});
