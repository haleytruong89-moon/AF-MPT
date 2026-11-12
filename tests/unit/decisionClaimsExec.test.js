import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/v1-project.json';
import { splitProject, assembleProject } from '../../src/migrateV2.js';
import { planV2Save } from '../../src/planV2Save.js';
import { executeV2Save, applyWritten } from '../../src/execV2Save.js';
import { rolesFromLoaded } from '../../src/readV2.js';

// Wave 2 R5 / PR-A (A4 minor #4): a decision save end to end without rules:
// planner -> executor (full-doc set) -> cache refresh -> roles. Pins that a
// Sub-PM write drops the stored viaProgramId (full replace, the rules' ws branch
// needs it absent) and that the new program reaches rolesFromLoaded /
// canEditDecision after the save. Rules themselves: tests/rules/w2-raid-decisions.

const clone = (x) => JSON.parse(JSON.stringify(x));
const WID = 'main';
const PID = 'p1';
const P = `workspaces/${WID}/projects/${PID}`;

function setup() {
  const s = splitProject(clone(fixture), { wid: WID });
  s.meta.programMeta.pg1.pmUid = 'uidPM';
  const store = new Map([[P, { ...s.meta, schemaVersion: 2 }]]);
  const loaded = { meta: s.meta, docs: {} };
  for (const kind of ['workstreams', 'tasks', 'actions', 'raid', 'decisions']) {
    loaded.docs[kind] = new Map();
    for (const { id, data } of s[kind]) {
      const d = { ...data, version: 1 };
      if (kind === 'workstreams' && id === 'w3') d.leadUid = 'uidLead';
      store.set(`${P}/${kind}/${id}`, d);
      loaded.docs[kind].set(id, { version: 1, data: d });
    }
  }
  return { store, loaded };
}

// Minimal in-memory transaction (like tests/unit/execV2Save.test.js).
function fakeFs(store) {
  return {
    doc: (_db, ...segs) => segs.join('/'),
    serverTimestamp: () => ({ __ts: true }),
    deleteField: () => ({ __del: true }),
    async runTransaction(_db, fn) {
      const staged = [];
      const tx = {
        async get(path) { const d = store.get(path); return { exists: () => d !== undefined, data: () => (d ? { ...d } : undefined) }; },
        set(path, data) { staged.push([path, data]); return tx; },
        update() { throw new Error('unexpected update'); },
        delete() { throw new Error('unexpected delete'); },
      };
      const out = await fn(tx);
      for (const [path, data] of staged) store.set(path, { ...data });
      return out;
    },
  };
}

const treeOf = (loaded) => {
  const list = (m) => [...m.entries()].map(([id, e]) => ({ id, data: e.data }));
  const d = loaded.docs;
  return clone(assembleProject(loaded.meta, list(d.workstreams), list(d.tasks), list(d.actions), list(d.raid), list(d.decisions)).project);
};

async function save(store, loaded, uid, isOwner, edit) {
  const tree = treeOf(loaded);
  edit(tree);
  const plan = planV2Save(loaded, tree, { uid, wid: WID, pid: PID, isOwner });
  const r = await executeV2Save(fakeFs(store), { db: {}, wid: WID, pid: PID, uid, plan });
  applyWritten(loaded, r.written, r.metaWritten ? r.metaPatch : null);
  return r;
}

describe('decision save: planner + executor + cache (W2 R5)', () => {
  it('Sub-PM edits a PM-filed decision: stored viaProgramId replaced by the ws claim; program unchanged', async () => {
    const { store, loaded } = setup();
    store.set(`${P}/decisions/d1`, { ...store.get(`${P}/decisions/d1`), viaProgramId: 'pg1' });
    loaded.docs.decisions.get('d1').data = store.get(`${P}/decisions/d1`);
    const r = await save(store, loaded, 'uidLead', false, (t) => { t.decisions[0].title = 'Lead edit'; });
    expect(r.status).toBe('ok');
    const doc = store.get(`${P}/decisions/d1`);
    expect(doc).toMatchObject({ title: 'Lead edit', viaWorkstreamId: 'w3', version: 2, updatedBy: 'uidLead' });
    expect(doc).not.toHaveProperty('viaProgramId');
    expect(rolesFromLoaded(loaded, []).decisions.d1).toEqual({ programId: 'pg1' });
  });

  it('Owner files a new decision under its related task program; roles see it after the save', async () => {
    const { store, loaded } = setup();
    const r = await save(store, loaded, 'uidOwner', true, (t) => {
      t.decisions.unshift({ id: 'dN', title: 'New', relatedTaskIds: ['t2'] });
    });
    expect(r.status).toBe('ok');
    expect(store.get(`${P}/decisions/dN`)).toMatchObject({ viaProgramId: 'pg1', version: 1 });
    expect(rolesFromLoaded(loaded, []).decisions.dN).toEqual({ programId: 'pg1' });
    // Then the PM of pg1 edits it with a viaProgramId claim on the same program.
    const r2 = await save(store, loaded, 'uidPM', false, (t) => { t.decisions.find((d) => d.id === 'dN').title = 'PM edit'; });
    expect(r2.status).toBe('ok');
    expect(store.get(`${P}/decisions/dN`)).toMatchObject({ title: 'PM edit', viaProgramId: 'pg1', version: 2 });
  });
});
