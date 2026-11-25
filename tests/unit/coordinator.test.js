import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/v1-project.json';
import { splitProject, assembleProject } from '../../src/migrateV2.js';
import { buildDirectoryIndex } from '../../src/directory.js';
import { planV2Save } from '../../src/planV2Save.js';
import { isCoordinator, canEditRaid, canEditDecision, canCreateAction, actionEditMode, actionDeleteMode, actionTaskOptions, taskPanelCaps, myRoleSummary } from '../../src/roleUi.js';
import { canWriteRaid, canActivateRaid } from '../../src/closeFlow.js';
import { uiTier } from '../../src/tabsByRole.js';
import { executeCoordinatorChange, MAX_COORDINATORS } from '../../src/execRoleChange.js';
import { coordinatorFollowUps } from '../../src/followUps.js';

// W5 Coordinator (HOD 25/11): UI caps mirror rules isCoordinatorIn; the planner files
// decisions like an Owner edit; the executor caps the list at 2.
const roles = {
  ownerUids: ['uO'],
  programs: { pg1: { pmUid: 'uPM' }, pg2: { pmUid: null } },
  workstreams: { w1: { programId: 'pg1', leadUid: null }, w2: { programId: 'pg2', leadUid: null } },
  tasks: { t1: { programId: 'pg1', workstreamId: 'w1', picUid: 'uX', contributorUids: [] } },
  decisions: { dNone: { programId: null } },
  coordinatorUids: ['uC'],
};
const project = { id: 'p', name: 'CRP', programs: [
  { id: 'pg1', name: 'Close', workstreams: [{ id: 'w1', name: 'M', tasks: [{ id: 't1', name: 'T1' }] }] },
  { id: 'pg2', name: 'Tax', workstreams: [{ id: 'w2', name: 'V', tasks: [{ id: 't2', name: 'T2' }] }] },
], __v2: { roles } };
const ctx = (uid) => ({ isOwner: false, isV2: true, roles, uid });

