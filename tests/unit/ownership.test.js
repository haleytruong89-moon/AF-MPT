import { describe, it, expect } from 'vitest';
import { isWorkspaceOwnerEmail, transferCandidates, metaForWrite, OWNER_WRITE_FLAG } from '../../src/ownership.js';

describe('isWorkspaceOwnerEmail', () => {
  it('matches the same email case-insensitively', () => {
    expect(isWorkspaceOwnerEmail('HaTTT4@SmartOSC.com', 'hattt4@smartosc.com')).toBe(true);
  });
  it('rejects a display-name owner (legacy) even if it equals the user name', () => {
    expect(isWorkspaceOwnerEmail('Hà Trương Thị Thu', 'hattt4@smartosc.com')).toBe(false);
  });
  it('rejects when either side is missing', () => {
    expect(isWorkspaceOwnerEmail(null, 'a@smartosc.com')).toBe(false);
    expect(isWorkspaceOwnerEmail('a@smartosc.com', null)).toBe(false);
    expect(isWorkspaceOwnerEmail('', '')).toBe(false);
  });
  it('rejects a different email', () => {
    expect(isWorkspaceOwnerEmail('a@smartosc.com', 'b@smartosc.com')).toBe(false);
  });
});

describe('transferCandidates', () => {
  const projects = {
    p1: { teamMembers: [
      { name: 'Lan', email: 'Lan@smartosc.com' },
      { name: 'Legal' },                                  // no email → excluded
      { name: 'Hà Trương Thị Thu', email: 'hattt4@smartosc.com' },
    ] },
    p2: { teamMembers: [{ name: 'Lan N.', email: 'lan@smartosc.com' }] }, // duplicate email
  };
  const team = [{ name: 'Minh', email: 'minh@smartosc.com' }, { name: 'AF' }];

  it('returns only members with an email, deduped by lowercase email, sorted by name', () => {
    const out = transferCandidates(projects, team, 'HATTT4@smartosc.com');
    expect(out.map((c) => c.email)).toEqual(['lan@smartosc.com', 'minh@smartosc.com']);
    expect(out.map((c) => c.name)).toEqual(['Lan', 'Minh']);
  });

  it('excludes the current owner case-insensitively', () => {
    const out = transferCandidates(projects, team, 'hattt4@smartosc.com');
    expect(out.find((c) => c.email === 'hattt4@smartosc.com')).toBeUndefined();
  });

  it('handles empty inputs', () => {
    expect(transferCandidates({}, [], null)).toEqual([]);
  });

  it('excludes non-smartosc emails (rules would reject them)', () => {
    const out = transferCandidates({ p: { teamMembers: [
      { name: 'Ext', email: 'ext@gmail.com' },
      { name: 'Lan', email: 'lan@smartosc.com' },
    ] } }, [], null);
    expect(out.map((c) => c.email)).toEqual(['lan@smartosc.com']);
  });
});

describe('metaForWrite', () => {
  const meta = {
    seeded: true,
    workspaceOwner: 'hattt4@smartosc.com',
    ownershipLog: [{ id: 'own_1' }],
    defaultView: 'my-work',
    userPreferences: { A: { lastSeenMyWorkAt: 'x' } },
  };

  it('drops owner fields from ordinary meta writes (stale copies cannot clobber or be rejected)', () => {
    expect(metaForWrite(meta)).toEqual({ seeded: true, userPreferences: { A: { lastSeenMyWorkAt: 'x' } } });
  });

  it('keeps owner fields and removes the flag when the write is flagged as an owner write', () => {
    const out = metaForWrite({ ...meta, [OWNER_WRITE_FLAG]: true });
    expect(out).toEqual(meta);
    expect(OWNER_WRITE_FLAG in out).toBe(false);
  });

  it('does not mutate its input', () => {
    const input = { ...meta };
    metaForWrite(input);
    expect(input).toEqual(meta);
  });
});
