import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { applyMigration } from '../../scripts/p2-migrate.mjs';
import { prepareRestore } from '../../scripts/p2-restore.mjs';
import { resetData, cleanup } from './helpers.js';

// P2.4b Task 3: the restore preview reads Firestore and writes nothing (Admin SDK via
// FIRESTORE_EMULATOR_HOST). Apply cases arrive in Task 4.
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
});
