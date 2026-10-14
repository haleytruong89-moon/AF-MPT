# B0 + B1 — Rules CI and Workspace-Owner Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- **B0:** stand up the project's first automated tests. These are Firestore rules tests that run on the Firebase Emulator in GitHub Actions.
- **B1:** use those tests to close the hole where any `@smartosc.com` user can make themselves Workspace Owner. Then align the UI: owner check by email only, Transfer by email only, no Release, no client-side claim.

**Architecture:**
- Rules stay in the single existing `firestore.rules` (current data model, `workspaces/main`). B1 changes only the `match /workspaces/{workspace}` block.
- Tests use `@firebase/rules-unit-testing` with vitest, run under `firebase emulators:exec` in CI. Nothing runs locally, because the dev machine has no Java.
- App changes are minimal edits in `src/App.jsx`. The owner logic is pulled into a tiny pure module, `src/ownership.js`, so it can be unit-tested.

**Tech Stack:**
- React 18 + Vite 5, Firebase JS SDK 11
- firebase-tools 14.27.0 (needs Java 21)
- @firebase/rules-unit-testing 4.0.1 (peer `firebase ^11`)
- vitest 2.1.9
- GitHub Actions (ubuntu-latest, Node 22, Temurin 21)

**Spec:**
- `docs/DESIGN.md` §5 (rows B1) and §6
- `docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md` §2.1 (decisions 6, 11) and §8
- `CLAUDE.md` (Warnings, Rollback, Key Decisions round 2)

## Global Constraints

- **Release shape.** Two linear PRs: B0 on branch `ci/rules-tests`, merged first. B1 on branch `fix/b1-owner-lock`, created from the updated `main`. One purpose per PR.
- **No production data writes.** No script and no console edit to Firestore data.
- **No rules deploy without green CI.** "Không deploy rules mới khi chưa có test emulator xanh cho đúng thay đổi đó, và chưa giữ bản rules cũ để hoàn tác." The old rules are the version in git at `main` before B1.
- **No mass refactor of `src/App.jsx`.** Each edit is minimal and revertible by one commit.
- **Deploys.** The only app deploy path is merge to `main` (Vercel). Never `vercel --prebuilt`. The rules deploy is a separate manual HOD step (Task 6).
- **Language.** Code, comments, commit messages and file names are in English. UI labels are in English.
- **Lint.** `npm run lint` currently reports 6 errors / 63 warnings and must not increase.
- **Pinned versions:** `firebase-tools@14.27.0`, `@firebase/rules-unit-testing@4.0.1`, `vitest@2.1.9`.
- **Emulator project id:** `demo-afmpt`. The `demo-` prefix means the emulator never touches a real project.
- **Owner identity is an email string** in `workspaces/main.workspaceOwner` (current model). Compare it lowercase. The uid model comes in P1/P2, not here.

## Review Focus

