// P2.1 migration dry-run — READ-ONLY. Reads an AF-MPT "Backup JSON", splits every
// project into the v2 documents in memory, checks assemble(split(p)) equals p, and
// writes an Excel report plus a PM / Sub-PM assignment template for HOD to fill.
// Firestore is only READ (members, invites) to resolve people; nothing is written.
//
// Usage:
//   node scripts/p2-migrate-dryrun.mjs <backup.json> [--key service-account.json] [--out p2-dryrun-report.xlsx] [--template p2-assignments.xlsx]
// Exit codes: 1 = usage / missing key, 2 = a project failed the round trip.

import * as fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
XLSX.set_fs(fs); // required for XLSX.writeFile in ESM
import { splitProject, assembleProject } from '../src/migrateV2.js';
import { buildDirectoryIndex } from '../src/directory.js';

const WS = 'workspaces/main';
const kb = (v) => Math.round((Buffer.byteLength(JSON.stringify(v), 'utf8') / 1024) * 100) / 100;

function assertBackup(backup) {
  if (!backup || typeof backup !== 'object' || !backup.projects || !backup.meta) {
    throw new Error('Input is not an AF-MPT backup (expected { meta, projects, activity }).');
  }
}

// opts.assemble is a test seam (to simulate a broken assemble); defaults to the real one.
export function buildDryRun(backup, directoryEntries, uidByEmail, opts = {}) {
  assertBackup(backup);
  const assemble = opts.assemble || assembleProject;
  const dirIndex = buildDirectoryIndex(directoryEntries);
  const perProject = [];
  for (const [key, project] of Object.entries(backup.projects)) {
    const name = project?.name || key;
    const s = splitProject(project, { wid: 'main', dirIndex, uidByEmail });
    const back = assemble(s.meta, s.workstreams, s.tasks, s.actions, s.raid, s.decisions);
    const orphans = {
      workstreams: back?.orphans?.workstreams?.length ?? 0,
      tasks: back?.orphans?.tasks?.length ?? 0,
      actions: back?.orphans?.actions?.length ?? 0,
      raid: back?.orphans?.raid?.length ?? 0,
      missingRaid: back?.orphans?.missingRaid?.length ?? 0,
    };
    const orphanTotal = orphans.workstreams + orphans.tasks + orphans.actions + orphans.raid + orphans.missingRaid;
    const roundTripOk = isDeepStrictEqual(back?.project, project) && orphanTotal === 0;
    const v1Counts = { programs: 0, workstreams: 0, tasks: 0, actions: (project.actionItems || []).length, decisions: (project.decisions || []).length, raid: 0 };
    for (const p of project.programs || []) {
      v1Counts.programs++;
      if (p && Object.prototype.hasOwnProperty.call(p, 'raid')) v1Counts.raid++;
      for (const w of p.workstreams || []) { v1Counts.workstreams++; v1Counts.tasks += (w.tasks || []).length; }
    }
    perProject.push({
      name,
      before: v1Counts,
      after: { ...s.report.counts, decisions: s.decisions.length, raid: s.raid.length },
      roundTripOk,
      orphans,
      sizeKb: kb(s.meta), // largest single doc after the split
      maxTaskDocKb: s.tasks.reduce((m, t) => Math.max(m, kb(t.data)), 0),
      unresolved: s.report.unresolved,
      duplicateIds: s.report.duplicateIds,
      collisions: s.report.collisions.length,
    });
  }
  return { perProject, ok: perProject.every((p) => p.roundTripOk) };
}

export function buildReportWorkbook(result) {
  const wb = XLSX.utils.book_new();
  const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  const arrow = (b, a, k) => `${b[k]} → ${a[k]}`;
  add('Summary', result.perProject.map((p) => ({
    Project: p.name,
    Programs: arrow(p.before, p.after, 'programs'),
    Workstreams: arrow(p.before, p.after, 'workstreams'),
    Tasks: arrow(p.before, p.after, 'tasks'),
    Actions: arrow(p.before, p.after, 'actions'),
    Decisions: arrow(p.before, p.after, 'decisions'),
    'RAID docs': arrow(p.before, p.after, 'raid'),
    'Round trip OK': p.roundTripOk ? 'yes' : 'NO',
    Orphans: p.orphans.workstreams + p.orphans.tasks + p.orphans.actions + p.orphans.raid + p.orphans.missingRaid,
    'Meta KB': p.sizeKb,
    'Max task KB': p.maxTaskDocKb,
    Unresolved: p.unresolved.length,
    Duplicates: p.duplicateIds.length,
    Collisions: p.collisions,
  })));
  add('Unresolved', result.perProject.flatMap((p) => p.unresolved.map((u) => ({
    Project: p.name, Field: u.field, Value: u.raw, Where: u.where,
  }))));
  add('Duplicates', result.perProject.flatMap((p) => p.duplicateIds.map((id) => ({ Project: p.name, Id: id }))));
  return wb;
}

