import { describe, it, expect } from 'vitest';
import { vnDate, extraTaskColumns, exportFileStem } from '../../src/excelColumns.js';

describe('PM-24 export columns', () => {
  it('EX-1 a closed task: contributors, health, closed on (VN date), approver, original end, latest update', () => {
    const task = {
      status: 'Completed', contributors: ['An', 'Binh'], health: 'amber',
      approvedAt: '2026-12-09T18:30:00.000Z', approvedByUid: 'u_ha',
      deadlineHistory: [{ from: '2026-11-30', to: '2026-12-10' }, { from: '2026-12-10', to: '2026-12-15' }],
      updates: [
        { timestamp: '2026-12-01T02:00:00Z', author: 'An', text: 'old' },
        { timestamp: '2026-12-08T02:00:00Z', author: 'Binh', text: 'Sent  the\nfile' },
      ],
    };
    expect(extraTaskColumns(task, { nameOf: (u) => ({ u_ha: 'Ha' })[u] })).toEqual({
      'Contributors': 'An, Binh', 'Health': 'At risk', 'Closed on': '2026-12-10', 'Approved by': 'Ha',
      'Original end': '2026-11-30', 'Latest update': '2026-12-08 — Binh: Sent the file',
    });
  });
  it('EX-2 an open task with nothing: empty strings; closed-only fields stay empty while open', () => {
    expect(extraTaskColumns({ status: 'InProgress', approvedAt: '2026-12-01T00:00:00Z', approvedByUid: 'u' })).toEqual({
      'Contributors': '', 'Health': '', 'Closed on': '', 'Approved by': '', 'Original end': '', 'Latest update': '',
    });
    expect(vnDate(null)).toBe('');
  });
  it('EX-3 file stem with the scope', () => {
    expect(exportFileStem('AF 2026 Operation')).toBe('AF_2026_Operation');
    expect(exportFileStem('CRP', 'Close / Month-end')).toBe('CRP_Close_Month_end');
  });
});
