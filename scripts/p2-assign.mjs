// P2.4c: assign PM / Deputy (per program) and Sub-PM + dates (per workstream) on a
// project that is ALREADY v2 (p2-migrate ignores --assignments after the switch).
//
// Reads the assignments workbook with scripts/lib/assignments.mjs (same sheets and
// columns as the migration template). All-or-nothing: any bad row blocks the run.
// Writes, in ONE Admin transaction that re-reads the project doc and the affected
// workstream docs and refuses (STATE_CHANGED) unless the fingerprint is unchanged:
//  - project doc: programMeta.<prg>.pmUid / deputyUid as FieldPath updates (never the
//    whole map), memberUids / memberIds arrayUnion of the assigned uids + every task /
//    action picUid (Ruling G; nobody is removed), updatedAt;
//  - workstream docs: leadUid / start / end, version + 1, updatedBy 'p2-assign',
//    updatedAt (server time);
//  - one activity event { type: 'roles_assigned', author: 'p2-assign', authorUid: null }.
// A blank cell leaves the field unchanged. The local manifest (before-values) is
// written before the transaction and removed by the CLI if the transaction fails.
//
// Usage:
//   node scripts/p2-assign.mjs <pid> --template <out.xlsx> [--key service-account.json]                 (read-only: template from the LIVE project)
//   node scripts/p2-assign.mjs <pid> --assignments <file.xlsx> [--key service-account.json]             (preview, read-only; prints the plan hash)
//   node scripts/p2-assign.mjs <pid> --assignments <file.xlsx> --apply --expect <plan hash> [--key ...]
//   node scripts/p2-assign.mjs --rollback <manifest.json> [--key ...]                                    (rollback preview; prints its hash)
//   node scripts/p2-assign.mjs --rollback <manifest.json> --apply --expect <rollback hash> [--key ...]
// Exit codes: 0 ok / noop; 1 usage / blocked / PLAN_CHANGED / STATE_CHANGED; 2 verify mismatch.
// Outputs (gitignored, contain people names): p2-assign-preview-<pid>.xlsx,
// p2-assign-manifest-<pid>-<stamp>.json.

import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { toJsonable } from './lib/manifest.mjs';
import { applyAssignments, parseAssignmentsWorkbook, formatPreview } from './lib/assignments.mjs';
import { stableJson } from './lib/migrate-normalise.mjs';
import { PROGRAMS_SHEET, WORKSTREAMS_SHEET, PROGRAM_COLS, WORKSTREAM_COLS } from './p2-migrate-dryrun.mjs';
import { docsOf, readDirectory, openDb, nameLookup, writePreviewXlsx } from './p2-migrate.mjs';

XLSX.set_fs(fs);
const WID = 'main';
const WS = `workspaces/${WID}`;
const PROJECTS = `${WS}/projects`;
export const STAMP = 'p2-assign';
export const MANIFEST_KIND = 'p2-assign';
const PROGRAM_KEYS = [['pmUid', 'PM'], ['deputyUid', 'Deputy']];
const WS_KEYS = ['leadUid', 'start', 'end'];
const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const arr = (v) => (Array.isArray(v) ? v : []);
const val = (o, k) => (hasOwn(o, k) ? o[k] : null);
const hash16 = (payload) => createHash('sha256').update(stableJson(payload)).digest('hex').slice(0, 16);
const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

// ---------------------------------------------------------------- pure core

// What the transaction re-checks. wsDocs = [{ id, data }]; wsIds = affected workstreams.
export function fingerprintOf(doc, wsDocs, wsIds) {
  const byId = new Map(arr(wsDocs).map((w) => [w.id, w.data]));
  return {
    programMeta: doc?.programMeta ?? null,
    memberUids: doc?.memberUids ?? null,
    memberIds: doc?.memberIds ?? null,
    visibility: doc?.visibility ?? null,
    ws: Object.fromEntries([...wsIds].sort().map((id) => [id, byId.has(id) ? (byId.get(id)?.version ?? 0) : null])),
  };
}

function projectBlock(doc, pid) {
  if (!doc) return { code: 'not-found', detail: `${PROJECTS}/${pid}` };
  if (doc.schemaVersion !== 2) return { code: 'not-v2', detail: `schemaVersion is ${doc.schemaVersion ?? '(absent)'}: switch it with p2-migrate first` };
  if (doc.deletedAt) return { code: 'deleted', detail: 'the project is deleted' };
  return null;
}

