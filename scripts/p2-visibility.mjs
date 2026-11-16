// W3-B2 (B-5, D5): set one v2 project's visibility to 'department' (every active member
// reads and comments; rules W3-B1) or back to 'restricted' (project members + Owner).
// HOD names each project; no project is department by default (HOD 16/11).
// To 'restricted' is refused while an open task / action PIC or contributor is not a
// project member: they would lose their own work. No override flag.
// Writes `visibility` + `updatedAt` only (rev untouched: v2 meta saves skip visibility)
// and one activity event, in one Admin transaction that re-reads the project doc.
//
// Usage:
//   node scripts/p2-visibility.mjs <pid> --set department|restricted [--key service-account.json]    (preview)
//   node scripts/p2-visibility.mjs <pid> --set department|restricted --apply --expect <hash> [--key ...]
//   node scripts/p2-visibility.mjs --rollback <manifest.json> [--apply --expect <hash>] [--key ...]
// Exit codes: 0 ok / noop; 1 usage / blocked / PLAN_CHANGED / STATE_CHANGED; 2 verify mismatch.
// Output (gitignored): p2-visibility-manifest-<pid>-<stamp>.json.

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hash16, projectBlock } from './lib/backfill-plan.mjs';
import { docsOf, openDb, nameLookup } from './p2-migrate.mjs';

const WID = 'main';
const PROJECTS = `workspaces/${WID}/projects`;
export const VIS_KIND = 'p2-visibility';
export const VIS_STAMP = 'p2-visibility';
export const VISIBILITIES = ['restricted', 'department'];
const OPEN_TASK = new Set(['Planned', 'InProgress', 'Submitted']);
const CLOSED_ACTION = new Set(['Done', 'Cancelled', 'Dropped']);
const arr = (v) => (Array.isArray(v) ? v : []);
const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const strip = (list) => list.map(({ id, data }) => ({ id, data }));
export const LOCKOUT_MESSAGE = 'Add these people as project members first (Members), then re-run.';

const fingerprintOf = (doc) => ({ visibility: doc?.visibility ?? null, memberUids: doc?.memberUids ?? null });

/**
 * state = { doc, tasks, actions }; members = [{ id, data }] of workspaces/main/members.
 * -> { blocked, noop, from, to, gain, lose, lockout, fingerprint, planHash }
 */
export function prepareVisibility({ pid, state, members, to }) {
  const out = { pid, projectName: state?.doc?.name ?? null, blocked: [], noop: false, from: null, to, gain: [], lose: [], lockout: [], fingerprint: null, planHash: null };
  if (!VISIBILITIES.includes(to)) return { ...out, blocked: [{ code: 'bad-value', detail: `--set must be ${VISIBILITIES.join(' or ')}` }] };
  const doc = state?.doc;
  const b = projectBlock(doc, pid);
  if (b) return { ...out, blocked: [b] };
  const from = doc.visibility ?? 'restricted';
  const fingerprint = fingerprintOf(doc);
  if (from === to) return { ...out, from, noop: true, fingerprint };
  const inProject = new Set(arr(doc.memberUids));
  const outside = arr(members).filter((m) => m.data?.status === 'active' && !inProject.has(m.id)).map((m) => m.id).sort();
  const gain = to === 'department' ? outside : [];
  const lose = to === 'restricted' ? outside : [];
  const lockout = [];
  if (to === 'restricted') {
    const add = (uid, where) => { if (uid && !inProject.has(uid)) lockout.push({ uid, where }); };
    for (const t of arr(state.tasks)) {
      if (!OPEN_TASK.has(t.data?.status)) continue;
      add(t.data?.picUid, `task ${t.id} PIC`);
      for (const u of arr(t.data?.contributorUids)) add(u, `task ${t.id} contributor`);
    }
    for (const a of arr(state.actions)) {
      if (CLOSED_ACTION.has(a.data?.status)) continue;
      add(a.data?.picUid, `action ${a.id} PIC`);
    }
  }
  const base = { ...out, from, gain, lose, lockout, fingerprint };
  if (lockout.length) return { ...base, blocked: [{ code: 'lockout', detail: LOCKOUT_MESSAGE }] };
  return { ...base, planHash: hash16({ kind: VIS_KIND, pid, fingerprint, from, to, gain, lose }) };
}

