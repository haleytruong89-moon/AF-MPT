import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, deleteField, getDoc, getDocs, collection } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// P2.1 Task 4: rules for the v2 sub-collections (workstreams / tasks /
// actions / activity) per the role matrix (spec §4, P2 scope; approvals = P3).
// Seeding goes through seedDoc (rules disabled).

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' }; // PM of prg1
const DEPUTY = { uid: 'u_deputy', email: 'deputy@smartosc.com' }; // deputy of prg1
const PM2 = { uid: 'u_pm2', email: 'pm2@smartosc.com' }; // PM of prg2
const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' }; // Sub-PM of w1
const LEAD2 = { uid: 'u_lead2', email: 'lead2@smartosc.com' }; // Sub-PM of w2
const ASG = { uid: 'u_asg', email: 'asg@smartosc.com' }; // PIC of t1 / a1
const VIEWER = { uid: 'u_viewer', email: 'viewer@smartosc.com' }; // in memberUids only
const OUTSIDER = { uid: 'u_out', email: 'out@smartosc.com' }; // active, not in memberUids
const DEACT = { uid: 'u_deact', email: 'deact@smartosc.com' }; // deactivated, in memberUids
const GMAIL = { uid: 'u_gmail', email: 'someone@gmail.com' };

const WS = 'workspaces/main';
const P1 = `${WS}/projects/p1`; // restricted
const P2 = `${WS}/projects/p2`; // department

const programMeta = {
  prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: DEPUTY.uid, start: null, end: null },
  prg2: { name: 'Program 2', order: 1, pmUid: PM2.uid, deputyUid: null, start: null, end: null },
};

const project = (over = {}) => ({
  name: 'P', memberIds: [OWNER.uid], roles: { [OWNER.uid]: 'owner' },
  programMeta,
  memberUids: [PM.uid, DEPUTY.uid, PM2.uid, LEAD.uid, LEAD2.uid, ASG.uid, VIEWER.uid, DEACT.uid],
  visibility: 'restricted',
  ...over,
});

const ws = (pid, programId, leadUid, start, end, over = {}) => ({
  workspaceId: 'main', projectId: pid, programId, name: 'WS', order: 0,
  leadUid, start, end, version: 1, ...over,
});

const task = (over = {}) => ({
  workspaceId: 'main', projectId: 'p1', programId: 'prg1', workstreamId: 'w1', order: 0,
  id: 't', name: 'Task', status: 'InProgress', health: 'Green', updates: [], checkIns: [],
  start: '2026-02-01', end: '2026-03-01', pic: 'Asg', picUid: ASG.uid, picEmail: ASG.email,
  contributorUids: [LEAD2.uid], version: 1, ...over,
});

const action = (over = {}) => ({
  workspaceId: 'main', projectId: 'p1', order: 0, id: 'a', title: 'Action', status: 'Pending',
  pic: 'Asg', picUid: ASG.uid, picEmail: ASG.email, workstreamId: 'w1', version: 1, ...over,
});

const member = (email, status = 'active') => ({
  email, displayName: email, aliases: [], department: 'AF', status,
  updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
});

const as = (u) => asUser(u.uid, u.email);

// Ruling I: every v2 write stamps updatedBy = caller uid. up() also bumps
// version (seeds are at version 1); pass version / updatedBy to override.
const up = async (u, path, data) => updateDoc(doc(await as(u), path), { version: 2, updatedBy: u.uid, ...data });
const put = async (u, path, data) => setDoc(doc(await as(u), path), { updatedBy: u.uid, ...data });

