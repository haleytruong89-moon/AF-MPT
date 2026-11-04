// Workspace-owner helpers (B1). Pure functions; owner identity is a verified
// email compared case-insensitively. Display names are never accepted.

const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

// Same domain rule as firestore.rules newOwnerIsValid().
const isDomainEmail = (email) => /@smartosc\.com$/.test(email);

// Owner-only fields of workspaces/main.
// OWNER_FIELDS + ADMIN_ONLY_FIELDS = ownerFields() in firestore.rules.
export const OWNER_FIELDS = ['workspaceOwner', 'ownershipLog', 'defaultView'];
export const OWNER_WRITE_FLAG = '__ownerFieldsWrite';
// Owner-only in the rules too, but never written by the client at all.
export const ADMIN_ONLY_FIELDS = ['ownerUids'];

// Shape a meta object for persistence. Ordinary writes (any user, possibly a
// stale in-memory copy) never carry owner fields — merge:true keeps the stored
// values. Only writes flagged with OWNER_WRITE_FLAG (changeOwnership,
// setWorkspaceDefaultView) include them; the flag itself is never stored.
export function metaForWrite(incoming) {
  const out = { ...(incoming || {}) };
  const ownerWrite = out[OWNER_WRITE_FLAG] === true;
  delete out[OWNER_WRITE_FLAG];
  if (!ownerWrite) for (const f of OWNER_FIELDS) delete out[f];
  // ownerUids (P2.1) is owner-only in firestore.rules but written only by
  // scripts/p2-set-owner-uids.mjs. The client never echoes it back: a stale
  // copy would be rejected for non-owners and could revert it for owners.
  for (const f of ADMIN_ONLY_FIELDS) delete out[f];
  return out;
}

// P2.1: once scripts/p2-set-owner-uids.mjs has set ownerUids, an in-app
// transfer (which only changes workspaceOwner) would leave the old owner in
// ownerUids. Transfer is admin-only until P2.5.
export const TRANSFER_LOCKED_MESSAGE =
  'Ownership transfer is handled by an admin until the permission upgrade finishes (P2.5).';
export function transferLocked(meta) {
  return Array.isArray(meta?.ownerUids) && meta.ownerUids.length > 0;
}

export function isWorkspaceOwnerEmail(workspaceOwner, email) {
  const owner = norm(workspaceOwner);
  const me = norm(email);
  return owner !== '' && me !== '' && owner.includes('@') && owner === me;
}

export function transferCandidates(projects, teamMembers, currentOwner) {
  const owner = norm(currentOwner);
  const byEmail = new Map();
  const add = (m) => {
    const email = norm(m && m.email);
    if (!email || !isDomainEmail(email) || email === owner || byEmail.has(email)) return;
    byEmail.set(email, { name: m.name || email, email });
  };
  for (const p of Object.values(projects || {})) for (const m of p.teamMembers || []) add(m);
  for (const m of teamMembers || []) add(m);
  return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * P3.1 M9: the workspace ownerUids after a read. meta = the workspace doc data, or
 * null when the read failed; last = the list from the last successful read. A failed
 * read keeps the last known list (an Owner never loses Owner buttons / roles to a
 * transient error); a successful read is authoritative ([] when unset).
 * @param {Record<string, unknown> | null} meta
 * @param {string[] | undefined} last
 * @returns {string[]}
 */
export function ownerUidsAfterRead(meta, last) {
  if (!meta) return Array.isArray(last) ? last : [];
  return Array.isArray(meta.ownerUids) ? meta.ownerUids.filter((u) => typeof u === 'string') : [];
}
