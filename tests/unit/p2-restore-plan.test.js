import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDirectoryIndex } from '../../src/directory.js';
import { assembleProject, splitProject } from '../../src/migrateV2.js';
import { appValueFromV2 } from '../../src/readV2.js';
import { normaliseForV2 } from '../../scripts/lib/migrate-normalise.mjs';
import { readBackupProject } from '../../scripts/lib/restore-target.mjs';
import {
  planRestore, planHashOf, liveFingerprint, expectedAfter, buildSnapshot,
  RESTORE_STAMP, MAX_TX_OPS, MAX_PROJECT_DOC_BYTES, RESTORES_PATH, restoreIdOf, TASK_DROPPED, ACTION_CANCELLED,
} from '../../scripts/lib/restore-plan.mjs';

const PID = 'proj_fx';
const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/v1-project.json', import.meta.url), 'utf8'));
const dirIndex = buildDirectoryIndex([
  { email: 'alice@smartosc.com', displayName: 'Alice Nguyen', status: 'active' },
  { email: 'bob@smartosc.com', displayName: 'Bob', status: 'active' },
]);
const uidByEmail = new Map([['alice@smartosc.com', 'uid1'], ['bob@smartosc.com', 'uid2']]);
const KINDS = ['workstreams', 'tasks', 'actions', 'raid', 'decisions'];

function makeLive() {
  const s = splitProject(normaliseForV2(fixture(), { pid: PID }).project, { wid: 'main', dirIndex, uidByEmail });
  const meta = structuredClone({ ...s.meta, schemaVersion: 2, visibility: 'restricted', updatedAt: '2026-11-01T00:00:00.000Z' });
  meta.programMeta.pg1.pmUid = 'uid1';
  const docs = Object.fromEntries(KINDS.map((k) => [k, structuredClone(s[k])]));
  doc({ docs }, 'workstreams', 'w1').leadUid = 'uid1';
  const t2 = doc({ docs }, 'tasks', 't2');
  t2.version = 3;
  t2.updates = [{ id: 'u7', text: 'x', authorUid: 'uidZ' }];
  return { meta, docs };
}
function doc(live, kind, id) {
  return live.docs[kind].find((d) => d.id === id).data;
}
const treeOf = (live) => assembleProject(live.meta, ...KINDS.map((k) => live.docs[k])).project;
const backupOf = (live) => {
  const { __v2: _v2, ...rest } = structuredClone(appValueFromV2(treeOf(live), PID, 0));
  void _v2;
  return rest;
};
const task = (tree, id) => tree.programs.flatMap((p) => p.workstreams || []).flatMap((w) => w.tasks || []).find((t) => t.id === id);
const wsOf = (tree, id) => tree.programs.flatMap((p) => p.workstreams || []).find((w) => w.id === id);
const plan = (live, backupProject, extra = {}) => planRestore({
  pid: PID, live, backupProject, dirIndex, uidByEmail, allowHistoryLoss: false, hasMigrationRecord: false,
  backupSha256: 'a'.repeat(64), backupName: 'backup.json', ...extra,
});
const codes = (issues) => issues.map((i) => i.code);

describe('constants', () => {
  it('exports the Global Constraints values', () => {
    expect(RESTORE_STAMP).toBe('p2-restore');
    expect(MAX_TX_OPS).toBe(450);
    expect(TASK_DROPPED).toBe('Dropped');
    expect(ACTION_CANCELLED).toBe('Cancelled');
    expect(restoreIdOf('p1', 'abc')).toBe('p1_abc');
    expect(RESTORES_PATH('p1_abc')).toBe('workspaces/main/restores/p1_abc');
  });
});

