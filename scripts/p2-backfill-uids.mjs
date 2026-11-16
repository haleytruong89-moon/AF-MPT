// W3-B2 (B-1, M1): link uids on a v2 project's tasks / actions whose PIC or contributor
// was stored by name only (invited before their first sign-in). Planner:
// scripts/lib/backfill-plan.mjs. Never overwrites a stored picUid (a mismatch is listed),
// only appends to contributorUids, includes closed items, and grants project read access
// to the people it links (Ruling G; never revoked). One project per run, ONE Admin
// transaction that re-reads the project and every touched doc (STATE_CHANGED otherwise).
//
// Usage:
//   node scripts/p2-backfill-uids.mjs --summary [--key service-account.json]                 (read-only, every v2 project)
//   node scripts/p2-backfill-uids.mjs <pid> [--key ...]                                       (preview, read-only; prints the plan hash)
//   node scripts/p2-backfill-uids.mjs <pid> --apply --expect <plan hash> [--key ...]
//   node scripts/p2-backfill-uids.mjs --rollback <manifest.json> [--apply --expect <hash>] [--key ...]
// Exit codes: 0 ok / noop; 1 usage / blocked / PLAN_CHANGED / STATE_CHANGED; 2 verify mismatch.
// Outputs (gitignored, contain people names): p2-backfill-uids-preview-<pid>.xlsx,
// p2-backfill-uids-manifest-<pid>-<stamp>.json.

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { stableJson } from './lib/migrate-normalise.mjs';
import {
  BACKFILL_KIND, BACKFILL_STAMP, planBackfill, projectBlock, backfillFingerprint, formatBackfillPreview,
  verifyBackfill, decideBackfillRollback, formatBackfillRollback, summaryCounts,
} from './lib/backfill-plan.mjs';
import { docsOf, readDirectory, openDb, nameLookup, writePreviewXlsx } from './p2-migrate.mjs';

const WID = 'main';
const PROJECTS = `workspaces/${WID}/projects`;
const arr = (v) => (Array.isArray(v) ? v : []);
const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const strip = (list) => list.map(({ id, data }) => ({ id, data }));

export async function readBackfillState(db, pid) {
  const snap = await db.doc(`${PROJECTS}/${pid}`).get();
  const base = `${PROJECTS}/${pid}`;
  return { doc: snap.exists ? snap.data() : null, tasks: strip(await docsOf(db, `${base}/tasks`)), actions: strip(await docsOf(db, `${base}/actions`)) };
}

export async function prepareBackfill(db, { pid }) {
  const state = await readBackfillState(db, pid);
  const dir = await readDirectory(db);
  return { ...planBackfill({ pid, state, directory: dir, members: dir.members }), dir };
}

// Read-only: one row per v2 project (not deleted).
export async function backfillSummary(db) {
  const dir = await readDirectory(db);
  const rows = [];
  for (const p of await docsOf(db, PROJECTS)) {
    if (p.data?.schemaVersion !== 2 || p.data?.deletedAt) continue;
    const state = await readBackfillState(db, p.id);
    rows.push({ pid: p.id, name: p.data?.name ?? '', ...summaryCounts(planBackfill({ pid: p.id, state, directory: dir, members: dir.members })) });
  }
  return rows;
}

// Re-read the project and the given docs inside the transaction.
async function txState(tx, db, pid, docs) {
  const projRef = db.doc(`${PROJECTS}/${pid}`);
  const refs = docs.map((d) => db.doc(`${PROJECTS}/${pid}/${d.kind}/${d.id}`));
  const snaps = await tx.getAll(projRef, ...refs);
  const state = { doc: snaps[0].exists ? snaps[0].data() : null, tasks: [], actions: [] };
  docs.forEach((d, i) => { const s = snaps[i + 1]; if (s.exists) state[d.kind].push({ id: d.id, data: s.data() }); });
  return state;
}

