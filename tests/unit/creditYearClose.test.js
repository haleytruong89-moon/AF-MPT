import { describe, it, expect } from 'vitest';
import { yearPrecheck, personDocId, buildYearSnapshot, reopenYearDoc, reportFromSnapshot, mergeReports, myCreditFromSnapshot, CREDIT_TZ } from '../../src/creditYearClose.js';
import { effortMatrix } from '../../src/effortReport.js';

// G3, hand-computed. CRP 2026: Lan 10 cp t1 (closed 30/03, on time), t2 shared (Lan 4 + Minh 4,
// late), Minh open t3 6 cp (not frozen). AF Op: Lan 5 cp t4 (no close date, creditYear 2026,
// weights unlocked); lead Minh 2 earned.
const CRP = { id: 'A', name: 'CRP', weightsLocked: true, creditPoints: 100, creditYear: 2026, programs: [{ id: 'g', name: 'G', workstreams: [{ id: 'w', name: 'W', tasks: [
  { id: 't1', name: 'T1', status: 'Completed', end: '2026-03-31', approvedAt: '2026-03-30T03:00:00.000Z' },
  { id: 't2', name: 'T2', status: 'Completed', end: '2026-03-31', approvedAt: '2026-04-05T03:00:00.000Z' },
  { id: 't3', name: 'T3', status: 'InProgress' },
  { id: 't5', name: 'T5', status: 'Submitted' },
] }] }] };
const OP = { id: 'B', name: 'AF 2026 Operation', creditYear: 2026, programs: [{ id: 'g', name: 'G', workstreams: [{ id: 'w', name: 'W', tasks: [{ id: 't4', name: 'T4', status: 'Completed' }] }] }] };
const row = (o) => ({ programName: 'G', workstreamName: 'W', isProjectLead: false, ...o });
const perProject = new Map([
  ['A', { project: CRP, breakdown: [
    row({ picId: 'lan@x', picName: 'Lan', taskId: 't1', taskName: 'T1', sharePct: 100, taskCp: 10, actual: 10, projected: 10, credited: true }),
    row({ picId: 'lan@x', picName: 'Lan', taskId: 't2', taskName: 'T2', sharePct: 50, taskCp: 8, actual: 4, projected: 4, credited: true }),
    row({ picId: 'minh@x', picName: 'Minh', taskId: 't2', taskName: 'T2', sharePct: 50, taskCp: 8, actual: 4, projected: 4, credited: true }),
    row({ picId: 'minh@x', picName: 'Minh', taskId: 't3', taskName: 'T3', sharePct: 100, taskCp: 6, actual: 0, projected: 6, credited: false }),
  ] }],
  ['B', { project: OP, breakdown: [
    row({ picId: 'lan@x', picName: 'Lan', taskId: 't4', taskName: 'T4', sharePct: 100, taskCp: 5, actual: 5, projected: 5, credited: true }),
    { picId: 'minh@x', picName: 'Minh', taskId: null, taskName: 'Minh (project lead, 10%)', programName: '— Project Lead —', workstreamName: '', isProjectLead: true, sharePct: 100, taskCp: 3, actual: 2, projected: 3, credited: false },
  ] }],
]);
const NOW = '2026-12-31T10:00:00.000Z';

