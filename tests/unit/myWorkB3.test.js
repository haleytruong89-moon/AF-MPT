import { describe, it, expect } from 'vitest';
import { mentionsMe } from '../../src/mentions.js';
import { rejectedCloseItem } from '../../src/myWorkItems.js';
import { shouldReloadOnFocus } from '../../src/persistence.js';
import { unlinkedAssignment, unlinkedContribution, raidUpdaterNote, decisionUpdaterNote } from '../../src/roleUi.js';
import { buildDirectoryIndex, isMeFor } from '../../src/directory.js';

// W3-B3: My Work helpers (M1, M2, M3, M6).
const dir = buildDirectoryIndex([
  { email: 'lan.pham@smartosc.com', displayName: 'Phạm Thị Lan', aliases: ['Lan P'], status: 'active' },
  { email: 'lan.nguyen@smartosc.com', displayName: 'Lan Nguyen', status: 'active' },
]);
const isMe = isMeFor(dir, 'Phạm Thị Lan', 'lan.pham@smartosc.com');

describe('W3-B3 mentionsMe', () => {
  it('MN-1 username, display name with spaces, alias, folded diacritics, trailing punctuation', () => {
    expect(mentionsMe('please check @lan.pham', isMe)).toBe(true);
    expect(mentionsMe('@Phạm Thị Lan can you look', isMe)).toBe(true);
    expect(mentionsMe('cc @Lan P.', isMe)).toBe(true);
    expect(mentionsMe('@Pham Thi Lan', isMe)).toBe(true);
    expect(mentionsMe('thanks @lan.pham.', isMe)).toBe(true);
  });
  it('MN-2 another person sharing the first word is not me', () => {
    expect(mentionsMe('@Lan Nguyen please', isMe)).toBe(false);
    expect(mentionsMe('no mention here', isMe)).toBe(false);
    expect(mentionsMe('email lan.pham@smartosc.com', isMe)).toBe(false);
  });
  it('MN-3 without a directory: exact isMe plus the case-insensitive 1-word author', () => {
    const exact = isMeFor(null, 'Hoa', null);
    expect(mentionsMe('@hoa see this', exact, 'Hoa')).toBe(true);
    expect(mentionsMe('@Hoang see this', exact, 'Hoa')).toBe(false);
  });
});

describe('W3-B3 rejectedCloseItem', () => {
  const now = new Date('2026-11-16T10:00:00Z');
  const rejected = (over = {}) => ({ status: 'Rejected', requestedByUid: 'u_me', decidedBy: 'Ha', decidedAt: '2026-11-15T10:00:00Z', reason: 'Missing file', ...over });
  const task = (over = {}) => ({ status: 'InProgress', pic: 'Me', closeRequestHistory: [rejected()], ...over });
  it('RJ-1 my rejected request -> item', () => {
    expect(rejectedCloseItem(task(), { uid: 'u_me', now })).toEqual({ reason: 'Missing file', decidedBy: 'Ha', decidedAt: '2026-11-15T10:00:00Z' });
  });
  it('RJ-2 resubmitted, later approved, too old, or someone else -> null', () => {
    expect(rejectedCloseItem(task({ status: 'Submitted' }), { uid: 'u_me', now })).toBeNull();
    expect(rejectedCloseItem(task({ closeRequestHistory: [{ status: 'Approved' }, rejected()] }), { uid: 'u_me', now })).toBeNull();
    expect(rejectedCloseItem(task({ closeRequestHistory: [rejected({ decidedAt: '2026-11-01T09:00:00Z' })] }), { uid: 'u_me', now })).toBeNull();
    expect(rejectedCloseItem(task(), { uid: 'u_other', now })).toBeNull();
  });
  it('RJ-3 View as (no uid): matched by the PIC name', () => {
    expect(rejectedCloseItem(task(), { uid: null, isMe: (n) => n === 'Me', now })).not.toBeNull();
    expect(rejectedCloseItem(task(), { uid: null, isMe: () => false, now })).toBeNull();
  });
});

describe('W3-B3 shouldReloadOnFocus', () => {
  const base = { visible: true, pendingCount: 0, saveState: {}, savePendingSize: 0, closeBusy: false, lastLoadAt: 0, now: 120_000 };
  it('FR-1 reloads when idle and the last load is a minute old', () => {
    expect(shouldReloadOnFocus(base)).toBe(true);
  });
  it('FR-2 never while hidden, unsaved, held, closing, or within a minute', () => {
    expect(shouldReloadOnFocus({ ...base, visible: false })).toBe(false);
    expect(shouldReloadOnFocus({ ...base, pendingCount: 1 })).toBe(false);
    expect(shouldReloadOnFocus({ ...base, saveState: { p1: { status: 'error' } } })).toBe(false);
    expect(shouldReloadOnFocus({ ...base, savePendingSize: 1 })).toBe(false);
    expect(shouldReloadOnFocus({ ...base, closeBusy: true })).toBe(false);
    expect(shouldReloadOnFocus({ ...base, lastLoadAt: 100_000 })).toBe(false);
  });
});

describe('W3-B3 role hints', () => {
  const roles = {
    programs: { p1: { pmUid: 'u_pm', deputyUid: null } },
    workstreams: { w1: { programId: 'p1', leadUid: 'u_sub' } },
    tasks: {},
    decisions: { dOwner: { programId: null }, dP1: { programId: 'p1' } },
  };
  it('UL-1 unlinked assignment / contribution', () => {
    expect(unlinkedAssignment({ isV2: true, uid: 'u_me', storedUid: null, isPic: true })).toBe(true);
    expect(unlinkedAssignment({ isV2: true, uid: 'u_me', storedUid: 'u_me', isPic: true })).toBe(false);
    expect(unlinkedAssignment({ isV2: true, uid: null, storedUid: null, isPic: true })).toBe(false);
    expect(unlinkedAssignment({ isV2: false, uid: 'u_me', storedUid: null, isPic: true })).toBe(false);
    expect(unlinkedContribution({ isV2: true, uid: 'u_me', storedUids: ['x'], isContributor: true })).toBe(true);
    expect(unlinkedContribution({ isV2: true, uid: 'u_me', storedUids: ['u_me'], isContributor: true })).toBe(false);
  });
  it('UL-2 RAID / decision updater notes', () => {
    const ctx = { isOwner: false, isV2: true, roles };
    expect(raidUpdaterNote({ ...ctx, uid: 'u_pm', programId: 'p1', programName: 'Finance' })).toBeNull();
    expect(raidUpdaterNote({ ...ctx, uid: 'u_me', programId: 'p1', programName: 'Finance' })).toBe('Only the PM / Sub-PM of Finance can update this. Tell them when it is done.');
    expect(raidUpdaterNote({ ...ctx, isOwner: true, uid: 'u_me', programId: 'p1' })).toBeNull();
    expect(decisionUpdaterNote({ ...ctx, uid: 'u_me', decision: { id: 'dOwner' } })).toBe('Only the Owner can update the follow-up.');
    expect(decisionUpdaterNote({ ...ctx, uid: 'u_me', decision: { id: 'dP1' } })).toBe('Only the PM / Sub-PM of its program can update the follow-up.');
    expect(decisionUpdaterNote({ ...ctx, uid: 'u_sub', decision: { id: 'dP1' } })).toBeNull();
  });
});