function activityDoc(db, pid, { type, description, FieldValue }) {
  const id = `${type}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  return {
    ref: db.doc(`${PROJECTS}/${pid}/activity/${id}`),
    data: { id, type, description, author: BACKFILL_STAMP, authorUid: null, createdAt: FieldValue.serverTimestamp(), timestamp: new Date().toISOString(), projectId: pid, workspaceId: WID },
  };
}

// Throws BLOCKED / PLAN_CHANGED / STATE_CHANGED (nothing written). Returns { noop, prep, verify, activityId }.
export async function applyBackfill(db, { pid, expectHash, FieldValue, writeManifest, hooks = {} }) {
  const prep = await prepareBackfill(db, { pid });
  if (prep.blocked.length) throw fail('BLOCKED', `Blocked: ${prep.blocked.map((b) => `${b.code} (${b.detail})`).join('; ')}. Nothing was written.`);
  if (prep.noop) return { noop: true, prep, verify: { ok: true, mismatches: [] }, activityId: null };
  if (expectHash !== undefined && expectHash !== prep.planHash) {
    throw fail('PLAN_CHANGED', `Plan changed since the approved preview (expected ${expectHash}, now ${prep.planHash}). Re-run the preview. Nothing was written.`, { planHash: prep.planHash });
  }
  writeManifest({
    kind: BACKFILL_KIND, pid, planHash: prep.planHash, createdAt: new Date().toISOString(),
    fingerprint: prep.fingerprint, changes: prep.changes, grants: prep.grants,
    note: 'Rollback restores the before-values; it never removes member grants.',
  });
  if (hooks.beforeCommit) await hooks.beforeCommit();
  const docs = prep.changes.map((c) => ({ kind: c.kind, id: c.id }));
  const act = activityDoc(db, pid, { type: 'uids_backfilled', description: `People linked by ${BACKFILL_STAMP}: ${prep.changes.length} item(s)`, FieldValue });
  await db.runTransaction(async (tx) => {
    const s = await txState(tx, db, pid, docs);
    const b = projectBlock(s.doc, pid);
    if (b || !isDeepStrictEqual(stableJson(backfillFingerprint(s.doc, s, docs)), stableJson(prep.fingerprint))) {
      throw fail('STATE_CHANGED', `The project or one of its items changed since the preview${b ? ` (${b.code})` : ''}. Nothing was written; re-run the preview.`);
    }
    for (const c of prep.changes) {
      tx.update(db.doc(`${PROJECTS}/${pid}/${c.kind}/${c.id}`), {
        ...Object.fromEntries(c.fields.map((f) => [f.key, f.after])),
        version: c.version + 1, updatedBy: BACKFILL_STAMP, updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (prep.grants.union.length) {
      tx.update(db.doc(`${PROJECTS}/${pid}`), {
        memberUids: FieldValue.arrayUnion(...prep.grants.union), memberIds: FieldValue.arrayUnion(...prep.grants.union), updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.create(act.ref, act.data);
  });
  return { noop: false, prep, verify: verifyBackfill(prep, await readBackfillState(db, pid)), activityId: act.data.id };
}

export async function prepareBackfillRollback(db, { manifest }) {
  const pid = manifest?.pid;
  const state = typeof pid === 'string' && pid && !pid.includes('/') ? await readBackfillState(db, pid) : { doc: null, tasks: [], actions: [] };
  return decideBackfillRollback({ manifest, state });
}

// Throws BLOCKED / PLAN_CHANGED / STATE_CHANGED with nothing written. Returns { noop, verify }.
export async function rollbackBackfill(db, { manifest, expectHash, FieldValue }) {
  const prep = await prepareBackfillRollback(db, { manifest });
  if (prep.blocked.length) throw fail('BLOCKED', `Rollback blocked: ${prep.blocked.map((b) => `${b.code} (${b.detail})`).join('; ')}. Nothing was written.`);
  if (prep.noop) return { noop: true, prep, verify: { ok: true, mismatches: [] } };
  if (expectHash !== undefined && expectHash !== prep.hash) {
    throw fail('PLAN_CHANGED', `Rollback plan changed since the approved preview (expected ${expectHash}, now ${prep.hash}). Re-run the preview. Nothing was written.`);
  }
  const { pid } = manifest;
  const docs = arr(manifest.changes).map((c) => ({ kind: c.kind, id: c.id }));
  const act = activityDoc(db, pid, { type: 'uids_backfill_rolled_back', description: `Linked people rolled back by ${BACKFILL_STAMP} (manifest ${manifest.planHash ?? '?'})`, FieldValue });
  await db.runTransaction(async (tx) => {
    const s = await txState(tx, db, pid, docs);
    const cur = decideBackfillRollback({ manifest, state: s });
    if (cur.blocked.length || cur.hash !== prep.hash) throw fail('STATE_CHANGED', 'An item changed since the rollback preview. Nothing was written; re-run the preview.');
    for (const c of cur.restores) {
      tx.update(db.doc(`${PROJECTS}/${pid}/${c.kind}/${c.id}`), {
        ...Object.fromEntries(c.fields.map((f) => [f.key, f.had ? f.before : FieldValue.delete()])),
        version: c.version + 1, updatedBy: `${BACKFILL_STAMP}-rollback`, updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.create(act.ref, act.data);
  });
  const after = await readBackfillState(db, pid);
  const byKey = new Map(['tasks', 'actions'].flatMap((k) => after[k].map((d) => [`${k}/${d.id}`, d.data])));
  const m = [];
  for (const c of prep.restores) {
    const d = byKey.get(`${c.kind}/${c.id}`);
    for (const f of c.fields) if (hasOwn(d, f.key) !== f.had || (f.had && !isDeepStrictEqual(d[f.key], f.before))) m.push(`${c.kind}/${c.id} ${f.key}`);
  }
  return { noop: false, prep, verify: { ok: !m.length, mismatches: m } };
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const o = { pid: null, pos: [], apply: false, summary: false, key: 'service-account.json', expect: null, rollback: null, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v === '' || v.startsWith('--')) o.error = o.error || `${a} needs a value`;
      return v;
    };
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
  if (o.summary) {
    if (o.pos.length || o.apply || o.expect || o.rollback != null) o.error = '--summary is read-only: use it alone (plus --key)';
    return o;
  }
  if (o.rollback != null) {
    if (o.pos.length) o.error = '--rollback takes only a manifest path (plus --apply --expect / --key)';
    else hashOk();
    return o;
  }
  if (o.pos.length !== 1 || o.pos[0].includes('/')) { o.error = 'Exactly one project id (no "/") is required (or --summary)'; return o; }
  [o.pid] = o.pos;
  hashOk();
  return o;
}

const USAGE = [
  'Usage: node scripts/p2-backfill-uids.mjs --summary [--key service-account.json]',
  '       node scripts/p2-backfill-uids.mjs <pid> [--apply --expect <plan hash>] [--key service-account.json]',
  '       node scripts/p2-backfill-uids.mjs --rollback <manifest.json> [--apply --expect <rollback hash>] [--key service-account.json]',
].join('\n');

const errOut = (e) => console.error(`${e.code ? `[${e.code}] ` : ''}${e.message || e}`);

async function rollbackMain(o) {
  if (!fs.existsSync(o.rollback)) { console.error(`Manifest not found: ${o.rollback}`); process.exit(1); }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(o.rollback, 'utf8')); } catch { console.error('Invalid manifest JSON'); process.exit(1); }
  const { db, FieldValue } = await openDb(o.key);
  const prep = await prepareBackfillRollback(db, { manifest });
  for (const l of formatBackfillRollback(prep)) console.log(l);
  if (prep.blocked.length) process.exit(1);
  if (!o.apply || prep.noop) {
    if (!o.apply) console.log('Dry run: Firestore untouched. Re-run with --apply --expect <hash> to roll back.');
    process.exit(0);
  }
  let r;
  try { r = await rollbackBackfill(db, { manifest, expectHash: o.expect, FieldValue }); } catch (e) { errOut(e); process.exit(1); }
  console.log(`Rolled back. Verify: ${r.verify.ok ? 'OK' : 'MISMATCH'}`);
  for (const l of r.verify.mismatches) console.log(`  ${l}`);
  process.exit(r.verify.ok ? 0 : 2);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.error) { console.error(o.error); console.error(USAGE); process.exit(1); }
  if (o.rollback != null) return rollbackMain(o);
  const { db, FieldValue } = await openDb(o.key);
  if (o.summary) {
    const rows = await backfillSummary(db);
    console.log('pid | name | fixable | grants | mismatch | unresolved | inactive | blocked');
    for (const r of rows) console.log(`${r.pid} | ${r.name} | ${r.fixable} | ${r.grants} | ${r.mismatch} | ${r.unresolved} | ${r.inactive} | ${r.blocked}`);
    console.log('Read-only: Firestore untouched.');
    process.exit(0);
  }
  const { pid } = o;
  const prep = await prepareBackfill(db, { pid });
  const nameOfUid = nameLookup(prep.dir.members);
  const summary = formatBackfillPreview(prep, { nameOfUid });
  for (const l of summary) console.log(l);
  const xlsxPath = `p2-backfill-uids-preview-${pid}.xlsx`;
  writePreviewXlsx(xlsxPath, {
    Summary: summary.map((Line) => ({ Line })),
    Changes: prep.changes.flatMap((c) => c.fields.map((f) => ({ Kind: c.kind, Id: c.id, Name: c.name, Status: c.status ?? '', Field: f.key, Old: JSON.stringify(f.before), New: JSON.stringify(f.after) }))),
  });
  console.log(`Preview:     ${xlsxPath}`);
  if (!o.apply) { console.log('Dry run: Firestore untouched.'); process.exit(prep.blocked.length ? 1 : 0); }
  if (prep.blocked.length) { console.error('Refusing to apply (see above). Nothing was written.'); process.exit(1); }
  if (prep.noop) { console.log('Noop: nothing written.'); process.exit(0); }

  const manifestPath = `p2-backfill-uids-manifest-${pid}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  let r;
  try {
    r = await applyBackfill(db, { pid, expectHash: o.expect, FieldValue, writeManifest: (m) => fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2)) });
  } catch (e) {
    errOut(e);
    if (fs.existsSync(manifestPath)) {
      if (e.code === 'STATE_CHANGED') { fs.unlinkSync(manifestPath); console.error(`Manifest ${manifestPath} removed: the transaction did not commit.`); }
      else console.error(`Commit status unknown; manifest kept: ${manifestPath}. Re-run the preview: if it is a noop the apply landed (keep the manifest for --rollback).`);
    }
    process.exit(1);
  }
  if (r.noop) { console.log('Noop: nothing written.'); process.exit(0); }
  console.log(`Applied:     ${r.prep.changes.length} item(s); activity ${r.activityId}`);
  console.log(`Manifest:    ${manifestPath} (rollback: --rollback ${manifestPath})`);
  console.log(`Verify:      ${r.verify.ok ? 'OK' : 'MISMATCH'}`);
  for (const l of r.verify.mismatches) console.log(`  ${l}`);
  process.exit(r.verify.ok ? 0 : 2);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e.message || e); process.exit(1); });
