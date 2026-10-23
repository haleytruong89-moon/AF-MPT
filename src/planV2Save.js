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
//     programMeta, when changed, is given whole.
//   - refused: 'task-delete' (tasks are never deleted, CLAUDE.md) or 'history-wipe'
//     (a non-empty updates list would become empty; guards the ActionForm bug).
//     A refused plan has no batches and no metaPatch.
//
// Ruling R: every new entry of task updates / checkIns, action updates, RAID
// items[].history and mitigations[].comments gets authorUid = uid (if missing), on
// updated docs only (created docs are written as-is).
// A RAID doc whose items is [] is never created (App ensureProjectRaid placeholder).
// Ruling X: a task / action list that gains k > 1 entries is written in k steps
// (rules allow one new entry per write); step 1 sits in batch 1 with every other op.
import { splitProject, assembleProject } from './migrateV2.js';

export const DELETE_FIELD = Symbol('planV2Save.deleteField');

const KINDS = ['workstreams', 'tasks', 'actions', 'raid', 'decisions'];
const IGNORED = ['version', 'updatedBy', 'updatedAt', 'viaProgramId', 'viaWorkstreamId'];
// Project-doc keys the planner never patches: server / ACL fields the App tree does
// not carry (the shim strips them on read), v2 bookkeeping, frozen v1 copies.
const META_SKIP = new Set([
  'id', '__v2', 'programMeta', 'memberUids', 'v1Absent', 'programs', 'actionItems', 'decisions',
  'memberIds', 'roles', 'ownerUids', 'deletedAt', 'createdBy', 'createdAt', 'rev', 'writeId',
  'visibility', 'schemaVersion', 'workspaceId', 'version', 'updatedBy', 'updatedAt',
]);
// v2 fields the v1 tree cannot express: kept from the stored doc.
const KEEP_WS = ['leadUid', 'start', 'end'];
const KEEP_PROGRAM = ['pmUid', 'deputyUid', 'start', 'end'];
const STEP_LISTS = { tasks: ['updates', 'checkIns'], actions: ['updates'] };

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

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

function stampRaidItems(oldItems, items, uid) {
  if (!Array.isArray(items)) return items;
  return items.map((item, i) => {
    if (!isObj(item)) return item;
    const old = matchOld(oldItems, item, i) || {};
    const out = { ...item };
    if (hasOwn(item, 'history')) out.history = stampList(old.history, item.history, uid);
    if (Array.isArray(item.mitigations)) {
      out.mitigations = item.mitigations.map((m, mi) => {
        if (!isObj(m) || !hasOwn(m, 'comments')) return m;
        const om = matchOld(old.mitigations, m, mi) || {};
        return { ...m, comments: stampList(om.comments, m.comments, uid) };
      });
    }
    return out;
  });
}

function stampDoc(kind, oldData, data, uid) {
  const out = { ...data };
  for (const k of STEP_LISTS[kind] || []) {
    if (hasOwn(data, k)) out[k] = stampList(oldData?.[k], data[k], uid);
  }
  if (kind === 'raid' && hasOwn(data, 'items')) out.items = stampRaidItems(oldData?.items, data.items, uid);
  return out;
}

// Keep stored v2 fields the v1 tree cannot express (roles, stored resolutions).
function overlay(kind, stored, data) {
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

const listOf = (m) => [...(m || new Map()).entries()].map(([id, e]) => ({ id, data: e.data }));
const versionOf = (e) => (typeof e.version === 'number' ? e.version : e.data?.version);

function roleClaims(loaded, uid) {
  const pm = loaded.meta.programMeta || {};
  const progOrder = (k) => pm[k]?.order ?? 0;
  const programs = Object.keys(pm).sort((a, b) => progOrder(a) - progOrder(b));
  const isPM = (k) => !!uid && !!pm[k] && (pm[k].pmUid === uid || pm[k].deputyUid === uid);
  const led = listOf(loaded.docs.workstreams)
    .filter((w) => uid && w.data.leadUid === uid)
    .sort((a, b) => progOrder(a.data.programId) - progOrder(b.data.programId) || (a.data.order ?? 0) - (b.data.order ?? 0));
  return {
    raid(programId) {
      if (isPM(programId)) return { viaProgramId: programId };
      const w = led.find((x) => x.data.programId === programId);
      return w ? { viaWorkstreamId: w.id } : {};
    },
    decision() {
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
  const n = Math.max(1, ...plan.map((p) => p.newIdx.length));
  if (n === 1) return [data];
  const out = [];
  for (let s = 1; s <= n; s++) {
    const d = { ...data };
    for (const { k, newIdx } of plan) {
      const keep = new Set(newIdx.slice(0, s));
      d[k] = data[k].filter((_, i) => !newIdx.includes(i) || keep.has(i));
    }
    out.push(d);
  }
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
  const none = (refused) => ({ batches: [], metaPatch: null, refused });
  const next = splitProject({ ...nextTree, id: pid ?? nextTree.id }, { wid, dirIndex, uidByEmail });
  const docs = loaded.docs || {};
  const claims = roleClaims(loaded, uid);

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
    const withClaim = (data) => {
      if (isOwner || (kind !== 'raid' && kind !== 'decisions')) return data;
      const c = kind === 'raid' ? claims.raid(data.programId) : claims.decision();
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
      const data = overlay(kind, old, strip(nextById.get(id)));
      if (deepEqual(data, old)) continue;
      if ((kind === 'tasks' || kind === 'actions') && Array.isArray(old.updates) && old.updates.length
        && !(Array.isArray(data.updates) && data.updates.length)) {
        return none('history-wipe');
      }
      const stamped = stampDoc(kind, old, data, uid);
      const v = versionOf(entry);
      steps(kind, old, stamped).forEach((d, i) => {
        push(i, { kind, op: 'update', id, data: withClaim(d), expectVersion: v + i });
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
      // Created docs are not stamped: rules do not check creates, and copied
      // history keeps its original authors.
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
  if (!deepEqual(nextPM, storedPM)) metaPatch.programMeta = nextPM;

  const out = batches[0].length ? batches : [];
  return { batches: out, metaPatch: Object.keys(metaPatch).length ? metaPatch : null, refused: null };
}
