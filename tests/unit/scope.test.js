import { describe, it, expect } from 'vitest';
import { scopeAppliesTo, isCrossProjectView, validScope, scopedProject, actionInScope, decisionInScope, scopedCounts, initialScope, scopeParts, scopeOptions, managesIn } from '../../src/scope.js';

// Audit 25/11 wave 2: one scope rule.
const project = {
  id: 'p',
  programs: [
    { id: 'g1', name: 'Finance', workstreams: [{ id: 'w1', tasks: [{ id: 't1' }] }] },
    { id: 'g2', name: 'Tax', workstreams: [{ id: 'w2', tasks: [{ id: 't2' }] }] },
  ],
  actionItems: [
    { id: 'a1', relatedTaskId: 't1', status: 'Pending' },
    { id: 'a2', relatedTaskId: 't2', status: 'Pending' },
    { id: 'a3', status: 'Pending' },
    { id: 'a4', relatedTaskId: 't1', status: 'Done' },
  ],
  decisions: [
    { id: 'd1', relatedTaskIds: ['t2'] },
    { id: 'd2', relatedTaskIds: [] },
    { id: 'd3', relatedTaskIds: ['t1'], followUpStatus: 'Done' },
  ],
  __v2: { roles: { programs: { g2: { pmUid: 'u_pm' } }, workstreams: { w1: { programId: 'g1', leadUid: 'u_sub' } }, decisions: { d2: { programId: 'g1' } } } },
};
const roles = project.__v2.roles;

describe('wave 2 scope', () => {
  it('SC-1 which tabs show the scope and which are cross-project', () => {
    expect(['outline', 'mindmap', 'gantt', 'dashboard', 'actions', 'decisions', 'raid'].every(scopeAppliesTo)).toBe(true);
    expect(['my-work', 'portfolio', 'team-overview', 'credit-report', 'activity'].some(scopeAppliesTo)).toBe(false);
    expect(isCrossProjectView('my-work')).toBe(true);
    expect(isCrossProjectView('outline')).toBe(false);
  });
  it('SC-2 a stale scope id reads as all', () => {
    expect(validScope(project, 'g1')).toBe('g1');
    expect(validScope(project, 'gone')).toBeNull();
    expect(scopedProject(project, 'gone')).toBe(project);
    expect(scopedProject(project, 'g2').programs.map((p) => p.id)).toEqual(['g2']);
  });
  it('SC-3 actions by related task; no task only under all', () => {
    expect(project.actionItems.filter((a) => actionInScope(project, a, 'g1')).map((a) => a.id)).toEqual(['a1', 'a4']);
    expect(project.actionItems.filter((a) => actionInScope(project, a, null))).toHaveLength(4);
  });
  it('SC-4 decisions by stored program, else related tasks', () => {
    expect(project.decisions.filter((d) => decisionInScope(project, roles, d, 'g1')).map((d) => d.id)).toEqual(['d2', 'd3']);
    expect(project.decisions.filter((d) => decisionInScope(project, roles, d, 'g2')).map((d) => d.id)).toEqual(['d1']);
  });
  it('SC-5 tab counts are open items in scope', () => {
    expect(scopedCounts(project, roles, null)).toEqual({ actions: 3, decisions: 2 });
    expect(scopedCounts(project, roles, 'g1')).toEqual({ actions: 1, decisions: 1 });
  });
  it('SC-6 initial scope: remembered, explicit all, else my program', () => {
    expect(initialScope({ project, uid: 'u_pm', remembered: 'g1' })).toBe('g1');
    expect(initialScope({ project, uid: 'u_pm', remembered: '' })).toBeNull();
    expect(initialScope({ project, uid: 'u_pm', remembered: null })).toBe('g2');
    expect(initialScope({ project, uid: 'u_pm', remembered: 'gone' })).toBe('g2');
    expect(initialScope({ project, uid: 'u_sub', remembered: null })).toBe('ws:w1'); // R6: a Sub-PM lands on their work stream
    expect(initialScope({ project, uid: 'u_member', remembered: null })).toBeNull();
  });
});

describe('wave 2 part 2: work-stream scope (R6) and landing (R4)', () => {
  it('SC-7 a work-stream scope narrows to that work stream; stale ws reads as all', () => {
    expect(validScope(project, 'ws:w1')).toBe('ws:w1');
    expect(validScope(project, 'ws:gone')).toBeNull();
    expect(scopeParts(project, 'ws:w2')).toEqual({ programId: 'g2', wsId: 'w2' });
    const sp = scopedProject(project, 'ws:w1');
    expect(sp.programs.map((p) => [p.id, p.workstreams.map((w) => w.id)])).toEqual([['g1', ['w1']]]);
  });
  it('SC-8 actions by work stream; decisions by its program', () => {
    expect(project.actionItems.filter((a) => actionInScope(project, a, 'ws:w1')).map((a) => a.id)).toEqual(['a1', 'a4']);
    expect(project.decisions.filter((d) => decisionInScope(project, roles, d, 'ws:w1')).map((d) => d.id)).toEqual(['d2', 'd3']);
  });
  it('SC-9 options add my work streams; a Sub-PM lands on their work stream', () => {
    expect(scopeOptions(project, 'u_sub').map((o) => o.value)).toEqual(['', 'g1', 'g2', 'ws:w1']);
    expect(scopeOptions(project, 'u_pm').map((o) => o.value)).toEqual(['', 'g1', 'g2']);
    expect(initialScope({ project, uid: 'u_sub', remembered: null })).toBe('ws:w1');
    expect(initialScope({ project, uid: 'u_pm', remembered: null })).toBe('g2');
  });
  it('SC-10 managesIn', () => {
    expect(managesIn(project, 'u_sub')).toBe(true);
    expect(managesIn(project, 'u_member')).toBe(false);
  });
});
