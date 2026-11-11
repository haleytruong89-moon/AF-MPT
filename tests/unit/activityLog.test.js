import { describe, it, expect } from 'vitest';
import { planActivityAppend } from '../../src/activityLog';

const ev = (n) => ({ id: `e${n}` });

describe('planActivityAppend', () => {
  it('v2 writes only the new entry and never the read log', () => {
    const r = planActivityAppend({ v2: true, read: [ev(1), ev(2)], pending: [ev(9)], entry: ev(3) });
    expect(r).toEqual({ write: [ev(3)], pending: [], display: null });
  });
  it('v1 read failure writes nothing and queues the entry newest first', () => {
    const r = planActivityAppend({ v2: false, read: null, pending: [ev(5)], entry: ev(6) });
    expect(r.write).toBeNull();
    expect(r.display).toBeNull();
    expect(r.pending).toEqual([ev(6), ev(5)]);
  });
  it('v1 read ok merges entry, pending, read and clears pending', () => {
    const r = planActivityAppend({ v2: false, read: [ev(1)], pending: [ev(3), ev(2)], entry: ev(4) });
    expect(r.write).toEqual([ev(4), ev(3), ev(2), ev(1)]);
    expect(r.display).toEqual(r.write);
    expect(r.pending).toEqual([]);
  });
  it('v1 caps at 500', () => {
    const read = Array.from({ length: 500 }, (_, i) => ev(i));
    const r = planActivityAppend({ v2: false, read, pending: [], entry: ev('new') });
    expect(r.write).toHaveLength(500);
    expect(r.write[0]).toEqual(ev('new'));
  });
});

describe('planActivityAppend de-duplication (M-1)', () => {
  it('does not repeat an entry whose id is already in read', () => {
    const e = { id: 'x', t: 1 };
    const r = planActivityAppend({ v2: false, read: [{ id: 'x', t: 1 }, { id: 'y' }], pending: [], entry: e });
    expect(r.write.map((a) => a.id)).toEqual(['x', 'y']);
  });
  it('does not repeat a pending entry already in read, keeps first occurrence', () => {
    const r = planActivityAppend({ v2: false, read: [{ id: 'p' }, { id: 'y' }], pending: [{ id: 'p' }], entry: { id: 'n' } });
    expect(r.write.map((a) => a.id)).toEqual(['n', 'p', 'y']);
  });
});
