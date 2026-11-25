import { describe, it, expect } from 'vitest';
import { planReplace, applyReplace, planIsEmpty } from '../../src/replacePerson.js';

// Replace person (spec §8).
const X = 'u_x';
const Y = 'u_y';
const isFrom = (raw) => raw === 'Van' || raw === 'van@smartosc.com';
const t = (id, status, over = {}) => ({ id, name: id, status, pic: 'Lan', contributors: [], ...over });
const project = {
  programs: [
    { id: 'g1', name: 'Finance', workstreams: [{ id: 'w1', name: 'Close', tasks: [
      t('open_pic', 'InProgress', { pic: 'Van', contributors: ['Minh'], creditShares: { Van: 70, Minh: 30 } }),
      t('open_contrib', 'Planned', { contributors: ['Van', 'Minh'] }),
      t('contrib_to_pic', 'Planned', { pic: 'Van', contributors: ['Thu'], creditShares: { Van: 70, Thu: 30 } }),
      t('uid_only', 'Planned', { pic: 'Somebody' }),
      t('done', 'Completed', { pic: 'Van' }),
      t('sub_own', 'Submitted', { pic: 'Van', closeRequest: { approverUid: 'u_pm' } }),
      t('sub_appr', 'Submitted', { closeRequest: { approverUid: X } }),
    ] }] },
    { id: 'g2', name: 'Tax', workstreams: [{ id: 'w2', name: 'VAT', tasks: [] }] },
  ],
  actionItems: [{ id: 'a1', title: 'Open', status: 'Pending', pic: 'Van' }, { id: 'a2', title: 'Done', status: 'Done', pic: 'Van' }, { id: 'a3', title: 'Uid', status: 'InProgress', pic: '?' }],
};
const roles = {
  programs: { g1: { pmUid: X, deputyUid: null }, g2: { pmUid: Y, deputyUid: X } },
  workstreams: { w1: { programId: 'g1', leadUid: X }, w2: { programId: 'g2', leadUid: null } },
  tasks: { uid_only: { picUid: X, contributorUids: [] } },
  actions: { a3: { picUid: X } },
};

describe('planReplace', () => {
  const p = planReplace({ project, roles, fromUid: X, isFrom, toUid: Y });
  it('RP-1 roles: PM and Sub-PM move; Deputy where the new person is PM is blocked', () => {
    expect(p.roles.map((r) => [r.kind, r.programId, r.wsId ?? null])).toEqual([['pm', 'g1', null], ['lead', 'g1', 'w1']]);
    expect(p.blocked).toEqual([{ kind: 'deputy', scopeName: 'Tax', reason: 'PM and Deputy must be different people.' }]);
  });
  it('RP-2 open tasks by name or uid; closed and Submitted kept; approvals listed', () => {
    expect(p.tasks).toEqual([
      { id: 'open_pic', name: 'open_pic', pic: true, contributor: false },
      { id: 'open_contrib', name: 'open_contrib', pic: false, contributor: true },
      { id: 'contrib_to_pic', name: 'contrib_to_pic', pic: true, contributor: false },
      { id: 'uid_only', name: 'uid_only', pic: true, contributor: false },
    ]);
    expect(p.kept).toEqual({ closed: 1, submitted: [{ id: 'sub_own', name: 'sub_own' }] });
    expect(p.approvals).toEqual([{ id: 'sub_appr', name: 'sub_appr' }]);
  });
  it('RP-3 open actions by name or uid', () => {
    expect(p.actions.map((a) => a.id)).toEqual(['a1', 'a3']);
  });
  it('RP-4 nothing for the same person or no target', () => {
    expect(planIsEmpty(planReplace({ project, roles, fromUid: X, isFrom, toUid: X }))).toBe(true);
  });
});

describe('applyReplace', () => {
  const plan = planReplace({ project, roles, fromUid: X, isFrom, toUid: Y });
  const next = applyReplace(project, plan, { isFrom, toName: 'Yen' });
  const task = (id) => next.programs[0].workstreams[0].tasks.find((x) => x.id === id);
  it('AR-1 PIC, contributors and credit share keys move', () => {
    expect(task('open_pic')).toMatchObject({ pic: 'Yen', contributors: ['Minh'], creditShares: { Yen: 70, Minh: 30 } });
    expect(task('open_contrib')).toMatchObject({ pic: 'Lan', contributors: ['Yen', 'Minh'] });
    expect(task('uid_only').pic).toBe('Yen');
    expect(next.actionItems.map((a) => a.pic)).toEqual(['Yen', 'Van', 'Yen']);
  });
  it('AR-2 closed and Submitted tasks untouched; input not mutated', () => {
    expect(task('done').pic).toBe('Van');
    expect(task('sub_own').pic).toBe('Van');
    expect(project.programs[0].workstreams[0].tasks[0].pic).toBe('Van');
  });
  it('AR-3 the new PIC is never also a contributor; shares merge', () => {
    const p2 = { programs: [{ id: 'g', workstreams: [{ id: 'w', tasks: [t('m', 'Planned', { pic: 'Van', contributors: ['Yen'], creditShares: { Van: 70, Yen: 30 } })] }] }], actionItems: [] };
    const out = applyReplace(p2, planReplace({ project: p2, roles: {}, fromUid: X, isFrom, toUid: Y }), { isFrom, toName: 'Yen' });
    expect(out.programs[0].workstreams[0].tasks[0]).toMatchObject({ pic: 'Yen', contributors: [], creditShares: { Yen: 100 } });
  });
  it('AR-4 a second plan on the result (roles moved) is empty for tasks and actions', () => {
    const roles2 = { ...roles, tasks: { uid_only: { picUid: Y, contributorUids: [] } }, actions: { a3: { picUid: Y } } };
    const again = planReplace({ project: next, roles: roles2, fromUid: X, isFrom, toUid: Y });
    expect(again.tasks).toEqual([]);
    expect(again.actions).toEqual([]);
  });
});
