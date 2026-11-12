import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { ACTIVITY_KEYS, ACTIVITY_DESCRIPTION_MAX, activityDocFor, activityEntryFromDoc } from '../../src/activityDoc.js';

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

describe('activityDocFor description cap', () => {
  const len = (n) => activityDocFor({ id: 'a', type: 't', description: 'x'.repeat(n) }, 'u').description;
  it('keeps 1999 and 2000 chars unchanged', () => {
    expect(len(1999)).toHaveLength(1999);
    expect(len(2000)).toHaveLength(2000);
  });
  it('truncates 2001 and very long text to 2000 chars ending with an ellipsis', () => {
    for (const n of [2001, 50000]) {
      const d = len(n);
      expect(d).toHaveLength(ACTIVITY_DESCRIPTION_MAX);
      expect(d.endsWith('…')).toBe(true);
    }
  });
});

describe('activityEntryFromDoc author is never blank', () => {
  it('no directory name and no stored author: email, else Unknown', () => {
    expect(activityEntryFromDoc({ authorUid: 'u', authorEmail: 'a@smartosc.com' }, 'i', () => null).author).toBe('a@smartosc.com');
    expect(activityEntryFromDoc({ authorUid: 'u' }, 'i', () => null).author).toBe('Unknown');
    expect(activityEntryFromDoc({ authorUid: 'u', author: '  ' }, 'i', null).author).toBe('Unknown');
  });
});

describe('migrated v2 activity doc (shape written by p2-migrate)', () => {
  const doc = {
    id: 'e1', type: 'status_change', description: 'd', author: 'Lybk', authorEmail: 'lybk@smartosc.com',
    authorUid: 'uidL', createdAt: { toDate: () => new Date('2026-03-04T05:06:07Z') },
    timestamp: '2026-03-04T05:06:07.000Z', copiedBy: 'p2-migrate',
  };
  it('directory has no name: stored author and createdAt time show', () => {
    const e = activityEntryFromDoc(doc, 'e1', () => null);
    expect(e.author).toBe('Lybk');
    expect(e.timestamp).toBe('2026-03-04T05:06:07.000Z');
  });
  it('directory name wins when present', () => {
    expect(activityEntryFromDoc(doc, 'e1', () => 'Lybk (dir)').author).toBe('Lybk (dir)');
  });
});

describe('ACTIVITY_KEYS matches firestore.rules', () => {
  it('equals the hasOnly list in activityShapeOk', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    const m = rules.match(/function activityShapeOk[\s\S]*?hasOnly\(\[([\s\S]*?)\]\)/);
    expect(m).toBeTruthy();
    const keys = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect([...keys].sort()).toEqual([...ACTIVITY_KEYS].sort());
  });
});
