// P1 directory build. Writes the people directory (members/invites) to Firestore.
// Safe by default: without --apply it only READS (users, for uids) and writes an
// Excel preview. --apply refuses when the plan has errors, records the previous
// content of every path in a manifest, and --rollback restores from it.
// To undo several runs, roll back in reverse order (newest manifest first).
//
// Usage:
//   node scripts/p1-build-directory.mjs <roster.xlsx> <mapping.xlsx> [--apply] [--key service-account.json] [--out preview.xlsx]
//   node scripts/p1-build-directory.mjs --rollback <manifest.json> [--key service-account.json]

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
XLSX.set_fs(fs); // required for XLSX.writeFile in ESM
import { foldName } from '../src/identity.js';
import { buildDirectoryIndex, canonicalPerson } from '../src/directory.js';

const WS = 'workspaces/main';
const str = (v) => String(v ?? '').trim();

// userNamesByEmail (optional): Google display names from the users docs; each is
// added as an alias of that email so the signed-in name still resolves.
export function planDirectory(rosterRows, mappingRows, uidByEmail, userNamesByEmail) {
  const errors = [];
  const unmapped = [];
  const people = new Map(); // email -> { displayName, department, aliases }
  for (const r of rosterRows || []) {
    const email = str(r.Email).toLowerCase();
    if (!email) {
      if (str(r['Display name'])) errors.push(`${str(r['Display name'])}: missing email`);
      continue;
    }
    if (!email.endsWith('@smartosc.com')) { errors.push(`${email}: not an @smartosc.com address`); continue; }
    if (people.has(email)) { errors.push(`${email}: duplicate roster row`); continue; }
    people.set(email, { displayName: str(r['Display name']), department: str(r.Department), aliases: [] });
  }
  const addAlias = (p, value) => {
    const key = foldName(value);
    if (!key || key === foldName(p.displayName)) return;
    if (!p.aliases.some((a) => foldName(a) === key)) p.aliases.push(value);
  };
  const groups = [];
  for (const m of mappingRows || []) {
    const value = str(m['Value in data']);
    if (!value) continue;
    if (str(m['HOD: is group (Y)']).toUpperCase() === 'Y') { groups.push(value); continue; }
    const email = str(m['HOD: final email']).toLowerCase();
    if (!email) { unmapped.push(value); continue; }
    const p = people.get(email);
    if (!p) { errors.push(`${value} → ${email}: email not in roster`); continue; }
    addAlias(p, value);
  }
  const googleNameOf = new Map(); // folded name -> email it came from (for error messages)
  for (const [rawEmail, name] of userNamesByEmail || []) {
    const email = String(rawEmail || '').toLowerCase();
    const p = people.get(email);
    if (p && str(name)) { addAlias(p, str(name)); googleNameOf.set(foldName(str(name)), email); }
  }
  const entries = [...people].map(([email, p]) => ({ email, displayName: p.displayName, aliases: p.aliases }));
  const index = buildDirectoryIndex(entries);
  for (const c of index.conflicts) {
    const src = googleNameOf.get(c.alias);
    errors.push(`alias conflict "${c.alias}": ${c.emails.join(', ')}` +
      (src ? ` (from the Google account name of ${src} — change a display name in the roster)` : ''));
  }
  // A group value that resolves to a person would be merged into that person.
  for (const value of groups) {
    const hit = canonicalPerson(index, value);
    if (hit.known) errors.push(`${value}: group name matches person ${hit.id}`);
  }
  const members = [];
  const invites = [];
  for (const [email, p] of people) {
    const data = {
      email, displayName: p.displayName, aliases: p.aliases, department: p.department,
      status: 'active', updatedBy: 'p1-script',
    };
    const uid = uidByEmail?.get(email);
    if (uid) members.push({ uid, data }); else invites.push({ email, data });
  }
  return { members, invites, errors, unmapped };
}

export function buildPreviewWorkbook(plan) {
  const wb = XLSX.utils.book_new();
  const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  const row = (d) => ({ email: d.email, displayName: d.displayName, department: d.department, aliases: d.aliases.join('; ') });
  add('Members', plan.members.map((m) => ({ uid: m.uid, ...row(m.data) })));
  add('Invites', plan.invites.map((i) => row(i.data)));
  add('Errors', plan.errors.map((message) => ({ message })));
  add('Unmapped', plan.unmapped.map((value) => ({ value })));
  return wb;
}

