// P2.2 Task 5: write a v2 PILOT COPY of one real v1 project, so the v2 read path
// can be proven on real data without touching the original.
//
// The copy lives at workspaces/main/projects/<newPid> (default <sourcePid>__v2pilot):
//  - project doc = the full v1 source doc (frozen copy, as P2.4 will keep it) plus
//    programMeta / v1Absent from splitProject, with an HOD-only ACL:
//    name '[v2 pilot] <name>', memberIds [HOD], roles {HOD: owner}, memberUids [HOD],
//    visibility 'restricted', schemaVersion 2, rev 0, createdBy HOD.
//    googleChatWebhook and deletedAt are dropped: a pilot must never post to the
//    real Chat space.
//  - workstreams / tasks / actions / raid sub-collections from splitProject, each
//    doc with projectId = newPid, version 1, updatedBy 'p2-pilot-copy'.
//    The Admin SDK bypasses the rules; updatedBy is a script id (not a uid) BY
//    DESIGN so the docs are traceable to this script. The first in-app write
//    (P2.3+) restamps it with the caller's uid and bumps version.
//
// Source safety: the source project is only READ. Every planned path is checked to
// be under workspaces/main/projects/<newPid> with no segment equal to the source
// pid; --apply refuses if anything already exists at <newPid> (doc or any
// sub-collection). The manifest therefore holds only new docs (before = null) and
// --rollback deletes exactly those paths. p2-*-manifest*.json is gitignored.
//
// Usage:
//   node scripts/p2-pilot-copy.mjs <sourcePid> [--new-pid X] [--key service-account.json]            (preview, read-only)
//   node scripts/p2-pilot-copy.mjs <sourcePid> [--new-pid X] --apply [--key service-account.json]
//   node scripts/p2-pilot-copy.mjs --rollback <manifest.json> [--key service-account.json]
// Then: node scripts/p2-compare.mjs <sourcePid> <newPid>

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyWrites, rollbackManifest } from './lib/manifest.mjs';
import { splitProject } from '../src/migrateV2.js';
import { buildDirectoryIndex } from '../src/directory.js';

const WID = 'main';
const WS = `workspaces/${WID}`;
const PROJECTS = `${WS}/projects`;
export const SUBCOLS = ['workstreams', 'tasks', 'actions', 'raid'];
export const PILOT_STAMP = 'p2-pilot-copy';
const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export const defaultNewPid = (sourcePid) => `${sourcePid}__v2pilot`;

const validPid = (pid) => typeof pid === 'string' && pid.trim() !== '' && !pid.includes('/');

// Owner uid = the ACTIVE members doc whose email equals workspaces/main.workspaceOwner.
// memberDocs: Array<{ id, data }>. -> { uid } | { error }.
export function resolveOwnerUid(wsDoc, memberDocs) {
  if (!wsDoc) return { error: `${WS} does not exist` };
  const owner = norm(wsDoc.workspaceOwner);
  if (!owner.includes('@')) return { error: `workspaceOwner "${wsDoc.workspaceOwner ?? ''}" is not an email` };
  const hits = (memberDocs || []).filter((d) => norm(d.data?.email) === owner);
  if (!hits.length) return { error: `workspaceOwner ${owner} has no members entry` };
  if (hits.length > 1) return { error: `workspaceOwner ${owner} matches several members docs: ${hits.map((h) => h.id).join(', ')}` };
  if (hits[0].data?.status !== 'active') return { error: `workspaceOwner ${owner} members entry ${hits[0].id} is not active` };
  return { uid: hits[0].id };
}

// Directory for uid resolution, as p2-migrate-dryrun.mjs builds it: members + invites
// feed the index; uidByEmail comes from members only (invites have no uid).
export function directoryFrom(memberDocs, inviteDocs) {
  const entries = [];
  const uidByEmail = new Map();
  for (const d of memberDocs || []) {
    const m = d.data || {};
    entries.push({ email: m.email, displayName: m.displayName, aliases: m.aliases, status: m.status });
    if (m.email) uidByEmail.set(String(m.email).toLowerCase(), d.id);
  }
  for (const d of inviteDocs || []) {
    const m = d.data || {};
    entries.push({ email: m.email || d.id, displayName: m.displayName, aliases: m.aliases, status: m.status });
  }
  return { dirIndex: buildDirectoryIndex(entries), uidByEmail };
}

// Every path must be the new project doc or a doc of one of its 4 sub-collections,
// and no segment may be the source pid.
function assertPathSafe(path, sourcePid, newPid) {
  const segs = path.split('/');
  const okRoot = segs.length >= 4 && segs[0] === 'workspaces' && segs[1] === WID && segs[2] === 'projects' && segs[3] === newPid;
  const okShape = segs.length === 4 || (segs.length === 6 && SUBCOLS.includes(segs[4]) && segs[5] !== '');
  if (!okRoot || !okShape || segs.includes(sourcePid)) {
    throw new Error(`Unsafe write path refused: ${path}`);
  }
}

