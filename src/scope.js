// Audit 25/11 wave 2: one scope rule (spec docs/superpowers/specs/2026-11-25-ux-audit-waves-design.md).
// The header scope (a program of the current project, or all) shows only on tabs it filters,
// and everything on those tabs obeys it. Pure.
import { isPlanView, managerProgramId } from './tabsByRole.js';

const arr = (v) => (Array.isArray(v) ? v : []);

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

/** The scope id if it names a program of the project, else null (a stale id reads as "all"). */
export function validScope(project, scopeProgramId) {
  if (!scopeProgramId) return null;
  return arr(project?.programs).some((p) => p.id === scopeProgramId) ? scopeProgramId : null;
}

/** The project narrowed to the scoped program (same object when no scope). */
export function scopedProject(project, scopeProgramId) {
  const id = validScope(project, scopeProgramId);
  if (!project || !id) return project;
  return { ...project, programs: arr(project.programs).filter((p) => p.id === id) };
}

function programOfTask(project, taskId) {
  if (taskId == null) return null;
  for (const p of arr(project?.programs)) {
    for (const w of arr(p.workstreams)) if (arr(w.tasks).some((t) => t.id === taskId)) return p.id;
  }
  return null;
}

/** An action belongs to the program of its related task; one without a task shows only under "all". */
export function actionInScope(project, action, scopeProgramId) {
  const id = validScope(project, scopeProgramId);
  if (!id) return true;
  return programOfTask(project, action?.relatedTaskId) === id;
}

/** A decision: its stored program (v2 roles), else the programs of its related tasks. */
export function decisionInScope(project, roles, decision, scopeProgramId) {
  const id = validScope(project, scopeProgramId);
  if (!id) return true;
  const stored = decision?.id != null ? roles?.decisions?.[decision.id]?.programId : undefined;
  if (stored) return stored === id;
  return arr(decision?.relatedTaskIds).some((t) => programOfTask(project, t) === id);
}

const OPEN_ACTION = (a) => !['Done', 'Cancelled', 'Dropped'].includes(a?.status);
const OPEN_DECISION = (d) => (d?.followUpStatus || 'Open') !== 'Done';

/** Tab counts: open items in scope. */
export function scopedCounts(project, roles, scopeProgramId) {
  return {
    actions: arr(project?.actionItems).filter((a) => OPEN_ACTION(a) && actionInScope(project, a, scopeProgramId)).length,
    decisions: arr(project?.decisions).filter((d) => OPEN_DECISION(d) && decisionInScope(project, roles, d, scopeProgramId)).length,
  };
}

/**
 * Scope to use when a project is opened: the remembered choice ('' = all) if still valid,
 * else the first program I manage there, else all (null).
 */
export function initialScope({ project, uid, remembered }) {
  if (remembered === '') return null;
  const kept = validScope(project, remembered);
  if (kept) return kept;
  return managerProgramId(project, uid) || null;
}