// state = { doc, workstreams, tasks, actions } (each list [{ id, data }]);
// dir = readDirectory() result ({ dirIndex, uidByEmail, members }); assignments = parsed rows.
export function decideAssign({ pid, state, dir, assignments }) {
  const out = {
    pid, blocked: [], errors: [], warnings: [], preview: null,
    changes: { programs: [], workstreams: [] }, grants: { union: [], memberUidsAdded: [], memberIdsAdded: [] },
    fingerprint: null, noop: false, planHash: null, projectName: state?.doc?.name ?? null,
  };
  const { doc } = state || {};
  const b = projectBlock(doc, pid);
  if (b) return { ...out, blocked: [b] };
  const pm = doc.programMeta;
  if (!pm || typeof pm !== 'object' || !Object.keys(pm).length) {
    return { ...out, blocked: [{ code: 'no-programMeta', detail: 'the project has no programMeta: no program can hold a PM' }] };
  }

  // Reuse the migration reader/validator on the live docs, shaped as planned writes.
  const base = `${PROJECTS}/${pid}`;
  const sub = (kind) => arr(state[kind]).map((d) => ({ path: `${base}/${kind}/${d.id}`, data: d.data || {} }));
  const writes = [{ path: base, data: doc }, ...sub('workstreams'), ...sub('tasks'), ...sub('actions')];
  const res = applyAssignments(writes, assignments || { programs: [], workstreams: [] }, dir, {
    projectNames: [doc.name, pid].filter(Boolean),
  });
  const errors = [...res.errors];

  // isLead needs the workstream's program in programMeta: a Sub-PM there would have no
  // rights. Checked on the preview (built even when other rows are bad) to list every row.
  const wsProg = new Map(arr(state.workstreams).map((w) => [w.id, w.data?.programId ?? null]));
  for (const pw of res.preview?.workstreams || []) {
    const lead = pw.fields.find((f) => f.label === 'Sub-PM');
    const prg = wsProg.get(pw.id);
    if (lead && lead.new != null && lead.new !== lead.old && !hasOwn(pm, prg)) {
      errors.push(`workstream ${pw.id}: its program "${prg ?? '(none)'}" is not in programMeta, so a Sub-PM would have no rights`);
    }
  }
  if (errors.length) return { ...out, errors, preview: res.preview };

  const proj = res.writes[0].data;
  const outWs = new Map(res.writes.filter((w) => w.path.split('/')[4] === 'workstreams').map((w) => [w.path.split('/')[5], w.data]));
  const programs = [];
  for (const id of Object.keys(pm)) {
    const before = pm[id] || {};
    const after = proj.programMeta[id] || {};
    const fields = PROGRAM_KEYS
      .filter(([k]) => val(after, k) !== val(before, k))
      .map(([k]) => ({ key: k, had: hasOwn(before, k), before: val(before, k), after: val(after, k) }));
    if (fields.length) programs.push({ id, name: before.name ?? id, fields });
  }
  const workstreams = [];
  for (const w of arr(state.workstreams)) {
    const after = outWs.get(w.id) || {};
    const fields = WS_KEYS
      .filter((k) => val(after, k) !== val(w.data, k))
      .map((k) => ({ key: k, had: hasOwn(w.data, k), before: val(w.data, k), after: val(after, k) }));
    if (fields.length) workstreams.push({ id: w.id, name: w.data?.name ?? w.id, programId: w.data?.programId ?? null, version: w.data?.version ?? 0, fields });
  }

  // Ruling G grants: the uids applyAssignments merged in (assigned + task / action PICs).
  const union = [...new Set([
    ...arr(proj.memberUids).filter((u) => !arr(doc.memberUids).includes(u)),
    ...arr(proj.memberIds).filter((u) => !arr(doc.memberIds).includes(u)),
    ...programs.flatMap((p) => p.fields.map((f) => f.after)),
    ...workstreams.flatMap((w) => w.fields.filter((f) => f.key === 'leadUid').map((f) => f.after)),
    ...['tasks', 'actions'].flatMap((k) => arr(state[k]).map((d) => d.data?.picUid)),
  ].filter((u) => typeof u === 'string' && u))].sort();
  const grants = {
    union,
    memberUidsAdded: union.filter((u) => !arr(doc.memberUids).includes(u)),
    memberIdsAdded: union.filter((u) => !arr(doc.memberIds).includes(u)),
  };

  const warnings = [];
  const status = new Map(arr(dir?.members).map((m) => [m.id, m.data?.status ?? null]));
  const assigned = new Set([...programs.flatMap((p) => p.fields.map((f) => f.after)), ...workstreams.flatMap((w) => w.fields.filter((f) => f.key === 'leadUid').map((f) => f.after))]);
  for (const u of [...assigned].sort()) {
    if (status.get(u) !== 'active') warnings.push(`${u} is ${status.get(u) ?? 'not in members'} (not active): the role takes effect only once the member is active`);
  }

  const changes = { programs, workstreams };
  const fingerprint = fingerprintOf(doc, state.workstreams, workstreams.map((w) => w.id));
  const noop = !programs.length && !workstreams.length && !grants.memberUidsAdded.length && !grants.memberIdsAdded.length;
  const planHash = hash16({ kind: MANIFEST_KIND, pid, fingerprint, changes, grants, warnings });
  return { ...out, preview: res.preview, changes, grants, warnings, fingerprint, noop, planHash };
}