describe('W5 Coordinator', () => {
  it('CR-1 caps: actions / decisions / RAID anywhere, not RAID activation, not task controls', () => {
    expect(isCoordinator(roles, 'uC')).toBe(true);
    expect(isCoordinator(roles, 'uPM')).toBe(false);
    expect(canEditRaid({ ...ctx('uC'), programId: 'pg2' })).toBe(true);
    expect(canEditDecision({ ...ctx('uC'), decision: { id: 'dNone' } })).toBe(true);
    expect(canEditDecision({ ...ctx('uPM'), decision: { id: 'dNone' } })).toBe(false);
    expect(canWriteRaid(roles, 'uC')).toBe(true);
    expect(canActivateRaid(roles, 'pg1', 'uC')).toBe(false);
    expect(canCreateAction(project, ctx('uC'))).toBe(true);
    expect(actionTaskOptions(project, ctx('uC')).map((o) => o.task.id)).toEqual(['t1', 't2']);
    expect(actionEditMode({ ...ctx('uC'), action: { workstreamId: null }, isPic: false })).toBe('full');
    expect(actionEditMode({ ...ctx('uC'), action: { status: 'Cancelled' }, isPic: false })).toBe('comment');
    expect(actionDeleteMode({ ...ctx('uC'), action: { workstreamId: null } })).toBe('cancel');
    expect(taskPanelCaps({ ...ctx('uC'), taskId: 't1', status: 'InProgress' })).toEqual({ health: false, refs: false, resolveBlocker: false, addAction: true, comment: true });
    expect(taskPanelCaps({ ...ctx('uZ'), taskId: 't1', status: 'InProgress' }).addAction).toBe(false);
  });

  it('CR-2 role chip and UI tier', () => {
    expect(myRoleSummary(roles, 'uC', project)).toEqual({ label: 'Coordinator', detail: ['Coordinator'] });
    expect(uiTier({ isOwner: false, projects: { p: project }, uid: 'uC' })).toBe('manager');
    expect(uiTier({ isOwner: false, projects: { p: project }, uid: 'uZ' })).toBe('member');
  });

  it('CR-3 planner: a Coordinator decision edit keeps its claim; a new one gets its related task program', () => {
    const dirIndex = buildDirectoryIndex([{ email: 'alice@smartosc.com', displayName: 'Alice Nguyen' }]);
    const uidByEmail = new Map([['alice@smartosc.com', 'uid1']]);
    const s = splitProject(JSON.parse(JSON.stringify(fixture)), { wid: 'main', dirIndex, uidByEmail });
    s.meta.coordinatorUids = ['uidC'];
    const toMap = (list) => new Map(list.map(({ id, data }) => [id, { version: 3, data: { ...data, version: 3 } }]));
    const loaded = { meta: s.meta, docs: { workstreams: toMap(s.workstreams), tasks: toMap(s.tasks), actions: toMap(s.actions), raid: toMap(s.raid), decisions: toMap(s.decisions) } };
    loaded.docs.decisions.get('d1').data.viaWorkstreamId = 'w3';
    const list = (m) => [...m.entries()].map(([id, e]) => ({ id, data: e.data }));
    const tree = JSON.parse(JSON.stringify(assembleProject(loaded.meta, list(loaded.docs.workstreams), list(loaded.docs.tasks), list(loaded.docs.actions), list(loaded.docs.raid), list(loaded.docs.decisions)).project));
    tree.decisions[0].title = 'Edited by Coordinator';
    tree.decisions.unshift({ id: 'dN', title: 'New', relatedTaskIds: ['t2'] });
    const opts = (uid) => ({ uid, wid: 'main', pid: 'proj_fx', isOwner: false, dirIndex, uidByEmail });
    const ops = planV2Save(loaded, tree, opts('uidC')).batches.flat();
    expect(ops.find((o) => o.id === 'd1').data.viaWorkstreamId).toBe('w3');
    expect(ops.find((o) => o.id === 'dN').data.viaProgramId).toBe('pg1');
    // Not a Coordinator and no role: no claim on a new decision.
    const other = planV2Save(loaded, tree, opts('uidZ')).batches.flat();
    expect(other.find((o) => o.id === 'dN').data).not.toHaveProperty('viaProgramId');
  });

  it('CR-4 executor: add (member patch when needed), full at 2, remove, changed', async () => {
    const mk = (data) => {
      const writes = [];
      const fs = {
        doc: (_db, ...p) => p.join('/'),
        serverTimestamp: () => 'TS',
        arrayUnion: (x) => ({ union: x }),
        arrayRemove: (x) => ({ remove: x }),
        runTransaction: async (_db, fn) => fn({
          get: async () => ({ exists: () => !!data, data: () => data }),
          update: (ref, patch) => writes.push({ ref, patch }),
        }),
      };
      return { fs, writes };
    };
    const base = { schemaVersion: 2, memberUids: ['uA'], roles: {} };
    const args = (op, targetUid) => ({ db: 1, wid: 'main', pid: 'p', op, targetUid });
    let t = mk({ ...base, coordinatorUids: [] });
    expect(await executeCoordinatorChange(t.fs, args('add', 'uB'))).toEqual({ status: 'ok', coordinatorUids: ['uB'] });
    expect(t.writes[0].patch).toEqual({ coordinatorUids: { union: 'uB' }, updatedAt: 'TS', memberUids: { union: 'uB' }, memberIds: { union: 'uB' }, 'roles.uB': 'member' });
    t = mk({ ...base, coordinatorUids: ['uX', 'uY'] });
    expect(MAX_COORDINATORS).toBe(2);
    expect((await executeCoordinatorChange(t.fs, args('add', 'uA'))).status).toBe('full');
    expect((await executeCoordinatorChange(t.fs, args('remove', 'uX'))).coordinatorUids).toEqual(['uY']);
    expect(t.writes.at(-1).patch).toEqual({ coordinatorUids: { remove: 'uX' }, updatedAt: 'TS' });
    expect((await executeCoordinatorChange(t.fs, args('remove', 'uZ'))).status).toBe('changed');
    expect((await executeCoordinatorChange(t.fs, args('add', 'bad/id'))).status).toBe('error');
  });
  it('CR-5 My Work follow-ups: open actions past due in projects I coordinate', () => {
    const NOW = new Date(2026, 11, 10, 9, 0);
    const p = { ...project, actionItems: [
      { id: 'a1', title: 'Late', dueDate: '2026-12-01', status: 'Open' },
      { id: 'a2', title: 'Later', dueDate: '2026-12-09', status: 'In Progress' },
      { id: 'a3', title: 'Today', dueDate: '2026-12-10', status: 'Open' },
      { id: 'a4', title: 'Done', dueDate: '2026-12-01', status: 'Done' },
      { id: 'a5', title: 'No date', status: 'Open' },
    ] };
    expect(coordinatorFollowUps({ p }, 'uC', NOW).map((x) => [x.action.id, x.lateDays])).toEqual([['a1', 9], ['a2', 1]]);
    expect(coordinatorFollowUps({ p }, 'uPM', NOW)).toEqual([]);
    expect(coordinatorFollowUps({ p }, null, NOW)).toEqual([]);
  });
});
