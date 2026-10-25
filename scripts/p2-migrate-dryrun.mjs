// P2.1 migration dry-run — READ-ONLY. Reads an AF-MPT "Backup JSON", splits every
// project into the v2 documents in memory, checks assemble(split(p)) equals p, and
// writes an Excel report plus a PM / Sub-PM assignment template for HOD to fill.
// Firestore is only READ (members, invites) to resolve people; nothing is written.
// --offline (Ruling P4-13): no key, no Firestore; people resolution is reported as "not checked".
//
// Usage:
//   node scripts/p2-migrate-dryrun.mjs <backup.json> [--offline | --key service-account.json] [--out p2-dryrun-report.xlsx] [--template p2-assignments.xlsx]
// Exit codes: 1 = usage / missing key, 2 = a project failed the round trip, 3 = a project is blocked by a pre-check (2 wins).

import * as fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
XLSX.set_fs(fs); // required for XLSX.writeFile in ESM
import { splitProject, assembleProject } from '../src/migrateV2.js';
import { buildDirectoryIndex } from '../src/directory.js';
import { precheckProject } from './lib/migrate-checks.mjs';
import { normaliseForV2 } from './lib/migrate-normalise.mjs';
import { decideMigration, previewSheets } from './p2-migrate.mjs';

const WS = 'workspaces/main';
const kb = (v) => Math.round((Buffer.byteLength(JSON.stringify(v), 'utf8') / 1024) * 100) / 100;

function assertBackup(backup) {
  if (!backup || typeof backup !== 'object' || !backup.projects || !backup.meta) {
    throw new Error('Input is not an AF-MPT backup (expected { meta, projects, activity }).');
  }
}

const OFFLINE_SKIPPED = new Set(['pic-unresolved', 'pic-invite-only']);

// Activity of a project in the backup: an array of entries (newest first) or { entries }.
const activityOf = (backup, key) => {
  const a = backup.activity?.[key];
  return Array.isArray(a) ? a : Array.isArray(a?.entries) ? a.entries : [];
};

