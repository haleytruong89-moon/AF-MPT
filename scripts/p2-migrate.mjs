// P2.4 Task 5: switch ONE real project in place from v1 to v2 (spec M4).
//
// Order of writes (plan "Architecture", Rulings P4-4..P4-8, P4-16):
//  0. refuse (nothing written) when blocked, when the plan hash differs from --expect
//     (the hash of the preview HOD approved), or when foreign sub-docs exist;
//  1. the migration record workspaces/main/migrations/<pid> (status 'prepared', before-image);
//  2. the local manifest (audit copy of this run);
//  3. the sub-collection docs (workstreams / tasks / actions / raid / decisions), batched,
//     plus stale stamped docs deleted. They stay invisible while schemaVersion is not 2;
//  4. THE FLIP, last, in ONE transaction with the record status 'switched': requires the
//     live project doc to still have rev === v1Rev, the same writeId, no deletedAt,
//     schemaVersion !== 2 and unchanged memberIds / roles / visibility (else REV_CHANGED
//     and nothing becomes visible), then sets programMeta / memberUids / visibility /
//     v1Absent / schemaVersion 2 (+ memberIds when assignments add people);
//  5. activity copy (top-up); 6. read-back verify; 7. record 'verified'.
// The frozen v1 arrays (programs / actionItems / decisions) are never written.
// A re-run after the flip only tops up the activity copy and re-verifies (Ruling P4-6);
// it reports v2 edits, and verify drift explained by them is expected (exit 0).
// A failed verify otherwise exits 2 and leaves the record 'switched' (Ruling P4-14).
//
// Usage:
//   node scripts/p2-migrate.mjs <pid> [--assignments p2-assignments.xlsx | --no-assignments] [--key service-account.json]          (preview, read-only; prints the plan hash)
//   node scripts/p2-migrate.mjs <pid> (--assignments p2-assignments.xlsx | --no-assignments) --apply --expect <plan hash> [--key service-account.json]
//   (after the switch, a top-up run uses --expect post-flip)
//   node scripts/p2-migrate.mjs --rollback <pid> [--force-with-report] [--delete-v2-docs] [--key ...]                    (rollback preview, read-only; prints the rollback hash)
//   node scripts/p2-migrate.mjs --rollback <pid> [same flags] --apply --expect <rollback hash>
// Exit codes: 0 ok; 1 usage / blocked / refused / PLAN_CHANGED; 2 verification mismatch after
// the flip; 3 rollback refused because v2 edits were found (see the rollback section).
// Outputs (gitignored, contain people names): p2-migrate-preview-<pid>.xlsx,
// p2-migrate-manifest-<pid>-<stamp>.json, p2-rollback-lost-<pid>-<stamp>.json.

import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { toJsonable } from './lib/manifest.mjs';
import { directoryFrom } from './p2-pilot-copy.mjs';
import { parseAssignmentsWorkbook, formatPreview } from './lib/assignments.mjs';
import { normaliseForV2, stableJson } from './lib/migrate-normalise.mjs';
import { countReport, detectV2Edits, inactiveMembers } from './lib/migrate-checks.mjs';
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
// --expect value for a post-flip run: it only tops up activity, so there is no plan to approve.
export const POST_FLIP_HASH = 'post-flip';

// ---------------------------------------------------------------- pure core

