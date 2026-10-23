import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/v1-project.json';
import { splitProject, assembleProject } from '../../src/migrateV2.js';
import { buildDirectoryIndex } from '../../src/directory.js';
import { planV2Save, DELETE_FIELD } from '../../src/planV2Save.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const dirIndex = buildDirectoryIndex([
  { email: 'alice@smartosc.com', displayName: 'Alice Nguyen' },
  { email: 'bob@smartosc.com', displayName: 'Bob' },
  { email: 'carol@smartosc.com', displayName: 'Carol Tran' },
]);
const uidByEmail = new Map([['alice@smartosc.com', 'uid1'], ['bob@smartosc.com', 'uid2']]);

// Stored v2 state: the split fixture with role data, version 3 everywhere,
// plus stale stamps / claims as the read path would return them.
function makeLoaded() {
  const s = splitProject(clone(fixture), { wid: 'main', dirIndex, uidByEmail });
  s.meta.programMeta.pg1.pmUid = 'uidPM';
  s.meta.programMeta.pg2.deputyUid = 'uidPM2';
  const toMap = (list) => new Map(list.map(({ id, data }) => [id, {
    version: 3, data: { ...data, version: 3, updatedBy: 'someone', updatedAt: 123 },
  }]));
  const docs = {
    workstreams: toMap(s.workstreams),
    tasks: toMap(s.tasks),
    actions: toMap(s.actions),
    raid: toMap(s.raid),
    decisions: toMap(s.decisions),
  };
  docs.workstreams.get('w3').data.leadUid = 'uidLead';
  docs.raid.get('pg1').data.viaProgramId = 'stale';
  return { meta: s.meta, docs };
}
const treeOf = (loaded) => {
  const list = (m) => [...m.entries()].map(([id, e]) => ({ id, data: e.data }));
  const d = loaded.docs;
  return clone(assembleProject(loaded.meta, list(d.workstreams), list(d.tasks), list(d.actions), list(d.raid), list(d.decisions)).project);
};
const ctx = (over = {}) => ({ uid: 'uid1', wid: 'main', pid: 'proj_fx', isOwner: false, dirIndex, uidByEmail, ...over });
const ws1 = (tree) => tree.programs[0].workstreams[0];
const allOps = (r) => r.batches.flat();

