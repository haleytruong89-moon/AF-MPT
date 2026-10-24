// P2.4 Task 1: pure normalisation of a v1 project tree before the v2 split.
// Gives every program / workstream / task / action / decision a unique, valid Firestore
// doc id (Rulings P4-2, P4-3) and drops `null` list elements. Never mutates its input;
// the frozen v1 arrays in Firestore are not rewritten (Ruling P4-1).
// Paths (idMap.path, removedNulls) use ORIGINAL v1 array indices, so they point at the
// item as the v1 doc stores it.

const KINDS = { program: 'prog', workstream: 'ws', task: 'task', action: 'act', decision: 'dec' };
const ENTRY_LISTS = ['updates', 'checkIns', 'history', 'comments'];

// FNV-1a 32-bit over UTF-8 bytes, base36.
export function fnv1a32(s) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(String(s))) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// JSON with sorted object keys (deterministic content key).
export function stableJson(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
}

// Usable Firestore doc id once stringified: no "/", not "." / "..", not __x__, <= 1500 bytes.
export function isValidDocId(id) {
  if (typeof id === 'number') {
    if (!Number.isFinite(id)) return false;
  } else if (typeof id !== 'string') {
    return false;
  }
  const s = String(id);
  if (!s || s.includes('/') || s === '.' || s === '..' || /^__.*__$/.test(s)) return false;
  return new TextEncoder().encode(s).length <= 1500;
}

const isMissing = (id) => id === undefined || id === null || id === '';
const withoutId = (item) => {
  const { id: _id, ...rest } = item;
  void _id;
  return rest;
};

// Deterministic id for an item without a usable id. n = occurrence of identical content.
export function generatedId(pid, kind, item, n) {
  return `${KINDS[kind]}_m${fnv1a32(`${pid}|${kind}|${stableJson(withoutId(item))}|${n}`)}`;
}

export function normaliseForV2(input, { pid } = {}) {
  const project = structuredClone(input);
  const idMap = [];
  const removedNulls = [];

  // Every valid id present, per kind: generated ids must not collide with any of them.
  const taken = Object.fromEntries(Object.keys(KINDS).map((k) => [k, new Set()]));
  const seen = Object.fromEntries(Object.keys(KINDS).map((k) => [k, new Set()]));
  const counts = new Map();
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const note = (kind, items) => {
    for (const it of arr(items)) {
      if (isObj(it) && !isMissing(it.id) && isValidDocId(it.id)) taken[kind].add(String(it.id));
    }
  };
  note('program', project.programs);
  for (const p of arr(project.programs)) {
    if (!isObj(p)) continue;
    note('workstream', p.workstreams);
    for (const w of arr(p.workstreams)) if (isObj(w)) note('task', w.tasks);
  }
  note('action', project.actionItems);
  note('decision', project.decisions);

  // Drops null elements of obj[key] (when it is an array); returns original indices of kept ones.
  const dropNulls = (obj, key, path) => {
    if (!Array.isArray(obj[key])) return [];
    const origIdx = [];
    const kept = [];
    obj[key].forEach((el, i) => {
      if (el === null || el === undefined) removedNulls.push(`${path}[${i}]`);
      else { kept.push(el); origIdx.push(i); }
    });
    obj[key] = kept;
    return origIdx;
  };

  const fixId = (item, kind, path, original) => {
    const oldId = isMissing(item.id) ? null : item.id;
    if (oldId !== null && isValidDocId(oldId) && !seen[kind].has(String(oldId))) {
      seen[kind].add(String(oldId));
      return;
    }
    const reason = oldId === null ? 'missing' : isValidDocId(oldId) ? 'duplicate' : 'invalid';
    const ckey = `${kind}|${stableJson(withoutId(original))}`;
    const n = (counts.get(ckey) || 0) + 1;
    counts.set(ckey, n);
    const base = generatedId(pid, kind, original, n);
    let cand = base;
    for (let k = 2; taken[kind].has(cand) || seen[kind].has(cand); k++) cand = `${base}_${k}`;
    taken[kind].add(cand);
    seen[kind].add(cand);
    item.id = cand;
    idMap.push({ kind, path, oldId, newId: cand, reason });
  };

  const entryLists = (item, path) => {
    for (const k of ENTRY_LISTS) dropNulls(item, k, `${path}.${k}`);
  };

  const progIdx = dropNulls(project, 'programs', 'programs');
  arr(project.programs).forEach((prog, pk) => {
    if (!isObj(prog)) return;
    const ppath = `programs[${progIdx[pk]}]`;
    fixId(prog, 'program', ppath, structuredClone(prog));
    dropNulls(prog, 'raid', `${ppath}.raid`);
    const wsIdx = dropNulls(prog, 'workstreams', `${ppath}.workstreams`);
    arr(prog.workstreams).forEach((ws, wk) => {
      if (!isObj(ws)) return;
      const wpath = `${ppath}.workstreams[${wsIdx[wk]}]`;
      fixId(ws, 'workstream', wpath, structuredClone(ws));
      const tIdx = dropNulls(ws, 'tasks', `${wpath}.tasks`);
      arr(ws.tasks).forEach((t, tk) => {
        if (!isObj(t)) return;
        const tpath = `${wpath}.tasks[${tIdx[tk]}]`;
        fixId(t, 'task', tpath, structuredClone(t));
        entryLists(t, tpath);
      });
    });
  });
  for (const [key, kind] of [['actionItems', 'action'], ['decisions', 'decision']]) {
    const idx = dropNulls(project, key, key);
    arr(project[key]).forEach((it, k) => {
      if (!isObj(it)) return;
      const path = `${key}[${idx[k]}]`;
      fixId(it, kind, path, structuredClone(it));
      if (kind === 'action') entryLists(it, path);
    });
  }
  return { project, idMap, removedNulls };
}
