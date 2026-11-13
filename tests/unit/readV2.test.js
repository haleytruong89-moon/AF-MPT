import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/v1-project.json';
import { splitProject } from '../../src/migrateV2.js';
import { assembleFromSnapshots, appValueFromV1, appValueFromV2, loadV2Lists, rolesFromLoaded, approvalFromDoc, loadApprovals } from '../../src/readV2.js';
import { normaliseForV2 } from '../../scripts/lib/migrate-normalise.mjs';
import { buildDirectoryIndex } from '../../src/directory.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const dir = buildDirectoryIndex([
  { email: 'alice@smartosc.com', displayName: 'Alice Nguyen' },
  { email: 'bob@smartosc.com', displayName: 'Bob' },
]);
const uidByEmail = new Map([['alice@smartosc.com', 'uid1'], ['bob@smartosc.com', 'uid2']]);
// Firestore snapshots come back as plain { id, data } after d.data(); JSON clone mimics that.
const snapshots = () => {
  const s = splitProject(clone(fixture), { wid: 'main', dirIndex: dir, uidByEmail });
  return clone({ meta: s.meta, ws: s.workstreams, tasks: s.tasks, actions: s.actions, raid: s.raid, decisions: s.decisions });
};

describe('assembleFromSnapshots (P2.2 task 4: v2 read path)', () => {
  it('rebuilds the v1 tree from sub-collection snapshots with no orphans', () => {
    const r = assembleFromSnapshots(snapshots());
    expect(r.project).toStrictEqual(fixture);
    expect(r.orphanCount).toBe(0);
    expect(r.orphans).toEqual({ workstreams: [], tasks: [], actions: [], raid: [], missingRaid: [] });
  });
  it('is order-independent (query has no orderBy)', () => {
    const s = snapshots();
    const rev = (a) => [...a].reverse();
    expect(assembleFromSnapshots({ ...s, ws: rev(s.ws), tasks: rev(s.tasks), actions: rev(s.actions), raid: rev(s.raid), decisions: rev(s.decisions) }).project).toStrictEqual(fixture);
  });
  it('surfaces orphans instead of dropping them silently', () => {
    const s = snapshots();
    s.ws.push({ id: 'wsX', data: { programId: 'nope', order: 0 } });
    s.tasks.push({ id: 'tX', data: { workstreamId: 'wsX', order: 0 } });
    s.tasks.push({ id: 'tY', data: { workstreamId: 'missing', order: 0 } });
    s.raid.push({ id: 'nope', data: { items: [] } });
    const r = assembleFromSnapshots(s);
    expect(r.orphans.workstreams).toEqual(['wsX']);
    expect(r.orphans.tasks).toEqual(['tX', 'tY']);
    expect(r.orphans.raid).toEqual(['nope']);
    expect(r.orphanCount).toBe(4);
  });
  it('counts a program whose RAID doc is missing', () => {
    const s = snapshots();
    s.raid = s.raid.slice(1);
    const r = assembleFromSnapshots(s);
    expect(r.orphans.missingRaid.length).toBe(1);
    expect(r.orphanCount).toBe(1);
  });
  it('defaults missing lists to empty', () => {
    const r = assembleFromSnapshots({ meta: { name: 'P', programMeta: {} } });
    expect(r.project.programs).toEqual([]);
    expect(r.orphanCount).toBe(0);
  });
});

