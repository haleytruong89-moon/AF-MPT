// W3-D2: one workload definition for Team and Portfolio (HOD 16/11). Pure.
// open task = Planned / InProgress; awaiting approval = Submitted (not open, never
// overdue); overdue counted separately for tasks and actions; Completed / Dropped ignored.
import { isOverdueTask } from './taskStatus.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const OPEN = new Set(['Planned', 'InProgress']);
const CLOSED_ACTION = new Set(['Done', 'Cancelled', 'Dropped']);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function actionOverdue(a, now) {
  if (!a?.dueDate) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(a.dueDate));
  const due = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(a.dueDate);
  return !isNaN(due) && due < startOfDay(now);
}

/**
 * keyOf(raw) -> grouping key for a person string (personKey with the directory, so
 * aliases and display names merge). The first raw string seen becomes the label.
 * -> Map<key, { key, label, openTasks, awaitingApproval, overdueTasks, openActions, overdueActions,
 *               perProject: Map<pid, { project, openTasks, tasks }> }>
 */
export function personWorkload(projects, { keyOf = (raw) => raw, labelOf = null, now = new Date() } = {}) {
  const out = new Map();
  const entry = (raw) => {
    const key = keyOf(raw);
    if (!out.has(key)) {
      out.set(key, { key, label: labelOf ? labelOf(raw) : raw, openTasks: 0, awaitingApproval: 0, overdueTasks: 0, openActions: 0, overdueActions: 0, perProject: new Map() });
    }
    return out.get(key);
  };
  const list = Array.isArray(projects) ? projects : Object.values(projects || {});
  for (const project of list) {
    if (!project) continue;
    for (const pg of arr(project.programs)) {
      for (const ws of arr(pg.workstreams)) {
        for (const t of arr(ws.tasks)) {
          if (!t?.pic) continue;
          const status = t.status || 'Planned';
          if (status === 'Submitted') { entry(t.pic).awaitingApproval++; continue; }
          if (!OPEN.has(status)) continue;
          const e = entry(t.pic);
          e.openTasks++;
          if (isOverdueTask(t, now)) e.overdueTasks++;
          if (!e.perProject.has(project.id)) e.perProject.set(project.id, { project, openTasks: 0, tasks: [] });
          const pp = e.perProject.get(project.id);
          pp.openTasks++;
          pp.tasks.push(t);
        }
      }
    }
    for (const a of arr(project.actionItems)) {
      if (!a?.pic || CLOSED_ACTION.has(a.status)) continue;
      const e = entry(a.pic);
      e.openActions++;
      if (actionOverdue(a, now)) e.overdueActions++;
    }
  }
  return out;
}
