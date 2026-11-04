import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDirectoryIndex } from '../../src/directory.js';
import { assembleProject, splitProject } from '../../src/migrateV2.js';
import { appValueFromV2 } from '../../src/readV2.js';
import { normaliseForV2 } from '../../scripts/lib/migrate-normalise.mjs';
import { planRestore } from '../../scripts/lib/restore-plan.mjs';
import { parseArgs, formatRestorePreview, restorePreviewSheets } from '../../scripts/p2-restore.mjs';

const PID = 'proj_fx';
const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/v1-project.json', import.meta.url), 'utf8'));
const dirIndex = buildDirectoryIndex([
  { email: 'alice@smartosc.com', displayName: 'Alice Nguyen', status: 'active' },
  { email: 'bob@smartosc.com', displayName: 'Bob', status: 'active' },
]);
const uidByEmail = new Map([['alice@smartosc.com', 'uid1'], ['bob@smartosc.com', 'uid2']]);
const KINDS = ['workstreams', 'tasks', 'actions', 'raid', 'decisions'];

function makeLive() {
  const s = splitProject(normaliseForV2(fixture(), { pid: PID }).project, { wid: 'main', dirIndex, uidByEmail });
  const meta = structuredClone({ ...s.meta, schemaVersion: 2, visibility: 'restricted', memberIds: ['uidZ'], memberUids: ['uid1', 'uid2'] });
  const docs = Object.fromEntries(KINDS.map((k) => [k, structuredClone(s[k])]));
  docs.tasks.find((d) => d.id === 't2').data.updates = [{ id: 'u7', text: 'x', authorUid: 'uidZ' }];
  return { meta, docs };
}
const backupOf = (live) => {
  const tree = assembleProject(live.meta, ...KINDS.map((k) => live.docs[k])).project;
  const { __v2: _v2, ...rest } = structuredClone(appValueFromV2(tree, PID, 0));
  void _v2;
  return rest;
};
const plan = (live, bp, extra = {}) => planRestore({ pid: PID, live, backupProject: bp, dirIndex, uidByEmail, backupSha256: 'a'.repeat(64), ...extra });
const prepOf = (p, live, extra = {}) => ({ ...p, live, dir: { members: [] }, backupName: 'backup.json', backupSha256: 'a'.repeat(64), hasMigrationRecord: false, ...extra });
const indexOf = (lines, re) => lines.findIndex((l) => re.test(l));
const tasksOf = (b) => b.programs.flatMap((pg) => pg.workstreams).flatMap((w) => w.tasks);

describe('p2-restore parseArgs', () => {
  it('CLI-1: accepts a pid with --backup; rejects bad combinations', () => {
    const ok = parseArgs(['p', '--backup', 'b.json']);
    expect(ok.error).toBeNull();
    expect(ok).toMatchObject({ pid: 'p', backup: 'b.json', apply: false, allowHistoryLoss: false, key: 'service-account.json' });
    expect(parseArgs(['p', '--backup', 'b.json', '--allow-history-loss', '--key', 'k.json'])).toMatchObject({ allowHistoryLoss: true, key: 'k.json', error: null });
    expect(parseArgs(['p', '--backup', 'b.json', '--apply', '--expect', '0123456789abcdef'])).toMatchObject({ apply: true, expect: '0123456789abcdef', error: null });
    expect(parseArgs(['p']).error).toMatch(/--backup/);
    expect(parseArgs(['p', '--backup', 'b.json', '--apply']).error).toMatch(/--expect/);
    expect(parseArgs(['p', '--backup', 'b.json', '--apply', '--expect', 'xyz']).error).toMatch(/16-hex/);
    expect(parseArgs(['p', 'q', '--backup', 'b.json']).error).toMatch(/one project id/);
    expect(parseArgs(['a/b', '--backup', 'b.json']).error).toMatch(/one project id/);
    expect(parseArgs([]).error).toMatch(/one project id/);
    expect(parseArgs(['p', '--backup', 'b.json', '--nope']).error).toMatch(/Unknown argument/);
    expect(parseArgs(['p', '--backup']).error).toMatch(/needs a value/);
  });
});