const lines = (label, list) => (list.length ? [`${label}:`, ...list.map((l) => `  ${l}`)] : []);

export function formatAssignPreview(p, { pid, nameOfUid = (u) => u } = {}) {
  const L = [`Project:     ${PROJECTS}/${pid}${p.projectName ? ` (${p.projectName})` : ''}`];
  if (p.blocked.length) {
    L.push('BLOCKING:', ...p.blocked.map((b) => `  ${b.code}: ${b.detail}`));
    L.push('Nothing will be written.');
    return L;
  }
  if (p.errors.length) {
    L.push(...lines('INVALID ROWS (all-or-nothing)', p.errors));
    L.push('Nothing will be written: fix every row above and re-run the preview.');
    return L;
  }
  L.push('Assignments (old -> new):');
  const shown = p.preview ? formatPreview(p.preview) : [];
  if (!shown.length) L.push('  none');
  for (const l of shown) L.push(`  ${l}`);
  L.push(`Changes:     ${p.changes.programs.length} program(s), ${p.changes.workstreams.length} workstream(s)`);
  L.push('Access grants (HOD approves; who gains read access):');
  if (!p.grants.memberUidsAdded.length && !p.grants.memberIdsAdded.length) L.push('  none');
  for (const u of p.grants.memberUidsAdded) L.push(`  memberUids + ${nameOfUid(u)}`);
  for (const u of p.grants.memberIdsAdded) L.push(`  memberIds  + ${nameOfUid(u)}`);
  L.push(...lines('Warnings', p.warnings));
  if (p.noop) {
    L.push('Nothing to change: the live project already holds these values.');
    return L;
  }
  L.push(`Plan hash:   ${p.planHash}  (apply with --apply --expect ${p.planHash})`);
  return L;
}

export function previewRows(p, { nameOfUid = (u) => u } = {}) {
  const fmt = (v) => (v == null ? '' : String(v));
  const person = (k, v) => (k === 'start' || k === 'end' ? fmt(v) : v ? nameOfUid(v) : '');
  return [
    ...p.changes.programs.flatMap((g) => g.fields.map((f) => ({ Level: 'program', Id: g.id, Name: g.name, Field: f.key, Old: person(f.key, f.before), New: person(f.key, f.after) }))),
    ...p.changes.workstreams.flatMap((w) => w.fields.map((f) => ({ Level: 'workstream', Id: w.id, Name: w.name, Field: f.key, Old: person(f.key, f.before), New: person(f.key, f.after) }))),
    ...p.grants.memberUidsAdded.map((u) => ({ Level: 'grant', Id: u, Name: nameOfUid(u), Field: 'memberUids', Old: '', New: 'added' })),
    ...p.grants.memberIdsAdded.map((u) => ({ Level: 'grant', Id: u, Name: nameOfUid(u), Field: 'memberIds', Old: '', New: 'added' })),
  ];
}

