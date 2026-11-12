import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { doc, getDoc, getDocs, collection, runTransaction, serverTimestamp, deleteField, writeBatch } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup, getEnv } from './helpers.js';
import { splitProject } from '../../src/migrateV2.js';
import { buildDirectoryIndex } from '../../src/directory.js';
import { assembleFromSnapshots } from '../../src/readV2.js';
import { planV2Save } from '../../src/planV2Save.js';
import { executeV2Save } from '../../src/execV2Save.js';
import { MAX_WS_PER_CHUNK } from '../../src/saveChunks.js';

// Wave 2 W1: CRP-sized non-Owner saves run in chunks of at most MAX_WS_PER_CHUNK
// work streams so each transaction stays under Firestore's 20 rules access calls
// (same document counted once; every non-Owner write reads workspace, members/{me}
// and the project = 3, plus the ws docs its branch reads).
// Generated fixture: prg1 = 22 WS x 8 tasks, prg2 = 3 WS x 3 tasks -> 185 tasks,
// 25 WS in 2 programs (CRP today: 187 tasks).
//  CRP-0 fixture size
//  CRP-1 PM renames one PIC across the whole program -> chunked plan, status ok
//  CRP-2 the PIC rename unchunked (one transaction) -> ok as well: the PM branch
//        reads no ws doc for a pic change (as OB-2 in v2-p3-owner-budget), so a
//        rename alone never needed chunks. Kept to document the measured shape.
//  CRP-3 control that bites: PM shifts the due date of every task of the program.
//        taskDatesOk reads the ws doc of each task (taskWithinNewWs) -> 3 + 22 ws
//        docs unchunked = denied, nothing written; the chunked plan -> ok
//  CRP-4 Sub-PM edits every task of their own WS -> ok

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' };
const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' };
const ASG = { uid: 'u_asg', email: 'asg@smartosc.com' };
const ASG2 = { uid: 'u_asg2', email: 'asg2@smartosc.com' };
const ALL = [OWNER, PM, LEAD, ASG, ASG2];

const WID = 'main';
const PID = 'pcrp';
const WS = `workspaces/${WID}`;
const PV = `${WS}/projects/${PID}`;
const KINDS = ['workstreams', 'tasks', 'actions', 'raid', 'decisions'];
const SHAPE = [{ id: 'prg1', ws: 22, tasks: 8 }, { id: 'prg2', ws: 3, tasks: 3 }];

const dirIndex = buildDirectoryIndex(ALL.map((u) => ({ email: u.email, displayName: u.email.split('@')[0] })));
const uidByEmail = new Map(ALL.map((u) => [u.email, u.uid]));

const v1Tree = () => ({
  id: PID,
  name: 'CRP-sized',
  programs: SHAPE.map((p) => ({
    id: p.id,
    name: p.id,
    raid: [],
    workstreams: Array.from({ length: p.ws }, (_, w) => ({
      id: `${p.id}_w${w}`,
      name: `${p.id} WS ${w}`,
      tasks: Array.from({ length: p.tasks }, (_, j) => ({
        id: `${p.id}_t${w}_${j}`,
        name: `Task ${w}.${j}`,
        pic: ASG.email,
        start: '2026-01-01',
        end: '2026-12-31',
        status: 'InProgress',
        updates: [],
        checkIns: [],
      })),
    })),
  })),
  actionItems: [],
  decisions: [],
});

// Batched seeding with rules disabled (211 docs per test).
async function seedMany(entries) {
  const e = await getEnv();
  await e.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (let i = 0; i < entries.length; i += 400) {
      const b = writeBatch(db);
      for (const [path, data] of entries.slice(i, i + 400)) b.set(doc(db, path), data);
      await b.commit();
    }
  });
}

async function seedProject() {
  const s = splitProject(v1Tree(), { wid: WID, dirIndex, uidByEmail });
  s.meta.programMeta.prg1.pmUid = PM.uid;
  const entries = [[PV, {
    ...s.meta, schemaVersion: 2, visibility: 'restricted',
    memberUids: ALL.map((u) => u.uid), memberIds: ALL.map((u) => u.uid), roles: {},
  }]];
  const lists = { workstreams: s.workstreams, tasks: s.tasks, actions: s.actions, raid: s.raid, decisions: s.decisions };
  for (const kind of KINDS) {
    for (const { id, data } of lists[kind]) {
      const d = { ...data, updatedBy: 'seed' };
      if (kind === 'workstreams' && id === 'prg1_w0') d.leadUid = LEAD.uid;
      entries.push([`${PV}/${kind}/${id}`, d]);
    }
  }
  await seedMany(entries);
}

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

const fs = { runTransaction, doc, serverTimestamp, deleteField };

async function serverDocs(kind) {
  const e = await getEnv();
  let out;
  await e.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDocs(collection(ctx.firestore(), `${PV}/${kind}`));
    out = new Map(s.docs.map((d) => [d.id, d.data()]));
  });
  return out;
}

