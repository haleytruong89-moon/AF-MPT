// Firestore data layer + React hooks. See src/types.ts for the domain shapes
// and firestore.rules for the access rules these calls must satisfy.

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  doc,
  collection,
  query,
  where,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  type DocumentReference,
  type CollectionReference,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  Project,
  ActivityEntry,
  UserPrefs,
  UserProfile,
  UserDirEntry,
  Role,
} from './types';

const WORKSPACE = 'main';
const META_REF = (): DocumentReference => doc(db, 'workspaces', WORKSPACE);
const PROJECTS_COL = (): CollectionReference =>
  collection(db, 'workspaces', WORKSPACE, 'projects');
const PROJECT_REF = (pid: string): DocumentReference =>
  doc(db, 'workspaces', WORKSPACE, 'projects', pid);
const ACTIVITY_REF = (pid: string): DocumentReference =>
  doc(db, 'workspaces', WORKSPACE, 'activity', pid);
const USERDIR_REF = (uid: string): DocumentReference =>
  doc(db, 'workspaces', WORKSPACE, 'users', uid);
const USERDIR_COL = (): CollectionReference => collection(db, 'workspaces', WORKSPACE, 'users');
const USER_REF = (uid: string): DocumentReference => doc(db, 'users', uid);

const ACTIVITY_CAP = 500;

/* ════════════ ROLE HELPERS ════════════ */
export const ROLE = { OWNER: 'owner', OPERATOR: 'operator', MEMBER: 'member' } as const;

export function roleOf(project: Project | null | undefined, uid: string | undefined): Role | null {
  if (!project || !uid || !project.roles) return null;
  return project.roles[uid] ?? null;
}
export const isOwner = (p: Project | null | undefined, uid: string | undefined): boolean =>
  roleOf(p, uid) === 'owner';
export const isOperator = (p: Project | null | undefined, uid: string | undefined): boolean =>
  roleOf(p, uid) === 'operator';
export const canEdit = (p: Project | null | undefined, uid: string | undefined): boolean =>
  isOwner(p, uid) || isOperator(p, uid);
export const canRead = (p: Project | null | undefined, uid: string | undefined): boolean =>
  roleOf(p, uid) != null;

/* ════════════ USER DIRECTORY ════════════ */
export async function upsertCurrentUser(user: UserProfile): Promise<void> {
  if (!user?.uid) return;
  await setDoc(
    USERDIR_REF(user.uid),
    {
      uid: user.uid,
      email: user.email,
      name: user.name || user.email?.split('@')[0],
      photo: user.photo || null,
      lastSeen: serverTimestamp(),
    },
    { merge: true }
  );
}

export function useUserDirectory(): UserDirEntry[] {
  const [users, setUsers] = useState<UserDirEntry[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(
      USERDIR_COL(),
      (snap) => {
        const list: UserDirEntry[] = [];
        snap.forEach((d) => list.push(d.data() as UserDirEntry));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setUsers(list);
      },
      (err) => console.error('User directory listener error:', err)
    );
    return unsub;
  }, []);
  return users;
}

/* ════════════ WORKSPACE DIRECTORY (members + invites) ════════════ */
export interface DirectoryEntry {
  path: string; // full doc path
  uid: string | null; // null for invites
  email: string;
  displayName: string;
  aliases: string[];
  department: string;
  status: 'active' | 'deactivated';
}

const toDirectoryEntry = (
  path: string,
  uid: string | null,
  data: Record<string, unknown>
): DirectoryEntry => ({
  path,
  uid,
  email: String(data.email || '').toLowerCase(),
  displayName: String(data.displayName || ''),
  aliases: Array.isArray(data.aliases) ? (data.aliases as unknown[]).map(String) : [],
  department: String(data.department || ''),
  status: data.status === 'deactivated' ? 'deactivated' : 'active',
});

