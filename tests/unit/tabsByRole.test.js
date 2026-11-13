import { describe, it, expect, afterEach } from 'vitest';
import { uiTier, tabsFor, canSeeView, landingFor, isPlanView } from '../../src/tabsByRole.js';
import { readPlanView, writePlanView } from '../../src/uiPrefs.js';

const proj = (roles, programs = []) => ({ __v2: { roles }, programs });
const programs = [
  { id: 'pgA', workstreams: [{ id: 'ws1' }] },
  { id: 'pgB', workstreams: [{ id: 'ws2' }] },
];

describe('uiTier', () => {
  it('owner wins', () => {
    expect(uiTier({ isOwner: true, projects: {}, uid: 'u' })).toBe('owner');
  });
  it('PM, Deputy and Sub-PM are managers', () => {
    expect(uiTier({ isOwner: false, uid: 'u', projects: { p: proj({ programs: { pgA: { pmUid: 'u' } } }) } })).toBe('manager');
    expect(uiTier({ isOwner: false, uid: 'u', projects: { p: proj({ programs: { pgA: { deputyUid: 'u' } } }) } })).toBe('manager');
    expect(uiTier({ isOwner: false, uid: 'u', projects: { p: proj({ workstreams: { ws1: { leadUid: 'u' } } }) } })).toBe('manager');
  });
  it('assignee, v1 projects and missing uid are members', () => {
    expect(uiTier({ isOwner: false, uid: 'u', projects: { p: proj({ tasks: { t: { picUid: 'u' } } }) } })).toBe('member');
    expect(uiTier({ isOwner: false, uid: 'u', projects: { p: { programs } } })).toBe('member');
    expect(uiTier({ isOwner: false, uid: null, projects: { p: proj({ programs: { pgA: { pmUid: null } } }) } })).toBe('member');
  });
});

describe('tabsFor', () => {
  const ids = (tier) => tabsFor(tier).map((t) => t.id);
  it('owner', () => {
    expect(ids('owner')).toEqual(['plan', 'my-work', 'actions', 'decisions', 'raid', 'portfolio', 'dashboard', 'team-overview', 'briefing', 'credit-report', 'activity']);
  });
  it('manager', () => {
    expect(ids('manager')).toEqual(['plan', 'my-work', 'actions', 'decisions', 'raid', 'dashboard', 'briefing']);
  });
  it('member', () => {
    expect(ids('member')).toEqual(['my-work', 'plan', 'actions', 'decisions', 'raid', 'dashboard']);
  });
  it('no aggregation for anyone, groups increase', () => {
    for (const tier of ['owner', 'manager', 'member']) {
      expect(ids(tier)).not.toContain('aggregation');
      const g = tabsFor(tier).map((t) => t.group);
      expect([...g].sort((a, b) => a - b)).toEqual(g);
    }
  });
});

describe('canSeeView', () => {
  it('maps plan sub-views to Plan', () => {
    expect(canSeeView('member', 'gantt')).toBe(true);
    expect(isPlanView('mindmap')).toBe(true);
  });
  it('hides owner tabs and briefing', () => {
    expect(canSeeView('member', 'activity')).toBe(false);
    expect(canSeeView('manager', 'portfolio')).toBe(false);
    expect(canSeeView('owner', 'aggregation')).toBe(false);
    expect(canSeeView('owner', 'briefing')).toBe(false);
  });
});

describe('landingFor', () => {
  const pmProject = proj({ programs: { pgB: { pmUid: 'u' } } }, programs);
  it('by tier', () => {
    expect(landingFor({ tier: 'owner' })).toEqual({ view: 'portfolio', scopeProgramId: null });
    expect(landingFor({ tier: 'member' })).toEqual({ view: 'my-work', scopeProgramId: null });
    expect(landingFor({ tier: 'manager', planView: 'gantt', project: pmProject, uid: 'u' })).toEqual({ view: 'gantt', scopeProgramId: 'pgB' });
  });
  it('Sub-PM lands on the program containing their work stream', () => {
    const p = proj({ workstreams: { ws2: { leadUid: 'u' } } }, programs);
    expect(landingFor({ tier: 'manager', project: p, uid: 'u' })).toEqual({ view: 'outline', scopeProgramId: 'pgB' });
  });
  it('manager: unknown program or no project gives no filter', () => {
    const p = proj({ programs: { pgZ: { pmUid: 'u' } } }, programs);
    expect(landingFor({ tier: 'manager', project: p, uid: 'u' }).scopeProgramId).toBe(null);
    expect(landingFor({ tier: 'manager', project: null, uid: 'u' })).toEqual({ view: 'outline', scopeProgramId: null });
  });
  it('override honoured only when visible', () => {
    expect(landingFor({ tier: 'member', override: 'dashboard' }).view).toBe('dashboard');
    expect(landingFor({ tier: 'member', override: 'activity' }).view).toBe('my-work');
    expect(landingFor({ tier: 'owner', override: 'aggregation' }).view).toBe('portfolio');
  });
});

describe('plan view pref', () => {
  afterEach(() => { delete globalThis.localStorage; });
  it('defaults to outline and survives a throwing storage', () => {
    globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readPlanView()).toBe('outline');
    expect(() => writePlanView('gantt')).not.toThrow();
  });
  it('remembers a valid choice and ignores junk', () => {
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
    writePlanView('gantt');
    expect(readPlanView()).toBe('gantt');
    writePlanView('aggregation');
    expect(readPlanView()).toBe('gantt');
    m.set('afmpt:planView', 'junk');
    expect(readPlanView()).toBe('outline');
  });
});
