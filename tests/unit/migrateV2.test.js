import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/v1-project.json';
import { splitProject, assembleProject, taskWorkstreamOf } from '../../src/migrateV2.js';
import { buildDirectoryIndex } from '../../src/directory.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const dir = buildDirectoryIndex([
  { email: 'alice@smartosc.com', displayName: 'Alice Nguyen' },
  { email: 'bob@smartosc.com', displayName: 'Bob' },
  { email: 'carol@smartosc.com', displayName: 'Carol Tran' },
]);
// carol is invite-only (no uid)
const uidByEmail = new Map([['alice@smartosc.com', 'uid1'], ['bob@smartosc.com', 'uid2']]);
const run = (p = fixture) => splitProject(clone(p), { wid: 'main', dirIndex: dir, uidByEmail });
const roundTrip = (p) => {
  const s = run(p);
  return assembleProject(s.meta, s.workstreams, s.tasks, s.actions);
};

describe('splitProject / assembleProject', () => {
  it('round-trips the fixture exactly (order, null dates, empty program/ws, missing id)', () => {
    expect(roundTrip(fixture)).toStrictEqual(fixture);
  });
  it('round-trips even when docs come back shuffled', () => {
    const s = run();
    const rev = (a) => [...a].reverse();
    expect(assembleProject(s.meta, rev(s.workstreams), rev(s.tasks), rev(s.actions))).toStrictEqual(fixture);
  });
  it('does not mutate its input', () => {
    const p = clone(fixture);
    splitProject(p, { wid: 'main', dirIndex: dir, uidByEmail });
    expect(p).toStrictEqual(fixture);
  });
  it('counts and programMeta', () => {
    const { report, meta } = run();
    expect(report.counts).toEqual({ programs: 2, workstreams: 3, tasks: 4, actions: 2 });
    expect(meta.programMeta.pg2).toEqual({ name: 'Program Empty', order: 1, pmUid: null, deputyUid: null, start: null, end: null });
  });
  it('reports duplicate task ids and keeps both docs', () => {
    const s = run();
    expect(s.report.duplicateIds).toEqual(['t1']);
    expect(s.tasks.map((t) => t.id)).toContain('t1__dup2');
    expect(s.tasks.find((t) => t.id === 't1__dup2').data.id).toBe('t1');
  });
  it('workstream doc: v2 fields, optional ones only when present', () => {
    const { workstreams } = run();
    const w1 = workstreams.find((w) => w.id === 'w1').data;
    expect(w1).toMatchObject({
      workspaceId: 'main', projectId: 'proj_fx', programId: 'pg1', order: 0, leadUid: null, start: null, end: null,
      version: 1, difficultyPreset: 'high', weight: 40,
    });
    expect(w1.tasks).toBeUndefined();
    expect(Object.keys(workstreams.find((w) => w.id === 'w2').data)).not.toContain('weight');
  });
  it('keeps unknown workstream keys', () => {
    const p = clone(fixture);
    p.programs[0].workstreams[1].customThing = { a: 1 };
    expect(roundTrip(p)).toStrictEqual(p);
    expect(run(p).workstreams[1].data.customThing).toEqual({ a: 1 });
  });
  it('resolves pic to uid; invite-only gets picEmail only', () => {
    const { tasks, actions } = run();
    const t1 = tasks.find((t) => t.id === 't1').data;
    expect(t1.picUid).toBe('uid1');
    expect(t1.picEmail).toBe('alice@smartosc.com');
    expect(t1.pic).toBe('Alice Nguyen');
    expect(t1.contributorUids).toEqual(['uid1']); // Carol invite-only, BOD group skipped
    const a1 = actions.find((a) => a.id === 'a1').data;
    expect(a1.picUid).toBeNull();
    expect(a1.picEmail).toBe('carol@smartosc.com');
  });
  it('lists unknown names, not groups or blanks', () => {
    const { report } = run();
    expect(report.unresolved).toEqual([{ field: 'task.pic', raw: 'Zed Unknown', where: 't1' }]);
  });
  it('with no directory everything real is unresolved but the round trip holds', () => {
    const s = splitProject(clone(fixture), { wid: 'main', dirIndex: null, uidByEmail: new Map() });
    expect(s.report.unresolved.length).toBeGreaterThan(0);
    expect(s.report.unresolved.some((u) => u.raw === 'BOD')).toBe(false);
    expect(assembleProject(s.meta, s.workstreams, s.tasks, s.actions)).toStrictEqual(fixture);
  });
  it('action workstreamId from relatedTaskId, null otherwise', () => {
    const { actions } = run();
    expect(actions.find((a) => a.id === 'a1').data.workstreamId).toBe('w1');
    expect(actions.find((a) => a.id === 'a2').data.workstreamId).toBeNull();
    expect(taskWorkstreamOf(fixture).get('t2')).toEqual({ programId: 'pg1', workstreamId: 'w1' });
  });
  it('memberUids = sorted unique uids + memberIds', () => {
    expect(run().meta.memberUids).toEqual(['uid1', 'uid2', 'uidZ']);
  });
  it('reports and preserves v1 keys that collide with v2-only names', () => {
    const p = clone(fixture);
    p.programs[0].workstreams[0].tasks[0].version = 'v-old';
    p.actionItems[0].order = 99;
    const s = run(p);
    expect(s.report.collisions).toEqual([
      { kind: 'task', id: 't1', key: 'version' },
      { kind: 'action', id: 'a1', key: 'order' },
    ]);
    expect(s.tasks.find((t) => t.id === 't1').data.version).toBe(1);
    expect(roundTrip(p)).toStrictEqual(p);
  });
  it('order is the array index', () => {
    const { tasks } = run();
    expect(tasks.filter((t) => t.data.workstreamId === 'w1').map((t) => t.data.order)).toEqual([0, 1, 2]);
  });
});
