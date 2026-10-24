// P2.2: v2 read path (pure). Turns sub-collection snapshots ({ id, data } lists)
// back into the v1 in-memory tree. No Firestore imports: the shim does the reads.
import { assembleProject } from './migrateV2.js';

/** @typedef {{ id: string, data: Record<string, any> }} Snap */

/**
 * @param {{ meta: Record<string, any>, ws?: Snap[], tasks?: Snap[], actions?: Snap[], raid?: Snap[], decisions?: Snap[] }} input
 */
export function assembleFromSnapshots({ meta, ws = [], tasks = [], actions = [], raid = [], decisions = [] }) {
  const { project, orphans } = assembleProject(meta, ws, tasks, actions, raid, decisions);
  const orphanCount = Object.values(orphans).reduce((n, list) => n + list.length, 0);
  return { project, orphans, orphanCount };
}

// P2.4: the App's project read values, factored out of the shim so the emulator test
// runs the exact code the App runs. Firestore functions are injected (no imports here).
export const V2_SUBCOLS = ['workstreams', 'tasks', 'actions', 'raid', 'decisions'];

/** v1 project doc -> the value the App sees (ACL / rev fields stripped). */
export function appValueFromV1(data, pid) {
  const { memberIds, roles, deletedAt, createdBy, createdAt, updatedAt, rev, writeId, ...rest } = data;
  void memberIds; void roles; void deletedAt; void createdBy; void createdAt; void updatedAt; void rev; void writeId;
  return { id: pid, ...rest };
}

/** Assembled v2 project -> the value the App sees (plus v2-only fields stripped, `__v2` added). */
export function appValueFromV2(project, pid, orphanCount) {
  const {
    memberIds, roles, deletedAt, createdBy, createdAt, updatedAt, rev, writeId,
    programMeta, memberUids, visibility, schemaVersion, v1Absent,
    ...rest
  } = project;
  void memberIds; void roles; void deletedAt; void createdBy; void createdAt; void updatedAt; void rev; void writeId;
  void programMeta; void memberUids; void visibility; void schemaVersion; void v1Absent;
  return { id: pid, ...rest, __v2: { orphans: orphanCount } };
}

/**
 * One getDocs per sub-collection. Throws on any read error (callers decide what that means).
 * @param {{ collection: Function, getDocs: Function }} fsApi
 * @returns {Promise<{ ws: Snap[], tasks: Snap[], actions: Snap[], raid: Snap[], decisions: Snap[] }>}
 */
export async function loadV2Lists(fsApi, db, wid, pid) {
  const snaps = await Promise.all(
    V2_SUBCOLS.map((c) => fsApi.getDocs(fsApi.collection(db, 'workspaces', wid, 'projects', pid, c))),
  );
  const [ws, tasks, actions, raid, decisions] = snaps.map((s) => s.docs.map((d) => ({ id: d.id, data: d.data() })));
  return { ws, tasks, actions, raid, decisions };
}