// Firestore Timestamps do not survive JSON; tag them so rollback can restore them.
export function toJsonable(v, Timestamp) {
  if (v instanceof Timestamp) return { __ts: [v.seconds, v.nanoseconds] };
  if (Array.isArray(v)) return v.map((x) => toJsonable(x, Timestamp));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJsonable(x, Timestamp)]));
  return v;
}
export function revive(v, Timestamp) {
  if (Array.isArray(v)) return v.map((x) => revive(x, Timestamp));
  if (v && typeof v === 'object') {
    if (Array.isArray(v.__ts) && Object.keys(v).length === 1) return new Timestamp(v.__ts[0], v.__ts[1]);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x, Timestamp)]));
  }
  return v;
}

// Writes the plan. The manifest (previous content of every path) is handed to
// writeManifest BEFORE the first write. Refuses when the plan has errors.
export async function applyPlan(db, plan, { FieldValue, Timestamp, writeManifest }) {
  if (plan.errors.length) throw new Error('Refusing to apply: plan has errors');
  const targets = [
    ...plan.members.map((m) => ({ path: `${WS}/members/${m.uid}`, data: m.data })),
    ...plan.invites.map((i) => ({ path: `${WS}/invites/${i.email}`, data: i.data })),
  ];
  const entries = [];
  for (const t of targets) {
    const snap = await db.doc(t.path).get();
    entries.push({ path: t.path, before: snap.exists ? toJsonable(snap.data(), Timestamp) : null });
  }
  writeManifest({ createdAt: new Date().toISOString(), entries });
  for (const t of targets) await db.doc(t.path).set({ ...t.data, updatedAt: FieldValue.serverTimestamp() });
  return { written: targets.length, members: plan.members.length, invites: plan.invites.length };
}

export async function rollbackManifest(db, manifest, { Timestamp }) {
  let restored = 0, deleted = 0;
  for (const e of manifest.entries) {
    const ref = db.doc(e.path);
    if (e.before) { await ref.set(revive(e.before, Timestamp)); restored++; } else { await ref.delete(); deleted++; }
  }
  return { restored, deleted };
}

function readSheet(file, sheet) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`${file}: missing sheet "${sheet}"`);
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function parseArgs(argv) {
  const o = { pos: [], apply: false, key: 'service-account.json', out: 'p1-directory-preview.xlsx', rollback: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--key') o.key = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--rollback') o.rollback = argv[++i];
    else o.pos.push(a);
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
    const { db, Timestamp } = await openDb(o.key);
    const r = await rollbackManifest(db, manifest, { Timestamp });
    console.log(`Rollback done: ${r.restored} restored, ${r.deleted} deleted.`);
    return;
  }
  const [rosterPath, mappingPath] = o.pos;
  if (!rosterPath || !mappingPath) {
    console.error('Usage: node scripts/p1-build-directory.mjs <roster.xlsx> <mapping.xlsx> [--apply] [--key service-account.json]\n   or: --rollback <manifest.json>');
    process.exit(1);
  }
  // Key check first: nothing below touches Firestore without it.
  const { db, FieldValue, Timestamp } = await openDb(o.key);
  const roster = readSheet(rosterPath, 'Roster');
  const mapping = readSheet(mappingPath, 'Mapping');
  const uidByEmail = new Map();
  const userNamesByEmail = new Map();
  (await db.collection(`${WS}/users`).get()).forEach((d) => {
    const u = d.data();
    if (u.email && u.uid) uidByEmail.set(String(u.email).toLowerCase(), u.uid);
    if (u.email && u.name) userNamesByEmail.set(String(u.email).toLowerCase(), String(u.name));
  });
  const plan = planDirectory(roster, mapping, uidByEmail, userNamesByEmail);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Apply never overwrites the preview HOD approved.
  const outPath = o.apply ? `p1-directory-applied-${stamp}.xlsx` : o.out;
  XLSX.writeFile(buildPreviewWorkbook(plan), outPath);
  console.log(`${o.apply ? 'Plan' : 'Preview'} ${outPath}:${plan.members.length} members, ${plan.invites.length} invites, ${plan.errors.length} errors, ${plan.unmapped.length} unmapped.`);
  if (!o.apply) { console.log('Dry run: Firestore untouched.'); return; }
  if (plan.errors.length) { console.error('Refusing to apply: fix the errors listed in the preview first.'); process.exit(1); }
  const manifestPath = `p1-directory-manifest-${stamp}.json`;
  const r = await applyPlan(db, plan, {
    FieldValue, Timestamp,
    writeManifest: (m) => fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2)),
  });
  console.log(`Applied ${r.written} docs (${r.members} members, ${r.invites} invites). Manifest: ${manifestPath}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
