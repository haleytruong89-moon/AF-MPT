// Audit 25/11 wave 5 PM-24 (spec docs/superpowers/specs/2026-11-25-ux-audit-waves-design.md):
// extra Export Excel columns per task. Pure. Added after the import-template columns, so an
// exported file still imports.
const arr = (v) => (Array.isArray(v) ? v : []);
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const HEALTH = { green: 'On track', amber: 'At risk', red: 'Off track' };

/** YYYY-MM-DD of an ISO time in Vietnam (UTC+7), or ''. */
export function vnDate(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? '' : new Date(t + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** nameOf(uid) -> display name. */
export function extraTaskColumns(task, { nameOf = (u) => u || '' } = {}) {
  const t = task || {};
  const closed = t.status === 'Completed' || t.status === 'Dropped';
  const latest = [...arr(t.updates)].filter((u) => u && u.timestamp).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
  const firstChange = arr(t.deadlineHistory)[0];
  return {
    'Contributors': arr(t.contributors).filter(Boolean).join(', '),
    'Health': HEALTH[t.health] || '',
    'Closed on': closed ? vnDate(t.approvedAt) : '',
    'Approved by': closed && t.approvedByUid ? nameOf(t.approvedByUid) || '' : '',
    'Original end': firstChange && firstChange.from ? firstChange.from : '',
    'Latest update': latest ? `${vnDate(latest.timestamp)} — ${latest.author || '—'}: ${String(latest.text || '').replace(/\s+/g, ' ').slice(0, 300)}` : '',
  };
}

/** File name part for the scope: "CRP" or "CRP_Close" (unsafe characters -> _). */
export function exportFileStem(projectName, scopeName = null) {
  const safe = (s) => String(s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return scopeName ? `${safe(projectName)}_${safe(scopeName)}` : safe(projectName);
}
