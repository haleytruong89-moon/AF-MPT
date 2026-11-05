import { describe, it, expect } from 'vitest';
import { executeV2Save, applyWritten } from '../../src/execV2Save.js';
import { DELETE_FIELD } from '../../src/planV2Save.js';

const P = 'workspaces/main/projects/p1';
const ctx = (plan) => ({ db: {}, wid: 'main', pid: 'p1', uid: 'u1', plan });

// In-memory Firestore stand-in: path -> data. A transaction stages writes and
// applies them only when the callback resolves (like the real SDK).
// The project doc P is seeded as schemaVersion 2 unless `initial` sets it.
function fakeFs(initial = {}, { denyPaths = [] } = {}) {
  const store = new Map(Object.entries({ [P]: { schemaVersion: 2 }, ...initial }).map(([k, v]) => [k, { ...v }]));
  const DEL = { __del: true };
  const TS = { __ts: true };
  let txCount = 0;
  const fs = {
    doc: (_db, ...segs) => segs.join('/'),
    serverTimestamp: () => TS,
    deleteField: () => DEL,
    async runTransaction(_db, fn) {
      txCount++;
      const staged = [];
      const tx = {
        async get(path) {
          const d = store.get(path);
          return { exists: () => d !== undefined, data: () => (d ? { ...d } : undefined) };
        },
        set(path, data) { staged.push(['set', path, data]); return tx; },
        update(path, data) { staged.push(['update', path, data]); return tx; },
        delete(path) { staged.push(['delete', path]); return tx; },
      };
      const out = await fn(tx);
      for (const [, path] of staged) {
        if (denyPaths.includes(path)) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
      }
      for (const [kind, path, data] of staged) {
        if (kind === 'set') store.set(path, { ...data });
        else if (kind === 'delete') store.delete(path);
        else {
          const cur = { ...(store.get(path) || {}) };
          for (const [k, v] of Object.entries(data)) {
            if (v === DEL) delete cur[k];
            else cur[k] = v;
          }
          store.set(path, cur);
        }
      }
      return out;
    },
  };
  return { fs, store, TS, txCount: () => txCount };
}

