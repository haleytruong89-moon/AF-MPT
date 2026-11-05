import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { doc, getDoc, runTransaction, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { asUser, seedDoc, resetData, cleanup, getEnv } from './helpers.js';
import { executeRoleChange } from '../../src/execRoleChange.js';

// Role assignment PR 1, Task 3: executeRoleChange end to end against the rules
// (no rules change). PM / Deputy = Owner only; Sub-PM = Owner or an active PM /
// Deputy of the workstream's program; adding a project member = Owner only.

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PM1 = { uid: 'u_pm1', email: 'pm1@smartosc.com' };
const DEP1 = { uid: 'u_dep1', email: 'dep1@smartosc.com' };
const PM2 = { uid: 'u_pm2', email: 'pm2@smartosc.com' };
const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' };
const MEM = { uid: 'u_mem', email: 'mem@smartosc.com' };
const OUT = { uid: 'u_out', email: 'out@smartosc.com' }; // active, not a project member
const DPM = { uid: 'u_dpm', email: 'dpm@smartosc.com' }; // deactivated PM of prg3
const ALL = [OWNER, PM1, DEP1, PM2, LEAD, MEM, OUT, DPM];
const MEMBERS = [OWNER, PM1, DEP1, PM2, LEAD, MEM, DPM];

const WID = 'main';
const PID = 'pr';
const WS = `workspaces/${WID}`;
const PR = `${WS}/projects/${PID}`;

const ws = (programId, over = {}) => ({
  workspaceId: WID, projectId: PID, programId, name: `WS ${programId}`,
  start: null, end: null, leadUid: null, version: 1, updatedBy: 'seed', ...over,
});

const fs = { runTransaction, doc, serverTimestamp, arrayUnion };
const as = (u) => asUser(u.uid, u.email);
const run = async (u, change, addMemberUid = null, pid = PID) =>
  executeRoleChange(fs, { db: await as(u), wid: WID, pid, uid: u.uid, change, addMemberUid });

async function serverDoc(path) {
  const e = await getEnv();
  let out;
  await e.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), path));
    out = s.exists() ? s.data() : undefined;
  });
  return out;
}

const lead = (wsId, programId, fromUid, toUid) => ({ kind: 'lead', programId, wsId, fromUid, toUid });

