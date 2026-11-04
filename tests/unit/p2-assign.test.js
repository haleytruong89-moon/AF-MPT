import { describe, it, expect } from 'vitest';
import {
  decideAssign, formatAssignPreview, decideAssignRollback, formatRollbackPreview, liveTemplateRows,
  parseArgs, fingerprintOf, verifyAssign,
} from '../../scripts/p2-assign.mjs';
import { directoryFrom } from '../../scripts/p2-pilot-copy.mjs';

// Pure parts of scripts/p2-assign.mjs (the I/O is covered by tests/rules/p2-assign-apply.test.js).
const PID = 'proj_v2';
const members = [
  { id: 'u_hod', data: { email: 'hattt4@smartosc.com', displayName: 'Ha Truong', status: 'active' } },
  { id: 'uid1', data: { email: 'alice@smartosc.com', displayName: 'Alice Nguyen', status: 'active' } },
  { id: 'uid2', data: { email: 'bob@smartosc.com', displayName: 'Bob Tran', status: 'active' } },
  { id: 'uid3', data: { email: 'nam.a@smartosc.com', displayName: 'Nam A', aliases: ['Nam'], status: 'active' } },
  { id: 'uid4', data: { email: 'nam.b@smartosc.com', displayName: 'Nam B', aliases: ['Nam'], status: 'active' } },
  { id: 'uidOld', data: { email: 'old@smartosc.com', displayName: 'Old Person', status: 'deactivated' } },
];
const invites = [{ id: 'carol@smartosc.com', data: { email: 'carol@smartosc.com', displayName: 'Carol' } }];
const dir = { ...directoryFrom(members, invites), members };

const baseState = () => ({
  doc: {
    name: 'Ops 2026',
    schemaVersion: 2,
    visibility: 'restricted',
    memberUids: ['u_hod'],
    memberIds: ['u_hod'],
    programMeta: {
      prgA: { name: 'Finance', order: 0 },
      prgB: { name: 'Tax', order: 1, pmUid: 'uid2' },
    },
  },
  workstreams: [
    { id: 'wsA1', data: { name: 'Close', programId: 'prgA', version: 3, start: '2026-01-01', end: '2026-12-31' } },
    { id: 'wsB1', data: { name: 'VAT', programId: 'prgB', version: 1, leadUid: 'uid2' } },
    { id: 'wsX', data: { name: 'Orphan', programId: 'prgGone', version: 1 } },
  ],
  tasks: [{ id: 't1', data: { picUid: 'uidZ', programId: 'prgA', workstreamId: 'wsA1' } }],
  actions: [{ id: 'a1', data: { picUid: 'uid1' } }],
});
const rows = (programs = [], workstreams = []) => ({ programs, workstreams });
const prog = (o) => ({ Project: '', 'Program id': '', Program: '', 'PM email': '', 'Deputy email': '', ...o });
const ws = (o) => ({ Project: '', 'Workstream id': '', Program: '', Workstream: '', 'Sub-PM email': '', Start: '', End: '', ...o });
const decide = (assignments, state = baseState()) => decideAssign({ pid: PID, state, dir, assignments });