// After the commit: the live state holds every planned value. state as in decideAssign.
export function verifyAssign(p, state) {
  const m = [];
  const pm = state.doc?.programMeta || {};
  for (const g of p.changes.programs) {
    for (const f of g.fields) {
      if (val(pm[g.id], f.key) !== f.after) m.push(`program ${g.id} ${f.key}: ${val(pm[g.id], f.key)} !== ${f.after}`);
    }
  }
  const ws = new Map(arr(state.workstreams).map((w) => [w.id, w.data || {}]));
  for (const w of p.changes.workstreams) {
    const d = ws.get(w.id);
    if (!d) { m.push(`workstream ${w.id} missing`); continue; }
    for (const f of w.fields) if (val(d, f.key) !== f.after) m.push(`workstream ${w.id} ${f.key}: ${val(d, f.key)} !== ${f.after}`);
    if ((d.version ?? 0) !== w.version + 1) m.push(`workstream ${w.id} version ${d.version} !== ${w.version + 1}`);
  }
  for (const k of ['memberUids', 'memberIds']) {
    for (const u of p.grants.union) if (!arr(state.doc?.[k]).includes(u)) m.push(`${k} missing ${u}`);
  }
  return { ok: !m.length, mismatches: m };
}

// Rollback: restore manifest before-values on fields that still hold the applied value.
// A field changed since the apply is skipped (never clobbers a later edit). Grants stay.
export function decideAssignRollback({ manifest, state }) {
  const out = { pid: manifest?.pid ?? null, blocked: [], restores: { programs: [], workstreams: [] }, skipped: [], noop: false, hash: null, fingerprint: null };
  if (!manifest || manifest.kind !== MANIFEST_KIND || typeof manifest.pid !== 'string') {
    return { ...out, blocked: [{ code: 'bad-manifest', detail: `not a ${MANIFEST_KIND} manifest` }] };
  }
  const { doc } = state || {};
  const b = projectBlock(doc, manifest.pid);
  if (b) return { ...out, blocked: [b] };
  const skipped = [];
  const programs = [];
  for (const g of arr(manifest.programs)) {
    const cur = doc.programMeta?.[g.id];
    const fields = [];
    for (const f of arr(g.fields)) {
      const now = val(cur, f.key);
      if (!isDeepStrictEqual(now, f.after)) skipped.push({ where: `program ${g.id}`, key: f.key, expected: f.after, now });
      else fields.push({ key: f.key, had: f.had, before: f.before, now });
    }
    if (fields.length) programs.push({ id: g.id, fields });
  }
  const wsById = new Map(arr(state.workstreams).map((w) => [w.id, w.data]));
  const workstreams = [];
  for (const w of arr(manifest.workstreams)) {
    const d = wsById.get(w.id);
    if (!d) { skipped.push({ where: `workstream ${w.id}`, key: '(doc)', expected: 'present', now: 'missing' }); continue; }
    const fields = [];
    for (const f of arr(w.fields)) {
      const now = val(d, f.key);
      if (!isDeepStrictEqual(now, f.after)) skipped.push({ where: `workstream ${w.id}`, key: f.key, expected: f.after, now });
      else fields.push({ key: f.key, had: f.had, before: f.before, now });
    }
    if (fields.length) workstreams.push({ id: w.id, version: d.version ?? 0, fields });
  }
  const restores = { programs, workstreams };
  const fingerprint = fingerprintOf(doc, state.workstreams, arr(manifest.workstreams).map((w) => w.id));
  const hash = hash16({ kind: `${MANIFEST_KIND}-rollback`, pid: manifest.pid, manifestHash: manifest.planHash ?? null, fingerprint, restores, skipped });
  return { ...out, restores, skipped, fingerprint, hash, noop: !programs.length && !workstreams.length };
}

export function formatRollbackPreview(r, { pid } = {}) {
  const L = [`Rollback:    ${PROJECTS}/${pid ?? r.pid}`];
  if (r.blocked.length) {
    L.push('BLOCKING:', ...r.blocked.map((b) => `  ${b.code}: ${b.detail}`), 'Nothing will be written.');
    return L;
  }
  const show = (v, had = true) => (!had ? '(absent)' : v == null ? 'null' : String(v));
  L.push('Restore (now -> before):');
  if (r.noop) L.push('  none');
  for (const g of r.restores.programs) for (const f of g.fields) L.push(`  program ${g.id} ${f.key} ${show(f.now)} -> ${show(f.before, f.had)}`);
  for (const w of r.restores.workstreams) {
    for (const f of w.fields) L.push(`  workstream ${w.id} ${f.key} ${show(f.now)} -> ${show(f.before, f.had)}`);
    L.push(`  workstream ${w.id} version ${w.version} -> ${w.version + 1}`);
  }
  for (const s of r.skipped) L.push(`  SKIP ${s.where} ${s.key}: changed since the apply (expected ${show(s.expected)}, now ${show(s.now)})`);
  L.push('Access:      memberUids / memberIds kept (grants are not revoked)');
  if (r.noop) { L.push('Nothing to roll back.'); return L; }
  L.push(`Plan hash:   ${r.hash}  (apply with --rollback <manifest> --apply --expect ${r.hash})`);
  return L;
}