describe('executeV2Save', () => {
  it('update: full-doc set with version + 1 and stamps; create: version 1 + stamps', async () => {
    const { fs, store, TS } = fakeFs({ [`${P}/tasks/t1`]: { name: 'old', extra: 1, version: 3 } });
    const plan = {
      batches: [[
        { kind: 'tasks', op: 'update', id: 't1', data: { name: 'new' }, expectVersion: 3 },
        { kind: 'actions', op: 'create', id: 'a9', data: { title: 'A', version: 1 } },
      ]],
      metaPatch: null,
    };
    const r = await executeV2Save(fs, ctx(plan));
    expect(r.status).toBe('ok');
    expect(r.failedBatch).toBeNull();
    expect(store.get(`${P}/tasks/t1`)).toEqual({ name: 'new', version: 4, updatedBy: 'u1', updatedAt: TS });
    expect(store.get(`${P}/actions/a9`)).toEqual({ title: 'A', version: 1, updatedBy: 'u1', updatedAt: TS });
    expect(r.written).toEqual([
      { kind: 'tasks', op: 'update', id: 't1', version: 4, data: { name: 'new', version: 4, updatedBy: 'u1' } },
      { kind: 'actions', op: 'create', id: 'a9', version: 1, data: { title: 'A', version: 1, updatedBy: 'u1' } },
    ]);
  });

  it('version mismatch, missing update target or existing create target -> conflict, nothing written', async () => {
    for (const op of [
      { kind: 'tasks', op: 'update', id: 't1', data: {}, expectVersion: 2 },
      { kind: 'tasks', op: 'update', id: 'gone', data: {}, expectVersion: 1 },
      { kind: 'tasks', op: 'create', id: 't1', data: { version: 1 } },
      { kind: 'tasks', op: 'delete', id: 't1', expectVersion: 1 },
    ]) {
      const { fs, store } = fakeFs({ [`${P}/tasks/t1`]: { version: 3 }, [`${P}/tasks/t2`]: { version: 1 } });
      const plan = { batches: [[{ kind: 'tasks', op: 'update', id: 't2', data: { x: 1 }, expectVersion: 1 }, op]], metaPatch: { name: 'N' } };
      const r = await executeV2Save(fs, ctx(plan));
      expect(r).toMatchObject({ status: 'conflict', failedBatch: 0, written: [], metaWritten: false });
      expect(store.get(`${P}/tasks/t2`)).toEqual({ version: 1 });
      expect(store.get(P)).toEqual({ schemaVersion: 2 });
    }
  });

  it('delete of a doc already gone is recorded in written (cache drops it); delete with matching version deletes', async () => {
    const { fs, store } = fakeFs({ [`${P}/workstreams/w1`]: { version: 2 } });
    const plan = { batches: [[
      { kind: 'workstreams', op: 'delete', id: 'w1', expectVersion: 2 },
      { kind: 'workstreams', op: 'delete', id: 'w0', expectVersion: 5 },
    ]], metaPatch: null };
    const r = await executeV2Save(fs, ctx(plan));
    expect(r.status).toBe('ok');
    expect(store.has(`${P}/workstreams/w1`)).toBe(false);
    expect(r.written).toEqual([
      { kind: 'workstreams', op: 'delete', id: 'w1', version: null, data: null },
      { kind: 'workstreams', op: 'delete', id: 'w0', version: null, data: null },
    ]);
  });

  it('metaPatch: update on the project doc in batch 1, DELETE_FIELD mapped, updatedAt stamped', async () => {
    const { fs, store, TS } = fakeFs({ [P]: { schemaVersion: 2, name: 'a', gone: 1, keep: 2 } });
    const r = await executeV2Save(fs, ctx({ batches: [], metaPatch: { name: 'b', gone: DELETE_FIELD } }));
    expect(r).toMatchObject({ status: 'ok', metaWritten: true });
    expect(store.get(P)).toEqual({ schemaVersion: 2, name: 'b', keep: 2, updatedAt: TS });
  });

  it('Ruling X: follow-up batches run as their own transactions, in order', async () => {
    const { fs, store, txCount } = fakeFs({ [`${P}/tasks/t1`]: { updates: [], version: 1 } });
    const plan = { batches: [
      [{ kind: 'tasks', op: 'update', id: 't1', data: { updates: ['u1'] }, expectVersion: 1 }],
      [{ kind: 'tasks', op: 'update', id: 't1', data: { updates: ['u2', 'u1'] }, expectVersion: 2 }],
    ], metaPatch: null };
    const r = await executeV2Save(fs, ctx(plan));
    expect(r.status).toBe('ok');
    expect(txCount()).toBe(2);
    expect(store.get(`${P}/tasks/t1`)).toMatchObject({ updates: ['u2', 'u1'], version: 3 });
  });

  it('permission-denied -> denied with failedBatch; earlier batches stay written', async () => {
    const { fs, store } = fakeFs({ [`${P}/tasks/t1`]: { version: 1 } }, { denyPaths: [`${P}/tasks/t2`] });
    const plan = { batches: [
      [{ kind: 'tasks', op: 'update', id: 't1', data: { a: 1 }, expectVersion: 1 }],
      [{ kind: 'tasks', op: 'create', id: 't2', data: { version: 1 } }],
    ], metaPatch: null };
    const r = await executeV2Save(fs, ctx(plan));
    expect(r).toMatchObject({ status: 'denied', failedBatch: 1 });
    expect(r.written.map((w) => w.id)).toEqual(['t1']);
    expect(store.get(`${P}/tasks/t1`).version).toBe(2);
  });

  // P2.4 fix round 1: a rolled-back project (v1 again) must not get v2 writes
  // from a stale tab. The executor re-reads the project doc in every batch.
  it('project doc not v2 (rolled back / missing) -> conflict, nothing written, no metaPatch', async () => {
    for (const proj of [{}, { schemaVersion: 1 }, { schemaVersion: '2' }, undefined]) {
      const init = { [`${P}/tasks/t1`]: { version: 1 } };
      const { fs, store } = fakeFs(init);
      if (proj === undefined) store.delete(P); else store.set(P, { ...proj });
      const plan = { batches: [[
        { kind: 'tasks', op: 'update', id: 't1', data: { a: 1 }, expectVersion: 1 },
        { kind: 'tasks', op: 'create', id: 't2', data: { version: 1 } },
      ]], metaPatch: { name: 'N' } };
      const r = await executeV2Save(fs, ctx(plan));
      expect(r).toMatchObject({ status: 'conflict', failedBatch: 0, written: [], metaWritten: false });
      expect(store.get(`${P}/tasks/t1`)).toEqual({ version: 1 });
      expect(store.has(`${P}/tasks/t2`)).toBe(false);
      expect(store.get(P)).toEqual(proj);
    }
  });

  it('project rolled back between batches -> later batch conflicts; earlier batch stays written', async () => {
    const { fs, store } = fakeFs({ [`${P}/tasks/t1`]: { updates: [], version: 1 } });
    const realTx = fs.runTransaction;
    let n = 0;
    fs.runTransaction = async (db, fn) => {
      if (n++ === 1) store.set(P, { name: 'rolled back' });
      return realTx(db, fn);
    };
    const plan = { batches: [
      [{ kind: 'tasks', op: 'update', id: 't1', data: { updates: ['u1'] }, expectVersion: 1 }],
      [{ kind: 'tasks', op: 'update', id: 't1', data: { updates: ['u2', 'u1'] }, expectVersion: 2 }],
    ], metaPatch: null };
    const r = await executeV2Save(fs, ctx(plan));
    expect(r).toMatchObject({ status: 'conflict', failedBatch: 1 });
    expect(r.written.map((w) => w.version)).toEqual([2]);
    expect(store.get(`${P}/tasks/t1`)).toMatchObject({ updates: ['u1'], version: 2 });
  });

  it('other errors -> error', async () => {
    const { fs } = fakeFs();
    fs.runTransaction = async () => { throw Object.assign(new Error('x'), { code: 'unavailable' }); };
    const r = await executeV2Save(fs, ctx({ batches: [[{ kind: 'tasks', op: 'create', id: 't', data: { version: 1 } }]], metaPatch: null }));
    expect(r).toMatchObject({ status: 'error', failedBatch: 0, written: [] });
  });
});

