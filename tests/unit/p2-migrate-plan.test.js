import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDirectoryIndex } from '../../src/directory.js';
import { assembleProject } from '../../src/migrateV2.js';
import { normaliseForV2 } from '../../scripts/lib/migrate-normalise.mjs';
import { planMigration, reconcileExisting, planActivityCopy, MIGRATE_STAMP, RECORD_PATH } from '../../scripts/lib/migrate-plan.mjs';

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/v1-project.json', import.meta.url), 'utf8'));
const PID = 'proj_fx';
const dirIndex = buildDirectoryIndex([
  { email: 'alice@smartosc.com', displayName: 'Alice Nguyen', status: 'active' },
  { email: 'bob@smartosc.com', displayName: 'Bob', status: 'active' },
]);
const uidByEmail = new Map([['alice@smartosc.com', 'uid1'], ['bob@smartosc.com', 'uid2']]);
const opts = (assignments = null) => ({ pid: PID, dirIndex, uidByEmail, assignments });
const rows = (programs = [], workstreams = []) => ({ programs, workstreams });
const P = (o) => ({ Project: 'Fixture Project', 'Program id': '', Program: '', 'PM email': '', 'Deputy email': '', ...o });

describe('planMigration', () => {
  it('P-1: plain plan', () => {
    const r = planMigration(fixture(), opts());
    expect(r.blocked).toBeNull();
    expect(Object.keys(r.flip.fields).sort()).toEqual(['memberUids', 'programMeta', 'schemaVersion', 'visibility']);
    expect(r.flip.fields.visibility).toBe('restricted');
    expect(r.flip.fields.schemaVersion).toBe(2);
    expect(r.flip.fields.memberUids).toEqual(expect.arrayContaining(['uidZ', 'uid1']));
    expect(r.flip.path).toBe(`workspaces/main/projects/${PID}`);
    expect(r.writes.length).toBeGreaterThan(0);
    for (const w of r.writes) {
      expect(w.path.startsWith(`workspaces/main/projects/${PID}/`)).toBe(true);
      expect(w.data.updatedBy).toBe('p2-migrate');
      expect(w.data.version).toBe(1);
      expect(w.data.projectId).toBe(PID);
    }
    expect(Object.keys(r.record).sort()).toEqual(['docIds', 'idMap', 'written']);
    expect(r.record.idMap).toHaveLength(2);
    expect(r.record.docIds.tasks).toHaveLength(4);
    expect(r.report.docs.tasks).toBe(4);
    expect(r.report.docBytes).toBeGreaterThan(0);
    expect(RECORD_PATH(PID)).toBe('workspaces/main/migrations/proj_fx');
  });

  it('P-2: keeps an existing visibility', () => {
    const f = { ...fixture(), visibility: 'department' };
    expect(planMigration(f, opts()).flip.fields.visibility).toBe('department');
  });

  it('P-3: assignments set pmUid and memberIds; unknown email blocks', () => {
    const r = planMigration(fixture(), opts(rows([P({ 'Program id': 'pg1', 'PM email': 'alice@smartosc.com' })])));
    expect(r.blocked).toBeNull();
    expect(r.flip.fields.programMeta.pg1.pmUid).toBe('uid1');
    expect(r.flip.fields.memberIds).toContain('uid1');
    expect(r.report.assignments.programs).toHaveLength(1);
    const bad = planMigration(fixture(), opts(rows([P({ 'Program id': 'pg1', 'PM email': 'nobody@smartosc.com' })])));
    expect(bad.blocked[0].code).toBe('assignments');
    expect(bad.writes).toEqual([]);
  });

  it('P-4: blocking pre-check gives no writes', () => {
    const r = planMigration({ ...fixture(), deletedAt: 'x' }, opts());
    expect(r.blocked.length).toBeGreaterThan(0);
    expect(r.writes).toEqual([]);
  });
});

