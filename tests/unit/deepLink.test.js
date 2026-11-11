import { describe, it, expect } from 'vitest';
import { taskUrl, parseDeepLink } from '../../src/deepLink';

describe('taskUrl', () => {
  it('builds an encoded link', () => {
    expect(taskUrl('https://af-mpt.vercel.app', 'p 1', 't&2')).toBe('https://af-mpt.vercel.app/?project=p%201&task=t%262');
  });
  it('round-trips through parseDeepLink', () => {
    const u = new URL(taskUrl('https://x.test', 'a/b', 'c=d'));
    expect(parseDeepLink(u.search)).toEqual({ project: 'a/b', action: null, task: 'c=d' });
  });
});

describe('parseDeepLink', () => {
  it('returns nulls when params are missing', () => {
    expect(parseDeepLink('')).toEqual({ project: null, action: null, task: null });
    expect(parseDeepLink('?project=p1')).toEqual({ project: 'p1', action: null, task: null });
  });
  it('reads action and task', () => {
    expect(parseDeepLink('?project=p1&action=a1')).toEqual({ project: 'p1', action: 'a1', task: null });
    expect(parseDeepLink('?project=p1&task=t1')).toEqual({ project: 'p1', action: null, task: 't1' });
  });
  it('ignores unknown params and empty values', () => {
    expect(parseDeepLink('?foo=1&project=&task=t1')).toEqual({ project: null, action: null, task: 't1' });
  });
});
