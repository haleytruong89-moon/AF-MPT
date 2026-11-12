import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, collection, runTransaction, serverTimestamp, deleteField } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup, getEnv } from './helpers.js';
import { splitProject } from '../../src/migrateV2.js';
import { buildDirectoryIndex } from '../../src/directory.js';
import { assembleFromSnapshots } from '../../src/readV2.js';
import { planV2Save } from '../../src/planV2Save.js';
import { executeV2Save, applyWritten } from '../../src/execV2Save.js';
import { activityDocFor } from '../../src/activityDoc.js';
import { canEditDecision } from '../../src/roleUi.js';

// P2.3 Task 4: the shim's v2 write path end to end against the rules.
// Plans come from planV2Save (fixture tree edited like App.jsx does); the executor
// runs them with the rules-unit-testing client SDK, one transaction per batch.
//  (1) two users edit different tasks concurrently: both succeed
//  (2) the same task: the second save gets a conflict
//  (3) an Assignee moves a task: denied, nothing written
//  (4) an Assignee marks done: denied
//  (5) PM / Sub-PM edit RAID through the auto claim: ok
//  (6) activity append ok; a forged authorUid denied
//  (X) Ruling X: two new updates in one save -> both land, 2 transactions

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' };
const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' };
const ASG = { uid: 'u_asg', email: 'asg@smartosc.com' };
const ASG2 = { uid: 'u_asg2', email: 'asg2@smartosc.com' };
const ALL = [OWNER, PM, LEAD, ASG, ASG2];

const WID = 'main';
const PID = 'pv';
const WS = `workspaces/${WID}`;
const PV = `${WS}/projects/${PID}`;
const KINDS = ['workstreams', 'tasks', 'actions', 'raid', 'decisions'];

const dirIndex = buildDirectoryIndex(ALL.map((u) => ({ email: u.email, displayName: u.email.split('@')[0] })));
const uidByEmail = new Map(ALL.map((u) => [u.email, u.uid]));

const v1Tree = () => ({
  id: PID,
  name: 'Pilot',
  programs: [{
    id: 'prg1',
    name: 'Program 1',
    raid: [{ id: 'r1', type: 'Risk', title: 'Risk 1', status: 'Open', history: [] }],
    workstreams: [
      {
        id: 'w1',
        name: 'WS 1',
        tasks: [
          { id: 't1', name: 'Task 1', pic: ASG.email, status: 'InProgress', updates: [], checkIns: [] },
          { id: 't2', name: 'Task 2', pic: ASG2.email, status: 'InProgress', updates: [], checkIns: [] },
        ],
      },
      { id: 'w2', name: 'WS 2', tasks: [] },
    ],
  }, {
    // No PM / Sub-PM (I3: RAID claim fallback).
    id: 'prg2',
    name: 'Program 2',
    raid: [{ id: 'r2', type: 'Issue', title: 'Issue 2', status: 'Open', history: [] }],
    workstreams: [],
  }],
  // A loose action (workstreamId null = Owner-only, I2).
  actionItems: [{ id: 'aLoose', title: 'Loose', status: 'Pending', updates: [] }],
  decisions: [],
});

async function seedProject() {
  const s = splitProject(v1Tree(), { wid: WID, dirIndex, uidByEmail });
  s.meta.programMeta.prg1.pmUid = PM.uid;
  await seedDoc(PV, {
    ...s.meta, schemaVersion: 2, visibility: 'restricted',
    memberUids: ALL.map((u) => u.uid), memberIds: ALL.map((u) => u.uid), roles: {},
  });
  const lists = { workstreams: s.workstreams, tasks: s.tasks, actions: s.actions, raid: s.raid, decisions: s.decisions };
  for (const kind of KINDS) {
    for (const { id, data } of lists[kind]) {
      const d = { ...data, updatedBy: 'seed' };
      if (kind === 'workstreams' && id === 'w1') d.leadUid = LEAD.uid;
      await seedDoc(`${PV}/${kind}/${id}`, d);
    }
  }
}

