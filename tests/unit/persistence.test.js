import { describe, it, expect } from 'vitest';
import { classifyReadError, checkRevision, nextRev, nextSaveState, hasUnsavedWork, createKeyedQueue, failedRestores, bannerGroups, buildProjectWrite, loadFailures, saveChip, retryablePids } from '../../src/persistence.js';

describe('classifyReadError', () => {
  it('treats permission-denied and not-found as a missing doc (create path)', () => {
    expect(classifyReadError('permission-denied')).toBe('missing');
    expect(classifyReadError('not-found')).toBe('missing');
  });
  it('treats every other failure as fatal (abort the write)', () => {
    expect(classifyReadError('unavailable')).toBe('fatal');
    expect(classifyReadError('deadline-exceeded')).toBe('fatal');
    expect(classifyReadError(undefined)).toBe('fatal');
  });
});

describe('checkRevision', () => {
  it('ok when the doc does not exist yet', () => {
    expect(checkRevision(undefined, undefined, false)).toBe('ok');
  });
  it('ok when server rev equals the rev we loaded (missing rev = 0)', () => {
    expect(checkRevision(5, 5, true)).toBe('ok');
    expect(checkRevision(undefined, 0, true)).toBe('ok');
    expect(checkRevision(undefined, undefined, true)).toBe('ok');
  });
  it('conflict when the server moved on since we loaded', () => {
    expect(checkRevision(6, 5, true)).toBe('conflict');
    expect(checkRevision(undefined, 5, true)).toBe('conflict'); // old bundle dropped rev
  });
});

describe('nextRev', () => {
  it('increments, treating missing as 0', () => {
    expect(nextRev(undefined)).toBe(1);
    expect(nextRev(4)).toBe(5);
  });
});

describe('nextSaveState', () => {
  it('records one entry per project and clears it on ok', () => {
    let s = {};
    s = nextSaveState(s, 'p1', 'error', 'CRP');
    s = nextSaveState(s, 'p1', 'error', 'CRP');
    expect(s).toEqual({ p1: { status: 'error', name: 'CRP' } });
    s = nextSaveState(s, 'p2', 'conflict', 'MA');
    expect(Object.keys(s)).toEqual(['p1', 'p2']);
    s = nextSaveState(s, 'p1', 'ok', 'CRP');
    expect(s).toEqual({ p2: { status: 'conflict', name: 'MA' } });
  });
  it('returns the same object when nothing changes (no re-render)', () => {
    const s = {};
    expect(nextSaveState(s, 'p1', 'ok', 'CRP')).toBe(s);
  });
  it('conflict is sticky: a later error does not downgrade it', () => {
    let s = nextSaveState({}, 'p1', 'conflict', 'CRP');
    s = nextSaveState(s, 'p1', 'error', 'CRP');
    expect(s.p1.status).toBe('conflict');
  });
  it('readonly is sticky: neither error nor ok clears it (only reload does)', () => {
    let s = nextSaveState({}, 'p1', 'readonly', 'Pilot');
    expect(s).toEqual({ p1: { status: 'readonly', name: 'Pilot' } });
    const before = s;
    s = nextSaveState(s, 'p1', 'error', 'Pilot');
    expect(s).toBe(before);
    s = nextSaveState(s, 'p1', 'ok', 'Pilot');
    expect(s).toBe(before);
    s = nextSaveState(s, 'p1', 'conflict', 'Pilot');
    expect(s.p1.status).toBe('readonly');
  });
  it('denied and refused are per attempt: a later ok clears them, conflict still wins', () => {
    let s = nextSaveState({}, 'p1', 'denied', 'Pilot');
    expect(s).toEqual({ p1: { status: 'denied', name: 'Pilot' } });
    s = nextSaveState(s, 'p1', 'ok', 'Pilot');
    expect(s).toEqual({});
    s = nextSaveState({}, 'p1', 'refused', 'Pilot');
    expect(s.p1.status).toBe('refused');
    s = nextSaveState(s, 'p1', 'denied', 'Pilot');
    expect(s.p1.status).toBe('denied');
    s = nextSaveState(s, 'p1', 'ok', 'Pilot');
    expect(s).toEqual({});
    s = nextSaveState(nextSaveState({}, 'p1', 'conflict', 'Pilot'), 'p1', 'denied', 'Pilot');
    expect(s.p1.status).toBe('conflict');
  });
});

describe('hasUnsavedWork', () => {
  it('true while saves are pending or any project failed', () => {
    expect(hasUnsavedWork(0, {})).toBe(false);
    expect(hasUnsavedWork(1, {})).toBe(true);
    expect(hasUnsavedWork(0, { p1: { status: 'error', name: 'X' } })).toBe(true);
  });
});

