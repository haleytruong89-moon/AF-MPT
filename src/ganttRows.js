// W3-C1: Gantt rows grouped Program -> Work stream -> Task, and the all-projects
// Gantt (Project -> Program -> Work stream). Pure, no React.
import { progressWeight } from './taskStatus.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const day = (s) => {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s));
  return m ? m[1] : null;
};

/** Every task under a project / program / workstream / task list. */
function tasksOf(node) {
  if (!node) return [];
  if (Array.isArray(node.tasks)) return node.tasks;
  if (Array.isArray(node.workstreams)) return node.workstreams.flatMap((w) => arr(w.tasks));
  if (Array.isArray(node.programs)) return node.programs.flatMap((p) => arr(p.workstreams).flatMap((w) => arr(w.tasks)));
  return [];
}

/** Earliest start / latest end of the non-Dropped tasks under node (YYYY-MM-DD or null). */
export function nodeSpan(node) {
  let start = null;
  let end = null;
  for (const t of tasksOf(node)) {
    if (t?.status === 'Dropped') continue;
    const s = day(t?.start);
    const e = day(t?.end);
    if (s && (!start || s < start)) start = s;
    if (e && (!end || e > end)) end = e;
  }
  return { start, end };
}

/** Progress %, same formula as rollup() in App.jsx: Dropped excluded, 0 without active tasks. */
export function nodePct(node) {
  const active = tasksOf(node).filter((t) => t?.status !== 'Dropped');
  if (!active.length) return 0;
  const weighted = active.reduce((s, t) => s + (progressWeight(t?.status || 'Planned') ?? 0), 0);
  return Math.round((weighted / active.length) * 100);
}

/** Tasks with a start date first (ascending), undated last. Returns a new array. */
export function sortTasksByStart(tasks) {
  const list = arr(tasks);
  return [...list].sort((a, b) => {
    const ad = a?.start ? +new Date(a.start) : Infinity;
    const bd = b?.start ? +new Date(b.start) : Infinity;
    if (isNaN(ad) && isNaN(bd)) return 0;
    if (isNaN(ad)) return 1;
    if (isNaN(bd)) return -1;
    return ad - bd;
  });
}

const groupRow = (kind, key, depth, label, node, extra, collapsed) => ({
  kind, key, depth, label, ...nodeSpan(node), pct: nodePct(node), collapsed: collapsed.has(key), ...extra,
});

/**
 * One project's Gantt rows. collapsed = Set of 'pg:<id>' / 'ws:<id>' keys; children of a
 * collapsed key are omitted. A scope id not found in the project = no scope.
 * @param {any} project
 * @param {{ scopeProgramId?: string | null, scopeWsId?: string | null, collapsed?: Set<string> }} [opts]
 */
export function buildGanttRows(project, { scopeProgramId = null, scopeWsId = null, collapsed = new Set() } = {}) {
  const programs = arr(project?.programs);
  const scope = scopeProgramId && programs.some((p) => p.id === scopeProgramId) ? scopeProgramId : null;
  const rows = [];
  for (const pg of programs) {
    if (scope && pg.id !== scope) continue;
    const pgKey = `pg:${pg.id}`;
    rows.push(groupRow('program', pgKey, 0, pg.name || '(program)', pg, { programId: pg.id }, collapsed));
    if (collapsed.has(pgKey)) continue;
    for (const ws of arr(pg.workstreams)) {
      if (scopeWsId && ws.id !== scopeWsId) continue; // audit 25/11 R6: work-stream scope
      const wsKey = `ws:${ws.id}`;
      rows.push(groupRow('workstream', wsKey, 1, ws.name || '(work stream)', ws, { programId: pg.id, workstreamId: ws.id }, collapsed));
      if (collapsed.has(wsKey)) continue;
      for (const t of sortTasksByStart(ws.tasks)) {
        rows.push({
          kind: 'task', key: `t:${t.id}`, depth: 2, label: t.name || '(task)', start: day(t.start), end: day(t.end),
          pct: nodePct({ tasks: [t] }), status: t.status || 'Planned', task: t, programId: pg.id, workstreamId: ws.id, collapsed: false,
        });
      }
    }
  }
  return rows;
}

/**
 * All-projects rows in projectIds order (ids missing from projects skipped); never task rows.
 * @param {Record<string, any>} projects
 * @param {string[]} projectIds
 * @param {{ collapsed?: Set<string> }} [opts]
 */
export function buildAllProjectsGanttRows(projects, projectIds, { collapsed = new Set() } = {}) {
  const rows = [];
  for (const pid of arr(projectIds)) {
    const p = projects?.[pid];
    if (!p) continue;
    const pKey = `p:${pid}`;
    rows.push(groupRow('project', pKey, 0, p.name || '(project)', p, { projectId: pid }, collapsed));
    if (collapsed.has(pKey)) continue;
    for (const pg of arr(p.programs)) {
      const pgKey = `pg:${pid}:${pg.id}`;
      rows.push(groupRow('program', pgKey, 1, pg.name || '(program)', pg, { projectId: pid, programId: pg.id }, collapsed));
      if (collapsed.has(pgKey)) continue;
      for (const ws of arr(pg.workstreams)) {
        rows.push(groupRow('workstream', `ws:${pid}:${ws.id}`, 2, ws.name || '(work stream)', ws, { projectId: pid, programId: pg.id, workstreamId: ws.id }, collapsed));
      }
    }
  }
  return rows;
}

/** { [taskId]: rowIndex } over task rows only (dependency arrows). */
export function ganttTaskIndex(rows) {
  const out = {};
  arr(rows).forEach((r, i) => { if (r.kind === 'task' && r.task) out[r.task.id] = i; });
  return out;
}
