import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/v1-project.json';
import { buildDirectoryIndex } from '../../src/directory.js';
import { assembleFromSnapshots } from '../../src/readV2.js';
import {
  planPilotCopy, defaultNewPid, resolveOwnerUid, assertPilotManifest, targetIsEmpty,
  rollbackPilotCopy, applyPilotCopy,
} from '../../scripts/p2-pilot-copy.mjs';
import { compareTrees } from '../../scripts/p2-compare.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const dirIndex = buildDirectoryIndex([
  { email: 'alice@smartosc.com', displayName: 'Alice Nguyen', status: 'active' },
  { email: 'bob@smartosc.com', displayName: 'Bob', status: 'active' },
]);
const uidByEmail = new Map([['alice@smartosc.com', 'uid1'], ['bob@smartosc.com', 'uid2']]);
const SRC = 'proj_fx';
const NEW = defaultNewPid(SRC);
const HOD = 'u_hod';

const source = () => ({
  ...clone(fixture),
  googleChatWebhook: 'https://chat.googleapis.com/v1/spaces/X/messages?key=secret',
  rev: 17,
  deletedAt: null,
  roles: { uidZ: 'owner' },
  createdBy: 'uidZ',
});
const plan = (src = source(), extra = {}) =>
  planPilotCopy(src, { sourcePid: SRC, newPid: NEW, ownerUid: HOD, dirIndex, uidByEmail, ...extra });

// Rebuild the snapshot lists the read path would see from the planned writes.
function snapshotsFrom(writes, pid) {
  const base = `workspaces/main/projects/${pid}`;
  const out = { meta: null, ws: [], tasks: [], actions: [], raid: [] };
  const col = { workstreams: 'ws', tasks: 'tasks', actions: 'actions', raid: 'raid' };
  for (const w of writes) {
    if (w.path === base) { out.meta = w.data; continue; }
    const [c, id] = w.path.slice(base.length + 1).split('/');
    out[col[c]].push({ id, data: w.data });
  }
  return out;
}

