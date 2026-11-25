// G1 (spec docs/superpowers/specs/2026-11-25-credit-by-year-design.md): give a close date
// (approvedAt) to Completed / Dropped tasks closed before P3.1, so credit and on-time / late
// can be counted by year. Date from the project's Activity (newest "…" → Completed / Dropped
// line naming the task), else end of the planned end day (Vietnam). Writes approvedAt +
// approvedAtSource ('activity' | 'end-date'), version + 1, updatedBy. Never touches a task that
// already has approvedAt. One project per run, ONE Admin transaction that re-reads every
// touched task (STATE_CHANGED otherwise).
//
// Usage:
//   node scripts/p2-backfill-closed-at.mjs --summary [--key service-account.json]       (read-only, every v2 project)
//   node scripts/p2-backfill-closed-at.mjs <pid> [--key ...]                             (preview; prints the plan hash)
//   node scripts/p2-backfill-closed-at.mjs <pid> --apply --expect <plan hash> [--key ...]
//   node scripts/p2-backfill-closed-at.mjs --rollback <manifest.json> [--apply --expect <hash>] [--key ...]
// Exit codes: 0 ok / noop; 1 usage / blocked / PLAN_CHANGED / STATE_CHANGED; 2 verify mismatch.
// Output (gitignored): p2-backfill-closed-at-manifest-<pid>-<stamp>.json.

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { stableJson } from './lib/migrate-normalise.mjs';
import { projectBlock } from './lib/backfill-plan.mjs';
import {
  CLOSEDAT_KIND, CLOSEDAT_STAMP, planClosedAt, formatClosedAtPreview, verifyClosedAt, decideClosedAtRollback, taskFingerprint,
} from './lib/closedat-plan.mjs';
import { docsOf, openDb } from './p2-migrate.mjs';

const WID = 'main';
const PROJECTS = `workspaces/${WID}/projects`;
const arr = (v) => (Array.isArray(v) ? v : []);
const fail = (code, message) => Object.assign(new Error(message), { code });
const strip = (list) => list.map(({ id, data }) => ({ id, data }));

export async function readClosedAtState(db, pid) {
  const snap = await db.doc(`${PROJECTS}/${pid}`).get();
  const base = `${PROJECTS}/${pid}`;
  return {
    doc: snap.exists ? snap.data() : null,
    tasks: strip(await docsOf(db, `${base}/tasks`)),
    activity: strip(await docsOf(db, `${base}/activity`)),
  };
}

export async function closedAtSummary(db) {
  const rows = [];
  for (const p of await docsOf(db, PROJECTS)) {
    if (p.data?.schemaVersion !== 2 || p.data?.deletedAt) continue;
    const plan = planClosedAt({ pid: p.id, state: await readClosedAtState(db, p.id) });
    rows.push({ pid: p.id, name: p.data?.name ?? '', toWrite: plan.changes.length, ...plan.counts, blocked: plan.blocked.map((b) => b.code).join(',') });
  }
  return rows;
}

async function txTasks(tx, db, pid, ids) {
  const projRef = db.doc(`${PROJECTS}/${pid}`);
  const snaps = await tx.getAll(projRef, ...ids.map((id) => db.doc(`${PROJECTS}/${pid}/tasks/${id}`)));
  const tasks = [];
  ids.forEach((id, i) => { if (snaps[i + 1].exists) tasks.push({ id, data: snaps[i + 1].data() }); });
  return { doc: snaps[0].exists ? snaps[0].data() : null, tasks };
}

