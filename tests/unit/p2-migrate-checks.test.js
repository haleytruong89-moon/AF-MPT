import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { precheckProject, checkOrders, taskLinkMismatches, countReport, detectV2Edits } from '../../scripts/lib/migrate-checks.mjs';
import { normaliseForV2 } from '../../scripts/lib/migrate-normalise.mjs';
import { splitProject } from '../../src/migrateV2.js';

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/v1-project.json', import.meta.url), 'utf8'));
const PID = 'proj_fx';
const codes = (l) => l.map((i) => i.code);

describe('precheckProject', () => {
  it('C-1: fixture has no blocking issues; warns pic-unresolved and ids-generated', () => {
    const r = precheckProject(fixture(), { pid: PID });
    expect(r.blocking).toEqual([]);
    expect(codes(r.warnings)).toContain('pic-unresolved');
    expect(r.warnings.find((w) => w.code === 'pic-unresolved' && w.detail.length)).toBeTruthy();
    expect(r.warnings.find((w) => w.code === 'ids-generated').detail).toBe('2');
  });

  it('C-2: each blocking code fires', () => {
    expect(codes(precheckProject(null, { pid: PID }).blocking)).toContain('not-found');
    const d = { ...fixture(), deletedAt: 'x' };
    expect(codes(precheckProject(d, { pid: PID }).blocking)).toContain('deleted');
    const v2 = { ...fixture(), programMeta: {} };
    expect(codes(precheckProject(v2, { pid: PID }).blocking)).toContain('v2-fields-present');
    const r = fixture();
    r.programs[0].raid = {};
    expect(codes(precheckProject(r, { pid: PID }).blocking)).toContain('raid-not-array');
    const s = fixture();
    s.programs[0].workstreams[0].tasks[0].updatedBy = 'someone';
    expect(codes(precheckProject(s, { pid: PID }).blocking)).toContain('v1-stamp');
    expect(codes(precheckProject(fixture(), { pid: PID, maxBytes: 100 }).blocking)).toContain('doc-too-large');
  });

  it('C-3: null list warns; action without related task warns', () => {
    const f = fixture();
    f.programs[0].workstreams[0].tasks[0].updates = null;
    const r = precheckProject(f, { pid: PID });
    expect(r.warnings).toContainEqual({ code: 'null-list', detail: 'programs[0].workstreams[0].tasks[0].updates' });
    expect(r.warnings).toContainEqual({ code: 'action-ws-null', detail: 'a2' });
  });
});

describe('checkOrders / taskLinkMismatches', () => {
  it('C-4: tied and missing', () => {
    const g = () => 'w1';
    expect(checkOrders([{ id: 'a', data: { order: 0 } }, { id: 'b', data: { order: 0 } }], g)).toEqual([{ group: 'w1', kind: 'tied', ids: ['a', 'b'] }]);
    expect(checkOrders([{ id: 'a', data: {} }], g)).toEqual([{ group: 'w1', kind: 'missing', ids: ['a'] }]);
    const s = splitProject(normaliseForV2(fixture(), { pid: PID }).project, { wid: 'main' });
    expect(checkOrders(s.tasks, (d) => d.data.workstreamId)).toEqual([]);
    expect(checkOrders(s.workstreams, (d) => d.data.programId)).toEqual([]);
  });

  it('C-5: flags task with unknown workstream and with wrong program', () => {
    const ws = [{ id: 'w1', data: { programId: 'pg1' } }];
    const tasks = [
      { id: 'ok', data: { workstreamId: 'w1', programId: 'pg1' } },
      { id: 'bad1', data: { workstreamId: 'nope', programId: 'pg1' } },
      { id: 'bad2', data: { workstreamId: 'w1', programId: 'pg2' } },
    ];
    expect(taskLinkMismatches(ws, tasks)).toEqual(['bad1', 'bad2']);
  });
});

const liveOf = (n) => {
  const s = splitProject(n.project, { wid: 'main' });
  return { meta: s.meta, workstreams: s.workstreams, tasks: s.tasks, actions: s.actions, raid: s.raid, decisions: s.decisions, activity: [] };
};

describe('countReport', () => {
  it('C-6: ok on a clean split; fails when a task doc is dropped', () => {
    const raw = fixture();
    const n = normaliseForV2(raw, { pid: PID });
    const live = liveOf(n);
    const rep = countReport({ v1Raw: raw, normalised: n, live, v1ActivityCount: 0 });
    expect(rep.ok).toBe(true);
    expect(rep.rows.find((r) => r.kind === 'tasks')).toMatchObject({ v1: 4, removed: 0, v2: 4, ok: true });
    const bad = countReport({ v1Raw: raw, normalised: n, live: { ...live, tasks: live.tasks.slice(1) }, v1ActivityCount: 0 });
    expect(bad.ok).toBe(false);
    expect(bad.rows.find((r) => r.kind === 'tasks').ok).toBe(false);
  });

  it('accounts for removed nulls', () => {
    const raw = fixture();
    raw.actionItems = [null, ...raw.actionItems];
    const n = normaliseForV2(raw, { pid: PID });
    const rep = countReport({ v1Raw: raw, normalised: n, live: liveOf(n) });
    expect(rep.rows.find((r) => r.kind === 'actions')).toMatchObject({ v1: 3, removed: 1, v2: 2, ok: true });
    expect(rep.ok).toBe(true);
  });
});

describe('detectV2Edits', () => {
  const stamped = (id, extra = {}) => ({ id, data: { version: 1, updatedBy: 'p2-migrate', ...extra } });
  const record = { docIds: { tasks: ['t1', 't2'] }, written: { programMeta: { pg1: { name: 'P' } } } };
  const mk = () => ({ meta: { programMeta: { pg1: { name: 'P' } } }, docs: { tasks: [stamped('t1'), stamped('t2')] }, activity: [{ id: 'e1', data: { copiedBy: 'p2-migrate' } }] });

  it('C-7: clean', () => {
    expect(detectV2Edits(record, mk())).toMatchObject({ clean: true, edited: [], deleted: [], programMetaChanged: false, newActivity: [] });
  });
  it('C-7: edited, deleted, new activity, programMeta change', () => {
    const live = mk();
    live.docs.tasks[1] = { id: 't2', data: { version: 2, updatedBy: 'uidZ' } };
    expect(detectV2Edits(record, live).edited).toEqual([{ kind: 'tasks', id: 't2', version: 2, updatedBy: 'uidZ' }]);
    const l2 = mk();
    l2.docs.tasks = [stamped('t1')];
    expect(detectV2Edits(record, l2).deleted).toEqual([{ kind: 'tasks', id: 't2' }]);
    const l3 = mk();
    l3.activity.push({ id: 'e9', data: {} });
    const r3 = detectV2Edits(record, l3);
    expect(r3.newActivity).toEqual(['e9']);
    expect(r3.clean).toBe(false);
    const l4 = mk();
    l4.meta.programMeta.pg1.pmUid = 'u';
    expect(detectV2Edits(record, l4).programMetaChanged).toBe(true);
  });
});
