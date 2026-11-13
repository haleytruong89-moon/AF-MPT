import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// Wave 2 R5 (HOD Q1 12/11, Ruling W2-4): RAID and decisions are edited only
// within one's own program; deletes are Owner-only.
//  - raid/{programId}: the claim must resolve to programId (PM/Deputy via
//    viaProgramId == programId, or Sub-PM via viaWorkstreamId of a ws in it).
//  - decisions: program = the stored claim's program (viaProgramId, else the
//    program of viaWorkstreamId). Update must claim that program; create must
//    claim the program it names; no stored claim = Owner only.
//  - decision delete: Owner only (the PM of the stored claim no longer).

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' }; // workspace Owner, no project role
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' }; // PM of prg1
const DEPUTY = { uid: 'u_deputy', email: 'deputy@smartosc.com' }; // Deputy of prg1
const PM2 = { uid: 'u_pm2', email: 'pm2@smartosc.com' }; // PM of prg2 AND Sub-PM of wMix (prg1)
const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' }; // Sub-PM of w1 (prg1)
const LEAD2 = { uid: 'u_lead2', email: 'lead2@smartosc.com' }; // Sub-PM of w2 (prg2)
const ASG = { uid: 'u_asg', email: 'asg@smartosc.com' }; // no role

const WS = 'workspaces/main';
const P1 = `${WS}/projects/p1`; // schemaVersion 2

const programMeta = {
  prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: DEPUTY.uid, start: null, end: null },
  prg2: { name: 'Program 2', order: 1, pmUid: PM2.uid, deputyUid: null, start: null, end: null },
};

const ALL = [PM, DEPUTY, PM2, LEAD, LEAD2, ASG];

const project = () => ({
  name: 'P',
  memberIds: ALL.map((u) => u.uid),
  roles: {},
  programs: [],
  programMeta,
  memberUids: ALL.map((u) => u.uid),
  visibility: 'restricted',
  schemaVersion: 2,
});

const ws = (programId, leadUid) => ({
  workspaceId: 'main', projectId: 'p1', programId, name: 'WS', order: 0,
  leadUid, start: null, end: null, version: 1,
});

const raid = (programId, over = {}) => ({
  workspaceId: 'main', projectId: 'p1', programId, items: [], version: 1, ...over,
});

const decision = (over = {}) => ({
  workspaceId: 'main', projectId: 'p1', order: 0, id: 'd', title: 'Decision', status: 'Open', version: 1, ...over,
});

const member = (email, status = 'active') => ({
  email, displayName: email, aliases: [], department: 'AF', status,
  updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
});

const as = (u) => asUser(u.uid, u.email);
// v2 writes: stamp updatedBy, bump version (seeds are at version 1).
const up = async (u, path, data) => updateDoc(doc(await as(u), path), { version: 2, updatedBy: u.uid, ...data });
const put = async (u, path, data) => setDoc(doc(await as(u), path), { updatedBy: u.uid, ...data });
const del = async (u, path) => deleteDoc(doc(await as(u), path));

