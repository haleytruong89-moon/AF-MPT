// P1 directory build. Writes the people directory (members/invites) to Firestore.
// Safe by default: without --apply it only READS (users, for uids) and writes an
// Excel preview. --apply refuses when the plan has errors, records the previous
// content of every path in a manifest, and --rollback restores from it.
//
// Usage:
//   node scripts/p1-build-directory.mjs <roster.xlsx> <mapping.xlsx> [--apply] [--key service-account.json] [--out preview.xlsx]
//   node scripts/p1-build-directory.mjs --rollback <manifest.json> [--key service-account.json]

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
XLSX.set_fs(fs); // required for XLSX.writeFile in ESM
import { foldName } from '../src/identity.js';
import { buildDirectoryIndex } from '../src/directory.js';

const WS = 'workspaces/main';
const str = (v) => String(v ?? '').trim();

export function planDirectory(rosterRows, mappingRows, uidByEmail) {
  const errors = [];
  const unmapped = [];
  const people = new Map(); // email -> { displayName, department, aliases }
  for (const r of rosterRows || []) {
    const email = str(r.Email).toLowerCase();
    if (!email) continue;
    if (!email.endsWith('@smartosc.com')) { errors.push(`${email}: not an @smartosc.com address`); continue; }
    if (people.has(email)) { errors.push(`${email}: duplicate roster row`); continue; }
    people.set(email, { displayName: str(r['Display name']), department: str(r.Department), aliases: [] });
  }
  for (const m of mappingRows || []) {
    const value = str(m['Value in data']);
    if (!value) continue;
    if (str(m['HOD: is group (Y)']).toUpperCase() === 'Y') continue;
    const email = str(m['HOD: final email']).toLowerCase();
    if (!email) { unmapped.push(value); continue; }
    const p = people.get(email);
    if (!p) { errors.push(`${value} → ${email}: email not in roster`); continue; }
    const key = foldName(value);
    if (key === foldName(p.displayName)) continue;
    if (!p.aliases.some((a) => foldName(a) === key)) p.aliases.push(value);
  }
  const entries = [...people].map(([email, p]) => ({ email, displayName: p.displayName, aliases: p.aliases }));
  for (const c of buildDirectoryIndex(entries).conflicts) {
    errors.push(`alias conflict "${c.alias}": ${c.emails.join(', ')}`);
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
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
  return { db: getFirestore(), FieldValue };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.rollback) {
    const manifest = JSON.parse(fs.readFileSync(o.rollback, 'utf8'));
    const { db } = await openDb(o.key);
    let restored = 0, deleted = 0;
    for (const e of manifest.entries) {
      const ref = db.doc(e.path);
      if (e.before) { await ref.set(e.before); restored++; } else { await ref.delete(); deleted++; }
    }
    console.log(`Rollback done: ${restored} restored, ${deleted} deleted.`);
    return;
  }
  const [rosterPath, mappingPath] = o.pos;
  if (!rosterPath || !mappingPath) {
    console.error('Usage: node scripts/p1-build-directory.mjs <roster.xlsx> <mapping.xlsx> [--apply] [--key service-account.json]\n   or: --rollback <manifest.json>');
    process.exit(1);
  }
  // Key check first: nothing below touches Firestore without it.
  const { db, FieldValue } = await openDb(o.key);
  const roster = readSheet(rosterPath, 'Roster');
  const mapping = readSheet(mappingPath, 'Mapping');
  const uidByEmail = new Map();
  (await db.collection(`${WS}/users`).get()).forEach((d) => {
    const u = d.data();
    if (u.email && u.uid) uidByEmail.set(String(u.email).toLowerCase(), u.uid);
  });
  const plan = planDirectory(roster, mapping, uidByEmail);
  XLSX.writeFile(buildPreviewWorkbook(plan), o.out);
  console.log(`Preview ${o.out}: ${plan.members.length} members, ${plan.invites.length} invites, ${plan.errors.length} errors, ${plan.unmapped.length} unmapped.`);
  if (!o.apply) { console.log('Dry run: Firestore untouched.'); return; }
  if (plan.errors.length) { console.error('Refusing to apply: fix the errors listed in the preview first.'); process.exit(1); }

  const targets = [
    ...plan.members.map((m) => ({ path: `${WS}/members/${m.uid}`, data: m.data })),
    ...plan.invites.map((i) => ({ path: `${WS}/invites/${i.email}`, data: i.data })),
  ];
  const entries = [];
  for (const t of targets) {
    const snap = await db.doc(t.path).get();
    entries.push({ path: t.path, before: snap.exists ? snap.data() : null });
  }
  const manifestPath = `p1-directory-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  // Write the manifest BEFORE any write so a crash mid-way is still reversible.
  fs.writeFileSync(manifestPath, JSON.stringify({ createdAt: new Date().toISOString(), entries }, null, 2));
  for (const t of targets) await db.doc(t.path).set({ ...t.data, updatedAt: FieldValue.serverTimestamp() });
  console.log(`Applied ${targets.length} docs (${plan.members.length} members, ${plan.invites.length} invites). Manifest: ${manifestPath}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
