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