1. **Stale full-meta writes by non-owners.** `saveMeta` sends the whole `meta` object with `merge:true` on every project switch (`App.jsx:13026-13028`). A non-owner whose copy still holds the *same* owner fields must still succeed, because unchanged keys are not "affected". Pinned by test B1-4 in Task 3.
2. **Case mismatch between stored owner and token email,** for example `HaTTT4@smartosc.com` vs `hattt4@smartosc.com`. The owner must still be recognised, both in rules and in UI. Pinned by test B1-9 in Task 3 and the unit test in Task 4.
3. **An ownerless workspace doc.** If the owner field is missing, nobody can claim from the client: no lockout bypass, and the UI shows a message instead of a dead button. Pinned by test B1-7 in Task 3 and the UI step in Task 5.
4. **Release / set-to-null and non-domain recipients.** An owner cannot set `workspaceOwner` to `null`, `''` or a non-`@smartosc.com` email. Pinned by tests B1-6 and B1-8 in Task 3.
5. **Transfer candidates without an email.** Team members known only by name must not be offered, and the current owner must not be offered to themselves, even with different letter case. Pinned by the unit tests in Task 4.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `firebase.json` (create) | Points the Firebase CLI at `firestore.rules`; emulator port; no UI | 1 |
| `vitest.rules.config.js` (create) | Vitest config for rules tests only (node env, serial) | 1 |
| `vitest.config.js` (create) | Vitest config for pure unit tests (`tests/unit`) | 4 |
| `tests/rules/helpers.js` (create) | Shared test env and auth contexts | 1 |
| `tests/rules/baseline.test.js` (create) | Pins **current** behaviour of project/workspace read rules | 1 |
| `tests/rules/workspace-owner.test.js` (create) | B1 owner-lock tests | 3 |
| `.github/workflows/ci.yml` (create) | CI: typecheck + unit tests + rules tests on every PR and on push to `main` | 2 |
| `package.json` (modify) | devDeps + `test`, `test:rules` scripts | 1, 4 |
| `firestore.rules` (modify, lines 59-63 only) | B1 rule for `workspaces/{workspace}` | 3 |
| `src/ownership.js` (create) | `isWorkspaceOwnerEmail()`, `transferCandidates()` (pure) | 4 |
| `tests/unit/ownership.test.js` (create) | Unit tests for `src/ownership.js` | 4 |
| `src/App.jsx` (modify) | isOwner (~12445-12452), TransferOwnerDialog (~12272-12318), owner menu (~13660-13686), import line | 5 |
| `docs/DESIGN.md`, `CLAUDE.md` (modify) | Fix the B1 Transfer note; status + rules deploy runbook | 3, 6 |

---

## PR 1 — B0 (branch `ci/rules-tests`)

### Task 1: Rules test harness + baseline tests

**Files:**
- Create: `firebase.json`, `vitest.rules.config.js`, `tests/rules/helpers.js`, `tests/rules/baseline.test.js`
- Modify: `package.json` (devDependencies, scripts)

**Interfaces:**
- Produces: `getEnv()`, `asUser(uid, email, verified=true)`, `seedDoc(path, data)`, `resetData()` from `tests/rules/helpers.js`; npm script `test:rules`.

- [ ] **Step 1: Create the branch**

```bash
git switch main && git pull --ff-only && git switch -c ci/rules-tests
```

- [ ] **Step 2: Install pinned dev dependencies**

```bash
npm install --save-dev --save-exact firebase-tools@14.27.0 @firebase/rules-unit-testing@4.0.1 vitest@2.1.9
```

Expected: `package.json` devDependencies gain these three exact versions, and `package-lock.json` is updated. No peer-dependency error for `firebase`.

- [ ] **Step 3: Create `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "emulators": {
    "firestore": { "port": 8080 },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 4: Create `vitest.rules.config.js`**

```js
import { defineConfig } from 'vitest/config';

// Firestore rules tests. Run only through `npm run test:rules`
// (wrapped in `firebase emulators:exec`), never directly.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.js'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
```

- [ ] **Step 5: Add scripts to `package.json`**

Add inside `"scripts"`, after `"migrate"`:

```json
    "test:rules": "firebase emulators:exec --only firestore --project demo-afmpt \"vitest run --config vitest.rules.config.js\""
```

(Keep the comma after the `"migrate"` line valid JSON.)

- [ ] **Step 6: Create `tests/rules/helpers.js`**

```js
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
```

- [ ] **Step 7: Create `tests/rules/baseline.test.js`** (pins *current* behaviour; all must pass on today's rules)

```js
import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { asUser, asAnonymous, seedDoc, resetData, cleanup } from './helpers.js';

const MEMBER = { uid: 'u_member', email: 'member@smartosc.com' };
const OUTSIDER = { uid: 'u_out', email: 'outsider@smartosc.com' };

