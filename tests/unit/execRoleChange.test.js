import { describe, it, expect } from 'vitest';
import { executeRoleChange } from '../../src/execRoleChange.js';

const P = 'workspaces/main/projects/p1';
const W1 = `${P}/workstreams/w1`;

// In-memory Firestore stand-in (same shape as execV2Save.test.js): path -> data.
// Writes are staged and applied when the callback resolves. tx.update applies
// dotted keys as nested field paths; arrayUnion is a marker merged on apply.
function fakeFs(initial = {}, { denyPaths = [], throwOnGet = null } = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  const TS = { __ts: true };
  const updates = [];
  const fs = {
    doc: (_db, ...segs) => segs.join('/'),
    serverTimestamp: () => TS,
    arrayUnion: (...items) => ({ __union: items }),
    async runTransaction(_db, fn) {
      const staged = [];
      const tx = {
        async get(path) {
          if (throwOnGet) throw throwOnGet;
          const d = store.get(path);
          return { exists: () => d !== undefined, data: () => (d ? structuredClone(d) : undefined) };
        },
        update(path, data) { staged.push([path, data]); return tx; },
      };
      const out = await fn(tx);
      for (const [path] of staged) {
        if (denyPaths.includes(path)) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
      }
      for (const [path, data] of staged) {
        updates.push([path, data]);
        const cur = structuredClone(store.get(path) || {});
        for (const [k, v] of Object.entries(data)) {
          const segs = k.split('.');
          let o = cur;
          for (const s of segs.slice(0, -1)) { o[s] = o[s] && typeof o[s] === 'object' ? o[s] : {}; o = o[s]; }
          const last = segs[segs.length - 1];
          if (v && v.__union) o[last] = [...new Set([...(o[last] || []), ...v.__union])];
          else o[last] = v;
        }
        store.set(path, cur);
      }
      return out;
    },
  };
  return { fs, store, TS, updates };
}

const project = (extra = {}) => ({
  schemaVersion: 2,
  programMeta: { prg1: { name: 'Program 1', pmUid: 'u_pm', deputyUid: null }, prg2: { name: 'Program 2' } },
  memberUids: ['u_owner', 'u_pm'],
  memberIds: ['u_owner', 'u_pm'],
  roles: { u_owner: 'owner' },
  ...extra,
});
const ws = () => ({ programId: 'prg1', name: 'WS 1', leadUid: 'u_lead', version: 4, workspaceId: 'main', projectId: 'p1' });
const ctx = (change, extra = {}) => ({ db: {}, wid: 'main', pid: 'p1', uid: 'u_owner', change, ...extra });

