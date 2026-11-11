import { describe, it, expect } from 'vitest';
import { loadMetaStrict } from '../../src/bootLoad.js';

describe('loadMetaStrict', () => {
  it('missing when get resolves null', async () => {
    const r = await loadMetaStrict({ get: async () => null });
    expect(r).toEqual({ status: 'missing', meta: null });
  });
  it('ok with parsed meta', async () => {
    const r = await loadMetaStrict({ get: async () => ({ value: '{"a":1}' }) });
    expect(r).toEqual({ status: 'ok', meta: { a: 1 } });
  });
  it('error when get throws', async () => {
    const r = await loadMetaStrict({ get: async () => { throw new Error('offline'); } });
    expect(r).toEqual({ status: 'error', meta: null });
  });
  it('error on bad JSON', async () => {
    const r = await loadMetaStrict({ get: async () => ({ value: '{nope' }) });
    expect(r).toEqual({ status: 'error', meta: null });
  });
  it('asks for workspace:meta as shared', async () => {
    const calls = [];
    await loadMetaStrict({ get: async (k, s) => { calls.push([k, s]); return null; } });
    expect(calls).toEqual([['workspace:meta', true]]);
  });
});
