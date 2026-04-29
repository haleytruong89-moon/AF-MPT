#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   One-time RBAC migration: take all projects that lack roles/memberIds (legacy
   v1 docs created before per-project access control) and assign a single
   admin user as the owner. After this, the workspace admin can delegate
   ownership / add members from the app UI.

   Usage:
     1. Get a Firebase service-account key from the console (Project Settings
        → Service accounts → Generate new private key) and save it as
        service-account.json in the project root. (DO NOT commit it.)
     2. Find your Firebase Auth uid: easiest path is to sign into the app
        once and grab it from Firebase console → Authentication → Users
        (the leftmost column). Copy the uid.
     3. Run:
          node scripts/setup-rbac.js <admin-uid> <admin-email> [service-account.json]

        Example:
          node scripts/setup-rbac.js abc123 admin@smartosc.com

   What it does:
     - For every workspaces/main/projects/* doc that has no `roles` field,
       sets memberIds=[adminUid] and roles={[adminUid]: 'owner'}.
     - Writes deletedAt=null on those docs so the soft-delete filter is clean.
     - Backfills the workspaces/main/users/<adminUid> directory entry so the
       admin appears in the member-picker without needing to sign in first.
     - Touches a marker doc workspaces/main with createdAt if missing.

   Idempotent — safe to re-run; projects that already have a `roles` map are
   left untouched.
   ───────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const [, , adminUid, adminEmail, keyPath = 'service-account.json'] = process.argv;

function fail(msg) { console.error('✗', msg); process.exit(1); }
if (!adminUid)   fail('Missing admin uid. Usage: node scripts/setup-rbac.js <uid> <email> [service-account.json]');
if (!adminEmail) fail('Missing admin email. Usage: node scripts/setup-rbac.js <uid> <email> [service-account.json]');
if (!adminEmail.toLowerCase().endsWith('@smartosc.com')) {
  fail(`Admin email "${adminEmail}" is not @smartosc.com — refusing (Firestore rules would reject reads/writes).`);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(resolve(keyPath), 'utf8'));
} catch (e) { fail(`Cannot read service-account file "${keyPath}": ${e.message}`); }

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const WORKSPACE = 'main';

async function ensureWorkspaceMeta() {
  const ref = db.collection('workspaces').doc(WORKSPACE);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ createdAt: FieldValue.serverTimestamp(), seeded: true });
    console.log('✓ Created workspaces/main marker doc (seeded=true; auto-seed disabled)');
  } else if (!snap.data().seeded) {
    await ref.set({ seeded: true }, { merge: true });
    console.log('✓ Marked workspace as seeded (auto-seed disabled for future sign-ins)');
  }
}

async function ensureAdminDirectory() {
  const ref = db.collection('workspaces').doc(WORKSPACE).collection('users').doc(adminUid);
  await ref.set({
    uid: adminUid,
    email: adminEmail,
    name: adminEmail.split('@')[0],
    photo: null,
    lastSeen: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`✓ Wrote admin directory entry workspaces/main/users/${adminUid}`);
}

async function migrateProjects() {
  const col = db.collection('workspaces').doc(WORKSPACE).collection('projects');
  const snap = await col.get();
  let migrated = 0, skipped = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const hasRoles = data.roles && Object.keys(data.roles).length > 0;
    if (hasRoles) { skipped++; continue; }
    await docSnap.ref.set({
      memberIds: [adminUid],
      roles: { [adminUid]: 'owner' },
      relatedParties: data.relatedParties || [],
      deletedAt: null,
      createdBy: data.createdBy || adminUid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    migrated++;
    console.log(`  → claimed "${data.name || docSnap.id}" (${docSnap.id})`);
  }
  console.log(`✓ Project migration: ${migrated} claimed, ${skipped} already had roles`);
}

async function main() {
  console.log(`Running RBAC migration as admin uid=${adminUid} email=${adminEmail}`);
  console.log('');
  await ensureWorkspaceMeta();
  await ensureAdminDirectory();
  await migrateProjects();
  console.log('');
  console.log('Done. Next steps:');
  console.log('  1. Deploy firestore.rules from this repo (Firebase console → Rules → Publish)');
  console.log('  2. Sign in to the app — you\'ll see all migrated projects with the Owner badge');
  console.log('  3. Use the Members button on each project to add teammates');
  console.log('  4. Delete service-account.json from your machine');
  process.exit(0);
}

main().catch((e) => fail(`Migration failed: ${e.message}`));
