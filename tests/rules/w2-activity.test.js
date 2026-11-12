import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';
import { OWNER, PM, DEPUTY, LEAD, VIEWER, P1, realTask, seedScenario } from './p3-scenarios.js';

// Wave 2 A2 (R3): activity events carry only allow-listed fields (no author /
// authorName / timestamp), description <= 2000 chars, and a role_changed event
// only from an Owner or the PM / Deputy of the event's programId.
// Fixtures: p3-scenarios.js (prg1 PM / DEPUTY; prg2 PM is someone else; w1 Sub-PM LEAD).

let n = 0;
const emit = async (u, data) =>
  setDoc(doc(await asUser(u.uid, u.email), `${P1}/activity/e${++n}`),
    { authorUid: u.uid, createdAt: serverTimestamp(), ...data });
const ev = (over = {}) => ({ id: 'x', type: 'status_change', description: 'did a thing', ...over });
const role = (over = {}) => ev({ type: 'role_changed', description: 'Role changed', programId: 'prg1', before: { uid: null }, after: { uid: 'u' }, ...over });

describe('W2 A2: activity shape (R3)', () => {
  beforeEach(async () => { await resetData(); await seedScenario(seedDoc, { seed: realTask() }); });
  afterAll(cleanup);

  it('W2-A2-01 ordinary event by a Viewer member: allowed', async () => {
    await assertSucceeds(emit(VIEWER, ev()));
    await assertSucceeds(emit(VIEWER, ev({ before: { s: 1 }, after: { s: 2 }, programId: 'prg1', workstreamId: 'w1', projectId: 'p1', workspaceId: 'main' })));
  });

  it('W2-A2-02 author / authorName / timestamp / unknown key: each denied', async () => {
    await assertFails(emit(VIEWER, ev({ author: 'Hatt' })));
    await assertFails(emit(VIEWER, ev({ authorName: 'Hatt' })));
    await assertFails(emit(VIEWER, ev({ timestamp: '2026-01-01T00:00:00Z' })));
    await assertFails(emit(VIEWER, ev({ taskId: 't1' })));
    await assertFails(emit(VIEWER, ev({ junk: 1 })));
  });

  it('W2-A2-03 description: 2000 chars allowed, 2001 denied', async () => {
    await assertSucceeds(emit(VIEWER, ev({ description: 'a'.repeat(2000) })));
    await assertFails(emit(VIEWER, ev({ description: 'a'.repeat(2001) })));
  });
});

describe('W2 A2: role_changed events (R3)', () => {
  beforeEach(async () => { await resetData(); await seedScenario(seedDoc, { seed: realTask() }); });
  afterAll(cleanup);

  it('W2-A2-04 Sub-PM (lead) and Viewer: denied', async () => {
    await assertFails(emit(LEAD, role({ workstreamId: 'w1' })));
    await assertFails(emit(VIEWER, role()));
  });

  it('W2-A2-05 PM and Deputy of the named program: allowed', async () => {
    await assertSucceeds(emit(PM, role()));
    await assertSucceeds(emit(DEPUTY, role({ workstreamId: 'w1' })));
  });

  it('W2-A2-06 PM naming another program: denied', async () => {
    await assertFails(emit(PM, role({ programId: 'prg2' })));
  });

  it('W2-A2-07 Owner: allowed', async () => {
    await assertSucceeds(emit(OWNER, role()));
    await assertSucceeds(emit(OWNER, role({ programId: 'prg2' })));
  });

  it('W2-A2-08 no programId: denied for a PM', async () => {
    const { programId: _p, ...noProgram } = role();
    void _p;
    await assertFails(emit(PM, noProgram));
  });
});
