import { describe, it, expect } from 'vitest';
import { chunkOpsByWorkstream, wsTouched, stableEqual, MAX_WS_PER_CHUNK } from '../../src/saveChunks.js';
import { splitProject, assembleProject } from '../../src/migrateV2.js';
import { planV2Save } from '../../src/planV2Save.js';
import { executeV2Save, applyWritten } from '../../src/execV2Save.js';

// Wave 2 W1: non-Owner v2 saves run in chunks of at most 8 work streams.

const clone = (x) => JSON.parse(JSON.stringify(x));
const taskOp = (id, ws, extra = {}) => ({ kind: 'tasks', op: 'update', id, data: { workstreamId: ws, ...extra }, expectVersion: 1 });
const wsOfData = (op) => op.data?.workstreamId ?? null;
const distinctWs = (chunk, wsOf) => new Set(chunk.flatMap((op) => [wsOf(op)].flat().filter(Boolean)));

describe('chunkOpsByWorkstream', () => {
  it('MAX_WS_PER_CHUNK is 8', () => {
    expect(MAX_WS_PER_CHUNK).toBe(8);
  });

  it('20 WS x 9 tasks -> 3 chunks of <= 8 WS; a WS never splits; order kept', () => {
    const ops = [];
    // Interleaved: task j of every WS, so order inside a chunk is not trivially grouped.
    for (let j = 0; j < 9; j++) for (let w = 0; w < 20; w++) ops.push(taskOp(`t${w}_${j}`, `w${w}`));
    const chunks = chunkOpsByWorkstream(ops, wsOfData);
    expect(chunks).toHaveLength(3);
    expect(chunks.flat()).toHaveLength(180);
    const seen = new Map();
    chunks.forEach((c, i) => {
      expect(distinctWs(c, wsOfData).size).toBeLessThanOrEqual(8);
      for (const op of c) {
        const w = op.data.workstreamId;
        if (seen.has(w)) expect(seen.get(w)).toBe(i);
        seen.set(w, i);
      }
      const idx = c.map((op) => ops.indexOf(op));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    });
    expect(chunks.map((c) => distinctWs(c, wsOfData).size)).toEqual([8, 8, 4]);
  });

  it('a move op counts both work streams and keeps both groups together', () => {
    const ops = [taskOp('a', 'w1'), taskOp('b', 'w3'), { ...taskOp('m', 'w2'), from: 'w1' }, taskOp('c', 'w2')];
    const wsOf = (op) => [op.data.workstreamId, op.from].filter(Boolean);
    const chunks = chunkOpsByWorkstream(ops, wsOf, 2);
    expect(chunks.map((c) => c.map((o) => o.id))).toEqual([['a', 'm', 'c'], ['b']]);
  });

  it('ops with no work stream go in the first chunk', () => {
    const ops = [taskOp('a', 'w1'), taskOp('b', 'w2'), { kind: 'raid', op: 'update', id: 'pg1', data: {} }, taskOp('c', 'w3')];
    const chunks = chunkOpsByWorkstream(ops, wsOfData, 1);
    expect(chunks.map((c) => c.map((o) => o.id))).toEqual([['a', 'pg1'], ['b'], ['c']]);
    expect(chunkOpsByWorkstream([ops[2]], wsOfData)).toEqual([[ops[2]]]);
    expect(chunkOpsByWorkstream([], wsOfData)).toEqual([]);
  });

  it('a group larger than max becomes its own chunk', () => {
    const ops = [taskOp('a', 'w1'), { ...taskOp('m', 'w2'), from: 'w3' }, taskOp('b', 'w4')];
    const wsOf = (op) => [op.data.workstreamId, op.from].filter(Boolean);
    const chunks = chunkOpsByWorkstream(ops, wsOf, 1);
    expect(chunks.map((c) => c.map((o) => o.id))).toEqual([['a'], ['m'], ['b']]);
  });
});

describe('wsTouched (the work streams the rules read per op)', () => {
  it('tasks / actions: new and stored workstreamId (a move counts both)', () => {
    expect(wsTouched(taskOp('t', 'w2'), { workstreamId: 'w1' })).toEqual(['w2', 'w1']);
    expect(wsTouched(taskOp('t', 'w1'), { workstreamId: 'w1' })).toEqual(['w1']);
    expect(wsTouched({ kind: 'actions', op: 'create', id: 'a', data: { workstreamId: null } })).toEqual([]);
    expect(wsTouched({ kind: 'actions', op: 'delete', id: 'a' }, { workstreamId: 'w5' })).toEqual(['w5']);
  });
  it('workstreams: the doc itself', () => {
    expect(wsTouched({ kind: 'workstreams', op: 'update', id: 'w7', data: {} })).toEqual(['w7']);
  });
  it('raid: the Sub-PM claim; decisions: the new and the stored claim', () => {
    expect(wsTouched({ kind: 'raid', op: 'update', id: 'pg1', data: { viaWorkstreamId: 'w3' } }, { viaWorkstreamId: 'w9' })).toEqual(['w3']);
    expect(wsTouched({ kind: 'raid', op: 'update', id: 'pg1', data: { viaProgramId: 'pg1' } })).toEqual([]);
    expect(wsTouched({ kind: 'decisions', op: 'update', id: 'd', data: { viaWorkstreamId: 'w3' } }, { viaWorkstreamId: 'w4' })).toEqual(['w3', 'w4']);
    expect(wsTouched({ kind: 'decisions', op: 'update', id: 'd', data: { viaProgramId: 'pg1' } }, { viaWorkstreamId: 'w4' })).toEqual(['w4']);
  });
});