export function formatVisibilityPreview(p, { nameOfUid = (u) => u } = {}) {
  const L = [`Project:     ${p.pid}${p.projectName ? ` (${p.projectName})` : ''}`];
  if (p.from) L.push(`Visibility:  ${p.from} -> ${p.to}`);
  if (p.lockout.length) L.push('Would lose access to their own open work:', ...p.lockout.map((l) => `  ${nameOfUid(l.uid)}: ${l.where}`));
  if (p.blocked.length) {
    L.push('BLOCKING:', ...p.blocked.map((b) => `  ${b.code}: ${b.detail}`), 'Nothing will be written.');
    return L;
  }
  if (p.noop) { L.push('Nothing to change: the project already has this visibility.'); return L; }
  if (p.to === 'department') L.push(`Gain read + comment (${p.gain.length} active member(s) outside the project):`, ...(p.gain.length ? p.gain.map((u) => `  + ${nameOfUid(u)}`) : ['  none']));
  else L.push(`Lose read + comment (${p.lose.length} active member(s) outside the project):`, ...(p.lose.length ? p.lose.map((u) => `  - ${nameOfUid(u)}`) : ['  none']));
  L.push(`Plan hash:   ${p.planHash}  (apply with --apply --expect ${p.planHash})`);
  return L;
}

// Rollback: back to the before-value while the field still holds the applied one.
export function decideVisibilityRollback({ manifest, state }) {
  const out = { pid: manifest?.pid ?? null, blocked: [], noop: false, from: null, to: null, skipped: null, hash: null };
  if (!manifest || manifest.kind !== VIS_KIND || typeof manifest.pid !== 'string' || !VISIBILITIES.includes(manifest.before) || !VISIBILITIES.includes(manifest.after)) {
    return { ...out, blocked: [{ code: 'bad-manifest', detail: `not a ${VIS_KIND} manifest` }] };
  }
  const b = projectBlock(state?.doc, manifest.pid);
  if (b) return { ...out, blocked: [b] };
  const now = state.doc.visibility ?? 'restricted';
  if (now !== manifest.after) return { ...out, noop: true, skipped: `visibility is now ${now}, not ${manifest.after}: changed since the apply` };
  // Going back to restricted must not lock anyone out either.
  const back = prepareVisibility({ pid: manifest.pid, state, members: state.members, to: manifest.before });
  if (back.blocked.length) return { ...out, from: now, to: manifest.before, blocked: back.blocked, lockout: back.lockout };
  return { ...out, from: now, to: manifest.before, hash: hash16({ kind: `${VIS_KIND}-rollback`, pid: manifest.pid, manifestHash: manifest.planHash ?? null, fingerprint: fingerprintOf(state.doc), to: manifest.before }) };
}

// ---------------------------------------------------------------- I/O

export async function readVisibilityState(db, pid) {
  const snap = await db.doc(`${PROJECTS}/${pid}`).get();
  const base = `${PROJECTS}/${pid}`;
  return {
    doc: snap.exists ? snap.data() : null,
    tasks: strip(await docsOf(db, `${base}/tasks`)),
    actions: strip(await docsOf(db, `${base}/actions`)),
    members: strip(await docsOf(db, `workspaces/${WID}/members`)),
  };
}