describe('applyWritten (shim cache refresh)', () => {
  it('updates versions and data, removes deletes, applies metaPatch', () => {
    const loaded = {
      meta: { name: 'a', gone: 1 },
      docs: {
        workstreams: new Map([['w1', { version: 2, data: { version: 2 } }]]),
        tasks: new Map([['t1', { version: 1, data: { version: 1, name: 'x' } }]]),
        actions: new Map(), raid: new Map(), decisions: new Map(),
      },
    };
    applyWritten(loaded, [
      { kind: 'tasks', op: 'update', id: 't1', version: 2, data: { name: 'y', version: 2, updatedBy: 'u1' } },
      { kind: 'actions', op: 'create', id: 'a1', version: 1, data: { version: 1 } },
      { kind: 'workstreams', op: 'delete', id: 'w1', version: null, data: null },
    ], { name: 'b', gone: DELETE_FIELD });
    expect(loaded.docs.tasks.get('t1')).toEqual({ version: 2, data: { name: 'y', version: 2, updatedBy: 'u1' } });
    expect(loaded.docs.actions.get('a1')).toEqual({ version: 1, data: { version: 1 } });
    expect(loaded.docs.workstreams.has('w1')).toBe(false);
    expect(loaded.meta).toEqual({ name: 'b' });
  });

  it('dotted metaPatch keys update nested programMeta fields; DELETE_FIELD removes the nested key', () => {
    const loaded = { meta: { programMeta: { A: { name: 'a', pmUid: 'P', __absent: ['raid'] }, B: { name: 'b' } } }, docs: { workstreams: new Map(), tasks: new Map(), actions: new Map(), raid: new Map(), decisions: new Map() } };
    applyWritten(loaded, [], { 'programMeta.A.name': 'a2', 'programMeta.A.__absent': DELETE_FIELD, 'programMeta.B': DELETE_FIELD, 'programMeta.C': { name: 'c' } });
    expect(loaded.meta.programMeta).toEqual({ A: { name: 'a2', pmUid: 'P' }, C: { name: 'c' } });
  });
  it('whole programMeta fallback keeps the live pmUid/deputyUid (stale Owner tab)', async () => {
    const { fs, store } = fakeFs({ [P]: { schemaVersion: 2, programMeta: { 'p 1': { pmUid: 'B', deputyUid: 'D' } } } });
    const plan = {
      batches: [],
      metaPatch: { programMeta: {
        'p 1': { pmUid: 'A', deputyUid: null, start: '2026-01-01' },
        'p 2': { pmUid: 'X', start: '2026-02-01' },
      } },
    };
    const r = await executeV2Save(fs, ctx(plan));
    expect(r.status).toBe('ok');
    const pm = store.get(P).programMeta;
    expect(pm['p 1']).toEqual({ pmUid: 'B', deputyUid: 'D', start: '2026-01-01' });
    expect(pm['p 2']).toEqual({ pmUid: 'X', start: '2026-02-01' });
    expect(Object.keys(pm)).toEqual(['p 1', 'p 2']);
    expect(plan.metaPatch.programMeta['p 1'].pmUid).toBe('A'); // plan not mutated
    expect(r.metaPatch.programMeta['p 1'].pmUid).toBe('B'); // cache sees what was written
  });
  it('cache after whole-map overlay + DELETE_FIELD top-level key: key removed, live PM kept', async () => {
    const { fs, store } = fakeFs({ [P]: { schemaVersion: 2, old: 1, programMeta: { 'p 1': { pmUid: 'B' } } } });
    const plan = { batches: [], metaPatch: { old: DELETE_FIELD, programMeta: { 'p 1': { pmUid: 'A', start: 's' } } } };
    const r = await executeV2Save(fs, ctx(plan));
    expect('old' in store.get(P)).toBe(false);
    const loaded = { meta: { old: 1, programMeta: { 'p 1': { pmUid: 'A' } } }, docs: {} };
    applyWritten(loaded, r.written, r.metaWritten ? r.metaPatch : null);
    expect(loaded.meta).toEqual({ programMeta: { 'p 1': { pmUid: 'B', start: 's' } } });
  });

  it('cache after dotted-only patch with programMeta.X DELETE_FIELD: program removed', async () => {
    const { fs, store } = fakeFs({ [P]: { schemaVersion: 2, programMeta: { X: { pmUid: 'B' }, Y: {} } } });
    const plan = { batches: [], metaPatch: { 'programMeta.X': DELETE_FIELD } };
    const r = await executeV2Save(fs, ctx(plan));
    expect(r.status).toBe('ok');
    const loaded = { meta: { programMeta: { X: { pmUid: 'B' }, Y: {} } }, docs: {} };
    applyWritten(loaded, r.written, r.metaWritten ? r.metaPatch : null);
    expect(loaded.meta.programMeta).toEqual({ Y: {} });
    expect(r.metaPatch['programMeta.X']).toBe(DELETE_FIELD);
  });
});