describe('project read values (P2.4 task 4)', () => {
  const STRIP = ['memberIds', 'roles', 'deletedAt', 'createdBy', 'createdAt', 'updatedAt', 'rev', 'writeId'];
  it('R-1: appValueFromV1 strips ACL/rev keys, keeps order', () => {
    const rest = { name: 'N', programs: [], zeta: 1, alpha: 2 };
    const doc = { memberIds: ['u'], name: 'N', roles: {}, programs: [], deletedAt: null, createdBy: 'x', zeta: 1, createdAt: 1, updatedAt: 2, rev: 3, alpha: 2, writeId: 'w' };
    const v = appValueFromV1(doc, 'p');
    for (const k of STRIP) expect(v).not.toHaveProperty(k);
    expect(v.id).toBe('p');
    expect(JSON.stringify(v)).toBe(JSON.stringify({ id: 'p', ...rest }));
  });
  it('R-2: appValueFromV2 equals appValueFromV1 of the normalised tree', () => {
    const n = normaliseForV2(clone(fixture), { pid: 'proj_fx' });
    const s = splitProject(n.project, { wid: 'main' });
    const { project } = assembleFromSnapshots(clone({ meta: s.meta, ws: s.workstreams, tasks: s.tasks, actions: s.actions, raid: s.raid, decisions: s.decisions }));
    const v2 = appValueFromV2(project, 'proj_fx', 0);
    const { __v2, ...rest } = v2;
    expect(__v2).toEqual({ orphans: 0 });
    expect(rest).toEqual(appValueFromV1(n.project, 'proj_fx'));
  });
  it('R-3: loadV2Lists reads the 5 sub-collections in order as {id,data}', async () => {
    const calls = [];
    const fsApi = {
      collection: (...a) => { calls.push(a); return { name: a[a.length - 1] }; },
      getDocs: async (c) => ({ docs: [{ id: `${c.name}1`, data: () => ({ c: c.name }) }] }),
    };
    const r = await loadV2Lists(fsApi, 'DB', 'main', 'p');
    expect(calls).toEqual(['workstreams', 'tasks', 'actions', 'raid', 'decisions'].map((c) => ['DB', 'workspaces', 'main', 'projects', 'p', c]));
    expect(r.ws).toEqual([{ id: 'workstreams1', data: { c: 'workstreams' } }]);
    expect(r.decisions).toEqual([{ id: 'decisions1', data: { c: 'decisions' } }]);
    expect(Object.keys(r)).toEqual(['ws', 'tasks', 'actions', 'raid', 'decisions']);
  });
  it('R-3b: loadV2Lists rejects on a read error', async () => {
    const fsApi = { collection: () => ({}), getDocs: async () => { throw new Error('denied'); } };
    await expect(loadV2Lists(fsApi, 'DB', 'main', 'p')).rejects.toThrow('denied');
  });
});

