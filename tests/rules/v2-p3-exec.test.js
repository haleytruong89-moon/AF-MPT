import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { doc, getDoc, getDocs, collection, runTransaction, serverTimestamp, deleteField } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup, getEnv } from './helpers.js';
import { splitProject } from '../../src/migrateV2.js';
import { buildDirectoryIndex } from '../../src/directory.js';
import { assembleFromSnapshots, rolesFromLoaded } from '../../src/readV2.js';
import { planV2Save } from '../../src/planV2Save.js';
import { executeV2Save } from '../../src/execV2Save.js';
import { applyCloseIntent } from '../../src/closeFlow.js';

// P3 Task 9: the close flow end to end against the real rules. Each transition is
// built by the client (closeFlow.applyCloseIntent on roles from rolesFromLoaded),
// planned by planV2Save and written by executeV2Save with the rules-unit-testing
// client (the shim's path), so client/rules parity is proven without hand-built
// payloads.
//  P3I-1 Assignee submits -> Submitted, approver = Sub-PM
//  P3I-2 Sub-PM approves -> Completed, stamps + history
//  P3I-3 Sub-PM approves and PM rejects from the same snapshot -> second = conflict
//  P3I-4 Assignee resolves a blocker -> resolvedAt on the reassembled tree
//  P3I-5 Assignee direct Completed (roles null -> legacy intent) -> denied

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' };
const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' };
const ASG = { uid: 'u_asg', email: 'asg@smartosc.com' };
const ALL = [OWNER, PM, LEAD, ASG];

const WID = 'main';
const PID = 'pc';
const WS = `workspaces/${WID}`;
const PV = `${WS}/projects/${PID}`;
const KINDS = ['workstreams', 'tasks', 'actions', 'raid', 'decisions'];
const NOW = '2026-11-04T01:00:00.000Z';

const dirIndex = buildDirectoryIndex(ALL.map((u) => ({ email: u.email, displayName: u.email.split('@')[0] })));
const uidByEmail = new Map(ALL.map((u) => [u.email, u.uid]));