// Pure. sourceProject = the v1 project doc data. -> { writes: [{ path, data }], report }.
export function planPilotCopy(sourceProject, { sourcePid, newPid, ownerUid, dirIndex = null, uidByEmail = new Map(), now } = {}) {
  if (!validPid(sourcePid)) throw new Error('sourcePid is required (no "/")');
  if (!validPid(newPid)) throw new Error('newPid is required (no "/")');
  if (newPid === sourcePid) throw new Error('newPid must differ from sourcePid');
  if (typeof ownerUid !== 'string' || !ownerUid) throw new Error('ownerUid is required');
  if (!sourceProject || typeof sourceProject !== 'object') throw new Error(`Source project ${sourcePid} not found`);
  if (sourceProject.schemaVersion === 2 || hasOwn(sourceProject, 'programMeta')) {
    throw new Error(`Source project ${sourcePid} is not a v1 project (schemaVersion 2 / programMeta present)`);
  }
  if (sourceProject.deletedAt) throw new Error(`Source project ${sourcePid} is deleted`);

  // projectId = newPid on every sub-doc: split with the new id (the source is not mutated).
  const split = splitProject({ ...sourceProject, id: newPid }, { wid: WID, dirIndex, uidByEmail });
  const {
    googleChatWebhook: _gw, deletedAt: _da, id: _id, memberUids: _mu, ...frozen
  } = split.meta;
  void _gw; void _da; void _id; void _mu;
  const meta = {
    ...frozen,
    ...(hasOwn(sourceProject, 'id') ? { id: newPid } : {}),
    name: `[v2 pilot] ${sourceProject.name ?? sourcePid}`,
    memberIds: [ownerUid],
    roles: { [ownerUid]: 'owner' },
    memberUids: [ownerUid],
    visibility: 'restricted',
    schemaVersion: 2,
    rev: 0,
    createdBy: ownerUid,
    ...(now !== undefined ? { createdAt: now, updatedAt: now } : {}),
  };

  const base = `${PROJECTS}/${newPid}`;
  const writes = [{ path: base, data: meta }];
  const lists = { workstreams: split.workstreams, tasks: split.tasks, actions: split.actions, raid: split.raid };
  for (const kind of SUBCOLS) {
    for (const d of lists[kind]) {
      if (hasOwn(d.data, 'updatedBy')) {
        throw new Error(`${kind}/${d.id} already has a v1 updatedBy; the pilot stamp would overwrite it`);
      }
      writes.push({
        path: `${base}/${kind}/${d.id}`,
        data: { ...d.data, projectId: newPid, version: 1, updatedBy: PILOT_STAMP },
      });
    }
  }
  for (const w of writes) assertPathSafe(w.path, sourcePid, newPid);

  const report = {
    ...split.report,
    docs: {
      project: 1,
      workstreams: split.workstreams.length,
      tasks: split.tasks.length,
      actions: split.actions.length,
      raid: split.raid.length,
    },
    totalWrites: writes.length,
  };
  return { writes, report };
}

// -> { empty: true } | { empty: false, reason }.
export async function targetIsEmpty(db, newPid) {
  const ref = db.doc(`${PROJECTS}/${newPid}`);
  if ((await ref.get()).exists) return { empty: false, reason: `${PROJECTS}/${newPid} already exists` };
  // listCollections lists every sub-collection holding at least one doc (incl. the
  // 4 v2 ones and anything else), even when the parent doc itself is missing.
  const cols = await ref.listCollections();
  if (cols.length) return { empty: false, reason: `${PROJECTS}/${newPid} has sub-collections: ${cols.map((c) => c.id).join(', ')}` };
  return { empty: true };
}

const docsOf = async (db, path) => {
  const out = [];
  (await db.collection(path).get()).forEach((d) => out.push({ id: d.id, data: d.data() }));
  return out;
};

// Reads only. -> { writes, report, ownerUid }.
export async function preparePilotCopy(db, { sourcePid, newPid = defaultNewPid(sourcePid), now }) {
  const srcSnap = await db.doc(`${PROJECTS}/${sourcePid}`).get();
  if (!srcSnap.exists) throw new Error(`Source project ${PROJECTS}/${sourcePid} not found`);
  const wsSnap = await db.doc(WS).get();
  const members = await docsOf(db, `${WS}/members`);
  const invites = await docsOf(db, `${WS}/invites`);
  const owner = resolveOwnerUid(wsSnap.exists ? wsSnap.data() : null, members);
  if (owner.error) throw new Error(owner.error);
  const { dirIndex, uidByEmail } = directoryFrom(members, invites);
  const { writes, report } = planPilotCopy(srcSnap.data(), { sourcePid, newPid, ownerUid: owner.uid, dirIndex, uidByEmail, now });
  return { writes, report, ownerUid: owner.uid, newPid };
}

