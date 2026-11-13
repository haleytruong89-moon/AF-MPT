import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { doc, getDoc, getDocs, collection, runTransaction, serverTimestamp, deleteField } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup, getEnv } from './helpers.js';
import { splitProject } from '../../src/migrateV2.js';
import { buildDirectoryIndex } from '../../src/directory.js';
import { assembleFromSnapshots } from '../../src/readV2.js';
import { planV2Save } from '../../src/planV2Save.js';
import { executeV2Save } from '../../src/execV2Save.js';

// P3.1 final review I1: get() budget of one transaction that touches many workstreams.
// Firestore allows 20 document access calls per transaction / batch (same document
// counted once). Trim T1 had moved the Owner check last, so an Owner who is neither
// PM nor Sub-PM read one workstream doc per distinct WS in the failing Sub-PM branch:
// above ~16 workstreams the whole Owner save was denied.
//  OB-1 Owner (active members doc, not PM / Sub-PM) edits one task in each of 20 WS
//       in one planner batch -> ok
//  OB-2 control: PM of the program, same edit shape -> ok

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' };
const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' };
const ALL = [OWNER, PM, LEAD];

const WID = 'main';
const PID = 'pb';
const WS = `workspaces/${WID}`;
const PV = `${WS}/projects/${PID}`;
const KINDS = ['workstreams', 'tasks', 'actions', 'raid', 'decisions'];
const N_WS = 20;

const dirIndex = buildDirectoryIndex(ALL.map((u) => ({ email: u.email, displayName: u.email.split('@')[0] })));
const uidByEmail = new Map(ALL.map((u) => [u.email, u.uid]));

const v1Tree = () => ({
  id: PID,
  name: 'Budget',
  programs: [{
    id: 'prg1',
    name: 'Program 1',
    raid: [],
    workstreams: Array.from({ length: N_WS }, (_, i) => ({
      id: `w${i}`,
      name: `WS ${i}`,
      tasks: [{ id: `t${i}`, name: `Task ${i}`, pic: LEAD.email, status: 'InProgress', checkIns: [], updates: [] }],
    })),
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
      if (kind === 'workstreams') d.leadUid = LEAD.uid;
      await seedDoc(`${PV}/${kind}/${id}`, d);
    }
  }
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

async function serverDoc(path) {
  const e = await getEnv();
  let out;
  await e.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), path));
    out = s.exists() ? s.data() : undefined;
  });
  return out;
}

// Renames every task (one per WS) and saves the whole tree as the App would.
async function renameAllAs(u) {
  const db = await asUser(u.uid, u.email);
  const { loaded, tree } = await load(db);
  for (const w of tree.programs[0].workstreams) for (const t of w.tasks) t.name = `${t.name} (edited)`;
  const plan = planV2Save(loaded, tree, { uid: u.uid, wid: WID, pid: PID, isOwner: u === OWNER, dirIndex, uidByEmail });
  expect(plan.refused).toBe(null);
  // Wave 2 W1: a non-Owner (PM) plan is split into chunks of <= 8 WS; OB-2 runs
  // it unchunked so it still measures one transaction over all N_WS.
  const batch = plan.batches.flat();
  if (u === OWNER) expect(plan.batches).toHaveLength(1);
  else expect(plan.batches.length).toBeGreaterThan(1);
  expect(batch.filter((op) => op.kind === 'tasks')).toHaveLength(N_WS);
  return executeV2Save(fs, { db, wid: WID, pid: PID, uid: u.uid, plan: { ...plan, batches: [batch] } });
}

describe('P3.1 I1: Owner get() budget across many workstreams', () => {
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

  it(`OB-1 Owner edits one task in each of ${N_WS} workstreams in one transaction: ok`, async () => {
    const r = await renameAllAs(OWNER);
    expect(r.status).toBe('ok');
    expect((await serverDoc(`${PV}/tasks/t${N_WS - 1}`)).name).toBe(`Task ${N_WS - 1} (edited)`);
  });

  it(`OB-2 control: PM edits one task in each of ${N_WS} workstreams in one transaction: ok`, async () => {
    const r = await renameAllAs(PM);
    expect(r.status).toBe('ok');
    expect((await serverDoc(`${PV}/tasks/t0`)).name).toBe('Task 0 (edited)');
  });
});
