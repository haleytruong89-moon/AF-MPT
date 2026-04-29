#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────
   Migration script: upload a JSON backup to Firestore.
   The admin uid passed in becomes the owner of every imported project.

   Usage:
     1. From the source app, download a JSON backup (Backup ⬇ button)
     2. Copy the file as `backup.json` into this project root
     3. Get a Firebase service-account key (Console → Project Settings →
        Service accounts → Generate new private key)
     4. Save it as `service-account.json` in this project root (DO NOT commit)
     5. Find your Firebase Auth uid in console → Authentication → Users
     6. Run:  node scripts/migrate.js <admin-uid> <admin-email> backup.json [service-account.json]

   The script handles BOTH backup formats:
     - Old workspace backup: { meta: {...}, projects: {...}, activity: {...} }
     - New per-project backup: { project: {...}, activity: [...] }

   On import, every project is given:
     - memberIds = [adminUid]
     - roles     = { [adminUid]: 'owner' }
     - deletedAt = null
   so it works under the new RBAC rules. Activity entries are imported as-is;
   their `author` field is preserved (Firestore rules check author only on
   newly-written entries, not on bulk imports via the admin SDK).
   ───────────────────────────────────────────────────────────────────── */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const [, , adminUid, adminEmail, backupPath = 'backup.json', keyPath = 'service-account.json'] = process.argv;

function fail(msg) { console.error('✗', msg); process.exit(1); }
if (!adminUid || !adminEmail) {
  fail('Missing admin uid/email. Usage: node scripts/migrate.js <admin-uid> <admin-email> [backup.json] [service-account.json]');
}
if (!adminEmail.toLowerCase().endsWith('@smartosc.com')) {
  fail(`Admin email "${adminEmail}" is not @smartosc.com — refusing.`);
}

let backup, serviceAccount;
try {
  backup = JSON.parse(readFileSync(resolve(backupPath), 'utf8'));
} catch (e) { fail(`Cannot read backup file "${backupPath}": ${e.message}`); }
try {
  serviceAccount = JSON.parse(readFileSync(resolve(keyPath), 'utf8'));
} catch (e) { fail(`Cannot read service-account file "${keyPath}": ${e.message}`); }

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const WORKSPACE = 'main';
const metaRef = db.collection('workspaces').doc(WORKSPACE);

async function ensureMeta() {
  const snap = await metaRef.get();
  if (!snap.exists) {
    await metaRef.set({ createdAt: FieldValue.serverTimestamp(), seeded: true });
  } else if (!snap.data().seeded) {
    await metaRef.set({ seeded: true }, { merge: true });
  }
}

async function ensureAdminDirectory() {
  await db.collection('workspaces').doc(WORKSPACE).collection('users').doc(adminUid).set({
    uid: adminUid, email: adminEmail, name: adminEmail.split('@')[0], photo: null,
    lastSeen: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function uploadProject(project, activityEntries) {
  const pid = project.id;
  if (!pid) throw new Error('Project missing id');
  const projectRef = db.collection('workspaces').doc(WORKSPACE).collection('projects').doc(pid);
  const activityRef = db.collection('workspaces').doc(WORKSPACE).collection('activity').doc(pid);

  // Strip the id from the doc body (it's the doc key)
  const { id, ...body } = project;
  await projectRef.set({
    ...body,
    memberIds: [adminUid],
    roles: { [adminUid]: 'owner' },
    relatedParties: body.relatedParties || [],
    deletedAt: null,
    createdBy: body.createdBy || adminUid,
    createdAt: body.createdAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (activityEntries && activityEntries.length) {
    await activityRef.set({ entries: activityEntries.slice(0, 500), updatedAt: FieldValue.serverTimestamp() });
  }
  return { pid, name: project.name, taskCount: countTasks(project) };
}

function countTasks(project) {
  let n = 0;
  for (const pg of project.programs || [])
    for (const ws of pg.workstreams || [])
      n += (ws.tasks || []).length;
  return n;
}

async function main() {
  await ensureMeta();
  await ensureAdminDirectory();
  const uploaded = [];

  if (backup.project) {
    // New per-project backup format
    console.log(`→ Uploading project "${backup.project.name}"…`);
    const r = await uploadProject(backup.project, backup.activity || []);
    uploaded.push(r);
  } else if (backup.projects && backup.meta) {
    // Old workspace backup format
    for (const pid of backup.meta.projectIds || []) {
      const p = backup.projects[pid];
      if (!p) continue;
      console.log(`→ Uploading project "${p.name}"…`);
      const r = await uploadProject(p, (backup.activity || {})[pid] || []);
      uploaded.push(r);
    }
  } else {
    fail('Unrecognized backup format. Expected { project, activity } or { meta, projects, activity }.');
  }

  console.log('');
  console.log('✓ Migration complete:');
  for (const u of uploaded) console.log(`    · ${u.name} — ${u.taskCount} tasks (id: ${u.pid}) — owner=${adminEmail}`);
  console.log('');
  console.log('Open the app and sign in — your projects will appear with the Owner badge.');
  console.log('Use the Members button to add teammates.');
  console.log('Reminder: delete service-account.json from your machine when done.');
  process.exit(0);
}

main().catch((e) => fail(`Migration failed: ${e.message}`));
