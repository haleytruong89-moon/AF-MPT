// P2.1 Task 3: set workspaces/main.ownerUids = [uid of the workspaceOwner email].
// The uid is looked up in workspaces/main/members by email.
// Safe by default: without --apply it only READS and prints the plan.
// --apply writes ONLY the ownerUids field (set with merge) after recording a
// manifest; --rollback restores ONLY that field from the manifest, so client
// writes to the workspace doc made in between are kept.
//
// Usage:
//   node scripts/p2-set-owner-uids.mjs [--apply] [--key service-account.json]
//   node scripts/p2-set-owner-uids.mjs --rollback <manifest.json> [--key service-account.json]

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyWrites, rollbackManifest } from './lib/manifest.mjs';

const WS = 'workspaces/main';
const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

// docs: Array<{ id, data }> from workspaces/main/members. Returns
// Map<lower-cased email, uid | uid[]> (an array when several docs share an email).
export function membersByEmailFrom(docs) {
  const map = new Map();
  for (const d of docs || []) {
    const email = norm(d.data?.email);
    if (!email) continue;
    if (!map.has(email)) map.set(email, d.id);
    else map.set(email, [].concat(map.get(email), d.id));
  }
  return map;
}

// Pure. Returns { ownerUids: [uid] } | { noop: true } | { error }.
export function planOwnerUids(wsDoc, membersByEmail) {
  if (!wsDoc) return { error: `${WS} does not exist` };
  const current = wsDoc.ownerUids;
  if (current !== undefined && current !== null && !Array.isArray(current)) {
    return { error: 'ownerUids exists but is not a list; fix it in the Console first' };
  }
  if (Array.isArray(current) && current.length > 0) return { noop: true };
  const owner = norm(wsDoc.workspaceOwner);
  if (!owner.includes('@')) return { error: `workspaceOwner "${wsDoc.workspaceOwner ?? ''}" is not an email` };
  const hit = membersByEmail?.get(owner);
  if (!hit) return { error: `workspaceOwner ${owner} has no members entry (sign in once or run the P1 directory build)` };
  if (Array.isArray(hit)) return { error: `workspaceOwner ${owner} matches several members docs: ${hit.join(', ')}` };
  return { ownerUids: [hit] };
}

function parseArgs(argv) {
  const o = { apply: false, key: 'service-account.json', rollback: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--key') o.key = argv[++i];
    else if (a === '--rollback') o.rollback = argv[++i];
    else { console.error(`Unknown argument: ${a}`); process.exit(1); }
  }
  return o;
}

async function openDb(keyPath) {
  if (!fs.existsSync(keyPath)) {
    console.error(`Missing service-account key: ${keyPath} (Firebase Console > Project settings > Service accounts). Nothing was read or written.`);
    process.exit(1);
  }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');
  let key;
  try { key = JSON.parse(fs.readFileSync(keyPath, 'utf8')); } catch { console.error('Invalid service-account key file'); process.exit(1); }
  initializeApp({ credential: cert(key) });
  return { db: getFirestore(), FieldValue, Timestamp };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.rollback) {
    const manifest = JSON.parse(fs.readFileSync(o.rollback, 'utf8'));
    const { db, FieldValue, Timestamp } = await openDb(o.key);
    const r = await rollbackManifest(db, manifest, { FieldValue, Timestamp });
    console.log(`Rollback done: ${r.restored} restored, ${r.deleted} deleted.`);
    return;
  }
  // Key check first: nothing below touches Firestore without it.
  const { db, Timestamp } = await openDb(o.key);
  const wsSnap = await db.doc(WS).get();
  const wsDoc = wsSnap.exists ? wsSnap.data() : null;
  const docs = [];
  (await db.collection(`${WS}/members`).get()).forEach((d) => docs.push({ id: d.id, data: d.data() }));
  const membersByEmail = membersByEmailFrom(docs);
  const plan = planOwnerUids(wsDoc, membersByEmail);
  const resolved = membersByEmail.get(norm(wsDoc?.workspaceOwner));
  console.log(`workspaceOwner:    ${JSON.stringify(wsDoc?.workspaceOwner ?? null)}`);
  console.log(`resolved uid:      ${JSON.stringify(resolved ?? null)}`);
  console.log(`current ownerUids: ${JSON.stringify(wsDoc?.ownerUids ?? null)}`);
  console.log(`planned ownerUids: ${plan.ownerUids ? JSON.stringify(plan.ownerUids) : plan.noop ? '(no change: already set)' : '(none)'}`);
  if (plan.error) { console.error(`Error: ${plan.error}`); process.exit(1); }
  if (plan.noop) { console.log('Nothing to do: Firestore untouched.'); return; }
  if (!o.apply) { console.log('Dry run: Firestore untouched. Re-run with --apply to write.'); return; }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestPath = `p2-owner-uids-manifest-${stamp}.json`;
  await applyWrites(db, [{ path: WS, data: { ownerUids: plan.ownerUids }, merge: true }], {
    Timestamp,
    writeManifest: (m) => fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2)),
  });
  console.log(`Applied ownerUids=${JSON.stringify(plan.ownerUids)} to ${WS}. Manifest: ${manifestPath}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
