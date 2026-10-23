import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// P2.2 Task 2: pre-P2.2 gate.
//  - v1 project doc: programMeta / memberUids / visibility / schemaVersion
//    are workspace-Owner-only (on top of the v1 owner/operator rule).
//  - Project doc with schemaVersion 2: update is workspace-Owner-only.
//  - raid/{programId} docs (Ruling K').
//  - Task contributor branch (contributorUids may append updates).

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' }; // workspace Owner
const PO = { uid: 'u_po', email: 'po@smartosc.com' }; // v1 per-project owner, NOT workspace Owner
const OP = { uid: 'u_op', email: 'op@smartosc.com' }; // v1 operator
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' }; // PM of prg1
const DEPUTY = { uid: 'u_deputy', email: 'deputy@smartosc.com' }; // deputy of prg1
const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' }; // Sub-PM of p1/w1
const LEADX = { uid: 'u_leadx', email: 'leadx@smartosc.com' }; // Sub-PM of p2/wx only
const ASG = { uid: 'u_asg', email: 'asg@smartosc.com' }; // PIC of t1
const CON = { uid: 'u_con', email: 'con@smartosc.com' }; // contributor of t1
const VIEWER = { uid: 'u_viewer', email: 'viewer@smartosc.com' };
const OUTSIDER = { uid: 'u_out', email: 'out@smartosc.com' };
const DEACT = { uid: 'u_deact', email: 'deact@smartosc.com' }; // deactivated contributor

const WS = 'workspaces/main';
const P1 = `${WS}/projects/p1`; // v1 doc carrying programMeta (restricted)
const P2 = `${WS}/projects/p2`; // another project
const PV2 = `${WS}/projects/pv2`; // schemaVersion 2

const programMeta = {
  prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: DEPUTY.uid, start: null, end: null },
  prg2: { name: 'Program 2', order: 1, pmUid: null, deputyUid: null, start: null, end: null },
};

const ALL = [OWNER, PO, OP, PM, DEPUTY, LEAD, LEADX, ASG, CON, VIEWER, DEACT];

const project = (over = {}) => ({
  name: 'P',
  memberIds: ALL.map((u) => u.uid),
  roles: { [OWNER.uid]: 'owner', [PO.uid]: 'owner', [OP.uid]: 'operator' },
  programs: [{ id: 'prg1', name: 'Program 1', workstreams: [] }],
  programMeta,
  memberUids: ALL.map((u) => u.uid),
  visibility: 'restricted',
  ...over,
});

const ws = (pid, programId, leadUid, over = {}) => ({
  workspaceId: 'main', projectId: pid, programId, name: 'WS', order: 0,
  leadUid, start: null, end: null, version: 1, ...over,
});

const task = (over = {}) => ({
  workspaceId: 'main', projectId: 'p1', programId: 'prg1', workstreamId: 'w1', order: 0,
  id: 't', name: 'Task', status: 'InProgress', health: 'Green',
  updates: [{ text: 'old' }], checkIns: [],
  start: null, end: null, picUid: ASG.uid, contributorUids: [CON.uid, DEACT.uid, ASG.uid],
  version: 1, ...over,
});

const raid = (programId, over = {}) => ({
  workspaceId: 'main', projectId: 'p1', programId, items: [], version: 1, ...over,
});

const member = (email, status = 'active') => ({
  email, displayName: email, aliases: [], department: 'AF', status,
  updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
});

const as = (u) => asUser(u.uid, u.email);

// v1 project doc writes (no stamping / version on the v1 doc).
const v1up = async (u, path, data) => updateDoc(doc(await as(u), path), data);
// v2 writes: stamp updatedBy, bump version (seeds are at version 1).
const up = async (u, path, data) => updateDoc(doc(await as(u), path), { version: 2, updatedBy: u.uid, ...data });
const put = async (u, path, data) => setDoc(doc(await as(u), path), { updatedBy: u.uid, ...data });

