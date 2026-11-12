// window.storage shim, Firebase-backed.
// ────────────────────────────────────────────────────────────────────────────
// The new App.jsx (ported from the artifact) reads/writes to a key-value API
// (window.storage.get/set/delete/list). The original shim used localStorage
// for everything; this version routes "shared" keys to Firestore so the team
// sees the same data, while keeping per-user "local" keys in localStorage.
//
// Routing table:
//   shared:'workspace:meta'  ↔ workspaces/main doc + derived projectIds/names
//                              from the projects collection (per-user filtered)
//   shared:'project:{id}'    ↔ workspaces/main/projects/{id}
//                              (RBAC fields auto-injected on first write)
//   shared:'activity:{id}'   ↔ workspaces/main/activity/{id}
//                              (entries[0].author rewritten to currentUser.email
//                               so the Firestore rule passes; original author
//                               preserved as authorName for display)
//   local:*                  ↔ localStorage with "afmpt:" prefix
//
// Auth: shim methods await `getUser()` which resolves once AuthProvider sets
// the current Firebase user via `setStorageUser()`. Because <App /> only
// mounts inside <AuthGate>, by the time storage methods are called, the user
// is already signed in.

import {
  doc,
  collection,
  query,
  where,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  runTransaction,
  deleteField,
  orderBy,
  limit,
  arrayUnion,
} from 'firebase/firestore';
import { db } from './firebase';
import { metaForWrite, isWorkspaceOwnerEmail, ownerUidsAfterRead } from './ownership';
import { classifyReadError, createKeyedQueue, buildProjectWrite, FORCE_WRITE_FLAG } from './persistence';
import { assembleFromSnapshots, appValueFromV1, appValueFromV2, loadV2Lists, loadApprovals, rolesFromLoaded } from './readV2';
import { planV2Save } from './planV2Save';
import { executeV2Save, applyWritten } from './execV2Save';
import { buildDirectoryIndex } from './directory';
import { activityDocFor, activityEntryFromDoc } from './activityDoc';
import { executeRoleChange, wsCacheAfterRoleChange } from './execRoleChange';
import type { UserProfile } from './types';

const WORKSPACE = 'main';
const META_REF = () => doc(db, 'workspaces', WORKSPACE);
const PROJECTS_COL = () => collection(db, 'workspaces', WORKSPACE, 'projects');
const PROJECT_REF = (pid: string) => doc(db, 'workspaces', WORKSPACE, 'projects', pid);
const ACTIVITY_REF = (pid: string) => doc(db, 'workspaces', WORKSPACE, 'activity', pid);

const LS_PREFIX = 'afmpt:';
const ACTIVITY_CAP = 500;

// B3: rev of each project as last read/written by this client.
const knownRev = new Map<string, number>();
// Recent saves whose outcome is unknown (network error after commit was sent).
const pendingWriteIds = new Map<string, string[]>(); // last 50, newest last (a long outage may queue many autosaves)
const projectWriteQueue = createKeyedQueue();