describe('baseline: current rules', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc('workspaces/main', { seeded: true });
    await seedDoc('workspaces/main/projects/p1', {
      name: 'P1',
      memberIds: [MEMBER.uid],
      roles: { [MEMBER.uid]: 'owner' },
    });
  });
  afterAll(cleanup);

  it('domain user can read workspace meta', async () => {
    const db = await asUser(MEMBER.uid, MEMBER.email);
    await assertSucceeds(getDoc(doc(db, 'workspaces/main')));
  });

  it('non-domain user cannot read workspace meta', async () => {
    const db = await asUser('u_gmail', 'someone@gmail.com');
    await assertFails(getDoc(doc(db, 'workspaces/main')));
  });

  it('unverified domain email cannot read workspace meta', async () => {
    const db = await asUser('u_unv', 'member@smartosc.com', false);
    await assertFails(getDoc(doc(db, 'workspaces/main')));
  });

  it('anonymous cannot read workspace meta', async () => {
    const db = await asAnonymous();
    await assertFails(getDoc(doc(db, 'workspaces/main')));
  });

  it('project member can read the project', async () => {
    const db = await asUser(MEMBER.uid, MEMBER.email);
    await assertSucceeds(getDoc(doc(db, 'workspaces/main/projects/p1')));
  });

  it('domain non-member cannot read the project', async () => {
    const db = await asUser(OUTSIDER.uid, OUTSIDER.email);
    await assertFails(getDoc(doc(db, 'workspaces/main/projects/p1')));
  });
});
```

- [ ] **Step 8: Commit**

```bash
git add firebase.json vitest.rules.config.js tests/rules/helpers.js tests/rules/baseline.test.js package.json package-lock.json docs/superpowers/plans/2026-10-14-b0-b1-rules-ci-and-owner-lock.md
git commit -m "test(rules): add Firestore emulator test harness and baseline rules tests"
```

(These tests run for the first time in Task 2's CI, because the local machine has no Java.)

### Task 2: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: npm scripts `typecheck`, `test:rules` (Task 1).
- Produces: a required-able check named `ci / checks` on every PR and on push to `main`.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  checks:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      # Firestore emulator (firebase-tools 14) needs Java 21+
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      - run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Unit tests
        run: npm test --if-present

      - name: Firestore rules tests (emulator)
        run: npm run test:rules
```

- [ ] **Step 2: Commit and push, then open the PR**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run typecheck and Firestore rules tests on GitHub Actions"
git push -u origin ci/rules-tests
gh pr create --base main --head ci/rules-tests --title "ci: Firestore rules tests on GitHub Actions (B0)" --body "$(cat <<'EOF'
## Summary
B0: first automated tests for the project. Firestore rules tests run on the emulator in GitHub Actions, plus typecheck.

- `firebase.json`, `vitest.rules.config.js`, `tests/rules/` (baseline tests pinning current rules)
- `.github/workflows/ci.yml` (Node 22, Java 21, `npm run test:rules`)
- devDeps pinned: firebase-tools 14.27.0, @firebase/rules-unit-testing 4.0.1, vitest 2.1.9

## Data / rules impact
None. Rules file unchanged; emulator uses project `demo-afmpt`.

## Rollback
Revert this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch CI and verify it passes**

Run: `gh pr checks --watch`
Expected: `checks` passes. The log shows 6 passing tests in `tests/rules/baseline.test.js`.
If the emulator fails to start, read the full log (`gh run view --log-failed`) before changing anything.

- [ ] **Step 4: Prove the harness catches a failure** (temporary, not merged)

Change `assertFails` to `assertSucceeds` in the test `'domain non-member cannot read the project'`. Commit as `test: temp break`, push, and confirm CI goes **red** on exactly that test. Then:

```bash
git revert --no-edit HEAD && git push
```

Expected: CI is green again.

- [ ] **Step 5: Hand over for merge**

Ask HOD to merge the PR. **Do not start PR 2 until it is merged.**

---

## PR 2 — B1 (branch `fix/b1-owner-lock`)

> **BLOCKING precondition (verified 14/10/2026 from a Firebase Console screenshot).**
> - **Finding:** `workspaces/main.ownershipLog[0]` is `{action:'claim', to:'Hà Trương Thị Thu', ts:'2026-05-06…'}`, so `workspaceOwner` currently holds the **display name**, not an email.
> - **Why it blocks:** the B1 app accepts only email owners, and the B1 rules do the same. Merging as-is would remove the HOD's owner UI and owner rights.
> - **Before merging PR 2, HOD must** edit `workspaceOwner` in Firebase Console → Firestore → `workspaces/main` to exactly `hattt4@smartosc.com`.
> - **Why it is safe now:** today's app accepts both name and email, so HOD keeps owner rights.
> - **Then confirm:** the user menu still shows "You (Hà Trương Thị Thu)" + Transfer.
> - **Leave `ownershipLog` unchanged** (history).

