import { describe, it, expect } from 'vitest';
import { createHeldEffects, changedItemLabels } from '../../src/afterSave.js';

describe('createHeldEffects', () => {
  it('runs held effects in order once on ok', () => {
    const h = createHeldEffects();
    const out = [];
    h.hold('p', () => out.push(1));
    h.hold('p', () => out.push(2));
    expect(h.has('p')).toBe(true);
    h.settle('p', 'ok');
    h.settle('p', 'ok');
    expect(out).toEqual([1, 2]);
    expect(h.has('p')).toBe(false);
  });
  it('drops on a final refusal', () => {
    const h = createHeldEffects();
    const out = [];
    h.hold('p', () => out.push(1));
    h.settle('p', 'denied');
    h.settle('p', 'ok');
    expect(out).toEqual([]);
  });
  it('keeps on a retryable error, then runs on ok', () => {
    const h = createHeldEffects();
    const out = [];
    h.hold('p', () => out.push(1));
    h.settle('p', 'error');
    expect(out).toEqual([]);
    h.settle('p', 'ok');
    expect(out).toEqual([1]);
  });
  it('is per project and survives a throwing effect', () => {
    const h = createHeldEffects();
    const out = [];
    h.hold('a', () => { throw new Error('x'); });
    h.hold('a', () => out.push('a'));
    h.hold('b', () => out.push('b'));
    h.settle('a', 'ok');
    expect(out).toEqual(['a']);
    expect(h.has('b')).toBe(true);
  });
});

const tree = (over = {}) => ({
  name: 'P',
  programs: [{ id: 'pg1', name: 'Prog', workstreams: [{ id: 'ws1', name: 'WS', tasks: [{ id: 't1', name: 'Task one', status: 'Planned' }] }] }],
  actionItems: [{ id: 'a1', title: 'Act', status: 'Pending' }],
  decisions: [],
  ...over,
});

describe('changedItemLabels', () => {
  it('names a changed task', () => {
    const cur = tree();
    cur.programs[0].workstreams[0].tasks[0].status = 'InProgress';
    expect(changedItemLabels(cur, tree())).toEqual(['Task "Task one"']);
  });
  it('names added and removed items', () => {
    const cur = tree({ actionItems: [{ id: 'a1', title: 'Act', status: 'Pending' }, { id: 'a2', title: 'New', status: 'Pending' }] });
    cur.programs[0].workstreams = [];
    expect(changedItemLabels(cur, tree()).sort()).toEqual(['Action "New"', 'Task "Task one"', 'Work stream "WS"'].sort());
  });
  it('ignores internal keys and undefined', () => {
    const cur = tree({ __v2: { x: 1 } });
    cur.programs[0].workstreams[0].tasks[0].note = undefined;
    expect(changedItemLabels(cur, tree())).toEqual(['some changes']);
  });
  it('truncates', () => {
    const cur = tree({ actionItems: [1, 2, 3, 4, 5].map((i) => ({ id: 'n' + i, title: 'A' + i })) });
    const out = changedItemLabels(cur, tree());
    expect(out).toHaveLength(4);
    expect(out[3]).toBe('and 3 more');
  });
});
