// P2.4 Task 5: switch ONE real project in place from v1 to v2 (spec M4).
//
// Order of writes (plan "Architecture", Rulings P4-4..P4-8):
//  1. the migration record workspaces/main/migrations/<pid> (status 'prepared', before-image);
//  2. the local manifest (audit copy of this run);
//  3. the sub-collection docs (workstreams / tasks / actions / raid / decisions), batched,
//     plus stale stamped docs deleted. They stay invisible while schemaVersion is not 2;
//  4. THE FLIP, last: one transaction that requires the live project doc to still have
//     rev === v1Rev, the same writeId, no deletedAt and schemaVersion !== 2 (else
//     REV_CHANGED and nothing becomes visible), then sets programMeta / memberUids /
//     visibility / v1Absent / schemaVersion 2 (+ memberIds when assignments add people);
//  5. record 'switched'; 6. activity copy (top-up); 7. read-back verify; 8. record 'verified'.
// The frozen v1 arrays (programs / actionItems / decisions) are never written.
// A re-run after the flip only tops up the activity copy and re-verifies (Ruling P4-6).
// A failed verify exits 2 and leaves the record 'switched' (Ruling P4-14): no auto-rollback.
//
// Usage:
//   node scripts/p2-migrate.mjs <pid> [--assignments p2-assignments.xlsx | --no-assignments] [--key service-account.json]          (preview, read-only)
//   node scripts/p2-migrate.mjs <pid> (--assignments p2-assignments.xlsx | --no-assignments) --apply [--key service-account.json]
// Exit codes: 0 ok; 1 usage / blocked / refused; 2 verification mismatch after the flip.
// Outputs (gitignored, contain people names): p2-migrate-preview-<pid>.xlsx,
// p2-migrate-manifest-<pid>-<stamp>.json.

import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'node:url';
import { toJsonable } from './lib/manifest.mjs';
import { directoryFrom } from './p2-pilot-copy.mjs';
import { parseAssignmentsWorkbook, formatPreview } from './lib/assignments.mjs';
import { normaliseForV2 } from './lib/migrate-normalise.mjs';
import { countReport } from './lib/migrate-checks.mjs';
import {
  planMigration, reconcileExisting, planActivityCopy,
  RECORD_PATH, SUBCOLS, ACTIVITY_SUBCOL, MIGRATE_STAMP, MAX_PROJECT_DOC_BYTES,
} from './lib/migrate-plan.mjs';

XLSX.set_fs(fs); // required for XLSX.readFile / writeFile in ESM
const WS = 'workspaces/main';
const PROJECTS = `${WS}/projects`;
const BATCH_OPS = 400;
// Project-doc fields the flip sets and rollback restores (Ruling P4-7). memberIds is
// not restored (grants are kept), so it is not part of the before-image.
const BEFORE_KEYS = ['programMeta', 'memberUids', 'visibility', 'v1Absent', 'schemaVersion'];
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const toDate = (t) => (t && typeof t.toDate === 'function' ? t.toDate() : t instanceof Date ? t : new Date());
const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

export const MANIFEST_KIND = 'p2-migrate';

// ---------------------------------------------------------------- pure core

const pickBefore = (doc) => Object.fromEntries(BEFORE_KEYS.filter((k) => hasOwn(doc, k)).map((k) => [k, doc[k]]));
const byKind = (writes) => Object.fromEntries(SUBCOLS.map((k) => [k, writes
  .filter((w) => w.path.split('/')[4] === k)
  .map((w) => ({ id: w.path.split('/')[5], data: w.data }))]));

