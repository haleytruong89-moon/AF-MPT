import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Read the live design tokens from src/App.jsx (TOK) so a revert is caught.
const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const tok = (name) => {
  const m = app.match(new RegExp(`\\b${name}: '(#[0-9A-Fa-f]{6})'`));
  if (!m) throw new Error(`token ${name} not found in TOK`);
  return m[1];
};
const SUBTLE = tok('subtle');
const AMBER = tok('healthAmber');

describe('B4 token contrast (WCAG AA 4.5:1)', () => {
  it('subtle text on surface and bg', () => {
    expect(ratio(SUBTLE, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(SUBTLE, '#F7F5EF')).toBeGreaterThanOrEqual(4.5);
  });
  it('amber text on amber bg', () => {
    expect(ratio(AMBER, '#FBF1DC')).toBeGreaterThanOrEqual(4.5);
  });
  it('the old values fail (guards against reverting)', () => {
    expect(ratio('#95938C', '#FFFFFF')).toBeLessThan(4.5);
    expect(ratio('#B7791F', '#FBF1DC')).toBeLessThan(4.5);
  });
});
