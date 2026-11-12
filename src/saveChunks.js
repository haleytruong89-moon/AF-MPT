// Wave 2 W1: non-Owner v2 saves run in transactions of at most MAX_WS_PER_CHUNK
// work streams. Firestore allows 20 rules access calls (get / exists, the same
// document counted once) per transaction. Every non-Owner write reads the
// workspace doc, members/{me} and the project doc (3); the rest is one work-stream
// doc per distinct work stream the rules look at (see the get() comments per op
// kind in firestore.rules). 3 + 8 stays well under 20.
// Owner saves are not chunked (the Owner branch reads no work-stream doc,
// tests/rules/v2-p3-owner-budget.test.js).

// The single knob: lower it here if the CRP emulator test shows 8 is refused.
export const MAX_WS_PER_CHUNK = 8;

const str = (v) => (typeof v === 'string' && v ? v : null);

/**
 * Work streams whose doc the rules may read for op (stored = the stored doc data
 * for an update / delete, undefined for a create):
 * - workstreams: the doc itself;
 * - tasks / actions: data.workstreamId and, on an update / delete, the stored one
 *   (a move counts both: rules read the old and the new ws);
 * - raid / decisions: the Sub-PM claim viaWorkstreamId of the new data, and for
 *   decisions the stored claim's viaWorkstreamId (decisionProgram(resource.data)
 *   reads it to resolve the stored program).
 * -> distinct ids (possibly empty).
 */
export function wsTouched(op, stored) {
  const d = op.data || {};
  const s = stored || {};
  const out = [];
  if (op.kind === 'workstreams') out.push(op.id);
  else if (op.kind === 'tasks' || op.kind === 'actions') out.push(str(d.workstreamId), str(s.workstreamId));
  else if (op.kind === 'raid') out.push(str(d.viaWorkstreamId));
  else if (op.kind === 'decisions') out.push(str(d.viaWorkstreamId), str(s.viaWorkstreamId));
  return [...new Set(out.filter(Boolean))];
}

/**
 * Split one batch of ops into chunks of at most `max` distinct work streams.
 * wsOf(op) -> string | string[] | null. Ops sharing a work stream (directly or
 * through a move / claim that names two) stay in one chunk; a chunk keeps the
 * original op order; ops with no work stream go in the first chunk. A group that
 * alone names more than `max` work streams becomes its own chunk (cannot split).
 * -> Op[][] (no empty chunks; [] for no ops).
 */
export function chunkOpsByWorkstream(ops, wsOf, max = MAX_WS_PER_CHUNK) {
  if (!ops.length) return [];
  const lists = ops.map((op) => {
    const w = wsOf(op);
    return [...new Set((Array.isArray(w) ? w : [w]).filter((x) => typeof x === 'string' && x))];
  });
  // Union-find over work-stream ids. Limit: ops touching several WS chain them into one
  // chunk (transitively), so a chain of such ops can exceed the cap; the CRP test covers it.
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
    return x;
  };
  for (const l of lists) {
    for (const w of l) if (!parent.has(w)) parent.set(w, w);
    for (let i = 1; i < l.length; i++) {
      const a = find(l[0]);
      const b = find(l[i]);
      if (a !== b) parent.set(b, a);
    }
  }
  // Groups in order of first appearance, each with its distinct work streams.
  const groups = new Map(); // root -> Set<ws>
  for (const l of lists) {
    for (const w of l) {
      const r = find(w);
      if (!groups.has(r)) groups.set(r, new Set());
      groups.get(r).add(w);
    }
  }
  // First fit: each group goes in the first chunk with room.
  const chunkWs = []; // number of ws per chunk
  const chunkOf = new Map(); // root -> chunk index
  for (const [root, set] of groups) {
    let c = chunkWs.findIndex((n) => n + set.size <= max);
    if (c < 0) { c = chunkWs.length; chunkWs.push(0); }
    chunkWs[c] += set.size;
    chunkOf.set(root, c);
  }
  const chunks = Array.from({ length: Math.max(1, chunkWs.length) }, () => []);
  ops.forEach((op, i) => {
    const l = lists[i];
    chunks[l.length ? chunkOf.get(find(l[0])) : 0].push(op);
  });
  return chunks.filter((c) => c.length);
}

// Wave 2 W2: deep equality for project-doc fields compared between the loaded
// copy and the live doc inside a transaction. Firestore Timestamps (anything with
// toMillis) compare by millis; undefined only equals undefined (absent field).
export function stableEqual(a, b) {
  if (a === b) return true;
  const isTs = (v) => v && typeof v === 'object' && typeof v.toMillis === 'function';
  if (isTs(a) || isTs(b)) return !!(isTs(a) && isTs(b)) && a.toMillis() === b.toMillis();
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => stableEqual(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length
      && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && stableEqual(a[k], b[k]));
  }
  return false;
}
