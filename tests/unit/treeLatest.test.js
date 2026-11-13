import { describe, it, expect } from 'vitest';
import { findProgram, findWorkstream } from '../../src/treeLatest.js';

const project = { programs: [{ id: 'p1', name: 'A', workstreams: [{ id: 'w1', name: 'W', tasks: [] }] }] };

describe('treeLatest', () => {
  it('finds a program and a work stream by id', () => {
    expect(findProgram(project, 'p1').name).toBe('A');
    expect(findWorkstream(project, 'p1', 'w1').name).toBe('W');
  });
  it('returns null when the node was deleted or the project is empty', () => {
    expect(findProgram(project, 'px')).toBeNull();
    expect(findWorkstream(project, 'p1', 'wx')).toBeNull();
    expect(findWorkstream(project, 'px', 'w1')).toBeNull();
    expect(findProgram(null, 'p1')).toBeNull();
    expect(findProgram({}, 'p1')).toBeNull();
  });
});
