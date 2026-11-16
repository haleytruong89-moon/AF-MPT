import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, updateDoc, getDoc, getDocs, collection, query, where, runTransaction, serverTimestamp } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// W3-B1 (HOD D1 13/11): any reader of a v2 project may append ONE comment to any
// task or action (any status), nothing else. W3-B1 (D5): a department-visible v2
// project is listable by any active member.

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PIC = { uid: 'u_pic', email: 'pic@smartosc.com' };
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' };
const READER = { uid: 'u_reader', email: 'reader@smartosc.com' }; // member, no role
const OUT = { uid: 'u_out', email: 'out@smartosc.com' }; // active member, not in memberUids
const DEACT = { uid: 'u_deact', email: 'deact@smartosc.com' };
const GMAIL = { uid: 'u_gmail', email: 'someone@gmail.com' };

const WS = 'workspaces/main';
const P1 = `${WS}/projects/p1`;
const programMeta = { prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: null, start: null, end: null } };
const WSIDS = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'];

const project = (over = {}) => ({
  name: 'P', memberIds: [OWNER.uid], roles: { [OWNER.uid]: 'owner' }, programs: [], programMeta,
  memberUids: [PIC.uid, PM.uid, READER.uid, DEACT.uid], visibility: 'restricted', schemaVersion: 2, ...over,
});
const member = (email, status = 'active') => ({
  email, displayName: email, aliases: [], department: 'AF', status, updatedAt: '2026-11-16T00:00:00Z', updatedBy: OWNER.email,
});
const old = { id: 'u0', text: 'old', date: '2026-11-01', author: PIC.email, authorUid: PIC.uid, isBlocker: false };
const task = (id, ws, status = 'InProgress') => ({
  workspaceId: 'main', projectId: 'p1', programId: 'prg1', workstreamId: ws, order: 0,
  id, name: id, status, health: 'Green', picUid: PIC.uid, contributorUids: [], updates: [old], checkIns: [],
  updatedBy: OWNER.uid, version: 1,
});
const action = (id, status = 'Pending') => ({
  workspaceId: 'main', projectId: 'p1', workstreamId: 'w1', id, title: id, status, picUid: PIC.uid,
  updates: [old], updatedBy: OWNER.uid, version: 1,
});
const c = (u, extra = {}) => ({ id: `c_${u.uid}`, text: 'question', date: '2026-11-16', author: u.email, authorUid: u.uid, isBlocker: false, ...extra });

async function seed(projectOver = {}) {
  await resetData();
  await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
  for (const u of [OWNER, PIC, PM, READER, OUT]) await seedDoc(`${WS}/members/${u.uid}`, member(u.email));
  await seedDoc(`${WS}/members/${DEACT.uid}`, member(DEACT.email, 'deactivated'));
  await seedDoc(P1, project(projectOver));
  for (const w of WSIDS) {
    await seedDoc(`${P1}/workstreams/${w}`, {
      workspaceId: 'main', projectId: 'p1', programId: 'prg1', name: w, order: 0,
      leadUid: null, start: null, end: null, version: 1, updatedBy: OWNER.uid,
    });
  }
  await seedDoc(`${P1}/tasks/t1`, task('t1', 'w1'));
  for (const st of ['Submitted', 'Completed', 'Dropped']) await seedDoc(`${P1}/tasks/t_${st}`, task(`t_${st}`, 'w1', st));
  for (const [i, w] of WSIDS.entries()) await seedDoc(`${P1}/tasks/m${i}`, task(`m${i}`, w));
  await seedDoc(`${P1}/actions/a1`, action('a1'));
  await seedDoc(`${P1}/actions/a_c`, action('a_c', 'Cancelled'));
}

const up = async (u, path, data) => updateDoc(doc(await asUser(u.uid, u.email), path), { version: 2, updatedBy: u.uid, ...data });
const comment = (u, path, extra = {}, entry = c(u)) => up(u, path, { updates: [entry, old], ...extra });

