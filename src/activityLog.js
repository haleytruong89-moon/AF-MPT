// Plans one activity append so a failed read can never shrink the stored log (H3).
// v2: one event doc per entry, so write only the new entry (plus entries whose earlier write
// failed — W5; the shim skips ids already on the server, so a retry never double-writes).
// v1, read failed (null): write nothing, keep the entry pending for the next append.
// v1, read ok: newest first, pending entries included, capped.
// `entry` may be absent (a retry flush with nothing new): then only pending entries go out.
export function planActivityAppend({ v2, read, pending, entry, cap = 500 }) {
  const fresh = entry ? [entry] : [];
  if (v2) {
    const seen = new Set();
    const write = [...fresh, ...pending].filter((x) => {
      if (!x) return false;
      if (x.id != null) { if (seen.has(x.id)) return false; seen.add(x.id); }
      return true;
    });
    return { write: write.length ? write : null, pending: [], display: null };
  }
  if (read === null) return { write: null, pending: [...fresh, ...pending], display: null };
  const seen = new Set();
  const merged = [...fresh, ...pending, ...read].filter((x) => {
    if (x && x.id != null) { if (seen.has(x.id)) return false; seen.add(x.id); }
    return true;
  }).slice(0, cap);
  return { write: merged, pending: [], display: merged };
}