### Task 3: Lock owner fields in rules (TDD on CI)

**Files:**
- Create: `tests/rules/workspace-owner.test.js`
- Modify: `firestore.rules:59-63` (the `match /workspaces/{workspace}` block and its helper functions)
- Modify: `docs/DESIGN.md` (B1 row of §5)

**Interfaces:**
- Consumes: `asUser`, `seedDoc`, `resetData`, `cleanup` from `tests/rules/helpers.js`.
- Produces: rule behaviour relied on by Task 5's UI:
  - Only the current owner (case-insensitive email) may change `workspaceOwner`, `ownershipLog` or `defaultView`.
  - The new owner must be a `@smartosc.com` email.
  - Delete is denied.
  - Create may not set owner fields.

- [ ] **Step 1: Branch from updated main**

```bash
git switch main && git pull --ff-only && git switch -c fix/b1-owner-lock
```

- [ ] **Step 2: Write the failing tests** — create `tests/rules/workspace-owner.test.js`

```js
import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const USER = { uid: 'u_user', email: 'staff@smartosc.com' };
const META = 'workspaces/main';

const baseMeta = () => ({
  seeded: true,
  workspaceOwner: OWNER.email,
  ownershipLog: [{ id: 'own_1', action: 'claim', to: OWNER.email }],
  defaultView: 'my-work',
  userPreferences: {},
});

describe('B1: workspace owner fields are owner-only', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(META, baseMeta());
  });
  afterAll(cleanup);

  it('B1-1 non-owner cannot set workspaceOwner to themselves', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertFails(updateDoc(doc(db, META), { workspaceOwner: USER.email }));
  });

  it('B1-2 non-owner cannot append to ownershipLog', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertFails(updateDoc(doc(db, META), {
      ownershipLog: [...baseMeta().ownershipLog, { id: 'own_2', action: 'claim', to: USER.email }],
    }));
  });

  it('B1-3 non-owner cannot change defaultView', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertFails(updateDoc(doc(db, META), { defaultView: 'gantt' }));
  });

  it('B1-4 non-owner stale full-meta merge (same owner fields) still succeeds', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertSucceeds(setDoc(doc(db, META), {
      ...baseMeta(),
      userPreferences: { Staff: { lastSeenMyWorkAt: '2026-10-14T00:00:00Z' } },
    }, { merge: true }));
  });

  it('B1-5 owner can transfer to another smartosc email', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertSucceeds(updateDoc(doc(db, META), {
      workspaceOwner: USER.email,
      ownershipLog: [...baseMeta().ownershipLog, { id: 'own_2', action: 'transfer', to: USER.email }],
    }));
  });

  it('B1-6 owner cannot release (set owner to null or empty)', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertFails(updateDoc(doc(db, META), { workspaceOwner: null }));
    await assertFails(updateDoc(doc(db, META), { workspaceOwner: '' }));
  });

  it('B1-7 nobody can claim an ownerless workspace from the client', async () => {
    await seedDoc(META, { seeded: true, userPreferences: {} });
    const db = await asUser(USER.uid, USER.email);
    await assertFails(updateDoc(doc(db, META), { workspaceOwner: USER.email }));
  });

  it('B1-8 owner cannot transfer to a non-domain email', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertFails(updateDoc(doc(db, META), { workspaceOwner: 'x@gmail.com' }));
  });

  it('B1-9 owner match is case-insensitive', async () => {
    await seedDoc(META, { ...baseMeta(), workspaceOwner: 'HaTTT4@SmartOSC.com' });
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertSucceeds(updateDoc(doc(db, META), { defaultView: 'gantt' }));
  });

  it('B1-10 owner can change defaultView', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertSucceeds(updateDoc(doc(db, META), { defaultView: 'gantt' }));
  });

  it('B1-11 nobody can delete the workspace doc', async () => {
    const db = await asUser(OWNER.uid, OWNER.email);
    await assertFails(deleteDoc(doc(db, META)));
  });

  it('B1-12 create may not set owner fields; plain create is allowed', async () => {
    await resetData();
    const db = await asUser(USER.uid, USER.email);
    await assertFails(setDoc(doc(db, META), { seeded: true, workspaceOwner: USER.email }));
    await assertSucceeds(setDoc(doc(db, META), { seeded: true }));
  });

  it('B1-13 domain user can still read meta', async () => {
    const db = await asUser(USER.uid, USER.email);
    await assertSucceeds(getDoc(doc(db, META)));
  });
});
```

