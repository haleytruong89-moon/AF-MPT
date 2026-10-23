import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import fixture from '../fixtures/v1-project.json';
import { buildDirectoryIndex } from '../../src/directory.js';
import { planPilotCopy, defaultNewPid } from '../../scripts/p2-pilot-copy.mjs';
import { buildAssignmentTemplate } from '../../scripts/p2-migrate-dryrun.mjs';
import { parseAssignmentsWorkbook, formatPreview, applyAssignments } from '../../scripts/lib/assignments.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const dirIndex = buildDirectoryIndex([
  { email: 'alice@smartosc.com', displayName: 'Alice Nguyen', status: 'active' },
  { email: 'bob@smartosc.com', displayName: 'Bob', status: 'active' },
  { email: 'dan@smartosc.com', displayName: 'Dan Le', aliases: ['Danny'], status: 'active' },
  { email: 'eve@smartosc.com', displayName: 'Eve Invited', status: 'invited' }, // invite only: no uid
]);
const uidByEmail = new Map([
  ['alice@smartosc.com', 'uid1'], ['bob@smartosc.com', 'uid2'], ['dan@smartosc.com', 'uid3'],
]);
const SRC = 'proj_fx';
const NEW = defaultNewPid(SRC);
const HOD = 'u_hod';
const plan = (assignments) =>
  planPilotCopy(clone(fixture), { sourcePid: SRC, newPid: NEW, ownerUid: HOD, dirIndex, uidByEmail, assignments });
const doc = (writes, path) => writes.find((w) => w.path === `workspaces/main/projects/${NEW}${path}`)?.data;
const rows = (programs = [], workstreams = []) => ({ programs, workstreams });
const P = (o) => ({ Project: 'Fixture Project', 'Program id': '', Program: '', 'PM email': '', 'Deputy email': '', ...o });
const W = (o) => ({ Project: 'Fixture Project', 'Workstream id': '', Program: '', Workstream: '', 'Sub-PM email': '', Start: '', End: '', ...o });

