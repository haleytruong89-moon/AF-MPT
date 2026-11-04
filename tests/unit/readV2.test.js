import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/v1-project.json';
import { splitProject } from '../../src/migrateV2.js';
import { assembleFromSnapshots, appValueFromV1, appValueFromV2, loadV2Lists } from '../../src/readV2.js';
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