// Decides the mode from what was read. No I/O.
// doc = live project doc | null; record = migration record | null;
// existing = [{ path, data }] under the 5 sub-collections; v2ActivityIds = Set of ids
// under projects/<pid>/activity; v1Entries = workspaces/main/activity/<pid>.entries.
export function decideMigration({ pid, doc, record, existing = [], v2ActivityIds = new Set(), v1Entries = [], dir, assignments = null, now }) {
  const nowDate = toDate(now);
  const uidByEmail = dir?.uidByEmail || new Map();
  const base = {
    blocked: [], plan: null, reconcile: null, activity: [], record: null, planned: null,
    v1Rev: doc ? doc.rev ?? null : null, v1WriteId: doc ? doc.writeId ?? null : null,
    v1ActivityCount: v1Entries.length,
  };
  const activityOf = () => planActivityCopy(v1Entries, { uidByEmail, now: nowDate, existingIds: v2ActivityIds });

  if (!doc) return { ...base, mode: 'blocked', blocked: [{ code: 'not-found', detail: `${PROJECTS}/${pid}` }] };
  if (doc.schemaVersion === 2) {
    if (record && (record.status === 'switched' || record.status === 'verified')) {
      return { ...base, mode: 'post-flip', record, v1Rev: record.v1Rev ?? null, v1WriteId: record.v1WriteId ?? null, activity: activityOf() };
    }
    const detail = record ? `schemaVersion 2 with migration record status '${record.status}'` : 'schemaVersion 2 and no migration record (pilot copy or manual edit?)';
    return { ...base, mode: 'blocked', blocked: [{ code: 'v2-not-migrated-here', detail }] };
  }

  const plan = planMigration(doc, { pid, dirIndex: dir?.dirIndex ?? null, uidByEmail, assignments });
  if (plan.blocked) return { ...base, mode: 'blocked', blocked: plan.blocked, plan };

  const reconcile = reconcileExisting(plan.writes, existing);
  const keepBefore = record && record.status !== 'rolled-back';
  const at = now ?? nowDate;
  const newRecord = {
    pid,
    status: 'prepared',
    v1Rev: base.v1Rev,
    v1WriteId: base.v1WriteId,
    before: keepBefore ? (record.before ?? {}) : pickBefore(doc),
    ...plan.record,
    history: [...(Array.isArray(record?.history) ? record.history : []), { status: 'prepared', at }],
  };
  // What the v2 side will hold once applied: the count report on the PLANNED docs.
  const allActivity = planActivityCopy(v1Entries, { uidByEmail, now: nowDate });
  const planned = countReport({
    v1Raw: doc,
    normalised: normaliseForV2(doc, { pid }),
    live: { meta: { ...doc, ...plan.flip.fields }, ...byKind(plan.writes), activity: allActivity },
    v1ActivityCount: v1Entries.length,
  });
  return { ...base, mode: 'fresh', plan, reconcile, record: newRecord, planned, activity: activityOf() };
}

const issueLines = (label, list) => (list.length ? [`${label}:`, ...list.map((i) => `  ${i.code}: ${i.detail}`)] : [`${label}: none`]);

// prep = prepareMigration result; nameOfUid(uid) -> display string. -> string[].
export function formatMigrationPreview(prep, { pid, nameOfUid = (u) => u } = {}) {
  const L = [];
  L.push(`Project:     ${PROJECTS}/${pid}`);
  L.push(`Mode:        ${prep.mode}`);
  L.push(`v1 rev:      ${prep.v1Rev} (writeId ${prep.v1WriteId ?? '-'})`);
  if (prep.mode === 'blocked') {
    L.push(...issueLines('BLOCKING', prep.blocked));
    if (prep.plan?.report?.issues?.warnings) L.push(...issueLines('Warnings', prep.plan.report.issues.warnings));
    return L;
  }
  if (prep.mode === 'post-flip') {
    L.push(`Record:      status ${prep.record.status} (already switched: sub-docs are not rewritten)`);
    L.push(`Activity:    ${prep.activity.length} v1 entries to top up (of ${prep.v1ActivityCount}), clamped ${prep.activity.clamped ?? 0}`);
    return L;
  }
  const { report } = prep.plan;
  L.push('Counts (v1 -> v2):');
  for (const r of prep.planned.rows) {
    L.push(`  ${r.kind.padEnd(12)} v1 ${r.v1}${r.removed ? ` - ${r.removed} null` : ''} -> v2 ${r.v2}${r.ok ? '' : '  MISMATCH'}`);
  }
  L.push(`  sub-docs: ${SUBCOLS.map((k) => `${k} ${report.docs[k]}`).join(', ')}`);
  L.push(`  planned round trip: ${prep.planned.roundTrip.equal ? 'equal' : `DIFFERS at ${prep.planned.roundTrip.diffs.join(', ')}`}`);
  L.push(...issueLines('Blocking', report.issues.blocking));
  L.push(...issueLines('Warnings', report.issues.warnings));
  const reid = report.issues.warnings.filter((w) => w.code === 'ref-to-reid');
  if (reid.length) L.push(`  NOTE: ${reid.length} reference(s) point at a re-id'd item and will not follow it (ref-to-reid above).`);
  L.push(`Size:        ${report.docBytes} bytes (block at ${MAX_PROJECT_DOC_BYTES})`);
  L.push(`Id map:      ${prep.record.idMap.length} generated id(s)`);
  for (const m of prep.record.idMap) L.push(`  ${m.kind} ${m.path}: ${JSON.stringify(m.oldId)} -> ${m.newId} (${m.reason})`);
  const rc = prep.reconcile;
  L.push(`Reconcile:   write ${rc.toWrite.length}, skip ${rc.skipped.length}, delete stale ${rc.staleDeletes.length}, foreign ${rc.foreign.length}`);
  for (const p of rc.foreign) L.push(`  FOREIGN (apply refuses): ${p}`);
  const flip = prep.plan.flip.fields;
  L.push(`Flip:        schemaVersion 2, visibility ${flip.visibility}, memberUids ${flip.memberUids.length}${flip.memberIds ? `, memberIds -> ${flip.memberIds.length}` : ''}`);
  L.push('Access grants (HOD approves):');
  const m = report.members;
  if (!m.memberUidsAdded.length && !m.memberIdsAdded.length) L.push('  none');
  for (const u of m.memberUidsAdded) L.push(`  memberUids + ${nameOfUid(u)}`);
  for (const u of m.memberIdsAdded) L.push(`  memberIds  + ${nameOfUid(u)}`);
  if (report.assignments) {
    L.push('Assignments (old -> new):');
    for (const l of formatPreview(report.assignments)) L.push(`  ${l}`);
  } else {
    L.push('Assignments: none');
  }
  L.push(`Activity:    ${prep.activity.length} entries to copy (of ${prep.v1ActivityCount}), clamped ${prep.activity.clamped ?? 0}`);
  return L;
}