describe('Wave 2 R5: RAID and decisions by program', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
    for (const u of ALL) await seedDoc(`${WS}/members/${u.uid}`, member(u.email));
    await seedDoc(P1, project());
    await seedDoc(`${P1}/workstreams/w1`, ws('prg1', LEAD.uid));
    await seedDoc(`${P1}/workstreams/wMix`, ws('prg1', PM2.uid));
    await seedDoc(`${P1}/workstreams/w2`, ws('prg2', LEAD2.uid));
    await seedDoc(`${P1}/raid/prg1`, raid('prg1', { updatedBy: OWNER.uid }));
    await seedDoc(`${P1}/raid/prg2`, raid('prg2', { updatedBy: OWNER.uid }));
    await seedDoc(`${P1}/decisions/dP1`, decision({ viaProgramId: 'prg1', updatedBy: PM.uid }));
    await seedDoc(`${P1}/decisions/dW1`, decision({ viaWorkstreamId: 'w1', updatedBy: LEAD.uid }));
    await seedDoc(`${P1}/decisions/dNone`, decision({ updatedBy: OWNER.uid }));
  });
  afterAll(cleanup);

  // ── RAID ──
  it('W2-RD-1 RAID of prg2: PM of prg1 denied with any claim; PM of prg2 allowed', async () => {
    const items = [{ id: 'r1' }];
    await assertFails(up(PM, `${P1}/raid/prg2`, { items, viaProgramId: 'prg1' }));
    await assertFails(up(PM, `${P1}/raid/prg2`, { items, viaProgramId: 'prg2' }));
    await assertFails(up(PM, `${P1}/raid/prg2`, { items, viaWorkstreamId: 'w1' }));
    await assertFails(up(DEPUTY, `${P1}/raid/prg2`, { items, viaProgramId: 'prg1' }));
    await assertSucceeds(up(PM2, `${P1}/raid/prg2`, { items, viaProgramId: 'prg2' }));
  });

  it('W2-RD-2 RAID of prg2: Sub-PM of a ws in prg2 allowed; Sub-PM of a ws in prg1 denied', async () => {
    const items = [{ id: 'r1' }];
    await assertFails(up(LEAD, `${P1}/raid/prg2`, { items, viaWorkstreamId: 'w1' }));
    await assertFails(up(LEAD, `${P1}/raid/prg2`, { items, viaWorkstreamId: 'w2' }));
    await assertSucceeds(up(LEAD2, `${P1}/raid/prg2`, { items, viaWorkstreamId: 'w2' }));
    await assertSucceeds(up(LEAD, `${P1}/raid/prg1`, { items, viaWorkstreamId: 'w1' }));
  });

  it('W2-RD-3 RAID: a ws claim next to a viaProgramId of another program is refused', async () => {
    await assertFails(up(LEAD2, `${P1}/raid/prg2`, { items: [], viaProgramId: 'prg1', viaWorkstreamId: 'w2' }));
  });

  it('W2-RD-4 RAID create follows the same rule; Owner always allowed', async () => {
    await assertSucceeds(del(OWNER, `${P1}/raid/prg2`));
    await assertFails(put(PM, `${P1}/raid/prg2`, raid('prg2', { viaProgramId: 'prg1' })));
    await assertFails(put(LEAD, `${P1}/raid/prg2`, raid('prg2', { viaWorkstreamId: 'w1' })));
    await assertSucceeds(put(LEAD2, `${P1}/raid/prg2`, raid('prg2', { viaWorkstreamId: 'w2' })));
    await assertSucceeds(up(OWNER, `${P1}/raid/prg1`, { items: [{ id: 'o' }] }));
  });

  it('W2-RD-5 PM of prg2 who is Sub-PM of a ws in prg1: right claim per program', async () => {
    await assertSucceeds(up(PM2, `${P1}/raid/prg1`, { items: [{ id: 'm' }], viaWorkstreamId: 'wMix' }));
    await assertFails(up(PM2, `${P1}/raid/prg1`, { items: [], viaProgramId: 'prg2', version: 3 }));
    await assertSucceeds(up(PM2, `${P1}/decisions/dP1`, { title: 'mix', viaProgramId: null, viaWorkstreamId: 'wMix' }));
  });

  it('W2-RD-6 RAID delete: PM and Sub-PM denied, Owner allowed', async () => {
    await assertFails(del(PM, `${P1}/raid/prg1`));
    await assertFails(del(LEAD, `${P1}/raid/prg1`));
    await assertSucceeds(del(OWNER, `${P1}/raid/prg1`));
  });

  // ── decisions ──
  it('W2-RD-7 decision created via prg1: PM of prg2 (claiming prg2) denied; Sub-PM of a ws in prg1 allowed', async () => {
    await assertFails(up(PM2, `${P1}/decisions/dP1`, { title: 'x', viaProgramId: 'prg2' }));
    await assertFails(up(LEAD2, `${P1}/decisions/dP1`, { title: 'x', viaProgramId: null, viaWorkstreamId: 'w2' }));
    await assertSucceeds(up(LEAD, `${P1}/decisions/dP1`, { title: 'x', viaProgramId: null, viaWorkstreamId: 'w1' }));
    // Now stored via w1 (prg1): the PM of prg1 still edits it, the PM of prg2 does not.
    await assertSucceeds(up(PM, `${P1}/decisions/dP1`, { title: 'y', viaProgramId: 'prg1', version: 3 }));
    await assertFails(up(PM2, `${P1}/decisions/dP1`, { title: 'z', viaProgramId: 'prg2', version: 4 }));
  });

  it('W2-RD-8 decision stored via a ws: program = that ws program', async () => {
    await assertFails(up(PM2, `${P1}/decisions/dW1`, { title: 'x', viaProgramId: 'prg2' }));
    await assertSucceeds(up(DEPUTY, `${P1}/decisions/dW1`, { title: 'x', viaProgramId: 'prg1' }));
  });

  it('W2-RD-9 decision with no stored claim: non-Owners denied, Owner allowed', async () => {
    await assertFails(up(PM, `${P1}/decisions/dNone`, { title: 'x', viaProgramId: 'prg1' }));
    await assertFails(up(LEAD, `${P1}/decisions/dNone`, { title: 'x', viaWorkstreamId: 'w1' }));
    await assertSucceeds(up(OWNER, `${P1}/decisions/dNone`, { title: 'o' }));
  });

  it('W2-RD-10 decision create: claim must hold for the program it names (no re-claim)', async () => {
    await assertSucceeds(put(PM2, `${P1}/decisions/n1`, decision({ viaProgramId: 'prg2' })));
    await assertSucceeds(put(LEAD2, `${P1}/decisions/n2`, decision({ viaWorkstreamId: 'w2' })));
    await assertFails(put(PM, `${P1}/decisions/n3`, decision({ viaProgramId: 'prg2' })));
    // A ws claim in prg1 next to viaProgramId prg2 would file the decision under prg2.
    await assertFails(put(LEAD, `${P1}/decisions/n4`, decision({ viaProgramId: 'prg2', viaWorkstreamId: 'w1' })));
    await assertSucceeds(put(OWNER, `${P1}/decisions/n5`, decision()));
  });

  it('W2-RD-11 decision update: deactivated PM of the stored program denied', async () => {
    await seedDoc(`${WS}/members/${PM.uid}`, member(PM.email, 'deactivated'));
    await assertFails(up(PM, `${P1}/decisions/dP1`, { title: 'x', viaProgramId: 'prg1' }));
  });

  it('W2-RD-12 decision delete: PM of the stored claim and Sub-PM denied, Owner allowed', async () => {
    await assertFails(del(PM, `${P1}/decisions/dP1`));
    await assertFails(del(LEAD, `${P1}/decisions/dW1`));
    await assertSucceeds(del(OWNER, `${P1}/decisions/dP1`));
  });
});
