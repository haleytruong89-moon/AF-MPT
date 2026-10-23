import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// P2.3 Task 1: rules completion.
//  (a) Ruling P: workspace Owner may update a schemaVersion 2 project doc
//      without any per-project role.
//  (b) schemaVersion 2 project doc: delete is workspace-Owner-only.
//  (c) decisions/{decisionId} (Ruling Q): RAID-style claims.
//  (d) Ruling R: an entry added to task updates / checkIns or action updates
//      carries authorUid == caller (all writers), at most one per write.
//      App.jsx PREPENDS entries (newest first), so the new entry is index 0.
//  (e) Action PIC allow-list.
//  (f) activity/{eid}: createdAt == request.time.

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' }; // workspace Owner, no per-project role
const PO = { uid: 'u_po', email: 'po@smartosc.com' }; // v1 per-project owner, NOT workspace Owner
const OP = { uid: 'u_op', email: 'op@smartosc.com' }; // v1 operator
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' }; // PM of prg1
const DEPUTY = { uid: 'u_deputy', email: 'deputy@smartosc.com' }; // deputy of prg1
const PM2 = { uid: 'u_pm2', email: 'pm2@smartosc.com' }; // PM of prg2
const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' }; // Sub-PM of p1/w1
const LEADX = { uid: 'u_leadx', email: 'leadx@smartosc.com' }; // Sub-PM of p2/wx only
const ASG = { uid: 'u_asg', email: 'asg@smartosc.com' }; // PIC of t1 / a1
const VIEWER = { uid: 'u_viewer', email: 'viewer@smartosc.com' };
const OUTSIDER = { uid: 'u_out', email: 'out@smartosc.com' };

const WS = 'workspaces/main';
const P1 = `${WS}/projects/p1`; // v1 doc (schemaVersion absent) carrying programMeta
const P2 = `${WS}/projects/p2`;
const PV2 = `${WS}/projects/pv2`; // schemaVersion 2

const programMeta = {
  prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: DEPUTY.uid, start: null, end: null },
  prg2: { name: 'Program 2', order: 1, pmUid: PM2.uid, deputyUid: null, start: null, end: null },
};

const ALL = [PO, OP, PM, DEPUTY, PM2, LEAD, LEADX, ASG, VIEWER];

// OWNER is deliberately absent from memberIds / roles / memberUids.
const project = (over = {}) => ({
  name: 'P',
  memberIds: ALL.map((u) => u.uid),
  roles: { [PO.uid]: 'owner', [OP.uid]: 'operator' },
  programs: [],
  programMeta,
  memberUids: ALL.map((u) => u.uid),
  visibility: 'restricted',
  ...over,
});

const ws = (pid, programId, leadUid) => ({
  workspaceId: 'main', projectId: pid, programId, name: 'WS', order: 0,
  leadUid, start: null, end: null, version: 1,
});

const task = (over = {}) => ({
  workspaceId: 'main', projectId: 'p1', programId: 'prg1', workstreamId: 'w1', order: 0,
  id: 't', name: 'Task', status: 'InProgress', health: 'Green',
  updates: [{ text: 'old', authorUid: PM.uid }], checkIns: [{ d: 0 }],
  start: null, end: null, picUid: ASG.uid, contributorUids: [], version: 1, ...over,
});

const action = (over = {}) => ({
  workspaceId: 'main', projectId: 'p1', order: 0, id: 'a', title: 'Action', status: 'Pending',
  dueDate: '2026-11-01', pic: 'Asg', picUid: ASG.uid, picEmail: ASG.email, workstreamId: 'w1',
  updates: [{ text: 'old', authorUid: PM.uid }], version: 1, ...over,
});

const decision = (over = {}) => ({
  workspaceId: 'main', projectId: 'p1', order: 0, id: 'd', title: 'Decision', status: 'Open', version: 1, ...over,
});

const member = (email, status = 'active') => ({
  email, displayName: email, aliases: [], department: 'AF', status,
  updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
});

const as = (u) => asUser(u.uid, u.email);
const by = (u, text = 'n') => ({ text, authorUid: u.uid });

// v1 project doc writes (no stamping / version on the v1 doc).
const v1up = async (u, path, data) => updateDoc(doc(await as(u), path), data);
// v2 writes: stamp updatedBy, bump version (seeds are at version 1).
const up = async (u, path, data) => updateDoc(doc(await as(u), path), { version: 2, updatedBy: u.uid, ...data });
const put = async (u, path, data) => setDoc(doc(await as(u), path), { updatedBy: u.uid, ...data });
const del = async (u, path) => deleteDoc(doc(await as(u), path));

