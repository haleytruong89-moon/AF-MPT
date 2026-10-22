import { describe, it, expect } from 'vitest';
import { clampPanelWidth, autoRows } from '../../src/uiPrefs.js';

describe('clampPanelWidth', () => {
  it('defaults to 400 for missing or garbage values', () => {
    expect(clampPanelWidth(undefined)).toBe(400);
    expect(clampPanelWidth('abc')).toBe(400);
    expect(clampPanelWidth(null)).toBe(400);
  });
  it('clamps to 360..900 and rounds', () => {
    expect(clampPanelWidth(100)).toBe(360);
    expect(clampPanelWidth('2000')).toBe(900);
    expect(clampPanelWidth(512.6)).toBe(513);
  });
});

describe('autoRows', () => {
  it('grows with lines and long text, within bounds', () => {
    expect(autoRows('')).toBe(3);
    expect(autoRows('a\nb\nc\nd\ne')).toBe(5);
    expect(autoRows('x'.repeat(60 * 8))).toBe(8);
    expect(autoRows('\n'.repeat(40))).toBe(14);
  });
});
