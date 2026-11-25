// G1 (spec docs/superpowers/specs/2026-11-25-credit-by-year-design.md): pure planner for
// scripts/p2-backfill-closed-at.mjs. Gives a close date (approvedAt) to Completed / Dropped
// tasks closed before P3.1, from the project's Activity, else from the planned end date.
import { isDeepStrictEqual } from 'node:util';
import { hash16, projectBlock } from './backfill-plan.mjs';

export const CLOSEDAT_KIND = 'p2-backfill-closed-at';
export const CLOSEDAT_STAMP = 'p2-backfill-closed-at';
export const MAX_OPS = 450;
const arr = (v) => (Array.isArray(v) ? v : []);
const CLOSED = new Set(['Completed', 'Dropped']);

/** ISO time of an activity event: createdAt (Timestamp / Date / ISO) else timestamp. */
export function eventTime(data) {
  const c = data?.createdAt;
  if (c && typeof c.toDate === 'function') return c.toDate().toISOString();
  if (c instanceof Date) return c.toISOString();
  if (typeof c === 'string' && !Number.isNaN(Date.parse(c))) return new Date(c).toISOString();
  if (typeof data?.timestamp === 'string' && !Number.isNaN(Date.parse(data.timestamp))) return new Date(data.timestamp).toISOString();
  return null;
}

