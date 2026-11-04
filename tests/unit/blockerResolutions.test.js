import { describe, it, expect } from 'vitest';
import { foldResolutions, unfoldResolutions, newResolutionKeys } from '../../src/blockerResolutions.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const blocker = (id, over = {}) => ({ id, text: `blocker ${id}`, isBlocker: true, author: 'a@smartosc.com', timestamp: '2026-10-20T00:00:00Z', authorUid: 'uA', ...over });
const res = (by, uid, over = {}) => ({ resolvedAt: '2026-10-25T00:00:00.000Z', resolvedBy: by, resolution: 'done', authorUid: uid, ...over });

const storedTask = () => ({
  id: 't1', name: 'T', status: 'InProgress', picUid: 'uA',
  updates: [
    blocker('u3'),
    { id: 'u2', text: 'note', author: 'a@smartosc.com', timestamp: '2026-10-19T00:00:00Z' },
    blocker('u1'),
    // legacy in-place resolution
    blocker('u0', { resolvedAt: '2026-10-01T00:00:00Z', resolvedBy: 'b@smartosc.com', resolution: null }),
    { text: 'id-less', isBlocker: true },
  ],
  blockerResolutions: { u1: res('a@smartosc.com', 'uA') },
});

describe('foldResolutions', () => {
  it('fold merges map into the matching update and drops the key', () => {
    const t = storedTask();
    const f = foldResolutions(t);
    expect(f).not.toHaveProperty('blockerResolutions');
    expect(f.updates[2]).toEqual({ ...blocker('u1'), resolvedAt: '2026-10-25T00:00:00.000Z', resolvedBy: 'a@smartosc.com', resolution: 'done' });
    expect(f.updates[2].authorUid).toBe('uA'); // the update's own author, not the resolver's
    expect(f.updates[0]).toEqual(blocker('u3'));
    expect(f.updates[3]).toEqual(t.updates[3]);
    expect(t).toEqual(storedTask()); // no mutation
  });

  it('a legacy in-place resolution wins over a map key; no map -> same object', () => {
    const t = storedTask();
    t.blockerResolutions.u0 = res('c@smartosc.com', 'uC');
    expect(foldResolutions(t).updates[3]).toEqual(t.updates[3]);
    const plain = { id: 't', updates: [blocker('u1')] };
    expect(foldResolutions(plain)).toBe(plain);
  });

  it('a null or non-map value is dropped without folding', () => {
    expect(foldResolutions({ id: 't', updates: [blocker('u1')], blockerResolutions: null })).toEqual({ id: 't', updates: [blocker('u1')] });
  });
});

describe('unfoldResolutions', () => {
  it('unfold of an unchanged folded task deep-equals the stored raw task', () => {
    const t = storedTask();
    expect(unfoldResolutions(t, foldResolutions(t), 'uZ')).toEqual(t);
    const noMap = { ...storedTask() };
    delete noMap.blockerResolutions;
    const back = unfoldResolutions(noMap, foldResolutions(noMap), 'uZ');
    expect(back).toEqual(noMap);
    expect(back).not.toHaveProperty('blockerResolutions');
  });

  it('a stored null / empty map is re-sent as stored', () => {
    for (const v of [null, {}]) {
      const t = { ...storedTask(), blockerResolutions: v };
      expect(unfoldResolutions(t, foldResolutions(t), 'uZ')).toEqual(t);
    }
  });

  it('unfold of a newly resolved blocker adds one map key with authorUid and leaves updates raw', () => {
    const t = storedTask();
    const f = foldResolutions(t);
    f.updates[0] = { ...f.updates[0], resolvedAt: '2026-10-26T01:00:00.000Z', resolvedBy: 'a@smartosc.com', resolution: null };
    const u = unfoldResolutions(t, f, 'uA');
    expect(u.updates).toEqual(t.updates);
    expect(u.blockerResolutions).toEqual({
      u1: t.blockerResolutions.u1,
      u3: { resolvedAt: '2026-10-26T01:00:00.000Z', resolvedBy: 'a@smartosc.com', resolution: null, authorUid: 'uA' },
    });
    expect(newResolutionKeys(t, u)).toEqual(['u3']);
  });

  it('first resolution on a doc without a map creates it with one key', () => {
    const t = storedTask();
    delete t.blockerResolutions;
    const f = clone(foldResolutions(t)); // the tree reaches the App as JSON

    f.updates[2] = { ...f.updates[2], resolvedAt: '2026-10-26T00:00:00.000Z', resolvedBy: 'a@smartosc.com', resolution: 'ok' };
    const u = unfoldResolutions(t, f, 'uA');
    expect(u.updates).toEqual(t.updates);
    expect(Object.keys(u.blockerResolutions)).toEqual(['u1']);
  });

  it('a changed resolution of a stored key keeps the original resolver authorUid (an edit)', () => {
    const t = storedTask();
    const f = foldResolutions(t);
    f.updates[2] = { ...f.updates[2], resolvedBy: 'renamed@smartosc.com' };
    const u = unfoldResolutions(t, f, 'uPM');
    expect(u.blockerResolutions.u1).toEqual({ ...res('renamed@smartosc.com', 'uA') });
    expect(newResolutionKeys(t, u)).toEqual([]);
  });

  it('an edit of a stored key without authorUid stamps the caller', () => {
    const t = storedTask();
    const { authorUid: _a, ...noAuthor } = t.blockerResolutions.u1;
    void _a;
    t.blockerResolutions.u1 = noAuthor;
    const f = foldResolutions(t);
    f.updates[2] = { ...f.updates[2], resolution: 'edited' };
    const u = unfoldResolutions(t, f, 'uPM');
    expect(u.blockerResolutions.u1).toEqual(res('a@smartosc.com', 'uPM', { resolution: 'edited' }));
  });

  it('new entries, legacy in-place and id-less entries stay as they are', () => {
    const t = storedTask();
    const f = foldResolutions(t);
    const fresh = blocker('u9', { resolvedAt: '2026-10-26T00:00:00Z', resolvedBy: 'x', resolution: 'y' });
    f.updates = [fresh, ...f.updates];
    f.updates[5] = { text: 'id-less', isBlocker: true, resolvedAt: '2026-10-26T00:00:00Z', resolvedBy: 'x' };
    const u = unfoldResolutions(t, f, 'uA');
    expect(u.updates[0]).toEqual(fresh);
    expect(u.updates[4]).toEqual(t.updates[3]);
    expect(u.updates[5]).toEqual(f.updates[5]);
    expect(u.blockerResolutions).toEqual(t.blockerResolutions);
  });

  it('a resolution removed from the tree never deletes the stored key', () => {
    const t = storedTask();
    const f = foldResolutions(t);
    f.updates[2] = blocker('u1');
    expect(unfoldResolutions(t, f, 'uA').blockerResolutions).toEqual(t.blockerResolutions);
  });

  it('newResolutionKeys orders by resolvedAt, oldest first', () => {
    const next = { blockerResolutions: { b: res('x', 'u', { resolvedAt: '2026-10-27' }), a: res('x', 'u', { resolvedAt: '2026-10-28' }), c: res('x', 'u') } };
    expect(newResolutionKeys({ blockerResolutions: { c: 1 } }, next)).toEqual(['b', 'a']);
    expect(newResolutionKeys({}, clone(next))).toEqual(['c', 'b', 'a']);
  });
});
