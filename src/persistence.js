// B2/B3 persistence decisions (pure). Used by storage-shim.ts and App.jsx.

// A project doc that does not exist yet reads as permission-denied under our
// rules (isMember(null) is false), so both codes mean "create path".
export function classifyReadError(code) {
  return code === 'permission-denied' || code === 'not-found' ? 'missing' : 'fatal';
}

const asRev = (r) => (typeof r === 'number' && Number.isFinite(r) ? r : 0);

// Optimistic concurrency: refuse the write when the server's rev differs from
// the rev this client loaded. A missing rev counts as 0 (legacy docs).
export function checkRevision(serverRev, knownRev, exists) {
  if (!exists) return 'ok';
  return asRev(serverRev) === asRev(knownRev) ? 'ok' : 'conflict';
}

export function nextRev(serverRev) {
  return asRev(serverRev) + 1;
}

// One banner entry per project. 'ok' clears it; 'conflict' is sticky until reload.
export function nextSaveState(prev, pid, status, name) {
  const cur = prev[pid];
  if (status === 'ok') {
    if (!cur) return prev;
    const { [pid]: _drop, ...rest } = prev;
    return rest;
  }
  if (cur && cur.status === 'conflict') return prev;
  if (cur && cur.status === status && cur.name === name) return prev;
  return { ...prev, [pid]: { status, name } };
}

export function hasUnsavedWork(pendingCount, saveState) {
  return pendingCount > 0 || Object.keys(saveState || {}).length > 0;
}

// B3 fix: serialize async jobs per key (e.g. per project id) so a second save
// never pre-reads the doc while the first save's write is still in flight —
// that overlap made a single user see a false "someone else changed it" conflict.
export function createKeyedQueue() {
  const tails = new Map();
  return {
    run(key, job) {
      const prev = tails.get(key) || Promise.resolve();
      const next = prev.then(job, job);
      const tail = next.then(() => undefined, () => undefined);
      tails.set(key, tail);
      tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
      return next;
    },
  };
}

// Flag an explicit owner restore so the shim skips the stale-write guard.
export const FORCE_WRITE_FLAG = '__forceOverwrite';

export function failedRestores(results) {
  return (results || []).filter((r) => r.status !== 'ok').map((r) => r.name);
}

// Banner wording per failure kind (a mixed state must not call an error a conflict).
export function bannerGroups(saveState) {
  const out = { conflict: [], error: [] };
  for (const v of Object.values(saveState || {})) (v.status === 'conflict' ? out.conflict : out.error).push(v.name);
  return out;
}

// B3 debt: the full write decision for one project save, pure so it can run
// inside a Firestore transaction (re-run on contention) and be unit-tested.
// ex = server doc or null (new project); now = the serverTimestamp() sentinel.
// writeId tags each save. A transaction retry that finds its own writeId on the
// server already landed (a lost commit response); pendingWriteIds are earlier saves
// of this client whose result was lost — their rev bump is ours, not a conflict.
const V2_SERVER_KEYS = ['programMeta', 'memberUids', 'visibility', 'schemaVersion'];
export function buildProjectWrite(ex, incoming, { uid, knownRev, force, now, writeId, pendingWriteIds = /** @type {string[]} */ ([]) }) {
  // A v2 project is never written through the v1 path (not even with force).
  if (ex?.schemaVersion === 2) return { readonly: true };
  if (ex && writeId && ex.writeId === writeId) return { conflict: false, newRev: ex.rev, doc: null };
  const baseRev = ex && ex.writeId && pendingWriteIds.includes(ex.writeId) ? ex.rev : knownRev;
  if (!force && checkRevision(ex?.rev, baseRev, ex !== null) === 'conflict') return { conflict: true };
  const newRev = nextRev(ex?.rev);
  const { id: _id, rev: _rev, writeId: _w, programMeta: _pm, memberUids: _mu, visibility: _vis, schemaVersion: _sv, ...body } = incoming;
  // memberIds/roles/relatedParties are edited only via MembersModal: server value wins.
  const doc = {
    ...body,
    relatedParties: ex ? (ex.relatedParties ?? []) : (body.relatedParties ?? []),
    memberIds: ex?.memberIds || [uid],
    roles: ex?.roles || { [uid]: 'owner' },
    createdBy: ex?.createdBy || uid,
    createdAt: ex?.createdAt || now,
    deletedAt: ex?.deletedAt ?? null,
    rev: newRev,
    updatedAt: now,
  };
  // v2 fields are server-owned (Owner-only in rules): copy from ex when present, never from incoming.
  for (const k of V2_SERVER_KEYS) if (ex && ex[k] !== undefined) doc[k] = ex[k];
  if (writeId) doc.writeId = writeId;
  return { conflict: false, newRev, doc };
}
