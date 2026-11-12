import { describe, it, expect } from 'vitest';
import { ACTIVITY_KEYS, activityDocFor, activityEntryFromDoc } from '../../src/activityDoc.js';

describe('activityDocFor', () => {
  it('keeps allow-listed keys, drops author / authorName / timestamp, stamps the uid', () => {
    const d = activityDocFor({
      id: 'a1', timestamp: 't', author: 'Mallory', authorName: 'M', type: 'x', description: 'd',
      before: { v: 1 }, after: { v: 2 }, programId: 'p', workstreamId: 'w', junk: 1, authorUid: 'forged',
    }, 'u1');
    expect(d).toEqual({
      id: 'a1', type: 'x', description: 'd', before: { v: 1 }, after: { v: 2 },
      programId: 'p', workstreamId: 'w', authorUid: 'u1',
    });
  });
  it('omits absent optional keys and never sets createdAt', () => {
    const d = activityDocFor({ id: 'a', type: 't', description: 'd', createdAt: 'x' }, 'u');
    expect(d).toEqual({ id: 'a', type: 't', description: 'd', authorUid: 'u' });
    expect(Object.keys(d).every((k) => ACTIVITY_KEYS.includes(k))).toBe(true);
  });
});

describe('activityEntryFromDoc', () => {
  const ts = { toDate: () => new Date('2026-11-01T00:00:00Z') };
  it('uses createdAt and the directory name', () => {
    const e = activityEntryFromDoc({ type: 'x', authorUid: 'u1', createdAt: ts, author: 'stored' }, 'id1', (u) => (u === 'u1' ? 'Hatt' : null));
    expect(e).toMatchObject({ id: 'id1', author: 'Hatt', timestamp: '2026-11-01T00:00:00.000Z' });
    expect(e.createdAt).toBeUndefined();
  });
  it('falls back to the stored author when the lookup has no name', () => {
    expect(activityEntryFromDoc({ authorUid: 'u9', author: 'Old', createdAt: ts }, 'i', () => null).author).toBe('Old');
  });
  it('migrated v1 doc without authorUid keeps stored author and timestamp', () => {
    const e = activityEntryFromDoc({ id: 'e1', author: 'Lybk', timestamp: '2026-01-02T03:04:05.000Z', type: 'x' }, 'e1', () => 'Nope');
    expect(e).toMatchObject({ id: 'e1', author: 'Lybk', timestamp: '2026-01-02T03:04:05.000Z' });
  });
  it('a pending serverTimestamp (null createdAt) keeps stored timestamp; id from doc id', () => {
    const e = activityEntryFromDoc({ type: 'x', createdAt: null, timestamp: 'T' }, 'docid', null);
    expect(e).toMatchObject({ id: 'docid', timestamp: 'T' });
  });
});
