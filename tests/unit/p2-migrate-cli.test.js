import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decideMigration, formatMigrationPreview, previewSheets, parseArgs } from '../../scripts/p2-migrate.mjs';
import { directoryFrom } from '../../scripts/p2-pilot-copy.mjs';

// Pure parts of scripts/p2-migrate.mjs (the I/O is covered by tests/rules/p2-migrate-apply.test.js).
const fixture = JSON.parse(readFileSync(new URL('../fixtures/v1-project.json', import.meta.url), 'utf8'));
const PID = 'proj_fx';
const doc = { ...fixture, memberIds: ['uidZ'], roles: { uidZ: 'owner' }, rev: 9, writeId: 'w9', visibility: 'department' };
const dir = directoryFrom([
  { id: 'u_hod', data: { email: 'hattt4@smartosc.com', displayName: 'Ha Truong', status: 'active' } },
  { id: 'uid1', data: { email: 'alice@smartosc.com', displayName: 'Alice Nguyen', status: 'active' } },
], []);
const entries = [
  { id: 'e2', author: 'alice@smartosc.com', timestamp: '2026-10-02T00:00:00Z' },
  { id: 'e1', author: 'alice@smartosc.com', timestamp: '2026-10-01T00:00:00Z' },
];
const now = new Date('2026-10-24T00:00:00Z');
const decide = (over = {}) => decideMigration({ pid: PID, doc, record: null, existing: [], v1Entries: entries, dir, now, ...over });

describe('p2-migrate pure core', () => {
  it('fresh: plan, record with before-image, planned counts, activity', () => {
    const p = decide();
    expect(p.mode).toBe('fresh');
    expect(p.v1Rev).toBe(9);
    expect(p.record).toMatchObject({ pid: PID, status: 'prepared', v1Rev: 9, v1WriteId: 'w9', before: { visibility: 'department' } });
    expect(p.record.idMap).toHaveLength(2);
    expect(p.record.history).toEqual([{ status: 'prepared', at: now }]);
    expect(p.plan.flip.fields.visibility).toBe('department');
    expect(p.planned.ok).toBe(true);
    expect(p.activity).toHaveLength(2);
    expect(p.reconcile.toWrite).toHaveLength(p.plan.writes.length);
  });

  it('keeps the first before-image on a re-run, recaptures after a rollback', () => {
    const prev = { status: 'prepared', before: { visibility: 'restricted' }, history: [{ status: 'prepared', at: 'x' }] };
    expect(decide({ record: prev }).record.before).toEqual({ visibility: 'restricted' });
    expect(decide({ record: prev }).record.history.map((h) => h.status)).toEqual(['prepared', 'prepared']);
    expect(decide({ record: { ...prev, status: 'rolled-back' } }).record.before).toEqual({ visibility: 'department' });
  });

  it('post-flip only with a switched / verified record; otherwise v2 is blocked', () => {
    const v2 = { ...doc, schemaVersion: 2 };
    const p = decide({ doc: v2, record: { status: 'verified', v1Rev: 9, v1WriteId: 'w9' }, v2ActivityIds: new Set(['e1']) });
    expect(p.mode).toBe('post-flip');
    expect(p.activity.map((a) => a.id)).toEqual(['e2']);
    expect(decide({ doc: v2 }).blocked[0].code).toBe('v2-not-migrated-here');
    expect(decide({ doc: v2, record: { status: 'prepared' } }).mode).toBe('blocked');
    expect(decide({ doc: null }).blocked[0].code).toBe('not-found');
  });

  it('blocked pre-check keeps the plan for the report', () => {
    const p = decide({ doc: { ...doc, programs: [{ id: 'p', raid: {} }] } });
    expect(p.mode).toBe('blocked');
    expect(p.blocked.map((b) => b.code)).toContain('raid-not-array');
  });

  it('preview shows counts, issues, id map, reconcile, grants with names, activity', () => {
    const p = decide();
    const lines = formatMigrationPreview(p, { pid: PID, nameOfUid: (u) => `name:${u}` }).join('\n');
    expect(lines).toMatch(/Mode: +fresh/);
    expect(lines).toMatch(/tasks +v1 4 -> v2 4/);
    expect(lines).toMatch(/Id map: +2 generated/);
    expect(lines).toMatch(/Reconcile: +write \d+, skip 0, delete stale 0, foreign 0/);
    expect(lines).toMatch(/memberUids \+ name:uid1/);
    expect(lines).toMatch(/Activity: +2 entries to copy \(of 2\), clamped 0/);
    const sheets = previewSheets(p, { pid: PID });
    expect(Object.keys(sheets)).toEqual(['Summary', 'Checks', 'Id map', 'Assignments']);
    expect(sheets['Id map']).toHaveLength(2);
  });

  it('CLI args: --apply needs an assignments choice (Ruling P4-9)', () => {
    expect(parseArgs(['p1', '--apply']).error).toMatch(/--no-assignments/);
    expect(parseArgs(['p1', '--apply', '--no-assignments']).error).toBeNull();
    expect(parseArgs(['p1', '--apply', '--assignments', 'a.xlsx']).error).toBeNull();
    expect(parseArgs(['p1', '--assignments', 'a.xlsx', '--no-assignments']).error).toMatch(/either/);
    expect(parseArgs(['p1']).error).toBeNull();
    expect(parseArgs([]).error).toMatch(/project id/);
    expect(parseArgs(['p1', '--bogus']).error).toMatch(/Unknown/);
  });
});
