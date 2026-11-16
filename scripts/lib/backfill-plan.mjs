// W3-B2 (B-1, M1): pure planner for scripts/p2-backfill-uids.mjs.
//
// A task / action on a v2 project stores the person as a name (`pic`, `contributors`)
// and as uids (`picUid`, `contributorUids`) the rules read. A person invited before
// their first sign-in had no uid yet, so their items were stored with picUid null:
// rules then refuse them their own work and My Work misses it. This planner fills the
// missing uids from the directory, never overwrites a stored uid, and lists what it
// cannot fix.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { canonicalPerson } from '../../src/directory.js';
import { foldName } from '../../src/identity.js';
import { stableJson } from './migrate-normalise.mjs';

export const BACKFILL_KIND = 'p2-backfill-uids';
export const BACKFILL_STAMP = 'p2-backfill-uids';
// One Admin transaction: changed docs + the project doc + one activity doc.
export const MAX_OPS = 450;

const arr = (v) => (Array.isArray(v) ? v : []);
const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const val = (o, k) => (hasOwn(o, k) ? o[k] : null);
export const hash16 = (payload) => createHash('sha256').update(stableJson(payload)).digest('hex').slice(0, 16);

export function projectBlock(doc, pid) {
  if (!doc) return { code: 'not-found', detail: `project ${pid} not found` };
  if (doc.schemaVersion !== 2) return { code: 'not-v2', detail: `schemaVersion is ${doc.schemaVersion ?? '(absent)'}: switch it with p2-migrate first` };
  if (doc.deletedAt) return { code: 'deleted', detail: 'the project is deleted' };
  return null;
}

// docs = [{ kind: 'tasks' | 'actions', id }]; the transaction re-checks exactly this.
export function backfillFingerprint(doc, state, docs) {
  const byKey = new Map(['tasks', 'actions'].flatMap((k) => arr(state?.[k]).map((d) => [`${k}/${d.id}`, d.data])));
  return {
    memberUids: doc?.memberUids ?? null,
    memberIds: doc?.memberIds ?? null,
    visibility: doc?.visibility ?? null,
    docs: Object.fromEntries(docs.map((d) => `${d.kind}/${d.id}`).sort().map((k) => [k, byKey.has(k) ? (byKey.get(k)?.version ?? 0) : null])),
  };
}

/**
 * state = { doc, tasks, actions } (lists of { id, data });
 * directory = { dirIndex, uidByEmail } (scripts/p2-pilot-copy.mjs directoryFrom);
 * members = [{ id, data }] of workspaces/main/members (status decides `inactive`).
 * -> { blocked, changes, grants, mismatch, unresolved, inactive, fingerprint, noop, planHash, counts }
 */
