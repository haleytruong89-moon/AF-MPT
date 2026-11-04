// P2.4b Task 3: read-only preview of restoring ONE v2 project from an in-app Backup JSON.
//
// This task only previews: it reads Firestore, never writes it, and never writes a JSON
// file (the preview workbook is the only output). --apply is parsed but not wired yet
// (Task 4). The pure plan lives in scripts/lib/restore-plan.mjs (Rulings P4b-1..17).
//
// Usage:
//   node scripts/p2-restore.mjs <pid> --backup <file.json> [--allow-history-loss] [--key service-account.json]
//   (apply, Task 4:  ... --apply --expect <plan hash>)
// Exit codes: 0 restore plan or nothing to restore; 1 usage / blocked / unreadable backup;
// 3 refused because history would be lost and --allow-history-loss was not given.
// Output (gitignored, contains people data): p2-restore-preview-<pid>.xlsx.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { toJsonable } from './lib/manifest.mjs';
import { RECORD_PATH, SUBCOLS } from './lib/migrate-plan.mjs';
import { readBackupProject } from './lib/restore-target.mjs';
import { planRestore } from './lib/restore-plan.mjs';
import { readDirectory, openDb, nameLookup, writePreviewXlsx } from './p2-migrate.mjs';

const WS = 'workspaces/main';
const PROJECTS = `${WS}/projects`;
const arr = (v) => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------- args

export function parseArgs(argv) {
  const o = { pid: null, backup: null, apply: false, expect: null, allowHistoryLoss: false, key: 'service-account.json', error: null };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v === '' || v.startsWith('--')) o.error = o.error || `${a} needs a value`;
      return v;
    };
    if (a === '--apply') o.apply = true;
    else if (a === '--allow-history-loss') o.allowHistoryLoss = true;
    else if (a === '--backup') o.backup = value();
    else if (a === '--key') o.key = value();
    else if (a === '--expect') o.expect = value();
    else if (a.startsWith('--')) o.error = o.error || `Unknown argument: ${a}`;
    else pos.push(a);
  }
  if (o.error) return o;
  if (pos.length !== 1 || pos[0].includes('/')) o.error = 'Exactly one project id (no "/") is required';
  else if (!o.backup) o.error = '--backup <file.json> is required (the in-app Backup JSON)';
  else if (o.apply && !o.expect) o.error = '--apply needs --expect <plan hash> from the approved preview (Ruling P4b-9)';
  else if (o.expect && !/^[0-9a-f]{16}$/.test(o.expect)) o.error = `--expect must be the 16-hex plan hash, got "${o.expect}"`;
  if (!o.error) o.pid = pos[0];
  return o;
}

const USAGE = 'Usage: node scripts/p2-restore.mjs <pid> --backup <file.json> [--allow-history-loss] [--apply --expect <plan hash>] [--key service-account.json]';

// ---------------------------------------------------------------- read side

// Everything the plan needs from Firestore. With tx, every read goes through tx.get (Task 4).
// -> { doc, live: { meta, docs: { kind: [{ id, data }] } } | null, hasMigrationRecord }.
export async function readLive(db, pid, tx = null, Timestamp = null) {
  const get = (ref) => (tx ? tx.get(ref) : ref.get());
  const json = (v) => (Timestamp ? toJsonable(v, Timestamp) : v);
  const snap = await get(db.doc(`${PROJECTS}/${pid}`));
  const doc = snap.exists ? json(snap.data()) : null;
  const rec = await get(db.doc(RECORD_PATH(pid)));
  const docs = {};
  for (const kind of SUBCOLS) {
    const q = await get(db.collection(`${PROJECTS}/${pid}/${kind}`));
    docs[kind] = [];
    q.forEach((d) => docs[kind].push({ id: d.id, data: json(d.data()) }));
  }
  return { doc, live: doc ? { meta: doc, docs } : null, hasMigrationRecord: rec.exists };
}

// Reads only. Returns the plan plus { live, dir, backupName, backupSha256, hasMigrationRecord,
// allowHistoryLoss, backupActivityCount }. `backup` is the already-parsed JSON.
export async function prepareRestore(db, { pid, backup, backupName, backupSha256, allowHistoryLoss = false, Timestamp = null }) {
  const { live, hasMigrationRecord } = await readLive(db, pid, null, Timestamp);
  const dir = await readDirectory(db);
  const bp = readBackupProject(backup, pid);
  const plan = planRestore({
    pid, live, backupProject: bp.project, dirIndex: dir.dirIndex, uidByEmail: dir.uidByEmail,
    allowHistoryLoss, hasMigrationRecord, backupSha256, backupActivityCount: bp.activityCount,
  });
  if (bp.blocked.length) {
    // The specific backup problem replaces the generic one planRestore reports.
    plan.mode = 'blocked';
    plan.planHash = null;
    plan.blocked = [...bp.blocked, ...plan.blocked.filter((b) => b.code !== 'backup-invalid')];
  }
  return {
    ...plan, live, dir, backupName, backupSha256, hasMigrationRecord, allowHistoryLoss, backupActivityCount: bp.activityCount,
  };
}

