// Role assignment executor (PM / Deputy per program, Sub-PM per workstream).
// One transaction with a "changed since you looked" check. Firestore functions are
// injected (fs = { runTransaction, doc, serverTimestamp, arrayUnion }) like
// execV2Save.js, so the emulator test can pass the rules-unit-testing SDK.
//
// change = { kind: 'pm' | 'deputy' | 'lead', programId, wsId?, fromUid, toUid }
//   pm / deputy -> project programMeta.<programId>.pmUid / deputyUid (Owner-only by rules)
//   lead        -> workstreams/{wsId}.leadUid, version + 1, updatedBy (Owner or active PM / Deputy)
// addMemberUid (Owner only; the caller decides): when not in live memberUids, the
//   project update also adds it to memberUids / memberIds and sets roles.<u> = 'member'
//   unless a roles entry already exists.
//
// -> { status: 'ok' | 'changed' | 'conflict' | 'denied' | 'error', ws?: { version, data } }
//   changed  = the live role holder is not fromUid (someone else changed it)
//   conflict = project missing / not v2, program gone from programMeta, or ws missing
//   ws       = (lead only) the written ws doc without the updatedAt sentinel, for the cache
const FIELD = { pm: 'pmUid', deputy: 'deputyUid', lead: 'leadUid' };
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const safe = (id) => typeof id === 'string' && SAFE_ID.test(id);

/**
 * @param {*} fs
 * @param {{ db: *, wid: string, pid: string, uid: string, change: *, addMemberUid?: string | null }} args
 */
export async function executeRoleChange(fs, { db, wid, pid, uid, change, addMemberUid = null }) {
  const { runTransaction, doc, serverTimestamp, arrayUnion } = fs;
  const { kind, programId, wsId } = change || {};
  const field = FIELD[kind];
  const fromUid = change?.fromUid ?? null;
  const toUid = change?.toUid ?? null;
  // programId / wsId become field-path segments or doc ids: refuse anything unsafe.
  if (!field || !safe(programId) || (kind === 'lead' && !safe(wsId))) {
    return { status: 'error', error: new Error('executeRoleChange: bad change') };
  }
  if (addMemberUid != null && !safe(addMemberUid)) {
    return { status: 'error', error: new Error('executeRoleChange: bad addMemberUid') };
  }

  const projectRef = doc(db, 'workspaces', wid, 'projects', pid);
  try {
    return await runTransaction(db, async (tx) => {
      const projectSnap = await tx.get(projectRef);
      const p = projectSnap.exists() ? projectSnap.data() : null;
      if (!p || p.schemaVersion !== 2) return { status: 'conflict' };

      const now = serverTimestamp();
      const projectPatch = {};
      if (addMemberUid && !(Array.isArray(p.memberUids) && p.memberUids.includes(addMemberUid))) {
        projectPatch.memberUids = arrayUnion(addMemberUid);
        projectPatch.memberIds = arrayUnion(addMemberUid);
        if (!(p.roles && typeof p.roles === 'object' && addMemberUid in p.roles)) {
          projectPatch[`roles.${addMemberUid}`] = 'member';
        }
      }

      if (kind === 'lead') {
        const wsRef = doc(db, 'workspaces', wid, 'projects', pid, 'workstreams', wsId);
        const wsSnap = await tx.get(wsRef);
        if (!wsSnap.exists()) return { status: 'conflict' };
        const live = wsSnap.data();
        // A stale view of a ws moved to another program: the caller checked rights for the old program.
        if ((live.programId ?? null) !== programId) return { status: 'changed' };
        if ((live.leadUid ?? null) !== fromUid) return { status: 'changed' };
        const v = typeof live.version === 'number' ? live.version : 0;
        const stamp = { leadUid: toUid, version: v + 1, updatedBy: uid };
        tx.update(wsRef, { ...stamp, updatedAt: now });
        if (Object.keys(projectPatch).length) tx.update(projectRef, { ...projectPatch, updatedAt: now });
        const { updatedAt: _ts, ...rest } = live;
        return { status: 'ok', ws: { version: v + 1, data: { ...rest, ...stamp } } };
      }

      const entry = p.programMeta?.[programId];
      if (!entry || typeof entry !== 'object') return { status: 'conflict' };
      if ((entry[field] ?? null) !== fromUid) return { status: 'changed' };
      tx.update(projectRef, { [`programMeta.${programId}.${field}`]: toUid, ...projectPatch, updatedAt: now });
      return { status: 'ok' };
    });
  } catch (e) {
    return { status: e && e.code === 'permission-denied' ? 'denied' : 'error', error: e };
  }
}