- [ ] **Step 3: Push and verify the tests fail on current rules**

```bash
git add tests/rules/workspace-owner.test.js
git commit -m "test(rules): B1 workspace-owner lock tests (expected to fail on current rules)"
git push -u origin fix/b1-owner-lock
gh pr create --draft --base main --head fix/b1-owner-lock --title "fix(rules): lock workspace owner fields (B1)" --body "WIP — see plan docs/superpowers/plans/2026-10-14-b0-b1-rules-ci-and-owner-lock.md"
gh pr checks --watch
```

Expected: CI **red**.
- Fail on current rules, because every domain user may write: B1-1, B1-2, B1-3, B1-6, B1-7, B1-8, B1-11, and the first assert of B1-12.
- Already pass: B1-4, B1-5, B1-9, B1-10, B1-13.
- The proof that matters is that **B1-1 fails**.

- [ ] **Step 4: Implement the rule** — in `firestore.rules`, replace exactly these lines:

```
    // ─────── Workspace meta (just a marker doc; project list is queried directly) ───────
    match /workspaces/{workspace} {
      allow read, write: if isSmartOSC() && workspace == 'main';
    }
```

with:

```
    // ─────── Workspace meta ───────
    // B1 (2026-10-14): owner fields are owner-only. Any domain user may still
    // write the rest of the doc (userPreferences, seeded, updatedAt…) because
    // saveMeta() sends the whole meta object with merge:true; unchanged keys
    // are not "affected" so stale-but-identical owner fields pass.
    // There is no client-side claim or release: ownerless recovery is an
    // admin-script operation (see CLAUDE.md Rollback).
    function ownerFields() {
      return ['workspaceOwner', 'ownershipLog', 'defaultView'];
    }

    function isWorkspaceOwner() {
      return resource.data.get('workspaceOwner', null) is string
        && resource.data.workspaceOwner.lower() == request.auth.token.email.lower();
    }

    function newOwnerIsValid() {
      return request.resource.data.get('workspaceOwner', null) is string
        && request.resource.data.workspaceOwner.lower().matches('.*@smartosc[.]com$');
    }

    match /workspaces/{workspace} {
      allow read: if isSmartOSC() && workspace == 'main';

      allow create: if isSmartOSC() && workspace == 'main'
        && !request.resource.data.keys().hasAny(ownerFields());

      allow update: if isSmartOSC() && workspace == 'main' && (
        !request.resource.data.diff(resource.data).affectedKeys().hasAny(ownerFields())
        || (isWorkspaceOwner() && newOwnerIsValid())
      );

      allow delete: if false;
    }
```

Also update the header comment line `// Deploy via Firebase Console → Firestore Database → Rules → Publish.` to:

```
// Deploy: firebase deploy --only firestore:rules --project <prod project id>
// (or paste in Firebase Console → Firestore Database → Rules) — only after CI is green.
```

- [ ] **Step 5: Push and verify all tests pass**

```bash
git add firestore.rules
git commit -m "fix(rules): only the workspace owner can change owner fields (B1)"
git push
gh pr checks --watch
```

Expected: CI green. All 13 B1 tests and 6 baseline tests pass.

- [ ] **Step 6: Correct the DESIGN note** — in `docs/DESIGN.md` §5, row B1, replace:

```
**dialog Transfer phải lưu email** (hiện lưu tên hiển thị: `TransferOwnerDialog` ~12296 `value={m.name}` → `changeOwnership('transfer', newOwner)` 13761)
```

with:

