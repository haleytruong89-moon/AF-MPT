import { describe, it, expect } from 'vitest';
import { dismissMarksSeen, shouldCheckAutoStart, isFirstVisit } from '../../src/components/Walkthrough/tourRules';
import { STEPS } from '../../src/components/Walkthrough/steps';

describe('walkthrough rules', () => {
  it('only Skip and Done mark the tour as seen; backdrop does not', () => {
    expect(dismissMarksSeen('skip')).toBe(true);
    expect(dismissMarksSeen('done')).toBe(true);
    expect(dismissMarksSeen('backdrop')).toBe(false);
  });

  it('auto-start does not depend on task count', () => {
    expect(shouldCheckAutoStart({ ready: true, uid: 'u1', localSeen: false })).toBe(true);
    expect(shouldCheckAutoStart({ ready: false, uid: 'u1', localSeen: false })).toBe(false);
    expect(shouldCheckAutoStart({ ready: true, uid: null, localSeen: false })).toBe(false);
    expect(shouldCheckAutoStart({ ready: true, uid: 'u1', localSeen: true })).toBe(false);
  });

  it('first visit = no user doc or no tourCompletedAt', () => {
    expect(isFirstVisit(null)).toBe(true);
    expect(isFirstVisit({})).toBe(true);
    expect(isFirstVisit({ tourCompletedAt: { seconds: 1 } })).toBe(false);
  });

  it('steps no longer use old role names or forced view switch', () => {
    const text = JSON.stringify(STEPS);
    expect(text).not.toMatch(/Operator|Viewer|requireView/);
  });
});
