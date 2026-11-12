// P2.3 v2 save executor. Runs a planV2Save plan against Firestore: one transaction
// per batch, in order (Ruling X: batches[1..] are follow-up single-entry steps on the
// same docs). Wave 2 W1: for a non-Owner the planner splits every batch into chunks
// of at most MAX_WS_PER_CHUNK work streams (saveChunks.js), so batches = [...chunks
// of the main ops, ...chunks of each follow-up step]; the executor runs them in
// order like any batch, and the metaPatch still goes only with the first
// transaction. A failing chunk leaves earlier chunks committed (W1: Retry re-plans
// against the refreshed cache, so only what is still different is written).
// Firestore functions are injected (fs = { runTransaction, doc,
// serverTimestamp, deleteField }) so the emulator test can pass the client SDK of
// @firebase/rules-unit-testing; the shim passes the app's SDK.
//
// Per batch: tx.get the project doc (P2.4 fix round 1: if it is missing or its
// schemaVersion is not 2, e.g. after a rollback, the batch is a conflict and
// writes nothing, so a stale v2 tab gets the reload banner), tx.get every op
// target, then
//   - update: conflict unless the doc exists with version === expectVersion;
//     written as a full-doc set (op.data is the full doc) + version expect+1,
//     updatedBy, updatedAt;
//   - create: conflict if the doc exists; set data (version 1) + updatedBy, updatedAt;
//   - delete: skipped if the doc is already gone; conflict on a version mismatch.
// metaPatch (batch 1 only): tx.update on the project doc + updatedAt. Dotted keys
// (programMeta.<id>.<field>) are field paths, so only those nested fields change.
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

// A whole-map programMeta write (planV2Save fallback for ids/fields that are not safe
// path segments) is built from the tab's possibly stale copy. Keep the live pmUid /
// deputyUid so a stale Owner tab cannot undo a PM/Deputy assigned elsewhere
// (role-assignment spec §7.1 known gap). `next` is the plan's raw value, so a
// deleteField() sentinel in `meta` is never treated as a map. Returns the overlaid plain map (or null when not applicable); never mutates the plan.
function overlayLiveRoles(live, next) {
  const isMap = (o) => o && typeof o === 'object' && !Array.isArray(o);
  if (!isMap(next) || !isMap(live)) return null;
  const merged = {};
  for (const [id, entry] of Object.entries(next)) {
    const cur = live[id];
    if (!isMap(entry) || !isMap(cur)) { merged[id] = entry; continue; }
    const e = { ...entry };
    for (const key of ['pmUid', 'deputyUid']) if (key in cur) e[key] = cur[key];
    merged[id] = e;
  }
  return merged;
}

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
  let metaApplied = plan?.metaPatch || null; // plain-valued (DELETE_FIELD marker kept) so applyWritten can use it

  for (let i = 0; i < count; i++) {
    const ops = batches[i] || [];
    let res;
    try {
      res = await runTransaction(db, async (tx) => {
        const projectSnap = await tx.get(projectRef);
        if (!projectSnap.exists() || projectSnap.data()?.schemaVersion !== 2) return { conflict: true };
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
        let metaOut = plan?.metaPatch;
        if (i === 0 && meta) {
          const merged = overlayLiveRoles(projectSnap.data()?.programMeta, plan.metaPatch.programMeta);
          tx.update(projectRef, { ...meta, ...(merged ? { programMeta: merged } : {}), updatedAt: now });
          if (merged) metaOut = { ...plan.metaPatch, programMeta: merged };
        }
        return { conflict: false, out, metaOut };
      });
    } catch (e) {
      const status = e && e.code === 'permission-denied' ? 'denied' : 'error';
      return { status, written, failedBatch: i, metaWritten, metaPatch: metaApplied, error: e };
    }
    if (res.conflict) return { status: 'conflict', written, failedBatch: i, metaWritten, metaPatch: metaApplied };
    written.push(...res.out);
    if (i === 0 && meta) { metaWritten = true; metaApplied = res.metaOut; }
  }
  return { status: 'ok', written, failedBatch: null, metaWritten, metaPatch: metaApplied };
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
      // Dotted keys (programMeta.<id>[.<field>]) are nested field paths, as in tx.update.
      const path = k.split('.');
      let o = meta;
      for (const p of path.slice(0, -1)) {
        o[p] = o[p] && typeof o[p] === 'object' ? { ...o[p] } : {};
        o = o[p];
      }
      const last = path[path.length - 1];
      if (v === DELETE_FIELD) delete o[last];
      else o[last] = v;
    }
    loaded.meta = meta;
  }
  return loaded;
}
