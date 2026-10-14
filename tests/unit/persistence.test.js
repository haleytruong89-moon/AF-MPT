import { describe, it, expect } from 'vitest';
import { classifyReadError, checkRevision, nextRev, nextSaveState, hasUnsavedWork } from '../../src/persistence.js';

describe('classifyReadError', () => {
  it('treats permission-denied and not-found as a missing doc (create path)', () => {
    expect(classifyReadError('permission-denied')).toBe('missing');
    expect(classifyReadError('not-found')).toBe('missing');
  });
  it('treats every other failure as fatal (abort the write)', () => {
    expect(classifyReadError('unavailable')).toBe('fatal');
    expect(classifyReadError('deadline-exceeded')).toBe('fatal');
    expect(classifyReadError(undefined)).toBe('fatal');
  });
});

describe('checkRevision', () => {
  it('ok when the doc does not exist yet', () => {
    expect(checkRevision(undefined, undefined, false)).toBe('ok');
  });
  it('ok when server rev equals the rev we loaded (missing rev = 0)', () => {
    expect(checkRevision(5, 5, true)).toBe('ok');
    expect(checkRevision(undefined, 0, true)).toBe('ok');
    expect(checkRevision(undefined, undefined, true)).toBe('ok');
  });
  it('conflict when the server moved on since we loaded', () => {
    expect(checkRevision(6, 5, true)).toBe('conflict');
    expect(checkRevision(undefined, 5, true)).toBe('conflict'); // old bundle dropped rev
  });
});

describe('nextRev', () => {
  it('increments, treating missing as 0', () => {
    expect(nextRev(undefined)).toBe(1);
    expect(nextRev(4)).toBe(5);
  });
});

describe('nextSaveState', () => {
  it('records one entry per project and clears it on ok', () => {
    let s = {};
    s = nextSaveState(s, 'p1', 'error', 'CRP');
    s = nextSaveState(s, 'p1', 'error', 'CRP');
    expect(s).toEqual({ p1: { status: 'error', name: 'CRP' } });
    s = nextSaveState(s, 'p2', 'conflict', 'MA');
    expect(Object.keys(s)).toEqual(['p1', 'p2']);
    s = nextSaveState(s, 'p1', 'ok', 'CRP');
    expect(s).toEqual({ p2: { status: 'conflict', name: 'MA' } });
  });
  it('returns the same object when nothing changes (no re-render)', () => {
    const s = {};
    expect(nextSaveState(s, 'p1', 'ok', 'CRP')).toBe(s);
  });
  it('conflict is sticky: a later error does not downgrade it', () => {
    let s = nextSaveState({}, 'p1', 'conflict', 'CRP');
    s = nextSaveState(s, 'p1', 'error', 'CRP');
    expect(s.p1.status).toBe('conflict');
  });
});

describe('hasUnsavedWork', () => {
  it('true while saves are pending or any project failed', () => {
    expect(hasUnsavedWork(0, {})).toBe(false);
    expect(hasUnsavedWork(1, {})).toBe(true);
    expect(hasUnsavedWork(0, { p1: { status: 'error', name: 'X' } })).toBe(true);
  });
});
