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
  return assembleProject(s.meta, s.workstreams, s.tasks, s.actions, s.raid, s.decisions).project;
};

describe('splitProject / assembleProject', () => {
  it('round-trips the fixture exactly (order, null dates, empty program/ws, missing id)', () => {
    expect(roundTrip(fixture)).toStrictEqual(fixture);
  });
  it('round-trips even when docs come back shuffled', () => {
    const s = run();
    const rev = (a) => [...a].reverse();
    expect(assembleProject(s.meta, rev(s.workstreams), rev(s.tasks), rev(s.actions), rev(s.raid), rev(s.decisions)).project).toStrictEqual(fixture);
  });
  it('does not mutate its input', () => {
    const p = clone(fixture);
    splitProject(p, { wid: 'main', dirIndex: dir, uidByEmail });
    expect(p).toStrictEqual(fixture);
  });
  it('counts and programMeta', () => {
    const { report, meta } = run();
    expect(report.counts).toEqual({ programs: 2, workstreams: 3, tasks: 4, actions: 2, decisions: 1 });
    expect(meta.programMeta.pg2).toEqual({ id: 'pg2', name: 'Program Empty', order: 1, pmUid: null, deputyUid: null, start: null, end: null });
    expect(meta.programMeta.pg1.raid).toBeUndefined();
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
    expect(report.unresolved).toEqual([{ field: 'task.pic', raw: 'Zed Unknown', where: 't1__dup2' }]);
  });
  it('with no directory everything real is unresolved but the round trip holds', () => {
    const s = splitProject(clone(fixture), { wid: 'main', dirIndex: null, uidByEmail: new Map() });
    expect(s.report.unresolved.length).toBeGreaterThan(0);
    expect(s.report.unresolved.some((u) => u.raw === 'BOD')).toBe(false);
    expect(assembleProject(s.meta, s.workstreams, s.tasks, s.actions, s.raid, s.decisions).project).toStrictEqual(fixture);
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

describe('Ruling C: programMeta owns program data; orphans; edge branches', () => {
  const asm = (s) => assembleProject(s.meta, s.workstreams, s.tasks, s.actions, s.raid, s.decisions);

  it('ignores the frozen meta.programs / meta.actionItems on assemble', () => {
    const s = run();
    s.meta.programs = [{ id: 'junk' }];
    s.meta.actionItems = [{ id: 'junk' }];
    expect(asm(s).project).toStrictEqual(fixture);
  });
  it('programMeta carries every v1 program key except workstreams', () => {
    const p = clone(fixture);
    p.programs[0].customKey = 7;
    const s = run(p);
    expect(s.meta.programMeta.pg1).toMatchObject({ name: 'Program One', customKey: 7, order: 0, pmUid: null });
    expect(s.meta.programMeta.pg1.workstreams).toBeUndefined();
    expect(roundTrip(p)).toStrictEqual(p);
  });
  it('program keys colliding with v2 names are stashed, reported, restored', () => {
    const p = clone(fixture);
    p.programs[1].start = '2026-01-01';
    const s = run(p);
    expect(s.report.collisions).toEqual([{ kind: 'program', id: 'pg2', key: 'start' }]);
    expect(s.meta.programMeta.pg2.start).toBeNull();
    expect(roundTrip(p)).toStrictEqual(p);
  });
  it('new-after-switch program, workstream and task appear in the assembled tree', () => {
    const s = run();
    s.meta.programMeta.pgNew = { id: 'pgNew', name: 'New', order: 2, pmUid: 'u9', deputyUid: null, start: null, end: null };
    s.raid.push({ id: 'pgNew', data: { programId: 'pgNew', items: [], version: 1 } });
    s.workstreams.push({ id: 'wNew', data: { id: 'wNew', name: 'WS New', programId: 'pgNew', order: 0, version: 1 } });
    s.tasks.push({ id: 'tNew', data: { id: 'tNew', name: 'T new', programId: 'pgNew', workstreamId: 'wNew', order: 0, version: 1 } });
    const { project, orphans } = asm(s);
    const pg = project.programs.find((x) => x.id === 'pgNew');
    expect(project.programs.map((x) => x.id)).toEqual(['pg1', 'pg2', 'pgNew']);
    expect(pg).toStrictEqual({ id: 'pgNew', name: 'New', raid: [], workstreams: [{ id: 'wNew', name: 'WS New', tasks: [{ id: 'tNew', name: 'T new' }] }] });
    expect(orphans).toEqual({ workstreams: [], tasks: [], actions: [], raid: [], missingRaid: [] });
  });
  it('programs without an id in a new entry take the programMeta key', () => {
    const s = run();
    s.meta.programMeta.pgX = { name: 'X', order: 5 };
    expect(asm(s).project.programs.at(-1)).toStrictEqual({ id: 'pgX', name: 'X', raid: [], workstreams: [] });
  });
  it('returns orphan ws and task docs instead of dropping them', () => {
    const s = run();
    s.workstreams.push({ id: 'wOrph', data: { id: 'wOrph', programId: 'nope', order: 0 } });
    s.tasks.push({ id: 'tOrph', data: { id: 'tOrph', workstreamId: 'nope', order: 0 } });
    const { project, orphans } = asm(s);
    expect(orphans).toEqual({ workstreams: ['wOrph'], tasks: ['tOrph'], actions: [], raid: [], missingRaid: [] });
    expect(JSON.stringify(project)).not.toContain('Orph');
  });
  it('programMeta has no raid; split makes one raid doc per program with items as-is', () => {
    const s = run();
    for (const m of Object.values(s.meta.programMeta)) expect(m.raid).toBeUndefined();
    expect(s.raid.map((r) => r.id)).toEqual(['pg1', 'pg2']);
    expect(s.raid[0].data).toEqual({ workspaceId: 'main', projectId: 'proj_fx', programId: 'pg1', items: fixture.programs[0].raid, version: 1 });
    expect(s.raid[1].data.items).toEqual([]);
  });
  it('program without a raid key: no raid doc, stays absent', () => {
    const p = clone(fixture);
    delete p.programs[0].raid;
    const s = run(p);
    expect(s.raid.map((r) => r.id)).toEqual(['pg2']);
    expect(s.meta.programMeta.pg1.__absent).toContain('raid');
    expect(roundTrip(p)).toStrictEqual(p);
  });
  it('duplicate programs keep separate raid docs', () => {
    const p = clone(fixture);
    p.programs.push(clone(p.programs[0]));
    p.programs[2].workstreams = [];
    p.programs[2].raid[0].title = 'second';
    const s = run(p);
    expect(s.raid.map((r) => r.id)).toEqual(['pg1', 'pg2', 'pg1__dup2']);
    expect(roundTrip(p)).toStrictEqual(p);
  });
  it('raid doc with an unknown program is an orphan and is not attached', () => {
    const s = run();
    s.raid.push({ id: 'nope', data: { programId: 'nope', items: [{ id: 'x' }], version: 1 } });
    const { project, orphans } = asm(s);
    expect(orphans.raid).toEqual(['nope']);
    expect(JSON.stringify(project)).not.toContain('"x"');
  });
  it('missing raid doc for a program that had raid: raid [] + orphans.missingRaid', () => {
    const s = run();
    const { project, orphans } = assembleProject(s.meta, s.workstreams, s.tasks, s.actions, [], s.decisions);
    expect(project.programs[0].raid).toEqual([]);
    expect(orphans.missingRaid).toEqual(['pg1', 'pg2']);
  });
  it('a task under an orphan workstream is an orphan task', () => {
    const s = run();
    s.workstreams.push({ id: 'wOrph', data: { id: 'wOrph', programId: 'nope', order: 0 } });
    s.tasks.push({ id: 'tUnder', data: { id: 'tUnder', workstreamId: 'wOrph', order: 0 } });
    const { project, orphans } = asm(s);
    expect(orphans.workstreams).toEqual(['wOrph']);
    expect(orphans.tasks).toEqual(['tUnder']);
    expect(JSON.stringify(project)).not.toContain('tUnder');
  });
  it('ws without tasks key, program without workstreams key, project without actionItems/programs', () => {
    const p = clone(fixture);
    delete p.programs[0].workstreams[1].tasks;
    delete p.programs[1].workstreams;
    delete p.actionItems;
    expect(roundTrip(p)).toStrictEqual(p);
    const q = { id: 'q', name: 'Q' };
    expect(roundTrip(q)).toStrictEqual(q);
  });
  it('program without an id round-trips', () => {
    const p = clone(fixture);
    delete p.programs[1].id;
    expect(roundTrip(p)).toStrictEqual(p);
  });
  it('duplicate program, workstream and action ids are reported and kept apart', () => {
    const p = clone(fixture);
    p.programs.push(clone(p.programs[0]));
    p.programs[2].workstreams[0].tasks = [];
    p.programs[2].workstreams[1].tasks = [];
    p.programs[2].workstreams[2].tasks = [];
    p.actionItems.push(clone(p.actionItems[0]));
    const s = run(p);
    expect(s.report.duplicateIds).toEqual(expect.arrayContaining(['program:pg1', 'workstream:w1', 'workstream:w2', 'workstream:w3', 'action:a1', 't1']));
    expect(s.meta.programMeta.pg1__dup2.id).toBe('pg1');
    expect(roundTrip(p)).toStrictEqual(p);
  });
  it('items without id (workstream, action) round-trip', () => {
    const p = clone(fixture);
    delete p.programs[0].workstreams[1].id;
    delete p.actionItems[1].id;
    expect(roundTrip(p)).toStrictEqual(p);
  });
  it('action workstreamId is the workstream DOC id, consistent with tasks', () => {
    const p = clone(fixture);
    p.programs[0].workstreams.unshift({ id: 'w1', name: 'WS dup', tasks: [] });
    const s = run(p);
    const a1 = s.actions.find((a) => a.id === 'a1').data;
    const t2 = s.tasks.find((t) => t.id === 't2').data;
    expect(a1.workstreamId).toBe(t2.workstreamId);
    expect(a1.workstreamId).toBe('w1__dup2');
  });
  it('groups match case/diacritic-insensitively', () => {
    const p = clone(fixture);
    p.programs[0].workstreams[0].tasks[0].contributors = ['bod', 'fín'];
    p.contributorRegistry.push({ name: 'Fín' });
    const s = run(p);
    expect(s.report.unresolved.some((u) => u.raw === 'bod' || u.raw === 'fín')).toBe(false);
  });
  it('unresolved.where is the doc id', () => {
    const { report } = run();
    expect(report.unresolved[0].where).toBe('t1__dup2');
  });
});

describe('P2.3 Task 2: decisions as docs; assemble strips write stamps', () => {
  const asm = (s) => assembleProject(s.meta, s.workstreams, s.tasks, s.actions, s.raid, s.decisions);
  it('splits decisions into docs (id = decision id, order = index, v2 fields)', () => {
    const { decisions } = run();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].id).toBe('d1');
    expect(decisions[0].data).toEqual({
      id: 'd1', title: 'Go', decidedBy: 'Alice Nguyen', workspaceId: 'main', projectId: 'proj_fx', order: 0, version: 1,
    });
  });
  it('dup and id-less decisions get suffix / placeholder ids and round-trip', () => {
    const p = clone(fixture);
    p.decisions = [{ id: 'dx', title: 'A' }, { id: 'dx', title: 'B' }, { title: 'no id' }];
    const s = run(p);
    expect(s.decisions.map((d) => d.id)).toEqual(['dx', 'dx__dup2', '__decision_2']);
    expect(s.report.duplicateIds).toContain('decision:dx');
    expect(s.decisions[2].data.id).toBeUndefined();
    expect(roundTrip(p)).toStrictEqual(p);
    const rev = [...s.decisions].reverse();
    expect(assembleProject(s.meta, s.workstreams, s.tasks, s.actions, s.raid, rev).project).toStrictEqual(p);
  });
  it('absent decisions key stays absent; empty array stays empty', () => {
    const p = clone(fixture);
    delete p.decisions;
    expect(run(p).meta.v1Absent).toContain('decisions');
    expect(roundTrip(p)).toStrictEqual(p);
    p.decisions = [];
    expect(roundTrip(p)).toStrictEqual(p);
  });
  it('rebuilds decisions from docs, ignoring the frozen meta copy', () => {
    const s = run();
    const docs = [{ id: 'd1', data: { ...s.decisions[0].data, title: 'Edited' } }];
    expect(assembleProject(s.meta, s.workstreams, s.tasks, s.actions, s.raid, docs).project.decisions[0].title).toBe('Edited');
    expect(assembleProject(s.meta, s.workstreams, s.tasks, s.actions, s.raid, []).project.decisions).toEqual([]);
  });
  it('strips version/updatedBy/updatedAt/viaProgramId/viaWorkstreamId from every item', () => {
    const s = run();
    const stamp = { version: 7, updatedBy: 'u9', updatedAt: 123, viaProgramId: 'pg1', viaWorkstreamId: 'w1' };
    for (const list of [s.workstreams, s.tasks, s.actions, s.decisions]) for (const d of list) Object.assign(d.data, stamp);
    expect(assembleProject(s.meta, s.workstreams, s.tasks, s.actions, s.raid, s.decisions).project).toStrictEqual(fixture);
  });
  it('keeps authorUid inside update entries (not stripped)', () => {
    const p = clone(fixture);
    p.programs[0].workstreams[0].tasks[0].updates = [{ text: 'x', authorUid: 'u1' }];
    expect(roundTrip(p)).toStrictEqual(p);
  });
  it('restores v1 stamp-named values that were stashed at split time', () => {
    const p = clone(fixture);
    const task = p.programs[0].workstreams[0].tasks[0];
    task.updatedBy = 'Legacy Person';
    task.updatedAt = '2020-01-01';
    p.decisions[0].version = 'v-old';
    const s = run(p);
    expect(s.report.collisions).toEqual(expect.arrayContaining([
      { kind: 'task', id: task.id, key: 'updatedBy' },
      { kind: 'decision', id: 'd1', key: 'version' },
    ]));
    // a writer then stamps the doc; assemble strips the stamp but restores the v1 value
    s.tasks.find((t) => t.data.id === task.id && !t.id.includes('dup')).data.updatedBy = 'uid-writer';
    expect(asm(s).project).toStrictEqual(p);
  });
});