describe('G3 credit year close', () => {
  it('CY-1 pre-check lists submitted, no-date and unlocked', () => {
    const pc = yearPrecheck({ A: CRP, B: OP }, 2026, perProject);
    expect(pc.submitted.map((x) => x.taskId)).toEqual(['t5']);
    expect(pc.noDate.map((x) => x.taskId)).toEqual(['t4']);
    expect(pc.unlocked).toEqual([{ pid: 'B', name: 'AF 2026 Operation' }]);
    expect(yearPrecheck({ B: OP }, 2025, new Map()).noDate).toEqual([]);
  });

  it('CY-2 person doc id: uid when known, else a safe id', () => {
    expect(personDocId('lan@x', 'u_lan')).toBe('u_lan');
    expect(personDocId('n:nguyen van a/b', null)).toBe('n_n_nguyen_van_a_b');
  });

  it('CY-3 snapshot freezes earned credit only, per person and per project', () => {
    const s = buildYearSnapshot({ perProject, year: 2026, uidOf: (k) => (k === 'lan@x' ? 'u_lan' : null), by: 'Ha', byUid: 'u_owner', now: NOW, precheck: yearPrecheck({ A: CRP, B: OP }, 2026, perProject), prevLog: [{ action: 'reopened' }] });
    expect(s.yearDoc).toMatchObject({ year: 2026, status: 'closed', closedAt: NOW, closedBy: 'Ha', closedByUid: 'u_owner', timezone: CREDIT_TZ, precheck: { submitted: 1, noDate: 1, unlocked: 1 } });
    expect(s.yearDoc.log).toEqual([{ action: 'reopened' }, { at: NOW, by: 'Ha', action: 'closed', people: 2, projects: 2 }]);
    expect(s.people.map((p) => [p.id, p.data.cp, p.data.tasks])).toEqual([['u_lan', 19, 3], ['n_minh@x', 6, 1]]);
    const minh = s.people[1].data;
    expect(minh.rows.map((r) => [r.taskId, r.cp, r.lead, r.timing])).toEqual([['t2', 4, false, 'late'], [null, 2, true, null]]);
    expect(minh.rows.some((r) => r.taskId === 't3')).toBe(false);
    expect(s.people[0].data.rows.find((r) => r.taskId === 't1')).toMatchObject({ closedOn: '2026-03-30T03:00:00.000Z', timing: 'on-time' });
    expect(s.projects.map((p) => [p.id, p.data.cp, p.data.tasks, p.data.weightsLocked])).toEqual([['A', 18, 3, true], ['B', 7, 1, false]]);
  });

  it('CY-4 snapshot reads back as the same report and effort matrix (no remaining)', () => {
    const s = buildYearSnapshot({ perProject, year: 2026, by: 'Ha', now: NOW });
    const rep = reportFromSnapshot({ year: 2026, people: s.people.map((p) => p.data), projects: s.projects.map((p) => p.data) });
    expect(rep.totalCp).toBe(25);
    expect([...rep.perPic].map(([k, v]) => [k, v.earned])).toEqual([['lan@x', 19], ['minh@x', 6]]);
    const m = effortMatrix(rep.perProject);
    expect(m.total).toMatchObject({ cp: 25, tasks: 4, remaining: 0 });
    expect(m.cell('lan@x', 'A').rows.map((r) => [r.taskId, r.timing])).toEqual([['t2', 'late'], ['t1', 'on-time']]);
    expect(m.projects.find((p) => p.id === 'A').name).toBe('CRP');
  });

  it('CY-5 reopen keeps the log and adds the reason', () => {
    const y = reopenYearDoc({ year: 2026, status: 'closed', log: [{ action: 'closed' }] }, { by: 'Ha', reason: 'weights fixed', now: NOW });
    expect(y.status).toBe('open');
    expect(y.log).toEqual([{ action: 'closed' }, { at: NOW, by: 'Ha', action: 'reopened', reason: 'weights fixed' }]);
  });

  it('CY-6 merge: Lifetime = frozen 2026 + live 2027, per person and project', () => {
    const s = buildYearSnapshot({ perProject, year: 2026, by: 'Ha', now: NOW });
    const frozen = reportFromSnapshot({ year: 2026, people: s.people.map((p) => p.data), projects: s.projects.map((p) => p.data) });
    const live2027 = {
      totalCp: 7,
      perPic: new Map([['minh@x', { earned: 1, projected: 7, name: 'Minh' }]]),
      perProject: new Map([['A', { project: { ...CRP, name: 'CRP (renamed)' }, periodCp: 7, breakdown: [
        row({ picId: 'minh@x', picName: 'Minh', taskId: 't3', taskName: 'T3', sharePct: 100, taskCp: 6, actual: 0, projected: 6, credited: false }),
        { picId: 'minh@x', picName: 'Minh', taskId: null, taskName: 'lead', isProjectLead: true, actual: 1, projected: 1, credited: false },
      ] }]]),
    };
    const all = mergeReports([frozen, live2027]);
    expect(all.totalCp).toBe(32);
    expect(all.perPic.get('minh@x')).toMatchObject({ earned: 7, projected: 13 });
    expect(all.perProject.get('A').project.name).toBe('CRP (renamed)');
    const m = effortMatrix(all.perProject);
    expect(m.cell('minh@x', 'A')).toMatchObject({ cp: 5, tasks: 1, remaining: 6 });
  });
});

describe('G3b my record from the snapshot', () => {
  it('CY-7 person doc -> My record rows by project, all earned', () => {
    const s = buildYearSnapshot({ perProject, year: 2026, uidOf: (k) => (k === 'minh@x' ? 'u_minh' : null), by: 'Ha', now: NOW });
    const minh = s.people.find((p) => p.id === 'u_minh').data;
    const rec = myCreditFromSnapshot(minh);
    expect(rec.map((c) => [c.project.id, c.project.name, c.earned, c.projected, c.locked])).toEqual([['A', 'CRP', 4, 4, true], ['B', 'AF 2026 Operation', 2, 2, true]]);
    expect(rec[0].rows).toEqual([{ taskId: 't2', taskName: 'T2', sharePct: 50, projected: 4, earned: 4, credited: true }]);
    expect(myCreditFromSnapshot(null)).toEqual([]);
  });
});
