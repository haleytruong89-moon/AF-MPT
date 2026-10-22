import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { buildMappingWorkbook } from '../../scripts/p1-identity-dryrun.mjs';

const backup = JSON.parse(readFileSync(new URL('../fixtures/fixture-workspace.json', import.meta.url), 'utf8'));

describe('P1 dry-run workbook (read-only, from an app Backup JSON)', () => {
  const wb = buildMappingWorkbook(backup);

  it('has Mapping, Summary and Instructions sheets', () => {
    expect(wb.SheetNames).toEqual(['Mapping', 'Summary', 'Instructions']);
  });

  it('one row per distinct person string, with an empty HOD decision column', () => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Mapping);
    const raws = rows.map((r) => r['Value in data']).sort();
    expect(raws).toEqual(['Hà Trương Thị Thu', 'hattt4@smartosc.com', 'Legal', 'Unknown Person'].sort());
    expect(rows.every((r) => !('HOD: final email' in r) || r['HOD: final email'] === '')).toBe(true);
    const thu = rows.find((r) => r['Value in data'] === 'Hà Trương Thị Thu');
    expect(thu['Suggested email']).toBe('hattt4@smartosc.com');
    expect(thu.Confidence).toBe('high');
  });

  it('summary counts rows by confidence', () => {
    const s = Object.fromEntries(XLSX.utils.sheet_to_json(wb.Sheets.Summary).map((r) => [r.Item, r.Count]));
    expect(s['Distinct values']).toBe(4);
    expect(s['Needs a decision (none/low)']).toBe(1);
    expect(s.Groups).toBe(1);
  });

  it('rejects a file that is not an app backup', () => {
    expect(() => buildMappingWorkbook({ foo: 1 })).toThrow(/not an AF-MPT backup/);
  });
});
