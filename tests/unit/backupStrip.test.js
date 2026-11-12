import { describe, it, expect } from 'vitest';
import { stripSecrets, stripSecretsFromProjects, projectForRestore } from '../../src/backupStrip.js';

describe('stripSecrets', () => {
  it('removes the webhook and keeps other keys', () => {
    expect(stripSecrets({ id: 'p', name: 'X', googleChatWebhook: 'https://h' })).toEqual({ id: 'p', name: 'X' });
  });
  it('never mutates the input', () => {
    const p = { id: 'p', googleChatWebhook: 'u' };
    stripSecrets(p);
    expect(p.googleChatWebhook).toBe('u');
  });
  it('passes through null/non-objects', () => {
    expect(stripSecrets(null)).toBe(null);
  });
  it('strips across a projects map', () => {
    const m = { a: { googleChatWebhook: 'u', n: 1 }, b: { n: 2 } };
    expect(stripSecretsFromProjects(m)).toEqual({ a: { n: 1 }, b: { n: 2 } });
    expect(m.a.googleChatWebhook).toBe('u');
  });
});

describe('projectForRestore', () => {
  it('keeps the live webhook when the backup has none', () => {
    expect(projectForRestore({ id: 'p' }, { googleChatWebhook: 'live' }).googleChatWebhook).toBe('live');
  });
  it('live wins over an old backup value', () => {
    expect(projectForRestore({ id: 'p', googleChatWebhook: 'old' }, { googleChatWebhook: 'live' }).googleChatWebhook).toBe('live');
  });
  it('drops the old backup value when there is no live one', () => {
    expect('googleChatWebhook' in projectForRestore({ id: 'p', googleChatWebhook: 'old' }, {})).toBe(false);
  });
});
