import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/v1-project.json';
import { splitProject } from '../../src/migrateV2.js';
import { assembleFromSnapshots } from '../../src/readV2.js';
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
