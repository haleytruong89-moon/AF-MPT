// Replace person (role assignment spec §8): move one person's roles and open work in a
// v2 project to another person. Pure: the App runs the writes.
import { validateRoleChange } from './roleAssign.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const OPEN_TASK = new Set(['Planned', 'InProgress']);
const CLOSED_ACTION = new Set(['Done', 'Cancelled', 'Dropped']);
const statusOf = (t) => (t && t.status) || 'Planned';

/**
 * project = app tree; roles = project.__v2.roles; isFrom(raw) -> true when a stored person
 * string names the old person (directory-aware). Items match by stored uid or by name.
 */
export function planReplace({ project, roles, fromUid, isFrom = () => false, toUid }) {
  const out = { roles: [], tasks: [], actions: [], approvals: [], kept: { closed: 0, submitted: [] }, blocked: [] };
  if (!project || !fromUid || !toUid || fromUid === toUid) return out;
  const pgName = new Map(arr(project.programs).map((g) => [g.id, g.name]));
  const wsName = new Map(arr(project.programs).flatMap((g) => arr(g.workstreams)).map((w) => [w.id, w.name]));

  let simRoles = roles;
  const tryRole = (change, scopeName) => {
    const err = validateRoleChange(simRoles, change);
    if (err) { out.blocked.push({ kind: change.kind, scopeName, reason: err }); return; }
    out.roles.push({ ...change, scopeName });
    // later checks see earlier moves (PM moved first, then Deputy)
    if (change.kind === 'lead') {
      simRoles = { ...simRoles, workstreams: { ...simRoles.workstreams, [change.wsId]: { ...simRoles.workstreams?.[change.wsId], leadUid: toUid } } };
    } else {
      const f = change.kind === 'pm' ? 'pmUid' : 'deputyUid';
      simRoles = { ...simRoles, programs: { ...simRoles.programs, [change.programId]: { ...simRoles.programs?.[change.programId], [f]: toUid } } };
    }
  };
  for (const [programId, m] of Object.entries(roles?.programs || {})) {
    const scopeName = pgName.get(programId) || programId;
    if (m?.pmUid === fromUid) tryRole({ kind: 'pm', programId, fromUid, toUid }, scopeName);
    if (m?.deputyUid === fromUid) tryRole({ kind: 'deputy', programId, fromUid, toUid }, scopeName);
  }
  for (const [wsId, w] of Object.entries(roles?.workstreams || {})) {
    if (w?.leadUid === fromUid && w.programId != null) tryRole({ kind: 'lead', programId: w.programId, wsId, fromUid, toUid }, wsName.get(wsId) || wsId);
  }

  for (const g of arr(project.programs)) {
    for (const w of arr(g.workstreams)) {
      for (const t of arr(w.tasks)) {
        const info = roles?.tasks?.[t.id] || {};
        const pic = info.picUid === fromUid || isFrom(t.pic);
        const contributor = arr(info.contributorUids).includes(fromUid) || arr(t.contributors).some(isFrom);
        const s = statusOf(t);
        if (s === 'Submitted' && t.closeRequest?.approverUid === fromUid) out.approvals.push({ id: t.id, name: t.name });
        if (!pic && !contributor) continue;
        if (OPEN_TASK.has(s)) out.tasks.push({ id: t.id, name: t.name, pic, contributor: contributor && !pic });
        else if (s === 'Submitted') out.kept.submitted.push({ id: t.id, name: t.name });
        else out.kept.closed++;
      }
    }
  }
  for (const a of arr(project.actionItems)) {
    if (CLOSED_ACTION.has(a?.status)) continue;
    const stored = roles?.actions?.[a.id]?.picUid ?? null;
    if (stored === fromUid || isFrom(a.pic)) out.actions.push({ id: a.id, title: a.title });
  }
  return out;
}

export function planIsEmpty(p) {
  return !p.roles.length && !p.tasks.length && !p.actions.length && !p.approvals.length;
}

function renameShares(shares, isFrom, toName) {
  if (!shares || typeof shares !== 'object') return shares;
  const out = {};
  let changed = false;
  for (const [k, v] of Object.entries(shares)) {
    const key = isFrom(k) ? toName : k;
    if (key !== k) changed = true;
    out[key] = typeof out[key] === 'number' && typeof v === 'number' ? out[key] + v : v;
  }
  return changed ? out : shares;
}

/** New tree with the plan's tasks / actions moved to toName. The input is not mutated. */
export function applyReplace(project, plan, { isFrom = () => false, toName }) {
  const taskIds = new Map(plan.tasks.map((t) => [t.id, t]));
  const actionIds = new Set(plan.actions.map((a) => a.id));
  const programs = arr(project.programs).map((g) => ({
    ...g,
    workstreams: arr(g.workstreams).map((w) => ({
      ...w,
      tasks: arr(w.tasks).map((t) => {
        const p = taskIds.get(t.id);
        if (!p) return t;
        const pic = p.pic ? toName : t.pic;
        const contributors = [];
        for (const c of arr(t.contributors)) {
          const n = isFrom(c) ? toName : c;
          if (n && n !== pic && !contributors.includes(n)) contributors.push(n);
        }
        const next = { ...t, pic, contributors };
        const shares = renameShares(t.creditShares, isFrom, toName);
        if (shares !== t.creditShares) next.creditShares = shares;
        return next;
      }),
    })),
  }));
  const actionItems = arr(project.actionItems).map((a) => (actionIds.has(a.id) ? { ...a, pic: toName } : a));
  return { ...project, programs, actionItems };
}
