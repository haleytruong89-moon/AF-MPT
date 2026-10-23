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
} from 'firebase/firestore';
import { db } from './firebase';
import { metaForWrite } from './ownership';
import { classifyReadError, createKeyedQueue, buildProjectWrite, FORCE_WRITE_FLAG } from './persistence';
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
        // Strip RBAC-internal fields from the value so the new App.jsx isn't
        // confused by extra members/roles fields. (Member management uses the
        // separate MembersModal which reads them via the data.ts hooks.)
        const { memberIds, roles, deletedAt, createdBy, createdAt, updatedAt, rev, writeId: _writeId, ...rest } =
          data as Record<string, unknown>;
        void _writeId;
        knownRev.set(pid, typeof rev === 'number' ? rev : 0);
        pendingWriteIds.delete(pid);
        // Suppress unused warnings — these are intentional drops:
        void memberIds;
        void roles;
        void deletedAt;
        void createdBy;
        void createdAt;
        void updatedAt;
        return {
          key,
          value: JSON.stringify({ id: pid, ...rest }),
          shared: true,
        };
      }

      if (key.startsWith('activity:')) {
        const pid = key.substring('activity:'.length);
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
        let result: { conflict: boolean; newRev?: number };
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
            if (!plan.conflict && plan.doc) tx.set(PROJECT_REF(pid), plan.doc);
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