// -> { Summary, Checks, 'Id map', Assignments } as arrays of row objects.
export function previewSheets(prep, { pid, nameOfUid = (u) => u } = {}) {
  const Summary = formatMigrationPreview(prep, { pid, nameOfUid }).map((line) => ({ Line: line }));
  const issues = prep.plan?.report?.issues || { blocking: prep.blocked, warnings: [] };
  const Checks = [
    ...(prep.mode === 'blocked' ? prep.blocked : issues.blocking).map((i) => ({ Severity: 'blocking', Code: i.code, Detail: i.detail })),
    ...issues.warnings.map((i) => ({ Severity: 'warning', Code: i.code, Detail: i.detail })),
  ];
  const idMap = (prep.record?.idMap || []).map((m) => ({ Kind: m.kind, Path: m.path, 'Old id': m.oldId == null ? '' : String(m.oldId), 'New id': m.newId, Reason: m.reason }));
  const a = prep.plan?.report?.assignments;
  const fmt = (v) => (v == null ? '' : String(v));
  const Assignments = a ? [
    ...a.programs.flatMap((p) => p.fields.map((f) => ({ Level: 'program', Id: p.id, Name: p.name, Field: f.label, Old: fmt(f.old), New: fmt(f.new) }))),
    ...a.workstreams.flatMap((w) => w.fields.map((f) => ({ Level: 'workstream', Id: w.id, Name: `${w.program} / ${w.name}`, Field: f.label, Old: fmt(f.old), New: fmt(f.new) }))),
  ] : [];
  return { Summary, Checks, 'Id map': idMap, Assignments };
}

// ---------------------------------------------------------------- I/O shell

const docsOf = async (db, path) => {
  const out = [];
  (await db.collection(path).get()).forEach((d) => out.push({ id: d.id, path: `${path}/${d.id}`, data: d.data() }));
  return out;
};

async function readDirectory(db) {
  const members = await docsOf(db, `${WS}/members`);
  const invites = await docsOf(db, `${WS}/invites`);
  return { ...directoryFrom(members, invites), members };
}

async function readV1Entries(db, pid) {
  const snap = await db.doc(`${WS}/activity/${pid}`).get();
  const e = snap.exists ? snap.data()?.entries : null;
  return Array.isArray(e) ? e : [];
}

async function readSubDocs(db, pid) {
  const lists = await Promise.all(SUBCOLS.map((k) => docsOf(db, `${PROJECTS}/${pid}/${k}`)));
  return Object.fromEntries(SUBCOLS.map((k, i) => [k, lists[i]]));
}

