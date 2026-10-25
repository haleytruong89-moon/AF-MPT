import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { scenarios, seedScenario, writeScenario } from './p3-scenarios.js';

// P3 review round 1: expression-limit headroom (CI only).
// Loads firestore.rules with k "pad units" injected in front of the task
// update path (taskUpdateWith) and of the /users/{uid} write rule. One pad
// unit = p10(x): ten `x != ''` comparisons. The heaviest P3 allow paths
// (realistic executor payloads, p3-scenarios.js) must still pass with
// MIN_UNITS units (~150 no-op comparisons) on top. The largest k that still
// passes is logged per scenario; the /users write (a near-empty rule) gives
// the cost of one unit: ~1000 / kMax(users) expressions.

const MIN_UNITS = 15;
const MAX_UNITS = 120;
const BASE = readFileSync('firestore.rules', 'utf8');

function paddedRules(k) {
  const p10 = `function p10(x) { return ${Array(10).fill("x != ''").join(' && ')}; }`;
  const pad = k === 0 ? 'true' : Array(k).fill('p10(x)').join(' && ');
  let s = BASE.replace(/(match \/databases\/\{database\}\/documents \{\r?\n)/,
    `$1    ${p10}\n    function padOk(x) { return ${pad}; }\n`);
  const before = s;
  s = s.replace(/(function taskUpdateWith\(wid, pid, ch, s0, s1, cl\) \{\r?\n\s*return )/, '$1padOk(wid) && ');
  if (s === before) throw new Error('taskUpdateWith not found');
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

async function passes(k, probe) {
  const env = await envFor(k);
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
  const db = env.authenticatedContext(s.actor.uid, { email: s.actor.email, email_verified: true }).firestore();
  await writeScenario(db, s);
};

const usersProbe = async (env) => {
  const db = env.authenticatedContext('u_cal', { email: 'cal@smartosc.com', email_verified: true }).firestore();
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

  it('H-1 heaviest P3 allow paths pass with ~150 extra expressions; headroom logged', async () => {
    const cal = await maxUnits(usersProbe, 0);
    const perUnit = 1000 / (cal + 1);
    const rows = [];
    for (const s of scenarios) {
      expect(await passes(0, scenarioProbe(s)), `${s.name} at k=0`).toBe(true);
      expect(await passes(MIN_UNITS, scenarioProbe(s)), `${s.name} at k=${MIN_UNITS}`).toBe(true);
      const k = await maxUnits(scenarioProbe(s), MIN_UNITS);
      rows.push(`${s.name}: max units ${k}${k === MAX_UNITS ? '+' : ''} ~ ${Math.round(k * perUnit)} expressions headroom`);
    }
    // eslint-disable-next-line no-console
    console.log([
      `[P3 headroom] calibration /users write: max units ${cal} => ~${perUnit.toFixed(1)} expressions per unit`,
      ...rows.map((r) => `[P3 headroom] ${r}`),
    ].join('\n'));
  }, 600000);
});
