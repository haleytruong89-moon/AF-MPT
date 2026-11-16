import { describe, it, expect } from 'vitest';
import { personWorkload } from '../../src/workload.js';
import { filterActivity, activityTypes } from '../../src/activityFilter.js';
import { buildDirectoryIndex, personKey } from '../../src/directory.js';

// W3-D2: workload definition + activity filter.
const now = new Date('2026-11-16T10:00:00');
const dir = buildDirectoryIndex([{ email: 'lan@smartosc.com', displayName: 'Lan Pham', aliases: ['Lan P'], status: 'active' }]);
const keyOf = (raw) => personKey(dir, raw);
const t = (id, pic, status, end = '2026-12-31') => ({ id, pic, status, end });
const projects = {
  p1: { id: 'p1', name: 'P1', programs: [{ id: 'g', workstreams: [{ id: 'w', tasks: [
    t('1', 'Lan Pham', 'InProgress', '2026-11-01'), t('2', 'Lan P', 'Planned'), t('3', 'lan@smartosc.com', 'Submitted', '2026-11-01'),
    t('4', 'Lan Pham', 'Completed'), t('5', 'Lan Pham', 'Dropped'), t('6', 'Minh', 'Planned'),
  ] }] }],
  actionItems: [] },
  p2: { id: 'p2', name: 'P2', programs: [], actionItems: [
    { id: 'a1', pic: 'Lan P', status: 'Pending', dueDate: '2026-11-10' }, { id: 'a2', pic: 'Lan Pham', status: 'InProgress' }, { id: 'a3', pic: 'Lan Pham', status: 'Done', dueDate: '2026-01-01' },
  ] },
};

describe('W3-D2 personWorkload', () => {
  it('WL-1 aliases merge; Submitted only awaiting approval; closed ignored; overdue split', () => {
    const w = personWorkload(projects, { keyOf, now });
    const lan = w.get('lan@smartosc.com');
    expect(lan).toMatchObject({ openTasks: 2, awaitingApproval: 1, overdueTasks: 1, openActions: 2, overdueActions: 1 });
    expect(lan.perProject.get('p1').openTasks).toBe(2);
    expect(w.get(keyOf('Minh'))).toMatchObject({ openTasks: 1, awaitingApproval: 0 });
  });
});

describe('W3-D2 filterActivity', () => {
  const entries = [
    { projectId: 'p1', author: 'Lan Pham', type: 'task_update', description: 'Updated VAT', timestamp: '2026-11-10T09:00:00.000Z' },
    { projectId: 'p2', author: 'Minh', type: 'close_direct', description: 'Closed CIT', timestamp: '2026-11-12T09:00:00.000Z' },
    { projectId: 'p1', author: 'lan pham', type: 'close_direct', description: 'Closed VAT', timestamp: '2026-11-14T09:00:00.000Z' },
  ];
  it('AF-1 filters combine, newest first', () => {
    expect(filterActivity(entries, { projectId: 'p1', person: 'LAN', text: 'vat' }).map((e) => e.timestamp.slice(0, 10))).toEqual(['2026-11-14', '2026-11-10']);
    expect(filterActivity(entries, { types: ['close_direct'], person: 'lan' })).toHaveLength(1);
  });
  it('AF-2 date bounds are inclusive', () => {
    expect(filterActivity(entries, { from: '2026-11-12', to: '2026-11-12' }).map((e) => e.author)).toEqual(['Minh']);
    expect(filterActivity(entries, { from: '2026-11-11' })).toHaveLength(2);
  });
  it('AF-3 distinct sorted types', () => {
    expect(activityTypes(entries)).toEqual(['close_direct', 'task_update']);
  });
});
