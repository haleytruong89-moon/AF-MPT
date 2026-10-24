import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliseForV2, isValidDocId, fnv1a32, generatedId } from '../../scripts/lib/migrate-normalise.mjs';
import { splitProject } from '../../src/migrateV2.js';

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/v1-project.json', import.meta.url), 'utf8'));
const PID = 'proj_fx';

describe('normaliseForV2', () => {
  it('N-1: first t1 keeps id; duplicate and id-less get generated ids', () => {
    const { project, idMap } = normaliseForV2(fixture(), { pid: PID });
    const w1 = project.programs[0].workstreams[0].tasks;
    const w3 = project.programs[0].workstreams[2].tasks;
    expect(w1[0].id).toBe('t1');
    expect(w3[0].id).toMatch(/^task_m[0-9a-z]+$/);
    expect(w1[2].id).toMatch(/^task_m[0-9a-z]+$/);
    expect(idMap).toHaveLength(2);
    expect(idMap.find((m) => m.newId === w3[0].id).reason).toBe('duplicate');
    expect(idMap.find((m) => m.newId === w1[2].id).reason).toBe('missing');
  });

  it('N-2: deterministic and independent of workstream order', () => {
    const a = normaliseForV2(fixture(), { pid: PID });
    const b = normaliseForV2(fixture(), { pid: PID });
    expect(b.idMap).toEqual(a.idMap);
    const swapped = fixture();
    const ws = swapped.programs[0].workstreams;
    [ws[0], ws[1]] = [ws[1], ws[0]];
    const c = normaliseForV2(swapped, { pid: PID });
    const idless = (p) => p.programs[0].workstreams.flatMap((w) => w.tasks).find((t) => t.name === 'No id task').id;
    expect(idless(c.project)).toBe(idless(a.project));
  });

  it('N-3: split has no duplicate ids and no __ doc ids', () => {
    const { project } = normaliseForV2(fixture(), { pid: PID });
    const s = splitProject(project, { wid: 'main' });
    expect(s.report.duplicateIds).toEqual([]);
    for (const list of [s.workstreams, s.tasks, s.actions, s.decisions]) {
      for (const d of list) expect(d.id.startsWith('__')).toBe(false);
    }
  });

  it('N-4: does not mutate input', () => {
    const f = fixture();
    const before = structuredClone(f);
    normaliseForV2(f, { pid: PID });
    expect(f).toEqual(before);
  });

  it('N-5: drops null entries, reports paths in tree order', () => {
    const f = fixture();
    f.actionItems = [null, f.actionItems[0]];
    f.decisions = [f.decisions[0], null];
    f.programs[0].workstreams[0].tasks[0].updates = [null, { id: 'u', text: 'x' }];
    f.programs[0].raid = [null, f.programs[0].raid[0]];
    const { project, removedNulls } = normaliseForV2(f, { pid: PID });
    expect(removedNulls).toEqual([
      'programs[0].raid[0]',
      'programs[0].workstreams[0].tasks[0].updates[0]',
      'actionItems[0]',
      'decisions[1]',
    ]);
    expect(project.actionItems).toHaveLength(1);
    expect(project.decisions).toHaveLength(1);
    expect(project.programs[0].raid).toHaveLength(1);
    expect(project.programs[0].workstreams[0].tasks[0].updates).toHaveLength(1);
  });

  it('N-6: invalid doc ids are re-id-ed; a unique numeric id stays', () => {
    const f = fixture();
    const bad = ['a/b', '__x__', '..', 'x'.repeat(1600)];
    f.actionItems = bad.map((id) => ({ id, title: id.slice(0, 5) }));
    f.decisions = [{ id: 7, title: 'num' }];
    const { project, idMap } = normaliseForV2(f, { pid: PID });
    for (const id of bad) {
      const m = idMap.find((x) => x.oldId === id);
      expect(m.reason).toBe('invalid');
      expect(isValidDocId(m.newId)).toBe(true);
    }
    expect(project.decisions[0].id).toBe(7);
    expect(isValidDocId('ok')).toBe(true);
    expect(fnv1a32('a')).toMatch(/^[0-9a-z]+$/);
  });

  it('N-7: generated id colliding with an existing id gets _2', () => {
    const f = fixture();
    const hash = generatedId(PID, 'task', f.programs[0].workstreams[0].tasks[2], 1);
    f.programs[0].workstreams[1].tasks = [{ id: hash, name: 'squatter', status: 'Not Started' }];
    const { project, idMap } = normaliseForV2(f, { pid: PID });
    expect(project.programs[0].workstreams[0].tasks[2].id).toBe(`${hash}_2`);
    expect(project.programs[0].workstreams[1].tasks[0].id).toBe(hash);
    expect(idMap.some((m) => m.newId === `${hash}_2`)).toBe(true);
  });
});

describe('normaliseForV2 review fixes', () => {
  it('N-8: null lists become [] in memory only', () => {
    const f = fixture();
    f.decisions = null;
    f.programs[0].workstreams[0].tasks = null;
    f.programs[1].workstreams = null;
    const before = structuredClone(f);
    const { project } = normaliseForV2(f, { pid: PID });
    expect(project.decisions).toEqual([]);
    expect(project.programs[0].workstreams[0].tasks).toEqual([]);
    expect(project.programs[1].workstreams).toEqual([]);
    expect(f).toEqual(before);
    const a = fixture();
    a.actionItems = null;
    expect(normaliseForV2(a, { pid: PID }).project.actionItems).toEqual([]);
    const p = fixture();
    p.programs = null;
    expect(normaliseForV2(p, { pid: PID }).project.programs).toEqual([]);
  });

  it('N-5b: drops nulls in RAID history, mitigationActions and their comments', () => {
    const f = fixture();
    f.programs[0].raid = [{
      id: 'r1', title: 'x',
      history: [null, { at: 1 }],
      mitigationActions: [{ id: 'm1', comments: [null, { t: 1 }] }, null],
    }];
    const { project, removedNulls } = normaliseForV2(f, { pid: PID });
    expect(removedNulls).toEqual([
      'programs[0].raid[0].history[0]',
      'programs[0].raid[0].mitigationActions[1]',
      'programs[0].raid[0].mitigationActions[0].comments[0]',
    ]);
    const r = project.programs[0].raid[0];
    expect(r.history).toHaveLength(1);
    expect(r.mitigationActions).toHaveLength(1);
    expect(r.mitigationActions[0].comments).toHaveLength(1);
  });
});
