// Wave 2 A2 (R3): what a v2 activity event document may carry. The rules
// (firestore.rules, activity/{eid} create) hold the same allow-list; keep the two in sync.
// The author is never a stored name: the writer's uid is stamped, the reader looks the
// name up in the People directory, and the time is the server's createdAt.
export const ACTIVITY_KEYS = [
  'id', 'type', 'description', 'before', 'after',
  'programId', 'workstreamId', 'projectId', 'workspaceId', 'authorUid', 'createdAt',
];

// Mirrors the rule's description <= 2000 (user text such as reject reasons and renamed titles is unbounded).
export const ACTIVITY_DESCRIPTION_MAX = 2000;

/** Document body for a new event (caller adds createdAt: serverTimestamp()). */
export function activityDocFor(entry, uid) {
  const out = {};
  for (const k of ACTIVITY_KEYS) {
    if (k === 'authorUid' || k === 'createdAt') continue;
    if (entry && entry[k] !== undefined) out[k] = entry[k];
  }
  if (typeof out.description === 'string' && out.description.length > ACTIVITY_DESCRIPTION_MAX) {
    out.description = out.description.slice(0, ACTIVITY_DESCRIPTION_MAX - 1) + '…';
  }
  out.authorUid = uid;
  return out;
}

/**
 * Feed entry from a stored event. Events copied from v1 (no authorUid) keep their
 * stored author and timestamp. createdAt may be a Firestore Timestamp or a Date.
 */
export function activityEntryFromDoc(data, id, nameOfUid) {
  const { createdAt, ...e } = data || {};
  if (createdAt && typeof createdAt.toDate === 'function') e.timestamp = createdAt.toDate().toISOString();
  else if (createdAt instanceof Date) e.timestamp = createdAt.toISOString();
  if (e.authorUid && typeof nameOfUid === 'function') {
    const name = nameOfUid(e.authorUid);
    if (name) e.author = name;
  }
  // Never blank: directory name, else stored author, else stored email, else a label.
  if (typeof e.author !== 'string' || !e.author.trim()) e.author = e.authorEmail || 'Unknown';
  if (e.id == null) e.id = id;
  return e;
}
