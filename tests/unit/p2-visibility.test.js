import { describe, it, expect } from 'vitest';
import { prepareVisibility, decideVisibilityRollback, formatVisibilityPreview, parseArgs, LOCKOUT_MESSAGE } from '../../scripts/p2-visibility.mjs';

// W3-B2 (B-5, D5): pure part of scripts/p2-visibility.mjs.
const PID = 'p1';
const members = [
  { id: 'u_hod', data: { status: 'active' } },
  { id: 'u_in', data: { status: 'active' } },
  { id: 'u_out', data: { status: 'active' } },
  { id: 'u_out2', data: { status: 'active' } },
  { id: 'u_old', data: { status: 'deactivated' } },
];
const state = (over = {}) => ({
  doc: { name: 'Ops', schemaVersion: 2, visibility: 'restricted', memberUids: ['u_hod', 'u_in'], ...over.doc },
  tasks: over.tasks ?? [],
  actions: over.actions ?? [],
  members,
});
const prep = (s, to) => prepareVisibility({ pid: PID, state: s, members, to });

describe('W3-B2 prepareVisibility', () => {
  it('VIS-1 to department lists the active members outside the project who gain access', () => {
    const p = prep(state(), 'department');
    expect(p.blocked).toEqual([]);
    expect(p).toMatchObject({ from: 'restricted', to: 'department', gain: ['u_out', 'u_out2'], lose: [], noop: false });
    expect(p.planHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('VIS-2 to restricted lists who loses access', () => {
    const p = prep(state({ doc: { visibility: 'department' } }), 'restricted');
    expect(p).toMatchObject({ from: 'department', lose: ['u_out', 'u_out2'], gain: [], blocked: [] });
  });

  it('VIS-3 to restricted is refused when an open PIC / contributor / action PIC is outside the project', () => {
    const p = prep(state({
      doc: { visibility: 'department' },
      tasks: [
        { id: 't1', data: { status: 'InProgress', picUid: 'u_out', contributorUids: ['u_in', 'u_out2'] } },
        { id: 't2', data: { status: 'Completed', picUid: 'u_old' } },
      ],
      actions: [{ id: 'a1', data: { status: 'Pending', picUid: 'u_out2' } }, { id: 'a2', data: { status: 'Done', picUid: 'u_out' } }],
    }), 'restricted');
    expect(p.blocked).toEqual([{ code: 'lockout', detail: LOCKOUT_MESSAGE }]);
    expect(p.lockout).toEqual([
      { uid: 'u_out', where: 'task t1 PIC' },
      { uid: 'u_out2', where: 'task t1 contributor' },
      { uid: 'u_out2', where: 'action a1 PIC' },
    ]);
    expect(p.planHash).toBeNull();
    expect(formatVisibilityPreview(p).join('\n')).toContain(LOCKOUT_MESSAGE);
  });

  it('VIS-4 noop when already at the value; missing visibility reads as restricted', () => {
    expect(prep(state(), 'restricted').noop).toBe(true);
    expect(prep(state({ doc: { visibility: undefined } }), 'restricted').noop).toBe(true);
  });

  it('VIS-5 blocked: bad value, not v2, deleted', () => {
    expect(prep(state(), 'public').blocked[0].code).toBe('bad-value');
    expect(prep(state({ doc: { schemaVersion: 1 } }), 'department').blocked[0].code).toBe('not-v2');
    expect(prep(state({ doc: { deletedAt: 'x' } }), 'department').blocked[0].code).toBe('deleted');
  });

  it('VIS-6 the hash changes when the project members change', () => {
    const a = prep(state(), 'department').planHash;
    expect(prep(state(), 'department').planHash).toBe(a);
    expect(prep(state({ doc: { memberUids: ['u_hod'] } }), 'department').planHash).not.toBe(a);
  });
});

describe('W3-B2 decideVisibilityRollback', () => {
  const manifest = { kind: 'p2-visibility', pid: PID, planHash: 'abc', before: 'restricted', after: 'department' };
  it('VIS-R1 back to the before-value while the field still holds the applied one', () => {
    const r = decideVisibilityRollback({ manifest, state: state({ doc: { visibility: 'department' } }) });
    expect(r).toMatchObject({ blocked: [], noop: false, from: 'department', to: 'restricted' });
    expect(r.hash).toMatch(/^[0-9a-f]{16}$/);
  });
  it('VIS-R2 changed since the apply -> nothing to roll back', () => {
    expect(decideVisibilityRollback({ manifest, state: state() }).noop).toBe(true);
  });
  it('VIS-R3 the lockout check applies to the rollback too', () => {
    const s = state({ doc: { visibility: 'department' }, tasks: [{ id: 't1', data: { status: 'Planned', picUid: 'u_out' } }] });
    expect(decideVisibilityRollback({ manifest, state: s }).blocked[0].code).toBe('lockout');
  });
  it('VIS-R4 refuses another kind of manifest', () => {
    expect(decideVisibilityRollback({ manifest: { ...manifest, kind: 'p2-assign' }, state: state() }).blocked[0].code).toBe('bad-manifest');
  });
});

describe('W3-B2 p2-visibility parseArgs', () => {
  it('VIS-A1 modes and refusals', () => {
    expect(parseArgs(['p1', '--set', 'department'])).toMatchObject({ pid: 'p1', set: 'department', error: null });
    expect(parseArgs(['p1']).error).toMatch(/--set/);
    expect(parseArgs(['p1', '--set', 'public']).error).toMatch(/--set/);
    expect(parseArgs(['p1', '--set', 'restricted', '--apply']).error).toMatch(/--expect/);
    expect(parseArgs(['--rollback', 'm.json', '--set', 'department']).error).toMatch(/only a manifest/);
  });
});
