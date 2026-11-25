// Audit 25/11 wave 5 PM-15 (spec docs/superpowers/specs/2026-11-25-ux-audit-waves-design.md):
// Meeting minutes defaults. Pure.
import { scopeParts } from './scope.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const OPEN = new Set(['Planned', 'InProgress', 'Submitted']);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * -> { from, to, projectIds, attendees }
 * from = today - 7 days, to = today (local dates). projectIds = [current] when a project is
 * open, else every id. attendees = PM / Deputy of the programs in scope, Sub-PMs of the work
 * streams in scope (names via nameOf(uid)), then PICs of open tasks in scope; unique, in that order.
 */
export function minutesDefaults({ project = null, scope = null, allIds = [], nameOf = (u) => u, now = new Date() }) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  const out = { from: iso(from), to: iso(today), projectIds: project ? [project.id] : [...allIds], attendees: [] };
  if (!project) return out;
  const { programId, wsId } = scopeParts(project, scope);
  const roles = project.__v2?.roles || null;
  const seen = new Set();
  const add = (name) => {
    const n = String(name || '').trim();
    if (!n || seen.has(n.toLowerCase())) return;
    seen.add(n.toLowerCase());
    out.attendees.push(n);
  };
  const programs = arr(project.programs).filter((p) => !programId || p.id === programId);
  const people = [];
  const pics = [];
  for (const p of programs) {
    const m = roles?.programs?.[p.id];
    if (!wsId) { if (m?.pmUid) people.push(nameOf(m.pmUid)); if (m?.deputyUid) people.push(nameOf(m.deputyUid)); }
    for (const w of arr(p.workstreams)) {
      if (wsId && w.id !== wsId) continue;
      const lead = roles?.workstreams?.[w.id]?.leadUid;
      if (lead) people.push(nameOf(lead));
      for (const t of arr(w.tasks)) if (OPEN.has(t?.status || 'Planned') && t.pic) pics.push(t.pic);
    }
  }
  people.forEach(add);
  pics.forEach(add);
  return out;
}
