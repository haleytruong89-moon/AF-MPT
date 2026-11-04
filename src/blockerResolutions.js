// P3 Task 8 (Ruling P3-8, closes Ruling W): blocker resolutions on v2 task docs
// live in an append-only map `blockerResolutions[updateId] = { resolvedAt,
// resolvedBy, resolution, authorUid }` (rules: one added key per write,
// authorUid == caller; deleting or nulling the map is denied for everyone).
// App.jsx keeps resolving in place on the `updates` entry, so:
//  - the read path folds the map into the matching entries (foldResolutions);
//  - the planner moves an in-place resolution of a stored, unresolved entry back
//    into the map and restores the raw entry (unfoldResolutions).
// Legacy in-place resolutions (stored on the entry) and id-less entries are left
// as they are. Pure functions, no mutation of inputs.

export const RESOLUTION_FIELDS = ['resolvedAt', 'resolvedBy', 'resolution'];

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const unresolved = (e) => e.resolvedAt == null;

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Merge the map into the matching unresolved `updates` entries; drop the map. */
export function foldResolutions(task) {
  if (!isObj(task) || !hasOwn(task, 'blockerResolutions')) return task;
  const { blockerResolutions: map, ...out } = task;
  if (!isObj(map) || !Array.isArray(out.updates)) return out;
  out.updates = out.updates.map((u) => {
    if (!isObj(u) || u.id == null || !unresolved(u)) return u;
    const v = map[String(u.id)];
    if (!isObj(v)) return u;
    const merged = { ...u };
    for (const f of RESOLUTION_FIELDS) if (hasOwn(v, f)) merged[f] = v[f];
    return merged;
  });
  return out;
}

const pick = (o) => {
  const out = {};
  for (const f of RESOLUTION_FIELDS) if (hasOwn(o, f)) out[f] = o[f];
  return out;
};

/**
 * Inverse of foldResolutions for a save. storedRaw = the stored task doc data,
 * nextFolded = the task data from the App tree. Each next entry whose stored entry
 * (same id) is unresolved but carries a resolution gets its raw form back; the
 * resolution goes to blockerResolutions[id] (unchanged when it equals the stored
 * value, else { ...fields, authorUid: cur.authorUid ?? uid }: an edit keeps the
 * original resolver). The map is emitted only when it is
 * non-empty or was stored (a stored map is always re-sent; never null / {} created).
 */
export function unfoldResolutions(storedRaw, nextFolded, uid) {
  const stored = isObj(storedRaw) ? storedRaw : {};
  const out = { ...nextFolded };
  delete out.blockerResolutions;
  const hadMap = hasOwn(stored, 'blockerResolutions');
  const storedMap = isObj(stored.blockerResolutions) ? stored.blockerResolutions : {};
  const map = { ...storedMap };
  let changed = false;

  if (Array.isArray(out.updates) && Array.isArray(stored.updates)) {
    const byId = new Map();
    for (const s of stored.updates) {
      if (isObj(s) && s.id != null && !byId.has(String(s.id))) byId.set(String(s.id), s);
    }
    out.updates = out.updates.map((e) => {
      if (!isObj(e) || e.id == null || unresolved(e)) return e;
      const key = String(e.id);
      const s = byId.get(key);
      if (!s || !unresolved(s)) return e; // new entry, or legacy in-place resolution
      const fields = pick(e);
      const cur = map[key];
      if (!(isObj(cur) && same(pick(cur), fields))) {
        // An edit keeps the original resolver; a new key is stamped with the caller.
        map[key] = { ...fields, authorUid: (isObj(cur) ? cur.authorUid : undefined) ?? uid };
        changed = true;
      }
      const raw = { ...e };
      for (const f of RESOLUTION_FIELDS) {
        if (hasOwn(s, f)) raw[f] = s[f];
        else delete raw[f];
      }
      return raw;
    });
  }

  if (changed) out.blockerResolutions = map;
  else if (hadMap) out.blockerResolutions = stored.blockerResolutions;
  return out;
}

/** Keys of next's map that the stored map lacks, oldest resolvedAt first. */
export function newResolutionKeys(storedRaw, next) {
  const o = isObj(storedRaw?.blockerResolutions) ? storedRaw.blockerResolutions : {};
  const n = isObj(next?.blockerResolutions) ? next.blockerResolutions : {};
  const at = (k) => String(n[k]?.resolvedAt ?? '');
  return Object.keys(n).filter((k) => !hasOwn(o, k))
    .sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : a < b ? -1 : a > b ? 1 : 0));
}