const arr = (v) => (Array.isArray(v) ? v : []);
const accessLossLabel = (m) => `${m.uid} (${[m.name, m.email].filter(Boolean).join(', ') || 'unknown person'}; members doc ${m.status})`;
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
    // 'prepared' + v2 with the planned rev / writeId and the programMeta this run wrote
    // = a flip whose status write was lost (before the status moved into the flip
    // transaction): recover as post-flip. Anything less exact stays blocked.
    const stuck = Boolean(record) && record.status === 'prepared'
      && doc.rev != null && record.v1Rev === doc.rev
      && (record.v1WriteId ?? null) === (doc.writeId ?? null)
      && isDeepStrictEqual(doc.programMeta, record.written?.programMeta);
    if (record && (record.status === 'switched' || record.status === 'verified' || stuck)) {
      return { ...base, mode: 'post-flip', record, v1Rev: record.v1Rev ?? null, v1WriteId: record.v1WriteId ?? null, activity: activityOf(), planHash: POST_FLIP_HASH };
    }
    const detail = record ? `schemaVersion 2 with migration record status '${record.status}'` : 'schemaVersion 2 and no migration record (pilot copy or manual edit?)';
    return { ...base, mode: 'blocked', blocked: [{ code: 'v2-not-migrated-here', detail }] };
  }

  const plan = planMigration(doc, { pid, dirIndex: dir?.dirIndex ?? null, uidByEmail, assignments });
  if (plan.blocked) return { ...base, mode: 'blocked', blocked: plan.blocked, plan };

  const reconcile = reconcileExisting(plan.writes, existing);
  const at = now ?? nowDate;
  const newRecord = {
    pid,
    status: 'prepared',
    v1Rev: base.v1Rev,
    v1WriteId: base.v1WriteId,
    // Always the live doc: a stale before-image from an earlier prepared run would restore old values.
    before: pickBefore(doc),
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
  // Access fields the flip guard re-checks (a revoke between preview and flip refuses it).
  const flipIds = [...arr(doc.memberIds), ...arr(plan.flip.fields.memberIds), ...arr(plan.flip.fields.memberUids)];
  const accessLoss = inactiveMembers(flipIds, dir?.members);
  if (accessLoss && accessLoss.length) {
    plan.report.issues.warnings.push({ code: 'member-not-active', detail: accessLoss.map(accessLossLabel).join('; ') });
  }
  const guard = { memberIds: doc.memberIds, roles: doc.roles, visibility: doc.visibility };
  const prep = { ...base, mode: 'fresh', accessLoss, plan, reconcile, record: newRecord, planned, guard, activity: activityOf() };
  return { ...prep, planHash: planHash(prep, pid) };
}

// Ruling P4-16: hash of everything HOD approves in the preview. Excludes times
// (history.at, now) and the activity copy (it is a top-up, re-run after the flip).
export function planHash(prep, pid) {
  const payload = {
    pid,
    v1Rev: prep.v1Rev,
    v1WriteId: prep.v1WriteId,
    writes: prep.plan.writes.map((w) => ({ path: w.path, data: w.data })),
    staleDeletes: prep.reconcile.staleDeletes,
    flip: prep.plan.flip.fields,
    members: prep.plan.report.members,
    assignments: prep.plan.report.assignments ?? null,
    idMap: prep.record.idMap,
    accessLoss: prep.accessLoss ?? null,
  };
  return createHash('sha256').update(stableJson(payload)).digest('hex').slice(0, 16);
}

// CLI exit code for an apply result: 0 ok; 0 for post-flip drift explained by v2 edits,
// but only when the record was 'verified' when this run started, i.e. in the current
// migrate cycle (a switch that never verified must verify clean first; the history of
// earlier migrate -> rollback cycles does not count); 2 for any other failed verify
// (Ruling P4-14).
export function exitCodeFor(r) {
  if (r.verify.ok) return 0;
  const e = r.edits;
  if (r.mode === 'post-flip' && r.wasVerified && e && (e.edited.length || e.deleted.length || e.programMetaChanged)) return 0;
  return 2;
}

const issueLines = (label, list) => (list.length ? [`${label}:`, ...list.map((i) => `  ${i.code}: ${i.detail}`)] : [`${label}: none`]);

// prep = prepareMigration result; nameOfUid(uid) -> display string. -> string[].
export function formatMigrationPreview(prep, { pid, nameOfUid = (u) => u, assignmentsGiven = false } = {}) {
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
    if (assignmentsGiven) L.push('Assignments: ignored (post-flip)');
    L.push(`Plan hash:   ${prep.planHash}  (top-up only: apply with --expect ${prep.planHash})`);
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
  if (prep.accessLoss == null) L.push('Access loss: not checked (offline)');
  else if (!prep.accessLoss.length) L.push('Access loss: none');
  else {
    L.push('Access loss (HOD approves): in memberIds / memberUids but no active members doc, so they can read v1 now and will NOT load the project after the flip:');
    for (const m of prep.accessLoss) L.push(`  ${accessLossLabel(m)}`);
  }
  if (report.assignments) {
    L.push('Assignments (old -> new):');
    for (const l of formatPreview(report.assignments)) L.push(`  ${l}`);
  } else {
    L.push('Assignments: none');
  }
  L.push(`Activity:    ${prep.activity.length} entries to copy (of ${prep.v1ActivityCount}), clamped ${prep.activity.clamped ?? 0}`);
  L.push(`Plan hash:   ${prep.planHash}  (apply with --expect ${prep.planHash})`);
  return L;
}