// Reads only. See decideMigration for the result (plus `dir` for name lookups).
export async function prepareMigration(db, { pid, assignments = null, now = new Date() }) {
  const snap = await db.doc(`${PROJECTS}/${pid}`).get();
  const doc = snap.exists ? snap.data() : null;
  const recSnap = await db.doc(RECORD_PATH(pid)).get();
  const record = recSnap.exists ? recSnap.data() : null;
  const dir = await readDirectory(db);
  const sub = await readSubDocs(db, pid);
  const existing = SUBCOLS.flatMap((k) => sub[k].map((d) => ({ path: d.path, data: d.data })));
  const v2ActivityIds = new Set((await docsOf(db, `${PROJECTS}/${pid}/${ACTIVITY_SUBCOL}`)).map((d) => d.id));
  const v1Entries = await readV1Entries(db, pid);
  const prep = decideMigration({ pid, doc, record, existing, v2ActivityIds, v1Entries, dir, assignments, now });
  return { ...prep, dir };
}

async function runBatched(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_OPS) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_OPS)) {
      if (op.delete) batch.delete(db.doc(op.path));
      else batch.set(db.doc(op.path), op.data);
    }
    await batch.commit();
  }
}

// Read everything back. Baseline = normaliseForV2(frozen v1 doc): re-runnable at any time.
// The activity row counts only copied docs of the CURRENT v1 entries (client-created v2
// events and copies of entries trimmed from the v1 feed are not compared).
export async function verifyMigration(db, pid) {
  const snap = await db.doc(`${PROJECTS}/${pid}`).get();
  if (!snap.exists) throw fail('NOT_FOUND', `${PROJECTS}/${pid} not found`);
  const doc = snap.data();
  const sub = await readSubDocs(db, pid);
  const v1Entries = await readV1Entries(db, pid);
  const expectIds = new Set(planActivityCopy(v1Entries).map((d) => d.id));
  const activity = (await docsOf(db, `${PROJECTS}/${pid}/${ACTIVITY_SUBCOL}`))
    .filter((d) => d.data?.copiedBy === MIGRATE_STAMP && expectIds.has(d.id));
  const strip = (list) => list.map(({ id, data }) => ({ id, data }));
  return countReport({
    v1Raw: doc,
    normalised: normaliseForV2(doc, { pid }),
    live: {
      meta: doc,
      workstreams: strip(sub.workstreams), tasks: strip(sub.tasks), actions: strip(sub.actions),
      raid: strip(sub.raid), decisions: strip(sub.decisions), activity: strip(activity),
    },
    v1ActivityCount: v1Entries.length,
  });
}

async function copyActivity(db, pid, { uidByEmail, now, Timestamp }) {
  const v1Entries = await readV1Entries(db, pid);
  const existingIds = new Set((await docsOf(db, `${PROJECTS}/${pid}/${ACTIVITY_SUBCOL}`)).map((d) => d.id));
  const docs = planActivityCopy(v1Entries, { uidByEmail, now: toDate(now), existingIds });
  const ts = (d) => (Timestamp ? Timestamp.fromDate(d) : d);
  await runBatched(db, docs.map((d) => ({
    path: `${PROJECTS}/${pid}/${ACTIVITY_SUBCOL}/${d.id}`,
    data: { ...d.data, createdAt: ts(d.data.createdAt) },
  })));
  return { copied: docs.length, clamped: docs.clamped };
}

async function setStatus(db, pid, status, at) {
  const ref = db.doc(RECORD_PATH(pid));
  const cur = (await ref.get()).data() || {};
  const history = [...(Array.isArray(cur.history) ? cur.history : []), { status, at }];
  await ref.update({ status, history });
}

