import { describe, it, expect } from 'vitest';
import { planBackfill, decideBackfillRollback, formatBackfillPreview, verifyBackfill, MAX_OPS } from '../../scripts/lib/backfill-plan.mjs';
import { parseArgs } from '../../scripts/p2-backfill-uids.mjs';
import { directoryFrom } from '../../scripts/p2-pilot-copy.mjs';

// W3-B2 (B-1, M1): pure planner of scripts/p2-backfill-uids.mjs.
const PID = 'p1';
const members = [
  { id: 'u_hod', data: { email: 'hattt4@smartosc.com', displayName: 'Ha Truong', status: 'active' } },
  { id: 'u_lan', data: { email: 'lan@smartosc.com', displayName: 'Lan Pham', status: 'active' } },
  { id: 'u_minh', data: { email: 'minh@smartosc.com', displayName: 'Minh Le', status: 'active' } },
  { id: 'u_old', data: { email: 'old@smartosc.com', displayName: 'Old Person', status: 'deactivated' } },
  { id: 'u_na', data: { email: 'nam.a@smartosc.com', displayName: 'Nam A', aliases: ['Nam'], status: 'active' } },
  { id: 'u_nb', data: { email: 'nam.b@smartosc.com', displayName: 'Nam B', aliases: ['Nam'], status: 'active' } },
];
const invites = [{ id: 'carol@smartosc.com', data: { email: 'carol@smartosc.com', displayName: 'Carol' } }];
const directory = directoryFrom(members, invites);

const task = (id, over = {}) => ({ id, data: { name: id, status: 'InProgress', pic: null, picUid: null, contributors: [], contributorUids: [], version: 3, ...over } });
const state = (over = {}) => ({
  doc: { name: 'Ops', schemaVersion: 2, visibility: 'restricted', memberUids: ['u_hod'], memberIds: ['u_hod'], contributorRegistry: ['Tax team'], ...over.doc },
  tasks: over.tasks ?? [],
  actions: over.actions ?? [],
});
const plan = (s) => planBackfill({ pid: PID, state: s, directory, members });

