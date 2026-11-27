// Coaching tab engine (Activity Dashboard), moved out of App.jsx so it is unit-tested.
// Audit 27/11 (docs/reviews/2026-11-27-calc-audit-credit-coaching.md), HOD Q3 A:
//  - CO-1: a Completed task is on time when it was handed in by its due date: the date
//    it was submitted for approval (close history), else its close date (approvedAt).
//    No close date (closed before approvals existed) = not rated.
//  - Q3 A (CO-4): a Submitted task is not rated until it is decided.
//  - CO-2: actions use their completion date (completedAt); Done without one = not rated.
//  - CO-3: the Delivery dimension needs 3 rated items (actions + tasks), not 3 actions.
//  - CO-5: the previous period uses windows of the same length that end where the
//    current ones start (statuses are today's: an approximation, said in the UI).
//  - CO-6: comments and blocker help on tasks without a PIC still count as engagement.
//  - CO-7: Cadence score 7 days = 85, 14 days = 70 (in line with the thresholds).
//  - CO-8: the priorities banner uses the same delivery rate and sample as the table.
// Pure; `now` comes from options.
import { personKey, personLabel } from './directory';

export const DEFAULT_DEADLINE_TYPE = 'hard';
export const ACTIVITY_THRESHOLDS = {
  delivery: { green: 85, amber: 70 },
  cadence: { green: 7, amber: 14 },
  blocker: { green: 3, amber: 7 },
  risk: { green: 85, amber: 70 },
  engagement: { green: 5, amber: 2 },
  composite: { green: 80, amber: 65 },
  minSamples: 3,
};
export const COMPOSITE_WEIGHTS = { delivery: 0.40, cadence: 0.30, risk: 0.20, engagement: 0.10 };
export const DEFAULT_DASHBOARD_WINDOW = { actionWeeks: 4, taskWeeks: 12 };

const DAY_MS = 86400000;
const arr = (v) => (Array.isArray(v) ? v : []);
const dayOf = (v) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const daysBetween = (a, b) => Math.round((dayOf(b) - dayOf(a)) / DAY_MS);
const weeksBefore = (now, n) => { const d = dayOf(now); d.setDate(d.getDate() - n * 7); return d; };
function inRange(ts, from, to) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return false;
  if (from && d < from) return false;
  if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); if (d > t) return false; }
  return true;
}

export function bucketColor(value, thresholds, { inverted = false } = {}) {
  if (value == null || Number.isNaN(value)) return 'subtle';
  if (inverted) {
    if (value <= thresholds.green) return 'green';
    if (value <= thresholds.amber) return 'amber';
    return 'red';
  }
  if (value >= thresholds.green) return 'green';
  if (value >= thresholds.amber) return 'amber';
  return 'red';
}
export const sampleStatus = (count) => (count >= ACTIVITY_THRESHOLDS.minSamples ? 'ok' : 'low');
/** Items rated for Delivery (actions + tasks): the sample used everywhere (CO-3, CO-8). */
export const deliverySample = (m) => m.delivery.total + m.delivery.hardTotal + m.delivery.softTotal;

