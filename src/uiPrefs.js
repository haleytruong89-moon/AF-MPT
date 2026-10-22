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