const program = (tree, id) => tree.programs.find((p) => p.id === id);
const tasksOf = (tree, prg) => program(tree, prg).workstreams.flatMap((w) => w.tasks);

// Load as u, edit, plan. -> { db, plan }
async function planAs(u, edit) {
  const db = await asUser(u.uid, u.email);
  const { loaded, tree } = await load(db);
  edit(tree);
  const plan = planV2Save(loaded, tree, { uid: u.uid, wid: WID, pid: PID, isOwner: u === OWNER, dirIndex, uidByEmail });
  expect(plan.refused).toBe(null);
  return { db, plan };
}
const run = (db, u, plan) => executeV2Save(fs, { db, wid: WID, pid: PID, uid: u.uid, plan });
const unchunked = (plan) => ({ ...plan, batches: [plan.batches.flat()] });
const wsCount = (b) => new Set(b.map((op) => op.data.workstreamId)).size;

describe('W1: CRP-sized non-Owner saves in chunks', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
    const members = ALL.map((u) => [`${WS}/members/${u.uid}`, {
      email: u.email, displayName: u.email, aliases: [], department: 'AF', status: 'active',
      updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
    }]);
    await seedMany(members);
    await seedProject();
  });
  afterAll(cleanup);

  it('CRP-0 fixture: >= 180 tasks, >= 20 WS in 2 programs', async () => {
    const tasks = await serverDocs('tasks');
    const ws = await serverDocs('workstreams');
    expect(tasks.size).toBeGreaterThanOrEqual(180);
    expect(ws.size).toBeGreaterThanOrEqual(20);
    expect(new Set([...ws.values()].map((w) => w.programId))).toEqual(new Set(['prg1', 'prg2']));
  });

  it('CRP-1 PM renames one PIC across the whole program: chunked, ok', async () => {
    const { db, plan } = await planAs(PM, (t) => { for (const task of tasksOf(t, 'prg1')) task.pic = ASG2.email; });
    expect(plan.batches.flat()).toHaveLength(22 * 8);
    expect(plan.batches).toHaveLength(Math.ceil(22 / MAX_WS_PER_CHUNK));
    for (const b of plan.batches) expect(wsCount(b)).toBeLessThanOrEqual(MAX_WS_PER_CHUNK);
    const r = await run(db, PM, plan);
    expect(r.status).toBe('ok');
    const tasks = await serverDocs('tasks');
    for (const [id, d] of tasks) {
      if (id.startsWith('prg1_')) expect(d).toMatchObject({ picUid: ASG2.uid, version: 2, updatedBy: PM.uid });
      else expect(d).toMatchObject({ picUid: ASG.uid, version: 1 });
    }
  });

  it('CRP-2 the same PIC rename in one transaction is ok too (no ws doc read on a pic change)', async () => {
    const { db, plan } = await planAs(PM, (t) => { for (const task of tasksOf(t, 'prg1')) task.pic = ASG2.email; });
    const r = await run(db, PM, unchunked(plan));
    expect(r.status).toBe('ok');
  });

  it('CRP-3 control: PM shifts every due date of the program; one transaction denied, chunks ok', async () => {
    const shift = (t) => { for (const task of tasksOf(t, 'prg1')) task.end = '2026-12-30'; };
    const first = await planAs(PM, shift);
    expect(first.plan.batches.length).toBeGreaterThan(1);
    const denied = await run(first.db, PM, unchunked(first.plan));
    expect(denied).toMatchObject({ status: 'denied', failedBatch: 0, written: [] });
    expect([...(await serverDocs('tasks')).values()].every((d) => d.version === 1 && d.end === '2026-12-31')).toBe(true);

    const second = await planAs(PM, shift);
    for (const b of second.plan.batches) expect(wsCount(b)).toBeLessThanOrEqual(MAX_WS_PER_CHUNK);
    const ok = await run(second.db, PM, second.plan);
    expect(ok.status).toBe('ok');
    const tasks = await serverDocs('tasks');
    for (const [id, d] of tasks) {
      if (id.startsWith('prg1_')) expect(d).toMatchObject({ end: '2026-12-30', version: 2 });
    }
  });

  it('CRP-4 Sub-PM edits every task of their own WS: ok', async () => {
    const { db, plan } = await planAs(LEAD, (t) => {
      for (const task of program(t, 'prg1').workstreams.find((w) => w.id === 'prg1_w0').tasks) task.name += ' (lead)';
    });
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]).toHaveLength(8);
    const r = await run(db, LEAD, plan);
    expect(r.status).toBe('ok');
    const tasks = await serverDocs('tasks');
    for (let j = 0; j < 8; j++) expect(tasks.get(`prg1_t0_${j}`)).toMatchObject({ name: `Task 0.${j} (lead)`, version: 2, updatedBy: LEAD.uid });
  });
});
