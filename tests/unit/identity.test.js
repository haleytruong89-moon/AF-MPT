import { describe, it, expect } from 'vitest';
import { collectPersonRefs, buildKnownPeople, proposeMapping, foldName } from '../../src/identity.js';

const proj = {
  id: 'p1', name: 'CRP',
  teamMembers: [{ name: 'Hà Trương Thị Thu', email: 'hattt4@smartosc.com' }, { name: 'Lan Nguyen', email: 'lannt@smartosc.com' }],
  contributorRegistry: ['Legal', 'AF'],
  projectLead: 'Hà Trương Thị Thu',
  programs: [{
    id: 'pg', raid: [{ owner: 'lannt@smartosc.com', mitigationActions: [{ pic: 'Minh' }] }],
    workstreams: [{ id: 'ws', tasks: [
      { id: 't1', pic: 'hattt4@smartosc.com', contributors: ['Lan Nguyen'], creditShares: { 'Ha Truong Thi Thu': 50, Legal: 50 },
        updates: [{ author: 'Hà Trương Thị Thu', resolvedBy: 'hattt4' }] },
      { id: 't2', pic: 'Legal' },
    ] }],
  }],
  actionItems: [{ pic: 'lan nguyen', author: 'Hà Trương Thị Thu', subtasks: [{ pic: 'Minh' }] }],
  decisions: [{ author: 'Lan Nguyen', decidedBy: ['HÀ TRƯƠNG THỊ THU'] }],
};
const activity = { p1: [{ author: 'minhlq@smartosc.com', authorName: 'Minh Le' }] };

describe('foldName', () => {
  it('lowercases, strips Vietnamese diacritics and extra spaces', () => {
    expect(foldName('  Hà  Trương Thị Thu ')).toBe('ha truong thi thu');
    expect(foldName('Đặng')).toBe('dang');
  });
});

describe('collectPersonRefs', () => {
  it('collects every person field incl. creditShares keys, case-insensitively grouped', () => {
    const refs = collectPersonRefs({ p1: proj });
    const thu = refs.get('hà trương thị thu');
    expect(thu.count).toBe(4); // projectLead, update.author, action.author, decision.decidedBy (upper-case)
    expect(thu.sources).toEqual(expect.arrayContaining(['project.projectLead', 'task.updates.author', 'action.author', 'decision.decidedBy']));
    expect(refs.get('ha truong thi thu').sources).toEqual(['task.creditShares']);
    expect(refs.get('hattt4').sources).toEqual(['task.updates.resolvedBy']);
    expect(refs.get('minh').count).toBe(2);
    expect(refs.get('hattt4@smartosc.com').projects).toEqual(['CRP']);
  });
});

describe('buildKnownPeople', () => {
  it('pairs emails with names from teamMembers and activity authors', () => {
    const known = buildKnownPeople({ p1: proj }, activity);
    expect(known.get('hattt4@smartosc.com').names).toEqual(['Hà Trương Thị Thu']);
    expect(known.get('minhlq@smartosc.com').names).toEqual(['Minh Le']);
  });
});

describe('proposeMapping', () => {
  const rows = proposeMapping({ p1: proj }, activity);
  const row = (raw) => rows.find((r) => r.raw.toLowerCase() === raw.toLowerCase());

  it('maps a known email with high confidence', () => {
    expect(row('hattt4@smartosc.com')).toMatchObject({ type: 'person', email: 'hattt4@smartosc.com', name: 'Hà Trương Thị Thu', confidence: 'high' });
  });
  it('maps an exact known name, a diacritics-free variant and an email local-part', () => {
    expect(row('Lan Nguyen')).toMatchObject({ email: 'lannt@smartosc.com', confidence: 'high' });
    expect(row('Ha Truong Thi Thu')).toMatchObject({ email: 'hattt4@smartosc.com', confidence: 'medium' });
    expect(row('hattt4')).toMatchObject({ email: 'hattt4@smartosc.com', confidence: 'high' });
  });
  it('marks registry entries as groups, not people', () => {
    expect(row('Legal')).toMatchObject({ type: 'group', email: '', confidence: '' });
  });
  it('suggests a unique first-token match with low confidence, leaves the rest unmapped', () => {
    expect(row('Minh')).toMatchObject({ email: 'minhlq@smartosc.com', confidence: 'low' });
  });
  it('flags unknown emails and sorts unmapped/low first for review', () => {
    const r = proposeMapping({ p1: { ...proj, actionItems: [{ pic: 'ghost@smartosc.com' }, { pic: 'Nobody Here' }] } }, {});
    expect(r.find((x) => x.raw === 'ghost@smartosc.com')).toMatchObject({ email: 'ghost@smartosc.com', confidence: 'medium', note: 'email not seen in team lists or activity' });
    expect(r.find((x) => x.raw === 'Nobody Here')).toMatchObject({ email: '', confidence: 'none' });
    expect(r[0].confidence).toBe('none');
  });
});
