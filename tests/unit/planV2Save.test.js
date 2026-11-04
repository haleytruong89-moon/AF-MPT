import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/v1-project.json';
import { splitProject, assembleProject } from '../../src/migrateV2.js';
import { buildDirectoryIndex } from '../../src/directory.js';
import { planV2Save, DELETE_FIELD, programMetaPatch } from '../../src/planV2Save.js';

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

  it('planV2Save ignores __v2.roles and __v2.approvals (no ops, no metaPatch)', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.__v2 = {
      orphans: 0,
      roles: { ownerUids: ['o'], programs: { pg1: { pmUid: 'x', deputyUid: null, start: null, end: null } }, workstreams: {}, tasks: {} },
      approvals: [{ id: 'r1', kind: 'plan_import', status: 'pending', createdAt: '2026-11-01T00:00:00.000Z', decidedAt: null, version: 1 }],
    };
    expect(planV2Save(loaded, tree, ctx())).toEqual({ batches: [], metaPatch: null, refused: null });
    expect(planV2Save(loaded, tree, ctx({ isOwner: true }))).toEqual({ batches: [], metaPatch: null, refused: null });
    tree.__v2.approvals = null;
    expect(planV2Save(loaded, tree, ctx())).toEqual({ batches: [], metaPatch: null, refused: null });
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

  it('RAID: new history entries get authorUid (mitigation comments: see I4)', () => {
    const loaded = makeLoaded();
    loaded.docs.raid.get('pg1').data.items[0].history = [{ at: 1, text: 'h1' }];
    const tree = treeOf(loaded);
    const item = tree.programs[0].raid[0];
    item.history = [{ at: 2, text: 'h2' }, { at: 1, text: 'h1' }];
    // `mitigations` is not the App's field (I4): left untouched.
    item.mitigations[0].comments = [{ id: 'c1', text: 'hi' }];
    const op = allOps(planV2Save(loaded, tree, ctx({ uid: 'uidPM' })))[0];
    expect(op.data.items[0].history).toEqual([{ at: 2, text: 'h2', authorUid: 'uidPM' }, { at: 1, text: 'h1' }]);
    expect(op.data.items[0].mitigations[0].comments).toEqual([{ id: 'c1', text: 'hi' }]);
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
    // Dotted field patch: only the cleared flag, nothing else of pg1 / pg2.
    expect(own.metaPatch).toEqual({ 'programMeta.pg2.__absent': DELETE_FIELD });
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

  it('programMeta change (program renamed) -> one dotted name field, pmUid / deputyUid untouched', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.programs[0].name = 'Program Renamed';
    const r = planV2Save(loaded, tree, ctx({ isOwner: true }));
    expect(r.batches).toEqual([]);
    expect(r.metaPatch).toEqual({ 'programMeta.pg1.name': 'Program Renamed' });
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

  const absentRaidLoaded = () => {
    const v1 = clone(fixture);
    delete v1.programs[1].raid;
    const s = splitProject(v1, { wid: 'main', dirIndex, uidByEmail });
    const toMap = (list) => new Map(list.map(({ id, data }) => [id, { version: 2, data }]));
    return { meta: s.meta, docs: { workstreams: toMap(s.workstreams), tasks: toMap(s.tasks), actions: toMap(s.actions), raid: toMap(s.raid), decisions: toMap(s.decisions) } };
  };

  it('ensureProjectRaid placeholder (raid: []) on an absent-raid program -> no create, flag kept', () => {
    for (const isOwner of [false, true]) {
      const loaded = absentRaidLoaded();
      const tree = treeOf(loaded);
      tree.programs[1].raid = [];
      expect(planV2Save(loaded, tree, ctx({ isOwner }))).toEqual({ batches: [], metaPatch: null, refused: null });
      ws1(tree).tasks[0].name = 'Edited';
      const r = planV2Save(loaded, tree, ctx({ isOwner }));
      expect(allOps(r).map((o) => [o.kind, o.op, o.id])).toEqual([['tasks', 'update', 't1']]);
      expect(r.metaPatch).toBeNull();
    }
  });

  it('missing RAID doc (missingRaid) with raid: [] -> no create; existing RAID doc with same items -> no op', () => {
    const loaded = makeLoaded();
    loaded.docs.raid.delete('pg2');
    const tree = treeOf(loaded);
    expect(tree.programs[1].raid).toEqual([]);
    expect(planV2Save(loaded, tree, ctx())).toEqual({ batches: [], metaPatch: null, refused: null });
    const loaded2 = makeLoaded();
    const tree2 = treeOf(loaded2);
    tree2.programs[0].raid = clone(tree2.programs[0].raid);
    expect(planV2Save(loaded2, tree2, ctx())).toEqual({ batches: [], metaPatch: null, refused: null });
  });

  it('created docs keep their entries as-is (no authorUid stamping)', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    ws1(tree).tasks.push({ id: 'tCopy', name: 'Copy', updates: [{ id: 'u9', text: 'by X', authorUid: 'uidX' }, { text: 'no author' }] });
    const op = allOps(planV2Save(loaded, tree, ctx()))[0];
    expect(op.op).toBe('create');
    expect(op.data.updates).toEqual([{ id: 'u9', text: 'by X', authorUid: 'uidX' }, { text: 'no author' }]);
  });

  it('id-less in-place edit (same size) is not stamped', () => {
    const loaded = makeLoaded();
    loaded.docs.tasks.get('t2').data.updates = [{ text: 'a' }, { text: 'b' }];
    const tree = treeOf(loaded);
    ws1(tree).tasks[1].updates = [{ text: 'a edited' }, { text: 'b' }];
    const op = allOps(planV2Save(loaded, tree, ctx({ isOwner: true })))[0];
    expect(op.data.updates).toEqual([{ text: 'a edited' }, { text: 'b' }]);
  });

  it('Timestamp-like values in loaded data compare in their JSON form (no diff)', () => {
    const loaded = makeLoaded();
    const ts = { seconds: 1, nanoseconds: 0, toJSON() { return { seconds: 1, nanoseconds: 0 }; }, toMillis() { return 1000; } };
    loaded.meta.reviewedAt = ts;
    loaded.docs.tasks.get('t2').data.doneAt = ts;
    const tree = treeOf(loaded); // JSON round trip, like the shim read path
    expect(planV2Save(loaded, tree, ctx({ isOwner: true }))).toEqual({ batches: [], metaPatch: null, refused: null });
  });

  // ── Final-review fixes (Ruling AD / AH) ──
  it('C1: matched entries keep the stored authorUid the tree never received (no spurious op)', () => {
    const loaded = makeLoaded();
    const t2 = loaded.docs.tasks.get('t2').data;
    t2.updates = [{ id: 'u2', text: 'mine', authorUid: 'uid1' }, { id: 'u1', text: 'old', authorUid: 'uidX' }];
    t2.checkIns = [{ note: 'b', authorUid: 'uid1' }, { note: 'a', authorUid: 'uidX' }];
    const tree = treeOf(loaded);
    // The App tree never got the planner's stamps.
    for (const k of ['updates', 'checkIns']) ws1(tree).tasks[1][k] = ws1(tree).tasks[1][k].map(({ authorUid: _a, ...e }) => e);
    expect(planV2Save(loaded, tree, ctx())).toEqual({ batches: [], metaPatch: null, refused: null });
    ws1(tree).tasks[1].status = 'Planned';
    ws1(tree).tasks[1].checkIns.unshift({ note: 'c' });
    const op = allOps(planV2Save(loaded, tree, ctx()))[0];
    expect(op.data.updates).toEqual(t2.updates);
    expect(op.data.checkIns).toEqual([{ note: 'c', authorUid: 'uid1' }, ...t2.checkIns]);
  });

  it('C1: action updates and RAID history / mitigation comments keep stored authorUid', () => {
    const loaded = makeLoaded();
    loaded.docs.actions.get('a1').data.updates = [{ id: 'x1', text: 'p', authorUid: 'uidX' }];
    const item = loaded.docs.raid.get('pg1').data.items[0];
    item.history = [{ id: 'h1', note: 'n', authorUid: 'uidX' }];
    item.mitigationActions = [{ id: 'ma1', name: 'M', comments: [{ id: 'c1', text: 'c', authorUid: 'uidX' }] }];
    const tree = treeOf(loaded);
    delete tree.actionItems[0].updates[0].authorUid;
    const ti = tree.programs[0].raid[0];
    delete ti.history[0].authorUid;
    delete ti.mitigationActions[0].comments[0].authorUid;
    expect(planV2Save(loaded, tree, ctx({ isOwner: true }))).toEqual({ batches: [], metaPatch: null, refused: null });
    tree.actionItems[0].title = 'Edited';
    ti.title = 'Edited';
    const ops = allOps(planV2Save(loaded, tree, ctx({ isOwner: true })));
    expect(ops.find((o) => o.kind === 'actions').data.updates).toEqual([{ id: 'x1', text: 'p', authorUid: 'uidX' }]);
    const raid = ops.find((o) => o.kind === 'raid').data.items[0];
    expect(raid.history).toEqual([{ id: 'h1', note: 'n', authorUid: 'uidX' }]);
    expect(raid.mitigationActions[0].comments).toEqual([{ id: 'c1', text: 'c', authorUid: 'uidX' }]);
  });

  it('C1: id-less shrink carries authorUid only on an exact content match', () => {
    const loaded = makeLoaded();
    loaded.docs.tasks.get('t2').data.updates = [{ text: 'a', authorUid: 'uidA' }, { text: 'b', authorUid: 'uidB' }];
    const tree = treeOf(loaded);
    ws1(tree).tasks[1].updates = [{ text: 'b' }];
    const op = allOps(planV2Save(loaded, tree, ctx({ isOwner: true })))[0];
    expect(op.data.updates).toEqual([{ text: 'b', authorUid: 'uidB' }]);
    ws1(tree).tasks[1].updates = [{ text: 'b edited' }];
    const op2 = allOps(planV2Save(loaded, tree, ctx({ isOwner: true })))[0];
    expect(op2.data.updates).toEqual([{ text: 'b edited' }]);
  });

  it('I2: a prepended action keeps every stored order; the new doc gets min - 1', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.actionItems.unshift({ id: 'aNew', title: 'New', pic: 'Bob', status: 'Open' });
    const ops = allOps(planV2Save(loaded, tree, ctx()));
    expect(ops.map((o) => [o.kind, o.op, o.id])).toEqual([['actions', 'create', 'aNew']]);
    expect(ops[0].data.order).toBe(-1);
    // Deleting the first action leaves the others untouched.
    const tree2 = treeOf(loaded);
    tree2.actionItems.splice(0, 1);
    expect(allOps(planV2Save(loaded, tree2, ctx()))).toEqual([{ kind: 'actions', op: 'delete', id: 'a1', expectVersion: 3 }]);
  });

  it('I2: new decisions / actions between and after existing ones sort where the tree put them', () => {
    const loaded = makeLoaded();
    loaded.docs.decisions.set('d2', { version: 3, data: { ...loaded.docs.decisions.get('d1').data, id: 'd2', order: 5 } });
    const tree = treeOf(loaded);
    expect(tree.decisions.map((d) => d.id)).toEqual(['d1', 'd2']);
    tree.decisions = [{ id: 'n0' }, { id: 'n1' }, tree.decisions[0], { id: 'n2' }, tree.decisions[1], { id: 'n3' }];
    const ops = allOps(planV2Save(loaded, tree, ctx({ isOwner: true })));
    expect(ops.every((o) => o.op === 'create')).toBe(true);
    const created = ops.map((o) => ({ id: o.id, data: o.data }));
    const all = [...created, { id: 'd1', data: { order: 0 } }, { id: 'd2', data: { order: 5 } }];
    const sorted = all.sort((a, b) => a.data.order - b.data.order).map((d) => d.id);
    expect(sorted).toEqual(['n0', 'n1', 'd1', 'n2', 'd2', 'n3']);
    // Assemble sorts negative / fractional orders the same way.
    const { project } = assembleProject({ ...loaded.meta, decisions: [] }, [], [], [], [],
      all.map((d) => ({ id: d.id, data: { id: d.id, order: d.data.order } })));
    expect(project.decisions.map((d) => d.id)).toEqual(['n0', 'n1', 'd1', 'n2', 'd2', 'n3']);
  });

  it('I2: tied stored orders (concurrent prepends) are kept; an untouched tree is a no-op', () => {
    const loaded = makeLoaded();
    const a2 = loaded.docs.actions.get('a2');
    loaded.docs.actions.set('a2', { ...a2, data: { ...a2.data, order: loaded.docs.actions.get('a1').data.order } });
    expect(allOps(planV2Save(loaded, treeOf(loaded), ctx()))).toEqual([]);
    const tree = treeOf(loaded);
    ws1(tree).tasks[0].title = 'Edited';
    expect(allOps(planV2Save(loaded, tree, ctx())).map((o) => o.kind)).toEqual(['tasks']);
  });

  it('I2: a real reorder still renumbers', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.actionItems.reverse();
    const ops = allOps(planV2Save(loaded, tree, ctx({ isOwner: true })));
    expect(ops.map((o) => [o.id, o.data.order])).toEqual([['a1', 1], ['a2', 0]]);
  });

  it('I3: a PM with no claim on the program falls back to any project claim for RAID', () => {
    const loaded = makeLoaded();
    const tree = treeOf(loaded);
    tree.programs[0].raid[0].title = 'Edited by PM of pg2';
    const op = allOps(planV2Save(loaded, tree, ctx({ uid: 'uidPM2' })))[0];
    expect(op.data.viaProgramId).toBe('pg2');
    tree.programs[1].raid = [{ id: 'rX', title: 'New' }];
    const lead = allOps(planV2Save(loaded, tree, ctx({ uid: 'uidLead' }))).find((o) => o.id === 'pg2');
    expect(lead.data.viaWorkstreamId).toBe('w3');
  });

  it('I4: new mitigationActions comments get authorUid', () => {
    const loaded = makeLoaded();
    loaded.docs.raid.get('pg1').data.items[0].mitigationActions = [{ id: 'ma1', name: 'M', comments: [] }];
    const tree = treeOf(loaded);
    tree.programs[0].raid[0].mitigationActions[0].comments.push({ id: 'c1', text: 'hi' });
    const op = allOps(planV2Save(loaded, tree, ctx({ uid: 'uidPM' })))[0];
    expect(op.data.items[0].mitigationActions[0].comments).toEqual([{ id: 'c1', text: 'hi', authorUid: 'uidPM' }]);
  });

  it('Minor 7: no directory and a changed person field -> refused, nothing written', () => {
    const loaded = makeLoaded();
    const none = { batches: [], metaPatch: null, refused: 'directory-unavailable' };
    const tree = treeOf(loaded);
    ws1(tree).tasks[1].pic = 'Alice Nguyen';
    expect(planV2Save(loaded, tree, ctx({ dirIndex: null }))).toEqual(none);
    const tree2 = treeOf(loaded);
    ws1(tree2).tasks[0].contributors = ['Carol Tran'];
    expect(planV2Save(loaded, tree2, ctx({ dirIndex: null }))).toEqual(none);
    const tree3 = treeOf(loaded);
    tree3.actionItems.unshift({ id: 'aNew', title: 'New', pic: 'Bob' });
    expect(planV2Save(loaded, tree3, ctx({ dirIndex: null }))).toEqual(none);
    // People unchanged: plans normally and keeps stored uids.
    const tree4 = treeOf(loaded);
    ws1(tree4).tasks[1].name = 'x';
    const op = allOps(planV2Save(loaded, tree4, ctx({ dirIndex: null })))[0];
    expect(op.data.picUid).toBe('uid2');
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

describe('planV2Save programMeta (dotted patches)', () => {
  it('stale loaded copy (no pmUid) renames a program -> only programMeta.<id>.name, pmUid untouched', () => {
    const loaded = makeLoaded();
    delete loaded.meta.programMeta.pg1.pmUid; // this tab loaded before the admin script set it
    const tree = treeOf(loaded);
    tree.programs[0].name = 'Renamed program';
    const r = planV2Save(loaded, tree, ctx({ isOwner: true }));
    expect(r.metaPatch).toEqual({ 'programMeta.pg1.name': 'Renamed program' });
  });
});

describe('programMetaPatch', () => {
  it('changed fields only; new program whole; deleted program key deleted', () => {
    const stored = { A: { name: 'a', order: 1, pmUid: 'P' }, B: { name: 'b' }, C: { name: 'c', __absent: ['raid'] } };
    const next = { A: { name: 'a2', order: 1, pmUid: 'P' }, C: { name: 'c' }, D: { name: 'd', order: 4 } };
    expect(programMetaPatch(stored, next)).toEqual({
      'programMeta.A.name': 'a2',
      'programMeta.B': DELETE_FIELD,
      'programMeta.C.__absent': DELETE_FIELD,
      'programMeta.D': { name: 'd', order: 4 },
    });
  });
  it('a KEEP field absent or null in the next entry is left alone (never deleted / nulled)', () => {
    expect(programMetaPatch({ A: { name: 'a', pmUid: 'P', start: '2026-01-01' } }, { A: { name: 'a' } })).toEqual({});
    expect(programMetaPatch({ A: { name: 'a' } }, { A: { name: 'a', pmUid: null, deputyUid: null } })).toEqual({});
    expect(programMetaPatch({ A: { name: 'a', pmUid: 'P' } }, { A: { name: 'a', pmUid: 'Q' } })).toEqual({ 'programMeta.A.pmUid': 'Q' });
  });
  it('unchanged -> {}; unsafe key -> whole programMeta', () => {
    expect(programMetaPatch({ A: { name: 'a' } }, { A: { name: 'a' } })).toEqual({});
    expect(programMetaPatch({ 'a.b': { name: 'x' } }, { 'a.b': { name: 'y' } })).toEqual({ programMeta: { 'a.b': { name: 'y' } } });
  });
});

// P3 Task 8 (Ruling P3-8): blocker resolutions fold on read / unfold on save.
describe('planV2Save blocker resolutions (append-only map)', () => {
  const blk = (id) => ({ id, text: `blocker ${id}`, isBlocker: true, author: 'Bob', timestamp: '2026-10-20T00:00:00Z', authorUid: 'uid2' });
  const resolve = (tree, i, at, note = null) => {
    const t = ws1(tree).tasks[1];
    t.updates[i] = { ...t.updates[i], resolvedAt: at, resolvedBy: 'Bob', resolution: note };
  };
  const seed = (loaded, map) => {
    const d = loaded.docs.tasks.get('t2').data;
    d.updates = [blk('b2'), blk('b1')];
    if (map) d.blockerResolutions = map;
    return d;
  };

  it('planV2Save: Assignee resolving a blocker -> one update op whose data.updates equals stored updates and data.blockerResolutions has one key', () => {
    const loaded = makeLoaded();
    const stored = seed(loaded);
    const tree = treeOf(loaded);
    resolve(tree, 1, '2026-10-26T00:00:00.000Z', 'Got bank approval');
    const r = planV2Save(loaded, tree, ctx({ uid: 'uid2' }));
    expect(r.refused).toBeNull();
    expect(r.batches).toHaveLength(1);
    expect(r.batches[0]).toHaveLength(1);
    const op = r.batches[0][0];
    expect(op).toMatchObject({ kind: 'tasks', op: 'update', id: 't2', expectVersion: 3 });
    expect(op.data.updates).toEqual(stored.updates);
    expect(op.data.blockerResolutions).toEqual({
      b1: { resolvedAt: '2026-10-26T00:00:00.000Z', resolvedBy: 'Bob', resolution: 'Got bank approval', authorUid: 'uid2' },
    });
  });

  it('a stored map folds into the tree; the untouched tree is a no-op', () => {
    const loaded = makeLoaded();
    seed(loaded, { b1: { resolvedAt: '2026-10-25T00:00:00.000Z', resolvedBy: 'Bob', resolution: null, authorUid: 'uid2' } });
    const tree = treeOf(loaded);
    expect(ws1(tree).tasks[1]).not.toHaveProperty('blockerResolutions');
    expect(ws1(tree).tasks[1].updates[1]).toMatchObject({ id: 'b1', resolvedAt: '2026-10-25T00:00:00.000Z', resolvedBy: 'Bob', resolution: null });
    expect(planV2Save(loaded, tree, ctx({ uid: 'uid2' }))).toEqual({ batches: [], metaPatch: null, refused: null });
  });

  it('two new resolutions -> two sequential single-key batches, oldest first; the stored map is re-sent', () => {
    const loaded = makeLoaded();
    const old = { resolvedAt: '2026-10-01T00:00:00.000Z', resolvedBy: 'Bob', resolution: 'x', authorUid: 'uid2' };
    const stored = seed(loaded, { b0: old });
    const tree = treeOf(loaded);
    resolve(tree, 0, '2026-10-26T02:00:00.000Z');
    resolve(tree, 1, '2026-10-26T01:00:00.000Z');
    const r = planV2Save(loaded, tree, ctx({ uid: 'uid2' }));
    expect(r.batches).toHaveLength(2);
    const [s1, s2] = r.batches.map((b) => b.find((o) => o.id === 't2'));
    expect(s1.expectVersion).toBe(3);
    expect(s2.expectVersion).toBe(4);
    expect(s1.data.updates).toEqual(stored.updates);
    expect(s2.data.updates).toEqual(stored.updates);
    expect(Object.keys(s1.data.blockerResolutions).sort()).toEqual(['b0', 'b1']);
    expect(Object.keys(s2.data.blockerResolutions).sort()).toEqual(['b0', 'b1', 'b2']);
    expect(s2.data.blockerResolutions.b2).toMatchObject({ resolvedAt: '2026-10-26T02:00:00.000Z', authorUid: 'uid2' });
  });

  it('resolution + a new update land in one step; other edits on a task with a map keep the map', () => {
    const loaded = makeLoaded();
    const map = { b0: { resolvedAt: '2026-10-01T00:00:00.000Z', resolvedBy: 'Bob', resolution: 'x', authorUid: 'uid2' } };
    const stored = seed(loaded, map);
    const tree = treeOf(loaded);
    resolve(tree, 1, '2026-10-26T00:00:00.000Z');
    ws1(tree).tasks[1].updates.unshift({ id: 'n1', text: 'resolved, moving on' });
    let r = planV2Save(loaded, tree, ctx({ uid: 'uid2' }));
    expect(r.batches).toHaveLength(1);
    expect(r.batches[0][0].data.updates).toEqual([{ id: 'n1', text: 'resolved, moving on', authorUid: 'uid2' }, ...stored.updates]);
    expect(Object.keys(r.batches[0][0].data.blockerResolutions).sort()).toEqual(['b0', 'b1']);

    const tree2 = treeOf(loaded);
    ws1(tree2).tasks[1].name = 'Renamed';
    r = planV2Save(loaded, tree2, ctx({ uid: 'uid2' }));
    expect(r.batches[0][0].data.blockerResolutions).toEqual(map);
  });

  it('a task without a map never gets blockerResolutions (no null, no {})', () => {
    const loaded = makeLoaded();
    seed(loaded);
    const tree = treeOf(loaded);
    ws1(tree).tasks[1].name = 'Renamed';
    const r = planV2Save(loaded, tree, ctx({ uid: 'uid2' }));
    expect(r.batches[0][0].data).not.toHaveProperty('blockerResolutions');
  });

  it('a legacy in-place resolution and a resolved new blocker are written in place', () => {
    const loaded = makeLoaded();
    const d = seed(loaded);
    d.updates[1] = { ...d.updates[1], resolvedAt: '2026-10-02T00:00:00Z', resolvedBy: 'Bob', resolution: null };
    const tree = treeOf(loaded);
    expect(planV2Save(loaded, tree, ctx({ uid: 'uid2' })).batches).toEqual([]);
    ws1(tree).tasks[1].updates.unshift({ ...blk('b3'), resolvedAt: '2026-10-26T00:00:00Z', resolvedBy: 'Bob', resolution: null });
    const op = planV2Save(loaded, tree, ctx({ uid: 'uid2' })).batches[0][0];
    expect(op.data.updates[0]).toMatchObject({ id: 'b3', resolvedAt: '2026-10-26T00:00:00Z' });
    expect(op.data).not.toHaveProperty('blockerResolutions');
  });
});

describe('planV2Save close history protection (P3.1 final review I2)', () => {
  const CLOSED = { approvedByUid: 'uidPM', approvedAt: '2026-11-01T00:00:00.000Z', closedByUid: 'uid1' };
  const HIST = [
    { id: 'crh2', status: 'Approved', decidedByUid: 'uidPM', decidedAt: '2026-11-01T00:00:00.000Z' },
    { id: 'crh1', status: 'Rejected', decidedByUid: 'uidPM', decidedAt: '2026-10-30T00:00:00.000Z' },
  ];
  // Stored t1 (first task of the first WS) with the given fields; returns the tree task too.
  function setup(fields) {
    const loaded = makeLoaded();
    const id = treeOf(loaded).programs[0].workstreams[0].tasks[0].id;
    const entry = [...loaded.docs.tasks.values()].find((e) => e.data.id === id);
    Object.assign(entry.data, fields);
    const tree = treeOf(loaded);
    return { loaded, tree, task: ws1(tree).tasks[0] };
  }
  const refused = { batches: [], metaPatch: null, refused: 'close-history-wipe' };

  it('shrinking closeRequestHistory is refused (Owner too)', () => {
    const { loaded, tree, task } = setup({ status: 'InProgress', closeRequestHistory: HIST });
    task.closeRequestHistory = HIST.slice(1);
    expect(planV2Save(loaded, tree, ctx({ isOwner: true }))).toEqual(refused);
    expect(planV2Save(loaded, tree, ctx())).toEqual(refused);
  });

  it('dropping the closeRequestHistory field (import / restore of an older tree) is refused', () => {
    const { loaded, tree, task } = setup({ status: 'Completed', closeRequestHistory: HIST, ...CLOSED });
    delete task.closeRequestHistory;
    expect(planV2Save(loaded, tree, ctx({ isOwner: true }))).toEqual(refused);
  });

  for (const k of ['approvedByUid', 'approvedAt', 'closedByUid']) {
    for (const status of ['Completed', 'Dropped']) {
      it(`removing ${k} from a task that stays ${status} is refused (absent or null)`, () => {
        const a = setup({ status, closeRequestHistory: HIST, ...CLOSED });
        delete a.task[k];
        expect(planV2Save(a.loaded, a.tree, ctx({ isOwner: true }))).toEqual(refused);
        const b = setup({ status, closeRequestHistory: HIST, ...CLOSED });
        b.task[k] = null;
        expect(planV2Save(b.loaded, b.tree, ctx({ isOwner: true }))).toEqual(refused);
      });
    }
  }

  it('Completed -> Dropped without the stamps is refused', () => {
    const { loaded, tree, task } = setup({ status: 'Completed', closeRequestHistory: HIST, ...CLOSED });
    task.status = 'Dropped';
    task.approvedByUid = null;
    expect(planV2Save(loaded, tree, ctx({ isOwner: true }))).toEqual(refused);
  });

  it('reopen (closeFlow: open status + stamps cleared, history kept) is planned', () => {
    const { loaded, tree, task } = setup({ status: 'Completed', closeRequestHistory: HIST, ...CLOSED });
    Object.assign(task, { status: 'InProgress', approvedByUid: null, approvedAt: null, closedByUid: null });
    const r = planV2Save(loaded, tree, ctx());
    expect(r.refused).toBe(null);
    expect(allOps(r)).toHaveLength(1);
    expect(allOps(r)[0].data).toMatchObject({ status: 'InProgress', approvedByUid: null, closeRequestHistory: HIST });
  });

  it('a decision (history grows by one) and an edit of a closed task that keeps the stamps are planned', () => {
    const grow = setup({ status: 'Submitted', closeRequestHistory: HIST.slice(1) });
    Object.assign(grow.task, { status: 'Completed', ...CLOSED, closeRequestHistory: HIST });
    expect(planV2Save(grow.loaded, grow.tree, ctx()).refused).toBe(null);
    const edit = setup({ status: 'Completed', closeRequestHistory: HIST, ...CLOSED });
    edit.task.name = 'Renamed';
    const r = planV2Save(edit.loaded, edit.tree, ctx({ isOwner: true }));
    expect(r.refused).toBe(null);
    expect(allOps(r)).toHaveLength(1);
  });
});
