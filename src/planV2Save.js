// P2.3 pure v2 save planner. Diffs the App's next in-memory tree (v1 shape) against
// the loaded v2 documents and returns the per-doc writes. No Firestore imports: the
// shim executor builds paths, stamps version / updatedBy / updatedAt and runs the
// batches (one transaction each, in order).
//
// planV2Save(loaded, nextTree, { uid, wid, pid, isOwner, dirIndex, uidByEmail })
//   loaded = { meta, docs: { workstreams, tasks, actions, raid, decisions } },
//            each kind a Map<docId, { version, data }> from the read path.
//   -> { batches: Op[][], metaPatch: object | null, refused: string | null }
//   Op = { kind, op: 'create' | 'update' | 'delete', id, data?, expectVersion? }
//   - create data carries version 1; update data is the full doc without
//     version / updatedBy / updatedAt (the executor writes version = expectVersion + 1).
//   - metaPatch: changed project-doc fields (DELETE_FIELD = remove the field);
//     programMeta as dotted field updates (programMeta.<id>.<field>, a new
//     program whole as programMeta.<id>, a removed one deleted), only for fields
//     that differ from loaded, so a stale tab never clears pmUid / deputyUid set
//     by another writer (programMetaPatch).
//   - refused: 'task-delete' (tasks are never deleted, CLAUDE.md), 'history-wipe'
//     (a non-empty updates list would become empty; guards the ActionForm bug),
//     'close-history-wipe' (wipesCloseHistory: approval history / close stamps removed) or
//     'directory-unavailable' (Ruling AH: dirIndex is null and a pic / contributors
//     value changed or was set on a new doc, so its uid cannot be resolved).
//     'unknown-person' (Wave 2 W3: a changed / newly set pic or contributor name is not in
//     the directory index; refusedName = that name; never saved as no one. Names left
//     unchanged keep their stored uids and are not checked).
//     A refused plan has no batches and no metaPatch.
//
// Ruling R: every new entry of task updates / checkIns, action updates, RAID
// items[].history and mitigationActions[].comments gets authorUid = uid (if missing),
// on updated docs only (created docs are written as-is).
// Ruling AD (C1): the App tree never receives those stamps, so an existing entry
// (matched by id; id-less by suffix alignment, or exact content on a shrink) gets
// the stored authorUid back before diffing.
// Ruling AD (I2): actions / decisions keep their stored `order` while the relative
// order of existing docs is unchanged (the App prepends new ones); new docs get
// orders around them (before the first: min - 1, min - 2...; between: fractions;
// after: max + 1...).
// A RAID doc whose items is [] is never created (App ensureProjectRaid placeholder).
// Ruling X: a task / action list that gains k > 1 entries is written in k steps
// (rules allow one new entry per write); step 1 sits in batch 1 with every other op.
// Ruling P3-8 (Task 8): a task's in-place resolution of a stored, unresolved blocker
// is moved to the append-only blockerResolutions map (unfoldResolutions; the raw
// updates entry is restored, authorUid = uid). k > 1 new map keys are written in k
// steps like Ruling X (one key per write, oldest resolvedAt first). A stored map is
// always re-sent on the full-doc set; none is ever created empty or null.
// Wave 2 W1 (saveChunks.js): for a non-Owner every batch is split into chunks of
// at most MAX_WS_PER_CHUNK work streams, so batches = [...chunks of the main ops,
// ...chunks of step 2, ...]; a work stream's ops stay in one chunk per step.
import { splitProject, assembleProject } from './migrateV2.js';
import { unfoldResolutions, newResolutionKeys } from './blockerResolutions.js';
import { canonicalPerson } from './directory.js';
import { foldName } from './identity.js';
import { chunkOpsByWorkstream, wsTouched } from './saveChunks.js';

export const DELETE_FIELD = Symbol('planV2Save.deleteField');

