// G3 (spec docs/superpowers/specs/2026-11-25-credit-by-year-design.md): year-end credit
// snapshot. Pure. The Owner closes a credit year: the year's credit (computed as in G2) is
// frozen into workspaces/{wid}/creditYears/{Y} + people/{id} + projects/{pid}; reports for a
// closed year read the snapshot; Lifetime = closed years from snapshots + open years live.
import { closeYearOf } from './creditYears.js';
import { effortMatrix } from './effortReport.js';

export const CREDIT_TZ = 'Asia/Ho_Chi_Minh';
const arr = (v) => (Array.isArray(v) ? v : []);
const r2 = (n) => Math.round(n * 100) / 100;

function eachTask(project, fn) {
  for (const pg of arr(project?.programs)) for (const ws of arr(pg.workstreams)) for (const t of arr(ws.tasks)) fn(t, pg, ws);
}

/**
 * Things to look at before closing year Y (the Owner may close anyway):
 *  submitted: tasks waiting for approval (they will count in the year they are approved);
 *  noDate: tasks Completed with no close date counted in Y through the project's credit year;
 *  unlocked: projects with credit in Y whose weights are not locked.
 * perProject = Map<pid, { project, breakdown }> for year Y (computeWorkspaceCredits).
 */
export function yearPrecheck(projects, year, perProject = new Map()) {
  const submitted = [];
  const noDate = [];
  const unlocked = [];
  for (const p of Object.values(projects || {})) {
    if (!p) continue;
    eachTask(p, (t, pg, ws) => {
      const ref = { pid: p.id, projectName: p.name, taskId: t.id, taskName: t.name, where: `${pg.name} › ${ws.name}` };
      if (t.status === 'Submitted') submitted.push(ref);
      else if (t.status === 'Completed' && !t.approvedAt && closeYearOf(t, p) === year) noDate.push(ref);
    });
    if (perProject.has(p.id) && !p.weightsLocked) unlocked.push({ pid: p.id, name: p.name });
  }
  return { submitted, noDate, unlocked };
}

/** Firestore doc id for a person key: their uid when known, else a safe 'n_' id. */
export function personDocId(personKey, uid) {
  if (uid) return uid;
  return 'n_' + String(personKey || '').toLowerCase().replace(/[^a-z0-9@._-]+/g, '_').slice(0, 120);
}

/**
 * -> { yearDoc, people: [{ id, data }], projects: [{ id, data }] }.
 * Only earned credit is frozen (open tasks carry over to the year they close).
 * uidOf(personKey) -> uid | null. prevLog = the year doc's log so far.
 */
export function buildYearSnapshot({ perProject, year, uidOf = () => null, by, byUid = null, now = new Date().toISOString(), precheck = null, prevLog = [] }) {
  const m = effortMatrix(perProject);
  const people = [];
  for (const p of m.people) {
    const uid = uidOf(p.id) || null;
    const projects = [];
    const rows = [];
    for (const pr of m.projects) {
      const c = m.cell(p.id, pr.id);
      if (!c || (c.cp <= 0 && c.tasks <= 0)) continue;
      projects.push({ pid: pr.id, name: pr.name, cp: r2(c.cp), tasks: c.tasks });
      for (const x of c.rows) {
        if (x.open || (x.cp <= 0 && !x.lead)) continue;
        rows.push({
          pid: pr.id, projectName: pr.name, taskId: x.taskId, taskName: x.taskName || '',
          programName: x.programName || '', workstreamName: x.workstreamName || '',
          cp: r2(x.cp), share: x.share ?? null, lead: !!x.lead,
          closedOn: x.closedOn ? x.closedOn.toISOString() : null, timing: x.timing || null,
        });
      }
    }
    if (!projects.length) continue;
    people.push({
      id: personDocId(p.id, uid),
      data: { year, personKey: p.id, uid, name: p.name, cp: r2(projects.reduce((s, x) => s + x.cp, 0)), tasks: projects.reduce((s, x) => s + x.tasks, 0), projects, rows },
    });
  }
  const projects = [];
  for (const pr of m.projects) {
    const src = perProject.get(pr.id)?.project || {};
    const ppl = [];
    for (const p of m.people) {
      const c = m.cell(p.id, pr.id);
      if (c && (c.cp > 0 || c.tasks > 0)) ppl.push({ personKey: p.id, name: p.name, cp: r2(c.cp), tasks: c.tasks });
    }
    if (!ppl.length) continue;
    projects.push({
      id: pr.id,
      data: {
        year, pid: pr.id, name: pr.name, closed: !!pr.closed,
        weightsLocked: !!src.weightsLocked, creditPoints: typeof src.creditPoints === 'number' ? src.creditPoints : null,
        cp: r2(ppl.reduce((s, x) => s + x.cp, 0)), tasks: ppl.reduce((s, x) => s + x.tasks, 0), people: ppl,
      },
    });
  }
  const pc = precheck || { submitted: [], noDate: [], unlocked: [] };
  const yearDoc = {
    year, status: 'closed', closedAt: now, closedBy: by || null, closedByUid: byUid, timezone: CREDIT_TZ,
    precheck: { submitted: pc.submitted.length, noDate: pc.noDate.length, unlocked: pc.unlocked.length },
    log: [...arr(prevLog), { at: now, by: by || null, action: 'closed', people: people.length, projects: projects.length }],
    updatedAt: now,
  };
  return { yearDoc, people, projects };
}

