// Audit 25/11 wave 2: one scope rule (spec docs/superpowers/specs/2026-11-25-ux-audit-waves-design.md).
// The header scope (a program of the current project, a work stream I lead, or all) shows only
// on tabs it filters, and everything on those tabs obeys it. Pure.
// A scope value is a program id, 'ws:<workstreamId>' (R6), or null (all).
import { isPlanView, managerProgramId } from './tabsByRole.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const WS_PREFIX = 'ws:';

/** Tabs where the project selector and the scope apply. */
const SCOPED = new Set(['dashboard', 'actions', 'decisions', 'raid']);
export function scopeAppliesTo(view) {
  return !!view && (isPlanView(view) || SCOPED.has(view));
}

/** Tabs that show every project at once: no project selector, no scope, no project numbers. */
const CROSS = new Set(['my-work', 'portfolio', 'team-overview', 'credit-report', 'activity']);
export function isCrossProjectView(view) {
  return CROSS.has(view);
}

function programOfWs(project, wsId) {
  for (const p of arr(project?.programs)) if (arr(p.workstreams).some((w) => w.id === wsId)) return p.id;
  return null;
}

/** The scope if it names a program or a work stream of the project, else null (a stale id reads as "all"). */
export function validScope(project, scope) {
  if (!scope) return null;
  if (String(scope).startsWith(WS_PREFIX)) return programOfWs(project, scope.slice(WS_PREFIX.length)) ? scope : null;
  return arr(project?.programs).some((p) => p.id === scope) ? scope : null;
}

/** { programId, wsId } of a valid scope (programId set for a work stream too); nulls for all. */
export function scopeParts(project, scope) {
  const s = validScope(project, scope);
  if (!s) return { programId: null, wsId: null };
  if (s.startsWith(WS_PREFIX)) {
    const wsId = s.slice(WS_PREFIX.length);
    return { programId: programOfWs(project, wsId), wsId };
  }
  return { programId: s, wsId: null };
}

/** The project narrowed to the scope, for reading only (same object when no scope). */
export function scopedProject(project, scope) {
  const { programId, wsId } = scopeParts(project, scope);
  if (!project || !programId) return project;
  const programs = arr(project.programs).filter((p) => p.id === programId)
    .map((p) => (wsId ? { ...p, workstreams: arr(p.workstreams).filter((w) => w.id === wsId) } : p));
  return { ...project, programs };
}

function placeOfTask(project, taskId) {
  if (taskId == null) return null;
  for (const p of arr(project?.programs)) {
    for (const w of arr(p.workstreams)) if (arr(w.tasks).some((t) => t.id === taskId)) return { programId: p.id, wsId: w.id };
  }
  return null;
}

/** An action belongs to its related task's program / work stream; one without a task shows only under "all". */
export function actionInScope(project, action, scope) {
  const { programId, wsId } = scopeParts(project, scope);
  if (!programId) return true;
  const at = placeOfTask(project, action?.relatedTaskId);
  if (!at) return false;
  return wsId ? at.wsId === wsId : at.programId === programId;
}

/** A decision: its stored program (v2 roles), else the programs of its related tasks. Decisions are per program. */
export function decisionInScope(project, roles, decision, scope) {
  const { programId } = scopeParts(project, scope);
  if (!programId) return true;
  const stored = decision?.id != null ? roles?.decisions?.[decision.id]?.programId : undefined;
  if (stored) return stored === programId;
  return arr(decision?.relatedTaskIds).some((t) => placeOfTask(project, t)?.programId === programId);
}

const OPEN_ACTION = (a) => !['Done', 'Cancelled', 'Dropped'].includes(a?.status);
const OPEN_DECISION = (d) => (d?.followUpStatus || 'Open') !== 'Done';

/** Tab counts: open items in scope. */
export function scopedCounts(project, roles, scope) {
  return {
    actions: arr(project?.actionItems).filter((a) => OPEN_ACTION(a) && actionInScope(project, a, scope)).length,
    decisions: arr(project?.decisions).filter((d) => OPEN_DECISION(d) && decisionInScope(project, roles, d, scope)).length,
  };
}

/** Work streams of this project that uid leads (R6). */
export function myWorkstreams(project, uid) {
  const roles = project?.__v2?.roles;
  if (!roles || !uid) return [];
  const out = [];
  for (const p of arr(project.programs)) {
    for (const w of arr(p.workstreams)) if (roles.workstreams?.[w.id]?.leadUid === uid) out.push({ id: w.id, name: w.name, programId: p.id });
  }
  return out;
}

function pmProgramId(project, uid) {
  const roles = project?.__v2?.roles;
  if (!roles || !uid) return null;
  const ids = new Set(arr(project.programs).map((p) => p.id));
  for (const [id, m] of Object.entries(roles.programs || {})) if ((m?.pmUid === uid || m?.deputyUid === uid) && ids.has(id)) return id;
  return null;
}

/** Options for the Scope select: all, each program, then "My work stream: …" for work streams I lead. */
export function scopeOptions(project, uid) {
  return [
    { value: '', label: 'All programs' },
    ...arr(project?.programs).map((p) => ({ value: p.id, label: p.name })),
    ...myWorkstreams(project, uid).map((w) => ({ value: WS_PREFIX + w.id, label: `My work stream: ${w.name}` })),
  ];
}

/**
 * Scope to use when a project is opened: the remembered choice ('' = all) if still valid,
 * else my program (PM / Deputy), else the work stream I lead, else all (null).
 */
export function initialScope({ project, uid, remembered }) {
  if (remembered === '') return null;
  const kept = validScope(project, remembered);
  if (kept) return kept;
  const pm = pmProgramId(project, uid);
  if (pm) return pm;
  const ws = myWorkstreams(project, uid)[0];
  if (ws) return WS_PREFIX + ws.id;
  return managerProgramId(project, uid) || null;
}

/** R4: does uid hold a manager role (PM / Deputy / Sub-PM) in this project? */
export function managesIn(project, uid) {
  return !!managerProgramId(project, uid);
}
