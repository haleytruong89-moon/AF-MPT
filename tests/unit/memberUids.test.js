import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...segs) => segs.join('/'),
  collection: (_db, ...segs) => segs.join('/'),
  updateDoc: async (ref, data) => { calls.push({ ref, data }); },
  serverTimestamp: () => ({ __ts: true }),
  arrayUnion: (...v) => ({ __union: v }),
  arrayRemove: (...v) => ({ __remove: v }),
  getDoc: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(),
  onSnapshot: vi.fn(), query: vi.fn(), where: vi.fn(),
}));
vi.mock('../../src/firebase', () => ({ db: {} }));

const { addProjectMember, removeProjectMember, setMemberRole } = await import('../../src/data.ts');

const v1 = { id: 'p', memberIds: ['a'], roles: { a: 'owner' } };
const v2 = { ...v1, schemaVersion: 2, memberUids: ['a'] };

describe('member helpers keep memberUids in sync on v2 projects', () => {
  beforeEach(() => { calls.length = 0; });

  it('add: v2 patch carries arrayUnion(uid); v1 does not carry memberUids', async () => {
    await addProjectMember(v2, { uid: 'b' }, 'member');
    expect(calls[0].data.memberUids).toEqual({ __union: ['b'] });
    expect(calls[0].data.memberIds).toEqual(['a', 'b']);
    await addProjectMember(v1, { uid: 'b' }, 'member');
    expect('memberUids' in calls[1].data).toBe(false);
  });

  it('remove: v2 patch carries arrayRemove(uid); v1 does not', async () => {
    await removeProjectMember(v2, 'a');
    expect(calls[0].data.memberUids).toEqual({ __remove: ['a'] });
    await removeProjectMember(v1, 'a');
    expect('memberUids' in calls[1].data).toBe(false);
  });

  it('setMemberRole never touches memberUids', async () => {
    await setMemberRole(v2, 'a', 'operator');
    expect('memberUids' in calls[0].data).toBe(false);
    expect(calls[0].data.roles.a).toBe('operator');
  });
});
