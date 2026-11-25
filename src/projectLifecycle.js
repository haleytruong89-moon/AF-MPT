// G4 (spec docs/superpowers/specs/2026-11-25-credit-by-year-design.md): project Closed / Reopen
// and "Copy structure from last year". Pure.
const arr = (v) => (Array.isArray(v) ? v : []);
const OPEN = new Set(['Planned', 'InProgress', 'Submitted']);

export const isClosedProject = (p) => p?.lifecycle === 'closed';

/** Tasks that block closing (still open), in tree order: [{ task, program, workstream }]. */
export function openTasksOf(project) {
  const out = [];
  for (const program of arr(project?.programs)) {
    for (const workstream of arr(program.workstreams)) {
      for (const task of arr(workstream.tasks)) if (OPEN.has(task?.status || 'Planned')) out.push({ task, program, workstream });
    }
  }
  return out;
}

/** Closed: the given patch; open tasks refuse (the caller lists them). */
export function closePatch(project, { by, now = new Date().toISOString() }) {
  const open = openTasksOf(project);
  if (open.length) return { ok: false, open };
  return { ok: true, project: { ...project, lifecycle: 'closed', closedAt: now, closedBy: by || null } };
}
export function reopenPatch(project) {
  return { ...project, lifecycle: 'active', closedAt: null, closedBy: null };
}

/** Next year's name: the last 4-digit year + 1, else "<name> (copy)". */
export function nextYearName(name) {
  const s = String(name || '').trim();
  const m = /(19|20)\d{2}(?!.*(19|20)\d{2})/.exec(s);
  if (!m) return `${s} (copy)`;
  return s.slice(0, m.index) + String(Number(m[0]) + 1) + s.slice(m.index + 4);
}

/**
 * Structure of `source` for a new project: programs and work streams (names, weights),
 * no tasks / actions / decisions / RAID / dates. idOf(kind) makes new ids. Returns
 * { programs, roleMoves } where roleMoves = [{ kind, programId, wsId?, toUid }] from the
 * source roles (v2) mapped to the new ids.
 */
export function copyStructure(source, { idOf, roles = null }) {
  const programs = [];
  const roleMoves = [];
  for (const pg of arr(source?.programs)) {
    const pid = idOf('pg');
    const workstreams = arr(pg.workstreams).map((ws) => {
      const wid = idOf('ws');
      const lead = roles?.workstreams?.[ws.id]?.leadUid;
      if (lead) roleMoves.push({ kind: 'lead', programId: pid, wsId: wid, toUid: lead });
      return { id: wid, name: ws.name, ...(typeof ws.weight === 'number' ? { weight: ws.weight } : {}), tasks: [] };
    });
    const m = roles?.programs?.[pg.id];
    if (m?.pmUid) roleMoves.push({ kind: 'pm', programId: pid, toUid: m.pmUid });
    if (m?.deputyUid) roleMoves.push({ kind: 'deputy', programId: pid, toUid: m.deputyUid });
    programs.push({ id: pid, name: pg.name, ...(typeof pg.weight === 'number' ? { weight: pg.weight } : {}), workstreams, raid: [] });
  }
  return { programs, roleMoves };
}
