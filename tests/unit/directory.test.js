import { describe, it, expect } from 'vitest';
import { buildDirectoryIndex, canonicalPerson, pickerPeople, groupByPerson, personKey, findMember, canonicalName, meKey } from '../../src/directory.js';

describe('directory index', () => {
  const idx = buildDirectoryIndex([
    { email: 'HATTT4@smartosc.com', displayName: 'Hà Trương Thị Thu', aliases: ['Thu HOD'] },
    { email: 'lannt@smartosc.com', displayName: 'Lan Nguyen', status: 'deactivated' },
  ]);

  it('resolves email, local-part, display name, folded name and alias to one id', () => {
    for (const raw of ['hattt4@smartosc.com', 'hattt4', 'Hà Trương Thị Thu', 'HA TRUONG THI THU', 'thu hod'])
      expect(canonicalPerson(idx, raw)).toEqual({ id: 'hattt4@smartosc.com', name: 'Hà Trương Thị Thu', known: true });
  });
  it('passes unknown strings and groups through with a stable name key', () => {
    expect(canonicalPerson(idx, ' Legal ')).toEqual({ id: 'n:legal', name: 'Legal', known: false });
    expect(canonicalPerson(null, 'Lan')).toEqual({ id: 'n:lan', name: 'Lan', known: false });
  });
  it('keeps deactivated people resolvable but out of pickers', () => {
    expect(canonicalPerson(idx, 'lannt@smartosc.com').known).toBe(true);
    expect(pickerPeople(idx).map((p) => p.email)).toEqual(['hattt4@smartosc.com']);
  });
  it('reports an alias that points to two emails and resolves neither', () => {
    const bad = buildDirectoryIndex([
      { email: 'a@smartosc.com', displayName: 'Minh Le' }, { email: 'b@smartosc.com', displayName: 'Minh Lê' },
    ]);
    expect(bad.conflicts).toEqual([{ alias: 'minh le', emails: ['a@smartosc.com', 'b@smartosc.com'] }]);
    expect(canonicalPerson(bad, 'Minh Le').known).toBe(false);
  });
  it('does not treat a key repeated by the same email as a conflict', () => {
    const ok = buildDirectoryIndex([{ email: 'a@smartosc.com', displayName: 'An', aliases: ['An', 'AN'] }]);
    expect(ok.conflicts).toEqual([]);
    expect(canonicalPerson(ok, 'an').id).toBe('a@smartosc.com');
  });
  it('sorts picker people by Vietnamese name order', () => {
    const i = buildDirectoryIndex([
      { email: 'z@smartosc.com', displayName: 'Zung' }, { email: 'a@smartosc.com', displayName: 'An' },
    ]);
    expect(pickerPeople(i).map((p) => p.name)).toEqual(['An', 'Zung']);
  });
});

describe('groupByPerson', () => {
  const idx = buildDirectoryIndex([{ email: 'hattt4@smartosc.com', displayName: 'Hà Trương Thị Thu' }]);
  it('merges an email and an unaccented name of the same person into one group', () => {
    expect(groupByPerson(['hattt4@smartosc.com', 'Ha Truong Thi Thu'], idx)).toEqual([
      { id: 'hattt4@smartosc.com', name: 'Hà Trương Thị Thu', count: 2, values: ['hattt4@smartosc.com', 'Ha Truong Thi Thu'] },
    ]);
  });
  it('keeps first-seen order and passes groups through as unknown', () => {
    expect(groupByPerson(['Legal', 'hattt4', 'legal'], idx).map((g) => [g.id, g.count])).toEqual([
      ['n:legal', 2], ['hattt4@smartosc.com', 1],
    ]);
  });
  it('groups by the exact raw string when there is no index (legacy behaviour)', () => {
    expect(groupByPerson(['Lan', 'lan', 'Lan'], null)).toEqual([
      { id: 'Lan', name: 'Lan', count: 2, values: ['Lan', 'Lan'] },
      { id: 'lan', name: 'lan', count: 1, values: ['lan'] },
    ]);
    expect(personKey(null, 'Lan ')).toBe('Lan ');
  });
});

describe('findMember and empty display names', () => {
  const idx = buildDirectoryIndex([
    { email: 'hattt4@smartosc.com', displayName: 'Hà Trương Thị Thu' },
    { email: 'noname@smartosc.com', displayName: '' },
  ]);
  const members = [
    { name: 'Hà Trương Thị Thu', email: 'hattt4@smartosc.com' },
    { name: 'Legal', email: null },
  ];
  it('shows the email for a known person with an empty display name', () => {
    expect(canonicalPerson(idx, 'noname@smartosc.com')).toEqual({ id: 'noname@smartosc.com', name: 'noname@smartosc.com', known: true });
  });
  it('finds a member by any alias of the same person when an index is given', () => {
    expect(findMember(members, 'Ha Truong Thi Thu', idx)?.email).toBe('hattt4@smartosc.com');
    expect(findMember(members, 'hattt4', idx)?.email).toBe('hattt4@smartosc.com');
    expect(findMember(members, 'legal', idx)?.name).toBe('Legal');
    expect(findMember(members, 'Someone Else', idx)).toBeUndefined();
  });
  it('keeps exact-name matching with no index', () => {
    expect(findMember(members, 'Hà Trương Thị Thu', null)?.email).toBe('hattt4@smartosc.com');
    expect(findMember(members, 'hattt4@smartosc.com', null)).toBeUndefined();
    expect(findMember(members, 'legal', null)).toBeUndefined();
  });
});