describe('P2.2 pre-P2.2 gate rules', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
    for (const u of ALL.filter((x) => x !== OWNER && x !== DEACT).concat([OUTSIDER])) {
      await seedDoc(`${WS}/members/${u.uid}`, member(u.email));
    }
    await seedDoc(`${WS}/members/${DEACT.uid}`, member(DEACT.email, 'deactivated'));

    await seedDoc(P1, project());
    await seedDoc(`${P1}/workstreams/w1`, ws('p1', 'prg1', LEAD.uid));
    await seedDoc(`${P1}/tasks/t1`, task());
    await seedDoc(`${P1}/raid/prg1`, raid('prg1', { updatedBy: OWNER.uid }));

    await seedDoc(P2, project());
    await seedDoc(`${P2}/workstreams/wx`, ws('p2', 'prg1', LEADX.uid));

    await seedDoc(PV2, project({ schemaVersion: 2 }));
  });
  afterAll(cleanup);

  // ── v1 project doc: Owner-only v2 fields ──
  it('G-1 operator / per-project owner changing programMeta, memberUids, visibility, schemaVersion denied', async () => {
    await assertFails(v1up(OP, P1, { programMeta: {} }));
    await assertFails(v1up(OP, P1, { memberUids: [OP.uid] }));
    await assertFails(v1up(OP, P1, { visibility: 'department' }));
    await assertFails(v1up(OP, P1, { schemaVersion: 2 }));
    // A v1 per-project owner is not the workspace Owner.
    await assertFails(v1up(PO, P1, { visibility: 'department' }));
    await assertFails(v1up(PO, P1, { programMeta: {} }));
  });

  it('G-2 v1 content saves still work: operator content (name unchanged), per-project owner rename', async () => {
    await assertSucceeds(v1up(OP, P1, {
      programs: [{ id: 'prg1', name: 'Program 1', workstreams: [{ id: 'w1', tasks: [{ id: 't1' }] }] }],
      updatedAt: 'now',
    }));
    // Full-doc overwrite keeping the v2 fields identical (shim-preserved) is allowed.
    await assertSucceeds(setDoc(doc(await as(OP), P1), project({ programs: [] })));
    await assertSucceeds(v1up(PO, P1, { name: 'Renamed' }));
    // The v1 operator rule is unchanged: operator rename still denied.
    await assertFails(v1up(OP, P1, { name: 'x' }));
    // A full overwrite that drops programMeta (old bundle) is denied for non-Owners.
    const { programMeta: _pm, ...noMeta } = project();
    await assertFails(setDoc(doc(await as(OP), P1), noMeta));
  });

  it('G-3 workspace Owner may change visibility, programMeta, memberUids, schemaVersion', async () => {
    await assertSucceeds(v1up(OWNER, P1, { visibility: 'department' }));
    await assertSucceeds(v1up(OWNER, P1, { programMeta: {} }));
    await assertSucceeds(v1up(OWNER, P1, { memberUids: [OWNER.uid] }));
    await assertSucceeds(v1up(OWNER, P1, { schemaVersion: 2 }));
  });

  it('G-4 create: non-Owner may not include v2 keys; plain create and Owner create with them allowed', async () => {
    const base = (u) => ({ name: 'N', memberIds: [u.uid], roles: { [u.uid]: 'owner' } });
    await assertSucceeds(setDoc(doc(await as(OP), `${WS}/projects/n1`), base(OP)));
    await assertFails(setDoc(doc(await as(OP), `${WS}/projects/n2`), { ...base(OP), visibility: 'department' }));
    await assertFails(setDoc(doc(await as(OP), `${WS}/projects/n3`), { ...base(OP), programMeta: {} }));
    await assertFails(setDoc(doc(await as(OP), `${WS}/projects/n4`), { ...base(OP), memberUids: [OP.uid] }));
    await assertFails(setDoc(doc(await as(OP), `${WS}/projects/n5`), { ...base(OP), schemaVersion: 2 }));
    await assertSucceeds(setDoc(doc(await as(OWNER), `${WS}/projects/n6`), {
      ...base(OWNER), programMeta, memberUids: [OWNER.uid], visibility: 'restricted', schemaVersion: 2,
    }));
  });

  // ── schemaVersion 2 project doc ──
  it('G-5 v2 project doc: non-Owner update denied (even content), Owner allowed', async () => {
    await assertFails(v1up(OP, PV2, { programs: [], updatedAt: 'now' }));
    await assertFails(v1up(PO, PV2, { name: 'x' }));
    await assertFails(setDoc(doc(await as(OP), PV2), project({ schemaVersion: 2, programs: [] })));
    await assertSucceeds(v1up(OWNER, PV2, { name: 'Owner edit' }));
    await assertSucceeds(v1up(OWNER, PV2, { schemaVersion: 1 }));
  });

  // ── RAID docs ──
  it('G-6 RAID create: Owner, PM / Deputy via viaProgramId, Sub-PM via viaWorkstreamId (same project) allowed', async () => {
    await assertSucceeds(put(OWNER, `${P1}/raid/prg2`, raid('prg2')));
    await assertSucceeds(deleteDoc(doc(await as(OWNER), `${P1}/raid/prg2`)));
    await assertSucceeds(put(PM, `${P1}/raid/prg2`, raid('prg2', { viaProgramId: 'prg1' })));
    await assertSucceeds(deleteDoc(doc(await as(OWNER), `${P1}/raid/prg2`)));
    await assertSucceeds(put(DEPUTY, `${P1}/raid/prg2`, raid('prg2', { viaProgramId: 'prg1' })));
    await assertSucceeds(deleteDoc(doc(await as(OWNER), `${P1}/raid/prg2`)));
    await assertSucceeds(put(LEAD, `${P1}/raid/prg2`, raid('prg2', { viaWorkstreamId: 'w1' })));
  });

  it('G-7 RAID create denied: ws of another project, Assignee, false via claims, bad ids, spoofing', async () => {
    // Sub-PM of p2/wx claiming that ws on p1 (no such ws in p1).
    await assertFails(put(LEADX, `${P1}/raid/prg2`, raid('prg2', { viaWorkstreamId: 'wx' })));
    // Assignee with no claim, or claiming a program / ws they do not hold.
    await assertFails(put(ASG, `${P1}/raid/prg2`, raid('prg2')));
    await assertFails(put(ASG, `${P1}/raid/prg2`, raid('prg2', { viaProgramId: 'prg1' })));
    await assertFails(put(ASG, `${P1}/raid/prg2`, raid('prg2', { viaWorkstreamId: 'w1' })));
    await assertFails(put(PM, `${P1}/raid/prg2`, raid('prg2', { viaProgramId: 'prg2' })));
    await assertFails(put(PM, `${P1}/raid/prg2`, raid('prg2', { viaProgramId: 'nope' })));
    await assertFails(put(VIEWER, `${P1}/raid/prg2`, raid('prg2', { viaWorkstreamId: 'w1' })));
    // Doc id must equal programId and be a key in programMeta (Owner too).
    await assertFails(put(OWNER, `${P1}/raid/prg2`, raid('prg1')));
    await assertFails(put(OWNER, `${P1}/raid/zzz`, raid('zzz')));
    // Path fields, version and stamping.
    await assertFails(put(OWNER, `${P1}/raid/prg2`, raid('prg2', { projectId: 'p2' })));
    await assertFails(put(OWNER, `${P1}/raid/prg2`, raid('prg2', { version: 2 })));
    await assertFails(put(OWNER, `${P1}/raid/prg2`, raid('prg2', { updatedBy: PM.uid })));
  });

  it('G-8 RAID update: PM via claim allowed; changing programId, stale claim, Assignee denied', async () => {
    await assertSucceeds(up(PM, `${P1}/raid/prg1`, { items: [{ id: 'r1' }], viaProgramId: 'prg1' }));
    await assertSucceeds(up(LEAD, `${P1}/raid/prg1`,
      { items: [{ id: 'r1' }, { id: 'r2' }], viaProgramId: null, viaWorkstreamId: 'w1', version: 3 }));
    // LEAD's claim is still on the doc: PM must re-claim, not ride on it.
    await assertFails(up(PM, `${P1}/raid/prg1`, { items: [], version: 4 }));
    await assertFails(up(OWNER, `${P1}/raid/prg1`, { programId: 'prg2', version: 4 }));
    await assertFails(up(ASG, `${P1}/raid/prg1`, { items: [], viaProgramId: 'prg1', version: 4 }));
    await assertFails(up(LEADX, `${P1}/raid/prg1`, { items: [], viaWorkstreamId: 'wx', version: 4 }));
    // version must bump.
    await assertFails(up(PM, `${P1}/raid/prg1`, { items: [], viaProgramId: 'prg1', version: 3 }));
  });

  it('G-9 RAID delete Owner only; read = canReadProject', async () => {
    await assertFails(deleteDoc(doc(await as(PM), `${P1}/raid/prg1`)));
    await assertFails(deleteDoc(doc(await as(LEAD), `${P1}/raid/prg1`)));
    await assertSucceeds(getDoc(doc(await as(VIEWER), `${P1}/raid/prg1`)));
    await assertFails(getDoc(doc(await as(OUTSIDER), `${P1}/raid/prg1`)));
    await assertSucceeds(deleteDoc(doc(await as(OWNER), `${P1}/raid/prg1`)));
  });

  // ── Task contributor branch ──
  it('G-10 contributor may append an update', async () => {
    await assertSucceeds(up(CON, `${P1}/tasks/t1`, {
      updates: [{ text: 'old' }, { text: 'new' }], updatedAt: 'now',
    }));
  });

  it('G-11 contributor: status / health change, rewrite old update, unstamped, non-contributor, deactivated denied', async () => {
    await assertFails(up(CON, `${P1}/tasks/t1`, { status: 'Planned' }));
    await assertFails(up(CON, `${P1}/tasks/t1`, { health: 'Red' }));
    await assertFails(up(CON, `${P1}/tasks/t1`, { updates: [{ text: 'changed' }, { text: 'new' }] }));
    await assertFails(up(CON, `${P1}/tasks/t1`, { updates: [] }));
    await assertFails(up(CON, `${P1}/tasks/t1`, { updates: [{ text: 'old' }, { text: 'n' }], checkIns: [{ d: 1 }] }));
    await assertFails(up(CON, `${P1}/tasks/t1`, { updates: [{ text: 'old' }, { text: 'n' }], updatedBy: ASG.uid }));
    await assertFails(up(CON, `${P1}/tasks/t1`, { updates: [{ text: 'old' }, { text: 'n' }], version: 3 }));
    await assertFails(up(VIEWER, `${P1}/tasks/t1`, { updates: [{ text: 'old' }, { text: 'n' }] }));
    await assertFails(up(DEACT, `${P1}/tasks/t1`, { updates: [{ text: 'old' }, { text: 'n' }] }));
  });

  it('G-12 PIC listed as contributor gets no extra rights on a closed task', async () => {
    await seedDoc(`${P1}/tasks/t9`, task({ status: 'Completed' }));
    await assertFails(up(ASG, `${P1}/tasks/t9`, { updates: [{ text: 'old' }, { text: 'n' }] }));
    // A contributor (not PIC) may still append on a closed task.
    await assertSucceeds(up(CON, `${P1}/tasks/t9`, { updates: [{ text: 'old' }, { text: 'n' }] }));
  });
});
