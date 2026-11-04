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

/**
 * Assembled v2 project -> the value the App sees (plus v2-only fields stripped, `__v2` added).
 * P3: `extras` ({ roles, approvals }) is added under `__v2` only; the planner skips `__v2`.
 */
export function appValueFromV2(project, pid, orphanCount, extras = {}) {
  const {
    memberIds, roles, deletedAt, createdBy, createdAt, updatedAt, rev, writeId,
    programMeta, memberUids, visibility, schemaVersion, v1Absent,
    ...rest
  } = project;
  void memberIds; void roles; void deletedAt; void createdBy; void createdAt; void updatedAt; void rev; void writeId;
  void programMeta; void memberUids; void visibility; void schemaVersion; void v1Absent;
  return { id: pid, ...rest, __v2: { orphans: orphanCount, ...extras } };
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

// P3: role data for the approvals UI, from the docs the planner was given (`loaded`).
// Program keys are programMeta keys (= tree program ids after P2.4). Missing values
// are null; contributorUids defaults to []. Arrays are copied (no aliasing of `loaded`).
const orNull = (v) => (v === undefined ? null : v);

/**
 * @param {{ meta: Record<string, any>, docs: { workstreams?: Map<string, { data: Record<string, any> }>, tasks?: Map<string, { data: Record<string, any> }> } }} loaded
 * @param {string[] | undefined} ownerUids
 */
export function rolesFromLoaded(loaded, ownerUids) {
  const programs = {};
  for (const [k, m] of Object.entries(loaded.meta?.programMeta || {})) {
    programs[k] = { pmUid: orNull(m?.pmUid), deputyUid: orNull(m?.deputyUid), start: orNull(m?.start), end: orNull(m?.end) };
  }
  const workstreams = {};
  for (const [id, { data: d }] of loaded.docs.workstreams || new Map()) {
    workstreams[id] = { programId: orNull(d.programId), leadUid: orNull(d.leadUid), start: orNull(d.start), end: orNull(d.end) };
  }
  const tasks = {};
  for (const [id, { data: d }] of loaded.docs.tasks || new Map()) {
    tasks[id] = {
      programId: orNull(d.programId),
      workstreamId: orNull(d.workstreamId),
      picUid: orNull(d.picUid),
      contributorUids: Array.isArray(d.contributorUids) ? [...d.contributorUids] : [],
    };
  }
  return { ownerUids: Array.isArray(ownerUids) ? [...ownerUids] : [], programs, workstreams, tasks };
}

const isoOrNull = (ts) => ts?.toDate?.().toISOString() ?? null;

/**
 * approvals/{reqId} doc -> plain object for the tree (Timestamps as ISO strings).
 * updatedAt is converted only when it is a Timestamp (absent stays absent).
 */
export function approvalFromDoc(id, data) {
  const out = {
    id,
    ...data,
    createdAt: isoOrNull(data.createdAt),
    decidedAt: isoOrNull(data.decidedAt),
    version: typeof data.version === 'number' ? data.version : 0,
  };
  if (typeof data.updatedAt?.toDate === 'function') out.updatedAt = isoOrNull(data.updatedAt);
  return out;
}

/**
 * One getDocs on projects/{pid}/approvals, kept out of V2_SUBCOLS so the planner's
 * `loaded.docs` is unchanged. Throws on a read error; the shim maps that to null.
 * @param {{ collection: Function, getDocs: Function }} fsApi
 */
export async function loadApprovals(fsApi, db, wid, pid) {
  const snap = await fsApi.getDocs(fsApi.collection(db, 'workspaces', wid, 'projects', pid, 'approvals'));
  return snap.docs.map((d) => approvalFromDoc(d.id, d.data()));
}
