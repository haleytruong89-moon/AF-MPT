import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isBriefingDismissed, dismissBriefing, lastSeenMyWork, markMyWorkSeenLocal } from '../../src/uiPrefs.js';

function stubStorage() {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
  return m;
}

describe('briefing dismiss prefs', () => {
  let store;
  beforeEach(() => { store = stubStorage(); });
  afterEach(() => { delete globalThis.localStorage; });

  it('is not dismissed by default', () => {
    expect(isBriefingDismissed('2026-11-09')).toBe(false);
  });

  it('remembers a dismissed date', () => {
    dismissBriefing('2026-11-09');
    expect(isBriefingDismissed('2026-11-09')).toBe(true);
    expect(isBriefingDismissed('2026-11-16')).toBe(false);
  });

  it('keeps only the last 10 dates', () => {
    for (let i = 1; i <= 12; i++) dismissBriefing(`2026-01-${String(i).padStart(2, '0')}`);
    expect(JSON.parse(store.get('afmpt:briefingDismissed'))).toHaveLength(10);
    expect(isBriefingDismissed('2026-01-01')).toBe(false);
    expect(isBriefingDismissed('2026-01-12')).toBe(true);
  });

  it('does not duplicate a date', () => {
    dismissBriefing('2026-11-09'); dismissBriefing('2026-11-09');
    expect(JSON.parse(store.get('afmpt:briefingDismissed'))).toEqual(['2026-11-09']);
  });

  it('survives corrupt data and a throwing storage', () => {
    store.set('afmpt:briefingDismissed', '{bad');
    expect(isBriefingDismissed('x')).toBe(false);
    globalThis.localStorage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    expect(isBriefingDismissed('x')).toBe(false);
    expect(() => dismissBriefing('x')).not.toThrow();
  });
});

describe('My Work seen prefs (O3)', () => {
  let store;
  beforeEach(() => { store = stubStorage(); });
  afterEach(() => { delete globalThis.localStorage; });

  it('round-trips per uid', () => {
    expect(lastSeenMyWork('u1')).toBeNull();
    markMyWorkSeenLocal('u1', '2026-11-12T01:00:00.000Z');
    expect(lastSeenMyWork('u1')).toBe('2026-11-12T01:00:00.000Z');
    expect(lastSeenMyWork('u2')).toBeNull();
  });
  it('no uid: nothing stored', () => {
    markMyWorkSeenLocal(null, 'x');
    expect(store.size).toBe(0);
    expect(lastSeenMyWork(null)).toBeNull();
  });
  it('storage that throws falls back quietly', () => {
    globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(() => markMyWorkSeenLocal('u1', 'x')).not.toThrow();
    expect(lastSeenMyWork('u1')).toBeNull();
  });
});
