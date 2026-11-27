import { describe, it, expect, afterEach } from 'vitest';
import { clampPanelWidth, autoRows, readNavHidden, writeNavHidden } from '../../src/uiPrefs.js';

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

describe('sidebar hidden preference', () => {
  afterEach(() => { delete globalThis.localStorage; });
  it('NH-1 default shown; the choice is remembered; bad values read as shown', () => {
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
    expect(readNavHidden()).toBe(false);
    writeNavHidden(true);
    expect(readNavHidden()).toBe(true);
    writeNavHidden(false);
    expect(readNavHidden()).toBe(false);
    m.set('afmpt:navHidden', 'garbage');
    expect(readNavHidden()).toBe(false);
  });
  it('NH-2 blocked storage: shown, and writing does not throw', () => {
    globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readNavHidden()).toBe(false);
    expect(() => writeNavHidden(true)).not.toThrow();
  });
});
