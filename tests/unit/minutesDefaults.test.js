import { describe, it, expect } from 'vitest';
import { minutesDefaults } from '../../src/minutesDefaults.js';

const NOW = new Date(2026, 11, 10, 9, 0); // 10 Dec 2026
const names = { u_pm: 'Lan', u_dep: 'Minh', u_sub: 'Hoa', u_pm2: 'Tuan' };
const project = {
  id: 'p',
  programs: [
    { id: 'g1', workstreams: [
      { id: 'w1', tasks: [{ id: 't1', status: 'InProgress', pic: 'An' }, { id: 't2', status: 'Completed', pic: 'Old' }, { id: 't3', status: 'Planned', pic: 'lan' }] },
      { id: 'w2', tasks: [{ id: 't4', status: 'Submitted', pic: 'Binh' }] },
    ] },
    { id: 'g2', workstreams: [{ id: 'w3', tasks: [{ id: 't5', status: 'Planned', pic: 'Chi' }] }] },
  ],
  __v2: { roles: { programs: { g1: { pmUid: 'u_pm', deputyUid: 'u_dep' }, g2: { pmUid: 'u_pm2' } }, workstreams: { w1: { leadUid: 'u_sub' } } } },
};
const nameOf = (u) => names[u] || u;

describe('PM-15 minutes defaults', () => {
  it('MD-1 dates: last 7 days to today; current project only', () => {
    const d = minutesDefaults({ project, nameOf, now: NOW, allIds: ['p', 'q'] });
    expect([d.from, d.to, d.projectIds]).toEqual(['2026-12-03', '2026-12-10', ['p']]);
  });
  it('MD-2 whole project: PMs, deputies, Sub-PMs, then open task PICs, unique (case-insensitive)', () => {
    expect(minutesDefaults({ project, nameOf, now: NOW }).attendees).toEqual(['Lan', 'Minh', 'Hoa', 'Tuan', 'An', 'Binh', 'Chi']);
  });
  it('MD-3 program scope and work stream scope', () => {
    expect(minutesDefaults({ project, scope: 'g1', nameOf, now: NOW }).attendees).toEqual(['Lan', 'Minh', 'Hoa', 'An', 'Binh']);
    expect(minutesDefaults({ project, scope: 'ws:w1', nameOf, now: NOW }).attendees).toEqual(['Hoa', 'An', 'lan']);
  });
  it('MD-4 no project (All projects): every id, no attendees', () => {
    expect(minutesDefaults({ project: null, allIds: ['p', 'q'], now: NOW })).toEqual({ from: '2026-12-03', to: '2026-12-10', projectIds: ['p', 'q'], attendees: [] });
  });
});
