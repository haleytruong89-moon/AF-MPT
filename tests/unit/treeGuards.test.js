import { describe, it, expect } from 'vitest';
import { taskCountUnder, restoreTouchesV2, DELETE_HAS_TASKS_MESSAGE, V2_RESTORE_MESSAGE } from '../../src/treeGuards.js';

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
  it('detects v2 from backup schemaVersion or loaded __v2', () => {
    const data = { meta: { projectIds: ['a', 'b'] }, projects: { a: { schemaVersion: 2 }, b: {} } };
    expect(restoreTouchesV2(data, {})).toBe(true);
    const data2 = { meta: { projectIds: ['b'] }, projects: { a: {}, b: {} } };
    expect(restoreTouchesV2(data2, { b: { __v2: {} } })).toBe(true);
    expect(restoreTouchesV2(data2, { b: {}, c: { __v2: {} } })).toBe(false);
  });
});
