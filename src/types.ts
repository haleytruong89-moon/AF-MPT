// Domain types for the AF·MTP tracker. Mirrors the Firestore schema.
import type { Timestamp, FieldValue } from 'firebase/firestore';

export type TaskStatus = 'Planned' | 'InProgress' | 'Completed';

export type Role = 'owner' | 'operator' | 'member';

export interface CheckIn {
  id: string;
  timestamp: string; // ISO datetime
  author: string; // user.email or display name
  done: string;
  plan: string;
  blockers: string;
}

export interface Task {
  id: string;
  name: string;
  status?: TaskStatus;
  pic?: string | null;
  start?: string | null; // ISO date
  end?: string | null; // ISO date
  duration?: number | null; // days
  deliverables?: string | null;
  /** Legacy free-form text field (preserved for backwards compat). */
  dependencies?: string | null;
  /** New explicit list of upstream task IDs — used by the Gantt arrows. */
  dependencyIds?: string[];
  checkIns?: CheckIn[];
}

export interface Workstream {
  id: string;
  name: string;
  tasks: Task[];
}

export interface Program {
  id: string;
  name: string;
  workstreams: Workstream[];
}

export interface RelatedParty {
  name: string;
  email?: string;
  role?: string;
  organization?: string;
}

/** Roles is a map { uid: role }. */
export type RolesMap = Record<string, Role>;

export interface Project {
  id: string;
  name: string;
  programs: Program[];
  memberIds: string[];
  roles: RolesMap;
  relatedParties: RelatedParty[];
  deletedAt?: Timestamp | FieldValue | null;
  createdBy?: string;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

export interface ActivityEntry {
  id: string;
  type: string;
  description: string;
  author: string; // server-validated email
  authorUid?: string;
  authorName?: string;
  timestamp: string; // ISO datetime — client-side
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  photo: string | null;
}

export interface UserDirEntry extends UserProfile {
  lastSeen?: Timestamp;
}

export interface UserPrefs {
  currentProjectId: string | null;
  updatedAt?: Timestamp | FieldValue;
}

/** Workspace marker doc at workspaces/main */
export interface WorkspaceMeta {
  createdAt?: Timestamp | FieldValue;
  seeded?: boolean;
}

/** Convenience aliases used by the UI. */
export type Dialogs = {
  prompt: (opts: { title?: string; message?: string; placeholder?: string; initial?: string; okLabel?: string }) => Promise<string | null>;
  confirm: (opts: { title?: string; message?: string; danger?: boolean; okLabel?: string }) => Promise<boolean>;
  alert: (opts: { title?: string; message?: string }) => Promise<void>;
};