describe('roles and approvals on the v2 tree (P3 task 5)', () => {
  const loadedOf = (s) => {
    const toMap = (list) => new Map(list.map(({ id, data }) => [id, { version: data.version ?? 0, data }]));
    return { meta: s.meta, docs: { workstreams: toMap(s.ws), tasks: toMap(s.tasks), actions: toMap(s.actions), raid: toMap(s.raid), decisions: toMap(s.decisions) } };
  };
  it('rolesFromLoaded maps programMeta pm/deputy/start/end, ws leadUid/programId/start/end, task picUid/contributorUids', () => {
    const s = snapshots();
    const pk = Object.keys(s.meta.programMeta)[0];
    Object.assign(s.meta.programMeta[pk], { pmUid: 'uPM', deputyUid: 'uDep', start: '2026-01-01', end: '2026-12-31' });
    const w = s.ws[0];
    Object.assign(w.data, { leadUid: 'uLead', start: '2026-02-01', end: '2026-06-30' });
    const t = s.tasks.find((x) => x.data.workstreamId === w.id);
    Object.assign(t.data, { picUid: 'uPic', contributorUids: ['uC1', 'uC2'] });
    const roles = rolesFromLoaded(loadedOf(s), ['uOwner']);
    expect(roles.ownerUids).toEqual(['uOwner']);
    expect(roles.programs[pk]).toEqual({ pmUid: 'uPM', deputyUid: 'uDep', start: '2026-01-01', end: '2026-12-31' });
    expect(roles.workstreams[w.id]).toEqual({ programId: w.data.programId, leadUid: 'uLead', start: '2026-02-01', end: '2026-06-30' });
    expect(roles.tasks[t.id]).toEqual({ programId: t.data.programId, workstreamId: w.id, picUid: 'uPic', contributorUids: ['uC1', 'uC2'] });
    expect(Object.keys(roles.programs).sort()).toEqual(Object.keys(s.meta.programMeta).sort());
    expect(Object.keys(roles.workstreams).sort()).toEqual(s.ws.map((x) => x.id).sort());
    expect(Object.keys(roles.tasks).sort()).toEqual(s.tasks.map((x) => x.id).sort());
    // program keys equal tree program ids
    const { project } = assembleFromSnapshots(s);
    expect(project.programs.map((p) => p.id).sort()).toEqual(Object.keys(roles.programs).sort());
  });
  it('rolesFromLoaded with missing fields yields null / []', () => {
    const loaded = {
      meta: { programMeta: { pA: { order: 0 } } },
      docs: {
        workstreams: new Map([['wA', { version: 1, data: {} }]]),
        tasks: new Map([['tA', { version: 1, data: { contributorUids: null } }]]),
        actions: new Map(), raid: new Map(), decisions: new Map(),
      },
    };
    const roles = rolesFromLoaded(loaded, undefined);
    expect(roles).toEqual({
      ownerUids: [],
      programs: { pA: { pmUid: null, deputyUid: null, start: null, end: null } },
      workstreams: { wA: { programId: null, leadUid: null, start: null, end: null } },
      tasks: { tA: { programId: null, workstreamId: null, picUid: null, contributorUids: [] } },
      decisions: {},
    });
    expect(rolesFromLoaded({ meta: {}, docs: { workstreams: new Map(), tasks: new Map() } }, ['o']).programs).toEqual({});
  });
  it('rolesFromLoaded: decisions[id].programId = the stored claim program (W2 R5, Ruling W2-4)', () => {
    const loaded = {
      meta: { programMeta: { pA: { order: 0 } } },
      docs: {
        workstreams: new Map([['wA', { version: 1, data: { programId: 'pA' } }]]),
        tasks: new Map(),
        decisions: new Map([
          ['dP', { version: 1, data: { viaProgramId: 'pA' } }],
          ['dW', { version: 1, data: { viaWorkstreamId: 'wA' } }],
          ['dGone', { version: 1, data: { viaWorkstreamId: 'wMissing' } }],
          ['dNone', { version: 1, data: {} }],
        ]),
      },
    };
    expect(rolesFromLoaded(loaded, []).decisions).toEqual({
      dP: { programId: 'pA' }, dW: { programId: 'pA' }, dGone: { programId: null }, dNone: { programId: null },
    });
  });
  it('rolesFromLoaded does not alias the loaded data', () => {
    const s = snapshots();
    const loaded = loadedOf(s);
    const t = s.tasks[0];
    t.data.contributorUids = ['x'];
    const owners = ['o'];
    const roles = rolesFromLoaded(loaded, owners);
    roles.tasks[t.id].contributorUids.push('y');
    roles.ownerUids.push('z');
    expect(t.data.contributorUids).toEqual(['x']);
    expect(owners).toEqual(['o']);
  });
  it('approvalFromDoc turns timestamps into ISO strings and keeps version', () => {
    const ts = (iso) => ({ toDate: () => new Date(iso) });
    const a = approvalFromDoc('r1', { kind: 'plan_import', status: 'pending', createdAt: ts('2026-11-01T02:03:04.000Z'), decidedAt: ts('2026-11-02T00:00:00.000Z'), version: 2, payload: { a: 1 } });
    expect(a).toEqual({ id: 'r1', kind: 'plan_import', status: 'pending', createdAt: '2026-11-01T02:03:04.000Z', decidedAt: '2026-11-02T00:00:00.000Z', version: 2, payload: { a: 1 } });
    const b = approvalFromDoc('r2', { kind: 'scope_deadline', createdAt: null });
    expect(b).toEqual({ id: 'r2', kind: 'scope_deadline', createdAt: null, decidedAt: null, version: 0 });
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(approvalFromDoc('r3', { updatedAt: ts('2026-11-04T00:00:00.000Z') }).updatedAt).toBe('2026-11-04T00:00:00.000Z');
  });
  it('loadApprovals reads projects/{pid}/approvals; a read error rejects', async () => {
    const calls = [];
    const fsApi = {
      collection: (...a) => { calls.push(a); return {}; },
      getDocs: async () => ({ docs: [{ id: 'r1', data: () => ({ kind: 'mitigation_done', version: 1, createdAt: { toDate: () => new Date('2026-11-03T00:00:00.000Z') } }) }] }),
    };
    expect(await loadApprovals(fsApi, 'DB', 'main', 'p')).toEqual([
      { id: 'r1', kind: 'mitigation_done', version: 1, createdAt: '2026-11-03T00:00:00.000Z', decidedAt: null },
    ]);
    expect(calls).toEqual([['DB', 'workspaces', 'main', 'projects', 'p', 'approvals']]);
    const bad = { collection: () => ({}), getDocs: async () => { throw new Error('denied'); } };
    await expect(loadApprovals(bad, 'DB', 'main', 'p')).rejects.toThrow('denied');
  });
  it('appValueFromV2 adds roles / approvals under __v2 only; other keys unchanged', () => {
    const s = snapshots();
    const { project } = assembleFromSnapshots(clone(s));
    const base = appValueFromV2(clone(project), 'p', 0);
    const roles = rolesFromLoaded(loadedOf(s), ['o']);
    const withExtras = appValueFromV2(clone(project), 'p', 0, { roles, approvals: null });
    const { __v2: a, ...restA } = base;
    const { __v2: b, ...restB } = withExtras;
    expect(JSON.stringify(restB)).toBe(JSON.stringify(restA));
    expect(a).toEqual({ orphans: 0 });
    expect(b).toEqual({ orphans: 0, roles, approvals: null });
  });
});