describe('pilot copy assignments', () => {
  it('sets pmUid / deputyUid, leadUid / start / end and adds uids to memberUids and memberIds', () => {
    const { writes, report } = plan(rows(
      [P({ 'Program id': 'pg1', 'PM email': 'Alice@SmartOSC.com', 'Deputy email': 'dan@smartosc.com' })],
      [W({ 'Workstream id': 'w1', 'Sub-PM email': 'bob@smartosc.com', Start: '2026-01-01', End: '2026-06-30' })],
    ));
    const meta = doc(writes, '');
    expect(meta.programMeta.pg1).toMatchObject({ pmUid: 'uid1', deputyUid: 'uid3', name: 'Program One' });
    expect(meta.programMeta.pg2.pmUid).toBeNull();
    expect(doc(writes, '/workstreams/w1')).toMatchObject({ leadUid: 'uid2', start: '2026-01-01', end: '2026-06-30' });
    expect(doc(writes, '/workstreams/w2').leadUid).toBeNull();
    expect(meta.memberUids).toEqual(expect.arrayContaining([HOD, 'uid1', 'uid2', 'uid3']));
    expect(meta.memberIds).toEqual(expect.arrayContaining([HOD, 'uid1', 'uid2', 'uid3']));
    expect(new Set(meta.memberIds).size).toBe(meta.memberIds.length);
    expect(report.assignments.programs[0].fields).toEqual([
      { label: 'PM', old: null, new: 'Alice Nguyen' },
      { label: 'Deputy', old: null, new: 'Dan Le' },
    ]);
    expect(formatPreview(report.assignments)).toEqual([
      'program pg1 (Program One): PM - -> Alice Nguyen, Deputy - -> Dan Le',
      'workstream w1 (Program One / WS One): Sub-PM - -> Bob, Start - -> 2026-01-01, End - -> 2026-06-30',
    ]);
  });

  it('adds every task / action picUid to the member arrays (Ruling G)', () => {
    const { writes } = plan(rows([P({ 'Program id': 'pg2', 'PM email': 'dan@smartosc.com' })]));
    const meta = doc(writes, '');
    for (const w of writes) {
      const uid = w.data.picUid;
      if (uid) { expect(meta.memberUids).toContain(uid); expect(meta.memberIds).toContain(uid); }
    }
    expect(meta.memberUids).toContain('uid1');
    expect(meta.memberIds).toContain('uid2');
  });

  it('resolves an alias and matches by name when the id is blank; blank cells leave data unchanged', () => {
    const { writes } = plan(rows(
      [P({ Program: 'program one', 'PM email': 'Danny' })],
      [W({ Workstream: 'WS Two', Program: 'Program One', 'Sub-PM email': 'alice@smartosc.com' }), W({ 'Workstream id': 'w1', Start: '2026-02-02' })],
    ));
    expect(doc(writes, '').programMeta.pg1.pmUid).toBe('uid3');
    expect(doc(writes, '/workstreams/w3').leadUid).toBe('uid1');
    const w1 = doc(writes, '/workstreams/w1');
    expect(w1).toMatchObject({ leadUid: null, start: '2026-02-02', end: null });
  });

  it('no assignments: behaviour is unchanged (HOD-only ACL)', () => {
    const meta = doc(plan(null).writes, '');
    expect(meta.memberIds).toEqual([HOD]);
    expect(meta.memberUids).toEqual([HOD]);
  });

  it('unknown email and invite-only email are errors listing every bad row; nothing is returned', () => {
    let msg = '';
    try {
      plan(rows(
        [P({ 'Program id': 'pg1', 'PM email': 'nobody@smartosc.com' })],
        [W({ 'Workstream id': 'w1', 'Sub-PM email': 'eve@smartosc.com' })],
      ));
    } catch (e) { msg = e.message; }
    expect(msg).toMatch(/nothing written/);
    expect(msg).toMatch(/Programs row 2: PM "nobody@smartosc.com" is not in the People directory/);
    expect(msg).toMatch(/Workstreams row 2: Sub-PM .*only invited/);
  });

  it('errors on an unknown program / workstream id, a bad date, a duplicate row, and a file with no rows for the project', () => {
    const bad = (r) => { try { plan(r); return ''; } catch (e) { return e.message; } };
    expect(bad(rows([P({ 'Program id': 'zz', 'PM email': 'alice@smartosc.com' })]))).toMatch(/program id "zz" does not exist/);
    expect(bad(rows([], [W({ 'Workstream id': 'zz', 'Sub-PM email': 'alice@smartosc.com' })]))).toMatch(/workstream id "zz" does not exist/);
    expect(bad(rows([], [W({ 'Workstream id': 'w1', Start: '01/02/2026' })]))).toMatch(/not yyyy-mm-dd/);
    expect(bad(rows([P({ 'Program id': 'pg1', 'PM email': 'alice@smartosc.com' }), P({ 'Program id': 'pg1', 'PM email': 'bob@smartosc.com' })]))).toMatch(/assigned twice/);
    expect(bad(rows([P({ Project: 'Other', 'Program id': 'pg1', 'PM email': 'alice@smartosc.com' })]))).toMatch(/No rows for project/);
  });

  it('reads the template written by the dry-run, so column names stay in sync', () => {
    const backup = { meta: {}, projects: { px: clone(fixture) }, activity: [] };
    const wb = buildAssignmentTemplate(backup);
    wb.Sheets.Programs.D2 = { t: 's', v: 'alice@smartosc.com' };
    wb.Sheets.Workstreams.E2 = { t: 's', v: 'bob@smartosc.com' };
    const parsed = parseAssignmentsWorkbook(XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })));
    const { writes } = plan(parsed);
    expect(doc(writes, '').programMeta.pg1.pmUid).toBe('uid1');
    expect(doc(writes, '/workstreams/w1').leadUid).toBe('uid2');
    // Template prefilled Start/End from tasks (w1: 2026-01-01..2026-01-31).
    expect(doc(writes, '/workstreams/w1')).toMatchObject({ start: '2026-01-01', end: '2026-01-31' });
  });

  it('preview shows old -> new where a value changes and (unchanged) where it does not', () => {
    const base = plan(null).writes.map((w) => (w.path.endsWith('/workstreams/w1')
      ? { ...w, data: { ...w.data, start: '2026-01-01', end: '2026-03-31', leadUid: 'uid1' } } : w));
    const dir = { dirIndex, uidByEmail };
    const r = applyAssignments(base, rows([], [
      W({ 'Workstream id': 'w1', 'Sub-PM email': 'bob@smartosc.com', Start: '2026-02-01', End: '2026-03-31' }),
    ]), dir, { projectNames: ['Fixture Project'] });
    expect(r.errors).toEqual([]);
    expect(formatPreview(r.preview)).toEqual([
      'workstream w1 (Program One / WS One): Sub-PM Alice Nguyen -> Bob, Start 2026-01-01 -> 2026-02-01, End 2026-03-31 (unchanged)',
    ]);
  });

  it('reports an ambiguous alias as ambiguous, not as unknown', () => {
    const idx = buildDirectoryIndex([
      { email: 'sam1@smartosc.com', displayName: 'Sam One', aliases: ['Sam'], status: 'active' },
      { email: 'sam2@smartosc.com', displayName: 'Sam Two', aliases: ['Sam'], status: 'active' },
    ]);
    const dir = { dirIndex: idx, uidByEmail: new Map([['sam1@smartosc.com', 's1'], ['sam2@smartosc.com', 's2']]) };
    const r = applyAssignments(plan(null).writes, rows([P({ 'Program id': 'pg1', 'PM email': 'Sam' })]), dir, { projectNames: ['Fixture Project'] });
    expect(r.errors).toEqual(['Programs row 2: PM "Sam" is ambiguous: matches more than one person']);
  });

  it('accepts an Excel serial date and rejects a non-ISO string like 2026-1-5', () => {
    const ok = plan(rows([], [W({ 'Workstream id': 'w1', Start: 46023, End: 46203 })]));
    // 46023 = 2026-01-01, 46203 = 2026-06-30
    expect(doc(ok.writes, '/workstreams/w1')).toMatchObject({ start: '2026-01-01', end: '2026-06-30' });
    expect(() => plan(rows([], [W({ 'Workstream id': 'w1', Start: '2026-1-5' })]))).toThrow(/Start "2026-1-5" is not yyyy-mm-dd/);
  });
});