describe('createKeyedQueue (B3 fix: no overlapping writes per project)', () => {
  const tick = () => new Promise((r) => setTimeout(r, 5));
  it('runs jobs with the same key strictly one after another', async () => {
    const q = createKeyedQueue();
    const events = [];
    const job = (name) => async () => { events.push(name + ':start'); await tick(); events.push(name + ':end'); return name; };
    const [a, b] = await Promise.all([q.run('p1', job('a')), q.run('p1', job('b'))]);
    expect([a, b]).toEqual(['a', 'b']);
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });
  it('lets different keys run concurrently', async () => {
    const q = createKeyedQueue();
    const events = [];
    const job = (name) => async () => { events.push(name + ':start'); await tick(); events.push(name + ':end'); };
    await Promise.all([q.run('p1', job('a')), q.run('p2', job('b'))]);
    expect(events.slice(0, 2).sort()).toEqual(['a:start', 'b:start']);
  });
  it('a failing job does not block the next one', async () => {
    const q = createKeyedQueue();
    const first = q.run('p1', async () => { throw new Error('boom'); });
    await expect(first).rejects.toThrow('boom');
    await expect(q.run('p1', async () => 'ok')).resolves.toBe('ok');
  });
});

describe('failedRestores (B3 fix: restore must not report success when saves failed)', () => {
  it('lists the names of projects that were not saved', () => {
    expect(failedRestores([
      { name: 'A', status: 'ok' }, { name: 'B', status: 'conflict' }, { name: 'C', status: 'error' },
    ])).toEqual(['B', 'C']);
    expect(failedRestores([])).toEqual([]);
  });
});

describe('bannerGroups (follow-up: conflict and error listed separately)', () => {
  it('splits project names by failure kind', () => {
    expect(bannerGroups({
      a: { status: 'conflict', name: 'CRP' }, b: { status: 'error', name: 'MA' }, c: { status: 'error', name: 'UBO' },
    })).toEqual({ conflict: ['CRP'], error: ['MA', 'UBO'], readonly: [], denied: [], refused: [], history: [] });
    expect(bannerGroups({})).toEqual({ conflict: [], error: [], readonly: [], denied: [], refused: [], history: [] });
  });
  it('lists readonly (v2 pilot) projects separately', () => {
    expect(bannerGroups({
      a: { status: 'readonly', name: 'Pilot' }, b: { status: 'error', name: 'MA' },
    })).toEqual({ conflict: [], error: ['MA'], readonly: ['Pilot'], denied: [], refused: [], history: [] });
  });
  it('lists denied and refused (P2.3 v2 saves) separately', () => {
    expect(bannerGroups({
      a: { status: 'denied', name: 'Pilot' }, b: { status: 'refused', name: 'KR' }, c: { status: 'error', name: 'MA' },
    })).toEqual({ conflict: [], error: ['MA'], readonly: [], denied: ['Pilot'], refused: ['KR'], history: [] });
  });
  it('lists history (close-history-wipe refusals, P3.1 I2) separately from other refusals', () => {
    expect(bannerGroups({
      a: { status: 'history', name: 'KR' }, b: { status: 'refused', name: 'Ops' },
    })).toEqual({ conflict: [], error: [], readonly: [], denied: [], refused: ['Ops'], history: ['KR'] });
  });
  it('history is per attempt: a later ok clears it', () => {
    let s = nextSaveState({}, 'p1', 'history', 'KR');
    expect(s.p1.status).toBe('history');
    s = nextSaveState(s, 'p1', 'ok', 'KR');
    expect(s).toEqual({});
  });
});

describe('buildProjectWrite (B3 debt: decision used inside runTransaction)', () => {
  const NOW = { __ts: 'now' };
  const incoming = { id: 'p1', rev: 99, name: 'CRP', programs: [1], relatedParties: ['client copy'] };
  it('creates a new project with the writer as owner and rev 1', () => {
    const r = buildProjectWrite(null, incoming, { uid: 'u1', knownRev: undefined, force: false, now: NOW });
    expect(r.conflict).toBe(false);
    expect(r.newRev).toBe(1);
    expect(r.doc).toEqual({
      name: 'CRP', programs: [1], relatedParties: ['client copy'],
      memberIds: ['u1'], roles: { u1: 'owner' }, createdBy: 'u1', createdAt: NOW, deletedAt: null,
      rev: 1, updatedAt: NOW,
    });
  });
  it('keeps server ACL, lifecycle and relatedParties on update; strips id and client rev', () => {
    const ex = { rev: 4, memberIds: ['a', 'b'], roles: { a: 'owner', b: 'operator' }, createdBy: 'a', createdAt: 'T0', deletedAt: null, relatedParties: ['server'] };
    const r = buildProjectWrite(ex, incoming, { uid: 'b', knownRev: 4, force: false, now: NOW });
    expect(r.conflict).toBe(false);
    expect(r.doc).toMatchObject({ memberIds: ['a', 'b'], roles: { a: 'owner', b: 'operator' }, createdBy: 'a', createdAt: 'T0', relatedParties: ['server'], rev: 5 });
    expect(r.doc).not.toHaveProperty('id');
  });
  it('refuses when the server moved on, unless forced', () => {
    const ex = { rev: 6, memberIds: ['a'], roles: { a: 'owner' } };
    expect(buildProjectWrite(ex, incoming, { uid: 'a', knownRev: 5, force: false, now: NOW })).toEqual({ conflict: true });
    expect(buildProjectWrite(ex, incoming, { uid: 'a', knownRev: 5, force: true, now: NOW }).newRev).toBe(7);
  });
});

