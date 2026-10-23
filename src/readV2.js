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
