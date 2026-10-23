// P2.2 Task 5: READ-ONLY check that a v2 pilot copy assembles back to its v1 source.
// Reads the source v1 project doc and the copy (project doc + workstreams / tasks /
// actions / raid), assembles the copy with src/readV2.js (the app's read path) and
// deep-compares it to the source tree. Ignored: the copy's name / ACL / bookkeeping
// keys (IGNORED_TOP) and v2-only keys, incl. the per-doc updatedBy stamp.
// Prints OK or the first differing paths. Exit 1 on a difference or any orphan.
//
// Usage: node scripts/p2-compare.mjs <sourcePid> <copyPid> [--key service-account.json]

import * as fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assembleFromSnapshots } from '../src/readV2.js';

const PROJECTS = 'workspaces/main/projects';
const SUBCOLS = ['workstreams', 'tasks', 'actions', 'raid'];

export const IGNORED_TOP = [
  'id', 'name', 'memberIds', 'roles', 'createdBy', 'createdAt', 'updatedAt', 'rev', 'writeId', 'deletedAt',
  'googleChatWebhook',
  // v2-only project keys
  'programMeta', 'memberUids', 'visibility', 'schemaVersion', 'v1Absent',
];

function stripTop(project) {
  const out = { ...project };
  for (const k of IGNORED_TOP) delete out[k];
  return out;
}

// The copy's workstream / task / action docs carry the script's updatedBy stamp,
// which assemble keeps (it is not a v1 key; planPilotCopy refuses a source item
// that already has one).
function stripStamps(project) {
  const drop = (o) => {
    if (!o || typeof o !== 'object') return o;
    const { updatedBy: _u, ...rest } = o;
    void _u;
    return rest;
  };
  const out = { ...project };
  if (Array.isArray(out.programs)) {
    out.programs = out.programs.map((p) => (p && Array.isArray(p.workstreams)
      ? { ...p, workstreams: p.workstreams.map((w) => {
        const ws = drop(w);
        if (Array.isArray(ws.tasks)) ws.tasks = ws.tasks.map(drop);
        return ws;
      }) }
      : p));
  }
  if (Array.isArray(out.actionItems)) out.actionItems = out.actionItems.map(drop);
  return out;
}

// Paths where a and b differ, depth first, at most `limit`.
export function diffPaths(a, b, limit = 10, path = '', out = []) {
  if (out.length >= limit || isDeepStrictEqual(a, b)) return out;
  const isObj = (v) => v && typeof v === 'object';
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) {
    const keys = Array.isArray(a)
      ? [...Array(Math.max(a.length, b.length)).keys()]
      : [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const before = out.length;
    for (const k of keys) {
      const p = Array.isArray(a) ? `${path}[${k}]` : (path ? `${path}.${k}` : String(k));
      diffPaths(a[k], b[k], limit, p, out);
      if (out.length >= limit) break;
    }
    // Same keys/values but different prototypes or array holes: report the node.
    if (out.length === before) out.push(path || '(root)');
    return out;
  }
  out.push(path || '(root)');
  return out;
}

// Pure. source = v1 project doc data; assembled = assembleFromSnapshots(...).project.
export function compareTrees(source, assembled, limit = 10) {
  const a = stripTop(source);
  const b = stripStamps(stripTop(assembled));
  if (isDeepStrictEqual(a, b)) return { equal: true, diffs: [] };
  return { equal: false, diffs: diffPaths(a, b, limit) };
}

const docsOf = async (db, path) => {
  const out = [];
  (await db.collection(path).get()).forEach((d) => out.push({ id: d.id, data: d.data() }));
  return out;
};

// Reads only. -> { equal, diffs, orphanCount, orphans }.
export async function comparePilot(db, sourcePid, copyPid) {
  if (sourcePid === copyPid) throw new Error('sourcePid and copyPid must differ');
  const src = await db.doc(`${PROJECTS}/${sourcePid}`).get();
  if (!src.exists) throw new Error(`Source ${PROJECTS}/${sourcePid} not found`);
  const copy = await db.doc(`${PROJECTS}/${copyPid}`).get();
  if (!copy.exists) throw new Error(`Copy ${PROJECTS}/${copyPid} not found`);
  const meta = copy.data();
  if (meta.schemaVersion !== 2) throw new Error(`Copy ${copyPid} is not schemaVersion 2`);
  const [ws, tasks, actions, raid] = await Promise.all(SUBCOLS.map((c) => docsOf(db, `${PROJECTS}/${copyPid}/${c}`)));
  const { project, orphans, orphanCount } = assembleFromSnapshots({ meta, ws, tasks, actions, raid });
  const r = compareTrees(src.data(), project);
  return { ...r, orphanCount, orphans };
}

async function openDb(keyPath) {
  if (!fs.existsSync(keyPath)) {
    console.error(`Missing service-account key: ${keyPath} (Firebase Console > Project settings > Service accounts). Nothing was read.`);
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
  const argv = process.argv.slice(2);
  const pos = [];
  let key = 'service-account.json';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--key') key = argv[++i];
    else if (argv[i].startsWith('--')) { console.error(`Unknown argument: ${argv[i]}`); process.exit(1); }
    else pos.push(argv[i]);
  }
  if (pos.length !== 2) {
    console.error('Usage: node scripts/p2-compare.mjs <sourcePid> <copyPid> [--key service-account.json]');
    process.exit(1);
  }
  const db = await openDb(key);
  const r = await comparePilot(db, pos[0], pos[1]);
  if (r.orphanCount > 0) {
    console.error(`ORPHANS: ${r.orphanCount} (${Object.entries(r.orphans).map(([k, v]) => `${k} ${v.length}`).join(', ')})`);
  }
  if (!r.equal) {
    console.error('DIFFERENT. First differing paths:');
    for (const p of r.diffs) console.error(`  ${p}`);
  }
  if (!r.equal || r.orphanCount > 0) process.exit(1);
  console.log(`OK: ${pos[1]} assembles to ${pos[0]} (0 orphans). Read only: Firestore untouched.`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e.message || e); process.exit(1); });