// P2.2: a v2 project lives in sub-collections. One getDocs per sub-collection
// (5 queries per load, never one per task); assembleProject sorts by `order`.
// Any read failure returns null — never a partial tree.
// P2.3: the read also keeps `loaded` (project doc + every doc with its version) per
// pid; a save of that pid is planned against it (planV2Save) and written per doc
// (executeV2Save). The v1 write path (buildProjectWrite) still refuses v2 docs.
type V2Sub = 'workstreams' | 'tasks' | 'actions' | 'raid' | 'decisions';
type V2Entry = { version: number; data: Record<string, unknown> };
type V2Loaded = { meta: Record<string, unknown>; docs: Record<V2Sub, Map<string, V2Entry>> };
const v2Loaded = new Map<string, V2Loaded>();
// v2 activity: ids of events known to exist on the server, per pid.
const v2ActivityKnown = new Map<string, Set<string>>();
const V2_ACTIVITY_COL = (pid: string) => collection(db, 'workspaces', WORKSPACE, 'projects', pid, 'activity');
async function getV2Project(key: string, pid: string, meta: Record<string, unknown>) {
  type Snap = { id: string; data: Record<string, unknown> };
  let lists: { ws: Snap[]; tasks: Snap[]; actions: Snap[]; raid: Snap[]; decisions: Snap[] };
  // P3: approvals/{reqId}, read alongside (separate from V2_SUBCOLS: the planner's
  // loaded.docs is unchanged). A failed read gives approvals: null; the project still loads.
  const approvalsP: Promise<unknown[] | null> = loadApprovals({ collection, getDocs }, db, WORKSPACE, pid)
    .catch((e: unknown) => {
      console.warn('[storage] v2 approvals read failed:', key, e);
      return null;
    });
  try {
    lists = (await loadV2Lists({ collection, getDocs }, db, WORKSPACE, pid)) as typeof lists;
  } catch (e) {
    console.warn('[storage] v2 sub-collection read failed:', key, e);
    return null;
  }
  const [approvals, ownerUids] = await Promise.all([approvalsP, ownerUidsNow()]);
  const { ws, tasks, actions, raid, decisions } = lists;
  const toMap = (list: Array<{ id: string; data: Record<string, unknown> }>) =>
    new Map(list.map(({ id, data }) => [id, { version: typeof data.version === 'number' ? data.version : 0, data }]));
  // Replaces the cached `loaded` object: safe only because the App loads each project once;
  // a read during an in-flight save would make applyWritten update a discarded object.
  const loaded: V2Loaded = {
    meta,
    docs: { workstreams: toMap(ws), tasks: toMap(tasks), actions: toMap(actions), raid: toMap(raid), decisions: toMap(decisions) },
  };
  v2Loaded.set(pid, loaded);
  const roles = rolesFromLoaded(loaded, ownerUids);
  const { project, orphans, orphanCount } = assembleFromSnapshots({ meta, ws, tasks, actions, raid, decisions });
  if (orphanCount > 0) {
    console.warn('[storage] v2 project has orphans:', pid, {
      workstreams: orphans.workstreams.length,
      tasks: orphans.tasks.length,
      actions: orphans.actions.length,
      raid: orphans.raid.length,
      missingRaid: orphans.missingRaid.length,
    });
  }
  return {
    key,
    value: JSON.stringify(appValueFromV2(project as Record<string, unknown>, pid, orphanCount, { roles, approvals })),
    shared: true,
  };
}

// Workspace doc as last read (Owner check for the planner: ownerUids or legacy email).
let wsMetaCache: Record<string, unknown> | null = null;
async function wsMetaNow(): Promise<Record<string, unknown> | null> {
  if (!wsMetaCache) {
    try {
      const s = await getDoc(META_REF());
      wsMetaCache = s.exists() ? (s.data() as Record<string, unknown>) : {};
    } catch {
      return null;
    }
  }
  return wsMetaCache;
}
async function isOwnerNow(user: UserProfile): Promise<boolean> {
  const m = await wsMetaNow();
  if (!m) return false;
  return (Array.isArray(m.ownerUids) && m.ownerUids.includes(user.uid))
    || isWorkspaceOwnerEmail(m.workspaceOwner, user.email);
}

/**
 * P3: workspace ownerUids as last read (via wsMetaCache); [] when unset. P3.1 M9: a
 * failed read keeps the last known list instead of [] (ownerUidsAfterRead).
 */
let lastOwnerUids: string[] = [];
export async function ownerUidsNow(): Promise<string[]> {
  lastOwnerUids = ownerUidsAfterRead(await wsMetaNow(), lastOwnerUids);
  return lastOwnerUids;
}

/**
 * P3 Task 7: role data rebuilt from the current `loaded` cache, which every v2
 * read replaces and every v2 save refreshes (applyWritten). Picks up in-session
 * PIC / contributor edits and tasks created in this session. null for a v1 (or
 * not yet loaded) project. Owner uids from the workspace doc as last read, else
 * `fallbackOwnerUids` (the project's read-time roles).
 */
export function v2RolesNow(pid: string, fallbackOwnerUids?: string[]): ReturnType<typeof rolesFromLoaded> | null {
  const loaded = v2Loaded.get(pid);
  if (!loaded) return null;
  const m = wsMetaCache;
  const ownerUids = m && Array.isArray(m.ownerUids)
    ? m.ownerUids.filter((u): u is string => typeof u === 'string')
    : fallbackOwnerUids;
  return rolesFromLoaded(loaded, ownerUids);
}