describe('W3-B1: reader comments (D1)', () => {
  afterAll(cleanup);
  beforeEach(() => seed());

  it('W3-C-1..4 a reader comments on a task at any status', async () => {
    await assertSucceeds(comment(READER, `${P1}/tasks/t1`));
    for (const st of ['Submitted', 'Completed', 'Dropped']) await assertSucceeds(comment(READER, `${P1}/tasks/t_${st}`));
  });

  it('W3-C-5/6 a reader comments on an action, also a Cancelled one', async () => {
    await assertSucceeds(comment(READER, `${P1}/actions/a1`));
    await assertSucceeds(comment(READER, `${P1}/actions/a_c`));
  });

  it('W3-C-9 the comment may carry the blocker flag (HOD Q1 = yes)', async () => {
    await assertSucceeds(comment(READER, `${P1}/tasks/t1`, {}, c(READER, { isBlocker: true })));
  });

  it('W3-C-10..14 malformed appends are denied', async () => {
    const t = `${P1}/tasks/t1`;
    await assertFails(up(READER, t, { updates: [c(READER), { ...c(READER), id: 'c2' }, old] }));
    await assertFails(up(READER, t, { updates: [c(READER, { authorUid: PIC.uid }), old] }));
    await assertFails(up(READER, t, { updates: [{ id: 'x', text: 'no author' }, old] }));
    await assertFails(up(READER, t, { updates: [{ ...old, text: 'edited' }] }));
    await assertFails(up(READER, t, { updates: [] }));
  });

  it('W3-C-15/16 a comment with any other key, or no comment at all, is denied', async () => {
    const t = `${P1}/tasks/t1`;
    await assertFails(comment(READER, t, { status: 'Completed' }));
    await assertFails(comment(READER, t, { health: 'Red' }));
    await assertFails(comment(READER, t, { name: 'x' }));
    await assertFails(up(READER, t, { updatedAt: serverTimestamp() }));
    await assertFails(comment(READER, `${P1}/actions/a1`, { status: 'Done' }));
    await assertFails(comment(READER, `${P1}/actions/a1`, { title: 'x' }));
  });

  it('W3-C-17/18/20 non-members, deactivated and non-SmartOSC accounts are denied', async () => {
    await assertFails(comment(OUT, `${P1}/tasks/t1`));
    await assertFails(comment(DEACT, `${P1}/tasks/t1`));
    await assertFails(comment(GMAIL, `${P1}/tasks/t1`));
    await assertFails(comment(OUT, `${P1}/actions/a1`));
  });

  it('W3-C-21 a reader comments on 8 tasks in 8 work streams in one transaction', async () => {
    const db = await asUser(READER.uid, READER.email);
    await assertSucceeds(runTransaction(db, async (tx) => {
      WSIDS.forEach((_, i) => {
        tx.update(doc(db, `${P1}/tasks/m${i}`), { version: 2, updatedBy: READER.uid, updates: [{ ...c(READER), id: `c${i}` }, old] });
      });
    }));
  });
});

describe('W3-B1: department visibility (D5)', () => {
  afterAll(cleanup);

  it('W3-C-7 department project: an active member outside memberUids may comment', async () => {
    await seed({ visibility: 'department' });
    await assertSucceeds(comment(OUT, `${P1}/tasks/t1`));
    await assertFails(comment(DEACT, `${P1}/tasks/t1`));
  });

  it('W3-C-19 schemaVersion 1 project: sub-docs stay closed', async () => {
    await seed({ schemaVersion: 1 });
    await assertFails(comment(READER, `${P1}/tasks/t1`));
  });

  const deptQuery = (db) => getDocs(query(collection(db, `${WS}/projects`), where('schemaVersion', '==', 2), where('visibility', '==', 'department')));

  it('W3-L-1 an active non-member lists department projects', async () => {
    await seed({ visibility: 'department' });
    const snap = await assertSucceeds(deptQuery(await asUser(OUT.uid, OUT.email)));
    if (snap.size !== 1) throw new Error(`expected 1 project, got ${snap.size}`);
  });

  it('W3-L-2/3 deactivated and non-SmartOSC accounts cannot list them', async () => {
    await seed({ visibility: 'department' });
    await assertFails(deptQuery(await asUser(DEACT.uid, DEACT.email)));
    await assertFails(deptQuery(await asUser(GMAIL.uid, GMAIL.email)));
  });

  it('W3-L-4 a query without the visibility filter is denied for a non-member', async () => {
    await seed({ visibility: 'department' });
    await assertFails(getDocs(query(collection(await asUser(OUT.uid, OUT.email), `${WS}/projects`), where('schemaVersion', '==', 2))));
  });

  it('W3-L-5 a restricted project stays closed to a non-member', async () => {
    await seed();
    await assertFails(getDoc(doc(await asUser(OUT.uid, OUT.email), P1)));
    const snap = await deptQuery(await asUser(OUT.uid, OUT.email));
    if (snap.size !== 0) throw new Error('restricted project listed');
  });

  it('W3-L-6 the memberIds query keeps working', async () => {
    await seed();
    await assertSucceeds(getDocs(query(collection(await asUser(OWNER.uid, OWNER.email), `${WS}/projects`), where('memberIds', 'array-contains', OWNER.uid))));
  });
});
