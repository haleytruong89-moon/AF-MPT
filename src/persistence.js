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