/** Role assignment: live member uids of a loaded v2 project (copy), [] when absent. */
export function v2MemberUidsNow(pid: string): string[] {
  const m = v2Loaded.get(pid)?.meta.memberUids;
  return Array.isArray(m) ? m.filter((u): u is string => typeof u === 'string') : [];
}

export type RoleChange = { kind: 'pm' | 'deputy' | 'lead'; programId: string; wsId?: string; fromUid: string | null; toUid: string | null };

/**
 * Role assignment: change a PM / Deputy (project doc) or Sub-PM (workstream doc) in one
 * transaction. Runs in the same per-project queue as tree saves so they never interleave.
 * On ok the loaded cache is updated so v2RolesNow / the next save plan see the change.
 */
export async function changeRoleV2(
  pid: string,
  change: RoleChange,
  opts: { addMemberUid?: string } = {},
): Promise<'ok' | 'changed' | 'conflict' | 'denied' | 'error'> {
  const user = await getUser();
  return await projectWriteQueue.run(`project:${pid}`, async () => {
    const res = await executeRoleChange(
      { runTransaction, doc, serverTimestamp, arrayUnion },
      { db, wid: WORKSPACE, pid, uid: user.uid, change, addMemberUid: opts.addMemberUid ?? null },
    );
    if (res.status === 'ok') {
      const loaded = v2Loaded.get(pid);
      if (loaded) {
        if (change.kind === 'lead') {
          if (res.ws && change.wsId) {
            const next = wsCacheAfterRoleChange(loaded.docs.workstreams.get(change.wsId), res, change.toUid);
            if (next) loaded.docs.workstreams.set(change.wsId, next);
          }
        } else {
          const field = change.kind === 'pm' ? 'pmUid' : 'deputyUid';
          const pm = (loaded.meta.programMeta ?? {}) as Record<string, Record<string, unknown>>;
          loaded.meta = {
            ...loaded.meta,
            programMeta: { ...pm, [change.programId]: { ...(pm[change.programId] ?? {}), [field]: change.toUid } },
          };
        }
        const add = opts.addMemberUid;
        if (add) {
          const cur = Array.isArray(loaded.meta.memberUids) ? (loaded.meta.memberUids as string[]) : [];
          if (!cur.includes(add)) loaded.meta = { ...loaded.meta, memberUids: [...cur, add] };
        }
      }
    }
    return res.status as 'ok' | 'changed' | 'conflict' | 'denied' | 'error';
  });
}

/**
 * P3 Task 7 (fix round 1): the App value of a v2 project as last read / saved by
 * this client (assembled from `loaded`). A close step is saved as this tree with
 * only its task replaced, so other unsaved edits never ride in a close write.
 */
export function v2SavedTree(pid: string): Record<string, unknown> | null {
  const loaded = v2Loaded.get(pid);
  if (!loaded) return null;
  const list = (m: Map<string, V2Entry>) => [...m.entries()].map(([id, e]) => ({ id, data: e.data }));
  const d = loaded.docs;
  const { project, orphanCount } = assembleFromSnapshots({
    meta: loaded.meta, ws: list(d.workstreams), tasks: list(d.tasks), actions: list(d.actions), raid: list(d.raid), decisions: list(d.decisions),
  });
  return appValueFromV2(project as Record<string, unknown>, pid, orphanCount) as Record<string, unknown>;
}