// See the header for the order. Throws Error with code BLOCKED / FOREIGN_DOCS (nothing
// written) or REV_CHANGED (record 'prepared' and invisible sub-docs written, v1 intact).
export async function applyMigration(db, { pid, assignments = null, now = new Date(), Timestamp, FieldValue, writeManifest, hooks = {} }) {
  void FieldValue; // part of the shared signature (rollback uses it)
  const prep = await prepareMigration(db, { pid, assignments, now });
  if (hooks.onPrepared) await hooks.onPrepared(prep);
  if (prep.mode === 'blocked') {
    throw fail('BLOCKED', `Blocked: ${prep.blocked.map((b) => `${b.code} (${b.detail})`).join('; ')}. Nothing was written.`, { blocked: prep.blocked });
  }
  const at = now ?? new Date();
  const { uidByEmail } = prep.dir;
  let written = 0;
  let deleted = 0;

  if (prep.mode === 'fresh') {
    const rc = prep.reconcile;
    if (rc.foreign.length) {
      throw fail('FOREIGN_DOCS', `Refusing to apply: docs not written by ${MIGRATE_STAMP} (or edited) exist: ${rc.foreign.slice(0, 10).join(', ')}. Nothing was written.`, { foreign: rc.foreign });
    }
    const base = `${PROJECTS}/${pid}`;
    const live = (await db.doc(base).get()).data() || {};
    const existingByPath = new Map();
    for (const k of SUBCOLS) for (const d of await docsOf(db, `${base}/${k}`)) existingByPath.set(d.path, d.data);
    const before = (p) => (existingByPath.has(p) ? toJsonable(existingByPath.get(p), Timestamp) : null);
    const flipFields = prep.plan.flip.fields;

    // 1. record, 2. manifest (before any sub-doc write).
    await db.doc(RECORD_PATH(pid)).set(prep.record);
    writeManifest({
      kind: MANIFEST_KIND,
      pid,
      v1Rev: prep.v1Rev,
      v1WriteId: prep.v1WriteId,
      createdAt: new Date().toISOString(),
      entries: [
        ...rc.toWrite.map((w) => ({ op: 'set', path: w.path, before: before(w.path) })),
        ...rc.staleDeletes.map((p) => ({ op: 'delete', path: p, before: before(p) })),
        {
          op: 'flip', path: base, fields: Object.keys(flipFields),
          before: toJsonable(Object.fromEntries(Object.keys(flipFields).filter((k) => hasOwn(live, k)).map((k) => [k, live[k]])), Timestamp),
        },
      ],
      idMap: prep.record.idMap,
    });

    // 3. sub-docs (invisible until the flip).
    await runBatched(db, [
      ...rc.toWrite.map((w) => ({ path: w.path, data: w.data })),
      ...rc.staleDeletes.map((p) => ({ path: p, delete: true })),
    ]);
    written = rc.toWrite.length;
    deleted = rc.staleDeletes.length;

    if (hooks.beforeFlip) await hooks.beforeFlip();

    // 4. the flip (Ruling P4-5).
    await db.runTransaction(async (tx) => {
      const s = await tx.get(db.doc(base));
      const d = s.exists ? s.data() : null;
      const why = !d ? 'project doc is gone'
        : (d.rev ?? null) !== prep.v1Rev ? `rev ${d.rev ?? null} !== planned ${prep.v1Rev}`
        : (d.writeId ?? null) !== prep.v1WriteId ? 'writeId changed'
        : d.deletedAt ? 'project was deleted'
        : d.schemaVersion === 2 ? 'already schemaVersion 2'
        : null;
      if (why) throw fail('REV_CHANGED', `Flip refused: ${why}. The project stays v1; re-run the migration.`);
      tx.update(db.doc(base), flipFields);
    });

    // 5. switched.
    await setStatus(db, pid, 'switched', at);
  }

  // 6. activity copy (also the post-flip top-up), 7. verify, 8. verified.
  const act = await copyActivity(db, pid, { uidByEmail, now, Timestamp });
  const verify = await verifyMigration(db, pid);
  const status = (await db.doc(RECORD_PATH(pid)).get()).data()?.status;
  if (verify.ok && status !== 'verified') await setStatus(db, pid, 'verified', at);
  return { mode: prep.mode, written, deleted, activityCopied: act.copied, activityClamped: act.clamped, verify };
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const o = { pos: [], apply: false, key: 'service-account.json', assignments: null, noAssignments: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v === '' || v.startsWith('--')) o.error = o.error || `${a} needs a value`;
      return v;
    };
    if (a === '--apply') o.apply = true;
    else if (a === '--key') o.key = value();
    else if (a === '--assignments') o.assignments = value();
    else if (a === '--no-assignments') o.noAssignments = true;
    else if (a.startsWith('--')) o.error = o.error || `Unknown argument: ${a}`;
    else o.pos.push(a);
  }
  if (!o.error && (o.pos.length !== 1 || o.pos[0].includes('/'))) o.error = 'Exactly one project id (no "/") is required';
  if (!o.error && o.assignments && o.noAssignments) o.error = 'Use either --assignments or --no-assignments, not both';
  // Ruling P4-9: --apply needs an explicit assignments choice.
  if (!o.error && o.apply && !o.assignments && !o.noAssignments) o.error = '--apply needs --assignments <xlsx> or --no-assignments (Ruling P4-9)';
  return o;
}