// Template rows from the LIVE v2 project (programs added after migration included),
// prefilled with the current people and dates (a blank or unchanged cell = no change).
export function liveTemplateRows(state, { emailOfUid = () => '' } = {}) {
  const { doc } = state;
  const pm = doc?.programMeta || {};
  const proj = doc?.name || '';
  const order = (k) => (typeof pm[k]?.order === 'number' ? pm[k].order : Infinity);
  const keys = Object.keys(pm).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  const programs = keys.map((k) => ({
    Project: proj, 'Program id': k, Program: pm[k]?.name ?? '',
    'PM email': pm[k]?.pmUid ? emailOfUid(pm[k].pmUid) : '', 'Deputy email': pm[k]?.deputyUid ? emailOfUid(pm[k].deputyUid) : '',
  }));
  const rank = new Map(keys.map((k, i) => [k, i]));
  const workstreams = [...arr(state.workstreams)]
    .sort((a, b) => (rank.get(a.data?.programId) ?? 1e9) - (rank.get(b.data?.programId) ?? 1e9)
      || (a.data?.order ?? 0) - (b.data?.order ?? 0) || a.id.localeCompare(b.id))
    .map((w) => ({
      Project: proj, 'Workstream id': w.id, Program: pm[w.data?.programId]?.name ?? w.data?.programId ?? '',
      Workstream: w.data?.name ?? '', 'Sub-PM email': w.data?.leadUid ? emailOfUid(w.data.leadUid) : '',
      Start: w.data?.start ?? '', End: w.data?.end ?? '',
    }));
  return { programs, workstreams };
}

// ---------------------------------------------------------------- I/O

const strip = (list) => list.map(({ id, data }) => ({ id, data }));

export async function readAssignState(db, pid) {
  const snap = await db.doc(`${PROJECTS}/${pid}`).get();
  const base = `${PROJECTS}/${pid}`;
  return {
    doc: snap.exists ? snap.data() : null,
    workstreams: strip(await docsOf(db, `${base}/workstreams`)),
    tasks: strip(await docsOf(db, `${base}/tasks`)),
    actions: strip(await docsOf(db, `${base}/actions`)),
  };
}

export async function prepareAssign(db, { pid, assignments }) {
  const state = await readAssignState(db, pid);
  const dir = await readDirectory(db);
  return { ...decideAssign({ pid, state, dir, assignments }), dir };
}

// Re-read the project doc and the given workstream docs inside the transaction.
async function txState(tx, db, pid, wsIds) {
  const s = await tx.get(db.doc(`${PROJECTS}/${pid}`));
  const workstreams = [];
  for (const id of wsIds) {
    const w = await tx.get(db.doc(`${PROJECTS}/${pid}/workstreams/${id}`));
    if (w.exists) workstreams.push({ id, data: w.data() });
  }
  return { doc: s.exists ? s.data() : null, workstreams };
}