// Directory for person -> uid resolution in planV2Save, built like the P2 scripts
// (members + invites feed the index; uidByEmail from members only). Loaded once; a
// failed load is retried on the next save, and that save plans without it
// (people left unchanged keep their stored uids; a changed pic / contributors makes
// the planner refuse with 'directory-unavailable' -> reported as 'error', Ruling AH).
type PlanDirectory = { dirIndex: ReturnType<typeof buildDirectoryIndex> | null; uidByEmail: Map<string, string>; nameByUid: Map<string, string> };
let dirPromise: Promise<PlanDirectory> | null = null;
// W3: the People directory changed (DirectoryModal) or a save met an unknown name: reload on next use.
export function invalidatePlanDirectory(): void { dirPromise = null; }
function directoryForPlan(): Promise<PlanDirectory> {
  if (!dirPromise) {
    dirPromise = Promise.all([
      getDocs(collection(db, 'workspaces', WORKSPACE, 'members')),
      getDocs(collection(db, 'workspaces', WORKSPACE, 'invites')),
    ]).then(([mSnap, iSnap]) => {
      const entries: Array<Record<string, unknown>> = [];
      const uidByEmail = new Map<string, string>();
      const nameByUid = new Map<string, string>();
      mSnap.forEach((d) => {
        const m = d.data() as Record<string, unknown>;
        entries.push({ email: m.email, displayName: m.displayName, aliases: m.aliases, status: m.status });
        if (m.email) uidByEmail.set(String(m.email).toLowerCase(), d.id);
        if (m.displayName) nameByUid.set(d.id, String(m.displayName));
      });
      iSnap.forEach((d) => {
        const m = d.data() as Record<string, unknown>;
        entries.push({ email: m.email || d.id, displayName: m.displayName, aliases: m.aliases, status: m.status });
      });
      return { dirIndex: buildDirectoryIndex(entries), uidByEmail, nameByUid };
    }).catch((e) => {
      console.warn('[storage] directory load for v2 save failed:', e);
      dirPromise = null;
      return { dirIndex: null, uidByEmail: new Map<string, string>(), nameByUid: new Map<string, string>() };
    });
  }
  return dirPromise;
}

// planV2Save / applyWritten are plain JS; their inferred parameter types come from
// defaults (e.g. dirIndex = null), so give the shim the real signatures.
type V2Plan = { batches: Array<Array<Record<string, unknown>>>; metaPatch: Record<string, unknown> | null; refused: string | null; refusedName?: string };
const planV2 = planV2Save as unknown as (loaded: V2Loaded, tree: Record<string, unknown>, opts: Record<string, unknown>) => V2Plan;
const applyV2Written = applyWritten as unknown as (loaded: V2Loaded, written: unknown[], metaPatch: Record<string, unknown> | null) => void;

// P2.3 v2 save: plan against the loaded docs, then one transaction per batch (a non-Owner
// plan is split into chunks, W1). The cache is refreshed from whatever committed (a later
// batch / chunk may fail after earlier ones landed); on conflict / denied the rest stays
// stale until reload.
async function saveV2Project(key: string, value: string, pid: string, loaded: V2Loaded, user: UserProfile) {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  const { [FORCE_WRITE_FLAG]: _force, ...tree } = parsed;
  void _force;
  const [isOwner, dir] = await Promise.all([isOwnerNow(user), directoryForPlan()]);
  let plan = planV2(loaded, tree, { uid: user.uid, wid: WORKSPACE, pid, isOwner, ...dir });
  if (plan.refused === 'unknown-person') {
    // W3: the cache may be stale (someone just added the person): reload it and plan once more.
    invalidatePlanDirectory();
    plan = planV2(loaded, tree, { uid: user.uid, wid: WORKSPACE, pid, isOwner, ...(await directoryForPlan()) });
  }
  if (plan.refused) {
    console.warn('[storage] v2 save refused by the planner:', pid, plan.refused);
    // Ruling AH: a failed directory load is an error (retry / reload), not a refusal.
    // P3.1 I2: a close-history wipe has its own banner copy ('history').
    const error = plan.refused === 'directory-unavailable' ? 'error'
      : plan.refused === 'close-history-wipe' ? 'history' : 'refused';
    const person = plan.refused === 'unknown-person' ? plan.refusedName : undefined;
    return { key, value, shared: true, error: plan.refused === 'unknown-person' ? 'unknown-person' : error, reason: plan.refused, ...(person ? { person } : {}) };
  }
  if (!plan.batches.length && !plan.metaPatch) return { key, value, shared: true };
  const r = await executeV2Save(
    { runTransaction, doc, serverTimestamp, deleteField },
    { db, wid: WORKSPACE, pid, uid: user.uid, plan },
  );
  if (r.written.length || r.metaWritten) applyV2Written(loaded, r.written, r.metaWritten ? (r.metaPatch ?? plan.metaPatch) : null);
  if (r.status === 'ok') return { key, value, shared: true };
  console.warn('[storage] v2 save not completed:', pid, r.status, 'batch', r.failedBatch, r.error || '');
  // W2: a project-level field changed meanwhile gets its own banner copy.
  const error = r.status === 'conflict' && (r as { reason?: string }).reason === 'meta' ? 'conflict-meta' : r.status;
  return { key, value, shared: true, error };
}

