// Strict start-up read of workspace meta. Distinguishes a truly missing doc
// (safe to seed) from a failed read (must never seed or write).
export async function loadMetaStrict(storage) {
  let r;
  try {
    r = await storage.get('workspace:meta', true);
  } catch {
    return { status: 'error', meta: null };
  }
  if (!r) return { status: 'missing', meta: null };
  try {
    return { status: 'ok', meta: JSON.parse(r.value) };
  } catch {
    return { status: 'error', meta: null };
  }
}