function activityDoc(db, pid, { before, after, FieldValue, rollback = false }) {
  const type = 'visibility_changed';
  const id = `${type}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  return {
    ref: db.doc(`${PROJECTS}/${pid}/activity/${id}`),
    data: {
      id, type, description: `Visibility ${before} -> ${after} by ${VIS_STAMP}${rollback ? ' (rollback)' : ''}`,
      before: { visibility: before }, after: { visibility: after },
      author: VIS_STAMP, authorUid: null, createdAt: FieldValue.serverTimestamp(), timestamp: new Date().toISOString(), projectId: pid, workspaceId: WID,
    },
  };
}

async function commit(db, { pid, fingerprint, before, after, FieldValue, rollback }) {
  const ref = db.doc(`${PROJECTS}/${pid}`);
  const act = activityDoc(db, pid, { before, after, FieldValue, rollback });
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const doc = s.exists ? s.data() : null;
    const b = projectBlock(doc, pid);
    if (b || JSON.stringify(fingerprintOf(doc)) !== JSON.stringify(fingerprint)) {
      throw fail('STATE_CHANGED', `The project's visibility or members changed since the preview${b ? ` (${b.code})` : ''}. Nothing was written; re-run the preview.`);
    }
    tx.update(ref, { visibility: after, updatedAt: FieldValue.serverTimestamp() });
    tx.create(act.ref, act.data);
  });
  const now = (await ref.get()).data();
  return { activityId: act.data.id, verify: now?.visibility === after ? { ok: true, mismatches: [] } : { ok: false, mismatches: [`visibility is ${now?.visibility}`] } };
}

// Throws BLOCKED / PLAN_CHANGED / STATE_CHANGED (nothing written).
export async function applyVisibility(db, { pid, to, expectHash, FieldValue, writeManifest, hooks = {} }) {
  const state = await readVisibilityState(db, pid);
  const prep = prepareVisibility({ pid, state, members: state.members, to });
  if (prep.blocked.length) throw fail('BLOCKED', `Blocked: ${prep.blocked.map((b) => `${b.code} (${b.detail})`).join('; ')}. Nothing was written.`, { prep });
  if (prep.noop) return { noop: true, prep, verify: { ok: true, mismatches: [] }, activityId: null };
  if (expectHash !== undefined && expectHash !== prep.planHash) {
    throw fail('PLAN_CHANGED', `Plan changed since the approved preview (expected ${expectHash}, now ${prep.planHash}). Re-run the preview. Nothing was written.`);
  }
  writeManifest({ kind: VIS_KIND, pid, planHash: prep.planHash, createdAt: new Date().toISOString(), before: prep.from, after: to });
  if (hooks.beforeCommit) await hooks.beforeCommit();
  const r = await commit(db, { pid, fingerprint: prep.fingerprint, before: prep.from, after: to, FieldValue });
  return { noop: false, prep, ...r };
}

export async function prepareVisibilityRollback(db, { manifest }) {
  const pid = manifest?.pid;
  const state = typeof pid === 'string' && pid && !pid.includes('/') ? await readVisibilityState(db, pid) : { doc: null };
  return { ...decideVisibilityRollback({ manifest, state }), fingerprint: fingerprintOf(state.doc) };
}

export async function rollbackVisibility(db, { manifest, expectHash, FieldValue }) {
  const prep = await prepareVisibilityRollback(db, { manifest });
  if (prep.blocked.length) throw fail('BLOCKED', `Rollback blocked: ${prep.blocked.map((b) => `${b.code} (${b.detail})`).join('; ')}. Nothing was written.`);
  if (prep.noop) return { noop: true, prep, verify: { ok: true, mismatches: [] } };
  if (expectHash !== undefined && expectHash !== prep.hash) {
    throw fail('PLAN_CHANGED', `Rollback plan changed since the approved preview (expected ${expectHash}, now ${prep.hash}). Re-run the preview. Nothing was written.`);
  }
  const r = await commit(db, { pid: manifest.pid, fingerprint: prep.fingerprint, before: prep.from, after: prep.to, FieldValue, rollback: true });
  return { noop: false, prep, ...r };
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const o = { pid: null, pos: [], apply: false, set: null, key: 'service-account.json', expect: null, rollback: null, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v === '' || v.startsWith('--')) o.error = o.error || `${a} needs a value`;
      return v;
    };
    if (a === '--apply') o.apply = true;
    else if (a === '--set') o.set = value();
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
  if (o.rollback != null) {
    if (o.pos.length || o.set) o.error = '--rollback takes only a manifest path (plus --apply --expect / --key)';
    else hashOk();
    return o;
  }
  if (o.pos.length !== 1 || o.pos[0].includes('/')) { o.error = 'Exactly one project id (no "/") is required'; return o; }
  [o.pid] = o.pos;
  if (!VISIBILITIES.includes(o.set)) { o.error = `--set ${VISIBILITIES.join('|')} is required`; return o; }
  hashOk();
  return o;
}

