#!/usr/bin/env node
// P1 dry-run — READ-ONLY. Reads an AF-MPT "Backup JSON" file (downloaded from
// the app) and writes an Excel file listing every person string found in the
// data with a proposed canonical email. HOD fills the "HOD: …" columns; nothing
// is written to Firestore by this script.
//
// Usage: node scripts/p1-identity-dryrun.mjs <workspace_backup.json> [out.xlsx]

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
XLSX.set_fs(fs); // required for XLSX.writeFile in ESM
import { proposeMapping } from '../src/identity.js';

export function buildMappingWorkbook(backup) {
  if (!backup || typeof backup !== 'object' || !backup.projects || !backup.meta) {
    throw new Error('Input is not an AF-MPT backup (expected { meta, projects, activity }).');
  }
  const rows = proposeMapping(backup.projects, backup.activity || {});

  const mapping = rows.map((r) => ({
    'Value in data': r.raw,
    Type: r.type,
    'Suggested email': r.email,
    'Suggested name': r.name,
    Confidence: r.confidence,
    Note: r.note,
    Occurrences: r.occurrences,
    'Found in fields': r.sources,
    Projects: r.projects,
    'HOD: final email': '',
    'HOD: is group (Y)': '',
    'HOD: comment': '',
  }));
  const count = (pred) => rows.filter(pred).length;
  const summary = [
    { Item: 'Distinct values', Count: rows.length },
    { Item: 'High confidence', Count: count((r) => r.confidence === 'high') },
    { Item: 'Medium confidence', Count: count((r) => r.confidence === 'medium') },
    { Item: 'Needs a decision (none/low)', Count: count((r) => r.confidence === 'none' || r.confidence === 'low') },
    { Item: 'Groups', Count: count((r) => r.type === 'group') },
    { Item: 'Projects scanned', Count: Object.keys(backup.projects).length },
  ];
  const instructions = [
    { Step: 1, What: 'Sheet "Mapping": one row per distinct name/email string stored in tasks, actions, decisions, RAID, credit shares, etc.' },
    { Step: 2, What: 'Rows are sorted so the ones needing your decision (Confidence none/low) come first.' },
    { Step: 3, What: 'For each row, fill "HOD: final email" (the person\'s @smartosc.com email), or put Y in "HOD: is group" for departments/groups.' },
    { Step: 4, What: 'If the suggestion is right, copy it into "HOD: final email". Leave blank only if unsure — add a comment.' },
    { Step: 5, What: 'Send the file back. Nothing in Firestore changes until this mapping is approved and a separate, reviewed migration runs.' },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(mapping);
  ws['!cols'] = [28, 9, 28, 24, 11, 34, 11, 40, 24, 28, 14, 30].map((w) => ({ wch: w }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  XLSX.utils.book_append_sheet(wb, ws, 'Mapping');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(instructions), 'Instructions');
  return wb;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [inPath, outPath = 'p1-identity-mapping.xlsx'] = process.argv.slice(2);
  if (!inPath) {
    console.error('Usage: node scripts/p1-identity-dryrun.mjs <workspace_backup.json> [out.xlsx]');
    process.exit(1);
  }
  const wb = buildMappingWorkbook(JSON.parse(fs.readFileSync(inPath, 'utf8')));
  XLSX.writeFile(wb, outPath);
  console.log(`Wrote ${outPath} (read-only dry run; Firestore untouched).`);
}