```
**dialog Transfer chỉ liệt kê người có email** (hiện đã ưu tiên email `picked?.email || pickedName` ~12313, nhưng rơi về tên khi team member không có email)
```

```bash
git add docs/DESIGN.md
git commit -m "docs(design): correct B1 transfer note"
```

### Task 4: Pure owner helpers with unit tests

**Files:**
- Create: `src/ownership.js`, `tests/unit/ownership.test.js`, `vitest.config.js`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces:
  - `isWorkspaceOwnerEmail(workspaceOwner: string|null|undefined, email: string|null|undefined): boolean`
  - `transferCandidates(projects: Record<string,{teamMembers?: {name:string,email?:string}[]}>, teamMembers: {name:string,email?:string}[], currentOwner: string|null): {name:string,email:string}[]` (email-only, deduped by lowercase email, excludes current owner, sorted by name)

- [ ] **Step 1: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

// Pure unit tests (no emulator). Rules tests use vitest.rules.config.js.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
```

- [ ] **Step 2: Add the script** — in `package.json` `"scripts"`, add:

```json
    "test": "vitest run",
```

- [ ] **Step 3: Write the failing tests** — create `tests/unit/ownership.test.js`

```js
import { describe, it, expect } from 'vitest';
import { isWorkspaceOwnerEmail, transferCandidates } from '../../src/ownership.js';

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
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../../src/ownership.js"`.

- [ ] **Step 5: Implement `src/ownership.js`**

```js
// Workspace-owner helpers (B1). Pure functions; owner identity is a verified
// email compared case-insensitively. Display names are never accepted.

const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

export function isWorkspaceOwnerEmail(workspaceOwner, email) {
  const owner = norm(workspaceOwner);
  const me = norm(email);
  return owner !== '' && me !== '' && owner.includes('@') && owner === me;
}

export function transferCandidates(projects, teamMembers, currentOwner) {
  const owner = norm(currentOwner);
  const byEmail = new Map();
  const add = (m) => {
    const email = norm(m && m.email);
    if (!email || !email.includes('@') || email === owner || byEmail.has(email)) return;
    byEmail.set(email, { name: m.name || email, email });
  };
  for (const p of Object.values(projects || {})) for (const m of p.teamMembers || []) add(m);
  for (const m of teamMembers || []) add(m);
  return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npm test`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.js package.json src/ownership.js tests/unit/ownership.test.js
git commit -m "feat(owner): pure helpers for email-only owner check and transfer candidates"
```

### Task 5: Wire the UI to email-only ownership

**Files:**
- Modify: `src/App.jsx` — import (after line 17), `isOwner` (~12445-12452), `TransferOwnerDialog` (~12272-12318), owner menu (~13660-13686)

**Interfaces:**
- Consumes: `isWorkspaceOwnerEmail`, `transferCandidates` from `src/ownership.js` (Task 4).

- [ ] **Step 1: Add the import** — after the line `import { validateWebhookUrl, buildTestText, postToChat, ...} from './chatNotify';` add:

```js
import { isWorkspaceOwnerEmail, transferCandidates } from './ownership';
```

- [ ] **Step 2: Replace the owner check** — replace:

```js
  // Owner check prefers verified Firebase email (authUser.email) over the
  // display-name in localStorage (which a malicious user could spoof). For
  // backward compat, also accept legacy claims that wrote display name.
  const verifiedEmail = authUser?.email || authorEmail || null;
  const isOwner = !!(meta?.workspaceOwner && (
    (verifiedEmail && meta.workspaceOwner === verifiedEmail) ||
    (author && meta.workspaceOwner === author)
  ));
```

with:

```js
  // B1: owner = verified Firebase email only (case-insensitive). Display-name
  // claims are no longer accepted; Firestore rules enforce the same.
  const verifiedEmail = authUser?.email || authorEmail || null;
  const isOwner = isWorkspaceOwnerEmail(meta?.workspaceOwner, verifiedEmail);
