// P2.3 v2 save executor. Runs a planV2Save plan against Firestore: one transaction
// per batch, in order (Ruling X: batches[1..] are follow-up single-entry steps on the
// same docs). Firestore functions are injected (fs = { runTransaction, doc,
// serverTimestamp, deleteField }) so the emulator test can pass the client SDK of
// @firebase/rules-unit-testing; the shim passes the app's SDK.
//
// Per batch: tx.get every op target, then
//   - update: conflict unless the doc exists with version === expectVersion;
//     written as a full-doc set (op.data is the full doc) + version expect+1,
//     updatedBy, updatedAt;
//   - create: conflict if the doc exists; set data (version 1) + updatedBy, updatedAt;
//   - delete: skipped if the doc is already gone; conflict on a version mismatch.
// metaPatch (batch 1 only): tx.update on the project doc + updatedAt.
// A conflict writes nothing in that batch. Rules denial of any write fails the whole
// batch (Firestore transactions are atomic) -> 'denied'.
//
// -> { status: 'ok' | 'conflict' | 'denied' | 'error', written, failedBatch, metaWritten }
//    written = [{ kind, op, id, version, data }] for committed batches (data / version
//    null for deletes; data excludes the updatedAt sentinel). A later batch failing
//    leaves earlier batches committed (partial append accepted per Ruling X).
import { DELETE_FIELD } from './planV2Save.js';

const versionOf = (snap) => {
  const v = snap.exists() ? snap.data()?.version : undefined;
  return typeof v === 'number' ? v : 0;
};

export async function executeV2Save(fs, { db, wid, pid, uid, plan }) {
  const { runTransaction, doc, serverTimestamp, deleteField } = fs;
  const projectRef = doc(db, 'workspaces', wid, 'projects', pid);
  const refOf = (op) => doc(db, 'workspaces', wid, 'projects', pid, op.kind, op.id);
  const batches = plan?.batches || [];
  let meta = null;
  if (plan?.metaPatch) {
    meta = {};
    for (const [k, v] of Object.entries(plan.metaPatch)) meta[k] = v === DELETE_FIELD ? deleteField() : v;
  }
  const count = Math.max(batches.length, meta ? 1 : 0);
  const written = [];
  let metaWritten = false;

  for (let i = 0; i < count; i++) {
    const ops = batches[i] || [];
    let res;
    try {
      res = await runTransaction(db, async (tx) => {
        const snaps = [];
        for (const op of ops) snaps.push(await tx.get(refOf(op)));
        for (let k = 0; k < ops.length; k++) {
          const op = ops[k];
          const exists = snaps[k].exists();
          if (op.op === 'update' && (!exists || versionOf(snaps[k]) !== op.expectVersion)) return { conflict: true };
          if (op.op === 'create' && exists) return { conflict: true };
          if (op.op === 'delete' && exists && versionOf(snaps[k]) !== op.expectVersion) return { conflict: true };
        }
        const now = serverTimestamp();
        const out = [];
        ops.forEach((op, k) => {
          const ref = refOf(op);
          if (op.op === 'delete') {
            // Already gone: nothing to delete, but record it so the cache drops the stale entry.
            if (snaps[k].exists()) tx.delete(ref);
            out.push({ kind: op.kind, op: 'delete', id: op.id, version: null, data: null });
            return;
          }
          const version = op.op === 'create' ? 1 : op.expectVersion + 1;
          const data = { ...op.data, version, updatedBy: uid };
          tx.set(ref, { ...data, updatedAt: now });
          out.push({ kind: op.kind, op: op.op, id: op.id, version, data });
        });
        if (i === 0 && meta) tx.update(projectRef, { ...meta, updatedAt: now });
        return { conflict: false, out };
      });
    } catch (e) {
      const status = e && e.code === 'permission-denied' ? 'denied' : 'error';
      return { status, written, failedBatch: i, metaWritten, error: e };
    }
    if (res.conflict) return { status: 'conflict', written, failedBatch: i, metaWritten };
    written.push(...res.out);
    if (i === 0 && meta) metaWritten = true;
  }
  return { status: 'ok', written, failedBatch: null, metaWritten };
}

// Refresh the shim's loaded cache ({ meta, docs: { kind: Map<id, { version, data }> } })
// in place from executeV2Save's `written` (+ the metaPatch when it was committed).
export function applyWritten(loaded, written, metaPatch = null) {
  for (const w of written || []) {
    const m = loaded.docs[w.kind];
    if (!m) continue;
    if (w.op === 'delete') m.delete(w.id);
    else m.set(w.id, { version: w.version, data: w.data });
  }
  if (metaPatch) {
    const meta = { ...loaded.meta };
    for (const [k, v] of Object.entries(metaPatch)) {
      if (v === DELETE_FIELD) delete meta[k];
      else meta[k] = v;
    }
    loaded.meta = meta;
  }
  return loaded;
}