describe('p2-assign decideAssign', () => {
  it('plans PM / Deputy / Sub-PM / dates, grants assigned + PIC uids, and hashes', () => {
    const p = decide(rows(
      [prog({ 'Program id': 'prgA', 'PM email': 'alice@smartosc.com', 'Deputy email': 'bob@smartosc.com' })],
      [ws({ 'Workstream id': 'wsA1', 'Sub-PM email': 'bob@smartosc.com', End: '2026-11-30' })],
    ));
    expect(p.blocked).toEqual([]);
    expect(p.errors).toEqual([]);
    expect(p.noop).toBe(false);
    expect(p.changes.programs).toEqual([{
      id: 'prgA', name: 'Finance',
      fields: [
        { key: 'pmUid', had: false, before: null, after: 'uid1' },
        { key: 'deputyUid', had: false, before: null, after: 'uid2' },
      ],
    }]);
    expect(p.changes.workstreams).toEqual([{
      id: 'wsA1', name: 'Close', programId: 'prgA', version: 3,
      fields: [{ key: 'leadUid', had: false, before: null, after: 'uid2' }, { key: 'end', had: true, before: '2026-12-31', after: '2026-11-30' }],
    }]);
    // Ruling G: assigned uids + every task / action picUid.
    expect(p.grants.union).toEqual(['uid1', 'uid2', 'uidZ']);
    expect(p.grants.memberUidsAdded).toEqual(['uid1', 'uid2', 'uidZ']);
    expect(p.grants.memberIdsAdded).toEqual(['uid1', 'uid2', 'uidZ']);
    expect(p.planHash).toMatch(/^[0-9a-f]{16}$/);
    expect(p.fingerprint.ws).toEqual({ wsA1: 3 });
  });

  it('blank cells keep values; same value = noop (no change, no grants needed beyond existing)', () => {
    const s = baseState();
    s.doc.memberUids = ['u_hod', 'uid1', 'uid2', 'uidZ'];
    s.doc.memberIds = ['u_hod', 'uid1', 'uid2', 'uidZ'];
    const p = decide(rows([prog({ 'Program id': 'prgB', 'PM email': 'bob@smartosc.com' })], [ws({ 'Workstream id': 'wsB1' })]), s);
    expect(p.errors).toEqual([]);
    expect(p.changes).toEqual({ programs: [], workstreams: [] });
    expect(p.grants.memberUidsAdded).toEqual([]);
    expect(p.noop).toBe(true);
  });

  it('all-or-nothing: every bad row is listed, nothing planned', () => {
    const p = decide(rows(
      [
        prog({ 'Program id': 'prgA', 'PM email': 'nobody@smartosc.com' }),
        prog({ 'Program id': 'prgB', 'PM email': 'carol@smartosc.com' }),
        prog({ 'Program id': 'prgZZ', 'PM email': 'alice@smartosc.com' }),
      ],
      [
        ws({ 'Workstream id': 'wsB1', 'Sub-PM email': 'Nam' }),
        ws({ 'Workstream id': 'wsNope', 'Sub-PM email': 'alice@smartosc.com' }),
        ws({ 'Workstream id': 'wsA1', Start: '2026/01/01' }),
        ws({ 'Workstream id': 'wsX', 'Sub-PM email': 'alice@smartosc.com' }),
      ],
    ));
    expect(p.errors.join('\n')).toMatch(/nobody@smartosc.com" is not in the People directory/);
    expect(p.errors.join('\n')).toMatch(/carol@smartosc.com.*only invited/);
    expect(p.errors.join('\n')).toMatch(/prgZZ/);
    expect(p.errors.join('\n')).toMatch(/"Nam" is ambiguous/);
    expect(p.errors.join('\n')).toMatch(/wsNope/);
    expect(p.errors.join('\n')).toMatch(/2026\/01\/01" is not yyyy-mm-dd/);
    expect(p.errors.join('\n')).toMatch(/wsX.*prgGone.*not in programMeta/);
    expect(p.errors).toHaveLength(7);
    expect(p.changes).toEqual({ programs: [], workstreams: [] });
    expect(p.planHash).toBeNull();
  });

  it('blocks: not found, not v2, deleted, no programMeta', () => {
    const a = rows([prog({ 'Program id': 'prgA', 'PM email': 'alice@smartosc.com' })]);
    expect(decide(a, { ...baseState(), doc: null }).blocked[0].code).toBe('not-found');
    const s1 = baseState(); s1.doc.schemaVersion = 1;
    expect(decide(a, s1).blocked[0].code).toBe('not-v2');
    const s2 = baseState(); s2.doc.deletedAt = '2026-10-01';
    expect(decide(a, s2).blocked[0].code).toBe('deleted');
    const s3 = baseState(); s3.doc.programMeta = {};
    expect(decide(a, s3).blocked[0].code).toBe('no-programMeta');
    expect(decide(a, s3).planHash).toBeNull();
  });

  it('warns when an assigned person is not an active member (the role would not take effect)', () => {
    const p = decide(rows([prog({ 'Program id': 'prgA', 'PM email': 'old@smartosc.com' })]));
    expect(p.errors).toEqual([]);
    expect(p.warnings.join('\n')).toMatch(/uidOld.*deactivated/);
  });

  it('hash covers the live fingerprint and the planned changes', () => {
    const a = rows([prog({ 'Program id': 'prgA', 'PM email': 'alice@smartosc.com' })], [ws({ 'Workstream id': 'wsA1', 'Sub-PM email': 'bob@smartosc.com' })]);
    const h = decide(a).planHash;
    expect(decide(a).planHash).toBe(h);
    const s = baseState(); s.workstreams[0].data.version = 4;
    expect(decide(a, s).planHash).not.toBe(h);
    const s2 = baseState(); s2.doc.memberIds = ['u_hod', 'x'];
    expect(decide(a, s2).planHash).not.toBe(h);
    const s3 = baseState(); s3.doc.visibility = 'department';
    expect(decide(a, s3).planHash).not.toBe(h);
    expect(decide(rows([prog({ 'Program id': 'prgA', 'PM email': 'bob@smartosc.com' })], [ws({ 'Workstream id': 'wsA1', 'Sub-PM email': 'bob@smartosc.com' })])).planHash).not.toBe(h);
    // An unaffected workstream's version is not part of the fingerprint.
    const s4 = baseState(); s4.workstreams[1].data.version = 9;
    expect(decide(a, s4).planHash).toBe(h);
  });

  it('fingerprintOf reads programMeta / memberUids / memberIds / visibility + affected ws versions', () => {
    const s = baseState();
    expect(fingerprintOf(s.doc, s.workstreams.map((w) => ({ id: w.id, data: w.data })), ['wsB1'])).toEqual({
      programMeta: s.doc.programMeta, memberUids: ['u_hod'], memberIds: ['u_hod'], visibility: 'restricted', ws: { wsB1: 1 },
    });
  });
});

describe('p2-assign preview', () => {
  it('prints old -> new per program and workstream, access grants and the plan hash', () => {
    const p = decide(rows(
      [prog({ 'Program id': 'prgA', 'PM email': 'alice@smartosc.com' })],
      [ws({ 'Workstream id': 'wsA1', 'Sub-PM email': 'bob@smartosc.com' })],
    ));
    const nameOfUid = (u) => `name(${u})`;
    const text = formatAssignPreview(p, { pid: PID, nameOfUid }).join('\n');
    expect(text).toMatch(/program prgA \(Finance\): PM - -> Alice Nguyen, Deputy - \(unchanged\)/);
    expect(text).toMatch(/workstream wsA1 \(Finance \/ Close\): Sub-PM - -> Bob Tran/);
    expect(text).toMatch(/memberUids \+ name\(uidZ\)/);
    expect(text).toMatch(/memberIds  \+ name\(uid1\)/);
    expect(text).toMatch(new RegExp(`Plan hash: +${p.planHash}`));
  });

  it('shows blocking / invalid rows and no hash', () => {
    const p = decide(rows([prog({ 'Program id': 'prgZZ', 'PM email': 'alice@smartosc.com' })]));
    const text = formatAssignPreview(p, { pid: PID }).join('\n');
    expect(text).toMatch(/INVALID ROWS/);
    expect(text).toMatch(/nothing will be written/i);
    expect(text).not.toMatch(/Plan hash/);
  });

  it('noop preview says nothing to change', () => {
    const s = baseState();
    s.doc.memberUids = ['u_hod', 'uid1', 'uid2', 'uidZ'];
    s.doc.memberIds = [...s.doc.memberUids];
    const p = decide(rows([prog({ 'Program id': 'prgB', 'PM email': 'bob@smartosc.com' })]), s);
    expect(formatAssignPreview(p, { pid: PID }).join('\n')).toMatch(/Nothing to change/);
  });
});

describe('p2-assign verify', () => {
  it('ok when the live docs hold the planned values; lists mismatches otherwise', () => {
    const p = decide(rows([prog({ 'Program id': 'prgA', 'PM email': 'alice@smartosc.com' })], [ws({ 'Workstream id': 'wsA1', 'Sub-PM email': 'bob@smartosc.com' })]));
    const s = baseState();
    s.doc.programMeta.prgA.pmUid = 'uid1';
    s.doc.memberUids = ['u_hod', 'uid1', 'uid2', 'uidZ'];
    s.doc.memberIds = [...s.doc.memberUids];
    s.workstreams[0].data = { ...s.workstreams[0].data, leadUid: 'uid2', version: 4 };
    expect(verifyAssign(p, s)).toEqual({ ok: true, mismatches: [] });
    s.workstreams[0].data.version = 3;
    s.doc.memberIds = ['u_hod'];
    const v = verifyAssign(p, s);
    expect(v.ok).toBe(false);
    expect(v.mismatches.join('\n')).toMatch(/wsA1 version/);
    expect(v.mismatches.join('\n')).toMatch(/memberIds missing uid1/);
  });
});

describe('p2-assign rollback (pure)', () => {
  const manifestFrom = (p) => ({
    kind: 'p2-assign', pid: PID, planHash: p.planHash,
    programs: p.changes.programs, workstreams: p.changes.workstreams, grants: p.grants,
  });
  const applied = () => {
    const s = baseState();
    s.doc.programMeta.prgA = { ...s.doc.programMeta.prgA, pmUid: 'uid1' };
    s.workstreams[0].data = { ...s.workstreams[0].data, leadUid: 'uid2', end: '2026-11-30', version: 4 };
    return s;
  };
  const p = decide(rows([prog({ 'Program id': 'prgA', 'PM email': 'alice@smartosc.com' })], [ws({ 'Workstream id': 'wsA1', 'Sub-PM email': 'bob@smartosc.com', End: '2026-11-30' })]));

  it('restores before-values (absent -> delete), keeps grants, hashes', () => {
    const r = decideAssignRollback({ manifest: manifestFrom(p), state: applied() });
    expect(r.blocked).toEqual([]);
    expect(r.restores.programs).toEqual([{ id: 'prgA', fields: [{ key: 'pmUid', had: false, before: null, now: 'uid1' }] }]);
    expect(r.restores.workstreams).toEqual([{
      id: 'wsA1', version: 4,
      fields: [{ key: 'leadUid', had: false, before: null, now: 'uid2' }, { key: 'end', had: true, before: '2026-12-31', now: '2026-11-30' }],
    }]);
    expect(r.skipped).toEqual([]);
    expect(r.hash).toMatch(/^[0-9a-f]{16}$/);
    const text = formatRollbackPreview(r, { pid: PID }).join('\n');
    expect(text).toMatch(/grants are not revoked/);
    expect(text).toMatch(/pmUid uid1 -> \(absent\)/);
    expect(text).toMatch(new RegExp(`Plan hash: +${r.hash}`));
  });

  it('skips a field changed since the apply (never clobbers a later edit)', () => {
    const s = applied();
    s.doc.programMeta.prgA.pmUid = 'uid3';
    const r = decideAssignRollback({ manifest: manifestFrom(p), state: s });
    expect(r.restores.programs).toEqual([]);
    expect(r.skipped).toEqual([{ where: 'program prgA', key: 'pmUid', expected: 'uid1', now: 'uid3' }]);
    expect(formatRollbackPreview(r, { pid: PID }).join('\n')).toMatch(/SKIP program prgA pmUid/);
  });

  it('blocks a wrong manifest kind / pid, a non-v2 or deleted project', () => {
    expect(decideAssignRollback({ manifest: { ...manifestFrom(p), kind: 'p2-migrate' }, state: applied() }).blocked[0].code).toBe('bad-manifest');
    const s = applied(); s.doc.schemaVersion = 1;
    expect(decideAssignRollback({ manifest: manifestFrom(p), state: s }).blocked[0].code).toBe('not-v2');
    expect(decideAssignRollback({ manifest: manifestFrom(p), state: { ...applied(), doc: null } }).blocked[0].code).toBe('not-found');
  });

  it('nothing left to restore = noop', () => {
    const r = decideAssignRollback({ manifest: manifestFrom(p), state: baseState() });
    expect(r.noop).toBe(true);
  });
});

describe('p2-assign template from the live project', () => {
  it('lists every program in programMeta and every workstream with current people and dates', () => {
    const emailOfUid = (u) => ({ uid2: 'bob@smartosc.com' }[u] || '');
    const t = liveTemplateRows(baseState(), { emailOfUid });
    expect(t.programs).toEqual([
      { Project: 'Ops 2026', 'Program id': 'prgA', Program: 'Finance', 'PM email': '', 'Deputy email': '' },
      { Project: 'Ops 2026', 'Program id': 'prgB', Program: 'Tax', 'PM email': 'bob@smartosc.com', 'Deputy email': '' },
    ]);
    expect(t.workstreams[0]).toEqual({ Project: 'Ops 2026', 'Workstream id': 'wsA1', Program: 'Finance', Workstream: 'Close', 'Sub-PM email': '', Start: '2026-01-01', End: '2026-12-31' });
    expect(t.workstreams[1]['Sub-PM email']).toBe('bob@smartosc.com');
    expect(t.workstreams).toHaveLength(3);
  });
});

describe('p2-assign parseArgs', () => {
  it('preview / apply / template / rollback', () => {
    expect(parseArgs(['p1', '--assignments', 'a.xlsx'])).toMatchObject({ pid: 'p1', assignments: 'a.xlsx', apply: false, error: null });
    expect(parseArgs(['p1', '--assignments', 'a.xlsx', '--apply']).error).toMatch(/--expect/);
    expect(parseArgs(['p1', '--assignments', 'a.xlsx', '--apply', '--expect', 'abc']).error).toMatch(/16-hex/);
    expect(parseArgs(['p1', '--assignments', 'a.xlsx', '--apply', '--expect', '0123456789abcdef']).error).toBeNull();
    expect(parseArgs(['p1']).error).toMatch(/--assignments/);
    expect(parseArgs(['p1', '--template', 't.xlsx']).error).toBeNull();
    expect(parseArgs(['p1', '--template', 't.xlsx', '--apply']).error).toMatch(/read-only/);
    expect(parseArgs(['a/b', '--assignments', 'a.xlsx']).error).toMatch(/project id/);
    expect(parseArgs(['--rollback', 'm.json'])).toMatchObject({ rollback: 'm.json', error: null });
    expect(parseArgs(['--rollback', 'm.json', 'p1']).error).toMatch(/--rollback/);
    expect(parseArgs(['p1', '--assignments', 'a.xlsx', '--bogus']).error).toMatch(/Unknown/);
    expect(parseArgs(['p1', '--assignments', 'a.xlsx']).key).toBe('service-account.json');
  });
});
