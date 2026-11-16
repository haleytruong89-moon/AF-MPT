import { describe, it, expect } from 'vitest';
import { restorePreview, restoreScriptHint } from '../../src/treeGuards.js';
import { personHoldings, holdingsText } from '../../src/holdings.js';

// W3-D1: Owner operations helpers.
describe('W3-D1 restorePreview', () => {
  const data = { meta: { projectIds: ['a', 'b', 'gone'] }, projects: { a: { name: 'A', schemaVersion: 2 }, b: { name: 'B' } } };
  it('RP-1 mixed / all v2 / invalid', () => {
    expect(restorePreview(data, {})).toEqual({ v1Names: ['B'], v2: [{ id: 'a', name: 'A' }], invalid: null });
    expect(restorePreview(data, { b: { __v2: {} } }).v1Names).toEqual([]);
    expect(restorePreview({ projects: {} }, {}).invalid).toBe('Invalid backup file.');
    expect(restorePreview(null, {}).invalid).toBe('Invalid backup file.');
  });
  it('RP-2 script hint quotes the file name', () => {
    expect(restoreScriptHint([{ id: 'a' }], 'AF backup "nov".json')).toEqual(['npm run p2:restore -- a --backup "AF backup \\"nov\\".json"']);
  });
});

describe('W3-D1 personHoldings', () => {
  const projects = {
    p: {
      name: 'Ops',
      __v2: { roles: {
        programs: { g1: { pmUid: 'u', deputyUid: null }, g2: { pmUid: 'x', deputyUid: 'u' } },
        workstreams: { w1: { leadUid: 'u' } },
        tasks: { t1: { picUid: 'u' }, t2: { picUid: 'u' }, t3: { picUid: 'x' } },
        actions: { a1: { picUid: 'u' } },
      } },
      programs: [
        { id: 'g1', name: 'Finance', workstreams: [{ id: 'w1', name: 'Close', tasks: [
          { id: 't1', status: 'InProgress' }, { id: 't2', status: 'Completed' },
          { id: 't3', status: 'Submitted', closeRequest: { approverUid: 'u' } }, { id: 't4', status: 'Planned', pic: 'Lan' },
        ] }] },
        { id: 'g2', name: 'Tax', workstreams: [] },
      ],
      actionItems: [{ id: 'a1', status: 'Pending' }, { id: 'a2', status: 'Done', pic: 'Lan' }],
    },
  };
  it('HD-1 roles of each kind, open work only, approvals waiting', () => {
    const h = personHoldings(projects, 'u', (raw) => raw === 'Lan');
    expect(h).toEqual({ roles: ['PM of Finance (Ops)', 'Deputy of Tax (Ops)', 'Sub-PM of Close (Ops)'], openTasks: 2, openActions: 1, approvalsWaiting: 1 });
    expect(holdingsText(h)).toBe('They still hold: PM of Finance (Ops), Deputy of Tax (Ops), Sub-PM of Close (Ops); 2 open tasks; 1 open action; 1 close request waiting for their approval.');
  });
  it('HD-2 nothing held -> empty text', () => {
    const h = personHoldings(projects, 'nobody');
    expect(h).toEqual({ roles: [], openTasks: 0, openActions: 0, approvalsWaiting: 0 });
    expect(holdingsText(h)).toBe('');
  });
});