// ---------------------------------------------------------------- preview text

const issueLines = (label, list) => (list.length ? [`${label}:`, ...list.map((i) => `  ${i.code}: ${i.detail}`)] : [`${label}: none`]);
const show = (v) => (v === null || v === undefined ? '-' : typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v));
const trunc = (s, n = 80) => (s.length > n ? `${s.slice(0, n)}...` : s);

// prep = prepareRestore result; nameOfUid is accepted for symmetry with p2-migrate. -> string[].
export function formatRestorePreview(prep, { pid } = {}) {
  const L = [];
  const r = prep.report;
  L.push(`Project:     ${PROJECTS}/${pid}`);
  L.push(`Mode:        ${prep.mode}${prep.mode === 'noop' ? ' (the project already equals the backup plus retained items; nothing to write)' : ''}`);
  if (prep.backupName) L.push(`Backup:      ${prep.backupName} (sha256 ${String(prep.backupSha256 || '').slice(0, 12)})`);
  if (prep.mode === 'blocked') {
    L.push(...issueLines('BLOCKING', prep.blocked));
    L.push(...issueLines('Warnings', prep.warnings));
    return L;
  }
  L.push(`Counts:      ${SUBCOLS.map((k) => `${k} +${r.perKind[k].create} ~${r.perKind[k].update} =${r.perKind[k].unchanged}`).join(', ')}  (+ create, ~ update, = unchanged; no delete)`);
  L.push(`Retained (Dropped/Cancelled): ${r.retained.length}`);
  for (const x of r.retained) {
    L.push(`  ${x.id} ${x.kind} ${show(x.name)}: ${x.liveStatus ?? '-'} -> ${x.newStatus ?? 'unchanged'}${x.liveStatus === 'Completed' && x.kind === 'task' ? ' (was Completed)' : ''}`);
  }
  if (r.kept.length) L.push(`Kept (no counterpart, not deleted): ${r.kept.map((k) => `${k.kind}/${k.id}`).join(', ')}`);
  if (r.creditLoss.length) {
    L.push(`CREDIT LOSS: ${r.creditLoss.length} task(s) leave Completed (their Completed credit is removed):`);
    for (const c of r.creditLoss) L.push(`  ${c.id} ${show(c.name)}: ${c.from} -> ${c.to}${c.retained ? ' (retained, set to Dropped)' : ''}`);
  } else L.push('Credit loss: none');
  if (r.historyLost.length) {
    const n = r.historyLost.reduce((s, h) => s + h.entries.length, 0);
    L.push(`History loss: ${n} entr${n === 1 ? 'y' : 'ies'} in ${r.historyLost.length} list(s)${prep.allowHistoryLoss ? ' (allowed by --allow-history-loss; the snapshot keeps them)' : ''}`);
    for (const h of r.historyLost) {
      L.push(`  ${h.kind}/${h.id} ${h.list}:`);
      for (const e of h.entries) L.push(`    ${e.id ?? '(no id)'} ${show(e.preview)}`);
    }
  } else L.push('History loss: none');
  if (r.editedEntries.length) {
    L.push('Edited entries (same id, content differs; not blocking):');
    for (const h of r.editedEntries) L.push(`  ${h.kind}/${h.id} ${h.list}: ${h.entries.map((e) => e.id ?? '(no id)').join(', ')}`);
  }
  const changed = r.meta.filter((m) => !m.kept);
  const kept = r.meta.filter((m) => m.kept);
  L.push(`Project doc: ${changed.length ? `${changed.length} field(s) change: ${changed.map((m) => m.field).join(', ')}` : 'no field changes'}`);
  for (const p of r.programMeta) L.push(`  programMeta ${p.key}: ${p.fields.join(', ')}`);
  if (kept.length) L.push(`  kept (live-only, never deleted): ${kept.map((m) => m.field).join(', ')}`);
  const a = r.access || {};
  L.push(`Access:      memberIds ${a.memberIds ?? 0}, memberUids ${a.memberUids ?? 0}, visibility ${a.visibility ?? '-'} (unchanged, not restored)`);
  if (r.backupMemberIdsDiff && (r.backupMemberIdsDiff.added.length || r.backupMemberIdsDiff.removed.length)) {
    L.push(`  backup memberIds differs (informational only): +${r.backupMemberIdsDiff.added.length} -${r.backupMemberIdsDiff.removed.length}`);
  }
  L.push(`Activity:    backup has ${prep.backupActivityCount ?? r.backupActivityCount} entries (not restored); ${prep.mode === 'restore' ? '1 restore event will be added' : 'no restore event (nothing to write)'}`);
  L.push(...issueLines('Warnings', prep.warnings));
  if (prep.hasMigrationRecord) {
    L.push('MIGRATION RECORD EXISTS: after this restore, a later p2-migrate --rollback reports these docs as v2 edits and needs --force-with-report; it returns to the frozen pre-migration v1 tree, not to this restore.');
  }
  if (prep.refused) {
    L.push('REFUSED (exit 3): this restore would delete history entries (listed above). Re-run the preview with --allow-history-loss only after HOD approves the loss.');
  } else if (prep.mode === 'restore') {
    const flag = prep.allowHistoryLoss ? ' --allow-history-loss' : '';
    L.push(`Plan hash:   ${prep.planHash}  (apply with node scripts/p2-restore.mjs ${pid} --backup ${prep.backupName ?? '<file>'}${flag} --apply --expect ${prep.planHash})`);
  }
  return L;
}

