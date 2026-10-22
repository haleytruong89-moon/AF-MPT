import { describe, it, expect } from 'vitest';
import { buildDirectoryIndex, canonicalPerson, pickerPeople, groupByPerson, personKey } from '../../src/directory.js';

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