/** Per-user localStorage key for the "currently selected project". */
function currentProjectKey(uid: string): string {
  return `currentProjectId:${uid}`;
}

/* ─────── Auth context (set by main.tsx after Firebase Auth resolves) ─────── */
let currentUser: UserProfile | null = null;
let resolveUserReady: ((u: UserProfile) => void) | null = null;
const userReady: Promise<UserProfile> = new Promise((resolve) => {
  resolveUserReady = resolve;
});

/** Called from main.tsx whenever the Firebase auth user changes. */
export function setStorageUser(user: UserProfile | null): void {
  currentUser = user;
  if (user && resolveUserReady) {
    resolveUserReady(user);
    resolveUserReady = null;
    // Also publish a `user:local` localStorage entry so the new App.jsx can
    // pick it up via its existing flow.
    try {
      localStorage.setItem(
        LS_PREFIX + 'user:local',
        JSON.stringify({ name: user.name || user.email, email: user.email })
      );
    } catch {}
  }
}

async function getUser(): Promise<UserProfile> {
  if (currentUser) return currentUser;
  return userReady;
}

/* ─────── Shim implementation ─────── */
type StorageResult<T = unknown> = T | null;

interface StorageGetResult {
  key: string;
  value: string;
  shared: boolean;
}
interface StorageSetResult {
  key: string;
  value: string;
  shared: boolean;
}
interface StorageDeleteResult {
  key: string;
  deleted: boolean;
  shared: boolean;
}
interface StorageListResult {
  keys: string[];
  prefix: string;
  shared: boolean;
}

declare global {
  interface Window {
    storage: {
      get(key: string, shared?: boolean): Promise<StorageResult<StorageGetResult>>;
      set(key: string, value: string, shared?: boolean): Promise<StorageResult<StorageSetResult>>;
      delete(key: string, shared?: boolean): Promise<StorageResult<StorageDeleteResult>>;
      list(prefix?: string, shared?: boolean): Promise<StorageResult<StorageListResult>>;
    };
  }
}

const lsKey = (key: string) => LS_PREFIX + key;

