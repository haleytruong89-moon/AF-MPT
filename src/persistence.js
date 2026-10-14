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
