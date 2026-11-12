import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';
import { OWNER, PM, LEAD, ASG, P1, realTask, seedScenario } from './p3-scenarios.js';

// Wave 2 A1 (R1, R2, W4): weight is a credit field, WS / program weight is
// Owner-only, a non-Owner task create is "clean", action delete is Owner-only.
// Fixtures: p3-scenarios.js (prg1 PM / DEPUTY, w1 Sub-PM LEAD, members active).

const T = `${P1}/tasks/tr`;
const NEW = `${P1}/tasks/new1`;
const seedTask = (t) => seedScenario(seedDoc, { seed: t });
const up = async (u, path, data, version) =>
  updateDoc(doc(await asUser(u.uid, u.email), path), { version, updatedBy: u.uid, ...data });
const upTask = (u, data) => up(u, T, data, realTask().version + 1);

// A clean task payload a PM / Sub-PM may create (open, auto split, in WS dates).
const clean = (u, over = {}) => ({
  workspaceId: 'main', projectId: 'p1', programId: 'prg1', workstreamId: 'w1', order: 9,
  id: 'new1', name: 'New task', status: 'Planned', health: 'Green',
  start: '2026-02-01', end: '2026-03-01', pic: 'asg', picUid: ASG.uid, picEmail: ASG.email,
  contributorUids: [], updates: [], checkIns: [], ...over,
});
const create = async (u, data) =>
  setDoc(doc(await asUser(u.uid, u.email), NEW), { version: 1, updatedBy: u.uid, ...data });
const createAt = async (id, u, data) =>
  setDoc(doc(await asUser(u.uid, u.email), `${P1}/tasks/${id}`), { version: 1, updatedBy: u.uid, ...data });
const ownUpdate = (u, over = {}) => ({
  id: 'u1', text: 'first', date: '2026-11-01', timestamp: '2026-11-01T00:00:00Z', author: u.email, authorUid: u.uid, isBlocker: false, ...over,
});

describe('W2 A1: weight is a credit field (R1)', () => {
  beforeEach(resetData);
  afterAll(cleanup);

  it('W2-A1-01 PM / Sub-PM change ONLY weight on a Completed task: denied (weight itself is guarded)', async () => {
    await seedTask(realTask({ status: 'Completed', approvedByUid: OWNER.uid, weight: 10 }));
    await assertFails(upTask(PM, { weight: 50 }));
    await assertFails(upTask(LEAD, { weight: 50 }));
  });

  it('W2-A1-02 PM / Sub-PM change weight on an open task: allowed', async () => {
    await seedTask(realTask({ weight: 10 }));
    await assertSucceeds(upTask(PM, { weight: 50 }));
    await seedTask(realTask({ weight: 10 }));
    await assertSucceeds(upTask(LEAD, { weight: 50 }));
  });

  it('W2-A1-03 Owner changes weight on a Completed task: allowed', async () => {
    await seedTask(realTask({ status: 'Completed', approvedByUid: OWNER.uid, weight: 10 }));
    await assertSucceeds(upTask(OWNER, { weight: 50 }));
  });
});

describe('W2 A1: work stream / program weight is Owner-only (R2)', () => {
  beforeEach(resetData);
  afterAll(cleanup);

  const W1 = `${P1}/workstreams/w1`;
  beforeEach(async () => {
    await seedScenario(seedDoc, { seed: realTask() });
  });

  it('W2-A1-04 PM changes WS weight: denied; Owner: allowed', async () => {
    await assertFails(up(PM, W1, { weight: 30 }, 2));
    await assertSucceeds(up(OWNER, W1, { weight: 30 }, 2));
  });

  it('W2-A1-05 PM still edits other WS fields (name): allowed', async () => {
    await assertSucceeds(up(PM, W1, { name: 'Renamed' }, 2));
  });

  it('W2-A1-06 program weight lives in project programMeta (Owner-only key): PM denied', async () => {
    // A v2 project doc is frozen for non-Owners; even a PM listed as operator
    // cannot write programMeta.prg1.weight. Owner may.
    await seedDoc(P1, {
      name: 'P', memberIds: [PM.uid], roles: { [PM.uid]: 'operator' }, schemaVersion: 2,
      memberUids: [PM.uid], visibility: 'restricted',
      programMeta: { prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: null, weight: 10 } },
    });
    const pmDb = await asUser(PM.uid, PM.email);
    await assertFails(updateDoc(doc(pmDb, P1), { 'programMeta.prg1.weight': 90 }));
    const ownerDb = await asUser(OWNER.uid, OWNER.email);
    await assertSucceeds(updateDoc(doc(ownerDb, P1), { 'programMeta.prg1.weight': 90 }));
  });
});

describe('W2 A1: non-Owner task create is clean (W4)', () => {
  beforeEach(async () => {
    await resetData();
    await seedScenario(seedDoc, { seed: realTask() });
  });
  afterAll(cleanup);

  it('W2-A1-07 clean create (open, auto split, one own update): allowed for PM and Sub-PM', async () => {
    await assertSucceeds(create(PM, clean(PM, { updates: [ownUpdate(PM)] })));
    await assertSucceeds(createAt('new2', LEAD, clean(LEAD, { id: 'new2', updates: [ownUpdate(LEAD)], creditSharesMode: 'auto' })));
  });

  it('W2-A1-08 creditSharesMode manual: denied', async () => {
    await assertFails(create(PM, clean(PM, { creditSharesMode: 'manual', creditShares: { u_asg: 100 } })));
  });

  it.each([
    ['closeRequest', { id: 'cr', outcome: 'Completed' }],
    ['closeRequestHistory', []],
    ['approvedByUid', 'u_pm'],
    ['closedByUid', 'u_pm'],
    ['blockerResolutions', {}],
  ])('W2-A1-09 create carrying %s: denied', async (key, value) => {
    await assertFails(create(PM, clean(PM, { [key]: value })));
  });

  it('W2-A1-10 update authored by someone else: denied', async () => {
    await assertFails(create(PM, clean(PM, { updates: [ownUpdate(PM, { authorUid: LEAD.uid })] })));
  });

  it('W2-A1-11 two updates: denied', async () => {
    await assertFails(create(PM, clean(PM, { updates: [ownUpdate(PM), ownUpdate(PM, { id: 'u2' })] })));
  });

  it('W2-A1-12 name of 501 characters: denied; 500: allowed', async () => {
    await assertFails(create(PM, clean(PM, { name: 'x'.repeat(501) })));
    await assertSucceeds(create(PM, clean(PM, { name: 'x'.repeat(500) })));
  });

  it('W2-A1-13 Owner create is not subject to the clean check', async () => {
    await assertSucceeds(create(OWNER, clean(OWNER, { creditSharesMode: 'manual', creditShares: { u_asg: 100 } })));
  });
});

describe('W2 A1: action delete is Owner-only (W4)', () => {
  const A = `${P1}/actions/a1`;
  beforeEach(async () => {
    await resetData();
    await seedScenario(seedDoc, { seed: realTask() });
    await seedDoc(A, {
      workspaceId: 'main', projectId: 'p1', order: 0, id: 'a1', title: 'Action', status: 'Pending',
      workstreamId: 'w1', version: 1,
    });
  });
  afterAll(cleanup);

  it('W2-A1-14 PM and Sub-PM delete an action: denied; Owner: allowed', async () => {
    await assertFails(deleteDoc(doc(await asUser(PM.uid, PM.email), A)));
    await assertFails(deleteDoc(doc(await asUser(LEAD.uid, LEAD.email), A)));
    await assertSucceeds(deleteDoc(doc(await asUser(OWNER.uid, OWNER.email), A)));
  });
});