// What the shim's read path keeps (loaded) and hands the App (tree).
async function load(db) {
  const meta = (await getDoc(doc(db, PV))).data();
  const snaps = await Promise.all(KINDS.map((k) => getDocs(collection(db, `${PV}/${k}`))));
  const lists = snaps.map((s) => s.docs.map((d) => ({ id: d.id, data: d.data() })));
  const docs = {};
  KINDS.forEach((k, i) => {
    docs[k] = new Map(lists[i].map(({ id, data }) => [id, { version: data.version, data }]));
  });
  const [ws, tasks, actions, raid, decisions] = lists;
  const { project } = assembleFromSnapshots({ meta, ws, tasks, actions, raid, decisions });
  return { loaded: { meta, docs }, tree: JSON.parse(JSON.stringify({ ...project, id: PID })) };
}

const ws1 = (tree) => tree.programs[0].workstreams[0];
const taskIn = (tree, id) => tree.programs[0].workstreams.flatMap((w) => w.tasks).find((t) => t.id === id);

let txCount = 0;
const fs = {
  runTransaction: (...a) => { txCount++; return runTransaction(...a); },
  doc, serverTimestamp, deleteField,
};

// Load as u, apply edit(tree), plan, execute. -> { r, plan }
async function save(u, edit, { loadedState } = {}) {
  const db = await asUser(u.uid, u.email);
  const { loaded, tree } = loadedState || await load(db);
  edit(tree);
  const plan = planV2Save(loaded, tree, { uid: u.uid, wid: WID, pid: PID, isOwner: u === OWNER, dirIndex, uidByEmail });
  const r = await executeV2Save(fs, { db, wid: WID, pid: PID, uid: u.uid, plan });
  return { r, plan };
}

async function serverDoc(path) {
  const e = await getEnv();
  let out;
  await e.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), path));
    out = s.exists() ? s.data() : undefined;
  });
  return out;
}

const upd = (u, text) => ({ id: `${u.uid}-${text}`, text, author: u.email, timestamp: '2026-10-23T00:00:00Z' });