describe('Role assignment executor against the rules', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
    for (const u of ALL) {
      await seedDoc(`${WS}/members/${u.uid}`, {
        email: u.email, displayName: u.email, aliases: [], department: 'AF',
        status: u === DPM ? 'deactivated' : 'active',
        updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
      });
    }
    await seedDoc(PR, {
      name: 'Role pilot', schemaVersion: 2, visibility: 'restricted',
      programMeta: {
        prg1: { name: 'Program 1', pmUid: PM1.uid, deputyUid: DEP1.uid },
        prg2: { name: 'Program 2', pmUid: PM2.uid, deputyUid: null },
        prg3: { name: 'Program 3', pmUid: DPM.uid, deputyUid: null },
      },
      memberUids: MEMBERS.map((u) => u.uid),
      memberIds: MEMBERS.map((u) => u.uid),
      roles: { [OWNER.uid]: 'owner' },
    });
    await seedDoc(`${PR}/workstreams/w1`, ws('prg1', { leadUid: LEAD.uid }));
    await seedDoc(`${PR}/workstreams/w2`, ws('prg1'));
    await seedDoc(`${PR}/workstreams/wp2`, ws('prg2'));
    await seedDoc(`${PR}/workstreams/w3`, ws('prg3'));
  });
  afterAll(cleanup);

  it('Owner sets PM, Deputy and Sub-PM -> ok', async () => {
    expect((await run(OWNER, { kind: 'pm', programId: 'prg1', fromUid: PM1.uid, toUid: MEM.uid })).status).toBe('ok');
    expect((await run(OWNER, { kind: 'deputy', programId: 'prg2', fromUid: null, toUid: LEAD.uid })).status).toBe('ok');
    const r = await run(OWNER, lead('w1', 'prg1', LEAD.uid, MEM.uid));
    expect(r.status).toBe('ok');
    expect(r.ws.version).toBe(2);
    const p = await serverDoc(PR);
    expect(p.programMeta.prg1.pmUid).toBe(MEM.uid);
    expect(p.programMeta.prg1.deputyUid).toBe(DEP1.uid);
    expect(p.programMeta.prg2.deputyUid).toBe(LEAD.uid);
    const w = await serverDoc(`${PR}/workstreams/w1`);
    expect(w.leadUid).toBe(MEM.uid);
    expect(w.version).toBe(2);
    expect(w.updatedBy).toBe(OWNER.uid);
  });

  it('Owner sets Sub-PM to a non-member with addMemberUid -> ok, the person can then read the project', async () => {
    const outDb = await as(OUT);
    await assertFails(getDoc(doc(outDb, PR)));
    const r = await run(OWNER, lead('w2', 'prg1', null, OUT.uid), OUT.uid);
    expect(r.status).toBe('ok');
    const p = await serverDoc(PR);
    expect(p.memberUids).toContain(OUT.uid);
    expect(p.memberIds).toContain(OUT.uid);
    expect(p.roles[OUT.uid]).toBe('member');
    expect(p.roles[OWNER.uid]).toBe('owner');
    await assertSucceeds(getDoc(doc(outDb, PR)));
    await assertSucceeds(getDoc(doc(outDb, `${PR}/workstreams/w2`)));
  });

  it('Owner: stale fromUid -> changed, nothing written', async () => {
    expect((await run(OWNER, { kind: 'pm', programId: 'prg1', fromUid: null, toUid: MEM.uid })).status).toBe('changed');
    expect((await run(OWNER, lead('w1', 'prg1', null, MEM.uid))).status).toBe('changed');
    expect((await serverDoc(PR)).programMeta.prg1.pmUid).toBe(PM1.uid);
    expect((await serverDoc(`${PR}/workstreams/w1`)).leadUid).toBe(LEAD.uid);
  });

  it('PM of the program sets Sub-PM -> ok; Deputy -> ok', async () => {
    expect((await run(PM1, lead('w1', 'prg1', LEAD.uid, MEM.uid))).status).toBe('ok');
    expect((await run(DEP1, lead('w2', 'prg1', null, LEAD.uid))).status).toBe('ok');
    expect((await serverDoc(`${PR}/workstreams/w1`))).toMatchObject({ leadUid: MEM.uid, version: 2, updatedBy: PM1.uid });
    expect((await serverDoc(`${PR}/workstreams/w2`))).toMatchObject({ leadUid: LEAD.uid, version: 2, updatedBy: DEP1.uid });
  });

  it('PM of p1 sets PM or Deputy of p1 -> denied', async () => {
    expect((await run(PM1, { kind: 'pm', programId: 'prg1', fromUid: PM1.uid, toUid: MEM.uid })).status).toBe('denied');
    expect((await run(PM1, { kind: 'deputy', programId: 'prg1', fromUid: DEP1.uid, toUid: MEM.uid })).status).toBe('denied');
    expect((await run(DEP1, { kind: 'deputy', programId: 'prg1', fromUid: DEP1.uid, toUid: null })).status).toBe('denied');
    const p = await serverDoc(PR);
    expect(p.programMeta.prg1).toMatchObject({ pmUid: PM1.uid, deputyUid: DEP1.uid });
  });

  it('PM of p1 sets Sub-PM of a p2 workstream -> denied', async () => {
    expect((await run(PM1, lead('wp2', 'prg2', null, MEM.uid))).status).toBe('denied');
    expect((await serverDoc(`${PR}/workstreams/wp2`)).leadUid).toBeNull();
  });

  it('PM of p1 with addMemberUid -> denied, the ws is not written either', async () => {
    expect((await run(PM1, lead('w2', 'prg1', null, OUT.uid), OUT.uid)).status).toBe('denied');
    expect((await serverDoc(`${PR}/workstreams/w2`))).toMatchObject({ leadUid: null, version: 1 });
    expect((await serverDoc(PR)).memberUids).not.toContain(OUT.uid);
  });

  it('Sub-PM sets Sub-PM of own ws -> denied; plain member -> denied', async () => {
    expect((await run(LEAD, lead('w1', 'prg1', LEAD.uid, MEM.uid))).status).toBe('denied');
    expect((await run(MEM, lead('w1', 'prg1', LEAD.uid, MEM.uid))).status).toBe('denied');
    expect((await serverDoc(`${PR}/workstreams/w1`))).toMatchObject({ leadUid: LEAD.uid, version: 1 });
  });

  it('Owner not in roles / memberIds: pm change + member add passes on the v2 branch alone', async () => {
    // No per-project owner role and not a v1 member: only the workspace-Owner v2 branch can allow it.
    const PR2 = `${WS}/projects/pr2`;
    await seedDoc(PR2, {
      name: 'No owner role', schemaVersion: 2, visibility: 'restricted',
      programMeta: { prg1: { name: 'Program 1', pmUid: PM1.uid, deputyUid: null } },
      memberUids: [PM1.uid], memberIds: [PM1.uid], roles: { [PM1.uid]: 'member' },
    });
    const r = await run(OWNER, { kind: 'pm', programId: 'prg1', fromUid: PM1.uid, toUid: OUT.uid }, OUT.uid, 'pr2');
    expect(r.status).toBe('ok');
    const p = await serverDoc(PR2);
    expect(p.programMeta.prg1.pmUid).toBe(OUT.uid);
    expect(p.memberUids).toEqual([PM1.uid, OUT.uid]);
    expect(p.memberIds).toEqual([PM1.uid, OUT.uid]);
    expect(p.roles).toEqual({ [PM1.uid]: 'member', [OUT.uid]: 'member' });
  });

  it('deactivated PM sets Sub-PM -> denied', async () => {
    expect((await run(DPM, lead('w3', 'prg3', null, MEM.uid))).status).toBe('denied');
    expect((await serverDoc(`${PR}/workstreams/w3`)).leadUid).toBeNull();
  });
});