// -> { Summary, Checks, 'Id map', Assignments } as arrays of row objects.
export function previewSheets(prep, { pid, nameOfUid = (u) => u, assignmentsGiven = false } = {}) {
  const Summary = formatMigrationPreview(prep, { pid, nameOfUid, assignmentsGiven }).map((line) => ({ Line: line }));
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

export const docsOf = async (db, path) => {
  const out = [];
  (await db.collection(path).get()).forEach((d) => out.push({ id: d.id, path: `${path}/${d.id}`, data: d.data() }));
  return out;
};

export async function readDirectory(db) {
  const members = await docsOf(db, `${WS}/members`);
  const invites = await docsOf(db, `${WS}/invites`);
  return { ...directoryFrom(members, invites), members };
}

async function readV1Entries(db, pid) {
  const snap = await db.doc(`${WS}/activity/${pid}`).get();
  const e = snap.exists ? snap.data()?.entries : null;
  return Array.isArray(e) ? e : [];
}

export async function readSubDocs(db, pid) {
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

const historyWith = (cur, status, at) => [...(Array.isArray(cur?.history) ? cur.history : []), { status, at }];

async function setStatus(db, pid, status, at) {
  const ref = db.doc(RECORD_PATH(pid));
  const cur = (await ref.get()).data() || {};
  await ref.update({ status, history: historyWith(cur, status, at) });
}

// Live sub-docs + activity in the shape detectV2Edits expects.
async function detectEdits(db, pid, record) {
  const meta = (await db.doc(`${PROJECTS}/${pid}`).get()).data() || {};
  const sub = await readSubDocs(db, pid);
  const docs = Object.fromEntries(SUBCOLS.map((k) => [k, sub[k].map(({ id, data }) => ({ id, data }))]));
  const activity = (await docsOf(db, `${PROJECTS}/${pid}/${ACTIVITY_SUBCOL}`)).map(({ id, data }) => ({ id, data }));
  return detectV2Edits(record, { meta, docs, activity });
}

// See the header for the order. Throws Error with code BLOCKED / PLAN_CHANGED /
// FOREIGN_DOCS (nothing written) or REV_CHANGED (record 'prepared' and invisible
// sub-docs written, v1 intact). expectHash (CLI --expect): when given, a fresh run
// refuses unless the plan it is about to apply has exactly that hash (Ruling P4-16).
export async function applyMigration(db, { pid, assignments = null, now = new Date(), Timestamp, FieldValue, writeManifest, expectHash, hooks = {} }) {
  void FieldValue; // part of the shared signature (rollback uses it)
  const stepTime = () => (Timestamp ? Timestamp.now() : new Date());
  const prep = await prepareMigration(db, { pid, assignments, now });
  if (hooks.onPrepared) await hooks.onPrepared(prep);
  if (prep.mode === 'blocked') {
    throw fail('BLOCKED', `Blocked: ${prep.blocked.map((b) => `${b.code} (${b.detail})`).join('; ')}. Nothing was written.`, { blocked: prep.blocked });
  }
  if (expectHash !== undefined && expectHash !== prep.planHash) {
    throw fail('PLAN_CHANGED', `Plan changed since the approved preview (expected ${expectHash}, now ${prep.planHash}). Re-run the preview and get it approved. Nothing was written.`, { planHash: prep.planHash });
  }
  const { uidByEmail } = prep.dir;
  const recRef = db.doc(RECORD_PATH(pid));
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
    const hist = prep.record.history.slice(0, -1);
    await recRef.set({ ...prep.record, history: historyWith({ history: hist }, 'prepared', stepTime()) });
    writeManifest({
      kind: MANIFEST_KIND,
      pid,
      v1Rev: prep.v1Rev,
      v1WriteId: prep.v1WriteId,
      planHash: prep.planHash,
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

    // 4. the flip (Ruling P4-5) and 5. status 'switched', in ONE transaction.
    // Also refused when the access fields changed since the preview (a revoke).
    await db.runTransaction(async (tx) => {
      const s = await tx.get(db.doc(base));
      const rs = await tx.get(recRef);
      const d = s.exists ? s.data() : null;
      const r = rs.exists ? rs.data() : null;
      const g = prep.guard;
      const why = !d ? 'project doc is gone'
        : (d.rev ?? null) !== prep.v1Rev ? `rev ${d.rev ?? null} !== planned ${prep.v1Rev}`
        : (d.writeId ?? null) !== prep.v1WriteId ? 'writeId changed'
        : d.deletedAt ? 'project was deleted'
        : d.schemaVersion === 2 ? 'already schemaVersion 2'
        : !isDeepStrictEqual(d.memberIds, g.memberIds) ? 'memberIds changed'
        : !isDeepStrictEqual(d.roles, g.roles) ? 'roles changed'
        : !isDeepStrictEqual(d.visibility, g.visibility) ? 'visibility changed'
        : !r || r.status !== 'prepared' ? 'migration record changed'
        : null;
      if (why) throw fail('REV_CHANGED', `Flip refused: ${why}. The project stays v1; re-run the preview.`);
      tx.update(db.doc(base), flipFields);
      tx.update(recRef, { status: 'switched', history: historyWith(r, 'switched', stepTime()) });
    });
    if (hooks.afterFlip) await hooks.afterFlip();
  } else if (prep.record.status === 'prepared') {
    // Recovery of a flip whose status write was lost (see decideMigration).
    await setStatus(db, pid, 'switched', stepTime());
  }

  // 6. activity copy (also the post-flip top-up), 7. verify, 8. verified.
  const act = await copyActivity(db, pid, { uidByEmail, now, Timestamp });
  const verify = await verifyMigration(db, pid);
  const rec = (await recRef.get()).data();
  if (verify.ok && rec?.status !== 'verified') await setStatus(db, pid, 'verified', stepTime());
  const edits = prep.mode === 'post-flip' ? await detectEdits(db, pid, rec) : null;
  // Verified BEFORE this run, in the current cycle (prep.record is the record as read up
  // front; its history accumulates across migrate -> rollback cycles, so it is not used).
  const wasVerified = prep.mode === 'post-flip' && prep.record?.status === 'verified';
  return { mode: prep.mode, written, deleted, activityCopied: act.copied, activityClamped: act.clamped, verify, edits, wasVerified };
}

// ---------------------------------------------------------------- rollback (Ruling P4-7)
//
// The record (Ruling P4-4) is the source of truth. Order:
//  0. refuse (nothing written) when there is no record / it is rolled back (NOT_MIGRATED),
//     the project is not schemaVersion 2 (NOT_SWITCHED), the plan hash differs from
//     --expect (PLAN_CHANGED), or v2 edits exist without --force-with-report (EDITS_FOUND);
//  1. with force and edits: the lost-data report (writeLostReport) BEFORE any write;
//  2. ONE transaction re-reads everything, requires the same plan (hash) as the preview,
//     restores programMeta / memberUids / visibility / v1Absent / schemaVersion from
//     record.before (absent -> field delete), keeps memberIds, bumps rev and sets
//     writeId 'p2-rollback-<stamp>' (a stale v1 tab then gets the conflict banner instead
//     of silently reverting top-level fields), and sets the record 'rolled-back' with a
//     history entry. A refusal after step 1 marks the error lostReportVoid (the lost-data
//     file is void: nothing was rolled back);
//  3. only with --delete-v2-docs: deletes record-listed stamped docs and copied activity
//     (plus the edited / client-created docs listed in the lost report when forced), each
//     guarded by its read update time. Anything else is left and reported.

const ROLLBACK_FROM = new Set(['prepared', 'switched', 'verified']);
const stripDocs = (list) => (Array.isArray(list) ? list : []).map(({ id, data }) => ({ id, data }));

// Pure. doc = live project | null; record | null; docs = { kind: [{ id, path, data, updateTime? }] };
// activity = [{ id, path, data, updateTime? }] under projects/<pid>/activity.
export function decideRollback({ pid, doc, record, docs = {}, activity = [], force = false, deleteDocs = false }) {
  const out = {
    pid, blocked: [], recordStatus: record?.status ?? null, edits: null, restore: [], lost: null,
    refused: false, deletes: [], keep: [], memberIds: doc?.memberIds ?? null, hash: null, force, deleteDocs,
  };
  const block = (code, detail) => ({ ...out, blocked: [{ code, detail }] });
  if (!record) return block('NOT_MIGRATED', `no migration record at ${RECORD_PATH(pid)}`);
  if (record.status === 'rolled-back') return block('NOT_MIGRATED', 'the migration record is already rolled-back');
  if (!doc) return block('NOT_FOUND', `${PROJECTS}/${pid} not found`);
  if (doc.schemaVersion !== 2) return block('NOT_SWITCHED', `schemaVersion is ${doc.schemaVersion ?? '(absent)'}: the project is still v1 (record '${record.status}')`);
  if (!ROLLBACK_FROM.has(record.status)) return block('NOT_SWITCHED', `unexpected record status '${record.status}'`);

  const edits = detectV2Edits(record, {
    meta: doc,
    docs: Object.fromEntries(SUBCOLS.map((k) => [k, stripDocs(docs[k])])),
    activity: stripDocs(activity),
  });
  const before = record.before || {};
  const restore = BEFORE_KEYS.map((field) => ({
    field, present: hasOwn(before, field), old: before[field], nowPresent: hasOwn(doc, field), now: doc[field],
  }));
  const editedKey = new Set(edits.edited.map((e) => `${e.kind}/${e.id}`));
  const newEvents = new Set(edits.newActivity);
  let lost = null;
  if (!edits.clean) {
    lost = {
      docs: Object.fromEntries(SUBCOLS.map((k) => [k, Object.fromEntries((docs[k] || [])
        .filter((d) => editedKey.has(`${k}/${d.id}`)).map((d) => [d.id, d.data]))])),
      programMeta: edits.programMetaChanged ? { live: doc.programMeta ?? null, written: record.written?.programMeta ?? null } : null,
      newActivity: activity.filter((a) => newEvents.has(a.id)).map(({ id, data }) => ({ id, data })),
      deleted: edits.deleted,
    };
  }
  // Delete plan: never a doc the record does not list (or a client doc) unless forced
  // and therefore in the lost report.
  const deletes = [];
  const keep = [];
  for (const k of SUBCOLS) {
    const listed = new Set(Array.isArray(record.docIds?.[k]) ? record.docIds[k] : []);
    for (const d of docs[k] || []) {
      const ok = editedKey.has(`${k}/${d.id}`) ? force : listed.has(d.id);
      (deleteDocs && ok ? deletes : keep).push({ path: d.path, updateTime: d.updateTime ?? null });
    }
  }
  for (const a of activity) {
    const ok = a.data?.copiedBy === MIGRATE_STAMP ? true : force;
    (deleteDocs && ok ? deletes : keep).push({ path: a.path, updateTime: a.updateTime ?? null });
  }
  const res = { ...out, edits, restore, lost, refused: !edits.clean && !force, deletes, keep };
  const hash = createHash('sha256').update(stableJson({
    kind: 'rollback', pid, status: record.status, history: Array.isArray(record.history) ? record.history.length : 0,
    v1Rev: record.v1Rev ?? null, restore, memberIds: doc.memberIds ?? null, edits, lost,
    deletes: deletes.map((d) => d.path), force, deleteDocs,
  })).digest('hex').slice(0, 16);
  return { ...res, hash };
}

export const rollbackExitCode = (e) => (e && e.code === 'EDITS_FOUND' ? 3 : 1);

const fmtVal = (present, v) => {
  if (!present) return '(absent)';
  if (Array.isArray(v)) return `[${v.length} item(s)]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).length} key(s)}`;
  return JSON.stringify(v);
};

export function editLines(e) {
  const L = [`v2 edits:    edited ${e.edited.length}, deleted ${e.deleted.length}, programMeta ${e.programMetaChanged ? 'changed' : 'unchanged'}, new events ${e.newActivity.length}`];
  for (const d of e.edited.slice(0, 50)) L.push(`  edited ${d.kind}/${d.id} (version ${d.version}, updatedBy ${d.updatedBy})`);
  if (e.edited.length > 50) L.push(`  ... ${e.edited.length - 50} more edited`);
  for (const d of e.deleted.slice(0, 50)) L.push(`  deleted ${d.kind}/${d.id}`);
  for (const id of e.newActivity.slice(0, 50)) L.push(`  new event activity/${id}`);
  return L;
}

// prep = prepareRollback result -> string[].
export function formatRollbackPreview(prep, { pid } = {}) {
  const L = [`Rollback:    ${PROJECTS}/${pid}`];
  if (prep.blocked.length) {
    L.push(...issueLines('BLOCKING', prep.blocked));
    return L;
  }
  L.push(`Record:      status ${prep.recordStatus}`);
  L.push('Restore (old <- now):');
  for (const r of prep.restore) {
    const same = r.present === r.nowPresent && isDeepStrictEqual(r.old, r.now);
    L.push(`  ${r.field.padEnd(14)} ${fmtVal(r.present, r.old)} <- ${fmtVal(r.nowPresent, r.now)}${same ? '  (unchanged)' : ''}`);
  }
  L.push(`  ${'memberIds'.padEnd(14)} kept ${fmtVal(prep.memberIds != null, prep.memberIds)} (grants are not revoked)`);
  L.push(...editLines(prep.edits));
  if (prep.lost) {
    const n = SUBCOLS.reduce((s, k) => s + Object.keys(prep.lost.docs[k]).length, 0);
    L.push(`Lost data:   ${n} edited/created doc(s), programMeta ${prep.lost.programMeta ? 'changed' : 'unchanged'}, ${prep.lost.newActivity.length} new event(s), ${prep.lost.deleted.length} deleted doc(s)`);
    L.push(prep.force
      ? '  --force-with-report: p2-rollback-lost-<pid>-<stamp>.json is written BEFORE any Firestore write'
      : '  REFUSED (exit 3): re-run the preview with --force-with-report to keep a lost-data file and proceed');
  } else {
    L.push('Lost data:   none (no v2 edits)');
  }
  if (prep.deleteDocs) {
    L.push(`Delete:      ${prep.deletes.length} v2 doc(s); left in place ${prep.keep.length}`);
    for (const d of prep.keep.slice(0, 20)) L.push(`  keep ${d.path}`);
  } else {
    L.push(`Delete:      none (${prep.keep.length} v2 doc(s) stay, invisible; add --delete-v2-docs to delete)`);
  }
  const flags = `${prep.force ? ' --force-with-report' : ''}${prep.deleteDocs ? ' --delete-v2-docs' : ''}`;
  L.push(prep.refused
    ? `Plan hash:   ${prep.hash}  (not applicable: refused without --force-with-report)`
    : `Plan hash:   ${prep.hash}  (apply with --rollback ${pid}${flags} --apply --expect ${prep.hash})`);
  return L;
}

async function readRollbackState(db, pid, tx = null) {
  const get = (ref) => (tx ? tx.get(ref) : ref.get());
  const ps = await get(db.doc(`${PROJECTS}/${pid}`));
  const rs = await get(db.doc(RECORD_PATH(pid)));
  const list = async (path) => (await get(db.collection(path))).docs
    .map((d) => ({ id: d.id, path: `${path}/${d.id}`, data: d.data(), updateTime: d.updateTime }));
  const docs = {};
  for (const k of SUBCOLS) docs[k] = await list(`${PROJECTS}/${pid}/${k}`);
  const activity = await list(`${PROJECTS}/${pid}/${ACTIVITY_SUBCOL}`);
  return { doc: ps.exists ? ps.data() : null, record: rs.exists ? rs.data() : null, docs, activity };
}

// Reads only.
export async function prepareRollback(db, { pid, force = false, deleteDocs = false }) {
  return decideRollback({ pid, ...(await readRollbackState(db, pid)), force, deleteDocs });
}

// See the section header. Throws NOT_MIGRATED / NOT_FOUND / NOT_SWITCHED / PLAN_CHANGED /
// EDITS_FOUND with nothing written (PLAN_CHANGED from inside the transaction can follow a
// lost-data report, but no Firestore write).
export async function rollbackMigration(db, { pid, force = false, deleteDocs = false, FieldValue, Timestamp, writeLostReport, expectHash, hooks = {} }) {
  const stepTime = () => (Timestamp ? Timestamp.now() : new Date());
  const prep = await prepareRollback(db, { pid, force, deleteDocs });
  if (prep.blocked.length) {
    const b = prep.blocked[0];
    throw fail(b.code, `Rollback refused: ${b.detail}. Nothing was written.`);
  }
  if (expectHash !== undefined && expectHash !== prep.hash) {
    throw fail('PLAN_CHANGED', `Rollback plan changed since the approved preview (expected ${expectHash}, now ${prep.hash}). Re-run the preview. Nothing was written.`, { hash: prep.hash });
  }
  if (prep.refused) {
    throw fail('EDITS_FOUND', 'Rollback refused: the v2 data was edited (see the list). Re-run with --force-with-report to keep a lost-data file and proceed. Nothing was written.', { edits: prep.edits });
  }
  if (prep.lost) {
    const jsonable = (v) => (Timestamp ? toJsonable(v, Timestamp) : v);
    await writeLostReport({
      kind: 'p2-rollback-lost', pid, createdAt: new Date().toISOString(), recordStatus: prep.recordStatus,
      edits: prep.edits, docs: jsonable(prep.lost.docs), programMeta: jsonable(prep.lost.programMeta),
      newActivity: jsonable(prep.lost.newActivity), deleted: prep.lost.deleted,
    });
  }
  const projRef = db.doc(`${PROJECTS}/${pid}`);
  const recRef = db.doc(RECORD_PATH(pid));
  const writeId = `p2-rollback-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let deletes = [];
  try {
    if (hooks.beforeFlipBack) await hooks.beforeFlipBack();
    await db.runTransaction(async (tx) => {
      const s = await readRollbackState(db, pid, tx);
      const cur = decideRollback({ pid, ...s, force, deleteDocs });
      if (cur.blocked.length || cur.hash !== prep.hash) {
        throw fail('PLAN_CHANGED', 'Rollback refused: the project, its record or its v2 data changed after the preview / lost-data report. Nothing was written; re-run the preview.');
      }
      const fields = Object.fromEntries(cur.restore.map((r) => [r.field, r.present ? r.old : FieldValue.delete()]));
      // Bump rev / writeId like a v1 save: stale v1 tabs then hit the conflict banner.
      const rev = (typeof s.doc.rev === 'number' ? s.doc.rev : 0) + 1;
      tx.update(projRef, { ...fields, rev, writeId });
      tx.update(recRef, {
        status: 'rolled-back',
        history: [...(Array.isArray(s.record.history) ? s.record.history : []), { status: 'rolled-back', at: stepTime(), forced: Boolean(cur.lost), deleteDocs }],
      });
      deletes = cur.deletes;
    });
  } catch (e) {
    // The transaction did not commit: nothing was rolled back, so a lost-data file
    // written above describes a rollback that did not happen.
    if (prep.lost && e && typeof e === 'object') e.lostReportVoid = true;
    throw e;
  }

  // Deletes only on request, each guarded by the update time read in the transaction.
  let deleted = 0;
  for (let i = 0; i < deletes.length; i += BATCH_OPS) {
    const chunk = deletes.slice(i, i + BATCH_OPS);
    const batch = db.batch();
    for (const d of chunk) batch.delete(db.doc(d.path), d.updateTime ? { lastUpdateTime: d.updateTime } : undefined);
    try {
      await batch.commit();
      deleted += chunk.length;
    } catch (e) {
      if (hooks.onDeleteError) hooks.onDeleteError(e);
    }
  }
  const after = await readRollbackState(db, pid);
  const leftover = [...SUBCOLS.flatMap((k) => after.docs[k]), ...after.activity].map((d) => d.path);
  return { edits: prep.edits, flippedBack: true, deleted, leftover, lostReport: Boolean(prep.lost) };
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const o = {
    pos: [], apply: false, key: 'service-account.json', assignments: null, noAssignments: false, expect: null,
    rollback: null, force: false, deleteDocs: false, error: null,
  };
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
    else if (a === '--expect') o.expect = value();
    else if (a === '--rollback') o.rollback = value();
    else if (a === '--force-with-report') o.force = true;
    else if (a === '--delete-v2-docs') o.deleteDocs = true;
    else if (a.startsWith('--')) o.error = o.error || `Unknown argument: ${a}`;
    else o.pos.push(a);
  }
  if (o.error) return o;
  if (o.rollback != null) {
    // Ruling P4-7 / P4-16: --rollback <pid> [--force-with-report] [--delete-v2-docs] [--apply --expect <hash>].
    if (o.pos.length) o.error = `--rollback takes exactly one project id; unexpected: ${o.pos.join(' ')}`;
    else if (o.rollback.includes('/')) o.error = 'Invalid project id (no "/" allowed)';
    else if (o.assignments || o.noAssignments) o.error = '--assignments / --no-assignments do not apply to --rollback';
    else if (o.apply && !o.expect) o.error = '--apply needs --expect <rollback plan hash> from the approved rollback preview (Ruling P4-16)';
    else if (o.expect && !/^[0-9a-f]{16}$/.test(o.expect)) o.error = `--expect must be the 16-hex rollback plan hash, got "${o.expect}"`;
    return o;
  }
  if (o.force || o.deleteDocs) o.error = '--force-with-report / --delete-v2-docs are allowed only with --rollback';
  if (!o.error && (o.pos.length !== 1 || o.pos[0].includes('/'))) o.error = 'Exactly one project id (no "/") is required';
  if (!o.error && o.assignments && o.noAssignments) o.error = 'Use either --assignments or --no-assignments, not both';
  // Ruling P4-9: --apply needs an explicit assignments choice.
  if (!o.error && o.apply && !o.assignments && !o.noAssignments) o.error = '--apply needs --assignments <xlsx> or --no-assignments (Ruling P4-9)';
  // Ruling P4-16: --apply needs the plan hash printed by the approved preview
  // ('post-flip' for a top-up run after the switch).
  if (!o.error && o.apply && !o.expect) o.error = '--apply needs --expect <plan hash> from the approved preview (Ruling P4-16)';
  if (!o.error && o.expect && !/^([0-9a-f]{16}|post-flip)$/.test(o.expect)) o.error = `--expect must be a 16-hex plan hash or "post-flip", got "${o.expect}"`;
  return o;
}

const USAGE = [
  'Usage: node scripts/p2-migrate.mjs <pid> [--assignments x.xlsx | --no-assignments] [--apply --expect <plan hash>] [--key service-account.json]',
  '       node scripts/p2-migrate.mjs --rollback <pid> [--force-with-report] [--delete-v2-docs] [--apply --expect <rollback hash>] [--key service-account.json]',
].join('\n');

async function rollbackMain(o) {
  const pid = o.rollback;
  // Key check first: nothing below touches Firestore without it.
  const { db, FieldValue, Timestamp } = await openDb(o.key);
  const prep = await prepareRollback(db, { pid, force: o.force, deleteDocs: o.deleteDocs });
  for (const l of formatRollbackPreview(prep, { pid })) console.log(l);
  if (prep.blocked.length) { console.error('Rollback refused (see above). Nothing was written.'); process.exit(1); }
  if (!o.apply) {
    console.log('Dry run: Firestore untouched. Re-run with the same flags plus --apply --expect <hash> to roll back.');
    process.exit(prep.refused ? 3 : 0);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const lostPath = `p2-rollback-lost-${pid}-${stamp}.json`;
  let lostWritten = false;
  let r;
  try {
    r = await rollbackMigration(db, {
      pid, force: o.force, deleteDocs: o.deleteDocs, FieldValue, Timestamp, expectHash: o.expect,
      writeLostReport: (obj) => {
        fs.writeFileSync(lostPath, JSON.stringify(obj, null, 2));
        lostWritten = true;
        console.log(`Lost data:   written to ${lostPath}`);
      },
    });
  } catch (e) {
    console.error(`${e.code ? `[${e.code}] ` : ''}${e.message || e}`);
    if (e.edits) for (const l of editLines(e.edits)) console.error(l);
    if (lostWritten && e.lostReportVoid) {
      console.error(`Lost data:   ${lostPath} is VOID: nothing was rolled back (the project is still v2). Re-run the preview; a new file is written on the next forced rollback.`);
    }
    process.exit(rollbackExitCode(e));
  }
  console.log(`Rolled back: project fields restored from the record's before-image; record 'rolled-back'.`);
  console.log(`Deleted:     ${r.deleted} v2 doc(s); left in place ${r.leftover.length}`);
  for (const p of r.leftover.slice(0, 20)) console.log(`  left ${p}`);
  if (r.leftover.length > 20) console.log(`  ... ${r.leftover.length - 20} more`);
  process.exit(0);
}

export async function openDb(keyPath) {
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

export function nameLookup(members) {
  const byUid = new Map(members.map((m) => [m.id, m.data || {}]));
  return (uid) => {
    const m = byUid.get(uid);
    return m ? `${m.displayName || '?'} <${m.email || '?'}> (${uid})` : `${uid} (not in members)`;
  };
}

export function writePreviewXlsx(path, sheets) {
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
  if (o.rollback != null) return rollbackMain(o);
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
  const assignmentsGiven = Boolean(o.assignments);
  for (const l of formatMigrationPreview(prep, { pid, nameOfUid, assignmentsGiven })) console.log(l);
  const xlsxPath = `p2-migrate-preview-${pid}.xlsx`;
  writePreviewXlsx(xlsxPath, previewSheets(prep, { pid, nameOfUid, assignmentsGiven }));
  console.log(`Preview:     ${xlsxPath}`);
  if (prep.mode === 'post-flip') {
    printVerify(await verifyMigration(db, pid));
    printEdits(await detectEdits(db, pid, prep.record));
  }
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
      pid, assignments: prep.mode === 'post-flip' ? null : assignments, now, Timestamp, FieldValue, expectHash: o.expect,
      writeManifest: (m) => fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2)),
    });
  } catch (e) {
    console.error(`${e.code ? `[${e.code}] ` : ''}${e.message || e}`);
    process.exit(1);
  }
  console.log(`Applied (${r.mode}): ${r.written} sub-docs written, ${r.deleted} stale deleted, ${r.activityCopied} activity copied (clamped ${r.activityClamped}).`);
  if (r.mode === 'fresh') console.log(`Manifest:    ${manifestPath}`);
  printVerify(r.verify);
  if (r.edits) printEdits(r.edits);
  const code = exitCodeFor(r);
  if (!r.verify.ok && code === 0) console.log('Verify differences: drift from v2 edits (expected).');
  if (code === 2) {
    console.error('Verification mismatch: the record stays "switched". No automatic rollback (Ruling P4-14): fix forward or run --rollback.');
  }
  process.exit(code);
}

function printEdits(e) {
  for (const l of editLines(e)) console.log(l);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e.message || e); process.exit(1); });
