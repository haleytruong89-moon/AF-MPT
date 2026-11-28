import { describe, it, expect } from 'vitest';
import { TOK, NAV, FONT_STACK } from '../../src/theme.js';

describe('theme tokens', () => {
  it('TH-1 every colour used by App.jsx exists', () => {
    for (const k of ['bg', 'surface', 'ink', 'muted', 'subtle', 'line', 'lineStrong', 'accent',
      'plannedFg', 'plannedBg', 'inprogFg', 'inprogBg', 'doneFg', 'doneBg', 'droppedFg', 'droppedBg',
      'overdueFg', 'overdueBg', 'programFg', 'programBg', 'workstreamFg', 'workstreamBg', 'projectFg', 'projectBg',
      'healthGreen', 'healthGreenBg', 'healthAmber', 'healthAmberBg', 'healthRed', 'healthRedBg',
      'mention', 'mentionBg', 'blocker', 'blockerBg', 'danger', 'hl']) {
      expect(typeof TOK[k], k).toBe('string');
    }
    expect(NAV.width).toBe(240);
    expect(FONT_STACK).toContain('sans-serif');
  });
});

// WCAG relative luminance and contrast ratio for #rrggbb.
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('SmartOSC theme', () => {
  it('TH-2 brand values', () => {
    expect(TOK.accent).toBe('#295CA9');
    expect(TOK.bg).toBe('#F4F7FB');
    expect(NAV.bg).toBe('#0F1B33');
  });
  it('TH-3 every text / background pair reaches 4.5:1', () => {
    const pairs = [
      ['ink', 'bg'], ['ink', 'surface'], ['muted', 'bg'], ['muted', 'surface'], ['subtle', 'bg'], ['subtle', 'surface'],
      ['accent', 'bg'], ['accent', 'surface'],
      ['plannedFg', 'plannedBg'], ['inprogFg', 'inprogBg'], ['doneFg', 'doneBg'], ['droppedFg', 'droppedBg'], ['overdueFg', 'overdueBg'],
      ['programFg', 'programBg'], ['workstreamFg', 'workstreamBg'], ['projectFg', 'projectBg'],
      ['healthGreen', 'healthGreenBg'], ['healthAmber', 'healthAmberBg'], ['healthRed', 'healthRedBg'],
      ['mention', 'mentionBg'], ['blocker', 'blockerBg'], ['submittedFg', 'submittedBg'], ['overdueFg', 'surface'], ['doneFg', 'surface'], ['inprogFg', 'surface'], ['danger', 'surface'],
    ];
    for (const [fg, bg] of pairs) expect(ratio(TOK[fg], TOK[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    for (const fg of ['fg', 'muted', 'activeFg']) expect(ratio(NAV[fg], NAV.bg), `nav ${fg}`).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#FFFFFF', TOK.accent)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#FFFFFF', TOK.overdueFg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('no old palette left in the UI', () => {
  it('TH-4 login, error screens, walkthrough and components use the tokens', async () => {
    const fs = await import('fs');
    const files = ['src/auth.tsx', 'src/main.tsx', 'src/components/Walkthrough/Walkthrough.jsx', 'src/components/GanttView.tsx',
      'src/components/AppSidebar.jsx', 'src/components/TopBar.jsx', 'src/components/RootErrorBoundary.tsx'];
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      for (const old of ['Geist', '#F7F5EF', '#1A1A19', '#6E6C66', '#3B6D11', 'rgba(26,26,25']) expect(s.includes(old), `${f} has ${old}`).toBe(false);
    }
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    expect(app.includes('Geist')).toBe(false);
    expect(/rgba\(59,\s*109,\s*17/.test(app), 'old green accent tint').toBe(false);
  });
});