const KINDS = ['workstreams', 'tasks', 'actions', 'raid', 'decisions'];
const IGNORED = ['version', 'updatedBy', 'updatedAt', 'viaProgramId', 'viaWorkstreamId'];
// Project-doc keys the planner never patches: server / ACL fields the App tree does
// not carry (the shim strips them on read), v2 bookkeeping, frozen v1 copies.
export const META_SKIP = new Set([
  'id', '__v2', 'programMeta', 'memberUids', 'v1Absent', 'programs', 'actionItems', 'decisions',
  'memberIds', 'roles', 'ownerUids', 'deletedAt', 'createdBy', 'createdAt', 'rev', 'writeId',
  'visibility', 'schemaVersion', 'workspaceId', 'version', 'updatedBy', 'updatedAt',
]);
// v2 fields the v1 tree cannot express: kept from the stored doc.
const KEEP_WS = ['leadUid', 'start', 'end'];
export const KEEP_PROGRAM = ['pmUid', 'deputyUid', 'start', 'end'];
const STEP_LISTS = { tasks: ['updates', 'checkIns'], actions: ['updates'] };

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Firestore dotted-path segment we can write without FieldPath escaping.
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * programMeta changes as dotted update keys (Firestore tx.update field paths):
 * a changed field -> 'programMeta.<id>.<field>' (DELETE_FIELD when removed), a new
 * program -> 'programMeta.<id>' whole, a removed program -> 'programMeta.<id>'
 * DELETE_FIELD. KEEP_PROGRAM fields (pmUid / deputyUid / start / end) are written
 * only when the next entry carries a different non-null value; never deleted or nulled. A key or
 * field that is not a plain segment falls back to the whole map.
 */
