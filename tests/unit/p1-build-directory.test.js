import { describe, it, expect } from 'vitest';
import { planDirectory, applyPlan, rollbackManifest, toJsonable } from '../../scripts/p1-build-directory.mjs';

const roster = [
  { Email: 'Thu.HT@smartosc.com', 'Display name': 'Hà Trương Thị Thu', Department: 'AF' },
  { Email: 'an@smartosc.com', 'Display name': 'Nguyen An', Department: '' },
];
const uids = new Map([['thu.ht@smartosc.com', 'uid-thu']]);
const M = (v, e, g = '') => ({ 'Value in data': v, 'HOD: final email': e, 'HOD: is group (Y)': g });

describe('planDirectory', () => {
  it('puts people with a uid in members and others in invites', () => {
    const p = planDirectory(roster, [], uids);
    expect(p.errors).toEqual([]);
    expect(p.members.map((m) => m.uid)).toEqual(['uid-thu']);
    expect(p.members[0].data).toMatchObject({
      email: 'thu.ht@smartosc.com', displayName: 'Hà Trương Thị Thu', department: 'AF',
      status: 'active', updatedBy: 'p1-script', aliases: [],
    });
    expect('updatedAt' in p.members[0].data).toBe(false);
    expect(p.invites.map((i) => i.email)).toEqual(['an@smartosc.com']);
    expect(p.invites[0].data.department).toBe('');
  });
  it('collects aliases and excludes the display name', () => {
    const p = planDirectory(roster, [
      M('Thu HT', 'thu.ht@smartosc.com'), M('thu ht', 'THU.ht@smartosc.com'),
      M('Hà Trương Thị Thu', 'thu.ht@smartosc.com'), M('Ha Truong Thi Thu', 'thu.ht@smartosc.com'),
    ], uids);
    expect(p.members[0].data.aliases).toEqual(['Thu HT']);
  });
  it('skips group rows', () => {
    const p = planDirectory(roster, [M('Finance', 'an@smartosc.com', 'Y')], uids);
    expect(p.invites[0].data.aliases).toEqual([]);
    expect(p.unmapped).toEqual([]);
  });
  it('errors when the mapped email is not in the roster', () => {
    const p = planDirectory(roster, [M('Bob', 'bob@smartosc.com')], uids);
    expect(p.errors).toContain('Bob → bob@smartosc.com: email not in roster');
  });
  it('reports alias conflicts between roster rows', () => {
    const p = planDirectory([
      { Email: 'a1@smartosc.com', 'Display name': 'Nguyen An' },
      { Email: 'a2@smartosc.com', 'Display name': 'Nguyễn An' },
    ], [], new Map());
    expect(p.errors.some((e) => e.includes('nguyen an') && e.includes('a1@smartosc.com') && e.includes('a2@smartosc.com'))).toBe(true);
  });
  it('puts empty final emails in unmapped', () => {
    const p = planDirectory(roster, [M('Mystery', '')], uids);
    expect(p.unmapped).toEqual(['Mystery']);
  });
  it('rejects non-smartosc emails', () => {
    const p = planDirectory([{ Email: 'x@gmail.com', 'Display name': 'X' }], [], new Map());
    expect(p.errors).toContain('x@gmail.com: not an @smartosc.com address');
  });
  it('rejects duplicate roster rows', () => {
    const p = planDirectory([...roster, { Email: 'AN@smartosc.com', 'Display name': 'An 2' }], [], uids);
    expect(p.errors).toContain('an@smartosc.com: duplicate roster row');
  });
});

class FakeTs { constructor(s, n) { this.seconds = s; this.nanoseconds = n; } }
function fakeDb(initial = {}, log = []) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    doc: (path) => ({
      get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
      set: async (d) => { log.push('set ' + path); store.set(path, d); },
      delete: async () => { log.push('delete ' + path); store.delete(path); },
    }),
  };
}
const FV = { serverTimestamp: () => 'SERVER_TS' };

describe('applyPlan / rollbackManifest', () => {
  const plan = planDirectory(roster, [], uids);
  it('writes the manifest before the first set', async () => {
    const log = [];
    const db = fakeDb({}, log);
    await applyPlan(db, plan, { FieldValue: FV, Timestamp: FakeTs, writeManifest: () => log.push('manifest') });
    expect(log[0]).toBe('manifest');
    expect(log.slice(1).every((l) => l.startsWith('set '))).toBe(true);
    expect(db.store.get('workspaces/main/members/uid-thu').updatedAt).toBe('SERVER_TS');
  });
  it('writes nothing when the plan has errors', async () => {
    const log = [];
    const bad = { ...plan, errors: ['x'] };
    await expect(applyPlan(fakeDb({}, log), bad, { FieldValue: FV, Timestamp: FakeTs, writeManifest: () => log.push('manifest') })).rejects.toThrow();
    expect(log).toEqual([]);
  });
  it('rollback restores previous data, deletes new docs, keeps Timestamps, and is idempotent', async () => {
    const memberPath = 'workspaces/main/members/uid-thu';
    const invitePath = 'workspaces/main/invites/an@smartosc.com';
    const db = fakeDb({ [memberPath]: { displayName: 'Old', updatedAt: new FakeTs(5, 7) } });
    let saved;
    await applyPlan(db, plan, { FieldValue: FV, Timestamp: FakeTs, writeManifest: (m) => { saved = JSON.stringify(m); } });
    expect(db.store.has(invitePath)).toBe(true);
    const manifest = JSON.parse(saved);
    for (let i = 0; i < 2; i++) {
      await rollbackManifest(db, manifest, { Timestamp: FakeTs });
      const back = db.store.get(memberPath);
      expect(back.displayName).toBe('Old');
      expect(back.updatedAt).toBeInstanceOf(FakeTs);
      expect([back.updatedAt.seconds, back.updatedAt.nanoseconds]).toEqual([5, 7]);
      expect(db.store.has(invitePath)).toBe(false);
    }
  });
  it('toJsonable tags nested Timestamps', () => {
    expect(toJsonable({ a: [{ t: new FakeTs(1, 2) }] }, FakeTs)).toEqual({ a: [{ t: { __ts: [1, 2] } }] });
  });
});

describe('roster validation', () => {
  it('flags a row with a name but no email', () => {
    const p = planDirectory([{ Email: '', 'Display name': 'Ghost' }], [], new Map());
    expect(p.errors).toContain('Ghost: missing email');
  });
});

describe('planDirectory final-review fixes', () => {
  it('adds users-doc names as aliases of that email (deduped, display name excluded)', () => {
    const names = new Map([
      ['thu.ht@smartosc.com', 'Thu Ha Truong'],
      ['an@smartosc.com', 'Nguyễn An'],
      ['ghost@smartosc.com', 'Ghost'],
    ]);
    const p = planDirectory(roster, [M('thu ha truong', 'thu.ht@smartosc.com')], uids, names);
    expect(p.errors).toEqual([]);
    expect(p.members[0].data.aliases).toEqual(['thu ha truong']);
    expect(p.invites[0].data.aliases).toEqual([]);
    const q = planDirectory(roster, [], uids, names);
    expect(q.members[0].data.aliases).toEqual(['Thu Ha Truong']);
  });
  it('errors when a group row resolves to a person', () => {
    const p = planDirectory([{ Email: 'tax@smartosc.com', 'Display name': 'Tax Team' }], [M('Tax', '', 'Y')], new Map());
    expect(p.errors).toContain('Tax: group name matches person tax@smartosc.com');
    const ok = planDirectory(roster, [M('Legal', '', 'Y')], uids);
    expect(ok.errors).toEqual([]);
  });
});