describe('reconcileExisting', () => {
  const planned = [
    { path: 'p/tasks/a', data: { version: 1, updatedBy: MIGRATE_STAMP, n: 1 } },
    { path: 'p/tasks/b', data: { version: 1, updatedBy: MIGRATE_STAMP, n: 2 } },
    { path: 'p/tasks/c', data: { version: 1, updatedBy: MIGRATE_STAMP, n: 3 } },
    { path: 'p/tasks/d', data: { version: 1, updatedBy: MIGRATE_STAMP, n: 4 } },
  ];
  it('P-5: skipped, toWrite, staleDeletes, foreign', () => {
    const existing = [
      { path: 'p/tasks/a', data: { version: 1, updatedBy: MIGRATE_STAMP, n: 1 } },
      { path: 'p/tasks/b', data: { version: 1, updatedBy: MIGRATE_STAMP, n: 99 } },
      { path: 'p/tasks/old', data: { version: 1, updatedBy: MIGRATE_STAMP } },
      { path: 'p/tasks/c', data: { version: 1, updatedBy: 'uidZ', n: 3 } },
      { path: 'p/tasks/d', data: { version: 2, updatedBy: MIGRATE_STAMP, n: 4 } },
      { path: 'p/tasks/other', data: { version: 1, updatedBy: 'uidZ' } },
    ];
    const r = reconcileExisting(planned, existing);
    expect(r.skipped).toEqual(['p/tasks/a']);
    expect(r.toWrite.map((w) => w.path)).toEqual(['p/tasks/b']);
    expect(r.staleDeletes).toEqual(['p/tasks/old']);
    expect(r.foreign.sort()).toEqual(['p/tasks/c', 'p/tasks/d', 'p/tasks/other']);
  });
  it('writes everything when nothing exists', () => {
    expect(reconcileExisting(planned, []).toWrite).toHaveLength(4);
  });
});

describe('planActivityCopy', () => {
  const now = new Date('2026-10-24T00:00:00Z');
  const E = (id, ts, extra = {}) => ({ id, timestamp: ts, author: 'alice@smartosc.com', authorName: 'Alice Nguyen', action: 'x', ...extra });
  const entries = [E('e3', '2026-10-03T00:00:00Z'), E('e2', '2026-10-02T00:00:00Z'), E('e1', '2026-10-01T00:00:00Z', { authorName: undefined })];

  it('A-1: maps entries to docs', () => {
    const docs = planActivityCopy(entries, { pid: PID, uidByEmail, now, existingIds: new Set() });
    expect(docs.map((d) => d.id)).toEqual(['e3', 'e2', 'e1']);
    expect(docs[0].data.createdAt).toEqual(new Date('2026-10-03T00:00:00Z'));
    expect(docs[0].data).toMatchObject({ author: 'Alice Nguyen', authorEmail: 'alice@smartosc.com', authorUid: 'uid1', copiedBy: 'p2-migrate', action: 'x' });
    expect(docs[2].data.author).toBe('alice@smartosc.com');
  });

  it('A-2: skips existing ids', () => {
    const docs = planActivityCopy(entries, { pid: PID, uidByEmail, now, existingIds: new Set(['e3']) });
    expect(docs.map((d) => d.id)).toEqual(['e2', 'e1']);
  });

  it('A-3: bad timestamps and duplicate ids keep order and unique ids', () => {
    const odd = [
      { id: 'e1', timestamp: 'bad', author: 'a@smartosc.com' },
      { id: 'e1', timestamp: '2026-10-01T00:00:00Z', author: 'a@smartosc.com' },
      { timestamp: null, author: 'a@smartosc.com' },
    ];
    const docs = planActivityCopy(odd, { pid: PID, uidByEmail, now, existingIds: new Set() });
    expect(docs.map((d) => d.id)).toEqual(['e1', 'legacy_1', 'legacy_0']);
    expect(new Set(docs.map((d) => d.id)).size).toBe(3);
    const sorted = [...docs].sort((a, b) => b.data.createdAt - a.data.createdAt);
    expect(sorted.map((d) => d.id)).toEqual(docs.map((d) => d.id));
    expect(docs[0].data.createdAt).toEqual(now);
  });
});

