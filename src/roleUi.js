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
    return { programEdit: true, wsAdd: true, wsEdit: true, wsDates: true, wsDelete: true, taskAdd: true, taskEdit: true };
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
  };
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