describe('planRestore', () => {
  it('P-1: backup equal to live -> noop, stable fingerprint', () => {
    const live = makeLive();
    const a = plan(live, backupOf(live));
    expect(a.blocked).toEqual([]);
    expect(a.mode).toBe('noop');
    expect(a.ops).toEqual([]);
    expect(a.metaPatch).toBeNull();
    expect(a.planHash).toBeNull();
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(plan(live, backupOf(live)).fingerprint).toBe(a.fingerprint);
  });

  it('P-2: rename a workstream and change a task end -> two updates, no delete', () => {
    const live = makeLive();
    const b = backupOf(live);
    wsOf(b, 'w1').name = 'WS One renamed';
    task(b, 't1').end = '2026-02-28';
    const p = plan(live, b);
    expect(p.mode).toBe('restore');
    expect(p.ops.map(({ kind, op, id, expectVersion }) => ({ kind, op, id, expectVersion }))).toEqual([
      { kind: 'workstreams', op: 'update', id: 'w1', expectVersion: 1 },
      { kind: 'tasks', op: 'update', id: 't1', expectVersion: 1 },
    ]);
    expect(p.ops.some((o) => o.op === 'delete')).toBe(false);
    for (const o of p.ops) for (const k of ['version', 'updatedBy', 'updatedAt']) expect(o.data).not.toHaveProperty(k);
    expect(p.report.perKind.tasks.update).toBe(1);
    expect(p.report.perKind.workstreams.update).toBe(1);
    expect(p.planHash).toMatch(/^[0-9a-f]{16}$/);
    expect(p.refused).toBeNull();
  });

  it('P-3: live roles and authorUid survive', () => {
    const live = makeLive();
    const b = backupOf(live);
    wsOf(b, 'w1').name = 'WS One renamed';
    b.programs.find((x) => x.id === 'pg1').name = 'Program One renamed';
    const t2 = task(b, 't2');
    t2.name = 'Task 2 renamed';
    t2.updates = [{ id: 'u7', text: 'x' }];
    const p = plan(live, b);
    expect(p.ops.find((o) => o.id === 'w1').data.leadUid).toBe('uid1');
    expect(p.metaPatch.programMeta.pg1.pmUid).toBe('uid1');
    expect(p.metaPatch.programMeta.pg1.name).toBe('Program One renamed');
    expect(p.report.programMeta).toEqual([{ key: 'pg1', fields: ['name'] }]);
    const op = p.ops.find((o) => o.id === 't2');
    expect(op.expectVersion).toBe(3);
    expect(op.data.updates[0].authorUid).toBe('uidZ');
    expect(op.data.picUid).toBe('uid2');
  });

  it('P-4: history loss is refused unless allowed (flag hashed); RAID item loss too', () => {
    const live = makeLive();
    const b = backupOf(live);
    task(b, 't2').updates = [];
    const p = plan(live, b);
    expect(p.refused).toBe('history-loss');
    expect(p.report.historyLost).toEqual([{ kind: 'tasks', id: 't2', list: 'updates', entries: [{ id: 'u7', preview: 'x' }] }]);
    const allowed = plan(live, b, { allowHistoryLoss: true });
    expect(allowed.refused).toBeNull();
    expect(allowed.ops.find((o) => o.id === 't2')).toBeTruthy();
    expect(allowed.planHash).toMatch(/^[0-9a-f]{16}$/);
    expect(p.planHash).toMatch(/^[0-9a-f]{16}$/);
    expect(allowed.planHash).not.toBe(p.planHash);

    const b2 = backupOf(live);
    b2.programs.find((x) => x.id === 'pg1').raid = [];
    const r = plan(live, b2);
    expect(r.report.raidItemsLost).toBe(1);
    expect(r.refused).toBe('history-loss');
    expect(r.report.historyLost).toEqual([{ kind: 'raid', id: 'pg1', list: 'items', entries: [{ id: 'r1', preview: 'Delay' }] }]);
  });

  it('P-4b: nested RAID history and mitigation comments count as history', () => {
    const live = makeLive();
    doc(live, 'raid', 'pg1').items = [{
      id: 'r1', title: 'Delay', history: [{ id: 'h1', text: 'raised' }],
      mitigationActions: [{ id: 'm1', comments: [{ id: 'c1', text: 'on it', authorUid: 'uid2' }] }],
    }];
    const b = backupOf(live);
    const item = b.programs.find((x) => x.id === 'pg1').raid[0];
    item.history = [];
    item.mitigationActions[0].comments = [];
    const p = plan(live, b);
    expect(p.refused).toBe('history-loss');
    expect(p.report.raidItemsLost).toBe(0);
    expect(p.report.historyLost).toEqual([
      { kind: 'raid', id: 'pg1', list: 'items[r1].history', entries: [{ id: 'h1', preview: 'raised' }] },
      { kind: 'raid', id: 'pg1', list: 'items[r1].mitigationActions[m1].comments', entries: [{ id: 'c1', preview: 'on it' }] },
    ]);
  });

  it('P-5: a retained Completed task becomes one Dropped update at its live version', () => {
    const live = makeLive();
    const b = backupOf(live);
    live.docs.tasks.push({
      id: 't9',
      data: {
        id: 't9', name: 'Late task', status: 'Completed', updates: [{ id: 'u1', text: 'done', authorUid: 'uid1' }],
        workspaceId: 'main', projectId: PID, programId: 'pg1', workstreamId: 'w2', order: 0,
        picUid: null, picEmail: null, contributorUids: [], version: 2,
      },
    });
    const p = plan(live, b);
    expect(p.refused).toBeNull();
    expect(p.ops).toHaveLength(1);
    expect(p.ops[0]).toMatchObject({ kind: 'tasks', op: 'update', id: 't9', expectVersion: 2 });
    expect(p.ops[0].data.status).toBe('Dropped');
    expect(p.ops[0].data.updates).toEqual([{ id: 'u1', text: 'done', authorUid: 'uid1' }]);
    expect(p.report.retained[0].liveStatus).toBe('Completed');
    expect(p.report.perKind.tasks.retained).toBe(1);
  });

  it('P-6: backup-only task is created; unknown pic warns and resolves to null', () => {
    const live = makeLive();
    const b = backupOf(live);
    wsOf(b, 'w2').tasks.push({ id: 'tN', name: 'From backup', status: 'Not Started', pic: 'Bob' });
    task(b, 't1').pic = 'Nobody Known';
    const p = plan(live, b);
    const create = p.ops.find((o) => o.id === 'tN');
    expect(create).toMatchObject({ kind: 'tasks', op: 'create', expectVersion: null });
    expect(create.data.picUid).toBe('uid2');
    expect(create.data).not.toHaveProperty('version');
    expect(p.report.perKind.tasks.create).toBe(1);
    expect(p.warnings).toContainEqual({ code: 'pic-unresolved', detail: 'tasks/t1' });
    expect(p.ops.find((o) => o.id === 't1').data.picUid).toBeNull();
  });

  it('P-7: preconditions block; warnings', () => {
    let live = makeLive();
    live.meta.schemaVersion = 1;
    let p = plan(live, backupOf(makeLive()));
    expect(codes(p.blocked)).toContain('not-v2');
    expect(p.mode).toBe('blocked');
    expect(p.planHash).toBeNull();

    live = makeLive();
    live.meta.deletedAt = '2026-11-02';
    expect(codes(plan(live, backupOf(makeLive())).blocked)).toContain('deleted');

    expect(codes(plan({ meta: null, docs: {} }, backupOf(makeLive())).blocked)).toEqual(['not-found']);

    live = makeLive();
    const b = backupOf(live);
    doc(live, 'tasks', 't2').workstreamId = 'nope';
    expect(codes(plan(live, b).blocked)).toContain('live-orphans');

    live = makeLive();
    const big = backupOf(live);
    for (let i = 0; i < 451; i++) wsOf(big, 'w2').tasks.push({ id: `tN${i}`, name: `N${i}`, status: 'Not Started' });
    p = plan(live, big);
    expect(codes(p.blocked)).toContain('too-many-ops');
    expect(p.mode).toBe('blocked');

    live = makeLive();
    const named = backupOf(live);
    named.name = 'Other Project';
    p = plan(live, named, { hasMigrationRecord: true });
    expect(codes(p.warnings)).toEqual(expect.arrayContaining(['name-differs', 'migration-rollback-affected']));
    expect(p.metaPatch.name).toBe('Other Project');
    expect(p.report.meta).toEqual([{ field: 'name', from: 'Fixture Project', to: 'Other Project' }]);

    const v1 = fixture();
    p = plan(makeLive(), v1);
    expect(codes(p.warnings)).toContain('ids-generated');
  });

  it('P-8: access fields are never patched; backup memberIds reported', () => {
    const live = makeLive();
    const b = backupOf(live);
    Object.assign(b, {
      memberIds: ['uidX'], memberUids: ['uidX'], roles: { uidX: 'owner' }, visibility: 'department', schemaVersion: 1,
      rev: 99, writeId: 'w', ownerUids: ['uidX'], deletedAt: 'x', projectLead: 'Bob',
    });
    const p = plan(live, b);
    expect(p.report.backupMemberIdsDiff).toEqual({ added: ['uidX'], removed: ['uidZ'] });
    expect(p.metaPatch).toEqual({ projectLead: 'Bob' });
    for (const k of ['memberIds', 'memberUids', 'roles', 'visibility', 'schemaVersion', 'programs', 'actionItems', 'decisions', 'rev', 'writeId', 'ownerUids', 'deletedAt']) {
      expect(p.metaPatch).not.toHaveProperty(k);
    }
    expect(p.report.access).toEqual({ memberIds: 1, memberUids: live.meta.memberUids.length, roles: 0, visibility: 'restricted' });
    expect(plan(live, backupOf(live)).report.backupMemberIdsDiff).toBeNull();
  });

  it('P-9: fingerprint and plan hash sensitivity', () => {
    const live = makeLive();
    const b = backupOf(live);
    task(b, 't1').end = '2026-02-28';
    const base = plan(live, b);

    const bumped = makeLive();
    doc(bumped, 'tasks', 't2').version = 4;
    const p1 = plan(bumped, b);
    expect(p1.fingerprint).not.toBe(base.fingerprint);
    expect(p1.planHash).not.toBe(base.planHash);

    expect(plan(live, b, { backupSha256: 'b'.repeat(64) }).planHash).not.toBe(base.planHash);

    const stamped = makeLive();
    doc(stamped, 'tasks', 't1').updatedAt = '2026-11-03T00:00:00.000Z';
    stamped.meta.updatedAt = '2026-11-03T00:00:00.000Z';
    const p2 = plan(stamped, b);
    expect(p2.fingerprint).toBe(base.fingerprint);
    expect(p2.planHash).toBe(base.planHash);
    expect(liveFingerprint(stamped)).toBe(base.fingerprint);
    expect(planHashOf(base, { pid: PID, backupSha256: 'a'.repeat(64), allowHistoryLoss: false })).toBe(base.planHash);
  });

  it('P-10: expectedAfter applies ops and reassembles to the target', () => {
    const live = makeLive();
    const b = backupOf(live);
    wsOf(b, 'w1').name = 'WS One renamed';
    task(b, 't1').end = '2026-02-28';
    b.programs.find((x) => x.id === 'pg1').name = 'Program One renamed';
    wsOf(b, 'w2').tasks.push({ id: 'tN', name: 'From backup', status: 'Not Started' });
    const before = structuredClone(live);
    const p = plan(live, b);
    const after = expectedAfter(live, p);
    expect(live).toEqual(before);
    const w1 = after.docs.workstreams.find((d) => d.id === 'w1').data;
    expect(w1.version).toBe(2);
    expect(w1.updatedBy).toBe('p2-restore');
    expect(w1).not.toHaveProperty('updatedAt');
    expect(after.docs.tasks.find((d) => d.id === 'tN').data).toMatchObject({ version: 1, updatedBy: 'p2-restore' });
    expect(assembleProject(after.meta, ...KINDS.map((k) => after.docs[k])).project).toEqual(p.target);
    // A re-plan against the expected after-state is a noop (Ruling P4b-12).
    expect(plan(after, b).mode).toBe('noop');
  });

  it('P-10b: retained items re-plan as noop after the restore', () => {
    const live = makeLive();
    const b = backupOf(live);
    live.docs.actions.push({ id: 'a9', data: { id: 'a9', title: 'Late', status: 'Pending', workspaceId: 'main', projectId: PID, order: 2, picUid: null, picEmail: null, workstreamId: null, version: 1 } });
    const p = plan(live, b);
    expect(p.ops).toHaveLength(1);
    expect(p.ops[0].data.status).toBe('Cancelled');
    expect(plan(expectedAfter(live, p), b).mode).toBe('noop');
  });

  it('P-11: buildSnapshot is a valid restore input of the live state', () => {
    const live = makeLive();
    const b = backupOf(live);
    task(b, 't1').end = '2026-02-28';
    const p = plan(live, b);
    const snap = buildSnapshot(live, p, { pid: PID, backupName: 'backup.json', backupSha256: 'a'.repeat(64), createdAt: '2026-11-04T00:00:00.000Z' });
    const { __v2: _v2, ...expected } = appValueFromV2(treeOf(live), PID, 0);
    void _v2;
    expect(snap.projects[PID]).toEqual(expected);
    expect(snap.meta).toEqual({ projectIds: [PID] });
    expect(snap.activity).toEqual({});
    expect(snap.restoreSnapshot).toMatchObject({
      kind: 'p2-restore-snapshot', pid: PID, planHash: p.planHash, fingerprint: p.fingerprint,
      backupFile: 'backup.json', backupSha256: 'a'.repeat(64), createdAt: '2026-11-04T00:00:00.000Z',
    });
    expect(snap.restoreSnapshot.docs).toEqual(live.docs);
    expect(snap.restoreSnapshot.meta).toEqual(live.meta);
    expect(snap.restoreSnapshot.ops).toEqual(p.ops);
    expect(readBackupProject(snap, PID).blocked).toEqual([]);
    // Restoring the snapshot onto the unchanged live state is a noop.
    expect(plan(live, readBackupProject(snap, PID).project).mode).toBe('noop');
  });

  it('P-12: lost mitigation actions block as history; edited entries are reported only', () => {
    const live = makeLive();
    doc(live, 'raid', 'pg1').items = [{
      id: 'r1', title: 'Delay',
      mitigationActions: [{ id: 'm1', text: 'Buffer', comments: [] }, { id: 'm2', text: 'Escalate', comments: [] }],
    }];
    doc(live, 'tasks', 't2').updates = [{ id: 'u7', text: 'x', authorUid: 'uidZ', resolvedAt: '2026-11-02', resolvedBy: 'uid1' }];
    const b = backupOf(live);
    b.programs.find((x) => x.id === 'pg1').raid[0].mitigationActions = [{ id: 'm1', text: 'Buffer', comments: [] }];
    task(b, 't2').updates = [{ id: 'u7', text: 'x' }];
    const p = plan(live, b);
    expect(p.refused).toBe('history-loss');
    expect(p.report.historyLost).toEqual([
      { kind: 'raid', id: 'pg1', list: 'items[r1].mitigationActions', entries: [{ id: 'm2', preview: 'Escalate' }] },
    ]);
    expect(p.report.editedEntries).toEqual([
      { kind: 'tasks', id: 't2', list: 'updates', entries: [{ id: 'u7', preview: 'x' }] },
    ]);
    expect(p.ops.find((o) => o.id === 't2').data.updates).toEqual([{ id: 'u7', text: 'x', authorUid: 'uidZ' }]);
    expect(plan(live, b, { allowHistoryLoss: true }).refused).toBeNull();
  });

  it('P-13: Completed -> other status is listed as credit loss (updates and retained)', () => {
    const live = makeLive();
    doc(live, 'tasks', 't1').status = 'Completed';
    live.docs.tasks.push({
      id: 't9',
      data: {
        id: 't9', name: 'Late task', status: 'Completed', workspaceId: 'main', projectId: PID, programId: 'pg1',
        workstreamId: 'w2', order: 0, picUid: null, picEmail: null, contributorUids: [], version: 1,
      },
    });
    const b = backupOf(live);
    task(b, 't1').status = 'In Progress';
    wsOf(b, 'w2').tasks = [];
    const p = plan(live, b);
    expect(p.refused).toBeNull();
    expect(p.mode).toBe('restore');
    expect(p.report.creditLoss).toEqual([
      { id: 't1', name: 'Task 1', from: 'Completed', to: 'In Progress', retained: false },
      { id: 't9', name: 'Late task', from: 'Completed', to: 'Dropped', retained: true },
    ]);
  });

  it('P-14: live-only meta keys are kept and reported', () => {
    const live = makeLive();
    const b = backupOf(live);
    live.meta.extraNote = 'added later';
    const p = plan(live, b);
    expect(p.metaPatch).toBeNull();
    expect(p.report.meta).toEqual([{ field: 'extraNote', kept: true }]);
    expect(p.target.extraNote).toBe('added later');
  });

  it('P-15: directory-unavailable blocks a changed or new person without dirIndex', () => {
    const live = makeLive();
    const b = backupOf(live);
    task(b, 't1').pic = 'Bob';
    expect(codes(plan(live, b, { dirIndex: null }).blocked)).toContain('directory-unavailable');
    const b2 = backupOf(live);
    wsOf(b2, 'w2').tasks.push({ id: 'tN', name: 'New', status: 'Not Started', contributors: ['Bob'] });
    expect(codes(plan(live, b2, { dirIndex: null }).blocked)).toContain('directory-unavailable');
    const b3 = backupOf(live);
    task(b3, 't1').end = '2026-03-01';
    const ok = plan(live, b3, { dirIndex: null });
    expect(ok.blocked).toEqual([]);
    expect(ok.ops.find((o) => o.id === 't1').data.picUid).toBe('uid1');
  });

  it('P-16: doc-too-large blocks', () => {
    const live = makeLive();
    const b = backupOf(live);
    b.notes = 'x'.repeat(MAX_PROJECT_DOC_BYTES);
    const p = plan(live, b);
    expect(codes(p.blocked)).toContain('doc-too-large');
    expect(p.planHash).toBeNull();
  });

  it('P-17: round-trip failure blocks', () => {
    const live = makeLive();
    const b = backupOf(live);
    b.decisions.push('not an object');
    const p = plan(live, b);
    expect(codes(p.blocked)).toContain('round-trip');
    expect(p.mode).toBe('blocked');
  });

  it('P-18: a live RAID doc with no counterpart is kept, not deleted', () => {
    const live = makeLive();
    const b = backupOf(live);
    delete b.programs.find((x) => x.id === 'pg1').raid;
    const p = plan(live, b);
    expect(p.report.kept).toEqual([{ kind: 'raid', id: 'pg1' }]);
    expect(p.ops.some((o) => o.kind === 'raid')).toBe(false);
    expect(p.refused).toBeNull();
  });

  it('P-19: refused and allowed plans for the same backup hash differently', () => {
    const live = makeLive();
    const b = backupOf(live);
    b.programs.find((x) => x.id === 'pg1').raid = [];
    const refused = plan(live, b);
    const allowed = plan(live, b, { allowHistoryLoss: true });
    expect(refused.refused).toBe('history-loss');
    expect(allowed.refused).toBeNull();
    expect(refused.ops).toEqual(allowed.ops);
    expect(refused.planHash).toMatch(/^[0-9a-f]{16}$/);
    expect(allowed.planHash).not.toBe(refused.planHash);
  });

  it('P-20: action / decision orders reuse the App planner keepOrder (fractional orders stay)', () => {
    const live = makeLive();
    doc(live, 'actions', 'a1').order = -1;
    doc(live, 'actions', 'a2').order = 0.5;
    const b = backupOf(live);
    b.actionItems.splice(1, 0, { id: 'aN', title: 'From backup', status: 'Pending' });
    const p = plan(live, b);
    expect(p.ops.map((o) => o.id)).toEqual(['aN']);
    expect(p.ops[0].data.order).toBe(-0.25);
  });

  it('P-21 (Ruling P4b-18): a live doc whose data.id is missing or differs blocks live-id-mismatch with no ops', () => {
    const live = makeLive();
    const b = backupOf(live);
    wsOf(b, 'w1').name = 'renamed';
    delete doc(live, 'tasks', 't1').id;
    doc(live, 'actions', 'a1').id = 'aX';
    const p = plan(live, b);
    expect(p.mode).toBe('blocked');
    expect(p.blocked).toEqual([{ code: 'live-id-mismatch', detail: 'tasks/t1, actions/a1' }]);
    expect(p.ops).toEqual([]);
    expect(p.planHash).toBeNull();
    // RAID docs are keyed by programId and are not checked.
    const ok = makeLive();
    expect(ok.docs.raid.length).toBeGreaterThan(0);
    expect(plan(ok, backupOf(ok)).blocked).toEqual([]);
  });

  it('P-22 (Ruling P4b-19): removed fields are reported; removing a non-empty array or map is history loss', () => {
    // P3 Task 8: someLog never reaches a backup (folded); use a generic map.
    const live = makeLive();
    Object.assign(doc(live, 'tasks', 't2'), {
      closeRequestHistory: [{ id: 'c1', note: 'asked to close' }],
      someLog: { b1: { note: 'resolved' } },
      emptyList: [], emptyMap: {}, flag: 'x',
    });
    const b = backupOf(live);
    const bt = task(b, 't2');
    for (const k of ['closeRequestHistory', 'someLog', 'emptyList', 'emptyMap', 'flag']) delete bt[k];
    const p = plan(live, b);
    expect(p.report.fieldChanges).toEqual([{
      kind: 'tasks', id: 't2',
      changed: ['closeRequestHistory', 'emptyList', 'emptyMap', 'flag', 'someLog'],
      removed: ['closeRequestHistory', 'emptyList', 'emptyMap', 'flag', 'someLog'],
    }]);
    expect(p.report.historyLost).toEqual([
      // closeRequestHistory is an entry list (checked on its own), so it is not "(field removed)".
      { kind: 'tasks', id: 't2', list: 'closeRequestHistory', entries: [{ id: 'c1', preview: 'asked to close' }] },
      { kind: 'tasks', id: 't2', list: 'someLog (field removed)', entries: [{ id: 'b1', preview: 'resolved' }] },
    ]);
    expect(p.refused).toBe('history-loss');
    const allowed = plan(live, b, { allowHistoryLoss: true });
    expect(allowed.refused).toBeNull();
    expect(allowed.planHash).not.toBe(p.planHash);
    // A removed entry list already checked on its own is not counted twice.
    const live2 = makeLive();
    const b2 = backupOf(live2);
    delete task(b2, 't2').updates;
    const p2 = plan(live2, b2);
    expect(p2.report.historyLost.map((h) => h.list)).toEqual(['updates']);
    expect(p2.report.fieldChanges[0].removed).toEqual(['updates']);
  });

  it('P-23: a project field with "." blocks dotted-field (shown in the preview, not only at apply)', () => {
    const live = makeLive();
    const b = backupOf(live);
    b['x.y'] = 1;
    const p = plan(live, b);
    expect(p.mode).toBe('blocked');
    expect(p.blocked.map((x) => x.code)).toEqual(['dotted-field']);
  });

  it('P-24: a shrinking closeRequestHistory is history loss (entry list, like updates)', () => {
    const live = makeLive();
    doc(live, 'tasks', 't2').closeRequestHistory = [{ id: 'c1', note: 'asked' }, { id: 'c2', note: 'again' }];
    const b = backupOf(live);
    task(b, 't2').closeRequestHistory = [{ id: 'c1', note: 'asked' }];
    const p = plan(live, b);
    expect(p.report.historyLost).toEqual([
      { kind: 'tasks', id: 't2', list: 'closeRequestHistory', entries: [{ id: 'c2', preview: 'again' }] },
    ]);
    expect(p.refused).toBe('history-loss');
  });

  // P3 Task 8: blockerResolutions is folded out of the tree (never in a backup), so the
  // generic map-key check is exercised with another map field.
  it('P-25: losing a key of a kept non-empty map is history loss, listed as <field>.<key> (key removed)', () => {
    const live = makeLive();
    doc(live, 'tasks', 't2').someLog = { b1: { note: 'one' }, b2: { note: 'two' } };
    const b = backupOf(live);
    task(b, 't2').someLog = { b1: { note: 'one' }, b3: { note: 'new' } };
    const p = plan(live, b);
    expect(p.report.historyLost).toEqual([
      { kind: 'tasks', id: 't2', list: 'someLog.b2 (key removed)', entries: [{ id: 'b2', preview: 'two' }] },
    ]);
    expect(p.refused).toBe('history-loss');
    // Adding or editing keys only is not a loss.
    const live2 = makeLive();
    doc(live2, 'tasks', 't2').someLog = { b1: { note: 'one' } };
    const b2 = backupOf(live2);
    task(b2, 't2').someLog = { b1: { note: 'edited' }, b4: { note: 'x' } };
    expect(plan(live2, b2).report.historyLost).toEqual([]);
  });

  it('P-26: blockerResolutions survives a restore (Ruling P3-8): unchanged, kept when the backup lacks it, new in-place ones unfolded', () => {
    const live = makeLive();
    const t2 = doc(live, 'tasks', 't2');
    const blk = (id) => ({ id, text: `blocked ${id}`, isBlocker: true, authorUid: 'uid2' });
    t2.updates = [blk('b3'), blk('b2'), blk('b1'), ...t2.updates];
    const r1 = { resolvedAt: '2026-11-01T00:00:00.000Z', resolvedBy: 'Bob', resolution: 'one', authorUid: 'uid2' };
    t2.blockerResolutions = { b1: r1 };
    const b = backupOf(live);
    expect(task(b, 't2')).not.toHaveProperty('blockerResolutions');
    expect(task(b, 't2').updates[2]).toMatchObject({ id: 'b1', resolvedAt: r1.resolvedAt });
    expect(plan(live, b).ops).toEqual([]);
    // An older backup without the resolution: the map keeps its key, nothing lost.
    const old = backupOf(live);
    const { resolvedAt: _a, resolvedBy: _b, resolution: _c, ...raw } = task(old, 't2').updates[2];
    void _a; void _b; void _c;
    task(old, 't2').updates[2] = raw;
    task(old, 't2').name = 'Renamed';
    let p = plan(live, old);
    expect(p.report.historyLost).toEqual([]);
    expect(p.ops[0].data.blockerResolutions).toEqual({ b1: r1 });
    expect(p.ops[0].data.updates).toEqual(t2.updates);
    // A backup with a resolution the live map lacks: unfolded into the map, raw entry kept.
    const nb = backupOf(live);
    task(nb, 't2').updates[1] = { ...task(nb, 't2').updates[1], resolvedAt: '2026-11-02T00:00:00.000Z', resolvedBy: 'Bob', resolution: null };
    p = plan(live, nb);
    expect(p.report.historyLost).toEqual([]);
    expect(p.ops[0].data.updates).toEqual(t2.updates);
    expect(p.ops[0].data.blockerResolutions).toEqual({
      b1: r1, b2: { resolvedAt: '2026-11-02T00:00:00.000Z', resolvedBy: 'Bob', resolution: null, authorUid: 'p2-restore' },
    });
  });

  it('P-27: a backup entry unresolved while the live map has its key -> warning resolution-kept (task + update ids)', () => {
    const live = makeLive();
    const t2 = doc(live, 'tasks', 't2');
    const blk = (id) => ({ id, text: `blocked ${id}`, isBlocker: true, authorUid: 'uid2' });
    t2.updates = [blk('b2'), blk('b1'), ...t2.updates];
    const r = (n) => ({ resolvedAt: `2026-11-0${n}T00:00:00.000Z`, resolvedBy: 'Bob', resolution: String(n), authorUid: 'uid2' });
    t2.blockerResolutions = { b1: r(1), b2: r(2) };
    // Current backup: resolutions folded in -> no warning.
    expect(plan(live, backupOf(live)).warnings.filter((w) => w.code === 'resolution-kept')).toEqual([]);
    // Older backup: both blockers unresolved (nothing else changed) -> kept resolved, warned.
    const old = backupOf(live);
    task(old, 't2').updates = task(old, 't2').updates.map((u) => {
      const { resolvedAt: _a, resolvedBy: _b, resolution: _c, ...raw } = u;
      void _a; void _b; void _c;
      return raw;
    });
    const p = plan(live, old);
    expect(p.warnings.filter((w) => w.code === 'resolution-kept')).toEqual([{ code: 'resolution-kept', detail: 'tasks/t2: b2, b1' }]);
    expect(p.ops).toEqual([]);
  });

  it('P-28: live Submitted tasks are listed in report.pending with a pending-approvals warning (P3.1 I2)', () => {
    const live = makeLive();
    const b = backupOf(live);
    const t1 = doc(live, 'tasks', 't1');
    Object.assign(t1, { status: 'Submitted', closeRequest: { id: 'cr1', outcome: 'Completed', requestedByUid: 'uid2', approverUid: 'uid1', submittedAt: '2026-11-01T00:00:00.000Z', prevStatus: 'InProgress' } });
    live.docs.tasks.push({ id: 't9', data: {
      id: 't9', name: 'Late', status: 'Submitted', updates: [], workspaceId: 'main', projectId: PID, programId: 'pg1', workstreamId: 'w2', order: 0,
      picUid: null, picEmail: null, contributorUids: [], version: 2,
      closeRequest: { id: 'cr9', outcome: 'Dropped', requestedByUid: 'uid1', approverUid: 'uid2' },
    } });
    const p = plan(live, b);
    expect(p.report.pending).toEqual([
      { id: 't1', name: t1.name, outcome: 'Completed', requestedByUid: 'uid2', approverUid: 'uid1', retained: false },
      { id: 't9', name: 'Late', outcome: 'Dropped', requestedByUid: 'uid1', approverUid: 'uid2', retained: true },
    ]);
    expect(p.warnings).toContainEqual({ code: 'pending-approvals', detail: '2 Submitted task(s) (t1, t9): resolve or withdraw before restoring' });
    // The retained one is written Dropped with its request withdrawn.
    const op = p.ops.find((o) => o.id === 't9');
    expect(op.data).toMatchObject({ status: 'Dropped', closeRequest: null });
    expect(op.data.closeRequestHistory[0]).toMatchObject({ status: 'Withdrawn', decidedByUid: 'p2-restore', reason: 'restore' });
  });

  it('P-29: no Submitted task -> report.pending [] and no pending-approvals warning', () => {
    const live = makeLive();
    const p = plan(live, backupOf(live));
    expect(p.report.pending).toEqual([]);
    expect(codes(p.warnings)).not.toContain('pending-approvals');
  });
});

describe('webhook secret', () => {
  it('p2-restore never writes googleChatWebhook from a backup and does not list it', () => {
    const live = makeLive();
    live.meta.googleChatWebhook = 'https://chat/live';
    const b = backupOf(live);
    b.googleChatWebhook = 'https://chat/old-leaked';
    b.projectLead = 'Bob';
    const p = plan(live, b);
    expect(p.metaPatch).toEqual({ projectLead: 'Bob' });
    expect(JSON.stringify(p.report.meta)).not.toContain('googleChatWebhook');
    const live2 = makeLive();
    live2.meta.googleChatWebhook = 'https://chat/live';
    const p2 = plan(live2, backupOf(makeLive()));
    expect(JSON.stringify(p2.report.meta)).not.toContain('googleChatWebhook');
  });
});