export function planBackfill({ pid, state, directory, members }) {
  const out = {
    pid, projectName: state?.doc?.name ?? null, blocked: [], changes: [], grants: { union: [], memberUidsAdded: [], memberIdsAdded: [] },
    mismatch: [], unresolved: [], inactive: [], fingerprint: null, noop: true, planHash: null,
  };
  const doc = state?.doc;
  const b = projectBlock(doc, pid);
  if (b) return { ...out, blocked: [b] };

  const dirIndex = directory?.dirIndex || null;
  const uidByEmail = directory?.uidByEmail || new Map();
  const statusOf = new Map(arr(members).map((m) => [m.id, m.data?.status ?? null]));
  const groups = new Set(arr(doc.contributorRegistry).map((g) => foldName(typeof g === 'string' ? g : g?.name || '')).filter(Boolean));
  const conflictKeys = new Set(arr(dirIndex?.conflicts).map((c) => c.alias));
  const conflicts = [];

  // -> { uid } when the name is a signed-in active member; else { reason } (null = blank / group).
  const resolve = (raw, where) => {
    if (raw == null || (typeof raw === 'string' && !raw.trim())) return null;
    const s = String(raw);
    if (groups.has(foldName(s))) return null;
    const key = s.trim().toLowerCase();
    if (conflictKeys.has(key) || conflictKeys.has(foldName(s))) {
      conflicts.push(`${where}: "${s.trim()}" matches more than one person in the directory`);
      return { reason: 'alias-conflict' };
    }
    const p = canonicalPerson(dirIndex, s);
    if (!p.known) { out.unresolved.push({ where, name: s.trim(), reason: 'not in the directory' }); return { reason: 'unknown' }; }
    const uid = uidByEmail.get(p.id) || null;
    if (!uid) { out.unresolved.push({ where, name: s.trim(), reason: `${p.id} has not signed in yet` }); return { reason: 'no-uid' }; }
    if (statusOf.get(uid) !== 'active') { out.inactive.push({ where, name: s.trim(), uid, status: statusOf.get(uid) ?? 'not in members' }); return { reason: 'inactive' }; }
    return { uid, email: p.id };
  };

  const changes = [];
  for (const kind of ['tasks', 'actions']) {
    for (const d of arr(state[kind])) {
      const data = d.data || {};
      const label = `${kind === 'tasks' ? 'task' : 'action'} ${d.id}`;
      const fields = [];
      const pic = resolve(data.pic, `${label} PIC`);
      if (pic?.uid) {
        const stored = val(data, 'picUid');
        if (stored == null) {
          fields.push({ key: 'picUid', had: hasOwn(data, 'picUid'), before: stored, after: pic.uid });
          if (val(data, 'picEmail') !== pic.email) fields.push({ key: 'picEmail', had: hasOwn(data, 'picEmail'), before: val(data, 'picEmail'), after: pic.email });
        } else if (stored !== pic.uid) {
          out.mismatch.push({ where: label, name: String(data.pic).trim(), stored, resolved: pic.uid });
        }
      }
      if (kind === 'tasks') {
        const cur = arr(data.contributorUids);
        const add = [];
        for (const c of arr(data.contributors)) {
          const r = resolve(c, `${label} contributor`);
          if (r?.uid && !cur.includes(r.uid) && !add.includes(r.uid)) add.push(r.uid);
        }
        if (add.length) fields.push({ key: 'contributorUids', had: hasOwn(data, 'contributorUids'), before: val(data, 'contributorUids'), after: [...cur, ...add] });
      }
      if (fields.length) {
        changes.push({ kind, id: d.id, name: data.name ?? data.title ?? d.id, status: data.status ?? null, version: data.version ?? 0, fields });
      }
    }
  }
  if (conflicts.length) return { ...out, blocked: [{ code: 'alias-conflict', detail: [...new Set(conflicts)].join('; ') }] };

  // Ruling G: grant read access to everyone this run links (restricted projects only;
  // a department project is readable by every active member already). Never revoked.
  const set = new Set();
  for (const c of changes) {
    for (const f of c.fields) {
      if (f.key === 'picUid') set.add(f.after);
      if (f.key === 'contributorUids') for (const u of f.after) if (!arr(f.before).includes(u)) set.add(u);
    }
  }
  const department = doc.visibility === 'department';
  const union = department ? [] : [...set].sort();
  const grants = {
    union,
    memberUidsAdded: union.filter((u) => !arr(doc.memberUids).includes(u)),
    memberIdsAdded: union.filter((u) => !arr(doc.memberIds).includes(u)),
  };
  if (!grants.memberUidsAdded.length && !grants.memberIdsAdded.length) grants.union = [];

  const ops = changes.length + 2;
  if (ops > MAX_OPS) return { ...out, blocked: [{ code: 'too-many', detail: `${changes.length} docs to change exceed one transaction (${MAX_OPS - 2})` }] };

  const fingerprint = backfillFingerprint(doc, state, changes);
  const noop = !changes.length && !grants.union.length;
  const warnings = { mismatch: out.mismatch, unresolved: out.unresolved, inactive: out.inactive };
  const planHash = hash16({ kind: BACKFILL_KIND, pid, fingerprint, changes, grants, warnings });
  return { ...out, changes, grants, fingerprint, noop, planHash };
}

export function summaryCounts(p) {
  return {
    fixable: p.changes.length,
    grants: p.grants.memberUidsAdded.length,
    mismatch: p.mismatch.length,
    unresolved: p.unresolved.length,
    inactive: p.inactive.length,
    blocked: p.blocked.map((b) => b.code).join(',') || '',
  };
}

const show = (v, had = true) => (!had ? '(absent)' : v == null ? 'null' : Array.isArray(v) ? `[${v.join(', ')}]` : String(v));

export function formatBackfillPreview(p, { nameOfUid = (u) => u } = {}) {
  const L = [`Project:     ${p.pid}${p.projectName ? ` (${p.projectName})` : ''}`];
  if (p.blocked.length) {
    L.push('BLOCKING:', ...p.blocked.map((b) => `  ${b.code}: ${b.detail}`), 'Nothing will be written.');
    return L;
  }
  L.push(`Link uids (${p.changes.length} doc(s); closed items included):`);
  if (!p.changes.length) L.push('  none');
  for (const c of p.changes) {
    L.push(`  ${c.kind === 'tasks' ? 'task' : 'action'} ${c.id} "${c.name}" [${c.status ?? '-'}] version ${c.version} -> ${c.version + 1}`);
    for (const f of c.fields) {
      const after = f.key === 'picUid' ? nameOfUid(f.after) : f.key === 'contributorUids' ? f.after.filter((u) => !arr(f.before).includes(u)).map(nameOfUid).map((n) => `+ ${n}`).join(', ') : show(f.after);
      L.push(`    ${f.key}: ${f.key === 'contributorUids' ? after : `${show(f.before, f.had)} -> ${after}`}`);
    }
  }
  L.push('Access grants (HOD approves; who gains read access):');
  if (!p.grants.union.length) L.push('  none');
  for (const u of p.grants.memberUidsAdded) L.push(`  memberUids + ${nameOfUid(u)}`);
  for (const u of p.grants.memberIdsAdded) L.push(`  memberIds  + ${nameOfUid(u)}`);
  if (p.mismatch.length) L.push('Not changed: stored uid differs from the name (check by hand):', ...p.mismatch.map((m) => `  ${m.where} "${m.name}": stored ${nameOfUid(m.stored)}, name resolves to ${nameOfUid(m.resolved)}`));
  if (p.unresolved.length) L.push('Not changed: name not linkable yet:', ...p.unresolved.map((u) => `  ${u.where} "${u.name}": ${u.reason}`));
  if (p.inactive.length) L.push('Not changed: person is not active:', ...p.inactive.map((u) => `  ${u.where} "${u.name}": ${u.status}`));
  if (p.noop) { L.push('Nothing to change.'); return L; }
  L.push(`Plan hash:   ${p.planHash}  (apply with --apply --expect ${p.planHash})`);
  return L;
}

