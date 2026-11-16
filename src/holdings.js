// W3-D1 (O13): what a person still holds before the Owner deactivates them. Pure.
const arr = (v) => (Array.isArray(v) ? v : []);
const OPEN_TASK = new Set(['Planned', 'InProgress', 'Submitted']);
const CLOSED_ACTION = new Set(['Done', 'Cancelled', 'Dropped']);

/**
 * projects = { [pid]: tree }; uid = the person's uid (may be null for an invite);
 * personKeyOf(raw) -> true when a stored person string is this person.
 * -> { roles: string[], openTasks, openActions, approvalsWaiting }
 */
export function personHoldings(projects, uid, isPerson = () => false) {
  const out = { roles: [], openTasks: 0, openActions: 0, approvalsWaiting: 0 };
  for (const p of Object.values(projects || {})) {
    if (!p) continue;
    const roles = p.__v2?.roles || null;
    if (uid && roles) {
      const pgName = new Map(arr(p.programs).map((g) => [g.id, g.name]));
      const wsName = new Map(arr(p.programs).flatMap((g) => arr(g.workstreams)).map((w) => [w.id, w.name]));
      for (const [id, m] of Object.entries(roles.programs || {})) {
        if (m?.pmUid === uid) out.roles.push(`PM of ${pgName.get(id) || id} (${p.name})`);
        if (m?.deputyUid === uid) out.roles.push(`Deputy of ${pgName.get(id) || id} (${p.name})`);
      }
      for (const [id, w] of Object.entries(roles.workstreams || {})) {
        if (w?.leadUid === uid) out.roles.push(`Sub-PM of ${wsName.get(id) || id} (${p.name})`);
      }
    }
    for (const g of arr(p.programs)) {
      for (const w of arr(g.workstreams)) {
        for (const t of arr(w.tasks)) {
          const status = t?.status || 'Planned';
          const stored = roles?.tasks?.[t.id]?.picUid ?? null;
          const mine = (uid && stored === uid) || isPerson(t?.pic);
          if (mine && OPEN_TASK.has(status)) out.openTasks++;
          if (uid && status === 'Submitted' && t?.closeRequest?.approverUid === uid) out.approvalsWaiting++;
        }
      }
    }
    for (const a of arr(p.actionItems)) {
      if (CLOSED_ACTION.has(a?.status)) continue;
      const stored = roles?.actions?.[a.id]?.picUid ?? null;
      if ((uid && stored === uid) || isPerson(a?.pic)) out.openActions++;
    }
  }
  return out;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** One sentence, or '' when the person holds nothing. */
export function holdingsText(h) {
  if (!h) return '';
  const parts = [];
  if (h.roles.length) parts.push(h.roles.join(', '));
  if (h.openTasks) parts.push(plural(h.openTasks, 'open task'));
  if (h.openActions) parts.push(plural(h.openActions, 'open action'));
  if (h.approvalsWaiting) parts.push(plural(h.approvalsWaiting, 'close request') + ' waiting for their approval');
  return parts.length ? `They still hold: ${parts.join('; ')}.` : '';
}
