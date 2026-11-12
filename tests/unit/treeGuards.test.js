import { describe, it, expect } from 'vitest';
import { taskCountUnder, splitRestoreByV2, DELETE_HAS_TASKS_MESSAGE, V2_RESTORE_MESSAGE } from '../../src/treeGuards.js';

describe('treeGuards', () => {
  it('counts tasks under a program across work streams, dropped included', () => {
    expect(taskCountUnder({ workstreams: [{ tasks: [{ status: 'Dropped' }] }, { tasks: [{}, {}] }] })).toBe(3);
  });
  it('counts tasks under a work stream', () => { expect(taskCountUnder({ tasks: [{}] })).toBe(1); });
  it('is 0 for empty / missing', () => { expect(taskCountUnder({})).toBe(0); expect(taskCountUnder({ workstreams: [{}] })).toBe(0); expect(taskCountUnder(null)).toBe(0); });
  it('has the spec copy', () => {
    expect(DELETE_HAS_TASKS_MESSAGE).toBe('Move or drop its tasks first. Dropped tasks keep their history.');
    expect(V2_RESTORE_MESSAGE).toMatch(/^This project uses the new storage\./);
  });
  it('splits restore ids by v2 (backup, live, both v1, missing entry)', () => {
    const data = { meta: { projectIds: ['a', 'b', 'c', 'd'] }, projects: { a: { schemaVersion: 2 }, b: {}, c: {} } };
    expect(splitRestoreByV2(data, { b: { __v2: {} }, c: {} })).toEqual({ v1Ids: ['c'], v2Ids: ['a', 'b'] });
    expect(splitRestoreByV2({ meta: { projectIds: ['x'] }, projects: {} }, {})).toEqual({ v1Ids: [], v2Ids: [] });
  });
});

import { activityToRestore } from '../../src/treeGuards.js';
describe('activityToRestore', () => {
  it('ok + non-empty list -> true', () => expect(activityToRestore('ok', [{ id: 'a' }])).toBe(true));
  it('ok + empty list -> false', () => expect(activityToRestore('ok', [])).toBe(false));
  it('non-ok status -> false', () => {
    for (const s of ['conflict', 'denied', 'readonly', 'error']) expect(activityToRestore(s, [{ id: 'a' }])).toBe(false);
  });
  it('missing or non-array list -> false', () => {
    expect(activityToRestore('ok', undefined)).toBe(false);
    expect(activityToRestore('ok', null)).toBe(false);
    expect(activityToRestore('ok', 'x')).toBe(false);
  });
});