describe('plan review fixes', () => {
  it('report.members lists granted uids', () => {
    const f = fixture();
    const r = planMigration(f, opts(rows([P({ 'Program id': 'pg1', 'PM email': 'bob@smartosc.com' })])));
    expect(r.report.members.memberUidsAdded).toEqual(expect.arrayContaining(['uid1', 'uid2']));
    expect(r.report.members.memberUidsAdded).toContain('uidZ'); // v1 doc has no memberUids yet
    expect(r.report.members.memberIdsAdded).toEqual(expect.arrayContaining(['uid2']));
    expect(r.report.members.memberIdsAdded).not.toContain('uidZ');
    const plain = planMigration(fixture(), opts());
    expect(plain.report.members.memberIdsAdded).toEqual([]);
  });

  it('writes + flip assemble back to the normalised tree', () => {
    const r = planMigration(fixture(), opts());
    const meta = { ...fixture(), ...r.flip.fields };
    const pick = (kind) => r.writes.filter((w) => w.path.split('/')[4] === kind)
      .map((w) => ({ id: w.path.split('/')[5], data: w.data }));
    const back = assembleProject(meta, pick('workstreams'), pick('tasks'), pick('actions'), pick('raid'), pick('decisions'));
    const norm = normaliseForV2(fixture(), { pid: PID });
    const { visibility: _v, schemaVersion: _s, ...got } = back.project;
    void _v; void _s;
    expect(got).toEqual(norm.project);
    expect(back.orphans.tasks).toEqual([]);
  });

  it('A-4: skewed and tied timestamps are clamped to keep order', () => {
    const E = (id, ts) => ({ id, timestamp: ts, author: 'a@smartosc.com' });
    const entries = [
      E('n', '2026-10-01T00:00:00.000Z'),
      E('tie', '2026-10-01T00:00:00.000Z'),
      E('skew', '2026-10-05T00:00:00.000Z'),
      E('ok', '2026-09-01T00:00:00.000Z'),
    ];
    const docs = planActivityCopy(entries, { pid: PID, uidByEmail, now: new Date('2026-10-24T00:00:00Z'), existingIds: new Set() });
    const ts = docs.map((d) => d.data.createdAt.getTime());
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeLessThan(ts[i - 1]);
    expect(docs[1].data.createdAt.getTime()).toBe(Date.parse('2026-10-01T00:00:00.000Z') - 1);
    expect(docs[1].data.timestamp).toBe('2026-10-01T00:00:00.000Z');
    expect(docs.clamped).toBe(2);
    expect(docs[3].data.createdAt).toEqual(new Date('2026-09-01T00:00:00.000Z'));
  });
});

describe('planActivityCopy authorUid', () => {
  it('keeps an existing authorUid when the email is not in the directory', () => {
    const now = new Date('2026-10-24T00:00:00Z');
    const entries = [
      { id: 'k1', author: 'gone@smartosc.com', authorUid: 'uidKeep', timestamp: '2026-10-01T00:00:00Z' },
      { id: 'k2', author: 'a@smartosc.com', authorUid: 'uidOld', timestamp: '2026-10-02T00:00:00Z' },
      { id: 'k3', author: 'nobody@smartosc.com', timestamp: '2026-10-03T00:00:00Z' },
    ];
    const docs = planActivityCopy(entries, { uidByEmail: new Map([['a@smartosc.com', 'uidNew']]), now, existingIds: new Set() });
    const uid = Object.fromEntries(docs.map((d) => [d.id, d.data.authorUid]));
    expect(uid).toEqual({ k1: 'uidKeep', k2: 'uidNew', k3: null });
  });
});
