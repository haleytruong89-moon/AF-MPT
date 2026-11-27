// B4 UI helpers (pure).
export const PANEL_MIN = 360;
export const PANEL_MAX = 900;
export const PANEL_DEFAULT = 400;

export function clampPanelWidth(raw) {
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  if (!Number.isFinite(n)) return PANEL_DEFAULT;
  return Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, n)));
}

// Rows for an auto-growing textarea: one per line, wrapping at ~60 chars.
export function autoRows(text, min = 3, max = 14) {
  const lines = String(text || '').split('\n')
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 60)), 0);
  return Math.min(max, Math.max(min, lines));
}

// U7: "dismiss the Monday briefing" is personal to this browser, not shared state.
const BRIEFING_KEY = 'afmpt:briefingDismissed';

function readBriefingDates() {
  try {
    const v = JSON.parse(localStorage.getItem(BRIEFING_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function isBriefingDismissed(dateISO) {
  return readBriefingDates().includes(dateISO);
}

export function dismissBriefing(dateISO) {
  try {
    const list = readBriefingDates().filter((d) => d !== dateISO);
    list.push(dateISO);
    localStorage.setItem(BRIEFING_KEY, JSON.stringify(list.slice(-10)));
  } catch { /* storage unavailable: dismissal lasts for this session only */ }
}

// Wave 2 O3: "My Work seen" is personal to this browser (uid-namespaced), not shared workspace state.
const seenKey = (uid) => 'afmpt:myWorkSeen:' + uid;

export function lastSeenMyWork(uid) {
  if (!uid) return null;
  try { return localStorage.getItem(seenKey(uid)) || null; } catch { return null; }
}

export function markMyWorkSeenLocal(uid, iso) {
  if (!uid) return;
  try { localStorage.setItem(seenKey(uid), iso); } catch { /* storage unavailable: marker lasts for this session only */ }
}

// P4: last Plan sub-view (Mind map / Outline / Gantt), personal to this browser.
const PLAN_VIEW_KEY = 'afmpt:planView';
const PLAN_SUBVIEWS = ['mindmap', 'outline', 'gantt'];

export function readPlanView() {
  try {
    const v = localStorage.getItem(PLAN_VIEW_KEY);
    return PLAN_SUBVIEWS.includes(v) ? v : 'outline';
  } catch { return 'outline'; }
}

export function writePlanView(v) {
  if (!PLAN_SUBVIEWS.includes(v)) return;
  try { localStorage.setItem(PLAN_VIEW_KEY, v); } catch { /* storage unavailable: choice lasts for this session only */ }
}

// Nav shell (spec 2026-11-27): the sidebar hidden / shown choice, per browser.
const NAV_HIDDEN_KEY = 'afmpt:navHidden';
export function readNavHidden() {
  try { return localStorage.getItem(NAV_HIDDEN_KEY) === '1'; } catch { return false; }
}
export function writeNavHidden(hidden) {
  try { localStorage.setItem(NAV_HIDDEN_KEY, hidden ? '1' : '0'); } catch { /* storage unavailable: lasts for this session only */ }
}

// Audit 25/11 wave 2 (R3): the scope (program) last chosen per project, per browser.
const SCOPE_KEY = (pid) => `afmpt.scope.${pid}`;
/** -> program id, '' (explicit "All programs"), or null (never chosen). */
export function readScope(pid) {
  if (!pid) return null;
  try {
    const v = localStorage.getItem(SCOPE_KEY(pid));
    return v === null ? null : v;
  } catch { return null; }
}
export function writeScope(pid, programId) {
  if (!pid) return;
  try { localStorage.setItem(SCOPE_KEY(pid), programId || ''); } catch { /* storage unavailable: choice lasts for this session only */ }
}