export function useWorkspaceDirectory(
  authUser: { uid: string; email?: string | null } | null
): {
  entries: DirectoryEntry[];
  ready: boolean;
  error: string | null;
  reload: () => void;
} {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const claimTried = useRef(false);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const uid = authUser?.uid || null;
  const emailLower = (authUser?.email || '').toLowerCase();

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const [mSnap, iSnap] = await Promise.all([
          getDocs(collection(db, 'workspaces', WORKSPACE, 'members')),
          getDocs(collection(db, 'workspaces', WORKSPACE, 'invites')),
        ]);
        const members: DirectoryEntry[] = [];
        mSnap.forEach((d) => members.push(toDirectoryEntry(d.ref.path, d.id, d.data())));
        const memberEmails = new Set(members.map((m) => m.email));
        const invites: DirectoryEntry[] = [];
        iSnap.forEach((d) => {
          const e = toDirectoryEntry(d.ref.path, null, d.data());
          if (!memberEmails.has(e.email)) invites.push(e);
        });

        const hasMember = members.some((m) => m.uid === uid);
        const invite = iSnap.docs.find((d) => d.id === emailLower);
        if (
          !claimTried.current &&
          !hasMember &&
          emailLower &&
          invite &&
          invite.data().status === 'active'
        ) {
          claimTried.current = true;
          const inv = invite.data();
          try {
            await setDoc(doc(db, 'workspaces', WORKSPACE, 'members', uid), {
              email: inv.email,
              displayName: inv.displayName,
              aliases: inv.aliases,
              department: inv.department,
              status: 'active',
              updatedAt: serverTimestamp(),
              updatedBy: emailLower,
            });
            if (!cancelled) reload();
          } catch (e) {
            console.warn('Invite claim failed:', e);
          }
        }
        if (!cancelled) {
          setEntries([...members, ...invites]);
          setError(null);
          setReady(true);
        }
      } catch (e) {
        console.warn('Directory load failed:', e);
        if (!cancelled) {
          setEntries([]);
          setError(e instanceof Error ? e.message : String(e));
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, emailLower, nonce, reload]);

  return { entries, ready, error, reload };
}

/* Owner-only directory writes (rules enforce Workspace Owner). Nothing is deleted. */
const invitePath = (emailLower: string) => ['workspaces', WORKSPACE, 'invites', emailLower] as const;

export async function upsertInvite(
  entry: { email: string; displayName: string; department: string; aliases: string[] },
  ownerEmail: string
): Promise<void> {
  const email = entry.email.trim().toLowerCase();
  await setDoc(doc(db, ...invitePath(email)), {
    email,
    displayName: entry.displayName,
    aliases: entry.aliases,
    department: entry.department,
    status: 'active',
    updatedAt: serverTimestamp(),
    updatedBy: ownerEmail.toLowerCase(),
  });
}

export async function updateDirectoryEntry(
  path: string,
  fields: { displayName?: string; department?: string; aliases?: string[] },
  ownerEmail: string
): Promise<void> {
  await updateDoc(doc(db, path), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy: ownerEmail.toLowerCase(),
  });
}

export async function setDirectoryStatus(
  entry: DirectoryEntry,
  status: 'active' | 'deactivated',
  ownerEmail: string
): Promise<void> {
  const stamp = { status, updatedAt: serverTimestamp(), updatedBy: ownerEmail.toLowerCase() };
  await updateDoc(doc(db, entry.path), stamp);
  if (entry.uid) {
    // Keep a stale invite from letting a deactivated person re-claim.
    const invRef = doc(db, ...invitePath(entry.email));
    const inv = await getDoc(invRef);
    if (inv.exists()) await updateDoc(invRef, stamp);
  }
}

/* ════════════ WORKSPACE META ════════════ */
export interface WorkspaceBootstrapState {
  ready: boolean;
  freshWorkspace: boolean;
}