describe('buildProjectWrite — own write detection (review I1)', () => {
  const NOW = { __ts: 'now' };
  const inc = { id: 'p1', name: 'CRP' };
  it('a retry that finds its own writeId on the server is already applied (no write, no conflict)', () => {
    const ex = { rev: 6, writeId: 'w2', memberIds: ['a'], roles: { a: 'owner' } };
    const r = buildProjectWrite(ex, inc, { uid: 'a', knownRev: 5, force: false, now: NOW, writeId: 'w2' });
    expect(r).toEqual({ conflict: false, newRev: 6, doc: null });
  });
  it('an earlier save whose result was lost counts as ours on the next save', () => {
    const ex = { rev: 6, writeId: 'w1', memberIds: ['a'], roles: { a: 'owner' } };
    const r = buildProjectWrite(ex, inc, { uid: 'a', knownRev: 5, force: false, now: NOW, writeId: 'w2', pendingWriteIds: ['w1'] });
    expect(r.conflict).toBe(false);
    expect(r.newRev).toBe(7);
    expect(r.doc.writeId).toBe('w2');
  });
  it('another client\'s write is still a conflict', () => {
    const ex = { rev: 6, writeId: 'other', memberIds: ['a'], roles: { a: 'owner' } };
    expect(buildProjectWrite(ex, inc, { uid: 'a', knownRev: 5, force: false, now: NOW, writeId: 'w2', pendingWriteIds: ['w1'] })).toEqual({ conflict: true });
  });
  it('more cases: legacy doc without rev, force on create, deletedAt/createdAt kept', () => {
    expect(buildProjectWrite({ memberIds: ['a'], roles: { a: 'owner' } }, inc, { uid: 'a', knownRev: undefined, force: false, now: NOW }).newRev).toBe(1);
    expect(buildProjectWrite(null, inc, { uid: 'a', knownRev: 3, force: true, now: NOW }).newRev).toBe(1);
    const r = buildProjectWrite({ rev: 2, deletedAt: 'D', createdAt: 'C', memberIds: ['a'], roles: { a: 'owner' } }, inc, { uid: 'a', knownRev: 2, force: false, now: NOW });
    expect(r.doc).toMatchObject({ deletedAt: 'D', createdAt: 'C' });
  });
});

describe('buildProjectWrite — v2 fields stay server-owned (P2.2 task 3)', () => {
  const V2_KEYS = { programMeta: { p1: { x: 1 } }, memberUids: ['u1'], visibility: 'restricted', schemaVersion: 1 };
  const opts = (o = {}) => ({ uid: 'a', knownRev: 5, force: false, now: 'TS', ...o });
  it('ignores incoming v2 keys and keeps server values', () => {
    const ex = { rev: 5, ...V2_KEYS };
    const inc = { name: 'P', programMeta: { evil: 1 }, memberUids: ['x'], visibility: 'department', schemaVersion: 7 };
    const { doc } = buildProjectWrite(ex, inc, opts());
    expect(doc.programMeta).toEqual(V2_KEYS.programMeta);
    expect(doc.memberUids).toEqual(['u1']);
    expect(doc.visibility).toBe('restricted');
    expect(doc.schemaVersion).toBe(1);
  });
  it.each(Object.keys(V2_KEYS))('preserves %s independently; omits it when absent on ex', (k) => {
    const ex = { rev: 5, [k]: V2_KEYS[k] };
    const inc = { name: 'P', ...V2_KEYS };
    const { doc } = buildProjectWrite(ex, inc, opts());
    for (const other of Object.keys(V2_KEYS)) {
      if (other === k) expect(doc[other]).toEqual(V2_KEYS[k]);
      else expect(other in doc).toBe(false);
    }
  });
  it('omits all v2 keys on create even if incoming has them', () => {
    const { doc } = buildProjectWrite(null, { name: 'P', ...V2_KEYS }, opts({ knownRev: undefined }));
    for (const k of Object.keys(V2_KEYS)) expect(k in doc).toBe(false);
  });
  it('returns readonly for a v2 doc, even with force or stale rev', () => {
    const ex = { rev: 9, schemaVersion: 2 };
    expect(buildProjectWrite(ex, { name: 'P' }, opts())).toEqual({ readonly: true });
    expect(buildProjectWrite(ex, { name: 'P' }, opts({ force: true }))).toEqual({ readonly: true });
    expect(buildProjectWrite(ex, { name: 'P' }, opts({ knownRev: 9 }))).toEqual({ readonly: true });
  });
  it('never persists the client-only __v2 marker', () => {
    const { doc } = buildProjectWrite({ rev: 5 }, { name: 'P', __v2: { readOnly: true, orphans: 0 } }, opts());
    expect('__v2' in doc).toBe(false);
    const created = buildProjectWrite(null, { name: 'P', __v2: { readOnly: true } }, opts({ knownRev: undefined }));
    expect('__v2' in created.doc).toBe(false);
  });
});

