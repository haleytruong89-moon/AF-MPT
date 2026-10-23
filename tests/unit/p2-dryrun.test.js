import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import fixture from '../fixtures/fixture-workspace.json';
import { buildDryRun, buildAssignmentTemplate, buildReportWorkbook } from '../../scripts/p2-migrate-dryrun.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const entries = [
  { email: 'hattt4@smartosc.com', displayName: 'Hà Trương Thị Thu', aliases: [], status: 'active' },
];
const uidByEmail = new Map([['hattt4@smartosc.com', 'u1']]);
const rows = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });

describe('buildDryRun', () => {
  it('reports equal counts, round trip ok and a positive size', () => {
    const r = buildDryRun(fixture, entries, uidByEmail);
    expect(r.ok).toBe(true);
    const p = r.perProject[0];
    expect(p.before).toEqual(p.after);
    expect(p.roundTripOk).toBe(true);
    expect(p.orphans).toEqual({ workstreams: 0, tasks: 0, actions: 0, raid: 0, missingRaid: 0 });
    expect(p.after.raid).toBe(p.before.raid);
    expect(p.sizeKb).toBeGreaterThan(0);
    expect(p.maxTaskDocKb).toBeGreaterThan(0);
    expect(p.unresolved.length).toBeGreaterThan(0);
  });
  it('flags a broken assemble (orphans) as not ok', () => {
    const r = buildDryRun(fixture, entries, uidByEmail, {
      assemble: (meta, ws, tasks, actions) => ({
        project: undefined,
        orphans: { workstreams: [], tasks: ['x'], actions: [] },
      }),
    });
    expect(r.perProject[0].roundTripOk).toBe(false);
    expect(r.ok).toBe(false);
  });
  it('flags a project that no longer deep-equals', () => {
    const r = buildDryRun(fixture, entries, uidByEmail, {
      assemble: (m, w, t, a) => {
        const out = clone(fixture.projects.p1);
        out.name = 'changed';
        return { project: out, orphans: { workstreams: [], tasks: [], actions: [] } };
      },
    });
    expect(r.ok).toBe(false);
  });
  it('a missing raid doc or an orphan raid doc fails the round trip', () => {
    const r = buildDryRun(fixture, entries, uidByEmail, {
      assemble: (m, w, t, a, raid) => ({
        project: clone(fixture.projects.p1),
        orphans: { workstreams: [], tasks: [], actions: [], raid: [], missingRaid: ['pg1'] },
      }),
    });
    expect(r.ok).toBe(false);
  });
  it('Summary has a RAID docs column', () => {
    const wb = buildReportWorkbook(buildDryRun(fixture, entries, uidByEmail));
    expect(rows(wb, 'Summary')[0]['RAID docs']).toMatch(/^[0-9]+ → [0-9]+$/);
  });
  it('rejects input that is not a backup', () => {
    expect(() => buildDryRun({}, [], new Map())).toThrow(/backup/);
  });
});

describe('buildReportWorkbook', () => {
  it('has Summary, Unresolved, Duplicates sheets', () => {
    const wb = buildReportWorkbook(buildDryRun(fixture, entries, uidByEmail));
    expect(wb.SheetNames).toEqual(['Summary', 'Unresolved', 'Duplicates']);
    expect(rows(wb, 'Summary')[0]['Round trip OK']).toBe('yes');
  });
});

describe('buildAssignmentTemplate', () => {
  const backup = {
    meta: {},
    projects: {
      a: {
        name: 'Proj A',
        programs: [
          { id: 'g1', name: 'G1', workstreams: [
            { id: 'w1', name: 'W1', tasks: [
              { id: 't1', start: '2026-03-01', end: '2026-04-10' },
              { id: 't2', start: '2026-02-01', end: '2026-03-15' },
              { id: 't3', start: null, end: null },
            ] },
            { id: 'w2', name: 'W2', tasks: [{ id: 't4', start: null, end: null }] },
            { id: 'w3', name: 'W3' },
          ] },
          { id: 'g2', name: 'G2', workstreams: [] },
        ],
      },
    },
  };
  it('has the sheets, ordered rows and prefilled min/max dates', () => {
    const wb = buildAssignmentTemplate(backup);
    expect(wb.SheetNames).toEqual(['Programs', 'Workstreams', 'Instructions']);
    expect(rows(wb, 'Programs').map((r) => r['Program id'])).toEqual(['g1', 'g2']);
    expect(Object.keys(rows(wb, 'Programs')[0])).toEqual(['Project', 'Program id', 'Program', 'PM email', 'Deputy email']);
    const w = rows(wb, 'Workstreams');
    expect(Object.keys(w[0])).toEqual(['Project', 'Workstream id', 'Program', 'Workstream', 'Sub-PM email', 'Start', 'End']);
    expect(w[0].Start).toBe('2026-02-01');
    expect(w[0].End).toBe('2026-04-10');
    expect(w[1].Start).toBe('');
    expect(w[2].End).toBe('');
  });
});
