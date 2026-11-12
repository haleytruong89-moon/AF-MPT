// Role-aware UI helpers (wave 1, PR-E). Pure: no React, no Firestore.
//
// Each capability mirrors firestore.rules; the UI only hides what the rules
// would deny. roles = V2Roles (readV2.rolesFromLoaded): ownerUids,
// programs[pid].{pmUid, deputyUid}, workstreams[wsId].{programId, leadUid, start, end},
// tasks[taskId]. On a v1 project every capability is granted here (v1 is
// governed by the per-project role checks elsewhere in the App).
import { managerLevel } from './closeFlow.js';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Mirror of rules withinWs: ISO string compare, null bound = no limit, null task date passes. */
export function datesWithinWs(start, end, ws) {
  const w = ws || {};
  const startOk = start == null || w.start == null || start >= w.start;
  const endOk = end == null || w.end == null || end <= w.end;
  return startOk && endOk;
}

/** Owner always; on v2 the task's PM / Deputy / Sub-PM (rules taskManagerUpdate / taskLeadOk). */
export function canEditTaskDates({ isOwner, isV2, roles, taskId, uid }) {
  if (isOwner) return true;
  if (!isV2) return false;
  const lvl = managerLevel(roles, taskId, uid);
  return lvl === 'owner' || lvl === 'pm' || lvl === 'lead';
}

const isPmOf = (roles, programId, uid) => {
  if (!uid || programId == null) return false;
  const m = roles?.programs && hasOwn(roles.programs, programId) ? roles.programs[programId] : null;
  return !!m && (m.pmUid === uid || m.deputyUid === uid);
};

// Rules leadOfWs + wsInProgram: the ws's program must be in programMeta, and
// (when the task's program is given) the ws must belong to it.
const isLeadOf = (roles, wsId, programId, uid) => {
  if (!uid || wsId == null) return false;
  const ws = roles?.workstreams?.[wsId];
  if (!ws || !ws.leadUid || ws.leadUid !== uid) return false;
  if (ws.programId == null || !roles.programs || !hasOwn(roles.programs, ws.programId)) return false;
  return programId == null || ws.programId === programId;
};

/**
 * What the current user may do in a program / work stream (rules ~487-510, ~943+):
 *  - programEdit: programMeta is Owner-only on v2 (ownerOnlyProjectKeys).
 *  - wsAdd / wsEdit / wsDelete: Owner or PM / Deputy of the program; Sub-PM has no ws writes.
 *  - wsDates: ws start / end and moving a ws to another program are Owner-only
 *    (wsUpdateOk); a PM-created ws must have null dates.
 *  - taskAdd / taskEdit: PM / Deputy of the program or Sub-PM of the ws.
 */
export function uiCaps({ isOwner, isV2, roles, uid, programId, wsId }) {
  if (isOwner || !isV2) {
    return { programEdit: true, wsAdd: true, wsEdit: true, wsDates: true, wsDelete: true, taskAdd: true, taskEdit: true, wsMove: true, taskMove: true };
  }
  const pm = isPmOf(roles, programId, uid);
  const lead = isLeadOf(roles, wsId, programId, uid);
  return {
    programEdit: false,
    wsAdd: pm,
    wsEdit: pm,
    wsDates: false,
    wsDelete: pm,
    taskAdd: pm || lead,
    taskEdit: pm || lead,
    wsMove: pm,
    taskMove: pm || lead,
  };
}

/** Wave 2 O1 (Ruling W2-2): same rule as firestore.rules isOwnerIn - uid in ownerUids OR workspaceOwner email (case-insensitive). */
export function isWorkspaceOwner(meta, uid, email) {
  const m = meta || {};
  if (uid && Array.isArray(m.ownerUids) && m.ownerUids.includes(uid)) return true;
  const owner = typeof m.workspaceOwner === 'string' ? m.workspaceOwner.trim().toLowerCase() : '';
  const me = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return owner !== '' && me !== '' && owner.includes('@') && owner === me;
}

/**
 * Wave 2 O2: may a drop be attempted? Owner / v1: yes. v2 non-Owner: never across
 * programs (rules); a Sub-PM (not PM) only into a work stream they lead.
 */