// ── Planner wiring ──
const N_WS = 20;
const PER_WS = 9;
function bigLoaded() {
  const tree = {
    id: 'pc', name: 'CRP-like',
    programs: [{
      id: 'pg1', name: 'P1', raid: [],
      workstreams: Array.from({ length: N_WS }, (_, w) => ({
        id: `w${w}`, name: `WS ${w}`,
        tasks: Array.from({ length: PER_WS }, (_, j) => ({ id: `t${w}_${j}`, name: `T ${w}.${j}`, status: 'InProgress', updates: [], checkIns: [] })),
      })),
    }],
    actionItems: [], decisions: [],
  };
  const s = splitProject(tree, { wid: 'main' });
  s.meta.programMeta.pg1.pmUid = 'uidPM';
  const docs = {};
  for (const kind of ['workstreams', 'tasks', 'actions', 'raid', 'decisions']) {
    docs[kind] = new Map(s[kind].map(({ id, data }) => [id, { version: 1, data: { ...data, version: 1 } }]));
  }
  return { meta: s.meta, docs };
}
const treeOf = (loaded) => {
  const list = (m) => [...m.entries()].map(([id, e]) => ({ id, data: e.data }));
  const d = loaded.docs;
  return clone(assembleProject(loaded.meta, list(d.workstreams), list(d.tasks), list(d.actions), list(d.raid), list(d.decisions)).project);
};
const ctx = (over = {}) => ({ uid: 'uidPM', wid: 'main', pid: 'pc', isOwner: false, ...over });
const renameAll = (tree) => { for (const w of tree.programs[0].workstreams) for (const t of w.tasks) t.name += ' (e)'; };
const wsOfTask = (op) => op.data.workstreamId;

describe('planV2Save chunks non-Owner saves (W1)', () => {
  it('non-Owner: 20 WS x 9 tasks -> 3 batches of <= 8 WS; Owner: one batch', () => {
    const loaded = bigLoaded();
    const tree = treeOf(loaded);
    renameAll(tree);
    const pm = planV2Save(loaded, tree, ctx());
    expect(pm.refused).toBe(null);
    expect(pm.batches).toHaveLength(3);
    expect(pm.batches.flat()).toHaveLength(N_WS * PER_WS);
    for (const b of pm.batches) expect(distinctWs(b, wsOfTask).size).toBeLessThanOrEqual(8);
    const own = planV2Save(loaded, tree, ctx({ isOwner: true }));
    expect(own.batches).toHaveLength(1);
    expect(own.batches[0]).toHaveLength(N_WS * PER_WS);
  });

  it('follow-up steps run after every chunk of the step before (Ruling X + createSteps)', () => {
    const loaded = bigLoaded();
    const tree = treeOf(loaded);
    const up = (id) => ({ id, text: id, author: 'pm', timestamp: '2026-11-12T00:00:00Z' });
    tree.programs[0].workstreams.forEach((w, i) => {
      // Two new updates on an existing task (Ruling X) ...
      w.tasks[0].updates.unshift(up(`a${i}`), up(`b${i}`));
      // ... and a new task with two updates (createSteps).
      w.tasks.push({ id: `n${i}`, name: `New ${i}`, status: 'Planned', updates: [up(`c${i}`), up(`d${i}`)], checkIns: [] });
    });
    const r = planV2Save(loaded, tree, ctx());
    expect(r.refused).toBe(null);
    expect(r.batches).toHaveLength(6);
    const firstIdx = new Map();
    r.batches.forEach((b, i) => {
      expect(distinctWs(b, wsOfTask).size).toBeLessThanOrEqual(8);
      for (const op of b) {
        const k = `${op.id}`;
        if (!firstIdx.has(k)) { firstIdx.set(k, i); continue; }
        // A second step of the same doc is in a later batch, after all main chunks.
        expect(i).toBeGreaterThanOrEqual(3);
        expect(i).toBeGreaterThan(firstIdx.get(k));
      }
    });
    // Step 1 of every doc in the first 3 batches; step 2 in the last 3.
    expect(r.batches.slice(0, 3).flat().filter((o) => o.op === 'create')).toHaveLength(N_WS);
    expect(r.batches.slice(3).flat().every((o) => o.op === 'update')).toBe(true);
    expect(r.batches.slice(3).flat()).toHaveLength(2 * N_WS);
  });
});