```

- [ ] **Step 3: Rewrite `TransferOwnerDialog` to email-only.** Replace the body from `const [pickedName, setPickedName] = useState('');` through the closing `</Modal>` of that function with:

```jsx
  const [pickedEmail, setPickedEmail] = useState('');
  const [typedConfirm, setTypedConfirm] = useState('');
  const candidates = useMemo(
    () => transferCandidates(projects, teamMembers, currentOwner),
    [teamMembers, currentOwner, projects]
  );
  const picked = candidates.find((c) => c.email === pickedEmail) || null;
  const canTransfer = !!picked && typedConfirm.trim().toLowerCase() === picked.email;
  return (
    <Modal title="Transfer workspace owner" onClose={onClose} width={460}>
      <div style={{ padding: 10, background: TOK.healthAmberBg, color: TOK.healthAmber, borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
        Transfer is permanent. The new owner gains full workspace access; you become a regular user. Audit trail is logged.
      </div>
      <FieldLabel>New owner</FieldLabel>
      <select value={pickedEmail} onChange={(e) => { setPickedEmail(e.target.value); setTypedConfirm(''); }}
        style={{ fontFamily: FONT_STACK, fontSize: 13, padding: '7px 26px 7px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, width: '100%' }}>
        <option value="">— pick a teammate —</option>
        {candidates.map((m) => <option key={m.email} value={m.email}>{m.name} ({m.email})</option>)}
      </select>
      {candidates.length === 0 && (
        <div style={{ fontSize: 11, color: TOK.muted, marginTop: 6 }}>
          No teammate with an email address. Add emails in Project Settings → Team members first.
        </div>
      )}
      {picked && (
        <>
          <div style={{ height: 14 }} />
          <FieldLabel>Type the recipient's email to confirm</FieldLabel>
          <Input value={typedConfirm} onChange={setTypedConfirm} placeholder={picked.email} />
        </>
      )}
      <div style={{ marginTop: 16, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={!canTransfer} onClick={() => onTransfer(picked.email)}>Transfer ownership</Btn>
      </div>
    </Modal>
```

(Keep the function signature line `function TransferOwnerDialog({ teamMembers, currentOwner, projects, onClose, onTransfer }) {` and its closing `}` unchanged.)

- [ ] **Step 4: Remove Release.** In the owner menu, replace:

```jsx
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn size="sm" onClick={async () => {
                          setUserMenuOpen(false);
                          setShowTransferOwner(true);
                        }}>Transfer</Btn>
                        <Btn size="sm" variant="ghost" onClick={async () => {
                          const ok = await dialogs.confirm({ title: 'Release ownership?', message: 'You will give up workspace owner role. The workspace will have no owner until someone claims it.', danger: true, okLabel: 'Release' });
                          if (!ok) return;
                          setUserMenuOpen(false);
                          await changeOwnership('release', null);
                          showToast('Released workspace ownership');
                        }}>Release</Btn>
                      </div>
```

with:

```jsx
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn size="sm" onClick={async () => {
                          setUserMenuOpen(false);
                          setShowTransferOwner(true);
                        }}>Transfer</Btn>
                      </div>
```

- [ ] **Step 5: Replace the client-side claim button.** Replace:

```jsx
                  <Btn size="sm" variant="primary" onClick={async () => {
                    const ok = await dialogs.confirm({ title: 'Become workspace owner?', message: `You'll be able to access the Portfolio view, send weekly digests, and transfer ownership later. All ownership changes are logged.`, okLabel: 'Become owner' });
                    if (!ok) return;
                    setUserMenuOpen(false);
                    await changeOwnership('claim', authUser?.email || author);
                    showToast(`You are now the workspace owner`);
                  }}>Become owner</Btn>
```

with:

```jsx
                  <div style={{ fontSize: 11, color: TOK.muted }}>
                    No workspace owner set. Ask the admin to assign one.
                  </div>
```

- [ ] **Step 6: Verify the build, lint and tests**

```bash
npm run typecheck
npm run build
npm test
npx eslint src --format compact | grep -c "Error -"
```

Expected:
- `typecheck` is clean.
- `build` produces `dist/`.
- `npm test` shows 7 passed.
- The error count is **6** (unchanged; lint must not increase).

Then confirm no leftover references:

```bash
grep -n "changeOwnership('release'\|changeOwnership('claim'\|meta.workspaceOwner === author\|pickedName" src/App.jsx
```

Expected: no output.

- [ ] **Step 7: Commit, push, mark the PR ready**

```bash
git add src/App.jsx
git commit -m "fix(owner): email-only owner check, email-only transfer, remove release and client claim (B1)"
git push
gh pr checks --watch
gh pr ready
```

Expected: CI green (typecheck, 7 unit tests, 19 rules tests).

### Task 6: PR description, deploy runbook, status

**Files:**
- Modify: `CLAUDE.md` (Current Status; Rollback row for ownerless recovery)

- [ ] **Step 1: Update `CLAUDE.md` Rollback table** — add the row:

```
| Workspace mất owner / owner lưu sai | Firebase Console → Firestore → `workspaces/main` → sửa tay `workspaceOwner` = email owner (chữ thường), hoặc script Admin SDK. Client không claim được nữa (B1) | HOD |
```

- [ ] **Step 2: Update `CLAUDE.md` Current Status** — replace the `- Đang làm:` and `- Tiếp theo:` lines with:

```
- Đang làm: B1 — PR `fix/b1-owner-lock` chờ HOD duyệt; sau merge HOD deploy rules (runbook trong PR)
- Tiếp theo: B2 báo lỗi khi lưu thất bại (+ chặn reset ACL) → B3 cảnh báo lưu đè → B4
```

```bash
git add CLAUDE.md
git commit -m "docs: B1 status and ownerless-recovery rollback"
git push
```

- [ ] **Step 3: Write the PR description** (`gh pr edit --body`) with these sections:
  - **Summary:** rules lock owner fields; UI uses email-only owner, email-only transfer, no Release, no client claim.
  - **Rules impact (yes).**
  - **Pre-deploy check (HOD):** Firebase Console → Firestore → `workspaces/main` → `workspaceOwner` must be exactly `hattt4@smartosc.com`. If it is a display name, edit it to the email **before** deploying.
  - **Deploy order:**
    1. Merge, which auto-deploys the app on Vercel.
    2. HOD deploys the rules. Either run `npx firebase-tools@14.27.0 deploy --only firestore:rules --project <prod id>` after `firebase login`, or paste `firestore.rules` into Console → Rules → Publish.
  - **Verify on production:**
    - (a) Console → Rules → **Rules Playground**: simulate `update` on `/workspaces/main` with authenticated email `someone@smartosc.com` (email_verified true), data `{workspaceOwner: "someone@smartosc.com"}` → **Denied**. The same with `hattt4@smartosc.com` and `{defaultView: "gantt"}` → **Allowed**.
    - (b) App: the user menu shows Transfer only (no Release). Change Default landing view and reload; it persists.
    - (c) A colleague's account: switching projects still works; the Owner menu shows "Owner-only changes".
  - **Rollback:**
    - Rules: re-publish the previous `firestore.rules` from `main@ff36322` (`git show ff36322:firestore.rules`).
    - App: Vercel → Promote the previous deployment, then `git revert` the merge.

---

## Self-review notes

- **Spec coverage:**
  - DESIGN §5 B1 (owner-only owner fields, no name match, transfer by email): Tasks 3 and 5.
  - Round-2 decision 6 (hide Release): Task 5 Step 4.
  - Decision 11 (rules tests on GitHub Actions before deploy): Tasks 1–2, plus the Task 6 deploy gate.
  - CLAUDE.md "no rules deploy without green emulator tests + keep old rules": Task 6 rollback.
- **Out of scope** (later phases, deliberately not here):
  - `ownerUids[]` (P2)
  - uid identity (P1)
  - save-failure toasts (B2). Until B2, a rejected owner-field write by a non-owner is still silent, but the UI no longer offers any such control.
- **Review Focus coverage:**

  | Item | Pinned by |
  |---|---|
  | 1 | B1-4 |
  | 2 | B1-9 + unit `isWorkspaceOwnerEmail` case test |
  | 3 | B1-7 + Task 5 Step 5 |
  | 4 | B1-6, B1-8 |
  | 5 | unit `transferCandidates` tests |
