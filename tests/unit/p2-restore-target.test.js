import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { assembleProject, splitProject } from '../../src/migrateV2.js';
import { normaliseForV2 } from '../../scripts/lib/migrate-normalise.mjs';
import { readBackupProject, buildRestoreTarget } from '../../scripts/lib/restore-target.mjs';

const PID = 'proj_fx';
const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/v1-project.json', import.meta.url), 'utf8'));
const roundTrip = (p) => {
  const s = splitProject(p, { wid: 'main' });
  return assembleProject(s.meta, s.workstreams, s.tasks, s.actions, s.raid, s.decisions).project;
};
const liveTree = () => roundTrip(normaliseForV2(fixture(), { pid: PID }).project);
const prog = (tree, id) => tree.programs.find((p) => p.id === id);
const ws = (tree, id) => tree.programs.flatMap((p) => p.workstreams || []).find((w) => w.id === id);

describe('buildRestoreTarget', () => {
  it('T-1: backup equal to live -> tree equals live, nothing retained', () => {
    const live = liveTree();
    const r = buildRestoreTarget(structuredClone(live), live, { pid: PID });
    expect(r.blocked).toEqual([]);
    expect(r.tree).toEqual(live);
    expect(r.retained).toEqual([]);
  });

  it('T-2: a Completed live task absent from the backup is kept as Dropped with its updates', () => {
    const live = liveTree();
    const backup = structuredClone(live);
    ws(live, 'w2').tasks.push({ id: 't9', name: 'Late task', status: 'Completed', updates: [{ id: 'u1', text: 'done' }] });
    const r = buildRestoreTarget(backup, live, { pid: PID });
    expect(r.blocked).toEqual([]);
    const tasks = ws(r.tree, 'w2').tasks;
    expect(tasks[tasks.length - 1]).toEqual({ id: 't9', name: 'Late task', status: 'Dropped', updates: [{ id: 'u1', text: 'done' }] });
    expect(r.retained).toEqual([
      { kind: 'task', id: 't9', name: 'Late task', liveStatus: 'Completed', newStatus: 'Dropped', parentId: 'w2' },
    ]);
    expect(ws(live, 'w2').tasks[0].status).toBe('Completed');
  });

  it('T-3: retained workstreams and programs are re-attached in tree order', () => {
    const live = liveTree();
    const backup = structuredClone(live);
    prog(live, 'pg2').workstreams.push({ id: 'w9', name: 'WS Nine', tasks: [{ id: 't8', name: 'T8', status: 'In Progress' }] });
    live.programs.push({ id: 'pg9', name: 'Program Nine', raid: [], workstreams: [{ id: 'w8', name: 'WS Eight', tasks: [] }] });
    const r = buildRestoreTarget(backup, live, { pid: PID });
    expect(r.blocked).toEqual([]);
    const pg2 = prog(r.tree, 'pg2');
    expect(pg2.workstreams[pg2.workstreams.length - 1].id).toBe('w9');
    expect(pg2.workstreams[pg2.workstreams.length - 1].tasks).toEqual([{ id: 't8', name: 'T8', status: 'Dropped' }]);
    expect(r.tree.programs[r.tree.programs.length - 1]).toEqual(live.programs[live.programs.length - 1]);
    expect(r.retained.map((x) => `${x.kind} ${x.id} ${x.parentId}`)).toEqual([
      'workstream w9 pg2', 'task t8 w9', 'program pg9 null', 'workstream w8 pg9',
    ]);
    expect(r.retained.find((x) => x.id === 't8')).toMatchObject({ liveStatus: 'In Progress', newStatus: 'Dropped' });
    expect(r.retained.find((x) => x.id === 'pg9')).toMatchObject({ liveStatus: null, newStatus: null, name: 'Program Nine' });
  });

  it('T-4: a pre-migration v1 backup gets the same generated ids as the migration', () => {
    const live = liveTree();
    const r = buildRestoreTarget(fixture(), live, { pid: PID });
    expect(r.blocked).toEqual([]);
    expect(r.retained).toEqual([]);
    expect(r.idMap.length).toBe(2);
    const liveIds = ws(live, 'w1').tasks.map((t) => t.id).concat(ws(live, 'w3').tasks.map((t) => t.id));
    for (const m of r.idMap) expect(liveIds).toContain(m.newId);
    expect(r.tree).toEqual(live);
  });

  it('T-5: absent actions are Cancelled unless Done/Cancelled; absent decisions kept unchanged', () => {
    const live = liveTree();
    const backup = structuredClone(live);
    live.actionItems.push({ id: 'a9', title: 'Open one', status: 'Open' });
    live.actionItems.push({ id: 'a8', title: 'Done one', status: 'Done' });
    live.decisions.push({ id: 'd9', title: 'Later decision' });
    const r = buildRestoreTarget(backup, live, { pid: PID });
    expect(r.tree.actionItems.slice(-2)).toEqual([
      { id: 'a9', title: 'Open one', status: 'Cancelled' },
      { id: 'a8', title: 'Done one', status: 'Done' },
    ]);
    expect(r.tree.decisions[r.tree.decisions.length - 1]).toEqual({ id: 'd9', title: 'Later decision' });
    expect(r.retained).toEqual([
      { kind: 'action', id: 'a9', name: 'Open one', liveStatus: 'Open', newStatus: 'Cancelled', parentId: null },
      { kind: 'action', id: 'a8', name: 'Done one', liveStatus: 'Done', newStatus: null, parentId: null },
      { kind: 'decision', id: 'd9', name: 'Later decision', liveStatus: null, newStatus: null, parentId: null },
    ]);
  });

  it('T-7: raid not an array in the backup blocks; inputs are not mutated', () => {
    const live = liveTree();
    const backup = structuredClone(live);
    prog(backup, 'pg2').raid = {};
    ws(live, 'w2').tasks.push({ id: 't9', name: 'Late', status: 'Open' });
    const b0 = structuredClone(backup);
    const l0 = structuredClone(live);
    const r = buildRestoreTarget(backup, live, { pid: PID });
    expect(r.blocked[0].code).toBe('raid-not-array');
    expect(backup).toEqual(b0);
    expect(live).toEqual(l0);
  });
});

describe('readBackupProject', () => {
  it('T-6: invalid backup, missing pid, __v2 stripped, activity count', () => {
    expect(readBackupProject({ meta: {}, projects: {} }, 'p').blocked.map((b) => b.code)).toEqual(['pid-not-in-backup']);
    expect(readBackupProject([], 'p').blocked.map((b) => b.code)).toEqual(['backup-invalid']);
    expect(readBackupProject(null, 'p').blocked.map((b) => b.code)).toEqual(['backup-invalid']);

    const project = { ...liveTree(), id: 'other', __v2: { orphans: 0 } };
    const backup = { meta: { projectIds: [PID] }, projects: { [PID]: project }, activity: { [PID]: [{ id: 'e1' }, { id: 'e2' }] } };
    const r = readBackupProject(backup, PID);
    expect(r.blocked).toEqual([]);
    expect(r.project.__v2).toBeUndefined();
    expect(r.project.id).toBe(PID);
    expect(r.activityCount).toBe(2);
    expect(project.__v2).toEqual({ orphans: 0 });

    const r2 = readBackupProject({ ...backup, activity: { [PID]: { entries: [{ id: 'e1' }] } } }, PID);
    expect(r2.activityCount).toBe(1);
    expect(readBackupProject({ ...backup, activity: undefined }, PID).activityCount).toBe(0);
  });
});