// ── Review Focus 3: a chunked save failing in chunk 2 (shim flow: plan -> execute
// -> applyWritten -> Retry re-plans against the refreshed cache) ──
const P = 'workspaces/main/projects/pc';
function storeOf(loaded) {
  const store = new Map([[P, { ...loaded.meta, schemaVersion: 2 }]]);
  for (const [kind, m] of Object.entries(loaded.docs)) for (const [id, e] of m) store.set(`${P}/${kind}/${id}`, { ...e.data });
  return store;
}
// In-memory transactions; failOn = 1-based transaction number that is denied.
function fakeFs(store, { failOn = null } = {}) {
  let n = 0;
  return {
    doc: (_db, ...segs) => segs.join('/'),
    serverTimestamp: () => ({ __ts: true }),
    deleteField: () => ({ __del: true }),
    async runTransaction(_db, fn) {
      n++;
      const staged = [];
      const tx = {
        async get(path) { const d = store.get(path); return { exists: () => d !== undefined, data: () => (d ? { ...d } : undefined) }; },
        set(path, data) { staged.push([path, data]); return tx; },
        update() { throw new Error('unexpected update'); },
        delete() { throw new Error('unexpected delete'); },
      };
      const out = await fn(tx);
      if (n === failOn) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
      for (const [path, data] of staged) store.set(path, { ...data });
      return out;
    },
    count: () => n,
  };
}

describe('chunked save failing in chunk 2 of 3 (W1, Review Focus 3)', () => {
  it('chunk 1 stays committed and cached; Retry writes only chunks 2-3, nothing twice', async () => {
    const loaded = bigLoaded();
    const store = storeOf(loaded);
    const tree = treeOf(loaded);
    renameAll(tree);
    const plan = planV2Save(loaded, tree, ctx());
    expect(plan.batches).toHaveLength(3);
    const ids = plan.batches.map((b) => new Set(b.map((o) => o.id)));

    const fs1 = fakeFs(store, { failOn: 2 });
    const r = await executeV2Save(fs1, { db: {}, wid: 'main', pid: 'pc', uid: 'uidPM', plan });
    expect(r).toMatchObject({ status: 'denied', failedBatch: 1 });
    expect(r.written.map((w) => w.id).sort()).toEqual([...ids[0]].sort());
    // The shim refreshes its cache from `written` even on a partial failure.
    applyWritten(loaded, r.written, r.metaWritten ? r.metaPatch : null);
    for (const id of ids[0]) {
      expect(loaded.docs.tasks.get(id).version).toBe(2);
      expect(store.get(`${P}/tasks/${id}`).version).toBe(2);
    }
    for (const id of [...ids[1], ...ids[2]]) {
      expect(loaded.docs.tasks.get(id).version).toBe(1);
      expect(store.get(`${P}/tasks/${id}`).version).toBe(1);
    }

    // Retry: the same tree (the App keeps it) re-planned against the cache.
    const retry = planV2Save(loaded, tree, ctx());
    const retryIds = retry.batches.flat().map((o) => o.id);
    expect(retryIds.sort()).toEqual([...ids[1], ...ids[2]].sort());
    expect(retry.batches.flat().every((o) => o.expectVersion === 1)).toBe(true);
    const fs2 = fakeFs(store);
    const r2 = await executeV2Save(fs2, { db: {}, wid: 'main', pid: 'pc', uid: 'uidPM', plan: retry });
    expect(r2.status).toBe('ok');
    applyWritten(loaded, r2.written, null);
    // Every task written exactly once: version 2 everywhere, nothing left to plan.
    for (const [id] of loaded.docs.tasks) expect(store.get(`${P}/tasks/${id}`)).toMatchObject({ version: 2, name: expect.stringMatching(/\(e\)$/) });
    expect(planV2Save(loaded, tree, ctx())).toEqual({ batches: [], metaPatch: null, refused: null });
  });
});

describe('stableEqual (W2 B2)', () => {
  const ts = (ms) => ({ toMillis: () => ms });
  it('deep equal; Timestamps compare by millis', () => {
    expect(stableEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(stableEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(stableEqual([1, 2], [1])).toBe(false);
    expect(stableEqual(undefined, undefined)).toBe(true);
    expect(stableEqual(undefined, null)).toBe(false);
    expect(stableEqual(ts(5), ts(5))).toBe(true);
    expect(stableEqual({ t: ts(5) }, { t: ts(6) })).toBe(false);
  });
});