// opts.assemble is a test seam (to simulate a broken assemble); defaults to the real one.
// opts.offline (Ruling P4-13): no directory was read, so people resolution is "not checked".
export function buildDryRun(backup, directoryEntries, uidByEmail, opts = {}) {
  assertBackup(backup);
  const assemble = opts.assemble || assembleProject;
  const offline = Boolean(opts.offline);
  const dirIndex = offline ? null : buildDirectoryIndex(directoryEntries);
  const uids = offline ? new Map() : uidByEmail;
  const perProject = [];
  for (const [key, project] of Object.entries(backup.projects)) {
    const name = project?.name || key;
    const pre = precheckProject(project, { pid: key, dirIndex, uidByEmail: uids });
    const s = pre.split;
    const back = s ? assemble(s.meta, s.workstreams, s.tasks, s.actions, s.raid, s.decisions) : null;
    const orphans = {
      workstreams: back?.orphans?.workstreams?.length ?? 0,
      tasks: back?.orphans?.tasks?.length ?? 0,
      actions: back?.orphans?.actions?.length ?? 0,
      raid: back?.orphans?.raid?.length ?? 0,
      missingRaid: back?.orphans?.missingRaid?.length ?? 0,
    };
    const orphanTotal = orphans.workstreams + orphans.tasks + orphans.actions + orphans.raid + orphans.missingRaid;
    // The tree the app will hold after the switch is the normalised one (generated ids, no nulls).
    const roundTripOk = Boolean(s) && isDeepStrictEqual(back?.project, pre.normalised.project) && orphanTotal === 0;
    const v1Counts = { programs: 0, workstreams: 0, tasks: 0, actions: (project?.actionItems || []).length, decisions: (project?.decisions || []).length, raid: 0 };
    for (const p of project?.programs || []) {
      if (!p) continue;
      v1Counts.programs++;
      if (Object.prototype.hasOwnProperty.call(p, 'raid')) v1Counts.raid++;
      for (const w of p.workstreams || []) { if (!w) continue; v1Counts.workstreams++; v1Counts.tasks += (w.tasks || []).length; }
    }
    // Same plan the real preview builds (decideMigration), with an empty record and no live sub-docs.
    const prep = decideMigration({
      pid: key, doc: project, record: null, existing: [], v1Entries: activityOf(backup, key),
      dir: { dirIndex, uidByEmail: uids }, now: opts.now || new Date(),
    });
    if (offline && prep.plan?.report?.issues) {
      const iss = prep.plan.report.issues;
      prep.plan = { ...prep.plan, report: { ...prep.plan.report, issues: { ...iss, warnings: iss.warnings.filter((w) => !OFFLINE_SKIPPED.has(w.code)) } } };
    }
    const keep = (l) => (offline ? l.filter((i) => !OFFLINE_SKIPPED.has(i.code)) : l);
    const checks = { blocking: pre.blocking, warnings: keep(pre.warnings) };
    if (offline) checks.warnings.push({ code: 'offline', detail: 'people checks skipped (offline)' });
    const report = prep.plan?.report;
    perProject.push({
      name,
      pid: key,
      before: v1Counts,
      after: s ? { ...s.report.counts, decisions: s.decisions.length, raid: s.raid.length } : v1Counts,
      roundTripOk,
      orphans,
      sizeKb: s ? kb(s.meta) : 0, // largest single doc after the split
      maxTaskDocKb: s ? s.tasks.reduce((m, t) => Math.max(m, kb(t.data)), 0) : 0,
      unresolved: offline || !s ? [] : s.report.unresolved,
      offline,
      duplicateIds: s ? s.report.duplicateIds : [],
      collisions: s ? s.report.collisions.length : 0,
      checks,
      idMap: pre.normalised?.idMap ?? [],
      nullsRemoved: pre.normalised?.removedNulls.length ?? 0,
      activityEntries: activityOf(backup, key).length,
      docBytes: report?.docBytes ?? null,
      memberGrants: offline || !report ? null : report.members.memberUidsAdded.length + report.members.memberIdsAdded.length,
      prep,
    });
  }
  return { perProject, ok: perProject.every((p) => p.roundTripOk), blockedCount: perProject.filter((p) => p.checks.blocking.length).length };
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
    Unresolved: p.offline ? 'not checked' : p.unresolved.length,
    Duplicates: p.duplicateIds.length,
    Collisions: p.collisions,
    Blocking: p.checks.blocking.length,
    Warnings: p.offline ? `${p.checks.warnings.length - 1} (partial: offline)` : p.checks.warnings.length,
    'Ids generated': p.idMap.length,
    'Nulls removed': p.nullsRemoved,
    'Activity entries': p.activityEntries,
    'Doc KB': p.docBytes == null ? '' : Math.round((p.docBytes / 1024) * 100) / 100,
    'Member grants': p.memberGrants == null ? 'not checked' : p.memberGrants,
  })));
  add('Unresolved', result.perProject.flatMap((p) => p.unresolved.map((u) => ({
    Project: p.name, Field: u.field, Value: u.raw, Where: u.where,
  }))));
  add('Duplicates', result.perProject.flatMap((p) => p.duplicateIds.map((id) => ({ Project: p.name, Id: id }))));
  const sheets = result.perProject.map((p) => ({ p, ...previewSheets(p.prep, { pid: p.pid }) }));
  // Checks come from the pre-check (offline: people checks removed), one row per issue.
  add('Checks', result.perProject.flatMap((p) => [
    ...p.checks.blocking.map((i) => ({ Project: p.name, Severity: 'blocking', Code: i.code, Detail: i.detail })),
    ...p.checks.warnings.map((i) => ({ Project: p.name, Severity: 'warning', Code: i.code, Detail: i.detail })),
  ]));
  add('Id map', sheets.flatMap((x) => x['Id map'].map((r) => ({ Project: x.p.name, ...r }))));
  add('Preview', sheets.flatMap((x) => [
    ...(x.p.offline ? [{ Project: x.p.name, Line: 'OFFLINE: people not resolved; pic, member grants and assignments are not checked' }] : []),
    ...x.Summary.map((r) => ({ Project: x.p.name, ...r })),
  ]));
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
  for (const [key, raw] of Object.entries(backup.projects)) {
    // Normalised ids (as the migration will write them), so an assignment row resolves by id.
    const project = raw && typeof raw === 'object' ? normaliseForV2(raw, { pid: key }).project : raw;
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

// 2 = round trip failed, 3 = at least one project is blocked, 0 = clean. 2 wins over 3.
export function dryRunExitCode(result) {
  if (!result.ok) return 2;
  return result.blockedCount > 0 ? 3 : 0;
}

function parseArgs(argv) {
  const o = { pos: [], key: 'service-account.json', out: 'p2-dryrun-report.xlsx', template: 'p2-assignments.xlsx' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--key') o.key = argv[++i];
    else if (a === '--offline') o.offline = true;
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
    console.error('Usage: node scripts/p2-migrate-dryrun.mjs <backup.json> [--offline] [--key service-account.json] [--out report.xlsx] [--template assignments.xlsx]');
    process.exit(1);
  }
  const entries = [];
  const uidByEmail = new Map();
  if (!o.offline) {
    // Key check first: nothing below touches Firestore without it. Read-only.
    const db = await openDb(o.key);
    (await db.collection(`${WS}/members`).get()).forEach((d) => {
      const m = d.data();
      entries.push({ email: m.email, displayName: m.displayName, aliases: m.aliases, status: m.status });
      if (m.email) uidByEmail.set(String(m.email).toLowerCase(), d.id);
    });
    (await db.collection(`${WS}/invites`).get()).forEach((d) => {
      const m = d.data();
      entries.push({ email: m.email || d.id, displayName: m.displayName, aliases: m.aliases, status: m.status });
    });
  }
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const result = buildDryRun(backup, entries, uidByEmail, { offline: o.offline });
  XLSX.writeFile(buildReportWorkbook(result), o.out);
  XLSX.writeFile(buildAssignmentTemplate(backup), o.template);
  for (const p of result.perProject) {
    console.log(`${p.roundTripOk ? (p.checks.blocking.length ? 'BLOCKED' : 'OK  ') : 'FAIL'} ${p.name}: tasks ${p.before.tasks} -> ${p.after.tasks}, meta ${p.sizeKb} KB, blocking ${p.checks.blocking.length}${p.checks.blocking.length ? ` (${[...new Set(p.checks.blocking.map((i) => i.code))].join(', ')})` : ''}, warnings ${p.checks.warnings.length}, ids ${p.idMap.length}, unresolved ${p.offline ? 'not checked' : p.unresolved.length}`);
  }
  console.log(`Report ${o.out}, template ${o.template}. Dry run: Firestore untouched.`);
  if (o.offline) console.log('OFFLINE: people checks skipped');
  if (!result.ok) console.error('Round trip FAILED for at least one project.');
  if (result.blockedCount > 0) console.error(`${result.blockedCount} project(s) blocked`);
  process.exit(dryRunExitCode(result));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
