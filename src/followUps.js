// W5 Coordinator (spec docs/superpowers/specs/2026-11-25-ux-audit-waves-design.md, wave 5):
// "Project follow-ups" in My Work = open actions past due in the projects I coordinate. Pure.
const OPEN = (a) => !['Done', 'Cancelled', 'Dropped'].includes(a?.status);
const DAY_MS = 24 * 60 * 60 * 1000;
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/** -> [{ project, action, lateDays }], most late first. uid null (View as) -> []. */
export function coordinatorFollowUps(projects, uid, now = new Date()) {
  const out = [];
  if (!uid) return out;
  const today = dayStart(now);
  for (const project of Object.values(projects || {})) {
    const list = project?.__v2?.roles?.coordinatorUids;
    if (!Array.isArray(list) || !list.includes(uid)) continue;
    for (const action of project.actionItems || []) {
      if (!OPEN(action)) continue;
      const due = parseDay(action.dueDate);
      if (!due || due >= today) continue;
      out.push({ project, action, lateDays: Math.round((today - due) / DAY_MS) });
    }
  }
  return out.sort((a, b) => b.lateDays - a.lateDays);
}