/** End of the planned end day in Vietnam (23:59:59 UTC+7). */
export function endOfDayVn(end) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(end || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}T16:59:59.000Z` : null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function taskFingerprint(tasks, ids) {
  const byId = new Map(arr(tasks).map((t) => [t.id, t.data]));
  return Object.fromEntries([...ids].sort().map((id) => [id, byId.has(id) ? { version: byId.get(id)?.version ?? 0, approvedAt: byId.get(id)?.approvedAt ?? null } : null]));
}

/**
 * state = { doc, tasks: [{id, data}], activity: [{id, data}] }
 * -> { blocked, changes: [{ id, name, status, version, approvedAt, source }], unknown, counts, fingerprint, noop, planHash }
 */
export function planClosedAt({ pid, state }) {
  const out = { pid, projectName: state?.doc?.name ?? null, blocked: [], changes: [], unknown: [], counts: { activity: 0, endDate: 0, unknown: 0 }, fingerprint: null, noop: true, planHash: null };
  const b = projectBlock(state?.doc, pid);
  if (b) return { ...out, blocked: [b] };
  const tasks = arr(state.tasks);
  const nameCount = new Map();
  for (const t of tasks) { const n = t.data?.name || ''; nameCount.set(n, (nameCount.get(n) || 0) + 1); }
  const events = arr(state.activity).map((a) => ({ text: typeof a.data?.description === 'string' ? a.data.description : '', at: eventTime(a.data) })).filter((e) => e.text && e.at);

  for (const t of tasks) {
    const d = t.data || {};
    if (!CLOSED.has(d.status) || d.approvedAt) continue;
    const name = d.name || '';
    let approvedAt = null;
    let source = null;
    if (name) {
      const re = new RegExp(`"${escapeRe(name)}".*→ ${d.status}(\\b|$)`);
      const hits = events.filter((e) => re.test(e.text)).map((e) => e.at).sort();
      // A name shared by several tasks: the line cannot be tied to this task; its date still
      // gives the right year, but the day is approximate (never counted as on time / late).
      if (hits.length) { approvedAt = hits[hits.length - 1]; source = nameCount.get(name) === 1 ? 'activity' : 'activity-shared-name'; }
    }
    if (!approvedAt) {
      const e = endOfDayVn(d.end);
      if (e) { approvedAt = e; source = 'end-date'; }
    }
    if (!approvedAt) { out.unknown.push({ id: t.id, name, status: d.status }); continue; }
    out.changes.push({ id: t.id, name, status: d.status, version: d.version ?? 0, approvedAt, source });
  }
  out.changes.sort((a, b) => a.approvedAt.localeCompare(b.approvedAt));
  out.counts = {
    activity: out.changes.filter((c) => c.source === 'activity').length,
    sharedName: out.changes.filter((c) => c.source === 'activity-shared-name').length,
    endDate: out.changes.filter((c) => c.source === 'end-date').length,
    unknown: out.unknown.length,
  };
  if (out.changes.length + 2 > MAX_OPS) return { ...out, blocked: [{ code: 'too-many', detail: `${out.changes.length} tasks exceed one transaction` }] };
  const fingerprint = taskFingerprint(tasks, out.changes.map((c) => c.id));
  const noop = out.changes.length === 0;
  const planHash = hash16({ kind: CLOSEDAT_KIND, pid, fingerprint, changes: out.changes, unknown: out.unknown });
  return { ...out, fingerprint, noop, planHash };
}

export function formatClosedAtPreview(p) {
  const L = [`Project:     ${p.pid}${p.projectName ? ` (${p.projectName})` : ''}`];
  if (p.blocked.length) { L.push('BLOCKING:', ...p.blocked.map((b) => `  ${b.code}: ${b.detail}`), 'Nothing will be written.'); return L; }
  L.push(`Closed date to write (${p.changes.length}): ${p.counts.activity} from Activity, ${p.counts.sharedName} from Activity with a shared task name (approximate day), ${p.counts.endDate} from the planned end date`);
  const label = { activity: 'activity      ', 'activity-shared-name': 'activity~name ', 'end-date': 'end date      ' };
  for (const c of p.changes) L.push(`  ${c.approvedAt.slice(0, 10)}  ${label[c.source]}  [${c.status}]  ${c.name}`);
  if (p.unknown.length) L.push('Not written (no Activity line and no end date):', ...p.unknown.map((u) => `  [${u.status}] ${u.name}`));
  if (p.noop) { L.push('Nothing to change.'); return L; }
  L.push(`Plan hash:   ${p.planHash}  (apply with --apply --expect ${p.planHash})`);
  return L;
}

export function verifyClosedAt(p, tasks) {
  const byId = new Map(arr(tasks).map((t) => [t.id, t.data]));
  const m = [];
  for (const c of p.changes) {
    const d = byId.get(c.id);
    if (!d) { m.push(`${c.id} missing`); continue; }
    if (d.approvedAt !== c.approvedAt) m.push(`${c.id} approvedAt`);
    if (d.approvedAtSource !== c.source) m.push(`${c.id} approvedAtSource`);
    if ((d.version ?? 0) !== c.version + 1) m.push(`${c.id} version`);
  }
  return { ok: !m.length, mismatches: m };
}

/** Rollback: remove the written fields where they still hold the applied value. */
export function decideClosedAtRollback({ manifest, state }) {
  const out = { pid: manifest?.pid ?? null, blocked: [], restores: [], skipped: [], noop: true, hash: null };
  if (!manifest || manifest.kind !== CLOSEDAT_KIND || typeof manifest.pid !== 'string') return { ...out, blocked: [{ code: 'bad-manifest', detail: `not a ${CLOSEDAT_KIND} manifest` }] };
  const b = projectBlock(state?.doc, manifest.pid);
  if (b) return { ...out, blocked: [b] };
  const byId = new Map(arr(state.tasks).map((t) => [t.id, t.data]));
  for (const c of arr(manifest.changes)) {
    const d = byId.get(c.id);
    if (!d) { out.skipped.push({ id: c.id, why: 'task missing' }); continue; }
    if (!isDeepStrictEqual(d.approvedAt, c.approvedAt) || d.approvedAtSource !== c.source) { out.skipped.push({ id: c.id, why: 'changed since the apply' }); continue; }
    out.restores.push({ id: c.id, name: c.name, version: d.version ?? 0 });
  }
  const fingerprint = taskFingerprint(arr(state.tasks), arr(manifest.changes).map((c) => c.id));
  out.hash = hash16({ kind: `${CLOSEDAT_KIND}-rollback`, pid: manifest.pid, manifestHash: manifest.planHash ?? null, fingerprint, restores: out.restores, skipped: out.skipped });
  out.noop = !out.restores.length;
  return out;
}
