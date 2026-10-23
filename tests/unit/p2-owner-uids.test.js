import { describe, it, expect } from 'vitest';
import { planOwnerUids, membersByEmailFrom } from '../../scripts/p2-set-owner-uids.mjs';
import { applyWrites, rollbackManifest } from '../../scripts/lib/manifest.mjs';

const OWNER = 'hattt4@smartosc.com';

describe('planOwnerUids', () => {
  it('returns [uid] of the workspaceOwner email (case-insensitive)', () => {
    const r = planOwnerUids({ workspaceOwner: 'HaTTT4@SmartOSC.com' }, new Map([[OWNER, 'u_owner']]));
    expect(r).toEqual({ ownerUids: ['u_owner'] });
  });
  it('errors when workspaceOwner has no members entry', () => {
    const r = planOwnerUids({ workspaceOwner: OWNER }, new Map([['x@smartosc.com', 'u_x']]));
    expect(r.error).toMatch(/no members entry/);
  });
  it('is a no-op when ownerUids is already set', () => {
    const r = planOwnerUids({ workspaceOwner: OWNER, ownerUids: ['u_owner'] }, new Map([[OWNER, 'u_owner']]));
    expect(r).toEqual({ noop: true });
  });
  it('errors when the workspace doc is missing', () => {
    expect(planOwnerUids(null, new Map()).error).toMatch(/does not exist/);
  });
  it('errors when workspaceOwner is not an email', () => {
    expect(planOwnerUids({ workspaceOwner: 'Hà Trương Thị Thu' }, new Map()).error).toMatch(/not an email/);
  });
  it('errors when ownerUids exists but is not a non-empty list', () => {
    expect(planOwnerUids({ workspaceOwner: OWNER, ownerUids: 'u_owner' }, new Map([[OWNER, 'u']])).error).toMatch(/not a list/);
    // An empty list is treated as unset (it would lock nobody out but grants nobody).
    expect(planOwnerUids({ workspaceOwner: OWNER, ownerUids: [] }, new Map([[OWNER, 'u']]))).toEqual({ ownerUids: ['u'] });
  });
  it('errors when the email maps to several member docs', () => {
    const map = membersByEmailFrom([
      { id: 'u_1', data: { email: OWNER } },
      { id: 'u_2', data: { email: 'HATTT4@smartosc.com' } },
    ]);
    expect(planOwnerUids({ workspaceOwner: OWNER }, map).error).toMatch(/several members/);
  });
});

describe('membersByEmailFrom', () => {
  it('maps lower-cased email to uid and skips docs without email', () => {
    const map = membersByEmailFrom([{ id: 'u_a', data: { email: 'A@smartosc.com' } }, { id: 'u_b', data: {} }]);
    expect([...map]).toEqual([['a@smartosc.com', 'u_a']]);
  });
});

class FakeTs { constructor(s, n) { this.seconds = s; this.nanoseconds = n; } }
const DEL = { __delete: true };
const FV = { serverTimestamp: () => 'SERVER_TS', delete: () => DEL };

// Minimal Firestore double: set(data) replaces, set(data, {merge:true}) merges
// top-level keys and honours FieldValue.delete().
function fakeDb(initial = {}, log = []) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    doc: (path) => ({
      get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
      set: async (d, opts) => {
        log.push(`set${opts?.merge ? '-merge' : ''} ${path}`);
        const next = opts?.merge ? { ...(store.get(path) || {}) } : {};
        for (const [k, v] of Object.entries(d)) { if (v === DEL) delete next[k]; else next[k] = v; }
        store.set(path, next);
      },
      delete: async () => { log.push('delete ' + path); store.delete(path); },
    }),
  };
}

describe('applyWrites / rollbackManifest', () => {
  const WS = 'workspaces/main';
  const deps = (log, onManifest) => ({ FieldValue: FV, Timestamp: FakeTs, writeManifest: (m) => { log.push('manifest'); onManifest?.(m); } });

  it('writes the manifest before the first write; merge only touches the given fields', async () => {
    const log = [];
    const db = fakeDb({ [WS]: { workspaceOwner: OWNER, userPreferences: { a: 1 } } }, log);
    let manifest;
    const r = await applyWrites(db, [{ path: WS, data: { ownerUids: ['u_owner'] }, merge: true }], deps(log, (m) => { manifest = m; }));
    expect(r).toEqual({ written: 1 });
    expect(log).toEqual(['manifest', `set-merge ${WS}`]);
    expect(db.store.get(WS)).toEqual({ workspaceOwner: OWNER, userPreferences: { a: 1 }, ownerUids: ['u_owner'] });
    expect(manifest.entries[0]).toMatchObject({ path: WS, merge: true, fields: ['ownerUids'] });
    expect(manifest.entries[0].before).toEqual({ workspaceOwner: OWNER, userPreferences: { a: 1 } });
  });

  it('rollback of a merge write restores only the written fields and keeps later client changes', async () => {
    const db = fakeDb({ [WS]: { workspaceOwner: OWNER, userPreferences: { a: 1 } } });
    let saved;
    await applyWrites(db, [{ path: WS, data: { ownerUids: ['u_owner'] }, merge: true }], deps([], (m) => { saved = JSON.stringify(m); }));
    // A client writes to the doc between apply and rollback.
    db.store.set(WS, { ...db.store.get(WS), userPreferences: { a: 2 } });
    const manifest = JSON.parse(saved);
    for (let i = 0; i < 2; i++) {
      const rb = await rollbackManifest(db, manifest, { FieldValue: FV, Timestamp: FakeTs });
      expect(rb).toEqual({ restored: 1, deleted: 0 });
      expect(db.store.get(WS)).toEqual({ workspaceOwner: OWNER, userPreferences: { a: 2 } });
    }
  });

  it('rollback of a merge write puts back a previous value of the field (with Timestamps)', async () => {
    const db = fakeDb({ [WS]: { ownerUids: ['old'], at: new FakeTs(5, 7), x: 1 } });
    let saved;
    await applyWrites(db, [{ path: WS, data: { ownerUids: ['new'], at: 'later' }, merge: true }], deps([], (m) => { saved = JSON.stringify(m); }));
    await rollbackManifest(db, JSON.parse(saved), { FieldValue: FV, Timestamp: FakeTs });
    const back = db.store.get(WS);
    expect(back.ownerUids).toEqual(['old']);
    expect(back.at).toBeInstanceOf(FakeTs);
    expect(back.x).toBe(1);
  });

  it('non-merge writes replace the doc; rollback restores the full before-image or deletes', async () => {
    const db = fakeDb({ a: { v: 1, keep: true } });
    let saved;
    await applyWrites(db, [{ path: 'a', data: { v: 2 } }, { path: 'b', data: { v: 3 } }], deps([], (m) => { saved = JSON.stringify(m); }));
    expect(db.store.get('a')).toEqual({ v: 2 });
    const rb = await rollbackManifest(db, JSON.parse(saved), { FieldValue: FV, Timestamp: FakeTs });
    expect(rb).toEqual({ restored: 1, deleted: 1 });
    expect(db.store.get('a')).toEqual({ v: 1, keep: true });
    expect(db.store.has('b')).toBe(false);
  });

  it('rollback refuses a merge entry when FieldValue is not provided', async () => {
    const manifest = { entries: [{ path: WS, before: {}, merge: true, fields: ['ownerUids'] }] };
    await expect(rollbackManifest(fakeDb(), manifest, { Timestamp: FakeTs })).rejects.toThrow(/FieldValue/);
  });
});