const v1Tree = () => ({
  id: PID,
  name: 'Close flow',
  programs: [{
    id: 'prg1',
    name: 'Program 1',
    raid: [],
    workstreams: [{
      id: 'w1',
      name: 'WS 1',
      tasks: [{
        id: 't1', name: 'Task 1', pic: ASG.email, status: 'InProgress', checkIns: [],
        updates: [{ id: 'b1', text: 'blocked', isBlocker: true, author: ASG.email, timestamp: '2026-10-20T00:00:00Z' }],
      }],
    }],
  }],
  actionItems: [],
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

const taskIn = (tree) => tree.programs[0].workstreams[0].tasks.find((t) => t.id === 't1');
const fs = { runTransaction, doc, serverTimestamp, deleteField };
const meOf = (u) => ({ uid: u.uid, name: u.email.split('@')[0] });
const planOpts = (u) => ({ uid: u.uid, wid: WID, pid: PID, isOwner: u === OWNER, dirIndex, uidByEmail });

async function stateFor(u) {
  const db = await asUser(u.uid, u.email);
  return { db, ...(await load(db)) };
}

// The App choke point: a raw status change -> applyCloseIntent -> one planner +
// executor save per step (as closeWiring.runCloseFlow does).
async function closeAs(u, state, status, { reason, roles } = {}) {
  const { db, loaded, tree } = state;
  const r0 = roles === undefined ? rolesFromLoaded(loaded, [OWNER.uid]) : roles;
  const oldTask = taskIn(tree);
  const intent = applyCloseIntent({ roles: r0, oldTask, nextTask: { ...oldTask, status }, me: meOf(u), now: NOW, reason });
  const results = [];
  for (const step of intent.steps) {
    const ws = tree.programs[0].workstreams[0];
    ws.tasks = ws.tasks.map((t) => (t.id === 't1' ? step : t));
    const plan = planV2Save(loaded, tree, planOpts(u));
    results.push(await executeV2Save(fs, { db, wid: WID, pid: PID, uid: u.uid, plan }));
  }
  return { intent, results, status: results.length ? results[results.length - 1].status : intent.outcome };
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

describe('P3 close flow end to end against the rules', () => {
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
  });
  afterAll(cleanup);

  const submit = async () => {
    const r = await closeAs(ASG, await stateFor(ASG), 'Completed');
    expect(r.intent.outcome).toBe('submit');
    expect(r.status).toBe('ok');
    return r;
  };

  it('P3I-1 Assignee submits: ok; stored Submitted, closeRequest.approverUid == Sub-PM', async () => {
    await submit();
    const t1 = await serverDoc(`${PV}/tasks/t1`);
    expect(t1.status).toBe('Submitted');
    expect(t1.closeRequest).toMatchObject({ approverUid: LEAD.uid, requestedByUid: ASG.uid, outcome: 'Completed', prevStatus: 'InProgress' });
    expect(t1.updatedBy).toBe(ASG.uid);
  });

  it('P3I-1b Assignee cannot approve their own request: denied client-side, nothing saved', async () => {
    await submit();
    const r = await closeAs(ASG, await stateFor(ASG), 'Completed');
    expect(r.intent.outcome).toBe('denied');
    expect(r.results).toHaveLength(0);
    expect((await serverDoc(`${PV}/tasks/t1`)).status).toBe('Submitted');
  });

  it('P3I-2 Sub-PM approves: ok; stored Completed, approvedByUid Sub-PM, history[0] Approved', async () => {
    await submit();
    const r = await closeAs(LEAD, await stateFor(LEAD), 'Completed');
    expect(r.intent.outcome).toBe('approve');
    expect(r.status).toBe('ok');
    const t1 = await serverDoc(`${PV}/tasks/t1`);
    expect(t1.status).toBe('Completed');
    expect(t1.approvedByUid).toBe(LEAD.uid);
    expect(t1.closeRequest).toBeNull();
    expect(t1.closeRequestHistory[0]).toMatchObject({ status: 'Approved', decidedByUid: LEAD.uid, requestedByUid: ASG.uid });
  });

  it('P3I-3 Sub-PM approves and PM rejects from the same snapshot: first ok, second conflict', async () => {
    await submit();
    const leadState = await stateFor(LEAD);
    const pmState = await stateFor(PM);
    const a = await closeAs(LEAD, leadState, 'Completed');
    expect(a.intent.outcome).toBe('approve');
    expect(a.status).toBe('ok');
    const b = await closeAs(PM, pmState, 'InProgress', { reason: 'Missing evidence' });
    expect(b.intent.outcome).toBe('reject');
    expect(b.status).toBe('conflict');
    const t1 = await serverDoc(`${PV}/tasks/t1`);
    expect(t1.status).toBe('Completed');
    expect(t1.closeRequestHistory).toHaveLength(1);
    expect(t1.closeRequestHistory[0].status).toBe('Approved');
  });

  it('P3I-3b PM rejects alone (control for P3I-3): ok; InProgress, history Rejected, reject update', async () => {
    await submit();
    const r = await closeAs(PM, await stateFor(PM), 'InProgress', { reason: 'Missing evidence' });
    expect(r.intent.outcome).toBe('reject');
    expect(r.status).toBe('ok');
    const t1 = await serverDoc(`${PV}/tasks/t1`);
    expect(t1.status).toBe('InProgress');
    expect(t1.closeRequest).toBeNull();
    expect(t1.closeRequestHistory[0]).toMatchObject({ status: 'Rejected', reason: 'Missing evidence', decidedByUid: PM.uid });
    expect(t1.updates[0]).toMatchObject({ text: 'Close request rejected: Missing evidence', authorUid: PM.uid });
  });

  it('P3I-4 Assignee resolves a blocker: ok; reassembled tree shows resolvedAt on that update', async () => {
    const { db, loaded, tree } = await stateFor(ASG);
    const task = taskIn(tree);
    // App.jsx resolveBlocker: in place on the updates entry.
    task.updates = task.updates.map((u) => (u.id === 'b1'
      ? { ...u, resolvedAt: '2026-11-04T02:00:00.000Z', resolvedBy: ASG.email, resolution: 'Bank approved' } : u));
    const plan = planV2Save(loaded, tree, planOpts(ASG));
    const r = await executeV2Save(fs, { db, wid: WID, pid: PID, uid: ASG.uid, plan });
    expect(r.status).toBe('ok');
    const stored = await serverDoc(`${PV}/tasks/t1`);
    expect(stored.blockerResolutions.b1).toMatchObject({ resolvedAt: '2026-11-04T02:00:00.000Z', authorUid: ASG.uid });
    const again = await stateFor(ASG);
    expect(taskIn(again.tree).updates.find((u) => u.id === 'b1'))
      .toMatchObject({ resolvedAt: '2026-11-04T02:00:00.000Z', resolution: 'Bank approved' });
  });

  it('P3I-5 Assignee direct Completed (roles null -> legacy intent): denied, nothing written', async () => {
    const before = await serverDoc(`${PV}/tasks/t1`);
    const r = await closeAs(ASG, await stateFor(ASG), 'Completed', { roles: null });
    expect(r.intent.outcome).toBe('legacy');
    expect(r.status).toBe('denied');
    expect(await serverDoc(`${PV}/tasks/t1`)).toEqual(before);
  });
});
