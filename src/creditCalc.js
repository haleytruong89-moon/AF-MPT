// Credit allocation (v22-v24), moved out of App.jsx so it is unit-tested.
// Audit 27/11 (docs/reviews/2026-11-27-calc-audit-credit-coaching.md), HOD decisions:
//  - Q1 A: a program / work stream with no task (Dropped excluded) gets no share; its
//    siblings share the parent's points.
//  - Q2 A: weights set on some siblings are kept; the rest of 100% is split equally among
//    the siblings without a weight (set weights over 100% are scaled down to 100% and the
//    others get 0).
//  - CR-4: equal split is not rounded (shares add up to exactly 100%).
//  - CR-5: the Project Lead earns lead pool x (Completed tasks / tasks not Dropped), the
//    same rule as the Credits tab (src/creditYears.js).
// Pure.
import { personKey, personLabel, groupByPerson } from './directory';

export const DEFAULT_CREDIT_POINTS = 100;
const arr = (v) => (Array.isArray(v) ? v : []);
const isNum = (w) => typeof w === 'number' && !Number.isNaN(w) && w >= 0;

export function equalSplit(count) {
  return count > 0 ? new Array(count).fill(100 / count) : [];
}

/**
 * Effective % per sibling (same order), adding up to 100 when any sibling counts.
 * hasWork(sibling) false -> 0 and left out of the split (Q1).
 */
export function effectiveWeights(siblings, hasWork = () => true) {
  const list = arr(siblings);
  const out = new Array(list.length).fill(0);
  const idx = list.map((s, i) => i).filter((i) => hasWork(list[i]));
  if (!idx.length) return out;
  const set = idx.filter((i) => isNum(list[i].weight));
  const unset = idx.filter((i) => !isNum(list[i].weight));
  const sumSet = set.reduce((s, i) => s + list[i].weight, 0);
  if (!unset.length) {
    if (sumSet <= 0) { for (const i of idx) out[i] = 100 / idx.length; return out; }
    for (const i of set) out[i] = (list[i].weight / sumSet) * 100;
    return out;
  }
  if (sumSet >= 100) {
    for (const i of set) out[i] = (list[i].weight / sumSet) * 100;
    return out;
  }
  for (const i of set) out[i] = list[i].weight;
  for (const i of unset) out[i] = (100 - sumSet) / unset.length;
  return out;
}

/** Are the set weights of these siblings over 100% (scaled down)? For a warning. */
export function weightsOverflow(siblings, hasWork = () => true) {
  const list = arr(siblings).filter(hasWork);
  const sum = list.filter((s) => isNum(s.weight)).reduce((a, s) => a + s.weight, 0);
  return list.some((s) => !isNum(s.weight)) && sum > 100;
}

export const taskCounts = (t) => !!t && t.status !== 'Dropped';
export const wsHasWork = (ws) => arr(ws?.tasks).some(taskCounts);
export const programHasWork = (pg) => arr(pg?.workstreams).some(wsHasWork);

/** Per-PIC share map normalised to 100 ({} with no PIC). Explicit creditShares win. */
export function creditSharesOf(task) {
  if (!task) return {};
  const explicit = task.creditShares;
  if (explicit && typeof explicit === 'object' && Object.keys(explicit).length > 0) {
    const sum = Object.values(explicit).reduce((a, b) => a + (Number(b) || 0), 0);
    if (sum > 0) {
      const out = {};
      for (const [k, v] of Object.entries(explicit)) if (Number(v) > 0) out[k] = (Number(v) / sum) * 100;
      return out;
    }
  }
  return task.pic ? { [task.pic]: 100 } : {};
}

export const isTaskCredited = (task) => !!task && task.status === 'Completed';

/** Default split: PIC 100 / 70-30 / 70-15-15; null with 3+ contributors (manual). */
export function defaultCreditShares(primaryPic, contributors) {
  if (!primaryPic) return null;
  const c = arr(contributors).filter(Boolean);
  if (c.length === 0) return { [primaryPic]: 100 };
  if (c.length === 1) return { [primaryPic]: 70, [c[0]]: 30 };
  if (c.length === 2) return { [primaryPic]: 70, [c[0]]: 15, [c[1]]: 15 };
  return null;
}

