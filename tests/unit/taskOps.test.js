import { describe, it, expect } from 'vitest';
import { taskWithStatus } from '../../src/taskOps.js';

const project = (task) => ({ id: 'p1', programs: [{ id: 'pg', workstreams: [{ id: 'ws', tasks: [task] }] }] });

describe('taskWithStatus (B4 fix: Undo uses the CURRENT task, not a stale copy)', () => {
  it('keeps edits made after the original click and only changes status', () => {
    const current = project({ id: 't1', name: 'T', status: 'Completed', updates: [{ id: 'u2' }, { id: 'u1' }] });
    expect(taskWithStatus(current, 't1', 'InProgress')).toEqual({ id: 't1', name: 'T', status: 'InProgress', updates: [{ id: 'u2' }, { id: 'u1' }] });
  });
  it('returns null when the task no longer exists', () => {
    expect(taskWithStatus(project({ id: 't1', status: 'Completed' }), 'nope', 'Planned')).toBeNull();
    expect(taskWithStatus(undefined, 't1', 'Planned')).toBeNull();
  });
});