export function canDropMove({ isOwner, isV2, roles, uid, kind, sourcePgId, targetPgId, targetWsId }) {
  if (isOwner || !isV2) return true;
  if (sourcePgId !== targetPgId) return false;
  if (kind === 'ws') return isPmOf(roles, sourcePgId, uid);
  return isPmOf(roles, sourcePgId, uid) || isLeadOf(roles, targetWsId, targetPgId, uid);
}

// PM / Deputy of the program or Sub-PM of a ws in it (rules claimInProgram).
const holdsProgram = (roles, programId, uid) => {
  if (!uid || programId == null) return false;
  if (isPmOf(roles, programId, uid)) return true;
  return Object.keys(roles?.workstreams || {}).some((w) => isLeadOf(roles, w, programId, uid));
};

// Any PM / Deputy / Sub-PM role in the project (a new decision's claim).
const holdsAnyProgram = (roles, uid) => Object.keys(roles?.programs || {}).some((p) => holdsProgram(roles, p, uid));

/** Wave 2 R5: edit raid/{programId}. Owner / v1: true; else a role in that program. */
export function canEditRaid({ isOwner, isV2, roles, uid, programId }) {
  if (isOwner || !isV2) return true;
  return holdsProgram(roles, programId, uid);
}

/**
 * Wave 2 R5 (Ruling W2-4): edit a decision. Owner / v1: true; else a role in the
 * program of its stored claim (roles.decisions[id].programId; null = Owner only).
 * A decision not in the stored roles yet (created in this tab, unsaved) behaves as
 * a new one: anyone holding a PM / Deputy / Sub-PM role.
 */
export function canEditDecision({ isOwner, isV2, roles, uid, decision }) {
  if (isOwner || !isV2) return true;
  const id = decision?.id;
  const stored = id != null && roles?.decisions && hasOwn(roles.decisions, id) ? roles.decisions[id] : undefined;
  if (stored === undefined) return holdsAnyProgram(roles, uid);
  return holdsProgram(roles, stored?.programId ?? null, uid);
}

/** Wave 2 R5 / W4: deleting a decision or a RAID item is Owner-only on v2; v1 unchanged. */
export function canDeleteRaidOrDecision({ isOwner, isV2 }) {
  return !!isOwner || !isV2;
}

/** Header chip data: label = highest role, detail = every role held. */
export function myRoleSummary(roles, uid, project) {
  const detail = [];
  if (roles && uid) {
    const programs = Array.isArray(project?.programs) ? project.programs : [];
    const progName = (id) => programs.find((p) => p.id === id)?.name || id;
    const wsName = (id) => {
      for (const p of programs) {
        const w = (p.workstreams || []).find((x) => x.id === id);
        if (w) return w.name || id;
      }
      return id;
    };
    if (Array.isArray(roles.ownerUids) && roles.ownerUids.includes(uid)) detail.push('Owner');
    const pmIds = Object.keys(roles.programs || {});
    for (const id of pmIds) if (roles.programs[id]?.pmUid === uid) detail.push(`PM · ${progName(id)}`);
    for (const id of pmIds) if (roles.programs[id]?.deputyUid === uid) detail.push(`Deputy · ${progName(id)}`);
    for (const [id, ws] of Object.entries(roles.workstreams || {})) if (ws?.leadUid === uid) detail.push(`Sub-PM · ${wsName(id)}`);
    if (Object.values(roles.tasks || {}).some((t) => t?.picUid === uid)) detail.push('Assignee');
  }
  if (!detail.length) return { label: 'View only', detail: ['View only'] };
  return { label: detail[0], detail };
}

/**
 * Wave 2 W4: what the delete control on an action does.
 *  - 'delete': Owner, or any role on a v1 project (today's behaviour).
 *  - 'cancel': v2 non-Owner who manages the action's work stream (PM / Deputy of its
 *    program, or its Sub-PM): sets status Cancelled instead of deleting.
 *  - 'none': v2 non-Owner without that role (e.g. the PIC: rules refuse a cancel).
 */
export function actionDeleteMode({ isOwner, isV2, roles, uid, action }) {
  if (isOwner || !isV2) return 'delete';
  if (action?.status === 'Cancelled') return 'none'; // rules: no touching a Cancelled action
  const wsId = action?.workstreamId ?? null;
  const ws = wsId != null ? roles?.workstreams?.[wsId] : null;
  if (!ws || ws.programId == null) return 'none';
  return isPmOf(roles, ws.programId, uid) || isLeadOf(roles, wsId, ws.programId, uid) ? 'cancel' : 'none';
}
