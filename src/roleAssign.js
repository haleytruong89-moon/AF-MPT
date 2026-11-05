// Role assignment (PM / Deputy per program, Sub-PM per workstream). Pure: no React, no Firestore.
//
// roles = V2Roles (readV2.rolesFromLoaded). change = { kind: 'pm' | 'deputy' | 'lead',
// programId, wsId?, fromUid, toUid }.
import { eligibleApprovers } from './closeFlow.js';
import { statusOf } from './taskStatus.js';

const FIELD = { pm: 'pmUid', deputy: 'deputyUid', lead: 'leadUid' };
const LABEL = { pm: 'PM', deputy: 'Deputy', lead: 'Sub-PM' };
const DASH = '—';

/** Who may change this role: PM / Deputy = Owner only; Sub-PM = Owner or an active PM / Deputy of the program. */
export function canEditRole(roles, me, kind, programId) {
  if (!me || me.readOnly) return false;
  if (me.isOwner) return true;
  if (kind !== 'lead') return false;
  const prg = roles?.programs?.[programId];
  if (!prg || !me.uid) return false;
  if (me.uid !== prg.pmUid && me.uid !== prg.deputyUid) return false;
  return typeof me.isActive === 'function' ? !!me.isActive(me.uid) : true;
}

/** Active directory people with a uid, sorted by name. Non-owners only see project members. */
export function pickerPeople({ dirEntries, memberUids, isOwner }) {
  const members = new Set(memberUids || []);
  return (dirEntries || [])
    .filter((e) => e && e.uid && e.status !== 'deactivated' && (isOwner || members.has(e.uid)))
    .map((e) => ({ uid: e.uid, name: e.displayName, email: e.email }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

/** Error message or null. */
export function validateRoleChange(roles, change) {
  const { kind, programId, toUid, fromUid } = change;
  if ((toUid ?? null) === (fromUid ?? null)) return 'No change.';
  const prg = roles?.programs?.[programId] || {};
  if (toUid && ((kind === 'deputy' && toUid === prg.pmUid) || (kind === 'pm' && toUid === prg.deputyUid))) {
    return 'PM and Deputy must be different people.';
  }
  return null;
}

/** New roles with the change applied; the input is not mutated. */
export function rolesAfter(roles, change) {
  const { kind, programId, wsId, toUid } = change;
  const field = FIELD[kind];
  const out = { ...roles };
  if (kind === 'lead') {
    out.workstreams = { ...roles.workstreams, [wsId]: { ...roles.workstreams?.[wsId], [field]: toUid ?? null } };
  } else {
    out.programs = { ...roles.programs, [programId]: { ...roles.programs?.[programId], [field]: toUid ?? null } };
  }
  return out;
}

/**
 * Pending close requests whose approver should move because of the role change.
 * A request someone reassigned on purpose stays, unless its approver is the person who lost the role.
 */
export function reroutePlan({ before, after, change, tasks, isActive = () => true }) {
  void before;
  const plan = [];
  for (const t of tasks || []) {
    if (statusOf(t) !== 'Submitted') continue;
    const cr = t.closeRequest;
    if (!cr || typeof cr !== 'object') continue;
    const info = after?.tasks?.[t.id];
    if (!info) continue;
    const inScope = change.kind === 'lead' ? info.workstreamId === change.wsId : info.programId === change.programId;
    if (!inScope) continue;
    const hist = Array.isArray(t.closeRequestHistory) ? t.closeRequestHistory : [];
    if (hist.some((h) => h && h.status === 'Reassigned') && cr.approverUid !== change.fromUid) continue;
    const next = eligibleApprovers(after, t.id, cr.requestedByUid).find((u) => isActive(u));
    if (!next || next === cr.approverUid) continue;
    plan.push({ taskId: t.id, fromUid: cr.approverUid ?? null, toUid: next });
  }
  return plan;
}

/** Activity event for a role change. */
export function roleChangeEvent(change, nameOf, scopeName) {
  const n = (u) => (u ? nameOf(u) : DASH);
  return {
    type: 'role_changed',
    description: `Role changed: ${LABEL[change.kind]} of ${scopeName}, ${n(change.fromUid)} → ${n(change.toUid)}`,
    before: { uid: change.fromUid ?? null },
    after: { uid: change.toUid ?? null },
  };
}

/** Table rows for the Roles modal, in tree order. */
export function rowsForRoles(project, roles) {
  const rows = [];
  for (const pg of project?.programs || []) {
    const m = roles?.programs?.[pg.id] || {};
    rows.push({ kind: 'program', programId: pg.id, name: pg.name, pmUid: m.pmUid ?? null, deputyUid: m.deputyUid ?? null });
    for (const ws of pg.workstreams || []) {
      rows.push({ kind: 'ws', programId: pg.id, wsId: ws.id, name: ws.name, leadUid: roles?.workstreams?.[ws.id]?.leadUid ?? null });
    }
  }
  return rows;
}

/** Display name of the program (pm / deputy) or workstream (lead) a change targets. */
export function scopeNameOf(project, change) {
  const pg = (project?.programs || []).find((p) => p.id === change.programId);
  if (change.kind !== 'lead') return pg?.name || change.programId;
  const ws = (pg?.workstreams || []).find((w) => w.id === change.wsId);
  return ws?.name || change.wsId;
}

const uniqNames = (uids, nameOf) => [...new Set(uids.filter(Boolean))].map((u) => nameOf(u)).join(', ');

/** Lines of the confirm panel before a role change. */
export function roleChangeConfirmLines({ change, nameOf, scopeName, moves = [], addMemberUid = null }) {
  const n = (u) => (u ? nameOf(u) : DASH);
  const lines = [`${LABEL[change.kind]} of ${scopeName}: ${n(change.fromUid)} → ${n(change.toUid)}`];
  if (moves.length) lines.push(`${moves.length} pending request(s) will move to ${uniqNames(moves.map((m) => m.toUid), nameOf)}.`);
  if (addMemberUid) lines.push(`${nameOf(addMemberUid)} is not a member of this project and will be added.`);
  return lines;
}

/** Toast after a role change saved. */
export function roleSavedMessage(toUid, nameOf) {
  return toUid ? `Saved. ${nameOf(toUid)} should reload AF-MPT to get the new permissions.` : 'Saved.';
}

/** Toast when some pending requests could not be moved; `failed` = reroute moves not saved. */
export function rerouteFailedMessage(failed, nameOf) {
  return `Role saved. ${failed.length} pending request(s) still point to ${uniqNames(failed.map((m) => m.fromUid), nameOf) || DASH}; the PM or Owner can reassign them.`;
}