describe('P2.3 rules completion', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
    for (const u of ALL.concat([OUTSIDER])) {
      await seedDoc(`${WS}/members/${u.uid}`, member(u.email));
    }
    await seedDoc(P1, project());
    await seedDoc(`${P1}/workstreams/w1`, ws('p1', 'prg1', LEAD.uid));
    await seedDoc(`${P1}/tasks/t1`, task());
    await seedDoc(`${P1}/actions/a1`, action());
    await seedDoc(`${P1}/decisions/d1`, decision({ viaProgramId: 'prg1', updatedBy: PM.uid }));
    await seedDoc(P2, project());
    await seedDoc(`${P2}/workstreams/wx`, ws('p2', 'prg1', LEADX.uid));
    await seedDoc(PV2, project({ schemaVersion: 2 }));
  });
  afterAll(cleanup);

  // ── (a) Ruling P ──
  it('P23-1 workspace Owner without per-project role may update a v2 project doc (incl. rollback to 1)', async () => {
    await assertSucceeds(v1up(OWNER, PV2, { name: 'Owner edit', programMeta: {} }));
    await assertSucceeds(v1up(OWNER, PV2, { schemaVersion: 1 }));
  });

  it('P23-2 v2 project doc: per-project owner and operator updates still denied', async () => {
    await assertFails(v1up(PO, PV2, { name: 'x' }));
    await assertFails(v1up(OP, PV2, { programs: [{ id: 'x' }] }));
    await assertFails(v1up(PM, PV2, { name: 'x' }));
  });

  it('P23-3 v1 project doc unchanged: Owner without per-project role still cannot update it', async () => {
    await assertFails(v1up(OWNER, P1, { name: 'x' }));
    await assertSucceeds(v1up(PO, P1, { name: 'Renamed' }));
  });

  // ── (b) v2 delete guard ──
  it('P23-4 v2 project doc delete: per-project owner denied, workspace Owner allowed', async () => {
    await assertFails(del(PO, PV2));
    await assertFails(del(OP, PV2));
    await assertSucceeds(del(OWNER, PV2));
  });

  it('P23-5 v1 project doc delete unchanged: per-project owner allowed, others denied', async () => {
    await assertFails(del(OP, P1));
    await assertFails(del(OWNER, P1));
    await assertSucceeds(del(PO, P1));
  });

  // ── (c) decisions ──
  it('P23-6 decision create: Owner, PM / Deputy via viaProgramId, Sub-PM via viaWorkstreamId allowed', async () => {
    await assertSucceeds(put(OWNER, `${P1}/decisions/n1`, decision()));
    await assertSucceeds(put(PM, `${P1}/decisions/n2`, decision({ viaProgramId: 'prg1' })));
    await assertSucceeds(put(DEPUTY, `${P1}/decisions/n3`, decision({ viaProgramId: 'prg1' })));
    await assertSucceeds(put(PM2, `${P1}/decisions/n4`, decision({ viaProgramId: 'prg2' })));
    await assertSucceeds(put(LEAD, `${P1}/decisions/n5`, decision({ viaWorkstreamId: 'w1' })));
  });

  it('P23-7 decision create denied: no / false claims, ws of another project, spoofing, version', async () => {
    await assertFails(put(ASG, `${P1}/decisions/n1`, decision()));
    await assertFails(put(ASG, `${P1}/decisions/n1`, decision({ viaProgramId: 'prg1' })));
    await assertFails(put(VIEWER, `${P1}/decisions/n1`, decision({ viaWorkstreamId: 'w1' })));
    await assertFails(put(PM, `${P1}/decisions/n1`, decision({ viaProgramId: 'prg2' })));
    await assertFails(put(PM, `${P1}/decisions/n1`, decision({ viaProgramId: 'nope' })));
    await assertFails(put(LEADX, `${P1}/decisions/n1`, decision({ viaWorkstreamId: 'wx' })));
    await assertFails(put(OWNER, `${P1}/decisions/n1`, decision({ projectId: 'p2' })));
    await assertFails(put(OWNER, `${P1}/decisions/n1`, decision({ workspaceId: 'other' })));
    await assertFails(put(OWNER, `${P1}/decisions/n1`, decision({ version: 2 })));
    await assertFails(put(PM, `${P1}/decisions/n1`, decision({ viaProgramId: 'prg1', updatedBy: OWNER.uid })));
  });

  it('P23-8 decision create: deactivated PM denied', async () => {
    await seedDoc(`${WS}/members/${PM.uid}`, member(PM.email, 'deactivated'));
    await assertFails(put(PM, `${P1}/decisions/n1`, decision({ viaProgramId: 'prg1' })));
  });

  it('P23-9 decision update: claim holders allowed; stale claim, unbumped version, others denied', async () => {
    await assertSucceeds(up(PM, `${P1}/decisions/d1`, { title: 'x', viaProgramId: 'prg1' }));
    await assertSucceeds(up(LEAD, `${P1}/decisions/d1`,
      { status: 'Decided', viaProgramId: null, viaWorkstreamId: 'w1', version: 3 }));
    // LEAD's claim is on the doc now: PM must re-claim.
    await assertFails(up(PM, `${P1}/decisions/d1`, { title: 'y', version: 4 }));
    await assertFails(up(PM, `${P1}/decisions/d1`, { title: 'y', viaProgramId: 'prg1', viaWorkstreamId: null, version: 3 }));
    await assertFails(up(ASG, `${P1}/decisions/d1`, { title: 'y', viaProgramId: 'prg1', version: 4 }));
    await assertSucceeds(up(OWNER, `${P1}/decisions/d1`, { title: 'o', version: 4 }));
  });

  it('P23-10 decision delete: Owner and PM of the stored claim allowed; Sub-PM, other PM, Assignee denied', async () => {
    await assertFails(del(LEAD, `${P1}/decisions/d1`));
    await assertFails(del(PM2, `${P1}/decisions/d1`));
    await assertFails(del(ASG, `${P1}/decisions/d1`));
    await assertSucceeds(del(PM, `${P1}/decisions/d1`));
    await seedDoc(`${P1}/decisions/d2`, decision({ viaWorkstreamId: 'w1' }));
    await assertFails(del(PM, `${P1}/decisions/d2`));
    await assertSucceeds(del(OWNER, `${P1}/decisions/d2`));
  });

  it('P23-11 decision read = canReadProject', async () => {
    await assertSucceeds(getDoc(doc(await as(VIEWER), `${P1}/decisions/d1`)));
    await assertSucceeds(getDoc(doc(await as(OWNER), `${P1}/decisions/d1`)));
    await assertFails(getDoc(doc(await as(OUTSIDER), `${P1}/decisions/d1`)));
  });

  // ── (d) Ruling R: authorUid on appended entries ──
  it('P23-12 task: Assignee appends with own authorUid allowed; other / missing authorUid denied', async () => {
    const old = task().updates;
    await assertFails(up(ASG, `${P1}/tasks/t1`, { updates: [by(PM), ...old] }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { updates: [{ text: 'n' }, ...old] }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { checkIns: [{ d: 1, authorUid: PM.uid }, { d: 0 }] }));
    await assertSucceeds(up(ASG, `${P1}/tasks/t1`, { updates: [by(ASG), ...old] }));
  });

  it('P23-13 task: adding more than one entry per write denied for everyone (Owner included)', async () => {
    const old = task().updates;
    await assertFails(up(ASG, `${P1}/tasks/t1`, { updates: [by(ASG, 'a'), by(ASG, 'b'), ...old] }));
    await assertFails(up(PM, `${P1}/tasks/t1`, { updates: [by(PM, 'a'), by(PM, 'b'), ...old] }));
    await assertFails(up(OWNER, `${P1}/tasks/t1`, { updates: [by(OWNER, 'a'), by(OWNER, 'b'), ...old] }));
    await assertFails(up(OWNER, `${P1}/tasks/t1`, { checkIns: [by(OWNER, 'a'), by(OWNER, 'b'), { d: 0 }] }));
  });

  it('P23-14 task: Owner / PM / Sub-PM adding an entry need their own authorUid; may edit history', async () => {
    const old = task().updates;
    await assertSucceeds(up(OWNER, `${P1}/tasks/t1`, { updates: [by(OWNER), ...old] }));
    await seedDoc(`${P1}/tasks/t1`, task());
    await assertFails(up(OWNER, `${P1}/tasks/t1`, { updates: [by(PM), ...old] }));
    await assertFails(up(OWNER, `${P1}/tasks/t1`, { updates: [{ text: 'n' }, ...old] }));
    await assertFails(up(PM, `${P1}/tasks/t1`, { updates: [by(ASG), ...old] }));
    await assertFails(up(LEAD, `${P1}/tasks/t1`, { updates: [{ text: 'n' }, ...old] }));
    await assertSucceeds(up(LEAD, `${P1}/tasks/t1`, { updates: [by(LEAD), ...old] }));
    // Same size (edit an old entry, e.g. resolve a blocker) or shrink: allowed for managers.
    await assertSucceeds(up(PM, `${P1}/tasks/t1`,
      { updates: [{ ...old[0], resolvedAt: 'now' }, by(LEAD)], version: 3 }));
    await assertSucceeds(up(OWNER, `${P1}/tasks/t1`, { updates: [], version: 4 }));
  });

  it('P23-15 action: added updates entry needs own authorUid for PIC and managers', async () => {
    const old = action().updates;
    await assertFails(up(ASG, `${P1}/actions/a1`, { updates: [by(PM), ...old] }));
    await assertFails(up(LEAD, `${P1}/actions/a1`, { updates: [{ text: 'n' }, ...old] }));
    await assertFails(up(OWNER, `${P1}/actions/a1`, { updates: [by(OWNER, 'a'), by(OWNER, 'b'), ...old] }));
    await assertSucceeds(up(ASG, `${P1}/actions/a1`, { updates: [by(ASG), ...old] }));
    await assertSucceeds(up(OWNER, `${P1}/actions/a1`, { updates: [by(OWNER), by(ASG), ...old], version: 3 }));
  });

  // ── (e) Action PIC allow-list ──
  it('P23-16 action PIC: status / completedAt / updates allowed; title, due, other keys denied', async () => {
    const old = action().updates;
    await assertFails(up(ASG, `${P1}/actions/a1`, { title: 'x' }));
    await assertFails(up(ASG, `${P1}/actions/a1`, { due: '2026-12-31' }));
    await assertFails(up(ASG, `${P1}/actions/a1`, { dueDate: '2026-12-31' }));
    await assertFails(up(ASG, `${P1}/actions/a1`, { note: 'x' }));
    await assertFails(up(ASG, `${P1}/actions/a1`, { status: 'Done', title: 'x' }));
    // PIC updates are append-only: rewriting an old entry is denied.
    await assertFails(up(ASG, `${P1}/actions/a1`, { updates: [by(ASG), { text: 'changed', authorUid: PM.uid }] }));
    await assertSucceeds(up(ASG, `${P1}/actions/a1`, {
      status: 'Done', completedAt: '2026-10-23T00:00:00Z', updates: [by(ASG), ...old], updatedAt: 'now',
    }));
  });

  // ── (f) activity ──
  it('P23-17 activity create: createdAt must be the server time', async () => {
    const db = await as(VIEWER);
    await assertSucceeds(setDoc(doc(db, `${P1}/activity/n1`),
      { authorUid: VIEWER.uid, type: 'x', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, `${P1}/activity/n2`), { authorUid: VIEWER.uid, type: 'x' }));
    await assertFails(setDoc(doc(db, `${P1}/activity/n3`),
      { authorUid: VIEWER.uid, type: 'x', createdAt: '2026-10-23T00:00:00Z' }));
    await assertFails(setDoc(doc(db, `${P1}/activity/n4`),
      { authorUid: ASG.uid, type: 'x', createdAt: serverTimestamp() }));
  });

  // ── Fix round 1 ──
  it('P23-18 Ruling U: action PIC may tick a subtask; due still denied', async () => {
    await seedDoc(`${P1}/actions/a2`, action({ subtasks: [{ id: 's1', title: 'S', status: 'Pending' }] }));
    await assertSucceeds(up(ASG, `${P1}/actions/a2`,
      { subtasks: [{ id: 's1', title: 'S', status: 'Done', completedAt: '2026-10-23T00:00:00Z' }] }));
    await assertFails(up(ASG, `${P1}/actions/a2`, { due: '2026-12-31', version: 3 }));
    await assertFails(up(ASG, `${P1}/actions/a2`, { dueDate: '2026-12-31', version: 3 }));
    // Only the PIC's own action.
    await seedDoc(`${P1}/actions/a3`, action({ picUid: VIEWER.uid, subtasks: [{ id: 's1', status: 'Pending' }] }));
    await assertFails(up(ASG, `${P1}/actions/a3`, { subtasks: [{ id: 's1', status: 'Done' }] }));
  });

  it('P23-19 Ruling V: v2 project doc readable via canReadProject; v1 read unchanged', async () => {
    const DEACT = { uid: 'u_deact', email: 'deact@smartosc.com' };
    await seedDoc(`${WS}/members/${DEACT.uid}`, member(DEACT.email, 'deactivated'));
    const PV3 = `${WS}/projects/pv3`; // restricted, memberUids differs from memberIds
    const PV4 = `${WS}/projects/pv4`; // department
    await seedDoc(PV3, project({ schemaVersion: 2, memberIds: [PO.uid], memberUids: [VIEWER.uid, DEACT.uid] }));
    await seedDoc(PV4, project({ schemaVersion: 2, memberIds: [PO.uid], memberUids: [], visibility: 'department' }));
    // Owner not in memberIds.
    await assertSucceeds(getDoc(doc(await as(OWNER), PV3)));
    // In memberUids, not in memberIds.
    await assertSucceeds(getDoc(doc(await as(VIEWER), PV3)));
    // v1 memberIds still works.
    await assertSucceeds(getDoc(doc(await as(PO), PV3)));
    // Active member, not in memberUids: restricted denied, department allowed.
    await assertFails(getDoc(doc(await as(OUTSIDER), PV3)));
    await assertSucceeds(getDoc(doc(await as(OUTSIDER), PV4)));
    // Deactivated member (in memberUids) denied; on department too.
    await assertFails(getDoc(doc(await as(DEACT), PV3)));
    await assertFails(getDoc(doc(await as(DEACT), PV4)));
    // v1 doc unchanged: memberIds only (Owner not in memberIds denied).
    await assertSucceeds(getDoc(doc(await as(VIEWER), P1)));
    await assertFails(getDoc(doc(await as(OWNER), P1)));
    await assertFails(getDoc(doc(await as(OUTSIDER), P1)));
  });

  it('P23-20 the client memberIds list query still passes', async () => {
    const db = await as(PO);
    await assertSucceeds(getDocs(query(collection(db, `${WS}/projects`), where('memberIds', 'array-contains', PO.uid))));
  });

  it('P23-21 Ruling W: Assignee / contributor resolving a blocker denied; Sub-PM may resolve it', async () => {
    const blocker = { text: 'b', authorUid: ASG.uid, isBlocker: true };
    await seedDoc(`${P1}/tasks/t2`, task({ updates: [blocker], contributorUids: [VIEWER.uid] }));
    const resolved = [{ ...blocker, resolvedAt: '2026-10-23T00:00:00Z', resolvedBy: 'x', resolution: 'ok' }];
    await assertFails(up(ASG, `${P1}/tasks/t2`, { updates: resolved }));
    await assertFails(up(VIEWER, `${P1}/tasks/t2`, { updates: resolved }));
    await assertSucceeds(up(LEAD, `${P1}/tasks/t2`, { updates: resolved }));
  });

  it('P23-22 Ruling Z: a null updates / checkIns list counts as [] (append by Assignee, PIC, PM)', async () => {
    await seedDoc(`${P1}/tasks/t3`, task({ updates: null, checkIns: null }));
    await assertSucceeds(up(ASG, `${P1}/tasks/t3`, { updates: [by(ASG)] }));
    await seedDoc(`${P1}/tasks/t4`, task({ updates: null, checkIns: null }));
    await assertSucceeds(up(PM, `${P1}/tasks/t4`, { checkIns: [by(PM)] }));
    // Still a real check: someone else's authorUid on the added entry is denied.
    await assertFails(up(ASG, `${P1}/tasks/t4`, { version: 3, updates: [by(PM)] }));
    await seedDoc(`${P1}/actions/a3`, action({ updates: null }));
    await assertSucceeds(up(ASG, `${P1}/actions/a3`, { updates: [by(ASG)] }));
  });
});

describe('P2.3 Task 5: memberUids patch on a v2 project', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
    for (const u of ALL) await seedDoc(`${WS}/members/${u.uid}`, member(u.email));
    await seedDoc(PV2, project({ schemaVersion: 2 }));
  });

  it('P23-T5 Owner may patch memberUids with memberIds/roles; operator and per-project owner may not', async () => {
    await assertSucceeds(v1up(OWNER, PV2, {
      memberIds: [...ALL.map((u) => u.uid), 'u_new'],
      roles: { [PO.uid]: 'owner', u_new: 'member' },
      memberUids: [...ALL.map((u) => u.uid), 'u_new'],
    }));
    await assertFails(v1up(OP, PV2, { memberUids: [OP.uid] }));
    await assertFails(v1up(PO, PV2, { memberUids: [PO.uid] }));
  });
});