describe('executeRoleChange', () => {
  it('pm: writes only programMeta.<id>.pmUid + updatedAt', async () => {
    const { fs, store, TS, updates } = fakeFs({ [P]: project() });
    const r = await executeRoleChange(fs, ctx({ kind: 'pm', programId: 'prg1', fromUid: 'u_pm', toUid: 'u_new' }));
    expect(r).toEqual({ status: 'ok' });
    expect(updates).toEqual([[P, { 'programMeta.prg1.pmUid': 'u_new', updatedAt: TS }]]);
    expect(store.get(P).programMeta.prg1).toEqual({ name: 'Program 1', pmUid: 'u_new', deputyUid: null });
  });

  it('deputy: absent field reads as null; clearing writes null', async () => {
    const { fs, updates, TS } = fakeFs({ [P]: project() });
    const r = await executeRoleChange(fs, ctx({ kind: 'deputy', programId: 'prg2', fromUid: null, toUid: 'u_d' }));
    expect(r.status).toBe('ok');
    expect(updates[0]).toEqual([P, { 'programMeta.prg2.deputyUid': 'u_d', updatedAt: TS }]);

    const b = fakeFs({ [P]: project() });
    const r2 = await executeRoleChange(b.fs, ctx({ kind: 'pm', programId: 'prg1', fromUid: 'u_pm', toUid: null }));
    expect(r2.status).toBe('ok');
    expect(b.store.get(P).programMeta.prg1.pmUid).toBeNull();
  });

  it('pm / deputy: live value differs from fromUid -> changed, nothing written', async () => {
    for (const change of [
      { kind: 'pm', programId: 'prg1', fromUid: 'u_other', toUid: 'u_new' },
      { kind: 'pm', programId: 'prg2', fromUid: 'u_pm', toUid: 'u_new' },
      { kind: 'deputy', programId: 'prg1', fromUid: 'u_x', toUid: 'u_new' },
    ]) {
      const { fs, updates } = fakeFs({ [P]: project() });
      expect(await executeRoleChange(fs, ctx(change))).toEqual({ status: 'changed' });
      expect(updates).toEqual([]);
    }
  });

  it('pm / deputy: program gone from programMeta -> conflict', async () => {
    const { fs, updates } = fakeFs({ [P]: project() });
    const r = await executeRoleChange(fs, ctx({ kind: 'pm', programId: 'gone', fromUid: null, toUid: 'u_new' }));
    expect(r.status).toBe('conflict');
    expect(updates).toEqual([]);
  });

  it('unsafe programId or wsId -> error, no transaction write', async () => {
    for (const change of [
      { kind: 'pm', programId: 'a.b', fromUid: null, toUid: 'u' },
      { kind: 'deputy', programId: 'a/b', fromUid: null, toUid: 'u' },
      { kind: 'pm', programId: '', fromUid: null, toUid: 'u' },
      { kind: 'lead', programId: 'prg1', wsId: 'w/1', fromUid: null, toUid: 'u' },
      { kind: 'boss', programId: 'prg1', fromUid: null, toUid: 'u' },
    ]) {
      const { fs, updates } = fakeFs({ [P]: project(), [W1]: ws() });
      expect((await executeRoleChange(fs, ctx(change))).status).toBe('error');
      expect(updates).toEqual([]);
    }
  });

  it('project missing or not schemaVersion 2 -> conflict', async () => {
    const change = { kind: 'pm', programId: 'prg1', fromUid: 'u_pm', toUid: 'u_new' };
    expect((await executeRoleChange(fakeFs({}).fs, ctx(change))).status).toBe('conflict');
    const { fs, updates } = fakeFs({ [P]: project({ schemaVersion: 1 }) });
    expect((await executeRoleChange(fs, ctx(change))).status).toBe('conflict');
    expect(updates).toEqual([]);
  });

  it('lead: version + 1, updatedBy, returns the new ws doc', async () => {
    const { fs, store, TS, updates } = fakeFs({ [P]: project(), [W1]: ws() });
    const r = await executeRoleChange(fs, ctx({ kind: 'lead', programId: 'prg1', wsId: 'w1', fromUid: 'u_lead', toUid: 'u_new' }, { uid: 'u_pm' }));
    expect(r).toEqual({
      status: 'ok',
      ws: { version: 5, data: { ...ws(), leadUid: 'u_new', version: 5, updatedBy: 'u_pm' } },
    });
    expect(updates).toEqual([[W1, { leadUid: 'u_new', version: 5, updatedBy: 'u_pm', updatedAt: TS }]]);
    expect(store.get(W1)).toEqual({ ...ws(), leadUid: 'u_new', version: 5, updatedBy: 'u_pm', updatedAt: TS });
  });

  it('lead: absent leadUid / version read as null / 0', async () => {
    const w = ws(); delete w.leadUid; delete w.version;
    const { fs, store } = fakeFs({ [P]: project(), [W1]: w });
    const r = await executeRoleChange(fs, ctx({ kind: 'lead', programId: 'prg1', wsId: 'w1', fromUid: null, toUid: 'u_new' }));
    expect(r.status).toBe('ok');
    expect(r.ws.version).toBe(1);
    expect(store.get(W1).version).toBe(1);
  });

  it('lead: ws missing -> conflict; live leadUid differs -> changed', async () => {
    const a = fakeFs({ [P]: project() });
    expect((await executeRoleChange(a.fs, ctx({ kind: 'lead', programId: 'prg1', wsId: 'w1', fromUid: null, toUid: 'u' }))).status).toBe('conflict');
    const b = fakeFs({ [P]: project(), [W1]: ws() });
    expect(await executeRoleChange(b.fs, ctx({ kind: 'lead', programId: 'prg1', wsId: 'w1', fromUid: null, toUid: 'u' }))).toEqual({ status: 'changed' });
    expect(b.updates).toEqual([]);
  });

  it('addMemberUid: new person -> memberUids / memberIds arrayUnion + roles.<u> member', async () => {
    const { fs, store, TS, updates } = fakeFs({ [P]: project(), [W1]: ws() });
    const r = await executeRoleChange(fs, ctx({ kind: 'lead', programId: 'prg1', wsId: 'w1', fromUid: 'u_lead', toUid: 'u_new' }, { addMemberUid: 'u_new' }));
    expect(r.status).toBe('ok');
    const projUpd = updates.find(([p]) => p === P)[1];
    expect(projUpd.memberUids).toEqual({ __union: ['u_new'] });
    expect(projUpd.memberIds).toEqual({ __union: ['u_new'] });
    expect(projUpd['roles.u_new']).toBe('member');
    expect(projUpd.updatedAt).toBe(TS);
    expect(store.get(P).memberUids).toEqual(['u_owner', 'u_pm', 'u_new']);
    expect(store.get(P).roles).toEqual({ u_owner: 'owner', u_new: 'member' });
  });

  it('addMemberUid with pm: one project update carries role + member fields', async () => {
    const { fs, updates } = fakeFs({ [P]: project() });
    await executeRoleChange(fs, ctx({ kind: 'pm', programId: 'prg1', fromUid: 'u_pm', toUid: 'u_new' }, { addMemberUid: 'u_new' }));
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0][1]).sort()).toEqual(['memberIds', 'memberUids', 'programMeta.prg1.pmUid', 'roles.u_new', 'updatedAt']);
  });

  it('addMemberUid: existing roles entry is not overwritten; already a member -> no project write', async () => {
    const a = fakeFs({ [P]: project({ roles: { u_owner: 'owner', u_new: 'editor' } }), [W1]: ws() });
    await executeRoleChange(a.fs, ctx({ kind: 'lead', programId: 'prg1', wsId: 'w1', fromUid: 'u_lead', toUid: 'u_new' }, { addMemberUid: 'u_new' }));
    const upd = a.updates.find(([p]) => p === P)[1];
    expect('roles.u_new' in upd).toBe(false);
    expect(a.store.get(P).roles.u_new).toBe('editor');

    const b = fakeFs({ [P]: project(), [W1]: ws() });
    await executeRoleChange(b.fs, ctx({ kind: 'lead', programId: 'prg1', wsId: 'w1', fromUid: 'u_lead', toUid: 'u_pm' }, { addMemberUid: 'u_pm' }));
    expect(b.updates.map(([p]) => p)).toEqual([W1]);
  });

  it('permission-denied -> denied; other errors -> error', async () => {
    const change = { kind: 'lead', programId: 'prg1', wsId: 'w1', fromUid: 'u_lead', toUid: 'u_new' };
    const a = fakeFs({ [P]: project(), [W1]: ws() }, { denyPaths: [W1] });
    const r = await executeRoleChange(a.fs, ctx(change));
    expect(r.status).toBe('denied');
    expect(a.store.get(W1).leadUid).toBe('u_lead');
    const b = fakeFs({ [P]: project() }, { throwOnGet: new Error('offline') });
    expect((await executeRoleChange(b.fs, ctx(change))).status).toBe('error');
  });
});
