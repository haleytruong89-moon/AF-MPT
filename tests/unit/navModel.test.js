import { describe, it, expect } from 'vitest';
import { PROJECT_TAB_IDS, isProjectView, viewAfterProjectClick, projectDot, projectPct, navModel, pageTitle } from '../../src/navModel.js';

const NOW = new Date(2026, 11, 10, 12, 0); // 10 Dec 2026
const T = (o) => ({ status: 'Planned', health: 'green', ...o });
const proj = (id, tasks, extra = {}) => ({ id, name: id.toUpperCase(), programs: [{ id: 'g', workstreams: [{ id: 'w', tasks }] }], ...extra });

describe('nav model', () => {
  it('NM-1 project views and where a project click lands', () => {
    expect(PROJECT_TAB_IDS).toEqual(['plan', 'actions', 'decisions', 'raid', 'dashboard']);
    for (const v of ['outline', 'mindmap', 'gantt', 'actions', 'decisions', 'raid', 'dashboard']) expect(isProjectView(v)).toBe(true);
    for (const v of ['my-work', 'portfolio', 'team-overview', 'credit-report', 'activity', null]) expect(isProjectView(v)).toBe(false);
    expect(viewAfterProjectClick('my-work', 'gantt')).toBe('gantt');
    expect(viewAfterProjectClick('portfolio', 'bogus')).toBe('outline');
    expect(viewAfterProjectClick('raid', 'gantt')).toBe('raid');
  });

  it('NM-2 health dot: grey / green / amber / red, with a text title', () => {
    expect(projectDot(proj('a', []), NOW)).toEqual({ tone: 'grey', title: 'No open task' });
    expect(projectDot(proj('a', [T({ status: 'Completed', end: '2026-01-01' })]), NOW).tone).toBe('grey');
    expect(projectDot(proj('a', [T({ end: '2026-12-31' })]), NOW)).toEqual({ tone: 'green', title: 'On track' });
    // 1 of 6 open overdue (17%): amber
    const six = [T({ end: '2026-12-01' }), ...Array.from({ length: 5 }, () => T({ end: '2026-12-31' }))];
    expect(projectDot(proj('a', six), NOW)).toEqual({ tone: 'amber', title: 'Watch: 1 overdue' });
    expect(projectDot(proj('a', [T({ end: '2026-12-31', health: 'amber' })]), NOW)).toEqual({ tone: 'amber', title: 'Watch: 1 at risk' });
    // 1 of 5 open overdue (20%): red
    expect(projectDot(proj('a', six.slice(0, 5)), NOW)).toEqual({ tone: 'red', title: 'At risk: 1 overdue' });
    expect(projectDot(proj('a', [T({ end: '2026-12-31', health: 'red' })]), NOW)).toEqual({ tone: 'red', title: 'At risk: 1 off track' });
    // Submitted and Dropped are not open
    expect(projectDot(proj('a', [T({ status: 'Submitted', end: '2026-01-01' }), T({ status: 'Dropped', end: '2026-01-01' })]), NOW).tone).toBe('grey');
  });

  it('NM-3 percent complete matches the app rollup (In Progress and Submitted count half, Dropped left out)', () => {
    expect(projectPct(proj('a', []))).toBeNull();
    expect(projectPct(proj('a', [T({ status: 'Completed' }), T({ status: 'InProgress' }), T({ status: 'Planned' }), T({ status: 'Dropped' })]))).toBe(50);
  });

  it('NM-4 sections by tier', () => {
    const projects = { a: proj('a', [T({ end: '2026-12-31' })]), b: proj('b', [], { lifecycle: 'closed' }) };
    const base = { projects, activeIds: ['a'], closedIds: ['b'], now: NOW, impersonating: false };
    const owner = navModel({ ...base, tier: 'owner' });
    expect(owner.mine.map((i) => i.id)).toEqual(['my-work', 'briefing']);
    expect(owner.management.map((i) => i.id)).toEqual(['portfolio', 'team-overview', 'credit-report', 'activity']);
    expect(owner.management.map((i) => i.label)).toEqual(['Portfolio', 'Team', 'Credits', 'Coaching']);
    expect(owner.projectTabs.map((i) => i.id)).toEqual(PROJECT_TAB_IDS);
    expect(owner.projects).toEqual([{ id: 'a', name: 'A', pct: 0, dot: { tone: 'green', title: 'On track' } }]);
    expect(owner.closed).toEqual([{ id: 'b', name: 'B' }]);
    const manager = navModel({ ...base, tier: 'manager' });
    expect(manager.management).toEqual([]);
    expect(manager.projectTabs.map((i) => i.id)).toEqual(PROJECT_TAB_IDS);
    const member = navModel({ ...base, tier: 'member' });
    expect(member.mine.map((i) => i.id)).toEqual(['my-work', 'briefing']);
    expect(member.management).toEqual([]);
  });

  it('NM-5 View as: only My Work, no projects, no management', () => {
    const m = navModel({ tier: 'owner', impersonating: true, projects: { a: proj('a', []) }, activeIds: ['a'], closedIds: [], now: NOW });
    expect(m).toEqual({ mine: [{ id: 'my-work', label: 'My Work' }], management: [], projectTabs: [], projects: [], closed: [] });
  });

  it('NM-6 page titles for pages without a project', () => {
    expect(pageTitle('my-work')).toBe('My Work');
    expect(pageTitle('credit-report')).toBe('Credits');
    expect(pageTitle('activity')).toBe('Coaching');
    expect(pageTitle('outline')).toBe('');
  });
});
