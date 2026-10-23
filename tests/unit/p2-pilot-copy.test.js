import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/v1-project.json';
import { buildDirectoryIndex } from '../../src/directory.js';
import { assembleFromSnapshots } from '../../src/readV2.js';
import {
  planPilotCopy, defaultNewPid, resolveOwnerUid, assertPilotManifest, targetIsEmpty,
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

describe('assertPilotManifest', () => {
  const e = (path) => ({ path, before: null });
  it('accepts a manifest of new docs under one project', () => {
    expect(assertPilotManifest({ entries: [e(`workspaces/main/projects/${NEW}`), e(`workspaces/main/projects/${NEW}/tasks/t1`)] })).toBe(NEW);
  });
  it('rejects before-images, merges, mixed or foreign paths', () => {
    expect(() => assertPilotManifest({ entries: [{ path: `workspaces/main/projects/${NEW}`, before: { a: 1 } }] })).toThrow();
    expect(() => assertPilotManifest({ entries: [{ path: `workspaces/main/projects/${NEW}`, merge: true, fields: [], before: {} }] })).toThrow();
    expect(() => assertPilotManifest({ entries: [e(`workspaces/main/projects/${NEW}`), e('workspaces/main/projects/other/tasks/t1')] })).toThrow();
    expect(() => assertPilotManifest({ entries: [e('workspaces/main')] })).toThrow();
    expect(() => assertPilotManifest({ entries: [] })).toThrow();
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