/** CO-7: 0 days = 100, 7 = 85, 14 = 70, then -5 a day. */
export function cadenceScore(days) {
  if (days == null) return null;
  const d = Math.max(0, days);
  const s = d <= 14 ? 100 - (d * 15) / 7 : 70 - (d - 14) * 5;
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** CO-1 / Q3: the date a Completed task counts as handed in, or null (not rated). */
export function taskHandInDate(task) {
  if (!task || task.status !== 'Completed') return null;
  const h = arr(task.closeRequestHistory)[0];
  if (h && h.status === 'Approved' && h.submittedAt && (!task.approvedAt || h.decidedAt === task.approvedAt)) return h.submittedAt;
  return task.approvedAt || null;
}

export function trendOf(curr, prev, { inverted = false } = {}) {
  if (curr == null || prev == null) return null;
  const delta = curr - prev;
  const threshold = Math.max(2, Math.abs(prev) * 0.05);
  if (Math.abs(delta) < threshold) return 'flat';
  const isUp = delta > 0;
  if (inverted) return isUp ? 'down' : 'up';
  return isUp ? 'up' : 'down';
}

/**
 * Per-person snapshot. options: { now, actionFrom, actionTo, taskFrom, taskTo }
 * (defaults: action 4 weeks, task 12 weeks, both ending now).
 */
export function computeActivityIndex(projectsMap, options = {}, dirIndex = null) {
  const now = options.now || new Date();
  const actionTo = options.actionTo || now;
  const taskTo = options.taskTo || now;
  const actionFrom = options.actionFrom || weeksBefore(actionTo, DEFAULT_DASHBOARD_WINDOW.actionWeeks);
  const taskFrom = options.taskFrom || weeksBefore(taskTo, DEFAULT_DASHBOARD_WINDOW.taskWeeks);
  const actionToDay = dayOf(actionTo);
  const taskToDay = dayOf(taskTo);

  const out = new Map();
  const ensure = (raw) => {
    const id = personKey(dirIndex, raw);
    if (!out.has(id)) out.set(id, {
      pic: personLabel(dirIndex, raw), id,
      delivery: { onTime: 0, late: 0, total: 0, rate: null, weightedRate: null, hardOnTime: 0, hardTotal: 0, softOnTime: 0, softTotal: 0 },
      cadence: { activeTasks: 0, staleTasks: 0, avgDaysSinceUpdate: null },
      blocker: { resolved: 0, unresolved: 0, avgResolveDays: null },
      risk: { greenButOverdue: 0, totalReports: 0, honestyRate: null, lateBlockers: 0, earlyBlockers: 0 },
      engagement: { decisions: 0, blockersResolvedForOthers: 0, crossTaskUpdates: 0, total: 0 },
      composite: { score: null, dimensions: { delivery: null, cadence: null, risk: null, engagement: null } },
      sampleSize: { actions: 0, tasks: 0, blockers: 0, riskReports: 0 },
      activeTasks: [],
      recentFlags: [],
    });
    return out.get(id);
  };
  const cadenceDays = new Map();
  const resolveDays = new Map();
  const weighted = new Map();

  for (const project of Object.values(projectsMap || {})) {
    if (!project) continue;
    for (const action of arr(project.actionItems)) {
      if (!action.pic) continue;
      const done = action.status === 'Done';
      const dueIn = !!action.dueDate && inRange(action.dueDate, actionFrom, actionTo);
      const closedIn = done && !!action.completedAt && inRange(action.completedAt, actionFrom, actionTo);
      if (!dueIn && !closedIn) continue;
      const m = ensure(action.pic);
      m.sampleSize.actions++;
      if (action.status === 'Cancelled' || action.status === 'Dropped') continue;
      if (done) {
        if (!action.completedAt) continue; // CO-2: no completion date = not rated
        m.delivery.total++;
        if (!action.dueDate || daysBetween(action.completedAt, action.dueDate) >= 0) m.delivery.onTime++;
        else m.delivery.late++;
      } else if (action.dueDate && dayOf(action.dueDate) < actionToDay) {
        m.delivery.total++;
        m.delivery.late++;
        m.recentFlags.push({ kind: 'overdue_action', message: `Action overdue ${daysBetween(action.dueDate, actionTo)}d: ${action.title}`, ts: action.dueDate });
      }
    }

    for (const program of arr(project.programs)) {
      for (const ws of arr(program.workstreams)) {
        const mult = ws.difficultyMultiplier || 1.0;
        for (const task of arr(ws.tasks)) {
          const m = task.pic ? ensure(task.pic) : null;
          const ownerId = m ? m.id : null;
          // CO-6: engagement on any task, with or without a PIC.
          for (const u of arr(task.updates)) {
            if (u.author && personKey(dirIndex, u.author) !== ownerId && inRange(u.timestamp, taskFrom, taskTo)) {
              const who = ensure(u.author);
              who.engagement.crossTaskUpdates++;
              who.engagement.total++;
            }
            if (u.isBlocker && u.resolvedAt && u.resolvedBy && personKey(dirIndex, u.resolvedBy) !== ownerId && inRange(u.resolvedAt, taskFrom, taskTo)) {
              const helper = ensure(u.resolvedBy);
              helper.engagement.blockersResolvedForOthers++;
              helper.engagement.total++;
            }
          }
          if (!m) continue;

          const deadlineType = task.deadlineType || DEFAULT_DEADLINE_TYPE;
          const dueIn = !!task.end && inRange(task.end, taskFrom, taskTo);
          if (dueIn && task.status !== 'Dropped') {
            m.sampleSize.tasks++;
            const st = task.status || 'Planned';
            let rated = false;
            let onTime = false;
            if (st === 'Completed') {
              const handIn = taskHandInDate(task);
              if (handIn) { rated = true; onTime = daysBetween(handIn, task.end) >= 0; }
            } else if (st === 'Planned' || st === 'InProgress') {
              rated = dayOf(task.end) < taskToDay; // due and still open = late
              onTime = false;
            } // Submitted (Q3 A): not rated until decided
            if (rated) {
              if (deadlineType === 'hard') { m.delivery.hardTotal++; if (onTime) m.delivery.hardOnTime++; }
              else { m.delivery.softTotal++; if (onTime) m.delivery.softOnTime++; }
              if (!weighted.has(m.id)) weighted.set(m.id, { on: 0, all: 0 });
              const w = weighted.get(m.id);
              w.all += mult;
              if (onTime) w.on += mult;
            }
            const isLate = (st === 'Planned' || st === 'InProgress') && dayOf(task.end) < taskToDay;
            if (isLate || st === 'Completed') {
              m.sampleSize.riskReports++;
              m.risk.totalReports++;
              if (isLate && (task.health === 'green' || !task.health)) {
                m.risk.greenButOverdue++;
                m.recentFlags.push({ kind: 'risk_dishonesty', message: `Self-reported green but overdue: ${task.name}`, ts: task.end, taskId: task.id });
              }
            }
            if (isLate) {
              m.recentFlags.push({
                kind: deadlineType === 'hard' ? 'overdue_task_hard' : 'overdue_task_soft',
                message: `${deadlineType === 'hard' ? 'Task' : 'Soft target'} overdue ${daysBetween(task.end, taskTo)}d: ${task.name}`,
                ts: task.end, taskId: task.id,
              });
            }
          }

          if (task.status === 'InProgress') {
            m.cadence.activeTasks++;
            m.activeTasks.push({ project, program, workstream: ws, task });
            const latest = arr(task.updates).map((u) => new Date(u.timestamp)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => b - a)[0];
            let last = latest;
            if (!last && task.start) { const s = new Date(task.start); if (!Number.isNaN(s.getTime()) && s <= now) last = s; }
            if (last) {
              const days = Math.max(0, daysBetween(last, now));
              if (!cadenceDays.has(m.id)) cadenceDays.set(m.id, []);
              cadenceDays.get(m.id).push(days);
              if (days >= ACTIVITY_THRESHOLDS.cadence.amber) {
                m.cadence.staleTasks++;
                if (days >= ACTIVITY_THRESHOLDS.cadence.green * 2) m.recentFlags.push({ kind: 'stale_update', message: `No update for ${days}d: ${task.name}`, ts: last.toISOString(), taskId: task.id });
              }
            }
          }

          for (const u of arr(task.updates)) {
            if (!u.isBlocker || !inRange(u.timestamp, taskFrom, taskTo)) continue;
            m.sampleSize.blockers++;
            if (u.resolvedAt) {
              m.blocker.resolved++;
              if (!resolveDays.has(m.id)) resolveDays.set(m.id, []);
              resolveDays.get(m.id).push(daysBetween(u.timestamp, u.resolvedAt));
            } else {
              m.blocker.unresolved++;
              const age = daysBetween(u.timestamp, now);
              if (age >= ACTIVITY_THRESHOLDS.blocker.amber) m.recentFlags.push({ kind: 'unresolved_blocker', message: `Blocker open ${age}d: ${task.name}`, ts: u.timestamp, taskId: task.id });
            }
          }
        }
      }
    }

    for (const decision of arr(project.decisions)) {
      if (!inRange(decision.date, taskFrom, taskTo)) continue;
      for (const decider of arr(decision.decidedBy)) {
        const m = ensure(decider);
        m.engagement.decisions++;
        m.engagement.total++;
      }
    }
  }

  for (const m of out.values()) {
    if (m.delivery.total > 0) m.delivery.rate = Math.round((100 * m.delivery.onTime) / m.delivery.total);
    const w = weighted.get(m.id);
    if (w && w.all > 0) {
      const taskPart = w.on / w.all;
      m.delivery.weightedRate = m.delivery.total > 0
        ? Math.round(100 * (0.6 * (m.delivery.onTime / m.delivery.total) + 0.4 * taskPart))
        : Math.round(100 * taskPart);
    } else {
      m.delivery.weightedRate = m.delivery.rate;
    }
    const cd = cadenceDays.get(m.id);
    if (cd && cd.length) m.cadence.avgDaysSinceUpdate = Math.round(cd.reduce((a, b) => a + b, 0) / cd.length);
    const rd = resolveDays.get(m.id);
    if (rd && rd.length) m.blocker.avgResolveDays = Math.round((10 * rd.reduce((a, b) => a + b, 0)) / rd.length) / 10;
    if (m.risk.totalReports > 0) m.risk.honestyRate = Math.round(100 * (1 - m.risk.greenButOverdue / m.risk.totalReports));

    const dim = { delivery: null, cadence: null, risk: null, engagement: null };
    let totalWeight = 0;
    let sum = 0;
    const use = (k, v) => { dim[k] = v; sum += v * COMPOSITE_WEIGHTS[k]; totalWeight += COMPOSITE_WEIGHTS[k]; };
    if (sampleStatus(deliverySample(m)) === 'ok' && m.delivery.weightedRate != null) use('delivery', m.delivery.weightedRate);
    if (m.cadence.activeTasks > 0 && m.cadence.avgDaysSinceUpdate != null) use('cadence', cadenceScore(m.cadence.avgDaysSinceUpdate));
    if (sampleStatus(m.sampleSize.riskReports) === 'ok' && m.risk.honestyRate != null) use('risk', m.risk.honestyRate);
    if (m.engagement.total > 0) {
      const e = m.engagement.total;
      const v = e <= 2 ? Math.round((60 * e) / 2) : e <= 5 ? Math.round(60 + ((85 - 60) * (e - 2)) / 3) : Math.min(100, Math.round(85 + ((100 - 85) * (e - 5)) / 5));
      use('engagement', v);
    }
    m.composite.dimensions = dim;
    const qualifyingDims = Object.values(dim).filter((v) => v != null).length;
    if (totalWeight > 0 && qualifyingDims >= 2) m.composite.score = Math.round(sum / totalWeight);
    m.composite.qualifyingDims = qualifyingDims;
    m.recentFlags.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    m.recentFlags = m.recentFlags.slice(0, 5);
  }
  return out;
}

/** Current period + the previous one (same lengths, ending where the current ones start). */
export function computeActivityIndexWithTrend(projectsMap, options = {}, dirIndex = null) {
  const now = options.now || new Date();
  const aw = options.actionWeeks || DEFAULT_DASHBOARD_WINDOW.actionWeeks;
  const tw = options.taskWeeks || DEFAULT_DASHBOARD_WINDOW.taskWeeks;
  const aFrom = weeksBefore(now, aw);
  const tFrom = weeksBefore(now, tw);
  const current = computeActivityIndex(projectsMap, { now, actionFrom: aFrom, actionTo: now, taskFrom: tFrom, taskTo: now }, dirIndex);
  const prevA = new Date(aFrom.getTime() - 1);
  const prevT = new Date(tFrom.getTime() - 1);
  const previous = computeActivityIndex(projectsMap, {
    now, actionFrom: weeksBefore(aFrom, aw), actionTo: prevA, taskFrom: weeksBefore(tFrom, tw), taskTo: prevT,
  }, dirIndex);
  for (const m of current.values()) {
    const prev = previous.get(m.id);
    m.trend = {
      composite: trendOf(m.composite.score, prev?.composite?.score),
      delivery: trendOf(m.delivery.weightedRate, prev?.delivery?.weightedRate),
      cadence: trendOf(m.cadence.avgDaysSinceUpdate, prev?.cadence?.avgDaysSinceUpdate, { inverted: true }),
      risk: trendOf(m.risk.honestyRate, prev?.risk?.honestyRate),
    };
  }
  return current;
}

/** Top people who may need support (same delivery rate and sample as the table, CO-8). */
export function rankCoachingPriorities(metricsMap, limit = 3) {
  const scored = [];
  for (const m of metricsMap.values()) {
    let score = 0;
    if (sampleStatus(deliverySample(m)) === 'ok') {
      const c = bucketColor(m.delivery.weightedRate, ACTIVITY_THRESHOLDS.delivery);
      if (c === 'red') score += 3;
      else if (c === 'amber') score += 1;
    }
    if (m.cadence.activeTasks > 0) {
      const c = bucketColor(m.cadence.avgDaysSinceUpdate, ACTIVITY_THRESHOLDS.cadence, { inverted: true });
      if (c === 'red') score += 2;
      else if (c === 'amber') score += 1;
    }
    if (m.blocker.unresolved > 0) score += m.blocker.unresolved;
    if (score > 0) scored.push({ pic: m.pic, score, metrics: m });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
