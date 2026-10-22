import { describe, it, expect } from 'vitest';
import { planDirectory } from '../../scripts/p1-build-directory.mjs';

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