// -> { Summary, Ops, Retained, 'History loss', Changes } as arrays of row objects.
export function restorePreviewSheets(prep, { pid, nameOfUid = (u) => u } = {}) {
  const r = prep.report;
  const Summary = formatRestorePreview(prep, { pid, nameOfUid }).map((line) => ({ Line: line }));
  const nameOf = (kind, id) => {
    const d = arr(prep.live?.docs?.[kind]).find((x) => x.id === id);
    return d?.data?.name ?? d?.data?.title ?? d?.data?.text ?? '';
  };
  const Ops = prep.ops.map((o) => ({ Kind: o.kind, Op: o.op, Id: o.id, Name: o.data?.name ?? o.data?.title ?? nameOf(o.kind, o.id), 'Expect version': o.expectVersion ?? '' }));
  const Retained = r.retained.map((x) => ({ Kind: x.kind, Id: x.id, Name: x.name ?? '', 'Live status': x.liveStatus ?? '', 'New status': x.newStatus ?? '' }));
  const HistoryLoss = r.historyLost.flatMap((h) => h.entries.map((e) => ({ Kind: h.kind, Doc: h.id, List: h.list, 'Entry id': e.id ?? '', Preview: e.preview ?? '' })));
  const Changes = [
    ...r.creditLoss.map((c) => ({ Type: 'credit loss', Id: c.id, Name: c.name ?? '', Detail: `${c.from} -> ${c.to}${c.retained ? ' (retained)' : ''}` })),
    ...r.editedEntries.map((e) => ({ Type: 'edited entries', Id: e.id, Name: e.kind, Detail: `${e.list}: ${e.entries.map((x) => x.id ?? '(no id)').join(', ')}` })),
    ...r.meta.map((m) => ({ Type: m.kept ? 'meta kept' : 'meta change', Id: m.field, Name: '', Detail: m.kept ? 'live-only, never deleted' : trunc(`${JSON.stringify(m.from)} -> ${JSON.stringify(m.to)}`, 200) })),
    ...r.programMeta.map((p) => ({ Type: 'programMeta', Id: p.key, Name: '', Detail: p.fields.join(', ') })),
    ...(prep.warnings || []).map((w) => ({ Type: `warning ${w.code}`, Id: '', Name: '', Detail: w.detail })),
    ...(prep.blocked || []).map((b) => ({ Type: `blocked ${b.code}`, Id: '', Name: '', Detail: b.detail })),
  ];
  return { Summary, Ops, Retained, 'History loss': HistoryLoss, Changes };
}

// ---------------------------------------------------------------- CLI

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.error) { console.error(o.error); console.error(USAGE); process.exit(1); }
  if (o.apply) { console.error('--apply is not available yet (P2.4b Task 4). Run the preview without --apply.'); process.exit(1); }
  // Key check first: nothing below touches Firestore without it.
  const { db, Timestamp } = await openDb(o.key);
  if (!fs.existsSync(o.backup)) { console.error(`Backup file not found: ${o.backup}`); process.exit(1); }
  const bytes = fs.readFileSync(o.backup);
  const backupSha256 = createHash('sha256').update(bytes).digest('hex');
  let backup;
  try { backup = JSON.parse(bytes.toString('utf8')); } catch (e) { console.error(`Backup file is not valid JSON: ${e.message}`); process.exit(1); }
  const backupName = path.basename(o.backup);
  const prep = await prepareRestore(db, { pid: o.pid, backup, backupName, backupSha256, allowHistoryLoss: o.allowHistoryLoss, Timestamp });
  const nameOfUid = nameLookup(prep.dir.members);
  for (const l of formatRestorePreview(prep, { pid: o.pid, nameOfUid })) console.log(l);
  const xlsxPath = `p2-restore-preview-${o.pid}.xlsx`;
  writePreviewXlsx(xlsxPath, restorePreviewSheets(prep, { pid: o.pid, nameOfUid }));
  console.log(`Preview:     ${xlsxPath}`);
  console.log('Dry run: Firestore untouched.');
  process.exit(prep.mode === 'blocked' ? 1 : prep.refused ? 3 : 0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e.message || e); process.exit(1); });