export function verifyBackfill(p, state) {
  const m = [];
  const byKey = new Map(['tasks', 'actions'].flatMap((k) => arr(state?.[k]).map((d) => [`${k}/${d.id}`, d.data])));
  for (const c of p.changes) {
    const d = byKey.get(`${c.kind}/${c.id}`);
    if (!d) { m.push(`${c.kind}/${c.id} missing`); continue; }
    for (const f of c.fields) if (!isDeepStrictEqual(val(d, f.key), f.after)) m.push(`${c.kind}/${c.id} ${f.key}`);
    if ((d.version ?? 0) !== c.version + 1) m.push(`${c.kind}/${c.id} version ${d.version} !== ${c.version + 1}`);
  }
  for (const k of ['memberUids', 'memberIds']) for (const u of p.grants.union) if (!arr(state?.doc?.[k]).includes(u)) m.push(`${k} missing ${u}`);
  return { ok: !m.length, mismatches: m };
}

// Restore before-values on fields that still hold the applied value; a field changed
// since the apply is skipped. Grants on the project are kept (Ruling G).
export function decideBackfillRollback({ manifest, state }) {
  const out = { pid: manifest?.pid ?? null, blocked: [], restores: [], skipped: [], noop: true, hash: null, fingerprint: null };
  if (!manifest || manifest.kind !== BACKFILL_KIND || typeof manifest.pid !== 'string') {
    return { ...out, blocked: [{ code: 'bad-manifest', detail: `not a ${BACKFILL_KIND} manifest` }] };
  }
  const b = projectBlock(state?.doc, manifest.pid);
  if (b) return { ...out, blocked: [b] };
  const byKey = new Map(['tasks', 'actions'].flatMap((k) => arr(state?.[k]).map((d) => [`${k}/${d.id}`, d.data])));
  const restores = [];
  const skipped = [];
  for (const c of arr(manifest.changes)) {
    const d = byKey.get(`${c.kind}/${c.id}`);
    if (!d) { skipped.push({ where: `${c.kind}/${c.id}`, key: '(doc)', expected: 'present', now: 'missing' }); continue; }
    const fields = [];
    for (const f of arr(c.fields)) {
      const now = val(d, f.key);
      if (isDeepStrictEqual(now, f.after)) fields.push({ key: f.key, had: f.had, before: f.before, now });
      else skipped.push({ where: `${c.kind}/${c.id}`, key: f.key, expected: f.after, now });
    }
    if (fields.length) restores.push({ kind: c.kind, id: c.id, version: d.version ?? 0, fields });
  }
  const docs = arr(manifest.changes).map((c) => ({ kind: c.kind, id: c.id }));
  const fingerprint = backfillFingerprint(state.doc, state, docs);
  const hash = hash16({ kind: `${BACKFILL_KIND}-rollback`, pid: manifest.pid, manifestHash: manifest.planHash ?? null, fingerprint, restores, skipped });
  return { ...out, restores, skipped, fingerprint, hash, noop: !restores.length };
}

export function formatBackfillRollback(r) {
  const L = [`Rollback:    ${r.pid}`];
  if (r.blocked.length) {
    L.push('BLOCKING:', ...r.blocked.map((b) => `  ${b.code}: ${b.detail}`), 'Nothing will be written.');
    return L;
  }
  L.push('Restore (now -> before):');
  if (r.noop) L.push('  none');
  for (const c of r.restores) {
    for (const f of c.fields) L.push(`  ${c.kind}/${c.id} ${f.key} ${show(f.now)} -> ${show(f.before, f.had)}`);
    L.push(`  ${c.kind}/${c.id} version ${c.version} -> ${c.version + 1}`);
  }
  for (const s of r.skipped) L.push(`  SKIP ${s.where} ${s.key}: changed since the apply (expected ${show(s.expected)}, now ${show(s.now)})`);
  L.push('Access:      memberUids / memberIds kept (grants are not revoked)');
  if (r.noop) { L.push('Nothing to roll back.'); return L; }
  L.push(`Plan hash:   ${r.hash}  (apply with --rollback <manifest> --apply --expect ${r.hash})`);
  return L;
}