export function programMetaPatch(storedPM = {}, nextPM = {}) {
  const out = {};
  let unsafe = false;
  const put = (path, v) => { if (!path.every((p) => SAFE_SEGMENT.test(p))) unsafe = true; out[['programMeta', ...path].join('.')] = v; };
  for (const id of Object.keys(storedPM)) if (!hasOwn(nextPM, id)) put([id], DELETE_FIELD);
  for (const [id, e] of Object.entries(nextPM)) {
    const s = storedPM[id];
    if (!s || typeof s !== 'object') { if (!deepEqual(s, e)) put([id], e); continue; }
    for (const k of new Set([...Object.keys(s), ...Object.keys(e || {})])) {
      const keep = KEEP_PROGRAM.includes(k);
      // A KEEP field is never deleted or nulled from here: null / absent in the
      // tree only means this tab never saw a value (e.g. loaded before the script).
      if (!hasOwn(e || {}, k)) { if (!keep) put([id, k], DELETE_FIELD); continue; }
      if (keep && e[k] == null) continue;
      if (!hasOwn(s, k) || !deepEqual(s[k], e[k])) put([id, k], e[k]);
    }
  }
  if (unsafe) return deepEqual(storedPM, nextPM) ? {} : { programMeta: nextPM };
  return out;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

const strip = (data) => {
  const out = { ...data };
  for (const k of IGNORED) delete out[k];
  return out;
};

// Boolean per entry of newList: true = not present in oldList. Entries with an id
// match by id. Id-less entries follow prepend semantics (the App adds newest first):
// only the leading k = new.length - old.length entries can be new, so an in-place
// edit (same size) never counts as new.
function newFlags(oldList, newList) {
  const old = Array.isArray(oldList) ? oldList : [];
  const ids = new Set(old.filter((e) => isObj(e) && e.id != null).map((e) => e.id));
  const k = newList.length - old.length;
  return newList.map((e, i) => (isObj(e) && e.id != null ? !ids.has(e.id) : i < k));
}

const stampEntry = (e, uid) => (isObj(e) && !hasOwn(e, 'authorUid') ? { ...e, authorUid: uid } : e);

function stampList(oldList, newList, uid) {
  if (!Array.isArray(newList)) return newList;
  const flags = newFlags(oldList, newList);
  return newList.map((e, i) => (flags[i] ? stampEntry(e, uid) : e));
}

const matchOld = (oldList, e, i) => {
  if (!Array.isArray(oldList)) return undefined;
  if (isObj(e) && e.id != null) return oldList.find((o) => isObj(o) && o.id === e.id);
  const o = oldList[i];
  return isObj(o) && o.id == null ? o : undefined;
};

// Ruling AD (C1): give each existing entry of newList that lacks authorUid the
// stored one. Id entries match by id; id-less entries by suffix alignment
// (old[i - k], the App prepends) when the list grew or kept its size, and only on
// an exact content match when it shrank (no guess about which entry was removed).
const withoutAuthor = (e) => {
  const { authorUid: _a, ...rest } = e;
  void _a;
  return rest;
};
function carryList(oldList, newList) {
  if (!Array.isArray(newList) || !Array.isArray(oldList) || !oldList.length) return newList;
  const k = newList.length - oldList.length;
  return newList.map((e, i) => {
    if (!isObj(e) || hasOwn(e, 'authorUid')) return e;
    let o;
    if (e.id != null) o = oldList.find((x) => isObj(x) && x.id === e.id);
    else {
      const c = oldList[i - k];
      if (isObj(c) && c.id == null && (k >= 0 || deepEqual(withoutAuthor(c), e))) o = c;
    }
    return isObj(o) && hasOwn(o, 'authorUid') ? { ...e, authorUid: o.authorUid } : e;
  });
}

// Apply fn(oldList, newList) to every entry list a doc carries: task updates /
// checkIns, action updates, RAID items[].history and
// items[].mitigationActions[].comments (the App's field, App.jsx MitigationActionRow).
function mapEntryLists(kind, oldData, data, fn) {
  const out = { ...data };
  for (const k of STEP_LISTS[kind] || []) {
    if (hasOwn(data, k)) out[k] = fn(oldData?.[k], data[k]);
  }
  if (kind === 'raid' && Array.isArray(data.items)) {
    out.items = data.items.map((item, i) => {
      if (!isObj(item)) return item;
      const old = matchOld(oldData?.items, item, i) || {};
      const o = { ...item };
      if (hasOwn(item, 'history')) o.history = fn(old.history, item.history);
      if (Array.isArray(item.mitigationActions)) {
        o.mitigationActions = item.mitigationActions.map((m, mi) => {
          if (!isObj(m) || !hasOwn(m, 'comments')) return m;
          const om = matchOld(old.mitigationActions, m, mi) || {};
          return { ...m, comments: fn(om.comments, m.comments) };
        });
      }
      return o;
    });
  }
  return out;
}

const stampDoc = (kind, oldData, data, uid) => mapEntryLists(kind, oldData, data, (o, n) => stampList(o, n, uid));
export const carryDoc = (kind, oldData, data) => mapEntryLists(kind, oldData, data, carryList);

// Ruling AD (I2): next = [{ id, data }] in tree order. When the stored docs that
// remain keep their relative order (non-decreasing stored `order`: concurrent
// prepends can tie), reuse it and slot new docs around them; otherwise keep the
// split's index renumbering.
export function keepOrder(stored, next) {
  const orderOf = (id) => stored.get(id)?.data?.order;
  const ords = next.filter((d) => stored.has(d.id)).map((d) => orderOf(d.id));
  if (!ords.length || !ords.every((o) => typeof o === 'number' && Number.isFinite(o))) return next;
  if (!ords.every((o, i) => i === 0 || ords[i - 1] <= o)) return next;
  const out = next.map((d) => ({ id: d.id, data: { ...d.data } }));
  let prev = null; // stored order of the last existing doc seen
  let run = []; // new docs since then
  const flush = (nextOrd) => {
    run.forEach((d, j) => {
      if (prev == null) d.data.order = nextOrd - run.length + j;
      else if (nextOrd == null) d.data.order = prev + 1 + j;
      else d.data.order = prev + ((nextOrd - prev) * (j + 1)) / (run.length + 1);
    });
    run = [];
  };
  for (const d of out) {
    if (!stored.has(d.id)) { run.push(d); continue; }
    flush(orderOf(d.id));
    d.data.order = orderOf(d.id);
    prev = d.data.order;
  }
  flush(null);
  return out;
}

const blank = (v) => v == null || (typeof v === 'string' && !v.trim());
// W3: the first name in `value` (string or list) that is not already in `before`, is not
// a contributor group and is unknown to the directory; null when all resolve.
function unknownName(dirIndex, groups, value, before) {
  const prev = new Set((Array.isArray(before) ? before : [before]).filter((x) => !blank(x)).map((x) => foldName(String(x))));
  for (const x of Array.isArray(value) ? value : [value]) {
    if (blank(x)) continue;
    const s = String(x);
    if (prev.has(foldName(s)) || groups.has(foldName(s))) continue;
    if (!canonicalPerson(dirIndex, s).known) return s;
  }
  return null;
}
const hasPerson = (v) => (Array.isArray(v) ? v.some((x) => !blank(x)) : !blank(v));

// Keep stored v2 fields the v1 tree cannot express (roles, stored resolutions).
export function overlay(kind, stored, data) {
  const out = { ...data };
  if (kind === 'workstreams') {
    for (const k of KEEP_WS) if (hasOwn(stored, k)) out[k] = stored[k];
  }
  if (kind === 'tasks' || kind === 'actions') {
    if (deepEqual(stored.pic, data.pic)) {
      for (const k of ['picUid', 'picEmail']) if (hasOwn(stored, k)) out[k] = stored[k];
    }
  }
  if (kind === 'tasks' && deepEqual(stored.contributors, data.contributors) && hasOwn(stored, 'contributorUids')) {
    out.contributorUids = stored.contributorUids;
  }
  return out;
}

// P3.1 final review I2: approval history feeds performance scoring. A task update
// must not shrink closeRequestHistory (missing = []) and must not remove a stored
// approvedByUid / approvedAt / closedByUid while the task stays closed (any status
// but Planned / InProgress). Reopen (closeFlow: open status + stamps cleared in the
// same write) passes.
const CLOSE_STAMPS = ['approvedByUid', 'approvedAt', 'closedByUid'];
const REOPEN_STATUSES = ['Planned', 'InProgress'];
const histLen = (d) => (Array.isArray(d?.closeRequestHistory) ? d.closeRequestHistory.length : 0);
export function wipesCloseHistory(old, data) {
  if (histLen(data) < histLen(old)) return true;
  if (!['Completed', 'Dropped'].includes(old?.status) || REOPEN_STATUSES.includes(data?.status)) return false;
  return CLOSE_STAMPS.some((k) => old[k] != null && data?.[k] == null);
}

const listOf = (m) => [...(m || new Map()).entries()].map(([id, e]) => ({ id, data: e.data }));
const versionOf = (e) => (typeof e.version === 'number' ? e.version : e.data?.version);

/**
 * PR-A final fix: the program a decision belongs to by its related tasks: the
 * programs of relatedTaskIds that are keys of programMeta; when they span several
 * programs, the first in program order (programMeta[k].order; ties keep the
 * relatedTaskIds order). null when none resolves.
 */
export function programOfRelatedTasks(relatedTaskIds, taskProgramOf, programMeta) {
  const pm = programMeta || {};
  const progs = (Array.isArray(relatedTaskIds) ? relatedTaskIds : [])
    .map((t) => taskProgramOf(t))
    .filter((p) => typeof p === 'string' && hasOwn(pm, p));
  if (!progs.length) return null;
  return [...progs].sort((a, b) => (pm[a]?.order ?? 0) - (pm[b]?.order ?? 0))[0];
}

function roleClaims(loaded, uid) {
  const pm = loaded.meta.programMeta || {};
  const progOrder = (k) => pm[k]?.order ?? 0;
  const programs = Object.keys(pm).sort((a, b) => progOrder(a) - progOrder(b));
  const isPM = (k) => !!uid && !!pm[k] && (pm[k].pmUid === uid || pm[k].deputyUid === uid);
  const led = listOf(loaded.docs.workstreams)
    .filter((w) => uid && w.data.leadUid === uid)
    .sort((a, b) => progOrder(a.data.programId) - progOrder(b.data.programId) || (a.data.order ?? 0) - (b.data.order ?? 0));
  const wsProgram = (wsId) => (typeof wsId === 'string' ? loaded.docs.workstreams?.get(wsId)?.data?.programId ?? null : null);
  return {
    // Wave 2 R5 (supersedes Ruling AD / I3): a claim on THIS program only; no
    // role here -> {} (rules refuse; the UI hides the edit).
    raid(programId) {
      if (programId == null) return {};
      if (isPM(programId)) return { viaProgramId: programId };
      const w = led.find((x) => x.data.programId === programId);
      return w ? { viaWorkstreamId: w.id } : {};
    },
    // Ruling W2-4: the program of a stored decision's claim (null = none).
    programOf(stored) {
      return typeof stored?.viaProgramId === 'string' ? stored.viaProgramId : wsProgram(stored?.viaWorkstreamId);
    },
    // stored = the stored decision doc (update): claim on the program of its
    // stored claim (Ruling W2-4), none when it has none. New decision: as before.
    decision(stored) {
      if (stored) return this.raid(this.programOf(stored));
      const p = programs.find(isPM);
      if (p) return { viaProgramId: p };
      return led.length ? { viaWorkstreamId: led[0].id } : {};
    },
  };
}

// Ruling X: [data] when each step list gains at most one entry, else one data per
// step, step i holding the i oldest new entries (the App's newest-first order kept).
function steps(kind, oldData, data) {
  const lists = (STEP_LISTS[kind] || []).filter((k) => Array.isArray(data[k]));
  const plan = lists.map((k) => {
    const flags = newFlags(oldData[k], data[k]);
    const newIdx = flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0).sort((a, b) => b - a);
    return { k, newIdx };
  });
  // Ruling P3-8: one new blockerResolutions key per step as well.
  const newKeys = kind === 'tasks' ? newResolutionKeys(oldData, data) : [];
  const n = Math.max(1, newKeys.length, ...plan.map((p) => p.newIdx.length));
  if (n === 1) return [data];
  const out = [];
  for (let s = 1; s <= n; s++) {
    const d = { ...data };
    for (const { k, newIdx } of plan) {
      const keep = new Set(newIdx.slice(0, s));
      d[k] = data[k].filter((_, i) => !newIdx.includes(i) || keep.has(i));
    }
    if (newKeys.length > s) {
      const later = new Set(newKeys.slice(s));
      d.blockerResolutions = Object.fromEntries(Object.entries(data.blockerResolutions).filter(([key]) => !later.has(key)));
    }
    out.push(d);
  }
  return out;
}

