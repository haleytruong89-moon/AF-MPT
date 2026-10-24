// P2.4 Task 3: pure migration plan, reconcile and activity copy. No I/O: the Admin SDK
// shell (scripts/p2-migrate.mjs) reads the live docs, calls these, and writes the result.
import { isDeepStrictEqual } from 'node:util';
import { applyAssignments } from './assignments.mjs';
import { MAX_PROJECT_DOC_BYTES, MIGRATE_STAMP, SUBCOLS, precheckProject } from './migrate-checks.mjs';
import { isValidDocId } from './migrate-normalise.mjs';

export { MAX_PROJECT_DOC_BYTES, MIGRATE_STAMP, SUBCOLS };
export const RECORD_PATH = (pid) => `workspaces/main/migrations/${pid}`;
export const ACTIVITY_SUBCOL = 'activity';

const PROJECTS = 'workspaces/main/projects';

// doc = v1 project doc data. assignments = { programs, workstreams } rows | null.
// -> { blocked, writes, flip, record, report }. Blocked: writes [], flip / record null.
export function planMigration(doc, { pid, dirIndex = null, uidByEmail = new Map(), assignments = null } = {}) {
  const pre = precheckProject(doc, { pid, dirIndex, uidByEmail });
  const issues = { blocking: pre.blocking, warnings: pre.warnings };
  if (pre.blocking.length) {
    return { blocked: pre.blocking, writes: [], flip: null, record: null, report: { issues } };
  }
  const { split, normalised } = pre;
  const base = `${PROJECTS}/${pid}`;

  let writes = [{ path: base, data: { ...split.meta } }];
  const lists = { workstreams: split.workstreams, tasks: split.tasks, actions: split.actions, raid: split.raid, decisions: split.decisions };
  for (const kind of SUBCOLS) {
    for (const d of lists[kind]) {
      writes.push({ path: `${base}/${kind}/${d.id}`, data: { ...d.data, projectId: pid, version: 1, updatedBy: MIGRATE_STAMP } });
    }
  }

  let preview = null;
  if (assignments) {
    const r = applyAssignments(writes, assignments, { dirIndex, uidByEmail }, { projectNames: [doc.name, pid].filter(Boolean) });
    if (r.errors.length) {
      const blocked = r.errors.map((e) => ({ code: 'assignments', detail: e }));
      return { blocked, writes: [], flip: null, record: null, report: { issues: { blocking: blocked, warnings: pre.warnings } } };
    }
    writes = r.writes;
    preview = r.preview;
  }

  const projectWrite = writes.find((w) => w.path === base);
  const subWrites = writes.filter((w) => w.path !== base);
  const pm = projectWrite.data;
  const fields = {
    programMeta: pm.programMeta,
    memberUids: pm.memberUids,
    visibility: doc.visibility ?? 'restricted',
    schemaVersion: 2,
  };
  if (pm.v1Absent) fields.v1Absent = pm.v1Absent;
  const had = new Set(Array.isArray(doc.memberIds) ? doc.memberIds : []);
  if (Array.isArray(pm.memberIds) && pm.memberIds.some((u) => !had.has(u))) fields.memberIds = pm.memberIds;

  const docIds = {};
  for (const kind of SUBCOLS) docIds[kind] = subWrites.filter((w) => w.path.split('/')[4] === kind).map((w) => w.path.split('/')[5]);
  // idMap paths = v1 indices (frozen v1 doc / backup), not the post-drop indices.
  const record = {
    written: { programMeta: fields.programMeta, memberUids: fields.memberUids },
    docIds,
    idMap: normalised.idMap,
  };
  const report = {
    issues,
    docs: {
      programs: Object.keys(fields.programMeta).length,
      ...Object.fromEntries(SUBCOLS.map((k) => [k, docIds[k].length])),
    },
    assignments: preview,
    members: {
      memberUidsAdded: fields.memberUids.filter((u) => !(Array.isArray(doc.memberUids) ? doc.memberUids : []).includes(u)),
      memberIdsAdded: (fields.memberIds || []).filter((u) => !had.has(u)),
    },
    docBytes: Buffer.byteLength(JSON.stringify({ ...doc, ...fields }), 'utf8'),
  };
  return { blocked: null, writes: subWrites, flip: { path: base, fields }, record, report };
}

const isStamped = (d) => d && d.updatedBy === MIGRATE_STAMP && d.version === 1;

// Ruling P4-6 (before the flip). existing = docs found under the sub-collections.
export function reconcileExisting(writes, existing) {
  const planned = new Map(writes.map((w) => [w.path, w]));
  const found = new Map(existing.map((e) => [e.path, e]));
  const toWrite = [];
  const skipped = [];
  const staleDeletes = [];
  const foreign = [];
  for (const w of writes) {
    const e = found.get(w.path);
    if (!e) toWrite.push(w);
    else if (!isStamped(e.data)) foreign.push(w.path);
    else if (isDeepStrictEqual(e.data, w.data)) skipped.push(w.path);
    else toWrite.push(w);
  }
  for (const e of existing) {
    if (planned.has(e.path)) continue;
    if (isStamped(e.data)) staleDeletes.push(e.path);
    else foreign.push(e.path);
  }
  return { toWrite, skipped, staleDeletes, foreign };
}

// Ruling P4-8. entries = v1 activity, newest first. createdAt is a JS Date (the I/O layer
// converts it to a Timestamp). Doc ids are unique; the order of createdAt desc equals
// the input order whenever the valid timestamps already are in that order.
export function planActivityCopy(entries, { uidByEmail = new Map(), now = new Date(), existingIds = new Set() } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const n = list.length;
  const used = new Set();
  const docs = [];
  let clamped = 0;
  let newer = null; // createdAt of the next-newer entry
  list.forEach((e, i) => {
    const entry = e && typeof e === 'object' ? e : {};
    let id = entry.id;
    if (!(typeof id === 'string' && isValidDocId(id)) || used.has(id)) {
      id = `legacy_${n - 1 - i}`;
      for (let k = 2; used.has(id); k++) id = `legacy_${n - 1 - i}_${k}`;
    }
    used.add(id);
    const parsed = entry.timestamp == null ? null : new Date(entry.timestamp);
    const valid = parsed && !Number.isNaN(parsed.getTime());
    let createdAt = valid ? parsed : (newer ? new Date(newer.getTime() - 1) : new Date(now.getTime()));
    // Keep the v1 order: never at or after the next-newer entry (skewed clock, same-ms tie).
    if (valid && newer && createdAt.getTime() >= newer.getTime()) {
      createdAt = new Date(newer.getTime() - 1);
      clamped++;
    }
    newer = createdAt;
    const email = typeof entry.author === 'string' ? entry.author : null;
    const key = email ? email.trim().toLowerCase() : null;
    if (existingIds.has(id)) return;
    docs.push({
      id,
      data: {
        ...entry,
        id,
        author: entry.authorName || entry.author || null,
        authorEmail: entry.author ?? null,
        authorUid: (key && uidByEmail.get(key)) || null,
        createdAt,
        copiedBy: MIGRATE_STAMP,
      },
    });
  });
  docs.clamped = clamped; // entries whose createdAt was moved to keep the v1 order
  return docs;
}

