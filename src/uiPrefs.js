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