// Sheet / column names of the assignment template; scripts/lib/assignments.mjs reads them back.
export const PROGRAMS_SHEET = 'Programs';
export const WORKSTREAMS_SHEET = 'Workstreams';
export const PROGRAM_COLS = ['Project', 'Program id', 'Program', 'PM email', 'Deputy email'];
export const WORKSTREAM_COLS = ['Project', 'Workstream id', 'Program', 'Workstream', 'Sub-PM email', 'Start', 'End'];

export function buildAssignmentTemplate(backup) {
  assertBackup(backup);
  const programs = [];
  const workstreams = [];
  for (const [key, project] of Object.entries(backup.projects)) {
    const proj = project?.name || key;
    for (const g of project?.programs || []) {
      programs.push({ Project: proj, 'Program id': g.id ?? '', Program: g.name ?? '', 'PM email': '', 'Deputy email': '' });
      for (const w of g.workstreams || []) {
        const starts = [];
        const ends = [];
        for (const t of w.tasks || []) {
          if (t?.start) starts.push(String(t.start));
          if (t?.end) ends.push(String(t.end));
        }
        // ISO yyyy-mm-dd strings sort chronologically.
        workstreams.push({
          Project: proj, 'Workstream id': w.id ?? '', Program: g.name ?? '', Workstream: w.name ?? '',
          'Sub-PM email': '',
          Start: starts.length ? starts.reduce((a, b) => (b < a ? b : a)) : '',
          End: ends.length ? ends.reduce((a, b) => (b > a ? b : a)) : '',
        });
      }
    }
  }
  const instructions = [
    { Step: 1, What: 'Sheet "Programs": điền PM email và Deputy email cho từng program (email phải có trong People directory).' },
    { Step: 2, What: 'Sheet "Workstreams": điền Sub-PM email cho từng workstream (email phải có trong People directory).' },
    { Step: 3, What: 'Start / End đã điền sẵn = ngày bắt đầu sớm nhất / kết thúc muộn nhất của các task; sửa nếu cần (định dạng yyyy-mm-dd).' },
    { Step: 4, What: 'Để trống = chưa gán. Workstream không có Sub-PM thì PM của program phụ trách.' },
    { Step: 5, What: 'Bắt đầu với 2 project pilot: "AF 2026 Key Results" và "AF 2026 Operation".' },
  ];
  const wb = XLSX.utils.book_new();
  const sheet = (rows, cols) => XLSX.utils.json_to_sheet(rows, { header: cols });
  XLSX.utils.book_append_sheet(wb, sheet(programs, PROGRAM_COLS), PROGRAMS_SHEET);
  XLSX.utils.book_append_sheet(wb, sheet(workstreams, WORKSTREAM_COLS), WORKSTREAMS_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(instructions), 'Instructions');
  return wb;
}

function parseArgs(argv) {
  const o = { pos: [], key: 'service-account.json', out: 'p2-dryrun-report.xlsx', template: 'p2-assignments.xlsx' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--key') o.key = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--template') o.template = argv[++i];
    else o.pos.push(a);
  }
  return o;
}

async function openDb(keyPath) {
  if (!fs.existsSync(keyPath)) {
    console.error(`Missing service-account key: ${keyPath} (Firebase Console > Project settings > Service accounts). Nothing was read or written.`);
    process.exit(1);
  }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  let key;
  try { key = JSON.parse(fs.readFileSync(keyPath, 'utf8')); } catch { console.error('Invalid service-account key file'); process.exit(1); }
  initializeApp({ credential: cert(key) });
  return getFirestore();
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const [backupPath] = o.pos;
  if (!backupPath) {
    console.error('Usage: node scripts/p2-migrate-dryrun.mjs <backup.json> [--key service-account.json] [--out report.xlsx] [--template assignments.xlsx]');
    process.exit(1);
  }
  // Key check first: nothing below touches Firestore without it. Read-only.
  const db = await openDb(o.key);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const entries = [];
  const uidByEmail = new Map();
  (await db.collection(`${WS}/members`).get()).forEach((d) => {
    const m = d.data();
    entries.push({ email: m.email, displayName: m.displayName, aliases: m.aliases, status: m.status });
    if (m.email) uidByEmail.set(String(m.email).toLowerCase(), d.id);
  });
  (await db.collection(`${WS}/invites`).get()).forEach((d) => {
    const m = d.data();
    entries.push({ email: m.email || d.id, displayName: m.displayName, aliases: m.aliases, status: m.status });
  });
  const result = buildDryRun(backup, entries, uidByEmail);
  XLSX.writeFile(buildReportWorkbook(result), o.out);
  XLSX.writeFile(buildAssignmentTemplate(backup), o.template);
  for (const p of result.perProject) {
    console.log(`${p.roundTripOk ? 'OK  ' : 'FAIL'} ${p.name}: tasks ${p.before.tasks} -> ${p.after.tasks}, meta ${p.sizeKb} KB, unresolved ${p.unresolved.length}`);
  }
  console.log(`Report ${o.out}, template ${o.template}. Dry run: Firestore untouched.`);
  if (!result.ok) { console.error('Round trip FAILED for at least one project.'); process.exit(2); }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