export function useWorkspaceBootstrap(): WorkspaceBootstrapState {
  const [state, setState] = useState<WorkspaceBootstrapState>({
    ready: false,
    freshWorkspace: false,
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(META_REF());
        if (!snap.exists()) {
          await setDoc(META_REF(), { createdAt: serverTimestamp(), seeded: false });
          if (!cancelled) setState({ ready: true, freshWorkspace: true });
        } else {
          const data = snap.data() || {};
          if (!cancelled) setState({ ready: true, freshWorkspace: !data.seeded });
        }
      } catch (e) {
        console.error('Workspace bootstrap failed:', e);
        if (!cancelled) setState({ ready: true, freshWorkspace: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export async function markWorkspaceSeeded(): Promise<void> {
  await setDoc(META_REF(), { seeded: true }, { merge: true });
}

/* ════════════ PROJECTS (real-time, scoped to caller) ════════════ */
export interface MyProjectsResult {
  projects: Project[];
  loading: boolean;
}

export function useMyProjects(uid: string | undefined): MyProjectsResult {
  const [list, setList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setList([]);
      setLoading(false);
      return;
    }
    const q = query(PROJECTS_COL(), where('memberIds', 'array-contains', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: Project[] = [];
        snap.forEach((d) => {
          const data = d.data() as Project;
          if (data.deletedAt) return;
          out.push({ ...data, id: d.id });
        });
        out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setList(out);
        setLoading(false);
      },
      (err) => {
        console.error('Projects listener error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  return { projects: list, loading };
}

/* ════════════ SINGLE PROJECT ════════════ */
export interface ProjectResult {
  project: Project | null;
  loading: boolean;
}

export function useProject(pid: string | null | undefined): ProjectResult {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pid) {
      setProject(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      PROJECT_REF(pid),
      (snap) => {
        const data = snap.exists() ? ({ ...(snap.data() as Project), id: snap.id } as Project) : null;
        setProject(data && data.deletedAt ? null : data);
        setLoading(false);
      },
      (err) => {
        console.error('Project listener error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [pid]);

  return { project, loading };
}

/** One-shot fetch of a project doc — used by the cross-project search to load
 *  on demand without subscribing. Returns null if missing or unauthorized. */
export async function fetchProjectOnce(pid: string): Promise<Project | null> {
  try {
    const snap = await getDoc(PROJECT_REF(pid));
    if (!snap.exists()) return null;
    const data = { ...(snap.data() as Project), id: snap.id } as Project;
    if (data.deletedAt) return null;
    return data;
  } catch (e) {
    console.warn('fetchProjectOnce failed for', pid, e);
    return null;
  }
}

/* ════════════ WRITES ════════════ */

export async function createProject(
  project: Pick<Project, 'id' | 'name'> & Partial<Project>,
  creator: UserProfile
): Promise<void> {
  if (!creator?.uid) throw new Error('createProject: creator required');
  if (!project?.id || !project?.name) throw new Error('createProject: id and name required');

  const memberIds = [creator.uid];
  const roles = { [creator.uid]: ROLE.OWNER };
  const docBody = {
    name: project.name,
    programs: project.programs || [],
    relatedParties: project.relatedParties || [],
    memberIds,
    roles,
    deletedAt: null,
    createdBy: creator.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(PROJECT_REF(project.id), docBody);
}

export async function saveProject(project: Project): Promise<void> {
  if (!project?.id) throw new Error('saveProject: project.id required');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...data } = project;
  await setDoc(
    PROJECT_REF(id),
    { ...data, updatedAt: serverTimestamp() },
    { merge: false }
  );
}

export async function softDeleteProject(pid: string): Promise<void> {
  await updateDoc(PROJECT_REF(pid), { deletedAt: serverTimestamp() });
}

export async function hardDeleteProject(pid: string): Promise<void> {
  await deleteDoc(PROJECT_REF(pid));
  try {
    await deleteDoc(ACTIVITY_REF(pid));
  } catch {
    /* may not exist */
  }
}

/* ─── Membership management ─── */
// B3 fix: membership helpers write ONLY the fields they change (updateDoc), never
// the whole project from a possibly-stale snapshot — that could roll back
// programs/tasks saved by the App and move `rev` backwards.
async function patchProject(pid: string, fields: Record<string, unknown>): Promise<void> {
  await updateDoc(PROJECT_REF(pid), { ...fields, updatedAt: serverTimestamp() });
}

// v2 projects (schemaVersion 2) also carry `memberUids`, which the v2 read rules
// (canReadProject) use. Keep it in sync atomically with arrayUnion/arrayRemove,
// never from the snapshot. Owner-only by rules (Ruling P). The helpers receive
// a Firebase uid (members/{uid}); an invite-only person has no uid yet and
// cannot reach these helpers, so there is nothing to mirror for them.
const isV2 = (project: Project): boolean =>
  (project as { schemaVersion?: number }).schemaVersion === 2;

export async function addProjectMember(
  project: Project,
  userDirEntry: { uid: string },
  role: Role = 'member'
): Promise<void> {
  if (!project?.id || !userDirEntry?.uid) throw new Error('addProjectMember: bad args');
  const memberIds = Array.from(new Set([...(project.memberIds || []), userDirEntry.uid]));
  const roles = { ...(project.roles || {}), [userDirEntry.uid]: role };
  await patchProject(project.id, {
    memberIds,
    roles,
    ...(isV2(project) ? { memberUids: arrayUnion(userDirEntry.uid) } : {}),
  });
}

export async function setMemberRole(project: Project, uid: string, role: Role): Promise<void> {
  if (!project?.id || !uid) throw new Error('setMemberRole: bad args');
  const roles = { ...(project.roles || {}), [uid]: role };
  await patchProject(project.id, { roles });
}

export async function removeProjectMember(project: Project, uid: string): Promise<void> {
  if (!project?.id || !uid) throw new Error('removeProjectMember: bad args');
  const memberIds = (project.memberIds || []).filter((x) => x !== uid);
  const roles = { ...(project.roles || {}) };
  delete roles[uid];
  await patchProject(project.id, {
    memberIds,
    roles,
    ...(isV2(project) ? { memberUids: arrayRemove(uid) } : {}),
  });
}

export async function setRelatedParties(
  project: Project,
  relatedParties: Project['relatedParties']
): Promise<void> {
  if (!project?.id) throw new Error('setRelatedParties: bad args');
  await patchProject(project.id, { relatedParties: relatedParties || [] });
}

/* ════════════ ACTIVITY LOG ════════════ */
export function useActivity(pid: string | null | undefined): ActivityEntry[] {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  useEffect(() => {
    if (!pid) {
      setEntries([]);
      return;
    }
    const unsub = onSnapshot(
      ACTIVITY_REF(pid),
      (snap) => {
        setEntries(snap.exists() ? ((snap.data().entries as ActivityEntry[]) || []) : []);
      },
      (err) => console.error('Activity listener error:', err)
    );
    return unsub;
  }, [pid]);
  return entries;
}

/** Append an activity entry. The `author` field MUST be the current user's
 *  verified email — Firestore rules enforce this. */
export async function appendActivity(
  pid: string,
  partial: { type?: string; description?: string; id?: string },
  currentUser: UserProfile
): Promise<void> {
  if (!currentUser?.email) throw new Error('appendActivity: currentUser.email required');
  const ref = ACTIVITY_REF(pid);
  const snap = await getDoc(ref);
  const existing: ActivityEntry[] = snap.exists() ? (snap.data().entries as ActivityEntry[]) || [] : [];
  const entry: ActivityEntry = {
    id: partial.id || `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: partial.type || 'note',
    description: partial.description || '',
    author: currentUser.email,
    authorUid: currentUser.uid,
    authorName: currentUser.name || currentUser.email,
    timestamp: new Date().toISOString(),
  };
  const next = [entry, ...existing].slice(0, ACTIVITY_CAP);
  await setDoc(ref, { entries: next });
}

/* ════════════ USER PREFERENCES ════════════ */
export interface UserPrefsResult {
  prefs: UserPrefs | null;
  loading: boolean;
}

export function useUserPrefs(uid: string | undefined): UserPrefsResult {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setPrefs(null);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      USER_REF(uid),
      (snap) => {
        setPrefs(snap.exists() ? (snap.data() as UserPrefs) : { currentProjectId: null });
        setLoading(false);
      },
      (err) => {
        console.error('User prefs listener error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  return { prefs, loading };
}

export async function setCurrentProjectId(uid: string, pid: string | null): Promise<void> {
  if (!uid) return;
  await setDoc(
    USER_REF(uid),
    { currentProjectId: pid, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/* ════════════ DEBOUNCED SAVER ════════════ */
export function useDebouncedSaver(delay = 500) {
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  return useCallback(
    (project: Project) => {
      if (!project?.id) return;
      clearTimeout(timers[project.id]);
      timers[project.id] = setTimeout(() => {
        saveProject(project).catch((e) => console.error('Save failed:', e));
      }, delay);
    },
    [delay]
  );
}
