// Navigation model (spec docs/superpowers/specs/2026-11-27-nav-shell-design.md). Pure.
// What a person may see still comes from tabsFor(tier); this only arranges it:
// "mine" + projects + management in the sidebar, project tabs in the project header.
import { tabsFor, isPlanView } from './tabsByRole.js';
import { statusOf, isOverdueTask } from './taskStatus.js';

export const PROJECT_TAB_IDS = ['plan', 'actions', 'decisions', 'raid', 'dashboard'];
const MANAGEMENT_IDS = ['portfolio', 'team-overview', 'credit-report', 'activity'];
const arr = (v) => (Array.isArray(v) ? v : []);
const tasksOf = (project) => arr(project?.programs).flatMap((p) => arr(p.workstreams).flatMap((w) => arr(w.tasks)));

/** A view that belongs to one project (or All projects): it gets the project header and tabs. */
export function isProjectView(view) {
  return !!view && (isPlanView(view) || ['actions', 'decisions', 'raid', 'dashboard'].includes(view));
}

/** Clicking a project keeps the current project tab; from any other page it opens Plan (last sub-view). */
export function viewAfterProjectClick(view, planView) {
  if (isProjectView(view)) return view;
  return isPlanView(planView) ? planView : 'outline';
}

/** Same formula as App.jsx rollup(): Completed 1, In Progress / Submitted 0.5, Dropped left out. null = no task. */
export function projectPct(project) {
  const active = tasksOf(project).filter((t) => statusOf(t) !== 'Dropped');
  if (!active.length) return null;
  const w = { Completed: 1, InProgress: 0.5, Submitted: 0.5 };
  return Math.round((active.reduce((s, t) => s + (w[statusOf(t)] || 0), 0) / active.length) * 100);
}

/**
 * Health dot (open = Planned / In Progress): grey = no open task; red = an open task with
 * health red, or >= 20% of open tasks overdue; amber = any overdue or any health amber; else green.
 */
export function projectDot(project, now = new Date()) {
  const open = tasksOf(project).filter((t) => ['Planned', 'InProgress'].includes(statusOf(t)));
  if (!open.length) return { tone: 'grey', title: 'No open task' };
  const overdue = open.filter((t) => isOverdueTask(t, now)).length;
  const red = open.filter((t) => t.health === 'red').length;
  const amber = open.filter((t) => t.health === 'amber').length;
  if (red > 0) return { tone: 'red', title: `At risk: ${red} off track` };
  if (overdue / open.length >= 0.2) return { tone: 'red', title: `At risk: ${overdue} overdue` };
  if (overdue > 0) return { tone: 'amber', title: `Watch: ${overdue} overdue` };
  if (amber > 0) return { tone: 'amber', title: `Watch: ${amber} at risk` };
  return { tone: 'green', title: 'On track' };
}

export function navModel({ tier, impersonating = false, projects = {}, activeIds = [], closedIds = [], now = new Date() }) {
  if (impersonating) return { mine: [{ id: 'my-work', label: 'My Work' }], management: [], projectTabs: [], projects: [], closed: [] };
  const tabs = tabsFor(tier);
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const pick = (ids) => ids.filter((id) => byId.has(id)).map((id) => ({ id, label: byId.get(id).label }));
  return {
    // Everyone gets the briefing here (members had it in the More menu).
    mine: [{ id: 'my-work', label: 'My Work' }, { id: 'briefing', label: 'Weekly briefing' }],
    management: pick(MANAGEMENT_IDS),
    projectTabs: pick(PROJECT_TAB_IDS),
    projects: activeIds.filter((id) => projects[id]).map((id) => ({ id, name: projects[id].name || '(unknown)', pct: projectPct(projects[id]), dot: projectDot(projects[id], now) })),
    closed: closedIds.filter((id) => projects[id]).map((id) => ({ id, name: projects[id].name || '(unknown)' })),
  };
}

const TITLES = { 'my-work': 'My Work', portfolio: 'Portfolio', 'team-overview': 'Team', 'credit-report': 'Credits', activity: 'Coaching' };
/** Title of a page that has no project header ('' for project views). */
export function pageTitle(view) {
  return TITLES[view] || '';
}
