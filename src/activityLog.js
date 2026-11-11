// Plans one activity append so a failed read can never shrink the stored log (H3).
// v2: one event doc per entry, so write only the new entry.
// v1, read failed (null): write nothing, keep the entry pending for the next append.
// v1, read ok: newest first, pending entries included, capped.
export function planActivityAppend({ v2, read, pending, entry, cap = 500 }) {
  if (v2) return { write: [entry], pending: [], display: null };
  if (read === null) return { write: null, pending: [entry, ...pending], display: null };
  const merged = [entry, ...pending, ...read].slice(0, cap);
  return { write: merged, pending: [], display: merged };
}