function activityDoc(db, pid, { type, description, FieldValue }) {
  const id = `${type}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  return {
    ref: db.doc(`${PROJECTS}/${pid}/activity/${id}`),
    data: { id, type, description, author: CLOSEDAT_STAMP, authorUid: null, createdAt: FieldValue.serverTimestamp(), timestamp: new Date().toISOString(), projectId: pid, workspaceId: WID },
  };
}

// Throws BLOCKED / PLAN_CHANGED / STATE_CHANGED (nothing written). Returns { noop, prep, verify, activityId }.
export async function applyClosedAt(db, { pid, expectHash, FieldValue, writeManifest, hooks = {} }) {
  const prep = planClosedAt({ pid, state: await readClosedAtState(db, pid) });
  if (prep.blocked.length) throw fail('BLOCKED', `Blocked: ${prep.blocked.map((b) => `${b.code} (${b.detail})`).join('; ')}. Nothing was written.`);
  if (prep.noop) return { noop: true, prep, verify: { ok: true, mismatches: [] }, activityId: null };
  if (expectHash !== undefined && expectHash !== prep.planHash) throw fail('PLAN_CHANGED', `Plan changed since the approved preview (expected ${expectHash}, now ${prep.planHash}). Re-run the preview. Nothing was written.`);
  writeManifest({ kind: CLOSEDAT_KIND, pid, planHash: prep.planHash, createdAt: new Date().toISOString(), changes: prep.changes, note: 'Rollback removes approvedAt / approvedAtSource where they still hold these values.' });
  if (hooks.beforeCommit) await hooks.beforeCommit();
  const ids = prep.changes.map((c) => c.id);
  const act = activityDoc(db, pid, { type: 'closed_dates_backfilled', description: `Close dates filled by ${CLOSEDAT_STAMP}: ${prep.counts.activity} from Activity, ${prep.counts.endDate} from end dates`, FieldValue });
  await db.runTransaction(async (tx) => {
    const s = await txTasks(tx, db, pid, ids);
    const b = projectBlock(s.doc, pid);
    if (b || !isDeepStrictEqual(stableJson(taskFingerprint(s.tasks, ids)), stableJson(prep.fingerprint))) {
      throw fail('STATE_CHANGED', `A task changed since the preview${b ? ` (${b.code})` : ''}. Nothing was written; re-run the preview.`);
    }
    for (const c of prep.changes) {
      tx.update(db.doc(`${PROJECTS}/${pid}/tasks/${c.id}`), {
        approvedAt: c.approvedAt, approvedAtSource: c.source, version: c.version + 1, updatedBy: CLOSEDAT_STAMP, updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.create(act.ref, act.data);
  });
  const after = await readClosedAtState(db, pid);
  return { noop: false, prep, verify: verifyClosedAt(prep, after.tasks), activityId: act.data.id };
}

export async function prepareClosedAtRollback(db, { manifest }) {
  const pid = manifest?.pid;
  const state = typeof pid === 'string' && pid && !pid.includes('/') ? await readClosedAtState(db, pid) : { doc: null, tasks: [] };
  return decideClosedAtRollback({ manifest, state });
}

export async function rollbackClosedAt(db, { manifest, expectHash, FieldValue }) {
  const prep = await prepareClosedAtRollback(db, { manifest });
  if (prep.blocked.length) throw fail('BLOCKED', `Rollback blocked: ${prep.blocked.map((b) => `${b.code} (${b.detail})`).join('; ')}. Nothing was written.`);
  if (prep.noop) return { noop: true, prep, verify: { ok: true, mismatches: [] } };
  if (expectHash !== undefined && expectHash !== prep.hash) throw fail('PLAN_CHANGED', `Rollback plan changed since the approved preview (expected ${expectHash}, now ${prep.hash}). Nothing was written.`);
  const { pid } = manifest;
  const ids = arr(manifest.changes).map((c) => c.id);
  const act = activityDoc(db, pid, { type: 'closed_dates_rolled_back', description: `Close dates removed by ${CLOSEDAT_STAMP} rollback (manifest ${manifest.planHash ?? '?'})`, FieldValue });
  await db.runTransaction(async (tx) => {
    const s = await txTasks(tx, db, pid, ids);
    const cur = decideClosedAtRollback({ manifest, state: s });
    if (cur.blocked.length || cur.hash !== prep.hash) throw fail('STATE_CHANGED', 'A task changed since the rollback preview. Nothing was written; re-run the preview.');
    for (const r of cur.restores) {
      tx.update(db.doc(`${PROJECTS}/${pid}/tasks/${r.id}`), {
        approvedAt: FieldValue.delete(), approvedAtSource: FieldValue.delete(), version: r.version + 1, updatedBy: `${CLOSEDAT_STAMP}-rollback`, updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.create(act.ref, act.data);
  });
  const after = await readClosedAtState(db, pid);
  const byId = new Map(after.tasks.map((t) => [t.id, t.data]));
  const m = prep.restores.filter((r) => byId.get(r.id)?.approvedAt != null).map((r) => `${r.id} still has approvedAt`);
  return { noop: false, prep, verify: { ok: !m.length, mismatches: m } };
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const o = { pid: null, pos: [], apply: false, summary: false, key: 'service-account.json', expect: null, rollback: null, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => { const v = argv[++i]; if (v === undefined || v === '' || v.startsWith('--')) o.error = o.error || `${a} needs a value`; return v; };
    if (a === '--apply') o.apply = true;
    else if (a === '--summary') o.summary = true;
    else if (a === '--key') o.key = value();
    else if (a === '--expect') o.expect = value();
    else if (a === '--rollback') o.rollback = value();
    else if (a.startsWith('--')) o.error = o.error || `Unknown argument: ${a}`;
    else o.pos.push(a);
  }
  if (o.error) return o;
  const hashOk = () => {
    if (o.apply && !o.expect) o.error = '--apply needs --expect <plan hash> from the approved preview';
    else if (o.expect && !/^[0-9a-f]{16}$/.test(o.expect)) o.error = `--expect must be the 16-hex plan hash, got "${o.expect}"`;
    else if (o.expect && !o.apply) o.error = '--expect is used with --apply';
  };
  if (o.summary) { if (o.pos.length || o.apply || o.expect || o.rollback != null) o.error = '--summary is read-only: use it alone (plus --key)'; return o; }
  if (o.rollback != null) { if (o.pos.length) o.error = '--rollback takes only a manifest path (plus --apply --expect / --key)'; else hashOk(); return o; }
  if (o.pos.length !== 1 || o.pos[0].includes('/')) { o.error = 'Exactly one project id (no "/") is required (or --summary)'; return o; }
  [o.pid] = o.pos;
  hashOk();
  return o;
}

const USAGE = [
  'Usage: node scripts/p2-backfill-closed-at.mjs --summary [--key service-account.json]',
  '       node scripts/p2-backfill-closed-at.mjs <pid> [--apply --expect <plan hash>] [--key service-account.json]',
  '       node scripts/p2-backfill-closed-at.mjs --rollback <manifest.json> [--apply --expect <rollback hash>] [--key service-account.json]',
].join('\n');
const errOut = (e) => console.error(`${e.code ? `[${e.code}] ` : ''}${e.message || e}`);

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.error) { console.error(o.error); console.error(USAGE); process.exit(1); }
  if (o.rollback != null) {
    if (!fs.existsSync(o.rollback)) { console.error(`Manifest not found: ${o.rollback}`); process.exit(1); }
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(o.rollback, 'utf8')); } catch { console.error('Invalid manifest JSON'); process.exit(1); }
    const { db, FieldValue } = await openDb(o.key);
    const prep = await prepareClosedAtRollback(db, { manifest });
    console.log(`Rollback:    ${prep.pid}`);
    if (prep.blocked.length) { for (const b of prep.blocked) console.log(`BLOCKING: ${b.code}: ${b.detail}`); process.exit(1); }
    console.log(`Remove the close date from ${prep.restores.length} task(s)`);
    for (const s of prep.skipped) console.log(`  SKIP ${s.id}: ${s.why}`);
    if (prep.noop) { console.log('Nothing to roll back.'); process.exit(0); }
    console.log(`Plan hash:   ${prep.hash}  (apply with --rollback <manifest> --apply --expect ${prep.hash})`);
    if (!o.apply) { console.log('Dry run: Firestore untouched.'); process.exit(0); }
    let r;
    try { r = await rollbackClosedAt(db, { manifest, expectHash: o.expect, FieldValue }); } catch (e) { errOut(e); process.exit(1); }
    console.log(`Rolled back. Verify: ${r.verify.ok ? 'OK' : 'MISMATCH'}`);
    process.exit(r.verify.ok ? 0 : 2);
  }
  const { db, FieldValue } = await openDb(o.key);
  if (o.summary) {
    const rows = await closedAtSummary(db);
    console.log('pid | name | to write | from activity | activity, shared name | from end date | unknown | blocked');
    for (const r of rows) console.log(`${r.pid} | ${r.name} | ${r.toWrite} | ${r.activity} | ${r.sharedName} | ${r.endDate} | ${r.unknown} | ${r.blocked}`);
    console.log('Read-only: Firestore untouched.');
    process.exit(0);
  }
  const { pid } = o;
  const prep = planClosedAt({ pid, state: await readClosedAtState(db, pid) });
  for (const l of formatClosedAtPreview(prep)) console.log(l);
  if (!o.apply) { console.log('Dry run: Firestore untouched.'); process.exit(prep.blocked.length ? 1 : 0); }
  if (prep.blocked.length) { console.error('Refusing to apply (see above). Nothing was written.'); process.exit(1); }
  if (prep.noop) { console.log('Noop: nothing written.'); process.exit(0); }
  const manifestPath = `p2-backfill-closed-at-manifest-${pid}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  let r;
  try {
    r = await applyClosedAt(db, { pid, expectHash: o.expect, FieldValue, writeManifest: (m) => fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2)) });
  } catch (e) {
    errOut(e);
    if (fs.existsSync(manifestPath)) {
      if (e.code === 'STATE_CHANGED') { fs.unlinkSync(manifestPath); console.error(`Manifest ${manifestPath} removed: the transaction did not commit.`); }
      else console.error(`Commit status unknown; manifest kept: ${manifestPath}. Re-run the preview: if it is a noop the apply landed.`);
    }
    process.exit(1);
  }
  if (r.noop) { console.log('Noop: nothing written.'); process.exit(0); }
  console.log(`Applied:     ${r.prep.changes.length} task(s); activity ${r.activityId}`);
  console.log(`Manifest:    ${manifestPath} (rollback: --rollback ${manifestPath})`);
  console.log(`Verify:      ${r.verify.ok ? 'OK' : 'MISMATCH'}`);
  for (const l of r.verify.mismatches) console.log(`  ${l}`);
  process.exit(r.verify.ok ? 0 : 2);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e.message || e); process.exit(1); });