window.storage = {
  async get(key, shared = false) {
    if (!shared) {
      try {
        const raw = localStorage.getItem(lsKey(key));
        return raw == null ? null : { key, value: raw, shared: false };
      } catch (e) {
        console.warn('[storage] local get failed:', e);
        return null;
      }
    }
    try {
      const user = await getUser();

      if (key === 'workspace:meta') {
        // The new App expects meta with { projectIds: [], names: {}, ... }.
        // projectIds + names are derived from the projects collection, filtered
        // by membership, so each user only sees their accessible projects.
        // Return null only when the workspace marker doc doesn't exist yet
        // (truly first-ever user) so the App's auto-seed flow runs once.
        const metaSnap = await getDoc(META_REF());
        if (!metaSnap.exists()) return null;
        const baseMeta = metaSnap.data() || {};
        wsMetaCache = baseMeta;
        const q = query(PROJECTS_COL(), where('memberIds', 'array-contains', user.uid));
        const projSnap = await getDocs(q);
        const projectIds: string[] = [];
        const names: Record<string, string> = {};
        projSnap.forEach((d) => {
          const dd = d.data() as Record<string, unknown>;
          if (dd.deletedAt) return;
          projectIds.push(d.id);
          if (typeof dd.name === 'string') names[d.id] = dd.name;
        });
        // currentProjectId is per-user (not workspace-shared) — stored in
        // localStorage so user A's project switch doesn't affect user B.
        // Fall back to the first accessible project if the cached value is
        // stale or missing.
        let storedCurrent: string | null = null;
        try {
          storedCurrent = localStorage.getItem(LS_PREFIX + currentProjectKey(user.uid));
        } catch {}
        const validCurrent =
          storedCurrent && projectIds.includes(storedCurrent)
            ? storedCurrent
            : projectIds[0] || null;
        // Drop the workspace-shared `currentProjectId` from baseMeta — it's
        // a vestigial field and we no longer write it.
        const { currentProjectId: _drop, ...metaRest } = baseMeta;
        void _drop;
        return {
          key,
          value: JSON.stringify({
            ...metaRest,
            projectIds,
            names,
            currentProjectId: validCurrent,
          }),
          shared: true,
        };
      }

      if (key.startsWith('project:')) {
        const pid = key.substring('project:'.length);
        const snap = await getDoc(PROJECT_REF(pid));
        if (!snap.exists()) return null;
        const data = snap.data() as Record<string, unknown>;
        if (data.deletedAt) return null;
        // Strip RBAC-internal fields via appValueFromV1/V2 (readV2.js) so the App isn't
        // confused by them. (Member management uses MembersModal, which reads them via data.ts.)
        const rev = data.rev;
        knownRev.set(pid, typeof rev === 'number' ? rev : 0);
        pendingWriteIds.delete(pid);
        if (data.schemaVersion === 2) return await getV2Project(key, pid, data);
        v2Loaded.delete(pid);
        return {
          key,
          value: JSON.stringify(appValueFromV1(data, pid)),
          shared: true,
        };
      }

      if (key.startsWith('activity:')) {
        const pid = key.substring('activity:'.length);
        if (v2Loaded.has(pid)) {
          // P2.3: one doc per event; the newest ACTIVITY_CAP in the v1 array shape.
          const snap = await getDocs(query(V2_ACTIVITY_COL(pid), orderBy('createdAt', 'desc'), limit(ACTIVITY_CAP)));
          const entries: Array<Record<string, unknown>> = [];
          // R3: author from the directory by authorUid, time from createdAt; stored
          // author / timestamp only for events without authorUid (copied from v1).
          const { nameByUid } = await directoryForPlan();
          snap.forEach((d) => {
            entries.push(activityEntryFromDoc(d.data(), d.id, (u: string) => nameByUid.get(u) ?? null));
          });
          v2ActivityKnown.set(pid, new Set(snap.docs.map((d) => d.id)));
          return { key, value: JSON.stringify(entries), shared: true };
        }
        const snap = await getDoc(ACTIVITY_REF(pid));
        if (!snap.exists()) return { key, value: JSON.stringify([]), shared: true };
        const data = snap.data() as { entries?: Array<Record<string, unknown>> };
        const raw = data.entries || [];
        // Map author → friendly name for display: the stored `author` is the
        // email (rule-validated). Show authorName when present.
        const display = raw.map((e) => ({
          ...e,
          author: typeof e.authorName === 'string' && e.authorName ? e.authorName : e.author,
        }));
        return { key, value: JSON.stringify(display), shared: true };
      }

      console.warn('[storage] unknown shared key for get:', key);
      return null;
    } catch (e) {
      console.warn('[storage] shared get failed:', key, e);
      // A failed meta read must not look like "no workspace yet" (boot would seed).
      if (key === 'workspace:meta') throw e;
      return null;
    }
  },

  async set(key, value, shared = false) {
    if (!shared) {
      try {
        localStorage.setItem(lsKey(key), value);
        return { key, value, shared: false };
      } catch (e) {
        console.warn('[storage] local set failed:', e);
        return null;
      }
    }
    try {
      const user = await getUser();

      if (key === 'workspace:meta') {
        // - projectIds & names are derived from the projects collection on
        //   read, so we drop them from the persisted doc.
        // - currentProjectId is per-user — we write it to localStorage with a
        //   uid-namespaced key instead of into the workspace-shared doc.
        let incoming: Record<string, unknown> = {};
        try {
          incoming = JSON.parse(value);
        } catch {}
        // B1: owner fields are written only by flagged owner writes; a stale
        // in-memory copy can neither revert them nor get the write rejected.
        incoming = metaForWrite(incoming);
        const {
          projectIds: _pids,
          names: _names,
          currentProjectId: incomingCurrent,
          ...rest
        } = incoming;
        void _pids;
        void _names;
        if (typeof incomingCurrent === 'string' && incomingCurrent) {
          try {
            localStorage.setItem(LS_PREFIX + currentProjectKey(user.uid), incomingCurrent);
          } catch {}
        }
        await setDoc(
          META_REF(),
          { ...rest, seeded: true, updatedAt: serverTimestamp() },
          { merge: true }
        );
        return { key, value, shared: true };
      }

      if (key.startsWith('project:')) {
        // B3 fix: one write per project at a time (see createKeyedQueue).
        return await projectWriteQueue.run(key, async () => {
        const pid = key.substring('project:'.length);
        const loadedV2 = v2Loaded.get(pid);
        if (loadedV2) return await saveV2Project(key, value, pid, loadedV2, user);
        const parsed = JSON.parse(value) as Record<string, unknown>;
        // Owner restore from backup explicitly overrides the stale-write guard.
        const force = parsed[FORCE_WRITE_FLAG] === true;
        const { [FORCE_WRITE_FLAG]: _force, ...incoming } = parsed;
        void _force;
        // randomUUID needs a secure context (https/localhost); fall back for dev over LAN http.
        const writeId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const opts = {
          uid: user.uid, knownRev: knownRev.get(pid), force, now: serverTimestamp(),
          writeId, pendingWriteIds: pendingWriteIds.get(pid) || [],
        };
        // If this save ends in an error, the commit may still have landed: remember it.
        pendingWriteIds.set(pid, [...(pendingWriteIds.get(pid) || []), writeId].slice(-50));
        // B3 debt: read, rev check and write in one transaction — Firestore re-runs
        // the function if another client writes in between, so no silent overwrite.
        let result: { conflict?: boolean; readonly?: boolean; newRev?: number };
        try {
          result = await runTransaction(db, async (tx) => {
            let snap;
            try {
              snap = await tx.get(PROJECT_REF(pid));
            } catch (e) {
              throw Object.assign(new Error('project pre-read failed'), { preRead: true, code: (e as { code?: string })?.code, cause: e });
            }
            const ex = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
            const plan = buildProjectWrite(ex, incoming, opts);
            if (!plan.conflict && !plan.readonly && plan.doc) tx.set(PROJECT_REF(pid), plan.doc);
            return plan;
          });
        } catch (e) {
          const err = e as { preRead?: boolean; code?: string };
          if (!err.preRead) throw e;
          // A doc that does not exist reads as permission-denied under our rules
          // (isMember(null) = false). B2: only that may fall through to create;
          // any other read failure (network, quota…) aborts — never rebuild the ACL.
          if (classifyReadError(err.code) === 'fatal') {
            console.warn('[storage] project pre-read failed; write aborted:', pid, e);
            return null;
          }
          const plan = buildProjectWrite(null, incoming, opts);
          await setDoc(PROJECT_REF(pid), plan.doc);
          result = plan;
        }
        if (result.readonly) {
          // v2 project: never written through the v1 path. Nothing reached the server.
          pendingWriteIds.set(pid, (pendingWriteIds.get(pid) || []).filter((w) => w !== writeId));
          console.warn('[storage] v2 project is read-only in this client; write skipped:', pid);
          return { key, value, shared: true, error: 'readonly' };
        }
        if (result.conflict) {
          console.warn('[storage] project changed on server since load; write refused:', pid);
          return { key, value, shared: true, error: 'conflict' };
        }
        pendingWriteIds.delete(pid);
        knownRev.set(pid, result.newRev as number);
        return { key, value, shared: true };
        });
      }

      if (key.startsWith('activity:')) {
        const pid = key.substring('activity:'.length);
        if (v2Loaded.has(pid)) {
          // P2.3: each event not yet on the server becomes activity/{entry.id}
          // (rules: authorUid == me, createdAt == request.time). Oldest first.
          const parsedList = JSON.parse(value);
          const list: Array<Record<string, unknown>> = Array.isArray(parsedList) ? parsedList : [];
          const known = v2ActivityKnown.get(pid) || new Set<string>();
          v2ActivityKnown.set(pid, known);
          const fresh = list.filter((e) => e && typeof e.id === 'string' && e.id && !known.has(e.id)).reverse();
          for (const e of fresh) {
            // R3: allow-listed fields only; no author / timestamp (rules refuse them).
            await setDoc(doc(V2_ACTIVITY_COL(pid), e.id as string), {
              ...activityDocFor(e, user.uid), createdAt: serverTimestamp(),
            });
            known.add(e.id as string);
          }
          return { key, value, shared: true };
        }
        const incoming = JSON.parse(value);
        let entries: Array<Record<string, unknown>> = Array.isArray(incoming) ? incoming : [];
        // Rule requires entries[0].author == request.auth.token.email. The new
        // App typically sets author to the user's display name; we move that
        // to `authorName` and replace `author` with the verified email.
        if (entries.length > 0) {
          const first = entries[0];
          const originalAuthor = first.author;
          const isEmailish =
            typeof originalAuthor === 'string' && originalAuthor.includes('@');
          entries = [
            {
              ...first,
              author: user.email,
              authorName:
                first.authorName ||
                (!isEmailish && typeof originalAuthor === 'string'
                  ? originalAuthor
                  : user.name) ||
                user.name,
              authorUid: user.uid,
            },
            ...entries.slice(1),
          ];
        }
        if (entries.length > ACTIVITY_CAP) entries = entries.slice(0, ACTIVITY_CAP);
        await setDoc(ACTIVITY_REF(pid), { entries });
        return { key, value, shared: true };
      }

      console.warn('[storage] unknown shared key for set:', key);
      return null;
    } catch (e) {
      console.warn('[storage] shared set failed:', key, e);
      return null;
    }
  },

  async delete(key, shared = false) {
    if (!shared) {
      try {
        localStorage.removeItem(lsKey(key));
        return { key, deleted: true, shared: false };
      } catch (e) {
        console.warn('[storage] local delete failed:', e);
        return null;
      }
    }
    try {
      await getUser();
      if (key.startsWith('project:')) {
        const pid = key.substring('project:'.length);
        // Soft delete (preserves data; rule allows owner update with deletedAt)
        await setDoc(PROJECT_REF(pid), { deletedAt: serverTimestamp() }, { merge: true });
        return { key, deleted: true, shared: true };
      }
      if (key.startsWith('activity:')) {
        // Activity is append-only by rule; ignore delete to avoid permission
        // errors. Soft-deleted projects keep their activity log intact.
        return { key, deleted: true, shared: true };
      }
      if (key === 'workspace:meta') return null;
      return null;
    } catch (e) {
      console.warn('[storage] shared delete failed:', key, e);
      return null;
    }
  },

  async list(prefix = '', shared = false) {
    if (!shared) {
      try {
        const fullPrefix = lsKey(prefix);
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(fullPrefix)) {
            keys.push(k.substring(LS_PREFIX.length));
          }
        }
        return { keys, prefix, shared: false };
      } catch (e) {
        console.warn('[storage] local list failed:', e);
        return { keys: [], prefix, shared: false };
      }
    }
    try {
      const user = await getUser();
      // The new App typically lists with prefix 'project:' or '' to find
      // accessible projects. Always return only the projects user is a member of.
      if (
        prefix === '' ||
        prefix === 'project:' ||
        prefix === 'project' ||
        prefix.startsWith('project')
      ) {
        const q = query(PROJECTS_COL(), where('memberIds', 'array-contains', user.uid));
        const snap = await getDocs(q);
        const keys: string[] = [];
        snap.forEach((d) => {
          if (!d.data().deletedAt) keys.push('project:' + d.id);
        });
        return { keys, prefix, shared: true };
      }
      return { keys: [], prefix, shared: true };
    } catch (e) {
      console.warn('[storage] shared list failed:', prefix, e);
      return { keys: [], prefix, shared: true };
    }
  },
};

console.log('[storage shim] Firestore-backed shim initialized');

/** U7: remember the selected project in this browser only (no shared-doc write). */
export function rememberCurrentProject(pid: string): void {
  try {
    if (!currentUser) return;
    localStorage.setItem(LS_PREFIX + currentProjectKey(currentUser.uid), pid);
  } catch {}
}