describe('planPilotCopy', () => {
  it('defaults newPid to <sourcePid>__v2pilot', () => {
    expect(NEW).toBe('proj_fx__v2pilot');
  });

  it('writes only under the new pid; the source pid is never a path segment', () => {
    const { writes } = plan();
    expect(writes.length).toBeGreaterThan(5);
    for (const w of writes) {
      const segs = w.path.split('/');
      expect(segs.slice(0, 4)).toEqual(['workspaces', 'main', 'projects', NEW]);
      expect([4, 6]).toContain(segs.length);
      if (segs.length === 6) expect(['workstreams', 'tasks', 'actions', 'raid']).toContain(segs[4]);
      expect(segs).not.toContain(SRC);
      expect(w.merge).toBeFalsy();
    }
    // Exactly one project doc.
    expect(writes.filter((w) => w.path.split('/').length === 4)).toHaveLength(1);
  });

  it('gives the copy an HOD-only ACL, restricted, schemaVersion 2, rev 0', () => {
    const meta = plan().writes[0].data;
    expect(meta.name).toBe('[v2 pilot] Fixture Project');
    expect(meta.memberIds).toEqual([HOD]);
    expect(meta.roles).toEqual({ [HOD]: 'owner' });
    expect(meta.memberUids).toEqual([HOD]);
    expect(meta.visibility).toBe('restricted');
    expect(meta.schemaVersion).toBe(2);
    expect(meta.rev).toBe(0);
    expect(meta.createdBy).toBe(HOD);
    expect(meta.id).toBe(NEW);
    expect(meta.programMeta).toBeTypeOf('object');
    // Frozen v1 tree is kept for rollback.
    expect(meta.programs).toEqual(fixture.programs);
  });

  it('drops googleChatWebhook and deletedAt (a pilot must not post to the real chat)', () => {
    const meta = plan().writes[0].data;
    expect('googleChatWebhook' in meta).toBe(false);
    expect('deletedAt' in meta).toBe(false);
  });

  it('stamps every sub-doc with projectId = newPid, version 1, updatedBy p2-pilot-copy', () => {
    const { writes } = plan();
    const subs = writes.slice(1);
    expect(subs.length).toBeGreaterThan(0);
    for (const w of subs) {
      expect(w.data.projectId).toBe(NEW);
      expect(w.data.workspaceId).toBe('main');
      expect(w.data.version).toBe(1);
      expect(w.data.updatedBy).toBe('p2-pilot-copy');
    }
    for (const kind of ['workstreams', 'tasks', 'actions', 'raid']) {
      expect(subs.some((w) => w.path.split('/')[4] === kind)).toBe(true);
    }
  });

  it('reports counts', () => {
    const { report, writes } = plan();
    expect(report.counts).toMatchObject({ programs: 2, workstreams: 3 });
    expect(report.docs).toEqual({
      project: 1,
      workstreams: writes.filter((w) => w.path.includes('/workstreams/')).length,
      tasks: writes.filter((w) => w.path.includes('/tasks/')).length,
      actions: writes.filter((w) => w.path.includes('/actions/')).length,
      raid: writes.filter((w) => w.path.includes('/raid/')).length,
    });
  });

  it('refuses newPid === sourcePid, a missing pid or a slash in a pid', () => {
    expect(() => plan(source(), { newPid: SRC })).toThrow(/differ/);
    expect(() => plan(source(), { newPid: '' })).toThrow(/newPid/);
    expect(() => plan(source(), { newPid: 'a/b' })).toThrow(/newPid/);
    expect(() => plan(source(), { ownerUid: '' })).toThrow(/ownerUid/);
  });

  it('refuses a source that is already v2 or is deleted', () => {
    expect(() => plan({ ...source(), schemaVersion: 2 })).toThrow(/v1/);
    expect(() => plan({ ...source(), programMeta: {} })).toThrow(/v1/);
    expect(() => plan({ ...source(), deletedAt: { seconds: 1 } })).toThrow(/deleted/);
  });

  it('refuses when a v1 item already has updatedBy (the stamp would overwrite it)', () => {
    const src = source();
    src.programs[0].workstreams[0].tasks[0].updatedBy = 'someone';
    expect(() => plan(src)).toThrow(/updatedBy/);
  });

  it('does not mutate the source', () => {
    const src = source();
    const before = clone(src);
    plan(src);
    expect(src).toEqual(before);
  });

  it('assembles back to the source tree (compareTrees equal, no orphans)', () => {
    const src = source();
    const { writes } = plan(src);
    const { project, orphanCount } = assembleFromSnapshots(snapshotsFrom(writes, NEW));
    expect(orphanCount).toBe(0);
    expect(compareTrees(src, project)).toEqual({ equal: true, diffs: [] });
  });
});

describe('compareTrees', () => {
  it('reports differing paths', () => {
    const src = source();
    const { writes } = plan(src);
    const { project } = assembleFromSnapshots(snapshotsFrom(writes, NEW));
    project.programs[0].workstreams[0].tasks[0].status = 'Done';
    project.decisions = [];
    const r = compareTrees(src, project);
    expect(r.equal).toBe(false);
    expect(r.diffs).toContain('programs[0].workstreams[0].tasks[0].status');
    expect(r.diffs).toContain('decisions[0]');
  });
});

describe('resolveOwnerUid', () => {
  const docs = [
    { id: 'u_hod', data: { email: 'hattt4@smartosc.com', status: 'active' } },
    { id: 'u_x', data: { email: 'x@smartosc.com', status: 'deactivated' } },
  ];
  it('returns the active members uid of workspaceOwner', () => {
    expect(resolveOwnerUid({ workspaceOwner: 'HaTTT4@smartosc.com' }, docs)).toEqual({ uid: 'u_hod' });
  });
  it('errors when missing, inactive or not an email', () => {
    expect(resolveOwnerUid(null, docs).error).toBeTruthy();
    expect(resolveOwnerUid({ workspaceOwner: 'y@smartosc.com' }, docs).error).toMatch(/no members entry/);
    expect(resolveOwnerUid({ workspaceOwner: 'x@smartosc.com' }, docs).error).toMatch(/not active/);
    expect(resolveOwnerUid({ workspaceOwner: 'Hà' }, docs).error).toMatch(/not an email/);
  });
});