describe('formatRestorePreview', () => {
  it('CLI-2: restore plan with a retained Completed task prints the sections in order', () => {
    const live = makeLive();
    const b = backupOf(live);
    live.docs.tasks.push({
      id: 't9',
      data: {
        id: 't9', name: 'Late task', status: 'Completed', updates: [],
        workspaceId: 'main', projectId: PID, programId: 'pg1', workstreamId: 'w2', order: 0,
        picUid: null, picEmail: null, contributorUids: [], version: 2,
      },
    });
    const p = plan(live, b);
    const L = formatRestorePreview(prepOf(p, live, { backupActivityCount: 4 }), { pid: PID });
    const at = [
      /^Project:/, /^Mode:        restore/, /^Counts:/, /^Retained \(Dropped\/Cancelled\):/, /^CREDIT LOSS/,
      /^History loss: none/, /^Access:      memberIds 1, memberUids 2, visibility restricted \(unchanged, not restored\)/,
      /^Activity:/, /^Plan hash:/,
    ].map((re) => indexOf(L, re));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(L.some((l) => /t9.*Completed -> Dropped/.test(l))).toBe(true);
    expect(L.some((l) => /^Activity:\s+backup has 4 entries \(not restored\); 1 restore event will be added/.test(l))).toBe(true);
    expect(L[L.length - 1]).toContain(p.planHash);
    expect(L.join('\n')).not.toMatch(/REFUSED/);
  });

  it('CLI-3: refused history loss prints REFUSED (exit 3) and the lost entry ids, no apply hash', () => {
    const live = makeLive();
    const b = backupOf(live);
    tasksOf(b).find((t) => t.id === 't2').updates = [];
    const p = plan(live, b);
    const L = formatRestorePreview(prepOf(p, live), { pid: PID });
    const text = L.join('\n');
    expect(text).toContain('REFUSED (exit 3)');
    expect(text).toContain('u7');
    expect(text).toContain('--allow-history-loss');
    expect(L.some((l) => /^Plan hash:/.test(l))).toBe(false);
    const allowed = plan(live, b, { allowHistoryLoss: true });
    const L2 = formatRestorePreview(prepOf(allowed, live, { allowHistoryLoss: true }), { pid: PID });
    expect(L2.join('\n')).not.toContain('REFUSED');
    expect(L2.join('\n')).toContain('u7');
    expect(L2[L2.length - 1]).toContain(allowed.planHash);
    expect(L2[L2.length - 1]).toContain('--allow-history-loss');
  });

  it('CLI-4: kept meta and migration warning are shown; blocked lists codes and no hash', () => {
    const live = makeLive();
    const b = backupOf(live);
    live.meta.extraLive = 'keep me';
    b.programs.find((x) => x.id === 'pg1').name = 'Program One renamed';
    const p = plan(live, b, { hasMigrationRecord: true });
    const text = formatRestorePreview(prepOf(p, live, { hasMigrationRecord: true }), { pid: PID }).join('\n');
    expect(text).toMatch(/extraLive/);
    expect(text).toMatch(/--force-with-report/);
    expect(text).toMatch(/pg1/);
    const blocked = plan(live, null);
    const bt = formatRestorePreview(prepOf(blocked, live), { pid: PID });
    expect(bt.some((l) => /^Mode:        blocked/.test(l))).toBe(true);
    expect(bt.join('\n')).toContain('backup-invalid');
    expect(bt.some((l) => /^Plan hash:/.test(l))).toBe(false);
  });

  it('CLI-5: sheets have Summary / Ops / Retained / History loss / Changes', () => {
    const live = makeLive();
    const b = backupOf(live);
    b.programs.flatMap((pg) => pg.workstreams).find((w) => w.id === 'w1').name = 'WS One renamed';
    const p = plan(live, b);
    const s = restorePreviewSheets(prepOf(p, live), { pid: PID });
    expect(Object.keys(s)).toEqual(['Summary', 'Ops', 'Retained', 'History loss', 'Changes']);
    expect(s.Ops).toEqual([expect.objectContaining({ Kind: 'workstreams', Op: 'update', Id: 'w1' })]);
    expect(s.Summary.length).toBeGreaterThan(3);
  });
});