describe('loadFailures (C1: parallel load reports which projects failed)', () => {
  it('returns ids whose result is null', () => {
    expect(loadFailures(['a', 'b', 'c'], [{ id: 'a' }, null, { id: 'c' }])).toEqual(['b']);
  });
  it('returns [] when all loaded or no ids', () => {
    expect(loadFailures(['a'], [{ id: 'a' }])).toEqual([]);
    expect(loadFailures([], [])).toEqual([]);
  });
  it('treats undefined result as failed', () => {
    expect(loadFailures(['a', 'b'], [{ id: 'a' }])).toEqual(['b']);
  });
});

describe('saveChip', () => {
  const err = { p1: { status: 'error', name: 'A' } };
  it('error entry -> Not saved — Retry with retry true', () => {
    expect(saveChip({ pending: 0, saveState: err, lastSavedAt: '09:05' })).toEqual({ label: 'Not saved — Retry', tone: 'error', retry: true });
  });
  it('error wins over pending', () => {
    expect(saveChip({ pending: 2, saveState: err, lastSavedAt: null }).label).toBe('Not saved — Retry');
  });
  it('pending -> Saving…', () => {
    expect(saveChip({ pending: 1, saveState: {}, lastSavedAt: '09:05' })).toEqual({ label: 'Saving…', tone: 'muted', retry: false });
  });
  it('saved time -> Saved hh:mm', () => {
    expect(saveChip({ pending: 0, saveState: {}, lastSavedAt: '09:05' })).toEqual({ label: 'Saved 09:05', tone: 'ok', retry: false });
  });
  it('nothing -> empty label', () => {
    expect(saveChip({ pending: 0, saveState: {}, lastSavedAt: null })).toEqual({ label: '', tone: 'muted', retry: false });
  });
  it('any non-error entry hides the chip (the sticky banner speaks; never Saved next to a refusal)', () => {
    for (const status of ['conflict', 'denied', 'refused', 'history', 'readonly']) {
      const st = { a: { status, name: 'A' } };
      expect(saveChip({ pending: 0, saveState: st, lastSavedAt: '09:05' })).toEqual({ label: '', tone: 'muted', retry: false });
      expect(saveChip({ pending: 1, saveState: st, lastSavedAt: '09:05' })).toEqual({ label: '', tone: 'muted', retry: false });
    }
  });
  it('a non-error entry also hides the chip when an error entry exists (banner lists both)', () => {
    const st = { a: { status: 'error', name: 'A' }, b: { status: 'conflict', name: 'B' } };
    expect(saveChip({ pending: 0, saveState: st, lastSavedAt: '09:05' })).toEqual({ label: '', tone: 'muted', retry: false });
  });
});

describe('retryablePids', () => {
  it('lists only projects whose save failed with error', () => {
    const st = {
      p1: { status: 'error', name: 'A' }, p2: { status: 'conflict', name: 'B' }, p3: { status: 'denied', name: 'C' },
      p4: { status: 'refused', name: 'D' }, p5: { status: 'history', name: 'E' }, p6: { status: 'readonly', name: 'F' },
      p7: { status: 'error', name: 'G' },
    };
    expect(retryablePids(st)).toEqual(['p1', 'p7']);
  });
  it('empty / missing state -> []', () => {
    expect(retryablePids({})).toEqual([]);
    expect(retryablePids(undefined)).toEqual([]);
  });
});