const P = (rest = '') => `workspaces/main/projects/${NEW}${rest}`;
const man = (extra = {}, entries = [{ path: P(), before: null }, { path: P('/tasks/t1'), before: null }]) =>
  ({ kind: 'p2-pilot-copy', sourcePid: SRC, newPid: NEW, createdAt: 'x', entries, ...extra });

describe('assertPilotManifest', () => {
  it('accepts a tagged manifest of new docs under newPid', () => {
    expect(assertPilotManifest(man())).toBe(NEW);
  });
  it('rejects a wrong or missing kind', () => {
    expect(() => assertPilotManifest(man({ kind: 'p2-owner-uids' }))).toThrow(/kind/);
    const { kind: _k, ...untagged } = man();
    void _k;
    expect(() => assertPilotManifest(untagged)).toThrow(/kind/);
  });
  it('rejects newPid === sourcePid or missing pids', () => {
    expect(() => assertPilotManifest(man({ newPid: SRC }))).toThrow(/equals sourcePid/);
    expect(() => assertPilotManifest(man({ newPid: undefined }))).toThrow(/sourcePid \/ newPid/);
  });
  it('rejects entries whose pid differs from newPid (e.g. the source)', () => {
    const tampered = man({}, [{ path: `workspaces/main/projects/${SRC}`, before: null }]);
    expect(() => assertPilotManifest(tampered)).toThrow(/not under newPid/);
    expect(() => assertPilotManifest(man({}, [{ path: P(), before: null }, { path: 'workspaces/main/projects/other/tasks/t1', before: null }]))).toThrow(/not under newPid/);
  });
  it('rejects before-images, merges, odd shapes and empty manifests', () => {
    expect(() => assertPilotManifest(man({}, [{ path: P(), before: { a: 1 } }]))).toThrow(/before-image/);
    expect(() => assertPilotManifest(man({}, [{ path: P(), merge: true, fields: [], before: {} }]))).toThrow(/merge/);
    expect(() => assertPilotManifest(man({}, [{ path: 'workspaces/main', before: null }]))).toThrow(/unexpected path/);
    expect(() => assertPilotManifest(man({}, [{ path: P('/members/x'), before: null }]))).toThrow(/unexpected path/);
    expect(() => assertPilotManifest(man({}, []))).toThrow(/no entries/);
  });
});

// Minimal in-memory Admin-like Firestore: doc get/set/delete/listCollections,
// collection get/listDocuments. `hideCollections` makes listCollections lie (to
// simulate a doc appearing between the emptiness check and the write).
function fakeStore(seed = {}, { hideCollections = false } = {}) {
  const docs = new Map(Object.entries(seed));
  const childCols = (path) => {
    const n = path.split('/').length;
    const ids = new Set();
    for (const k of docs.keys()) if (k.startsWith(`${path}/`) && k.split('/').length >= n + 2) ids.add(k.split('/')[n]);
    return [...ids];
  };
  const docsIn = (col) => [...docs.keys()].filter((k) => k.startsWith(`${col}/`) && k.split('/').length === col.split('/').length + 1);
  const db = {
    docs,
    doc: (path) => ({
      id: path.split('/').pop(),
      get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
      set: async (data) => { docs.set(path, data); },
      delete: async () => { docs.delete(path); },
      listCollections: async () => (hideCollections ? [] : childCols(path).map((id) => ({
        id,
        listDocuments: async () => docsIn(`${path}/${id}`).map((k) => ({ id: k.split('/').pop() })),
      }))),
    }),
    collection: (col) => ({
      get: async () => ({ forEach: (fn) => docsIn(col).forEach((k) => fn({ id: k.split('/').pop(), data: () => docs.get(k) })) }),
    }),
  };
  return db;
}
const pilotDoc = { name: '[v2 pilot] Fixture Project', schemaVersion: 2 };
const noTs = { FieldValue: {}, Timestamp: class {} };