const USAGE = 'Usage: node scripts/p2-migrate.mjs <pid> [--assignments x.xlsx | --no-assignments] [--apply] [--key service-account.json]';

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

function nameLookup(members) {
  const byUid = new Map(members.map((m) => [m.id, m.data || {}]));
  return (uid) => {
    const m = byUid.get(uid);
    return m ? `${m.displayName || '?'} <${m.email || '?'}> (${uid})` : `${uid} (not in members)`;
  };
}

function writePreviewXlsx(path, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ '(none)': '' }]), name);
  }
  XLSX.writeFile(wb, path);
}

function printVerify(v) {
  console.log(`Verify:      ${v.ok ? 'OK' : 'MISMATCH'}`);
  for (const r of v.rows) console.log(`  ${r.kind.padEnd(12)} v1 ${r.v1}${r.removed ? ` - ${r.removed} null` : ''} -> v2 ${r.v2}${r.ok ? '' : '  MISMATCH'}`);
  if (!v.roundTrip.equal) console.log(`  round trip differs at: ${v.roundTrip.diffs.join(', ')}`);
  if (v.orphanCount) console.log(`  orphans: ${v.orphanCount}`);
  if (v.linkMismatches.length) console.log(`  task link mismatches: ${v.linkMismatches.join(', ')}`);
  for (const o of v.orderIssues) console.log(`  order ${o.kind} in ${o.group}: ${o.ids.join(', ')}`);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.error) { console.error(o.error); console.error(USAGE); process.exit(1); }
  const [pid] = o.pos;
  let assignments = null;
  if (o.assignments) {
    if (!fs.existsSync(o.assignments)) { console.error(`Assignments file not found: ${o.assignments}`); process.exit(1); }
    assignments = parseAssignmentsWorkbook(XLSX.readFile(o.assignments));
  }
  // Key check first: nothing below touches Firestore without it.
  const { db, FieldValue, Timestamp } = await openDb(o.key);
  const now = Timestamp.now();
  const prep = await prepareMigration(db, { pid, assignments, now });
  const nameOfUid = nameLookup(prep.dir.members);
  for (const l of formatMigrationPreview(prep, { pid, nameOfUid })) console.log(l);
  const xlsxPath = `p2-migrate-preview-${pid}.xlsx`;
  writePreviewXlsx(xlsxPath, previewSheets(prep, { pid, nameOfUid }));
  console.log(`Preview:     ${xlsxPath}`);
  if (prep.mode === 'post-flip') printVerify(await verifyMigration(db, pid));
  const refused = prep.mode === 'blocked' || (prep.reconcile?.foreign.length ?? 0) > 0;
  if (!o.apply) {
    console.log('Dry run: Firestore untouched. Re-run with --apply (and --assignments or --no-assignments) to write.');
    process.exit(refused ? 1 : 0);
  }
  if (refused) { console.error('Refusing to apply (see above). Nothing was written.'); process.exit(1); }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestPath = `p2-migrate-manifest-${pid}-${stamp}.json`;
  let r;
  try {
    r = await applyMigration(db, {
      pid, assignments, now, Timestamp, FieldValue,
      writeManifest: (m) => fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2)),
    });
  } catch (e) {
    console.error(`${e.code ? `[${e.code}] ` : ''}${e.message || e}`);
    process.exit(1);
  }
  console.log(`Applied (${r.mode}): ${r.written} sub-docs written, ${r.deleted} stale deleted, ${r.activityCopied} activity copied (clamped ${r.activityClamped}).`);
  if (r.mode === 'fresh') console.log(`Manifest:    ${manifestPath}`);
  printVerify(r.verify);
  if (!r.verify.ok) {
    console.error('Verification mismatch: the record stays "switched". No automatic rollback (Ruling P4-14): fix forward or run --rollback.');
    process.exit(2);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e.message || e); process.exit(1); });