// Wave 2: a created task's updates (newest first) as k steps, step i holding the i
// oldest entries; missing authorUid = uid. Step 0 is the create.
function createSteps(data, uid) {
  const ups = data.updates.map((u) => (u && typeof u === 'object' && !u.authorUid ? { ...u, authorUid: uid } : u));
  const out = [];
  for (let s = 1; s <= ups.length; s++) out.push({ ...data, updates: ups.slice(ups.length - s) });
  return out;
}

// The tree reached the App through JSON.stringify (shim read path), so compare
// against the loaded data in the same form (Timestamps -> their toJSON shape,
// undefined dropped). Plain-JSON input is unchanged.
const asJson = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
function normalizeLoaded(loaded) {
  const docs = {};
  for (const kind of KINDS) {
    const m = loaded.docs?.[kind] || new Map();
    docs[kind] = new Map([...m.entries()].map(([id, e]) => [id, { ...e, data: asJson(e.data) }]));
  }
  return { meta: asJson(loaded.meta || {}), docs };
}

export function planV2Save(rawLoaded, nextTree, { uid, wid, pid, isOwner = false, dirIndex = null, uidByEmail = new Map() } = {}) {
  const loaded = normalizeLoaded(rawLoaded);
  const none = (refused, refusedName) => ({ batches: [], metaPatch: null, refused, ...(refusedName ? { refusedName } : {}) });
  const groups = new Set((nextTree.contributorRegistry || []).map((g) => foldName(typeof g === 'string' ? g : g?.name || '')).filter(Boolean));
  // Only checked with a directory: without one, 'directory-unavailable' applies.
  const unknownIn = (kind, old, data) => {
    if (!dirIndex) return null;
    const pic = deepEqual(old.pic, data.pic) ? null : unknownName(dirIndex, groups, data.pic, old.pic);
    if (pic) return pic;
    if (kind !== 'tasks' || deepEqual(old.contributors, data.contributors)) return null;
    return unknownName(dirIndex, groups, data.contributors, old.contributors);
  };
  const next = splitProject({ ...nextTree, id: pid ?? nextTree.id }, { wid, dirIndex, uidByEmail });
  const docs = loaded.docs || {};
  for (const kind of ['actions', 'decisions']) next[kind] = keepOrder(docs[kind] || new Map(), next[kind]);
  const claims = roleClaims(loaded, uid);
  // task id -> programId (this save's tree first, then the stored docs).
  const taskProgram = new Map();
  for (const [id, e] of docs.tasks || new Map()) taskProgram.set(id, e.data?.programId ?? null);
  for (const { id, data } of next.tasks || []) taskProgram.set(id, data?.programId ?? null);

  // Docs the read path could not attach are not in the tree: never delete them.
  const { orphans } = assembleProject(
    loaded.meta, listOf(docs.workstreams), listOf(docs.tasks), listOf(docs.actions),
    listOf(docs.raid), listOf(docs.decisions),
  );
  const orphanIds = { workstreams: orphans.workstreams, tasks: orphans.tasks, actions: orphans.actions, raid: orphans.raid, decisions: [] };

  const skippedRaid = new Set();
  const batches = [[]];
  const push = (i, op) => { while (batches.length <= i) batches.push([]); batches[i].push(op); };

  for (const kind of KINDS) {
    const stored = docs[kind] || new Map();
    const nextById = new Map(next[kind].map((d) => [d.id, d.data]));
    // storedData = the stored doc (updates only, claims not stripped).
    const withClaim = (data, storedData) => {
      if (kind !== 'raid' && kind !== 'decisions') return data;
      if (isOwner) {
        // Wave 2 R5: an Owner edit keeps a decision's stored claim, so the
        // decision stays in its program (the claim is its program, W2-4).
        if (kind !== 'decisions') return data;
        const keep = {};
        for (const k of ['viaProgramId', 'viaWorkstreamId']) if (typeof storedData?.[k] === 'string') keep[k] = storedData[k];
        if (storedData && claims.programOf(storedData) != null) return { ...data, ...keep };
        // PR-A final fix: an Owner create / edit of a decision whose stored claim
        // resolves to no program files it under the program of its related tasks
        // (first in program order), so PM / Sub-PM of that program can edit it.
        // No related task in programMeta -> stays as is (Owner-only, W2-9).
        const prg = programOfRelatedTasks(data.relatedTaskIds, (t) => taskProgram.get(t), loaded.meta.programMeta);
        return prg ? { ...data, viaProgramId: prg } : { ...data, ...keep };
      }
      const c = kind === 'raid' ? claims.raid(data.programId) : claims.decision(storedData);
      return { ...data, ...c };
    };

    for (const [id, entry] of stored) {
      const old = strip(entry.data || {});
      if (!nextById.has(id)) {
        if (orphanIds[kind].includes(id)) continue;
        if (kind === 'tasks') return none('task-delete');
        push(0, { kind, op: 'delete', id, expectVersion: versionOf(entry) });
        continue;
      }
      let data = overlay(kind, old, strip(nextById.get(id)));
      if (kind === 'tasks') data = unfoldResolutions(old, data, uid);
      data = carryDoc(kind, old, data);
      if (deepEqual(data, old)) continue;
      // Ruling AH: without the directory a changed person cannot be resolved; never
      // write null uids for it.
      if (!dirIndex && (kind === 'tasks' || kind === 'actions')
        && ((!deepEqual(old.pic, data.pic) && hasPerson(data.pic))
          || (kind === 'tasks' && !deepEqual(old.contributors, data.contributors) && hasPerson(data.contributors)))) {
        return none('directory-unavailable');
      }
      if (kind === 'tasks' || kind === 'actions') {
        const who = unknownIn(kind, old, data);
        if (who) return none('unknown-person', who);
      }
      if ((kind === 'tasks' || kind === 'actions') && Array.isArray(old.updates) && old.updates.length
        && !(Array.isArray(data.updates) && data.updates.length)) {
        return none('history-wipe');
      }
      if (kind === 'tasks' && wipesCloseHistory(old, data)) return none('close-history-wipe');
      const stamped = stampDoc(kind, old, data, uid);
      const v = versionOf(entry);
      steps(kind, old, stamped).forEach((d, i) => {
        push(i, { kind, op: 'update', id, data: withClaim(d, entry.data || {}), expectVersion: v + i });
      });
    }
    for (const { id, data } of next[kind]) {
      if (stored.has(id)) continue;
      // Ensure-on-load placeholders (App ensureProjectRaid sets raid: [] on every
      // program) must not become RAID docs: a non-manager has no claim and the
      // denied create would fail the whole batch.
      if (kind === 'raid' && Array.isArray(data.items) && data.items.length === 0) {
        skippedRaid.add(id);
        continue;
      }
      if (!dirIndex && (kind === 'tasks' || kind === 'actions') && (hasPerson(data.pic) || hasPerson(data.contributors))) {
        return none('directory-unavailable');
      }
      if (kind === 'tasks' || kind === 'actions') {
        const who = unknownIn(kind, {}, data);
        if (who) return none('unknown-person', who);
      }
      // Created docs are not stamped (copied history keeps its original authors),
      // except a non-Owner task create (Wave 2 R1 / W4): rules allow at most one
      // update entry, authored by the caller. Entries without an authorUid get uid;
      // the oldest rides in the create, the rest follow as single-entry updates.
      if (kind === 'tasks' && !isOwner && Array.isArray(data.updates) && data.updates.length) {
        createSteps(strip(data), uid).forEach((d, i) => {
          push(i, i === 0
            ? { kind, op: 'create', id, data: withClaim({ ...d, version: 1 }) }
            : { kind, op: 'update', id, data: withClaim(d), expectVersion: i });
        });
        continue;
      }
      push(0, { kind, op: 'create', id, data: withClaim({ ...strip(data), version: 1 }) });
    }
  }

  // Project doc.
  const metaPatch = {};
  const lm = loaded.meta || {};
  const nm = next.meta;
  for (const k of new Set([...Object.keys(lm), ...Object.keys(nm)])) {
    if (META_SKIP.has(k)) continue;
    if (!hasOwn(nm, k)) metaPatch[k] = DELETE_FIELD;
    else if (!hasOwn(lm, k) || !deepEqual(lm[k], nm[k])) metaPatch[k] = nm[k];
  }
  const storedPM = lm.programMeta || {};
  const nextPM = {};
  for (const [key, entry] of Object.entries(nm.programMeta)) {
    const s = storedPM[key];
    const e = { ...entry };
    if (s) {
      for (const k of KEEP_PROGRAM) if (hasOwn(s, k)) e[k] = s[k];
      // A non-Owner cannot write the project doc; a present RAID doc already wins
      // over the stored flags, so keep them as stored. Same when the RAID create
      // was skipped (no doc, so the 'raid' flag must stay).
      if (!isOwner || skippedRaid.has(key)) {
        if (hasOwn(s, '__absent')) e.__absent = s.__absent;
        else delete e.__absent;
      }
    }
    nextPM[key] = e;
  }
  Object.assign(metaPatch, programMetaPatch(storedPM, nextPM));

  let out = batches[0].length ? batches : [];
  // Wave 2 W1: a non-Owner save runs each batch in chunks of at most
  // MAX_WS_PER_CHUNK work streams (rules access-call budget). Chunks of batch i
  // all precede those of batch i + 1, so a follow-up step (Ruling X, createSteps)
  // still runs after the chunk that wrote its previous step.
  if (!isOwner && out.length) {
    const wsOf = (op) => wsTouched(op, docs[op.kind]?.get(op.id)?.data);
    out = out.flatMap((b) => chunkOpsByWorkstream(b, wsOf));
  }
  // W2: loaded value of every top-level key the patch writes (not the dotted
  // programMeta.* field paths, nor the whole-map programMeta fallback: those keep
  // the live-role overlay in the executor). The executor refuses the save when
  // the live doc no longer matches (a stale tab must not overwrite newer edits).
  const metaBase = {};
  for (const k of Object.keys(metaPatch)) if (!k.includes('.') && k !== 'programMeta') metaBase[k] = lm[k];
  const hasMeta = Object.keys(metaPatch).length > 0;
  return { batches: out, metaPatch: hasMeta ? metaPatch : null, ...(hasMeta ? { metaBase } : {}), refused: null };
}