describe('rollbackPilotCopy (fake db)', () => {
  it('deletes the manifest paths when the live doc is a pilot copy', async () => {
    const db = fakeStore({ [P()]: pilotDoc, [P('/tasks/t1')]: { x: 1 } });
    const r = await rollbackPilotCopy(db, man(), noTs);
    expect(r).toMatchObject({ deleted: 2, restored: 0, newPid: NEW, leftover: [] });
    expect(db.docs.size).toBe(0);
  });
  it('refuses (deletes nothing) when the live doc at newPid is not a pilot copy', async () => {
    for (const live of [
      { name: 'Treasury 2026', schemaVersion: 2 },
      { name: '[v2 pilot] X' },
      { name: '[v2 pilot] X', schemaVersion: 1 },
    ]) {
      const db = fakeStore({ [P()]: live, [P('/tasks/t1')]: { x: 1 } });
      await expect(rollbackPilotCopy(db, man(), noTs)).rejects.toThrow(/not a pilot copy/);
      expect(db.docs.size).toBe(2);
    }
  });
  it('refuses a wrong kind or a pid mismatch before reading anything', async () => {
    const db = fakeStore({ [`workspaces/main/projects/${SRC}`]: { name: 'Real' } });
    await expect(rollbackPilotCopy(db, man({ kind: 'other' }), noTs)).rejects.toThrow(/kind/);
    await expect(rollbackPilotCopy(db, man({ newPid: SRC, sourcePid: 'x' }), noTs)).rejects.toThrow(/not under newPid/);
    expect(db.docs.size).toBe(1);
  });
  it('project doc already gone: deletes only sub-doc entries and reports leftovers', async () => {
    const db = fakeStore({ [P('/tasks/t1')]: { x: 1 }, [P('/tasks/stray')]: { y: 1 } });
    const r = await rollbackPilotCopy(db, man(), noTs);
    expect(r.deleted).toBe(1);
    expect(r.leftover).toEqual(['tasks/stray']);
    expect(db.docs.has(P('/tasks/stray'))).toBe(true);
  });
});

describe('applyPilotCopy (fake db)', () => {
  const seedBase = () => ({
    'workspaces/main': { workspaceOwner: 'hattt4@smartosc.com' },
    'workspaces/main/members/u_hod': { email: 'hattt4@smartosc.com', status: 'active' },
    [`workspaces/main/projects/${SRC}`]: source(),
  });
  it('writes a tagged manifest before the first write', async () => {
    const db = fakeStore(seedBase());
    let m;
    const r = await applyPilotCopy(db, { sourcePid: SRC, Timestamp: class {}, writeManifest: (x) => { m = x; } });
    expect(m).toMatchObject({ kind: 'p2-pilot-copy', sourcePid: SRC, newPid: NEW });
    expect(assertPilotManifest(m)).toBe(NEW);
    expect(m.entries).toHaveLength(r.written);
  });
  it('refuses with no writes when a before-image is non-null (doc appeared after the check)', async () => {
    const db = fakeStore({ ...seedBase(), [P('/tasks/t2')]: { stray: true } }, { hideCollections: true });
    const before = new Map(db.docs);
    let wrote = false;
    await expect(applyPilotCopy(db, { sourcePid: SRC, Timestamp: class {}, writeManifest: () => { wrote = true; } }))
      .rejects.toThrow(/already exist.*Nothing was written/);
    expect(wrote).toBe(false);
    expect(db.docs).toEqual(before);
  });
});

describe('targetIsEmpty (fake db)', () => {
  const fakeDb = ({ exists = false, collections = [] } = {}) => ({
    doc: () => ({
      get: async () => ({ exists }),
      listCollections: async () => collections.map((id) => ({ id })),
    }),
  });
  it('is true only when the doc is missing and has no sub-collections', async () => {
    expect(await targetIsEmpty(fakeDb(), NEW)).toEqual({ empty: true });
    expect((await targetIsEmpty(fakeDb({ exists: true }), NEW)).empty).toBe(false);
    const r = await targetIsEmpty(fakeDb({ collections: ['tasks'] }), NEW);
    expect(r).toEqual({ empty: false, reason: expect.stringMatching(/tasks/) });
  });
});
