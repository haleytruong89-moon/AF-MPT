// P4: which tabs a person sees and where the app opens, by UI tier.
// UI only — Firestore rules stay the authority for what anyone can do.

export const PLAN_VIEWS = ['mindmap', 'outline', 'gantt'];

export function isPlanView(view) {
  return PLAN_VIEWS.includes(view);
}

function managesIn(roles, uid) {
  if (!roles || !uid) return false;
  for (const pg of Object.values(roles.programs || {})) {
    if (pg?.pmUid === uid || pg?.deputyUid === uid) return true;
  }
  for (const ws of Object.values(roles.workstreams || {})) {
    if (ws?.leadUid === uid) return true;
  }
  return false;
}

/** 'owner' | 'manager' | 'member'. Manager = PM, Deputy or Sub-PM in any loaded v2 project. */
export function uiTier({ isOwner, projects, uid }) {
  if (isOwner) return 'owner';
  for (const p of Object.values(projects || {})) {
    if (managesIn(p?.__v2?.roles, uid)) return 'manager';
  }
  return 'member';
}

const T = {
  plan: { id: 'plan', label: 'Plan' },
  myWork: { id: 'my-work', label: 'My Work' },
  actions: { id: 'actions', label: 'Actions' },
  decisions: { id: 'decisions', label: 'Decisions' },
  raid: { id: 'raid', label: 'RAID' },
  portfolio: { id: 'portfolio', label: 'Portfolio' },
  dashboard: { id: 'dashboard', label: 'Dashboard' },
  team: { id: 'team-overview', label: 'Team' },
  briefing: { id: 'briefing', label: 'Briefing' },
  credits: { id: 'credit-report', label: 'Credits' },
  activity: { id: 'activity', label: 'Activity' },
};

const LAYOUT = {
  owner: [[T.plan, T.myWork], [T.actions, T.decisions, T.raid], [T.portfolio, T.dashboard, T.team], [T.briefing, T.credits, T.activity]],
  manager: [[T.plan, T.myWork], [T.actions, T.decisions, T.raid], [T.dashboard], [T.briefing]],
  member: [[T.myWork, T.plan], [T.actions, T.decisions, T.raid], [T.dashboard]],
};

/** Ordered tabs; `group` changes where a divider is drawn. */
export function tabsFor(tier) {
  const groups = LAYOUT[tier] || LAYOUT.member;
  return groups.flatMap((g, i) => g.map((t) => ({ ...t, group: i })));
}

/** Can this tier land on / see `view`? Plan sub-views count as the Plan tab; Briefing is a dialog, not a view. */
export function canSeeView(tier, view) {
  if (!view || view === 'briefing') return false;
  const id = isPlanView(view) ? 'plan' : view;
  return tabsFor(tier).some((t) => t.id === id);
}

function managerProgramId(project, uid) {
  const roles = project?.__v2?.roles;
  const programs = Array.isArray(project?.programs) ? project.programs : [];
  if (!roles || !uid || !programs.length) return null;
  const exists = (id) => programs.some((p) => p.id === id);
  for (const [id, pg] of Object.entries(roles.programs || {})) {
    if ((pg?.pmUid === uid || pg?.deputyUid === uid) && exists(id)) return id;
  }
  for (const [wsId, ws] of Object.entries(roles.workstreams || {})) {
    if (ws?.leadUid !== uid) continue;
    const pg = programs.find((p) => (p.workstreams || []).some((w) => w.id === wsId));
    if (pg) return pg.id;
  }
  return null;
}

/** Where the app opens: personal override if visible to the tier, else by tier. */
export function landingFor({ tier, override, planView, project, uid }) {
  const plan = isPlanView(planView) ? planView : 'outline';
  if (override && canSeeView(tier, override)) return { view: override, scopeProgramId: null };
  if (tier === 'owner') return { view: 'portfolio', scopeProgramId: null };
  if (tier === 'manager') return { view: plan, scopeProgramId: managerProgramId(project, uid) };
  return { view: 'my-work', scopeProgramId: null };
}