// Non-CLI core of --apply (used by the emulator test).
export async function applyPilotCopy(db, { sourcePid, newPid = defaultNewPid(sourcePid), now, Timestamp, writeManifest }) {
  const prepared = await preparePilotCopy(db, { sourcePid, newPid, now });
  const t = await targetIsEmpty(db, newPid);
  if (!t.empty) throw new Error(`Refusing to apply: ${t.reason}. Roll back or pick another --new-pid.`);
  const r = await applyWrites(db, prepared.writes, { Timestamp, writeManifest });
  return { ...prepared, written: r.written };
}

// A pilot manifest may only hold new docs (before null, no merge) under ONE
// workspaces/main/projects/<pid>. Returns that pid.
export function assertPilotManifest(manifest) {
  const entries = manifest?.entries;
  if (!Array.isArray(entries) || !entries.length) throw new Error('Manifest has no entries');
  let pid = null;
  for (const e of entries) {
    const segs = String(e.path || '').split('/');
    if (e.merge || e.before !== null) throw new Error(`Not a pilot-copy manifest: ${e.path} has a before-image or merge`);
    if (segs.length < 4 || segs[0] !== 'workspaces' || segs[1] !== WID || segs[2] !== 'projects') {
      throw new Error(`Not a pilot-copy manifest: unexpected path ${e.path}`);
    }
    if (!(segs.length === 4 || (segs.length === 6 && SUBCOLS.includes(segs[4])))) {
      throw new Error(`Not a pilot-copy manifest: unexpected path ${e.path}`);
    }
    if (pid === null) pid = segs[3];
    else if (segs[3] !== pid) throw new Error(`Manifest spans several projects (${pid}, ${segs[3]})`);
  }
  return pid;
}

function parseArgs(argv) {
  const o = { pos: [], apply: false, key: 'service-account.json', rollback: null, newPid: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--key') o.key = argv[++i];
    else if (a === '--rollback') o.rollback = argv[++i];
    else if (a === '--new-pid') o.newPid = argv[++i];
    else if (a.startsWith('--')) { console.error(`Unknown argument: ${a}`); process.exit(1); }
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
  const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');
  let key;
  try { key = JSON.parse(fs.readFileSync(keyPath, 'utf8')); } catch { console.error('Invalid service-account key file'); process.exit(1); }
  initializeApp({ credential: cert(key) });
  return { db: getFirestore(), FieldValue, Timestamp };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.rollback) {
    const manifest = JSON.parse(fs.readFileSync(o.rollback, 'utf8'));
    const pid = assertPilotManifest(manifest);
    const { db, FieldValue, Timestamp } = await openDb(o.key);
    const r = await rollbackManifest(db, manifest, { FieldValue, Timestamp });
    console.log(`Rollback of pilot ${pid} done: ${r.deleted} deleted, ${r.restored} restored.`);
    return;
  }
  const [sourcePid] = o.pos;
  if (!sourcePid || o.pos.length > 1) {
    console.error('Usage: node scripts/p2-pilot-copy.mjs <sourcePid> [--new-pid X] [--apply] [--key service-account.json] | --rollback <manifest.json>');
    process.exit(1);
  }
  const newPid = o.newPid || defaultNewPid(sourcePid);
  // Key check first: nothing below touches Firestore without it.
  const { db, Timestamp } = await openDb(o.key);
  const now = Timestamp.now();
  const { writes, report, ownerUid } = await preparePilotCopy(db, { sourcePid, newPid, now });
  const t = await targetIsEmpty(db, newPid);
  // Counts and paths only: no people data is printed.
  console.log(`Source:      ${PROJECTS}/${sourcePid} (read only)`);
  console.log(`Pilot copy:  ${PROJECTS}/${newPid}`);
  console.log(`ACL:         owner uid ${ownerUid} only, visibility restricted, schemaVersion 2`);
  console.log(`Docs:        project 1, workstreams ${report.docs.workstreams}, tasks ${report.docs.tasks}, actions ${report.docs.actions}, raid ${report.docs.raid} (total ${report.totalWrites})`);
  console.log(`Split:       programs ${report.counts.programs}, unresolved people ${report.unresolved.length}, duplicate ids ${report.duplicateIds.length}, key collisions ${report.collisions.length}`);
  console.log(`Target:      ${t.empty ? 'empty' : `NOT EMPTY (${t.reason})`}`);
  if (!o.apply) { console.log('Dry run: Firestore untouched. Re-run with --apply to write.'); return; }
  if (!t.empty) { console.error(`Refusing to apply: ${t.reason}.`); process.exit(1); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestPath = `p2-pilot-copy-manifest-${newPid}-${stamp}.json`;
  const r = await applyPilotCopy(db, {
    sourcePid, newPid, now, Timestamp,
    writeManifest: (m) => fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2)),
  });
  console.log(`Applied ${r.written} docs under ${PROJECTS}/${newPid}. Manifest: ${manifestPath}`);
  console.log(`Next: node scripts/p2-compare.mjs ${sourcePid} ${newPid}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e.message || e); process.exit(1); });