describe('W3-B2 planBackfill', () => {
  it('BF-1 a PIC stored by name only (now signed in) gets picUid + picEmail and project access', () => {
    const p = plan(state({ tasks: [task('t1', { pic: 'Lan Pham' })] }));
    expect(p.blocked).toEqual([]);
    expect(p.changes).toEqual([{ kind: 'tasks', id: 't1', name: 't1', status: 'InProgress', version: 3, fields: [
      { key: 'picUid', had: true, before: null, after: 'u_lan' },
      { key: 'picEmail', had: false, before: null, after: 'lan@smartosc.com' },
    ] }]);
    expect(p.grants).toEqual({ union: ['u_lan'], memberUidsAdded: ['u_lan'], memberIdsAdded: ['u_lan'] });
    expect(p.noop).toBe(false);
    expect(p.planHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('BF-2 a stored picUid that differs is listed as mismatch and never changed', () => {
    const p = plan(state({ tasks: [task('t1', { pic: 'Lan Pham', picUid: 'u_minh' })] }));
    expect(p.changes).toEqual([]);
    expect(p.mismatch).toEqual([{ where: 'task t1', name: 'Lan Pham', stored: 'u_minh', resolved: 'u_lan' }]);
    expect(p.noop).toBe(true);
  });

  it('BF-3 group, unknown, invited-not-signed-in and deactivated names are listed, not changed', () => {
    const p = plan(state({ tasks: [
      task('g', { pic: 'Tax team' }), task('u', { pic: 'Somebody' }), task('i', { pic: 'Carol' }), task('d', { pic: 'Old Person' }),
    ] }));
    expect(p.changes).toEqual([]);
    expect(p.unresolved.map((u) => [u.where, u.reason])).toEqual([
      ['task u PIC', 'not in the directory'], ['task i PIC', 'carol@smartosc.com has not signed in yet'],
    ]);
    expect(p.inactive).toEqual([{ where: 'task d PIC', name: 'Old Person', uid: 'u_old', status: 'deactivated' }]);
  });

  it('BF-4 contributors are appended to contributorUids, existing order kept, nothing removed', () => {
    const p = plan(state({ tasks: [task('t1', { picUid: 'u_hod', pic: 'Ha Truong', contributors: ['Minh Le', 'Lan Pham', 'Lan Pham'], contributorUids: ['u_x', 'u_minh'] })] }));
    expect(p.changes[0].fields).toEqual([{ key: 'contributorUids', had: true, before: ['u_x', 'u_minh'], after: ['u_x', 'u_minh', 'u_lan'] }]);
    expect(p.grants.union).toEqual(['u_lan']);
  });

  it('BF-5 a department project gets no memberUids change', () => {
    const p = plan(state({ doc: { visibility: 'department' }, tasks: [task('t1', { pic: 'Lan Pham' })] }));
    expect(p.changes).toHaveLength(1);
    expect(p.grants).toEqual({ union: [], memberUidsAdded: [], memberIdsAdded: [] });
  });

  it('BF-6 closed tasks and actions are included', () => {
    const p = plan(state({
      tasks: [task('t1', { pic: 'Lan Pham', status: 'Completed' })],
      actions: [{ id: 'a1', data: { title: 'A', status: 'Done', pic: 'Minh Le', version: 1 } }],
    }));
    expect(p.changes.map((c) => [c.kind, c.id])).toEqual([['tasks', 't1'], ['actions', 'a1']]);
    expect(p.changes[1].fields.map((f) => f.key)).toEqual(['picUid', 'picEmail']);
  });

  it('BF-7 the hash is stable for the same input and changes when a touched doc version changes', () => {
    const s = state({ tasks: [task('t1', { pic: 'Lan Pham' })] });
    expect(plan(s).planHash).toBe(plan(structuredClone(s)).planHash);
    expect(plan(state({ tasks: [task('t1', { pic: 'Lan Pham', version: 4 })] })).planHash).not.toBe(plan(s).planHash);
  });

  it('BF-8 blocked: not v2, deleted, alias conflict, too many docs', () => {
    expect(plan(state({ doc: { schemaVersion: 1 } })).blocked[0].code).toBe('not-v2');
    expect(plan(state({ doc: { deletedAt: 'x' } })).blocked[0].code).toBe('deleted');
    expect(plan(state({ tasks: [task('t1', { pic: 'Nam' })] })).blocked[0].code).toBe('alias-conflict');
    const many = Array.from({ length: MAX_OPS }, (_, i) => task(`t${i}`, { pic: 'Lan Pham' }));
    expect(plan(state({ tasks: many })).blocked[0].code).toBe('too-many');
  });

  it('BF-9 the preview names the people and the plan hash', () => {
    const p = plan(state({ tasks: [task('t1', { pic: 'Lan Pham' })] }));
    const text = formatBackfillPreview(p, { nameOfUid: (u) => `<${u}>` }).join('\n');
    expect(text).toContain('picUid: null -> <u_lan>');
    expect(text).toContain('memberUids + <u_lan>');
    expect(text).toContain(`--expect ${p.planHash}`);
  });

  it('BF-10 verify reports a field that did not land', () => {
    const p = plan(state({ tasks: [task('t1', { pic: 'Lan Pham' })] }));
    const after = state({ doc: { memberUids: ['u_hod', 'u_lan'], memberIds: ['u_hod', 'u_lan'] }, tasks: [task('t1', { pic: 'Lan Pham', picUid: 'u_lan', picEmail: 'lan@smartosc.com', version: 4 })] });
    expect(verifyBackfill(p, after)).toEqual({ ok: true, mismatches: [] });
    after.tasks[0].data.picUid = null;
    expect(verifyBackfill(p, after).ok).toBe(false);
  });
});

describe('W3-B2 decideBackfillRollback', () => {
  const applied = () => {
    const p = plan(state({ tasks: [task('t1', { pic: 'Lan Pham' }), task('t2', { pic: 'Minh Le' })] }));
    return { kind: 'p2-backfill-uids', pid: PID, planHash: p.planHash, changes: p.changes };
  };
  const after = (t2 = {}) => state({ tasks: [
    task('t1', { pic: 'Lan Pham', picUid: 'u_lan', picEmail: 'lan@smartosc.com', version: 4 }),
    task('t2', { pic: 'Minh Le', picUid: 'u_minh', picEmail: 'minh@smartosc.com', version: 4, ...t2 }),
  ] });

  it('BF-R1 restores the before-values (absent stays absent)', () => {
    const r = decideBackfillRollback({ manifest: applied(), state: after() });
    expect(r.blocked).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.restores[0]).toEqual({ kind: 'tasks', id: 't1', version: 4, fields: [
      { key: 'picUid', had: true, before: null, now: 'u_lan' }, { key: 'picEmail', had: false, before: null, now: 'lan@smartosc.com' },
    ] });
    expect(r.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('BF-R2 a field edited after the apply is skipped', () => {
    const r = decideBackfillRollback({ manifest: applied(), state: after({ picUid: 'u_hod' }) });
    expect(r.skipped).toEqual([{ where: 'tasks/t2', key: 'picUid', expected: 'u_minh', now: 'u_hod' }]);
    expect(r.restores.find((c) => c.id === 't2').fields.map((f) => f.key)).toEqual(['picEmail']);
  });

  it('BF-R3 refuses a manifest of another script', () => {
    expect(decideBackfillRollback({ manifest: { kind: 'p2-assign', pid: PID }, state: after() }).blocked[0].code).toBe('bad-manifest');
  });
});

describe('W3-B2 p2-backfill-uids parseArgs', () => {
  it('BF-A1 modes and refusals', () => {
    expect(parseArgs(['--summary'])).toMatchObject({ summary: true, error: null });
    expect(parseArgs(['p1'])).toMatchObject({ pid: 'p1', apply: false, error: null });
    expect(parseArgs(['p1', '--apply']).error).toMatch(/--expect/);
    expect(parseArgs(['p1', '--apply', '--expect', '0123456789abcdef']).error).toBeNull();
    expect(parseArgs(['p1', '--expect', '0123456789abcdef']).error).toMatch(/with --apply/);
    expect(parseArgs(['--summary', 'p1']).error).toMatch(/read-only/);
    expect(parseArgs(['a/b']).error).toMatch(/project id/);
    expect(parseArgs(['--rollback', 'm.json'])).toMatchObject({ rollback: 'm.json', error: null });
  });
});
