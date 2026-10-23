// Shared apply/rollback for Admin SDK scripts (P1 directory, P2 ownerUids, ...).
// applyWrites records the previous content of every path in a manifest, hands
// it to writeManifest BEFORE the first write, then writes. rollbackManifest
// undoes a manifest; it is idempotent. To undo several runs, roll back in
// reverse order (newest manifest first).

// Firestore Timestamps do not survive JSON; tag them so rollback can restore them.
export function toJsonable(v, Timestamp) {
  if (v instanceof Timestamp) return { __ts: [v.seconds, v.nanoseconds] };
  if (Array.isArray(v)) return v.map((x) => toJsonable(x, Timestamp));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJsonable(x, Timestamp)]));
  return v;
}
export function revive(v, Timestamp) {
  if (Array.isArray(v)) return v.map((x) => revive(x, Timestamp));
  if (v && typeof v === 'object') {
    if (Array.isArray(v.__ts) && Object.keys(v).length === 1) return new Timestamp(v.__ts[0], v.__ts[1]);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x, Timestamp)]));
  }
  return v;
}

// writes: Array<{ path, data, merge? }>.
// - merge falsy: set(data) replaces the doc. Rollback restores the full
//   before-image (or deletes the doc if it did not exist).
// - merge true: set(data, {merge:true}) changes only the top-level keys of data.
//   The manifest records those keys in `fields` and only their previous
//   values in `before`; rollback restores ONLY
//   them (previous value, or field delete if absent). Restoring the whole
//   before-image would silently revert anything clients wrote to the same doc
//   after the apply (e.g. userPreferences on workspaces/main).
export async function applyWrites(db, writes, { Timestamp, writeManifest }) {
  const entries = [];
  for (const w of writes) {
    const snap = await db.doc(w.path).get();
    const data = snap.exists ? snap.data() : null;
    if (w.merge) {
      // Only the written fields' previous values (a field absent before is
      // simply missing from `before`); the rest of the doc is not recorded.
      const fields = Object.keys(w.data);
      const before = {};
      for (const f of fields) if (data && f in data) before[f] = toJsonable(data[f], Timestamp);
      entries.push({ path: w.path, merge: true, fields, before });
    } else {
      entries.push({ path: w.path, before: data ? toJsonable(data, Timestamp) : null });
    }
  }
  writeManifest({ createdAt: new Date().toISOString(), entries });
  for (const w of writes) {
    if (w.merge) await db.doc(w.path).set(w.data, { merge: true });
    else await db.doc(w.path).set(w.data);
  }
  return { written: writes.length };
}

export async function rollbackManifest(db, manifest, { FieldValue, Timestamp }) {
  if (manifest.entries.some((e) => e.merge) && !FieldValue?.delete) {
    throw new Error('rollbackManifest: FieldValue is required to roll back merge writes');
  }
  let restored = 0, deleted = 0;
  for (const e of manifest.entries) {
    const ref = db.doc(e.path);
    if (e.merge) {
      const before = e.before || {};
      const patch = {};
      for (const f of e.fields) patch[f] = f in before ? revive(before[f], Timestamp) : FieldValue.delete();
      await ref.set(patch, { merge: true });
      restored++;
    } else if (e.before) {
      await ref.set(revive(e.before, Timestamp));
      restored++;
    } else {
      await ref.delete();
      deleted++;
    }
  }
  return { restored, deleted };
}