const USAGE = [
  'Usage: node scripts/p2-visibility.mjs <pid> --set department|restricted [--apply --expect <plan hash>] [--key service-account.json]',
  '       node scripts/p2-visibility.mjs --rollback <manifest.json> [--apply --expect <rollback hash>] [--key service-account.json]',
].join('\n');

const errOut = (e) => console.error(`${e.code ? `[${e.code}] ` : ''}${e.message || e}`);

async function rollbackMain(o) {
  if (!fs.existsSync(o.rollback)) { console.error(`Manifest not found: ${o.rollback}`); process.exit(1); }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(o.rollback, 'utf8')); } catch { console.error('Invalid manifest JSON'); process.exit(1); }
  const { db, FieldValue } = await openDb(o.key);
  const prep = await prepareVisibilityRollback(db, { manifest });
  console.log(`Rollback:    ${prep.pid}`);
  if (prep.blocked.length) { for (const b of prep.blocked) console.log(`BLOCKING: ${b.code}: ${b.detail}`); process.exit(1); }
  if (prep.noop) { console.log(`Nothing to roll back: ${prep.skipped}`); process.exit(0); }
  console.log(`Visibility:  ${prep.from} -> ${prep.to}`);
  console.log(`Plan hash:   ${prep.hash}  (apply with --rollback <manifest> --apply --expect ${prep.hash})`);
  if (!o.apply) { console.log('Dry run: Firestore untouched.'); process.exit(0); }
  let r;
  try { r = await rollbackVisibility(db, { manifest, expectHash: o.expect, FieldValue }); } catch (e) { errOut(e); process.exit(1); }
  console.log(`Rolled back. Verify: ${r.verify.ok ? 'OK' : 'MISMATCH'}`);
  process.exit(r.verify.ok ? 0 : 2);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.error) { console.error(o.error); console.error(USAGE); process.exit(1); }
  if (o.rollback != null) return rollbackMain(o);
  const { db, FieldValue } = await openDb(o.key);
  const { pid } = o;
  const state = await readVisibilityState(db, pid);
  const prep = prepareVisibility({ pid, state, members: state.members, to: o.set });
  for (const l of formatVisibilityPreview(prep, { nameOfUid: nameLookup(state.members) })) console.log(l);
  if (!o.apply) { console.log('Dry run: Firestore untouched.'); process.exit(prep.blocked.length ? 1 : 0); }
  if (prep.blocked.length) { console.error('Refusing to apply (see above). Nothing was written.'); process.exit(1); }
  if (prep.noop) { console.log('Noop: nothing written.'); process.exit(0); }
  const manifestPath = `p2-visibility-manifest-${pid}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  let r;
  try {
    r = await applyVisibility(db, { pid, to: o.set, expectHash: o.expect, FieldValue, writeManifest: (m) => fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2)) });
  } catch (e) {
    errOut(e);
    if (fs.existsSync(manifestPath)) {
      if (e.code === 'STATE_CHANGED') { fs.unlinkSync(manifestPath); console.error(`Manifest ${manifestPath} removed: the transaction did not commit.`); }
      else console.error(`Commit status unknown; manifest kept: ${manifestPath}. Re-run the preview: if it is a noop the apply landed.`);
    }
    process.exit(1);
  }
  if (r.noop) { console.log('Noop: nothing written.'); process.exit(0); }
  console.log(`Applied:     visibility ${r.prep.from} -> ${o.set}; activity ${r.activityId}`);
  console.log(`Manifest:    ${manifestPath} (rollback: --rollback ${manifestPath})`);
  console.log(`Verify:      ${r.verify.ok ? 'OK' : 'MISMATCH'}`);
  process.exit(r.verify.ok ? 0 : 2);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e.message || e); process.exit(1); });
