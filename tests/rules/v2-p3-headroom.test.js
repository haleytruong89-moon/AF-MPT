import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import {
  scenarios, seedScenario, writeScenario,
  approvalScenarios, seedApprovalScenario, writeApprovalScenario,
} from './p3-scenarios.js';

// P3 review round 1: expression-limit headroom (CI only).
// Loads firestore.rules with k "pad units" injected in front of the task
// update path (taskUpdateWith) and of the /users/{uid} write rule. One pad
// unit = p2(x): two `x != ''` comparisons (~12 expressions; CI run
// 40173946977 measured ~53 per ten comparisons). The heaviest P3 allow
// paths (realistic executor payloads, p3-scenarios.js) must still pass with
// MIN_UNITS units (~100 extra expressions) on top. The largest k that still
// passes is logged per scenario; the /users write (a near-empty rule) gives
// the cost of one unit: ~1000 / kMax(users) expressions.
// P3 Task 4: the same k units are also injected in front of the approvals
// create / update paths (approvalCreateWith, approvalUpdateWith); task writes
// never evaluate them, so the task numbers are unaffected, and the approvals
// scenarios (approvalScenarios) are measured the same way.

const MIN_UNITS = 8;
const MAX_UNITS = 160;
const BASE = readFileSync('firestore.rules', 'utf8');

// Balanced && tree of k p2 calls: a flat chain of ~25+ terms is rejected
// at compile time ("Expression is too complex to evaluate safely").
function bal(k) {
  if (k === 1) return 'p2(x)';
  const h = Math.floor(k / 2);
  return `(${bal(h)} && ${bal(k - h)})`;
}

function paddedRules(k) {
  const p2 = "function p2(x) { return x != '' && x != ''; }";
  const pad = k === 0 ? 'true' : bal(k);
  let s = BASE.replace(/(match \/databases\/\{database\}\/documents \{\r?\n)/,
    `$1    ${p2}\n    function padOk(x) { return ${pad}; }\n`);
  const before = s;
  s = s.replace(/(function taskUpdateWith\(wid, pid, ch, s0, s1, cl, rv\) \{\r?\n\s*return )/, '$1padOk(wid) && ');
  if (s === before) throw new Error('taskUpdateWith not found');
  for (const re of [
    /(function approvalCreateWith\(wid, pid, n, p\) \{\r?\n\s*return )/,
    /(function approvalUpdateWith\(wid, pid, ch, o, n\) \{\r?\n\s*return )/,
  ]) {
    const b = s;
    s = s.replace(re, '$1padOk(wid) && ');
    if (s === b) throw new Error(`${re} not found`);
  }
  const before2 = s;
  s = s.replace(/(match \/users\/\{uid\} \{\r?\n\s*allow read, write: if )/, '$1padOk(uid) && ');
  if (s === before2) throw new Error('/users rule not found');
  return s;
}

const envs = new Map();
async function envFor(k) {
  if (!envs.has(k)) {
    envs.set(k, await initializeTestEnvironment({
      projectId: `demo-afmpt-pad${k}`,
      firestore: { rules: paddedRules(k) },
    }));
  }
  return envs.get(k);
}

const compileErrors = [];
async function passes(k, probe) {
  let env;
  try {
    env = await envFor(k);
  } catch (e) {
    // A padded variant that does not compile counts as "does not fit".
    compileErrors.push(`k=${k}: ${String(e && e.message).slice(0, 160)}`);
    return false;
  }
  await env.clearFirestore();
  try {
    await probe(env);
    return true;
  } catch (e) {
    if (e && /PERMISSION_DENIED|permission-denied/i.test(String(e.code || e.message))) return false;
    throw e;
  }
}

const seedWith = (env) => (path, data) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));

const scenarioProbe = (s) => async (env) => {
  await seedScenario(seedWith(env), s);
  const db = env.authenticatedContext(s.actor.uid, { email: s.actor.email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
  await writeScenario(db, s);
};

const approvalProbe = (s) => async (env) => {
  await seedApprovalScenario(seedWith(env), s);
  const db = env.authenticatedContext(s.actor.uid, { email: s.actor.email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
  await writeApprovalScenario(db, s);
};

const usersProbe = async (env) => {
  const db = env.authenticatedContext('u_cal', { email: 'cal@smartosc.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
  await setDoc(doc(db, 'users/u_cal'), { currentProjectId: 'p1' });
};

// Largest k in [lo, MAX_UNITS] that still passes (lo must pass).
async function maxUnits(probe, lo) {
  if (await passes(MAX_UNITS, probe)) return MAX_UNITS;
  let a = lo;
  let b = MAX_UNITS;
  while (b - a > 1) {
    const m = Math.floor((a + b) / 2);
    if (await passes(m, probe)) a = m; else b = m;
  }
  return a;
}

describe('P3 expression headroom (padded rules)', () => {
  afterAll(async () => {
    for (const env of envs.values()) await env.cleanup();
  });

  it('H-1 heaviest P3 allow paths pass with ~100 extra expressions; headroom logged', async () => {
    const cal = await maxUnits(usersProbe, 0);
    const perUnit = 1000 / (cal + 1);
    const rows = [];
    const results = [];
    const probes = scenarios.map((s) => ({ s, probe: scenarioProbe(s) }))
      .concat(approvalScenarios.map((s) => ({ s, probe: approvalProbe(s) })));
    for (const { s, probe } of probes) {
      const ok0 = await passes(0, probe);
      const k = ok0 ? await maxUnits(probe, 0) : -1;
      results.push({ s, k });
      rows.push(`${s.name}: max units ${k}${k === MAX_UNITS ? '+' : ''} ~ ${Math.round(k * perUnit)} expressions headroom`);
    }
    // eslint-disable-next-line no-console
    console.log([
      `[P3 headroom] calibration /users write: max units ${cal} => ~${perUnit.toFixed(1)} expressions per unit`,
      ...rows.map((r) => `[P3 headroom] ${r}`),
      ...compileErrors.slice(0, 3).map((r) => `[P3 headroom] compile: ${r}`),
    ].join('\n'));
    for (const { s, k } of results) {
      expect(k, `${s.name}: passes at k=0`).toBeGreaterThanOrEqual(0);
      expect(k, `${s.name}: passes with ${MIN_UNITS} units`).toBeGreaterThanOrEqual(MIN_UNITS);
    }
  }, 600000);
});