function activityDoc(db, pid, { type, description, FieldValue }) {
  const id = `${type}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  return {
    ref: db.doc(`${PROJECTS}/${pid}/activity/${id}`),
    data: {
      id, type, description, author: STAMP, authorUid: null, createdAt: FieldValue.serverTimestamp(),
      timestamp: new Date().toISOString(), projectId: pid, workspaceId: WID,
    },
  };
}

const describeChanges = (changes) => `Roles assigned by ${STAMP}: ${changes.programs.length} program(s), ${changes.workstreams.length} workstream(s)`;

// Throws BLOCKED / INVALID / PLAN_CHANGED (nothing written) or STATE_CHANGED (the
// transaction re-read a different fingerprint; nothing written). Returns
// { noop, prep, verify, activityId }.
export async function applyAssign(db, { pid, assignments, expectHash, FieldValue, FieldPath, Timestamp, writeManifest, hooks = {} }) {
  const prep = await prepareAssign(db, { pid, assignments });
  if (prep.blocked.length) throw fail('BLOCKED', `Blocked: ${prep.blocked.map((b) => `${b.code} (${b.detail})`).join('; ')}. Nothing was written.`);
  if (prep.errors.length) throw fail('INVALID', `Invalid rows (${prep.errors.length}): ${prep.errors.join('; ')}. Nothing was written.`);
  if (prep.noop) return { noop: true, prep, verify: { ok: true, mismatches: [] }, activityId: null };
  if (expectHash !== undefined && expectHash !== prep.planHash) {
    throw fail('PLAN_CHANGED', `Plan changed since the approved preview (expected ${expectHash}, now ${prep.planHash}). Re-run the preview. Nothing was written.`, { planHash: prep.planHash });
  }
  const json = (v) => (Timestamp ? toJsonable(v, Timestamp) : v);
  writeManifest({
    kind: MANIFEST_KIND, pid, planHash: prep.planHash, createdAt: new Date().toISOString(),
    fingerprint: json(prep.fingerprint), programs: prep.changes.programs, workstreams: prep.changes.workstreams,
    grants: prep.grants, note: 'Rollback restores the before-values; it never removes member grants.',
  });
  if (hooks.beforeCommit) await hooks.beforeCommit();
  const wsIds = prep.changes.workstreams.map((w) => w.id);
  const projRef = db.doc(`${PROJECTS}/${pid}`);
  const act = activityDoc(db, pid, { type: 'roles_assigned', description: describeChanges(prep.changes), FieldValue });
  await db.runTransaction(async (tx) => {
    const s = await txState(tx, db, pid, wsIds);
    const b = projectBlock(s.doc, pid);
    if (b || !isDeepStrictEqual(stableJson(fingerprintOf(s.doc, s.workstreams, wsIds)), stableJson(prep.fingerprint))) {
      throw fail('STATE_CHANGED', `The project or a workstream changed since the preview${b ? ` (${b.code})` : ''}. Nothing was written; re-run the preview.`);
    }
    const args = [];
    for (const g of prep.changes.programs) for (const f of g.fields) args.push(new FieldPath('programMeta', g.id, f.key), f.after);
    if (prep.grants.union.length) {
      args.push('memberUids', FieldValue.arrayUnion(...prep.grants.union), 'memberIds', FieldValue.arrayUnion(...prep.grants.union));
    }
    args.push('updatedAt', FieldValue.serverTimestamp());
    tx.update(projRef, ...args);
    for (const w of prep.changes.workstreams) {
      const cur = s.workstreams.find((x) => x.id === w.id).data;
      tx.update(db.doc(`${PROJECTS}/${pid}/workstreams/${w.id}`), {
        ...Object.fromEntries(w.fields.map((f) => [f.key, f.after])),
        version: (cur.version ?? 0) + 1, updatedBy: STAMP, updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.create(act.ref, act.data);
  });
  const after = await readAssignState(db, pid);
  return { noop: false, prep, verify: verifyAssign(prep, after), activityId: act.data.id };
}

export async function prepareAssignRollback(db, { manifest }) {
  const pid = manifest?.pid;
  const state = typeof pid === 'string' && pid && !pid.includes('/') ? await readAssignState(db, pid) : { doc: null, workstreams: [] };
  return decideAssignRollback({ manifest, state });
}

// Throws BLOCKED / PLAN_CHANGED / STATE_CHANGED with nothing written. Returns { noop, verify }.
export async function rollbackAssign(db, { manifest, expectHash, FieldValue, FieldPath }) {
  const prep = await prepareAssignRollback(db, { manifest });
  if (prep.blocked.length) throw fail('BLOCKED', `Rollback blocked: ${prep.blocked.map((b) => `${b.code} (${b.detail})`).join('; ')}. Nothing was written.`);
  if (prep.noop) return { noop: true, prep, verify: { ok: true, mismatches: [] } };
  if (expectHash !== undefined && expectHash !== prep.hash) {
    throw fail('PLAN_CHANGED', `Rollback plan changed since the approved preview (expected ${expectHash}, now ${prep.hash}). Re-run the preview. Nothing was written.`);
  }
  const { pid } = manifest;
  const wsIds = arr(manifest.workstreams).map((w) => w.id);
  const act = activityDoc(db, pid, { type: 'roles_assignment_rolled_back', description: `Role assignment rolled back by ${STAMP} (manifest ${manifest.planHash ?? '?'})`, FieldValue });
  await db.runTransaction(async (tx) => {
    const s = await txState(tx, db, pid, wsIds);
    const cur = decideAssignRollback({ manifest, state: s });
    if (cur.blocked.length || cur.hash !== prep.hash) {
      throw fail('STATE_CHANGED', 'The project or a workstream changed since the rollback preview. Nothing was written; re-run the preview.');
    }
    const restoreVal = (f) => (f.had ? f.before : FieldValue.delete());
    const args = [];
    for (const g of cur.restores.programs) for (const f of g.fields) args.push(new FieldPath('programMeta', g.id, f.key), restoreVal(f));
    args.push('updatedAt', FieldValue.serverTimestamp());
    tx.update(db.doc(`${PROJECTS}/${pid}`), ...args);
    for (const w of cur.restores.workstreams) {
      tx.update(db.doc(`${PROJECTS}/${pid}/workstreams/${w.id}`), {
        ...Object.fromEntries(w.fields.map((f) => [f.key, restoreVal(f)])),
        version: w.version + 1, updatedBy: `${STAMP}-rollback`, updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.create(act.ref, act.data);
  });
  // Verify: every restored field holds its before-value (absent when it was absent).
  const after = await readAssignState(db, pid);
  const m = [];
  for (const g of prep.restores.programs) {
    for (const f of g.fields) {
      const cur = after.doc?.programMeta?.[g.id];
      if (hasOwn(cur, f.key) !== f.had || (f.had && !isDeepStrictEqual(cur[f.key], f.before))) m.push(`program ${g.id} ${f.key}`);
    }
  }
  const ws = new Map(after.workstreams.map((w) => [w.id, w.data]));
  for (const w of prep.restores.workstreams) {
    for (const f of w.fields) {
      const d = ws.get(w.id);
      if (hasOwn(d, f.key) !== f.had || (f.had && !isDeepStrictEqual(d[f.key], f.before))) m.push(`workstream ${w.id} ${f.key}`);
    }
  }
  return { noop: false, prep, verify: { ok: !m.length, mismatches: m } };
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const o = { pid: null, pos: [], apply: false, key: 'service-account.json', assignments: null, template: null, expect: null, rollback: null, error: null };
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
    else if (a === '--template') o.template = value();
    else if (a === '--expect') o.expect = value();
    else if (a === '--rollback') o.rollback = value();
    else if (a.startsWith('--')) o.error = o.error || `Unknown argument: ${a}`;
    else o.pos.push(a);
  }
  if (o.error) return o;
  const hashOk = () => {
    if (o.apply && !o.expect) o.error = '--apply needs --expect <plan hash> from the approved preview';
    else if (o.expect && !/^[0-9a-f]{16}$/.test(o.expect)) o.error = `--expect must be the 16-hex plan hash, got "${o.expect}"`;
  };
  if (o.rollback != null) {
    if (o.pos.length || o.assignments || o.template) o.error = '--rollback takes only a manifest path (plus --apply --expect / --key)';
    else hashOk();
    return o;
  }
  if (o.pos.length !== 1 || o.pos[0].includes('/')) { o.error = 'Exactly one project id (no "/") is required'; return o; }
  [o.pid] = o.pos;
  if (o.template) {
    if (o.assignments || o.apply || o.expect) o.error = '--template is read-only: use it alone (plus --key)';
    return o;
  }
  if (!o.assignments) { o.error = '--assignments <file.xlsx> is required (or --template <out.xlsx>)'; return o; }
  hashOk();
  return o;
}

const USAGE = [
  'Usage: node scripts/p2-assign.mjs <pid> --template <out.xlsx> [--key service-account.json]',
  '       node scripts/p2-assign.mjs <pid> --assignments <file.xlsx> [--apply --expect <plan hash>] [--key service-account.json]',
  '       node scripts/p2-assign.mjs --rollback <manifest.json> [--apply --expect <rollback hash>] [--key service-account.json]',
].join('\n');

function emailLookup(members) {
  const byUid = new Map(members.map((m) => [m.id, m.data?.email || '']));
  return (uid) => byUid.get(uid) || '';
}

async function templateMain(o) {
  const { db } = await openDb(o.key);
  const state = await readAssignState(db, o.pid);
  const b = projectBlock(state.doc, o.pid);
  if (b) { console.error(`Blocked: ${b.code} (${b.detail}).`); process.exit(1); }
  const dir = await readDirectory(db);
  const t = liveTemplateRows(state, { emailOfUid: emailLookup(dir.members) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t.programs, { header: PROGRAM_COLS }), PROGRAMS_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t.workstreams, { header: WORKSTREAM_COLS }), WORKSTREAMS_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Step: 1, What: 'Programs: PM email / Deputy email. Workstreams: Sub-PM email, Start / End (yyyy-mm-dd).' },
    { Step: 2, What: 'Prefilled = current value. A blank cell keeps the current value (it never clears a role).' },
  ]), 'Instructions');
  XLSX.writeFile(wb, o.template);
  console.log(`Template:    ${o.template} (${t.programs.length} program(s), ${t.workstreams.length} workstream(s)). Firestore untouched.`);
  process.exit(0);
}

async function rollbackMain(o) {
  if (!fs.existsSync(o.rollback)) { console.error(`Manifest not found: ${o.rollback}`); process.exit(1); }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(o.rollback, 'utf8')); } catch { console.error('Invalid manifest JSON'); process.exit(1); }
  const { db, FieldValue, FieldPath } = await openDb(o.key);
  const prep = await prepareAssignRollback(db, { manifest });
  for (const l of formatRollbackPreview(prep, { pid: manifest?.pid })) console.log(l);
  if (prep.blocked.length) process.exit(1);
  if (!o.apply || prep.noop) {
    if (!o.apply) console.log('Dry run: Firestore untouched. Re-run with --apply --expect <hash> to roll back.');
    process.exit(0);
  }
  let r;
  try { r = await rollbackAssign(db, { manifest, expectHash: o.expect, FieldValue, FieldPath }); } catch (e) {
    console.error(`${e.code ? `[${e.code}] ` : ''}${e.message || e}`);
    process.exit(1);
  }
  console.log(`Rolled back. Verify: ${r.verify.ok ? 'OK' : 'MISMATCH'}`);
  for (const l of r.verify.mismatches) console.log(`  ${l}`);
  process.exit(r.verify.ok ? 0 : 2);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.error) { console.error(o.error); console.error(USAGE); process.exit(1); }
  if (o.rollback != null) return rollbackMain(o);
  if (o.template) return templateMain(o);
  if (!fs.existsSync(o.assignments)) { console.error(`Assignments file not found: ${o.assignments}`); process.exit(1); }
  const assignments = parseAssignmentsWorkbook(XLSX.readFile(o.assignments));
  // Key check first (openDb exits without it): nothing below touches Firestore otherwise.
  const { db, FieldValue, FieldPath, Timestamp } = await openDb(o.key);
  const { pid } = o;
  const prep = await prepareAssign(db, { pid, assignments });
  const nameOfUid = nameLookup(prep.dir.members);
  const summary = formatAssignPreview(prep, { pid, nameOfUid });
  for (const l of summary) console.log(l);
  const xlsxPath = `p2-assign-preview-${pid}.xlsx`;
  writePreviewXlsx(xlsxPath, { Summary: summary.map((Line) => ({ Line })), Changes: previewRows(prep, { nameOfUid }) });
  console.log(`Preview:     ${xlsxPath}`);
  const refused = prep.blocked.length > 0 || prep.errors.length > 0;
  if (!o.apply) {
    console.log('Dry run: Firestore untouched.');
    process.exit(refused ? 1 : 0);
  }
  if (refused) { console.error('Refusing to apply (see above). Nothing was written.'); process.exit(1); }
  if (prep.noop) { console.log('Noop: nothing written.'); process.exit(0); }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestPath = `p2-assign-manifest-${pid}-${stamp}.json`;
  let r;
  try {
    r = await applyAssign(db, {
      pid, assignments, expectHash: o.expect, FieldValue, FieldPath, Timestamp,
      writeManifest: (m) => fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2)),
    });
  } catch (e) {
    console.error(`${e.code ? `[${e.code}] ` : ''}${e.message || e}`);
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
      console.error(`Manifest ${manifestPath} removed: the transaction did not commit.`);
    }
    process.exit(1);
  }
  if (r.noop) { console.log('Noop: nothing written.'); process.exit(0); }
  console.log(`Applied:     ${r.prep.changes.programs.length} program(s), ${r.prep.changes.workstreams.length} workstream(s); activity ${r.activityId}`);
  console.log(`Manifest:    ${manifestPath} (rollback: --rollback ${manifestPath})`);
  console.log(`Verify:      ${r.verify.ok ? 'OK' : 'MISMATCH'}`);
  for (const l of r.verify.mismatches) console.log(`  ${l}`);
  process.exit(r.verify.ok ? 0 : 2);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e.message || e); process.exit(1); });