/**
 * -> { totalCp, leadCp, leadName, leadSharePct, programPoolCp, perPic, breakdown,
 *      unallocatedCp, noPicTasks }
 * breakdown rows: { programId, programName, workstreamId, workstreamName, taskId, taskName,
 *   picName, picId, sharePct, taskCp, projected, actual, credited, taskStatus, isProjectLead }.
 * unallocatedCp = points nobody can earn today: tasks without a PIC, and the whole
 * program pool when no program has a task.
 */
export function computeProjectCredits(project, dirIndex = null) {
  const totalCp = typeof project?.creditPoints === 'number' && project.creditPoints >= 0 ? project.creditPoints : DEFAULT_CREDIT_POINTS;
  const perPic = new Map();
  const breakdown = [];
  const add = (picId, picName, earned, projected) => {
    if (!perPic.has(picId)) perPic.set(picId, { earned: 0, projected: 0, name: picName });
    const cur = perPic.get(picId);
    cur.earned += earned;
    cur.projected += projected;
  };
  const programs = arr(project?.programs);

  // Project Lead: share taken first, earned by Completed / not Dropped tasks (CR-5).
  const leadName = String(project?.projectLead || '').trim();
  const leadSharePct = typeof project?.projectLeadShare === 'number' && project.projectLeadShare >= 0 && project.projectLeadShare <= 100
    ? project.projectLeadShare : (leadName ? 10 : 0);
  const leadCp = leadName ? (totalCp * leadSharePct) / 100 : 0;
  if (leadName && leadCp > 0) {
    let counted = 0;
    let done = 0;
    for (const pg of programs) for (const ws of arr(pg.workstreams)) for (const t of arr(ws.tasks)) {
      if (!taskCounts(t)) continue;
      counted++;
      if (t.status === 'Completed') done++;
    }
    const leadActual = counted ? leadCp * (done / counted) : 0;
    const leadId = personKey(dirIndex, leadName);
    const leadLabel = personLabel(dirIndex, leadName);
    add(leadId, leadLabel, leadActual, leadCp);
    breakdown.push({
      programId: null, programName: '— Project Lead —', workstreamId: null, workstreamName: '',
      taskId: null, taskName: `${leadName} (project lead, ${leadSharePct}%)`,
      picName: leadLabel, picId: leadId, sharePct: 100, taskCp: leadCp,
      projected: leadCp, actual: leadActual, credited: counted > 0 && done === counted,
      taskStatus: null, isProjectLead: true,
    });
  }

  const programPoolCp = totalCp - leadCp;
  let unallocatedCp = programs.some(programHasWork) ? 0 : programPoolCp;
  let noPicTasks = 0;
  const pgW = effectiveWeights(programs, programHasWork);
  programs.forEach((pg, i) => {
    const pgCp = programPoolCp * (pgW[i] / 100);
    const wss = arr(pg.workstreams);
    const wsW = effectiveWeights(wss, wsHasWork);
    wss.forEach((ws, j) => {
      const wsCp = pgCp * (wsW[j] / 100);
      const eligible = arr(ws.tasks).filter(taskCounts);
      const tW = effectiveWeights(eligible);
      eligible.forEach((t, k) => {
        const taskCp = wsCp * (tW[k] / 100);
        const credited = isTaskCredited(t);
        const shares = creditSharesOf(t);
        const people = dirIndex
          ? groupByPerson(Object.keys(shares), dirIndex).map((g) => [g.id, g.name, g.values.reduce((s, v) => s + shares[v], 0)])
          : Object.entries(shares).map(([n, pct]) => [n, n, pct]);
        if (!people.length) { unallocatedCp += taskCp; noPicTasks++; return; }
        for (const [picId, picName, sharePct] of people) {
          const projected = taskCp * (sharePct / 100);
          const actual = credited ? projected : 0;
          breakdown.push({
            programId: pg.id, programName: pg.name, workstreamId: ws.id, workstreamName: ws.name,
            taskId: t.id, taskName: t.name, picName, picId, sharePct, taskCp, projected, actual, credited,
            taskStatus: t.status, isProjectLead: false,
          });
          add(picId, picName, actual, projected);
        }
      });
    });
  });
  return { totalCp, leadCp, leadName, leadSharePct, programPoolCp, perPic, breakdown, unallocatedCp, noPicTasks };
}
