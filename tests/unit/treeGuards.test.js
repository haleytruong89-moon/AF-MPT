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