describe('P2.1 v2 sub-collection rules (role matrix)', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
    // OWNER deliberately has no members doc: ownerUids alone must suffice.
    for (const u of [PM, DEPUTY, PM2, LEAD, LEAD2, ASG, VIEWER, OUTSIDER]) {
      await seedDoc(`${WS}/members/${u.uid}`, member(u.email));
    }
    await seedDoc(`${WS}/members/${DEACT.uid}`, member(DEACT.email, 'deactivated'));

    await seedDoc(P1, project());
    await seedDoc(`${P1}/workstreams/w1`, ws('p1', 'prg1', LEAD.uid, '2026-01-01', '2026-06-30'));
    await seedDoc(`${P1}/workstreams/w2`, ws('p1', 'prg1', LEAD2.uid, null, null));
    await seedDoc(`${P1}/workstreams/w3`, ws('p1', 'prg2', LEAD.uid, null, null));
    await seedDoc(`${P1}/tasks/t1`, task());
    await seedDoc(`${P1}/tasks/t2`, task({ picUid: VIEWER.uid, picEmail: VIEWER.email }));
    await seedDoc(`${P1}/tasks/t3`, task({ workstreamId: 'w3', programId: 'prg2' }));
    await seedDoc(`${P1}/actions/a1`, action());
    await seedDoc(`${P1}/actions/a0`, action({ workstreamId: null }));
    await seedDoc(`${P1}/activity/e1`, { authorUid: VIEWER.uid, type: 'x', projectId: 'p1' });

    await seedDoc(P2, project({ visibility: 'department', memberUids: [] }));
    await seedDoc(`${P2}/workstreams/w1`, ws('p2', 'prg1', LEAD.uid, null, null));
    await seedDoc(`${P2}/tasks/t1`, task({ projectId: 'p2' }));
    await seedDoc(`${P2}/actions/a1`, action({ projectId: 'p2' }));
    await seedDoc(`${P2}/activity/e1`, { authorUid: VIEWER.uid, type: 'x' });
  });
  afterAll(cleanup);

  // ── Task create ──
  it('V2-1 task create: Owner (any dates), PM, deputy PM, Sub-PM within WS dates allowed', async () => {
    await assertSucceeds(put(OWNER, `${P1}/tasks/n1`, task({ end: '2027-01-01' })));
    await assertSucceeds(put(PM, `${P1}/tasks/n2`, task()));
    await assertSucceeds(put(DEPUTY, `${P1}/tasks/n3`, task()));
    await assertSucceeds(put(LEAD, `${P1}/tasks/n4`, task()));
    await assertSucceeds(put(LEAD, `${P1}/tasks/n5`, task({ start: null, end: null })));
    // Null WS bounds = no limit.
    await assertSucceeds(put(LEAD2, `${P1}/tasks/n6`,
      task({ workstreamId: 'w2', start: '2020-01-01', end: '2030-01-01' })));
  });

  it('V2-2 task create: Assignee, Viewer, Sub-PM of another WS, Sub-PM outside WS dates denied', async () => {
    await assertFails(put(ASG, `${P1}/tasks/n1`, task()));
    await assertFails(put(VIEWER, `${P1}/tasks/n1`, task()));
    await assertFails(put(LEAD2, `${P1}/tasks/n1`, task()));
    await assertFails(put(PM2, `${P1}/tasks/n1`, task()));
    await assertFails(put(LEAD, `${P1}/tasks/n1`, task({ end: '2026-07-01' })));
    await assertFails(put(LEAD, `${P1}/tasks/n1`, task({ start: '2025-12-31' })));
    // Ruling F: PM create is limited to WS dates too.
    await assertFails(put(PM, `${P1}/tasks/n1`, task({ end: '2027-01-01' })));
  });

  // ── Task delete ──
  it('V2-3 task delete: Owner and PM allowed', async () => {
    await assertSucceeds(deleteDoc(doc(await as(OWNER), `${P1}/tasks/t1`)));
    await assertSucceeds(deleteDoc(doc(await as(PM), `${P1}/tasks/t2`)));
  });

  it('V2-4 task delete: Sub-PM (must use Dropped), Assignee, PM of another program denied', async () => {
    await assertFails(deleteDoc(doc(await as(LEAD), `${P1}/tasks/t1`)));
    await assertFails(deleteDoc(doc(await as(ASG), `${P1}/tasks/t1`)));
    await assertFails(deleteDoc(doc(await as(PM2), `${P1}/tasks/t1`)));
    // Sub-PM may drop instead.
    await assertSucceeds(up(LEAD, `${P1}/tasks/t1`, { status: 'Dropped' }));
  });

  // ── Task update ──
  it('V2-5 task update: Owner, PM (own program), Sub-PM (own WS, within dates) allowed', async () => {
    await assertSucceeds(up(OWNER, `${P1}/tasks/t1`, { name: 'o', end: '2027-12-31' }));
    await assertSucceeds(up(PM, `${P1}/tasks/t1`, { picUid: VIEWER.uid, status: 'Completed', version: 3 }));
    await assertSucceeds(up(LEAD, `${P1}/tasks/t2`, { end: '2026-06-30', picUid: ASG.uid }));
  });

  it('V2-6 task update: Sub-PM outside dates / other WS, PM of other program, Viewer, contributor denied', async () => {
    await assertFails(up(LEAD, `${P1}/tasks/t1`, { end: '2026-07-01' }));
    // Ruling F: PM moving end outside the WS is denied.
    await assertFails(up(PM, `${P1}/tasks/t1`, { end: '2026-07-01' }));
    await assertFails(up(LEAD2, `${P1}/tasks/t1`, { name: 'x' }));
    await assertFails(up(PM2, `${P1}/tasks/t1`, { name: 'x' }));
    await assertFails(up(VIEWER, `${P1}/tasks/t1`, { health: 'Red' }));
    // A contributor (LEAD2 on t1) may only append updates (P2.2), never change status.
    await assertFails(up(LEAD2, `${P1}/tasks/t1`, { status: 'Planned' }));
  });

  it('V2-7 task update by Assignee: status Planned/InProgress, health, updates, checkIns allowed', async () => {
    const db = await as(ASG);
    await assertSucceeds(up(ASG, `${P1}/tasks/t1`, {
      status: 'Planned', health: 'Amber', healthNote: 'n', updates: [{ text: 'u' }],
      checkIns: [{ d: 1 }], updatedAt: 'now', updatedBy: ASG.uid, version: 2,
    }));
    await assertSucceeds(up(ASG, `${P1}/tasks/t1`, { status: 'InProgress', version: 3 }));
  });

  it('V2-8 task update by Assignee: setting Completed / Dropped / Submitted denied', async () => {
    const db = await as(ASG);
    await assertFails(up(ASG, `${P1}/tasks/t1`, { status: 'Completed' }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { status: 'Dropped' }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { status: 'Submitted' }));
  });

  it('V2-9 task update by Assignee: changing picUid, end, programId, workstreamId denied', async () => {
    const db = await as(ASG);
    await assertFails(up(ASG, `${P1}/tasks/t1`, { picUid: VIEWER.uid }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { end: '2026-03-02' }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { programId: 'prg2' }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { workstreamId: 'w2' }));
  });

  it('V2-10 task update by Assignee: someone else\'s task and a closed task denied', async () => {
    const db = await as(ASG);
    await assertFails(up(ASG, `${P1}/tasks/t2`, { health: 'Red' }));
    await seedDoc(`${P1}/tasks/t9`, task({ status: 'Completed' }));
    await assertFails(up(ASG, `${P1}/tasks/t9`, { status: 'InProgress' }));
  });

  it('V2-11 task move between WS/programs: Owner allowed; PM of only one side and Sub-PM denied', async () => {
    await assertSucceeds(up(OWNER, `${P1}/tasks/t1`, { programId: 'prg2', workstreamId: 'w3' }));
    await seedDoc(`${P1}/tasks/t1`, task());
    // PM of prg1 within own program (w1 -> w2) is allowed.
    await assertSucceeds(up(PM, `${P1}/tasks/t1`, { workstreamId: 'w2' }));
    await seedDoc(`${P1}/tasks/t1`, task());
    await assertFails(up(PM, `${P1}/tasks/t1`, { programId: 'prg2', workstreamId: 'w3' }));
    await assertFails(up(PM2, `${P1}/tasks/t1`, { programId: 'prg2', workstreamId: 'w3' }));
    await assertFails(up(LEAD, `${P1}/tasks/t1`, { programId: 'prg2', workstreamId: 'w3' }));
    // programId/workstreamId must stay consistent on a PM move.
    await assertFails(up(PM, `${P1}/tasks/t1`, { workstreamId: 'w3' }));
  });

  // ── Workstreams ──
  it('V2-12 workstream create / set leadUid / delete: Owner and PM allowed', async () => {
    await assertSucceeds(put(OWNER, `${P1}/workstreams/n1`, ws('p1', 'prg2', null, null, null)));
    await assertSucceeds(put(PM, `${P1}/workstreams/n2`, ws('p1', 'prg1', LEAD.uid, null, null)));
    await assertSucceeds(up(PM, `${P1}/workstreams/w1`, { leadUid: LEAD2.uid, name: 'r' }));
    await assertSucceeds(up(OWNER, `${P1}/workstreams/w1`, { end: '2026-12-31', version: 3 }));
    await assertSucceeds(deleteDoc(doc(await as(PM), `${P1}/workstreams/n2`)));
    await assertSucceeds(deleteDoc(doc(await as(OWNER), `${P1}/workstreams/n1`)));
  });

  it('V2-13 workstream writes: Sub-PM, Assignee, PM of another program denied; PM cannot change WS dates', async () => {
    await assertFails(put(LEAD, `${P1}/workstreams/n1`, ws('p1', 'prg1', LEAD.uid, null, null)));
    await assertFails(put(ASG, `${P1}/workstreams/n1`, ws('p1', 'prg1', null, null, null)));
    await assertFails(put(PM2, `${P1}/workstreams/n1`, ws('p1', 'prg1', null, null, null)));
    // WS dates are Owner-only: a PM-created WS must have null start/end.
    await assertFails(put(PM, `${P1}/workstreams/n1`, ws('p1', 'prg1', null, '2026-01-01', null)));
    await assertFails(put(PM, `${P1}/workstreams/n1`, ws('p1', 'prg1', null, null, '2026-12-31')));
    await assertFails(up(LEAD, `${P1}/workstreams/w1`, { leadUid: LEAD2.uid }));
    await assertFails(up(LEAD, `${P1}/workstreams/w1`, { name: 'x' }));
    await assertFails(up(ASG, `${P1}/workstreams/w1`, { leadUid: ASG.uid }));
    await assertFails(up(PM, `${P1}/workstreams/w1`, { end: '2026-12-31' }));
    await assertFails(up(PM, `${P1}/workstreams/w1`, { programId: 'prg2' }));
    await assertFails(deleteDoc(doc(await as(LEAD), `${P1}/workstreams/w1`)));
    await assertFails(deleteDoc(doc(await as(PM2), `${P1}/workstreams/w1`)));
  });

  // ── Actions ──
  it('V2-14 action create: Owner, PM, Sub-PM allowed', async () => {
    await assertSucceeds(put(OWNER, `${P1}/actions/n1`, action({ workstreamId: null })));
    await assertSucceeds(put(PM, `${P1}/actions/n2`, action()));
    await assertSucceeds(put(LEAD, `${P1}/actions/n3`, action()));
  });

  it('V2-15 action create: Assignee, Viewer denied; workstreamId null is Owner-only', async () => {
    await assertFails(put(ASG, `${P1}/actions/n1`, action()));
    await assertFails(put(VIEWER, `${P1}/actions/n1`, action()));
    await assertFails(put(PM, `${P1}/actions/n1`, action({ workstreamId: null })));
    await assertFails(put(LEAD2, `${P1}/actions/n1`, action()));
  });

  it('V2-16 action update: PIC may set Done; Owner, PM, Sub-PM may update', async () => {
    await assertSucceeds(up(ASG, `${P1}/actions/a1`, { status: 'Done', note: 'ok' }));
    await assertSucceeds(up(LEAD, `${P1}/actions/a1`, { picUid: VIEWER.uid, version: 3 }));
    await assertSucceeds(up(PM, `${P1}/actions/a1`, { status: 'Cancelled', version: 4 }));
    await assertSucceeds(up(OWNER, `${P1}/actions/a0`, { title: 'x' }));
  });

  it('V2-17 action update: others denied; PIC cannot change picUid / workstreamId or cancel', async () => {
    await assertFails(up(VIEWER, `${P1}/actions/a1`, { status: 'Done' }));
    await assertFails(up(LEAD2, `${P1}/actions/a1`, { status: 'Done' }));
    await assertFails(up(PM, `${P1}/actions/a0`, { title: 'x' }));
    const db = await as(ASG);
    await assertFails(up(ASG, `${P1}/actions/a1`, { picUid: VIEWER.uid }));
    await assertFails(up(ASG, `${P1}/actions/a1`, { workstreamId: 'w2' }));
    await assertFails(up(ASG, `${P1}/actions/a1`, { status: 'Cancelled' }));
  });

  // ── Reads ──
  it('V2-18 read restricted project: Owner (ownerUids, no members doc) and memberUids allowed', async () => {
    for (const u of [OWNER, VIEWER]) {
      const db = await as(u);
      await assertSucceeds(getDoc(doc(db, `${P1}/tasks/t1`)));
      await assertSucceeds(getDoc(doc(db, `${P1}/workstreams/w1`)));
      await assertSucceeds(getDoc(doc(db, `${P1}/actions/a1`)));
      await assertSucceeds(getDoc(doc(db, `${P1}/activity/e1`)));
      await assertSucceeds(getDocs(collection(db, `${P1}/tasks`)));
    }
  });

  it('V2-19 read restricted project: active member not in memberUids and deactivated member denied', async () => {
    for (const u of [OUTSIDER, DEACT]) {
      const db = await as(u);
      await assertFails(getDoc(doc(db, `${P1}/tasks/t1`)));
      await assertFails(getDoc(doc(db, `${P1}/workstreams/w1`)));
      await assertFails(getDoc(doc(db, `${P1}/actions/a1`)));
      await assertFails(getDoc(doc(db, `${P1}/activity/e1`)));
      await assertFails(getDocs(collection(db, `${P1}/tasks`)));
    }
  });

  it('V2-20 read department project: any active member allowed', async () => {
    const db = await as(OUTSIDER);
    await assertSucceeds(getDoc(doc(db, `${P2}/tasks/t1`)));
    await assertSucceeds(getDoc(doc(db, `${P2}/workstreams/w1`)));
    await assertSucceeds(getDoc(doc(db, `${P2}/actions/a1`)));
    await assertSucceeds(getDocs(collection(db, `${P2}/activity`)));
  });

  it('V2-21 read department project: deactivated member, non-smartosc and unverified accounts denied', async () => {
    await assertFails(getDoc(doc(await as(DEACT), `${P2}/tasks/t1`)));
    await assertFails(getDoc(doc(await as(GMAIL), `${P2}/tasks/t1`)));
    await assertFails(getDoc(doc(await asUser(OUTSIDER.uid, OUTSIDER.email, false), `${P2}/tasks/t1`)));
  });

  it('V2-22 read: project without memberUids falls back to v1 memberIds; absent visibility = restricted', async () => {
    await seedDoc(`${WS}/projects/p3`, { name: 'v1', memberIds: [VIEWER.uid], roles: { [VIEWER.uid]: 'member' } });
    await seedDoc(`${WS}/projects/p3/tasks/t1`, task({ projectId: 'p3' }));
    await assertSucceeds(getDoc(doc(await as(VIEWER), `${WS}/projects/p3/tasks/t1`)));
    await assertFails(getDoc(doc(await as(OUTSIDER), `${WS}/projects/p3/tasks/t1`)));
  });

  // ── Activity ──
  it('V2-23 activity: any reader may create with authorUid == me', async () => {
    await assertSucceeds(setDoc(doc(await as(VIEWER), `${P1}/activity/n1`), { authorUid: VIEWER.uid, type: 'x', projectId: 'p1' }));
    await assertSucceeds(setDoc(doc(await as(OUTSIDER), `${P2}/activity/n1`), { authorUid: OUTSIDER.uid, type: 'x' }));
  });

  it('V2-24 activity: update, delete, spoofed author, non-reader denied', async () => {
    const db = await as(VIEWER);
    await assertFails(up(VIEWER, `${P1}/activity/e1`, { type: 'y' }));
    await assertFails(deleteDoc(doc(db, `${P1}/activity/e1`)));
    await assertFails(deleteDoc(doc(await as(OWNER), `${P1}/activity/e1`)));
    await assertFails(setDoc(doc(db, `${P1}/activity/n1`), { authorUid: ASG.uid, type: 'x' }));
    await assertFails(setDoc(doc(await as(OUTSIDER), `${P1}/activity/n1`), { authorUid: OUTSIDER.uid, type: 'x' }));
    await assertFails(setDoc(doc(db, `${P1}/activity/n2`), { authorUid: VIEWER.uid, projectId: 'p2' }));
  });

  // ── Extra guards ──
  it('V2-25 cross-project / cross-workspace spoof denied', async () => {
    await assertFails(put(OWNER, `${P1}/tasks/n1`, task({ projectId: 'p2' })));
    await assertFails(put(PM, `${P1}/tasks/n1`, task({ projectId: 'p2' })));
    await assertFails(put(PM, `${P1}/tasks/n1`, task({ workspaceId: 'other' })));
    await assertFails(put(PM, `${P1}/workstreams/n1`, ws('p2', 'prg1', null, null, null)));
    await assertFails(put(LEAD, `${P1}/actions/n1`, action({ projectId: 'p2' })));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { projectId: 'p2' }));
  });

  it('V2-26 task attached to a WS of another program denied', async () => {
    // PM of prg1 claims programId prg1 but points at w3 (prg2).
    await assertFails(put(PM, `${P1}/tasks/n1`, task({ workstreamId: 'w3' })));
    // LEAD leads w3 (prg2) but claims prg1.
    await assertFails(put(LEAD, `${P1}/tasks/n1`, task({ workstreamId: 'w3' })));
    // Non-existent WS.
    await assertFails(put(PM, `${P1}/tasks/n1`, task({ workstreamId: 'nope' })));
  });

  it('V2-27 legacy workspaceOwner email (no ownerUids) is Owner', async () => {
    await seedDoc(WS, { seeded: true, workspaceOwner: 'HaTTT4@smartosc.com' });
    const db = await as(OWNER);
    await assertSucceeds(getDoc(doc(db, `${P1}/tasks/t1`)));
    await assertSucceeds(put(OWNER, `${P1}/tasks/n1`, task()));
    await assertSucceeds(deleteDoc(doc(db, `${P1}/tasks/n1`)));
  });

  it('V2-28 deactivated PM / Sub-PM / Assignee cannot write', async () => {
    await seedDoc(`${WS}/members/${PM.uid}`, member(PM.email, 'deactivated'));
    await seedDoc(`${WS}/members/${LEAD.uid}`, member(LEAD.email, 'deactivated'));
    await seedDoc(`${WS}/members/${ASG.uid}`, member(ASG.email, 'deactivated'));
    await assertFails(put(PM, `${P1}/tasks/n1`, task()));
    await assertFails(up(LEAD, `${P1}/tasks/t1`, { name: 'x' }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { health: 'Red' }));
    await assertFails(up(ASG, `${P1}/actions/a1`, { status: 'Done' }));
  });

  // ── Fix round 1 ──
  it('V2-29 out-of-range migrated task: PM / Sub-PM status-only edits allowed, date changes outside denied', async () => {
    await seedDoc(`${P1}/tasks/t8`, task({ end: '2026-09-01' })); // w1 ends 2026-06-30
    await assertSucceeds(up(LEAD, `${P1}/tasks/t8`, { status: 'Planned', health: 'Red' }));
    await assertSucceeds(up(PM, `${P1}/tasks/t8`, { status: 'InProgress', version: 3 }));
    await assertFails(up(LEAD, `${P1}/tasks/t8`, { end: '2026-09-02', version: 4 }));
    await assertFails(up(PM, `${P1}/tasks/t8`, { start: '2025-01-01', version: 4 }));
    // Bringing it back within range is a date change that passes.
    await assertSucceeds(up(LEAD, `${P1}/tasks/t8`, { end: '2026-06-30', version: 4 }));
  });

  it('V2-30 Assignee cannot delete status', async () => {
    const db = await as(ASG);
    await assertFails(up(ASG, `${P1}/tasks/t1`, { status: deleteField() }));
    await seedDoc(`${P1}/tasks/t7`, (({ status, ...rest }) => rest)(task())); // eslint-disable-line no-unused-vars
    await assertFails(up(ASG, `${P1}/tasks/t7`, { health: 'Red' }));
    await assertSucceeds(up(ASG, `${P1}/tasks/t7`, { health: 'Red', status: 'InProgress' }));
  });

  it('V2-31 Assignee updates / checkIns are append-only; PM may rewrite them', async () => {
    await seedDoc(`${P1}/tasks/t1`, task({ updates: [{ text: 'a' }], checkIns: [{ d: 1 }] }));
    const db = await as(ASG);
    await assertFails(up(ASG, `${P1}/tasks/t1`, { updates: [] }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { updates: [{ text: 'b' }] }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { updates: [{ text: 'b' }, { text: 'a' }] }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { checkIns: deleteField() }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { checkIns: [{ d: 2 }] }));
    await assertSucceeds(up(ASG, `${P1}/tasks/t1`, { updates: [{ text: 'a' }, { text: 'b' }], checkIns: [{ d: 1 }, { d: 2 }] }));
    // Missing array on the old doc counts as [].
    await seedDoc(`${P1}/tasks/t6`, (({ updates, ...rest }) => rest)(task())); // eslint-disable-line no-unused-vars
    await assertSucceeds(up(ASG, `${P1}/tasks/t6`, { updates: [{ text: 'first' }] }));
    await assertSucceeds(up(PM, `${P1}/tasks/t1`, { updates: [], version: 3 }));
  });

  it('V2-32 version: create must be 1, update must be previous + 1', async () => {
    await assertFails(put(OWNER, `${P1}/tasks/n1`, task({ version: 2 })));
    await assertFails(put(OWNER, `${P1}/workstreams/n1`, ws('p1', 'prg1', null, null, null, { version: 0 })));
    await assertFails(put(OWNER, `${P1}/actions/n1`, action({ version: 5 })));
    await assertFails(updateDoc(doc(await as(OWNER), `${P1}/tasks/t1`), { name: 'x', updatedBy: OWNER.uid })); // no bump
    await assertFails(up(OWNER, `${P1}/tasks/t1`, { name: 'x', version: 3 })); // skip
    await assertFails(up(ASG, `${P1}/tasks/t1`, { health: 'Red', version: 1 })); // stale
    await assertFails(up(PM, `${P1}/workstreams/w1`, { name: 'x', version: 1 }));
    await assertFails(up(ASG, `${P1}/actions/a1`, { status: 'Done', version: 1 }));
    // A doc without version counts as 0 -> next is 1.
    await seedDoc(`${P1}/tasks/t5`, (({ version, ...rest }) => rest)(task())); // eslint-disable-line no-unused-vars
    await assertSucceeds(up(ASG, `${P1}/tasks/t5`, { health: 'Red', version: 1 }));
  });

  it('V2-33 every create/update must stamp updatedBy with the caller uid (Ruling I)', async () => {
    await assertSucceeds(up(ASG, `${P1}/tasks/t1`, { health: 'Red', updatedBy: ASG.uid }));
    await assertFails(up(ASG, `${P1}/tasks/t1`, { health: 'Red', updatedBy: PM.uid, version: 3 }));
    await assertFails(up(PM, `${P1}/tasks/t1`, { name: 'x', updatedBy: ASG.uid, version: 3 }));
    // Omitting updatedBy leaves the stored (ASG) value: PM's edit would be
    // attributed to ASG, so it is denied - Owner included.
    await assertFails(updateDoc(doc(await as(PM), `${P1}/tasks/t1`), { name: 'x', version: 3 }));
    await assertFails(updateDoc(doc(await as(OWNER), `${P1}/tasks/t1`), { name: 'x', version: 3 }));
    await assertFails(updateDoc(doc(await as(PM), `${P1}/workstreams/w1`), { name: 'x', version: 2 }));
    await assertFails(updateDoc(doc(await as(LEAD), `${P1}/actions/a1`), { title: 'x', version: 2 }));
    // Creates without updatedBy are denied too.
    await assertFails(setDoc(doc(await as(OWNER), `${P1}/tasks/n2`), task()));
    await assertFails(setDoc(doc(await as(PM), `${P1}/workstreams/n2`), ws('p1', 'prg1', null, null, null)));
    await assertFails(setDoc(doc(await as(OWNER), `${P1}/actions/n2`), action()));
    // Stamped with the caller: allowed.
    await assertSucceeds(up(PM, `${P1}/tasks/t1`, { name: 'x', version: 3 }));
    await assertFails(put(PM, `${P1}/tasks/n1`, task({ updatedBy: ASG.uid })));
    await assertFails(up(ASG, `${P1}/actions/a1`, { status: 'Done', updatedBy: PM.uid }));
    await assertFails(put(LEAD, `${P1}/actions/n1`, action({ updatedBy: PM.uid })));
  });

  it('V2-34 active member without a role cannot write on a department project', async () => {
    const db = await as(OUTSIDER);
    await assertFails(put(OUTSIDER, `${P2}/tasks/n1`, task({ projectId: 'p2' })));
    await assertFails(up(OUTSIDER, `${P2}/tasks/t1`, { health: 'Red' }));
    await assertFails(deleteDoc(doc(db, `${P2}/tasks/t1`)));
    await assertFails(put(OUTSIDER, `${P2}/workstreams/n1`, ws('p2', 'prg1', null, null, null)));
    await assertFails(up(OUTSIDER, `${P2}/workstreams/w1`, { name: 'x' }));
    await assertFails(put(OUTSIDER, `${P2}/actions/n1`, action({ projectId: 'p2' })));
    await assertFails(up(OUTSIDER, `${P2}/actions/a1`, { status: 'Done' }));
  });

  it('V2-35 legacy project without programMeta: PM / Sub-PM writes denied', async () => {
    const P3 = `${WS}/projects/p3`;
    await seedDoc(P3, { name: 'v1', memberIds: [PM.uid, LEAD.uid], roles: { [PM.uid]: 'owner' } });
    await seedDoc(`${P3}/workstreams/w1`, ws('p3', 'prg1', LEAD.uid, null, null));
    await seedDoc(`${P3}/tasks/t1`, task({ projectId: 'p3' }));
    await seedDoc(`${P3}/actions/a1`, action({ projectId: 'p3', picUid: VIEWER.uid }));
    await assertFails(put(PM, `${P3}/tasks/n1`, task({ projectId: 'p3' })));
    await assertFails(put(LEAD, `${P3}/tasks/n1`, task({ projectId: 'p3' })));
    await assertFails(up(PM, `${P3}/tasks/t1`, { name: 'x' }));
    await assertFails(up(LEAD, `${P3}/tasks/t1`, { name: 'x' }));
    await assertFails(deleteDoc(doc(await as(PM), `${P3}/tasks/t1`)));
    await assertFails(put(PM, `${P3}/workstreams/n1`, ws('p3', 'prg1', null, null, null)));
    await assertFails(put(LEAD, `${P3}/actions/n1`, action({ projectId: 'p3' })));
    await assertFails(up(LEAD, `${P3}/actions/a1`, { title: 'x' }));
  });
});