/** Year doc patch for Reopen (reason required by the caller). */
export function reopenYearDoc(yearDoc, { by, reason, now = new Date().toISOString() }) {
  return { ...yearDoc, status: 'open', log: [...arr(yearDoc?.log), { at: now, by: by || null, action: 'reopened', reason: String(reason || '') }], updatedAt: now };
}

/**
 * Snapshot docs -> the computeWorkspaceCredits shape { totalCp, perPic, perProject } so the
 * Credits tab and the Effort report render a closed year unchanged. Rows carry the frozen
 * close date / timing (snapClosedOn / snapTiming).
 */
export function reportFromSnapshot({ year, people = [], projects = [] }) {
  const meta = new Map(projects.map((p) => [p.pid, p]));
  const perProject = new Map();
  const perPic = new Map();
  let totalCp = 0;
  for (const p of people) {
    for (const r of arr(p.rows)) {
      if (!perProject.has(r.pid)) {
        const pm = meta.get(r.pid) || {};
        perProject.set(r.pid, {
          project: { id: r.pid, name: pm.name || r.projectName, lifecycle: pm.closed ? 'closed' : 'active', weightsLocked: !!pm.weightsLocked, creditYear: year, creditPoints: pm.creditPoints ?? null },
          breakdown: [], totalCp: 0, periodCp: 0, fromSnapshot: true,
        });
      }
      const e = perProject.get(r.pid);
      e.breakdown.push({
        picId: p.personKey, picName: p.name, taskId: r.taskId, taskName: r.taskName,
        programId: r.lead ? null : 'snap:' + r.programName, programName: r.lead ? '— Project Lead —' : r.programName, workstreamId: null, workstreamName: r.workstreamName,
        sharePct: r.share ?? 100, taskCp: r.cp, actual: r.cp, projected: r.cp, credited: !r.lead, isProjectLead: !!r.lead,
        taskStatus: r.lead ? null : 'Completed', closeYear: year, snapClosedOn: r.closedOn, snapTiming: r.timing,
      });
      e.periodCp += r.cp;
      e.totalCp += r.cp;
      totalCp += r.cp;
      if (!perPic.has(p.personKey)) perPic.set(p.personKey, { earned: 0, projected: 0, name: p.name });
      const c = perPic.get(p.personKey);
      c.earned += r.cp;
      c.projected += r.cp;
    }
  }
  return { totalCp, perPic, perProject };
}

/** Sum several period reports (one per year) into one: Lifetime with closed years frozen. */
export function mergeReports(reports) {
  const perProject = new Map();
  const perPic = new Map();
  let totalCp = 0;
  for (const rep of reports) {
    if (!rep) continue;
    totalCp += rep.totalCp || 0;
    for (const [pid, e] of rep.perProject) {
      if (!perProject.has(pid)) perProject.set(pid, { ...e, breakdown: [], periodCp: 0 });
      const cur = perProject.get(pid);
      if (!e.fromSnapshot) cur.project = e.project; // live project data wins for display
      cur.breakdown = cur.breakdown.concat(e.breakdown || []);
      cur.periodCp += e.periodCp || 0;
    }
    for (const [k, v] of rep.perPic) {
      if (!perPic.has(k)) perPic.set(k, { earned: 0, projected: 0, name: v.name });
      const c = perPic.get(k);
      c.earned += v.earned;
      c.projected += v.projected;
    }
  }
  return { totalCp, perPic, perProject };
}