describe('canonicalName', () => {
  const idx = buildDirectoryIndex([{ email: 'hattt4@smartosc.com', displayName: 'Hà Trương Thị Thu' }]);
  it('returns the directory display name for any alias of a known person', () => {
    expect(canonicalName(idx, 'hattt4')).toBe('Hà Trương Thị Thu');
    expect(canonicalName(idx, 'HATTT4@smartosc.com')).toBe('Hà Trương Thị Thu');
  });
  it('returns the trimmed input for unknown values and with no index', () => {
    expect(canonicalName(idx, ' Legal ')).toBe('Legal');
    expect(canonicalName(null, ' hattt4 ')).toBe('hattt4');
  });
});

import { parseAliases, validateNewPerson, aliasConflictFor, filterDirectory } from '../../src/directory.js';

describe('directory admin helpers', () => {
  const entries = [
    { path: 'workspaces/main/members/u1', uid: 'u1', email: 'a@smartosc.com', displayName: 'Anh Nguyễn', aliases: ['Anh N'], department: 'AF', status: 'active' },
    { path: 'workspaces/main/invites/b@smartosc.com', uid: null, email: 'b@smartosc.com', displayName: 'Bình Lê', aliases: [], department: 'Tax', status: 'active' },
  ];
  it('parseAliases trims, drops empties, dedupes case-insensitively', () => {
    expect(parseAliases(' Foo, bar ,, FOO ,Bar,baz ')).toEqual(['Foo', 'bar', 'baz']);
    expect(parseAliases('')).toEqual([]);
  });
  it('validateNewPerson checks domain and duplicates', () => {
    expect(validateNewPerson('x@gmail.com', entries)).toMatch(/@smartosc\.com/);
    expect(validateNewPerson('A@SmartOSC.com', entries)).toMatch(/already/);
    expect(validateNewPerson('b@smartosc.com', entries)).toMatch(/already/);
    expect(validateNewPerson(' New@SmartOSC.com ', entries)).toBeNull();
    expect(validateNewPerson('@smartosc.com', entries)).not.toBeNull();
  });
  it('aliasConflictFor reports a clash with another person', () => {
    const edited = { ...entries[0], aliases: ['Bình Lê'] };
    const c = aliasConflictFor(entries, edited);
    expect(c).toEqual({ alias: 'binh le', other: 'b@smartosc.com' });
    expect(aliasConflictFor(entries, { ...entries[0], aliases: ['Fresh'] })).toBeNull();
  });
  it('filterDirectory matches name/email/department/alias ignoring diacritics', () => {
    expect(filterDirectory(entries, 'nguyen').map((e) => e.email)).toEqual(['a@smartosc.com']);
    expect(filterDirectory(entries, 'tax').map((e) => e.email)).toEqual(['b@smartosc.com']);
    expect(filterDirectory(entries, 'anh n').length).toBe(1);
    expect(filterDirectory(entries, '').length).toBe(2);
  });
});

describe('final-review fixes', () => {
  const entries = [{ email: 'a@smartosc.com', displayName: 'Minh Lê', aliases: [] }];
  it('aliasConflictFor checks a NEW person (Add person) against existing entries', () => {
    expect(aliasConflictFor(entries, { email: 'b@smartosc.com', displayName: 'Minh Le', aliases: [] }))
      .toEqual({ alias: 'minh le', other: 'a@smartosc.com' });
    expect(aliasConflictFor(entries, { email: 'b@smartosc.com', displayName: 'Other', aliases: [] })).toBeNull();
  });
  it('meKey prefers the signed-in email when it resolves to a known person', () => {
    const idx = buildDirectoryIndex([{ email: 'thu@smartosc.com', displayName: 'Hà Trương Thị Thu' }]);
    // Google display name differs from the roster name.
    expect(meKey(idx, 'Thu HT (AF)', 'Thu@SmartOSC.com')).toBe('thu@smartosc.com');
    // No email (e.g. View as): falls back to the name.
    expect(meKey(idx, 'Ha Truong Thi Thu', null)).toBe('thu@smartosc.com');
    expect(meKey(idx, 'Someone', null)).toBe('n:someone');
    // Email unknown to the directory: falls back to the name.
    expect(meKey(idx, 'Someone', 'x@smartosc.com')).toBe('n:someone');
    // No index: legacy raw author.
    expect(meKey(null, 'Lan', 'lan@smartosc.com')).toBe('Lan');
  });
});