describe('P2.3 v2 save executor against the rules', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
    for (const u of ALL) {
      await seedDoc(`${WS}/members/${u.uid}`, {
        email: u.email, displayName: u.email, aliases: [], department: 'AF', status: 'active',
        updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
      });
    }
    await seedProject();
    txCount = 0;
  });
  afterAll(cleanup);

  it('EXEC-0 an unchanged tree plans nothing (fixture round-trips)', async () => {
    const { loaded, tree } = await load(await asUser(OWNER.uid, OWNER.email));
    expect(planV2Save(loaded, tree, { uid: OWNER.uid, wid: WID, pid: PID, isOwner: true, dirIndex, uidByEmail }))
      .toEqual({ batches: [], metaPatch: null, refused: null });
  });

  it('EXEC-1 two users edit two different tasks at the same time: both succeed', async () => {
    const [a, b] = await Promise.all([
      save(ASG, (t) => { taskIn(t, 't1').updates.unshift(upd(ASG, 'a')); }),
      save(ASG2, (t) => { taskIn(t, 't2').updates.unshift(upd(ASG2, 'b')); }),
    ]);
    expect(a.r.status).toBe('ok');
    expect(b.r.status).toBe('ok');
    const t1 = await serverDoc(`${PV}/tasks/t1`);
    const t2 = await serverDoc(`${PV}/tasks/t2`);
    expect(t1).toMatchObject({ version: 2, updatedBy: ASG.uid });
    expect(t1.updates[0]).toMatchObject({ text: 'a', authorUid: ASG.uid });
    expect(t2).toMatchObject({ version: 2, updatedBy: ASG2.uid });
    expect(t2.updates[0]).toMatchObject({ text: 'b', authorUid: ASG2.uid });
  });

  it('EXEC-2 two users edit the same task: the second save gets a conflict', async () => {
    const pmState = await load(await asUser(PM.uid, PM.email));
    const leadState = await load(await asUser(LEAD.uid, LEAD.email));
    const first = await save(PM, (t) => { taskIn(t, 't1').name = 'PM name'; }, { loadedState: pmState });
    expect(first.r.status).toBe('ok');
    const second = await save(LEAD, (t) => { taskIn(t, 't1').name = 'Lead name'; }, { loadedState: leadState });
    expect(second.r).toMatchObject({ status: 'conflict', failedBatch: 0, written: [] });
    expect(await serverDoc(`${PV}/tasks/t1`)).toMatchObject({ name: 'PM name', version: 2, updatedBy: PM.uid });
  });

  it('EXEC-3 an Assignee moves a task to another workstream: denied, nothing written', async () => {
    const before = { t1: await serverDoc(`${PV}/tasks/t1`), t2: await serverDoc(`${PV}/tasks/t2`) };
    const { r, plan } = await save(ASG, (t) => {
      const [moved] = ws1(t).tasks.splice(0, 1);
      t.programs[0].workstreams[1].tasks.push(moved);
    });
    expect(plan.batches.flat().some((o) => o.id === 't1' && o.data.workstreamId === 'w2')).toBe(true);
    expect(r).toMatchObject({ status: 'denied', failedBatch: 0, written: [] });
    expect(await serverDoc(`${PV}/tasks/t1`)).toEqual(before.t1);
    expect(await serverDoc(`${PV}/tasks/t2`)).toEqual(before.t2);
  });

  it('EXEC-4 an Assignee marks their task done: denied; a progress update is ok', async () => {
    const done = await save(ASG, (t) => { taskIn(t, 't1').status = 'Completed'; });
    expect(done.r.status).toBe('denied');
    expect((await serverDoc(`${PV}/tasks/t1`)).status).toBe('InProgress');
    const progress = await save(ASG, (t) => { taskIn(t, 't1').updates.unshift(upd(ASG, 'progress')); });
    expect(progress.r.status).toBe('ok');
  });

  it('EXEC-5 PM and Sub-PM edit RAID through the auto claim: ok', async () => {
    const pm = await save(PM, (t) => { t.programs[0].raid[0].title = 'PM edit'; });
    expect(pm.plan.batches[0][0]).toMatchObject({ kind: 'raid', op: 'update', data: { viaProgramId: 'prg1' } });
    expect(pm.r.status).toBe('ok');
    const lead = await save(LEAD, (t) => { t.programs[0].raid[0].title = 'Lead edit'; });
    expect(lead.plan.batches[0][0]).toMatchObject({ kind: 'raid', op: 'update', data: { viaWorkstreamId: 'w1' } });
    expect(lead.r.status).toBe('ok');
    expect(await serverDoc(`${PV}/raid/prg1`)).toMatchObject({ version: 3, updatedBy: LEAD.uid });
    const asg = await save(ASG, (t) => { t.programs[0].raid[0].title = 'Asg edit'; });
    expect(asg.r.status).toBe('denied');
  });

  it('EXEC-6 activity append (shim shape, W2 R3) ok; a forged authorUid denied', async () => {
    const db = await asUser(ASG.uid, ASG.email);
    const entry = { id: 'act1', timestamp: '2026-10-23T00:00:00Z', author: 'Asg', type: 'task_edit', description: 'x' };
    // The shim writes activityDocFor(entry, uid) + createdAt (no author / timestamp).
    await assertSucceeds(setDoc(doc(db, `${PV}/activity/act1`), { ...activityDocFor(entry, ASG.uid), createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, `${PV}/activity/act2`), { ...activityDocFor({ ...entry, id: 'act2' }, PM.uid), createdAt: serverTimestamp() }));
  });

  it('EXEC-X Ruling X: two new updates in one save land in 2 transactions', async () => {
    const { r, plan } = await save(PM, (t) => {
      taskIn(t, 't1').updates.unshift(upd(PM, 'one'));
      taskIn(t, 't1').updates.unshift(upd(PM, 'two'));
    });
    expect(plan.batches).toHaveLength(2);
    expect(r.status).toBe('ok');
    expect(txCount).toBe(2);
    const t1 = await serverDoc(`${PV}/tasks/t1`);
    expect(t1.version).toBe(3);
    expect(t1.updates.map((u) => u.text)).toEqual(['two', 'one']);
    expect(t1.updates.every((u) => u.authorUid === PM.uid)).toBe(true);
  });

  // ── Final-review fixes ──
  // One `loaded` cache across two saves, refreshed with applyWritten like the shim;
  // the App tree is never reloaded, so it lacks the planner's authorUid stamps.
  async function twoSaves(u, first, second) {
    const state = await load(await asUser(u.uid, u.email));
    const a = await save(u, first, { loadedState: state });
    applyWritten(state.loaded, a.r.written, a.r.metaWritten ? a.plan.metaPatch : null);
    const b = await save(u, second, { loadedState: state });
    return { a, b };
  }

  it('EXEC-C1 Assignee: add update, then change status in the same session -> ok, stamp kept', async () => {
    const { a, b } = await twoSaves(ASG,
      (t) => { taskIn(t, 't1').updates.unshift(upd(ASG, 'first')); },
      (t) => { taskIn(t, 't1').status = 'Planned'; });
    expect(a.r.status).toBe('ok');
    expect(b.r.status).toBe('ok');
    const t1 = await serverDoc(`${PV}/tasks/t1`);
    expect(t1).toMatchObject({ status: 'Planned', version: 3, updatedBy: ASG.uid });
    expect(t1.updates).toHaveLength(1);
    expect(t1.updates[0]).toMatchObject({ text: 'first', authorUid: ASG.uid });
  });

  it('EXEC-C1 Owner: add update, then edit the task -> stamp kept', async () => {
    const { a, b } = await twoSaves(OWNER,
      (t) => { taskIn(t, 't2').updates.unshift(upd(OWNER, 'o')); },
      (t) => { taskIn(t, 't2').name = 'Owner rename'; });
    expect(a.r.status).toBe('ok');
    expect(b.r.status).toBe('ok');
    const t2 = await serverDoc(`${PV}/tasks/t2`);
    expect(t2).toMatchObject({ name: 'Owner rename', version: 3 });
    expect(t2.updates[0]).toMatchObject({ text: 'o', authorUid: OWNER.uid });
  });

  it('EXEC-I2 PM creates an action in a project with a loose action: only the new doc is written', async () => {
    const { r, plan } = await save(PM, (t) => {
      t.actionItems.unshift({ id: 'aNew', title: 'New', pic: ASG.email, relatedTaskId: 't1', status: 'Pending', updates: [] });
    });
    expect(plan.batches.flat().map((o) => [o.kind, o.op, o.id])).toEqual([['actions', 'create', 'aNew']]);
    expect(r.status).toBe('ok');
    expect(await serverDoc(`${PV}/actions/aNew`)).toMatchObject({ order: -1, workstreamId: 'w1', updatedBy: PM.uid });
    expect(await serverDoc(`${PV}/actions/aLoose`)).toMatchObject({ order: 0, version: 1 });
    const { tree } = await load(await asUser(PM.uid, PM.email));
    expect(tree.actionItems.map((a) => a.id)).toEqual(['aNew', 'aLoose']);
  });

  // Wave 2 R5 (supersedes I3): no role in program 2 -> no claim, denied.
  it('EXEC-I3 PM / Sub-PM of program 1 edit RAID of program 2 (no role there) -> denied, nothing written', async () => {
    const before = await serverDoc(`${PV}/raid/prg2`);
    const pm = await save(PM, (t) => { t.programs[1].raid[0].title = 'PM edit'; });
    expect(pm.plan.batches[0][0]).toMatchObject({ kind: 'raid', id: 'prg2' });
    expect(pm.plan.batches[0][0].data).not.toHaveProperty('viaProgramId');
    expect(pm.r.status).toBe('denied');
    const lead = await save(LEAD, (t) => { t.programs[1].raid[0].title = 'Lead edit'; });
    expect(lead.plan.batches[0][0].data).not.toHaveProperty('viaWorkstreamId');
    expect(lead.r.status).toBe('denied');
    expect(await serverDoc(`${PV}/raid/prg2`)).toEqual(before);
  });

  // P2.4 fix round 1: a tab loaded while v2 saves after a rollback (project
  // back to v1): the executor sees schemaVersion !== 2 and returns conflict
  // (reload banner) without writing; the rules would deny the writes anyway.
  it('EXEC-RB stale v2 tab after a rollback: conflict, nothing written', async () => {
    const pmState = await load(await asUser(PM.uid, PM.email));
    const e = await getEnv();
    await e.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), PV), { schemaVersion: deleteField(), programMeta: deleteField() });
    });
    const before = await serverDoc(`${PV}/tasks/t1`);
    const projBefore = await serverDoc(PV);
    const { r, plan } = await save(PM, (t) => {
      taskIn(t, 't1').name = 'stale';
      t.programs[0].raid[0].title = 'stale';
    }, { loadedState: pmState });
    expect(plan.batches.flat().length).toBeGreaterThan(0);
    expect(r).toMatchObject({ status: 'conflict', failedBatch: 0, written: [], metaWritten: false });
    expect(await serverDoc(`${PV}/tasks/t1`)).toEqual(before);
    expect(await serverDoc(PV)).toEqual(projBefore);
  });

  it('EXEC-AE Assignee adds a reference and requests a deadline change -> ok; end change denied', async () => {
    const { a, b } = await twoSaves(ASG,
      (t) => { taskIn(t, 't1').references = [{ id: 'ref_1', url: 'https://x', title: 'Doc' }]; },
      (t) => { taskIn(t, 't1').deadlineRequest = { newDate: '2026-12-15', reason: 'r', requestedBy: 'asg' }; });
    expect(a.r.status).toBe('ok');
    expect(b.r.status).toBe('ok');
    const end = await save(ASG, (t) => { taskIn(t, 't1').end = '2026-12-15'; });
    expect(end.r.status).toBe('denied');
  });
  it('EXEC-PM stale Owner tab renames a program: only programMeta.<id>.name changes; pmUid / deputyUid set meanwhile survive', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    const stale = await load(db); // loaded before the admin script
    const e = await getEnv();
    await e.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), PV), { 'programMeta.prg1.deputyUid': 'u_dep', 'programMeta.prg2.pmUid': 'u_pm2' });
    });
    const { r, plan } = await save(OWNER, (t) => { t.programs[0].name = 'Program 1 renamed'; }, { loadedState: stale });
    expect(plan.metaPatch).toEqual({ 'programMeta.prg1.name': 'Program 1 renamed' });
    expect(r.status).toBe('ok');
    const pv = await serverDoc(PV);
    expect(pv.programMeta.prg1).toMatchObject({ name: 'Program 1 renamed', pmUid: PM.uid, deputyUid: 'u_dep' });
    expect(pv.programMeta.prg2.pmUid).toBe('u_pm2');
  });

  // Wave 2 W2 (B2): a stale Owner tab renaming the project after another tab already
  // renamed it gets a conflict (metaBase check in the first transaction); nothing is written.
  it('EXEC-W2 stale Owner tab saves a project-level field changed meanwhile: conflict, nothing written; fresh load saves ok', async () => {
    const stale = await load(await asUser(OWNER.uid, OWNER.email));
    const e = await getEnv();
    await e.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), PV), { name: 'Renamed in tab B' });
    });
    const before = await serverDoc(PV);
    const { r, plan } = await save(OWNER, (t) => { t.name = 'Renamed in tab A'; }, { loadedState: stale });
    expect(plan.metaBase).toEqual({ name: 'Pilot' });
    expect(r).toMatchObject({ status: 'conflict', failedBatch: 0, written: [], metaWritten: false });
    expect(await serverDoc(PV)).toEqual(before);
    const fresh = await save(OWNER, (t) => { t.name = 'Renamed in tab A'; });
    expect(fresh.r.status).toBe('ok');
    expect((await serverDoc(PV)).name).toBe('Renamed in tab A');
  });

  // P3 Task 8 (Ruling P3-8): the App resolves a blocker in place (App.jsx
  // resolveBlocker); the planner moves it to the append-only map, one key per write.
  describe('blocker resolutions (fold / unfold)', () => {
    const blk = (id) => ({ id, text: `blocked ${id}`, isBlocker: true, author: ASG.email, timestamp: '2026-10-20T00:00:00Z', authorUid: ASG.uid });
    const resolveIn = (t, id, at, note) => {
      t.updates = t.updates.map((u) => (u.id === id ? { ...u, resolvedAt: at, resolvedBy: ASG.email, resolution: note } : u));
    };
    beforeEach(async () => {
      const e = await getEnv();
      await e.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), `${PV}/tasks/t1`), { updates: [blk('b2'), blk('b1')] });
      });
      txCount = 0;
    });

    it('EXEC-BR1 Assignee resolves a blocker and posts an update in one save: one transaction, map key, raw updates', async () => {
      const { r, plan } = await save(ASG, (t) => {
        const task = taskIn(t, 't1');
        resolveIn(task, 'b1', '2026-10-26T01:00:00.000Z', 'Bank approved');
        task.updates.unshift(upd(ASG, 'unblocked'));
      });
      expect(plan.batches).toHaveLength(1);
      expect(r.status).toBe('ok');
      expect(txCount).toBe(1);
      const t1 = await serverDoc(`${PV}/tasks/t1`);
      expect(t1.version).toBe(2);
      expect(t1.updates).toEqual([{ ...upd(ASG, 'unblocked'), authorUid: ASG.uid }, blk('b2'), blk('b1')]);
      expect(t1.blockerResolutions).toEqual({
        b1: { resolvedAt: '2026-10-26T01:00:00.000Z', resolvedBy: ASG.email, resolution: 'Bank approved', authorUid: ASG.uid },
      });
      // Read path folds it back; the untouched tree is a no-op.
      const again = await load(await asUser(ASG.uid, ASG.email));
      expect(taskIn(again.tree, 't1').updates[2]).toMatchObject({ id: 'b1', resolvedAt: '2026-10-26T01:00:00.000Z', resolution: 'Bank approved' });
      expect(taskIn(again.tree, 't1')).not.toHaveProperty('blockerResolutions');
      expect(planV2Save(again.loaded, again.tree, { uid: ASG.uid, wid: WID, pid: PID, dirIndex, uidByEmail }))
        .toEqual({ batches: [], metaPatch: null, refused: null });
    });

    it('EXEC-BR2 Assignee resolves two blockers in one save: split into two single-key writes, both land', async () => {
      const { r, plan } = await save(ASG, (t) => {
        const task = taskIn(t, 't1');
        resolveIn(task, 'b2', '2026-10-26T02:00:00.000Z', null);
        resolveIn(task, 'b1', '2026-10-26T01:00:00.000Z', 'first');
      });
      expect(plan.batches).toHaveLength(2);
      expect(r.status).toBe('ok');
      expect(txCount).toBe(2);
      const t1 = await serverDoc(`${PV}/tasks/t1`);
      expect(t1.version).toBe(3);
      expect(t1.updates).toEqual([blk('b2'), blk('b1')]);
      expect(Object.keys(t1.blockerResolutions).sort()).toEqual(['b1', 'b2']);
      expect(t1.blockerResolutions.b2).toMatchObject({ resolution: null, authorUid: ASG.uid });
    });

    it('EXEC-BR3 a non-PIC, non-contributor cannot resolve: denied, nothing written', async () => {
      const before = await serverDoc(`${PV}/tasks/t1`);
      const { r } = await save(ASG2, (t) => { resolveIn(taskIn(t, 't1'), 'b1', '2026-10-26T01:00:00.000Z', 'x'); });
      expect(r.status).toBe('denied');
      expect(await serverDoc(`${PV}/tasks/t1`)).toEqual(before);
    });
  });
  // Wave 2 W3 I1 / W2-17: invite-only uid backfill against the rules. t1 is stored with
  // picUid null (the PIC was an invite when assigned); the directory now resolves ASG.
  describe('W2-17 uid backfill (PM / Sub-PM, open and closing tasks)', () => {
    beforeEach(async () => {
      const t1 = await serverDoc(`${PV}/tasks/t1`);
      await seedDoc(`${PV}/tasks/t1`, { ...t1, picUid: null });
    });

    it('EXEC-BF1 PM edits an open task whose picUid is null: ok and picUid written', async () => {
      const { r } = await save(PM, (t) => { taskIn(t, 't1').name = 'PM edit'; });
      expect(r.status).toBe('ok');
      expect(await serverDoc(`${PV}/tasks/t1`)).toMatchObject({ name: 'PM edit', picUid: ASG.uid });
    });

    it('EXEC-BF2 PM direct-closes such a task: ok (no credit keys in the close)', async () => {
      const { r, plan } = await save(PM, (t) => { taskIn(t, 't1').status = 'Completed'; });
      expect(plan.batches.flat().find((o) => o.id === 't1').data.picUid).toBeNull();
      expect(r.status).toBe('ok');
      expect(await serverDoc(`${PV}/tasks/t1`)).toMatchObject({ status: 'Completed', picUid: null });
    });

    it('EXEC-BF3 Sub-PM of the work stream: same as BF1 within the own WS', async () => {
      const { r } = await save(LEAD, (t) => { taskIn(t, 't1').name = 'Lead edit'; });
      expect(r.status).toBe('ok');
      expect(await serverDoc(`${PV}/tasks/t1`)).toMatchObject({ name: 'Lead edit', picUid: ASG.uid });
    });
  });

  // PR-A carry A4 #4: a decision filed under prg1's PM claim.
  describe('A4 decisions by program claim', () => {
    const PM2 = { uid: 'u_pm2', email: 'pm2@smartosc.com' };
    beforeEach(async () => {
      const e = await getEnv();
      await e.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), PV), { 'programMeta.prg2.pmUid': PM2.uid, memberUids: [...ALL.map((u) => u.uid), PM2.uid] });
      });
      await seedDoc(`${WS}/members/${PM2.uid}`, { email: PM2.email, displayName: 'pm2', aliases: [], department: 'AF', status: 'active', updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email });
      await seedDoc(`${PV}/decisions/d1`, {
        workspaceId: WID, projectId: PID, order: 0, id: 'd1', title: 'Decision 1', status: 'Open',
        viaProgramId: 'prg1', version: 1, updatedBy: PM.uid,
      });
    });

    it('EXEC-DEC1 Sub-PM of prg1 updates the decision through their claim: ok', async () => {
      const { r, plan } = await save(LEAD, (t) => { t.decisions[0].title = 'Lead edit'; });
      expect(plan.batches.flat().find((o) => o.kind === 'decisions').data).toMatchObject({ viaWorkstreamId: 'w1' });
      expect(r.status).toBe('ok');
      expect((await serverDoc(`${PV}/decisions/d1`)).title).toBe('Lead edit');
    });

    it('EXEC-DEC2 PM of another program: no claim in the plan, UI cap false, forced write denied', async () => {
      const db = await asUser(PM2.uid, PM2.email);
      const { loaded, tree } = await load(db);
      tree.decisions[0].title = 'PM2 edit';
      const plan = planV2Save(loaded, tree, { uid: PM2.uid, wid: WID, pid: PID, isOwner: false, dirIndex, uidByEmail });
      const op = plan.batches.flat().find((o) => o.kind === 'decisions');
      expect(op.data).not.toHaveProperty('viaProgramId');
      expect(op.data).not.toHaveProperty('viaWorkstreamId');
      const roles = { programs: { prg1: { pmUid: PM.uid }, prg2: { pmUid: PM2.uid } }, workstreams: { w1: { programId: 'prg1', leadUid: LEAD.uid } }, decisions: { d1: { programId: 'prg1' } } };
      expect(canEditDecision({ isOwner: false, isV2: true, roles, uid: PM2.uid, decision: { id: 'd1' } })).toBe(false);
      const r = await executeV2Save(fs, { db, wid: WID, pid: PID, uid: PM2.uid, plan });
      expect(r.status).toBe('denied');
      expect((await serverDoc(`${PV}/decisions/d1`)).title).toBe('Decision 1');
    });
  });
});
