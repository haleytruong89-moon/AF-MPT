import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

let env;

// One emulator-backed environment per test file. Host/port come from
// FIRESTORE_EMULATOR_HOST, which `firebase emulators:exec` sets.
export async function getEnv() {
  if (!env) {
    env = await initializeTestEnvironment({
      projectId: 'demo-afmpt',
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    });
  }
  return env;
}

// Firestore client authenticated as a user with the given token claims.
export async function asUser(uid, email, verified = true) {
  const e = await getEnv();
  return e.authenticatedContext(uid, { email, email_verified: verified }).firestore();
}

export async function asAnonymous() {
  const e = await getEnv();
  return e.unauthenticatedContext().firestore();
}

// Write fixture data bypassing rules.
export async function seedDoc(path, data) {
  const e = await getEnv();
  await e.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

export async function resetData() {
  const e = await getEnv();
  await e.clearFirestore();
}

export async function cleanup() {
  if (env) await env.cleanup();
  env = undefined;
}