describe('planV2Save', () => {
  it('unchanged tree -> no ops, no metaPatch', () => {
    const loaded = makeLoaded();
    const r = planV2Save(loaded, treeOf(loaded), ctx());
    expect(r).toEqual({ batches: [], metaPatch: null, refused: null });
  });

  it('one task edited -> one update with expectVersion', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    ws1(tree).tasks[1].status = 'Done';
    const r = planV2Save(loaded, tree, ctx());
    expect(r.refused).toBeNull();
    expect(r.batches).toHaveLength(1);
    expect(r.batches[0]).toHaveLength(1);
    const op = r.batches[0][0];
    expect(op).toMatchObject({ kind: 'tasks', op: 'update', id: 't2', expectVersion: 3 });
    expect(op.data.status).toBe('Done');
    expect(op.data).not.toHaveProperty('version');
    expect(op.data).not.toHaveProperty('updatedBy');
    expect(op.data).not.toHaveProperty('updatedAt');
    expect(op.data.picUid).toBe('uid2');
  });

  it('new task -> create with version 1', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    ws1(tree).tasks.push({ id: 'tNew', name: 'New', pic: 'Bob', status: 'Not Started' });
    const r = planV2Save(loaded, tree, ctx());
    const ops = allOps(r);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'tasks', op: 'create', id: 'tNew' });
    expect(ops[0].data).toMatchObject({ version: 1, workstreamId: 'w1', programId: 'pg1', order: 3, picUid: 'uid2' });
    expect(ops[0].expectVersion).toBeUndefined();
  });

  it('workstream deleted -> delete op', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.programs[0].workstreams.splice(1, 1); // w2 (no tasks)
    const r = planV2Save(loaded, tree, ctx());
    const ops = allOps(r);
    expect(ops).toContainEqual({ kind: 'workstreams', op: 'delete', id: 'w2', expectVersion: 3 });
    // w3 moved from order 2 to 1 -> update
    expect(ops.find((o) => o.id === 'w3')).toMatchObject({ op: 'update', data: { order: 1, leadUid: 'uidLead' } });
  });

  it('task deleted -> refused, no batches', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    ws1(tree).tasks.splice(1, 1);
    expect(planV2Save(loaded, tree, ctx())).toEqual({ batches: [], metaPatch: null, refused: 'task-delete' });
  });

  it('order move inside a workstream is an update, not delete+create', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    const [a, b] = ws1(tree).tasks;
    ws1(tree).tasks[0] = b;
    ws1(tree).tasks[1] = a;
    const r = planV2Save(loaded, tree, ctx());
    const ops = allOps(r);
    expect(r.refused).toBeNull();
    expect(ops.map((o) => [o.id, o.op, o.data.order])).toEqual([['t1', 'update', 1], ['t2', 'update', 0]]);
  });

  it('appended update gets authorUid; existing updates untouched', () => {
    const loaded = makeLoaded();
    const old = [{ id: 'u1', text: 'old', author: 'X' }];
    loaded.docs.tasks.get('t2').data.updates = old;
    const tree = treeOf(loaded);
    ws1(tree).tasks[1].updates = [{ id: 'u2', text: 'new' }, ...clone(old)];
    const r = planV2Save(loaded, tree, ctx());
    expect(r.batches).toHaveLength(1);
    const op = r.batches[0][0];
    expect(op.data.updates).toEqual([{ id: 'u2', text: 'new', authorUid: 'uid1' }, { id: 'u1', text: 'old', author: 'X' }]);
  });

  it('new id-less entries are detected against the old suffix', () => {
    const loaded = makeLoaded();
    loaded.docs.tasks.get('t2').data.checkIns = [{ note: 'a' }];
    const tree = treeOf(loaded);
    ws1(tree).tasks[1].checkIns = [{ note: 'a' }, { note: 'a' }];
    const op = allOps(planV2Save(loaded, tree, ctx()))[0];
    expect(op.data.checkIns).toEqual([{ note: 'a', authorUid: 'uid1' }, { note: 'a' }]);
  });

  it('Ruling X: two new updates are split across two batches, oldest first', () => {
    const loaded = makeLoaded();
    loaded.docs.tasks.get('t2').data.updates = [{ id: 'u1', text: 'old' }];
    const tree = treeOf(loaded);
    ws1(tree).tasks[1].updates = [{ id: 'u3', text: 'newest' }, { id: 'u2', text: 'older' }, { id: 'u1', text: 'old' }];
    ws1(tree).tasks[1].status = 'In Review';
    ws1(tree).tasks[0].name = 'Renamed';
    const r = planV2Save(loaded, tree, ctx());
    expect(r.batches).toHaveLength(2);
    const b1t2 = r.batches[0].find((o) => o.id === 't2');
    expect(r.batches[0].find((o) => o.id === 't1')).toBeTruthy();
    expect(b1t2.expectVersion).toBe(3);
    expect(b1t2.data.status).toBe('In Review');
    expect(b1t2.data.updates).toEqual([{ id: 'u2', text: 'older', authorUid: 'uid1' }, { id: 'u1', text: 'old' }]);
    expect(r.batches[1]).toHaveLength(1);
    expect(r.batches[1][0]).toMatchObject({ kind: 'tasks', op: 'update', id: 't2', expectVersion: 4 });
    expect(r.batches[1][0].data.updates).toEqual([
      { id: 'u3', text: 'newest', authorUid: 'uid1' },
      { id: 'u2', text: 'older', authorUid: 'uid1' },
      { id: 'u1', text: 'old' },
    ]);
  });

  it('RAID edit by a PM picks viaProgramId (stale claim stripped)', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.programs[0].raid[0].title = 'Delay 2';
    const op = allOps(planV2Save(loaded, tree, ctx({ uid: 'uidPM' })))[0];
    expect(op).toMatchObject({ kind: 'raid', op: 'update', id: 'pg1', expectVersion: 3 });
    expect(op.data.viaProgramId).toBe('pg1');
    expect(op.data).not.toHaveProperty('viaWorkstreamId');
  });

  it('RAID edit by a lead picks viaWorkstreamId', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.programs[0].raid[0].title = 'Delay 2';
    const op = allOps(planV2Save(loaded, tree, ctx({ uid: 'uidLead' })))[0];
    expect(op.data.viaWorkstreamId).toBe('w3');
    expect(op.data).not.toHaveProperty('viaProgramId');
  });

  it('RAID edit by the Owner carries no claim; by nobody still emits the op without claim', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.programs[0].raid[0].title = 'Delay 2';
    for (const c of [ctx({ isOwner: true }), ctx({ uid: 'uidNobody' })]) {
      const op = allOps(planV2Save(loaded, tree, c))[0];
      expect(op.kind).toBe('raid');
      expect(op.data).not.toHaveProperty('viaProgramId');
      expect(op.data).not.toHaveProperty('viaWorkstreamId');
    }
  });

  it('RAID: new history entries and mitigation comments get authorUid', () => {
    const loaded = makeLoaded();
    loaded.docs.raid.get('pg1').data.items[0].history = [{ at: 1, text: 'h1' }];
    const tree = treeOf(loaded);
    const item = tree.programs[0].raid[0];
    item.history = [{ at: 2, text: 'h2' }, { at: 1, text: 'h1' }];
    item.mitigations[0].comments = [{ id: 'c1', text: 'hi' }];
    const op = allOps(planV2Save(loaded, tree, ctx({ uid: 'uidPM' })))[0];
    expect(op.data.items[0].history).toEqual([{ at: 2, text: 'h2', authorUid: 'uidPM' }, { at: 1, text: 'h1' }]);
    expect(op.data.items[0].mitigations[0].comments).toEqual([{ id: 'c1', text: 'hi', authorUid: 'uidPM' }]);
  });

  it('decision edit: PM anywhere -> viaProgramId, else first led ws', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.decisions[0].title = 'Go now';
    const pm = allOps(planV2Save(loaded, tree, ctx({ uid: 'uidPM2' })))[0];
    expect(pm).toMatchObject({ kind: 'decisions', op: 'update', id: 'd1', expectVersion: 3 });
    expect(pm.data.viaProgramId).toBe('pg2');
    const lead = allOps(planV2Save(loaded, tree, ctx({ uid: 'uidLead' })))[0];
    expect(lead.data.viaWorkstreamId).toBe('w3');
  });

  it('RAID created for an absent-raid program: Owner clears the flag in metaPatch; non-Owner leaves it', () => {
    const v1 = clone(fixture);
    delete v1.programs[1].raid;
    const s = splitProject(v1, { wid: 'main', dirIndex, uidByEmail });
    const toMap = (list) => new Map(list.map(({ id, data }) => [id, { version: 2, data }]));
    const loaded = { meta: s.meta, docs: { workstreams: toMap(s.workstreams), tasks: toMap(s.tasks), actions: toMap(s.actions), raid: toMap(s.raid), decisions: toMap(s.decisions) } };
    expect(loaded.meta.programMeta.pg2.__absent).toEqual(['raid']);
    const tree = treeOf(loaded);
    tree.programs[1].raid = [{ id: 'rN', title: 'New risk' }];
    const own = planV2Save(loaded, tree, ctx({ isOwner: true }));
    expect(allOps(own)).toEqual([{ kind: 'raid', op: 'create', id: 'pg2', data: expect.objectContaining({ programId: 'pg2', version: 1 }) }]);
    expect(own.metaPatch.programMeta.pg2).not.toHaveProperty('__absent');
    expect(own.metaPatch.programMeta.pg1).toEqual(loaded.meta.programMeta.pg1);
    const other = planV2Save(loaded, tree, ctx());
    expect(allOps(other)).toHaveLength(1);
    expect(other.metaPatch).toBeNull();
  });

  it('action history wipe is refused', () => {
    const loaded = makeLoaded();
    loaded.docs.actions.get('a1').data.updates = [{ id: 'x', text: 'progress' }];
    const tree = treeOf(loaded);
    delete tree.actionItems[0].updates; // ActionForm bug: drops updates
    tree.actionItems[0].title = 'Edited';
    expect(planV2Save(loaded, tree, ctx({ isOwner: true }))).toEqual({ batches: [], metaPatch: null, refused: 'history-wipe' });
  });

  it('action delete is allowed as an op', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.actionItems.splice(1, 1);
    expect(allOps(planV2Save(loaded, tree, ctx()))).toEqual([{ kind: 'actions', op: 'delete', id: 'a2', expectVersion: 3 }]);
  });

  it('project name change -> metaPatch with only that field', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.name = 'Renamed project';
    const r = planV2Save(loaded, tree, ctx({ isOwner: true }));
    expect(r.batches).toEqual([]);
    expect(r.metaPatch).toEqual({ name: 'Renamed project' });
  });

  it('removed meta field -> DELETE_FIELD sentinel', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    delete tree.projectLead;
    expect(planV2Save(loaded, tree, ctx({ isOwner: true })).metaPatch).toEqual({ projectLead: DELETE_FIELD });
  });

  it('programMeta change (program renamed) -> metaPatch.programMeta keeps pmUid', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.programs[0].name = 'Program Renamed';
    const r = planV2Save(loaded, tree, ctx({ isOwner: true }));
    expect(r.batches).toEqual([]);
    expect(Object.keys(r.metaPatch)).toEqual(['programMeta']);
    expect(r.metaPatch.programMeta.pg1).toMatchObject({ name: 'Program Renamed', pmUid: 'uidPM' });
    expect(r.metaPatch.programMeta.pg2.deputyUid).toBe('uidPM2');
  });

  it('keeps stored picUid when pic text is unchanged; orphans are never deleted', () => {
    const loaded = makeLoaded();
    loaded.docs.tasks.get('t2').data.picUid = 'uidFromTooling';
    loaded.docs.tasks.set('tOrphan', { version: 1, data: { workstreamId: 'nope', programId: 'pg1', order: 0, name: 'Orphan' } });
    const tree = treeOf(loaded);
    expect(planV2Save(loaded, tree, ctx())).toEqual({ batches: [], metaPatch: null, refused: null });
    ws1(tree).tasks[1].name = 'x';
    expect(allOps(planV2Save(loaded, tree, ctx()))[0].data.picUid).toBe('uidFromTooling');
  });

  it('does not mutate its inputs', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    ws1(tree).tasks[1].updates = [{ id: 'n1' }, { id: 'n2' }];
    const snapTree = clone(tree);
    const snapT2 = clone(loaded.docs.tasks.get('t2'));
    planV2Save(loaded, tree, ctx());
    expect(tree).toEqual(snapTree);
    expect(loaded.docs.tasks.get('t2')).toEqual(snapT2);
  });
});
