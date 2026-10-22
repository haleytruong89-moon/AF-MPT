# P1 — Identity Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every person shows as exactly one row in Activity Dashboard, Team and Credit, through an Owner-managed directory, and new entries are written with the canonical name.

**Architecture:** A canonical directory lives in Firestore: `workspaces/main/members/{uid}` for people who have signed in, and `invites/{email}` for people who have not. Each entry carries `aliases[]`, built from the HOD-approved mapping that PR #6's dry-run produces. The app builds an alias index from the directory and resolves every person string at **read time** (`canonicalPerson`). P1 does **not** rewrite project data. P2 converts the stored strings to uids with the same index. Write paths (pickers, Excel import) store the canonical display name from now on.

**Tech Stack:** React 18 + Vite (`App.jsx` monolith, JS), Firestore client SDK v11, Firebase Admin SDK (scripts), SheetJS, Vitest, `@firebase/rules-unit-testing` on the Emulator (CI only).

**Spec:**
- `docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md`: §2.1 decision 5, §7 (`members` / `invites`), §9 M1.
- `docs/DESIGN.md`: §6.1, the root cause of "one person, two rows".
- `docs/SPEC.md`: §8, acceptance criterion 3.

## Global Constraints

- Identity key in P1 = **lower-cased email**. `members/{uid}` = `{ email, displayName, aliases[], department, status: 'active'|'deactivated', updatedAt, updatedBy }`. `invites/{email}` has the same shape without the uid.
- **Q4 (HOD, 22/10):** HOD supplies the master roster (email, display name, department). Only the Workspace Owner adds, edits or deactivates entries. No automatic add on sign-in.
- **Q5 (HOD, 22/10):** no `pmoTag` in P1.
- Workspace Owner = `workspaces/main.workspaceOwner` (email, compared lower-cased). This is the B1 rule. `ownerUids[]` comes in P2.
- **Not allowed in P1:**
  - No rewrite of `pic` / `author` / `creditShares` strings in project docs.
  - No change to project or activity rules.
  - No mass refactor of `App.jsx`. Each change is local to the named function.
- **Production data writes:** only through `scripts/p1-build-directory.mjs --apply`, after HOD approves its preview file. HOD exports Backup JSON + Excel first.
- **Rules:** the rules change ships only with green emulator tests in CI. The previous rules stay in git for rollback.
- **Language:** UI labels in English. Code, comments and commits in English.
- **Lint:** must stay at ≤ 6 errors / 63 warnings.
- **Gitignore** (people data): `p1-roster*.xlsx`, `p1-identity-mapping*.xlsx`, `p1-directory-preview*.xlsx`, `p1-directory-manifest*.json`.

## Review Focus

1. **Alias collisions.** The same alias (after diacritic folding) is mapped to two emails. Expected: the build script refuses to apply and lists the conflict; it never picks one.
2. **Directory load failure or empty directory.** Expected: the app falls back to today's behaviour (raw strings) with no crash and no blank dashboards.
3. **Deactivated person.** Their history still resolves to their canonical name, but they no longer appear in pickers.
4. **Someone signs in after P1 with an invite.** Their self-claim creates `members/{uid}` with the invite's exact fields. They cannot claim another email or change their own department or status.
5. **Mapping rows marked as groups (Legal, AF…).** Expected: they pass through unchanged, are never turned into a person, and are not counted as people in Team.

---

### Task 1: Pure alias index (`src/directory.js`)

**Files:**
- Create: `src/directory.js`
- Test: `tests/unit/directory.test.js`

**Interfaces:**
- Consumes: `foldName(s: string): string` from `src/identity.js`.
- Produces:
  - `buildDirectoryIndex(entries: Array<{email, displayName, aliases?: string[], status?: string}>): DirectoryIndex`. `DirectoryIndex` is `{ byKey: Map<string, Person>, people: Person[], conflicts: Array<{alias, emails: string[]}> }`.
  - `Person` is `{ id: email, email, name: displayName, active: boolean }`.
  - Index keys:
    - the lower-cased email;
    - the email local-part;
    - `foldName(displayName)`;
    - `foldName(alias)` for each alias.
  - `canonicalPerson(index: DirectoryIndex | null, raw: string): { id: string, name: string, known: boolean }`.
    - Known: returns the person's `id` (email) and `name`.
    - Unknown, or the index is null: returns `{ id: 'n:' + foldName(raw), name: raw.trim(), known: false }`.
  - `pickerPeople(index): Person[]`: active people only, sorted by name with `localeCompare('vi')`.

- [ ] **Step 1: Write the failing tests**

```js
const idx = buildDirectoryIndex([
  { email: 'HATTT4@smartosc.com', displayName: 'Hà Trương Thị Thu', aliases: ['Thu HOD'] },
  { email: 'lannt@smartosc.com', displayName: 'Lan Nguyen', status: 'deactivated' },
]);
it('resolves email, local-part, display name, folded name and alias to one id', () => {
  for (const raw of ['hattt4@smartosc.com', 'hattt4', 'Hà Trương Thị Thu', 'HA TRUONG THI THU', 'thu hod'])
    expect(canonicalPerson(idx, raw)).toEqual({ id: 'hattt4@smartosc.com', name: 'Hà Trương Thị Thu', known: true });
});
it('passes unknown strings and groups through with a stable name key', () => {
  expect(canonicalPerson(idx, ' Legal ')).toEqual({ id: 'n:legal', name: 'Legal', known: false });
  expect(canonicalPerson(null, 'Lan')).toEqual({ id: 'n:lan', name: 'Lan', known: false });
});
it('keeps deactivated people resolvable but out of pickers', () => {
  expect(canonicalPerson(idx, 'lannt@smartosc.com').known).toBe(true);
  expect(pickerPeople(idx).map((p) => p.email)).toEqual(['hattt4@smartosc.com']);
});
it('reports an alias that points to two emails and resolves neither', () => {
  const bad = buildDirectoryIndex([
    { email: 'a@smartosc.com', displayName: 'Minh Le' }, { email: 'b@smartosc.com', displayName: 'Minh Lê' },
  ]);
  expect(bad.conflicts).toEqual([{ alias: 'minh le', emails: ['a@smartosc.com', 'b@smartosc.com'] }]);
  expect(canonicalPerson(bad, 'Minh Le').known).toBe(false);
});
```

- [ ] **Step 2: Run `npx vitest run tests/unit/directory.test.js`.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement the three exports in `src/directory.js`.** A key that more than one email claims goes into `conflicts` and is removed from `byKey`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(directory): alias index and canonicalPerson (P1)`.

### Task 2: Rules for `members` and `invites`

**Files:**
- Modify: `firestore.rules`. Add inside `service cloud.firestore`, next to the workspace block.
- Test: `tests/rules/directory.test.js`. Use the `asUser` / `seedDoc` / `resetData` helpers from `tests/rules/helpers.js`.

**Interfaces:**
- Produces: the rules contract that Task 4 (claim) and Task 5 (Owner edits) rely on.
  - **Read** `workspaces/main/members/{uid}` and `workspaces/main/invites/{email}`: any `isSmartOSC()` user.
  - **Create / update / delete:** only when `get(/databases/$(database)/documents/workspaces/main).data.workspaceOwner.lower() == request.auth.token.email.lower()`.
  - **Self-claim:**
    - Allowed: `create` of `members/{uid}` when `uid == request.auth.uid`, `exists(.../invites/$(request.auth.token.email.lower()))`, and `request.resource.data` equals the invite's `email, displayName, aliases, department` with `status == 'active'`.
    - Not allowed: any other self-write.

- [ ] **Step 1: Write the failing tests.** Each line below is one `it`. Seed `workspaces/main` with `workspaceOwner: 'hattt4@smartosc.com'`.
  - Owner creates, updates and deletes `members/u_x` and `invites/x@smartosc.com`: succeeds.
  - Staff user reads both collections: succeeds. Staff user creates or updates someone else's entry: fails.
  - Staff `new@smartosc.com` with `invites/new@smartosc.com` seeded creates `members/<own uid>` with identical fields and `status: 'active'`: succeeds.
  - The same claim with a changed `department`, or with `status: 'deactivated'`: fails.
  - Claim to `members/<other uid>`: fails. Claim with no matching invite: fails.
  - Gmail user reads `members`: fails.
- [ ] **Step 2: Push the branch; CI runs `npm run test:rules`.** Expected: the new tests FAIL (no Java on the dev machine).
- [ ] **Step 3: Add the two `match` blocks with the functions above.**
- [ ] **Step 4: Push again.** Expected: CI green, including `baseline.test.js` and `workspace-owner.test.js`.
- [ ] **Step 5: Commit:** `feat(rules): Owner-managed members/invites directory with invite self-claim (P1)`.

### Task 3: Build script, preview first (`scripts/p1-build-directory.mjs`)

**Files:**
- Create: `scripts/p1-build-directory.mjs`
- Modify:
  - `package.json`: add the script `"p1:directory": "node scripts/p1-build-directory.mjs"`.
  - `.gitignore`: add the patterns from Global Constraints.
- Test: `tests/unit/p1-build-directory.test.js`
- Do **not** start the file with a shebang. With a CRLF checkout, Vite fails to parse it on Windows (same as the PR #6 fix).

**Interfaces:**
- Consumes: `buildDirectoryIndex` (Task 1). Mapping sheet `Mapping` from PR #6, with columns `Value in data`, `HOD: final email`, `HOD: is group (Y)`.
- Roster file `p1-roster.xlsx`: sheet `Roster` with columns `Email`, `Display name`, `Department`.
- Produces: `planDirectory(rosterRows, mappingRows, uidByEmail: Map<string,string>)`, returning `{ members: Array<{uid, data}>, invites: Array<{email, data}>, errors: string[], unmapped: string[] }`.
  - `data` holds the Global Constraints fields. `updatedBy` = `'p1-script'`.
  - Aliases for an email = every `Value in data` whose `HOD: final email` equals that email (lower-cased), minus the display name itself.
  - Rows with `HOD: is group = Y` are skipped.
  - Rows with an empty final email go to `unmapped`.
- CLI:
  - `node scripts/p1-build-directory.mjs <roster.xlsx> <mapping.xlsx> [--apply] [--key service-account.json]`.
  - **Without `--apply`:** Admin SDK reads only. It looks up uids from `workspaces/main/users` by `email`, then writes `p1-directory-preview.xlsx` with sheets `Members`, `Invites`, `Errors`, `Unmapped`. It writes nothing to Firestore.
  - **With `--apply`:** refuses when `errors.length > 0`. Writes every doc with a `set`, so a rerun is idempotent. Saves `p1-directory-manifest-<timestamp>.json` with every path written.
  - **`--rollback <manifest>`:** deletes exactly those paths.

- [ ] **Step 1: Write the failing tests for `planDirectory`.**
  - A roster email with a uid lands in `members`; one without a uid lands in `invites`.
  - Aliases are collected from mapping rows and exclude the display name.
  - Group rows are skipped.
  - A mapping row whose final email is not in the roster → `errors` contains `"<value> → <email>: email not in roster"`.
  - Two roster rows whose names fold the same → `errors` contains the alias conflict from `buildDirectoryIndex`.
  - An empty final email → `unmapped`.
- [ ] **Step 2: Run `npx vitest run tests/unit/p1-build-directory.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement `planDirectory` (exported) and the CLI.** Guard the CLI with the same `isMain` check as `p1-identity-dryrun.mjs`. Initialise Admin the same way as `scripts/migrate.js`.
- [ ] **Step 4: Run the tests.** Expected: PASS. Also run the CLI on fixture xlsx files built in the test, with no `--apply` and no key. Expected: it exits with `Missing service-account key` before reading Firestore.
- [ ] **Step 5: Commit:** `feat(scripts): P1 directory build with preview, apply and rollback`.

### Task 4: Load the directory in the app and claim invites

**Files:**
- Modify: `src/data.ts`. Add next to `useUserDirectory()`.
- Modify: `src/App.jsx`, inside `App()` only: the hook call and the memo.

**Interfaces:**
- Produces:
  - `useWorkspaceDirectory(): { entries: DirectoryEntry[], ready: boolean, error: string | null }`. It reads `members` and `invites` once with `getDocs`; no live listener. On error it sets `error`, keeps `entries: []`, and logs a warning.
  - **Claim:** after the first load, if the signed-in user has no `members/{uid}` but `invites/{email}` exists, it creates `members/{uid}` from the invite (the Task 2 contract), then reloads. A failed claim is ignored; the invite still resolves the person.
  - In `App()`: `const dirIndex = useMemo(() => (dirEntries.length ? buildDirectoryIndex(dirEntries) : null), [dirEntries])`. Later tasks pass `dirIndex` down.

- [ ] **Step 1: Implement `useWorkspaceDirectory` and wire `dirIndex` into `App()`.**
- [ ] **Step 2: Run `npm run build` and `npm run lint`.** Expected: build OK; lint ≤ 6 errors / 63 warnings.
- [ ] **Step 3: Commit:** `feat(directory): load members/invites and self-claim invite on sign-in`.

### Task 5: Read-time canonicalization in dashboards (criterion 3)

**Files:**
- Modify: `src/App.jsx`. Change only the functions named below; find each with `grep -n "^function <name>"`.
- Test: `tests/unit/directory.test.js`. Add the merge test below.

**Interfaces:**
- Consumes: `canonicalPerson`, `dirIndex`.
- Each function gains a trailing optional parameter `dirIndex = null`. With `null`, the output is exactly today's output.
  - `computeActivityIndex` and `computeActivityIndexWithTrend`: `ensure(pic)` keys on `canonicalPerson(dirIndex, pic).id` and displays `.name`.
  - `getEffectiveCreditShares` and `computeProjectCredits`: shares are summed per canonical id.
  - `computeTeamOverview` and `getLastActivityForMember`: match people by canonical id.
  - `deriveTeamMembers`: when `dirIndex` is set, the roster is `pickerPeople(dirIndex)`, plus unknown observed names that are not groups. Observed emails no longer become separate members.
- Pass `dirIndex` at every call site of these functions.

- [ ] **Step 1: Add a failing unit test.** Two task PICs `'hattt4@smartosc.com'` and `'Ha Truong Thi Thu'`, run through a small exported helper `groupByPerson(values, dirIndex)` in `src/directory.js`, give one group with count 2. Every function above uses this helper for its own grouping.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `groupByPerson`, then thread `dirIndex` through the functions above.**
- [ ] **Step 4: Run `npx vitest run`, `npm run build` and `npm run lint`.** Expected: all pass; lint unchanged.
- [ ] **Step 5: Commit:** `fix(identity): one row per person in Activity, Team and Credit via directory (P1)`.

### Task 6: Write paths store the canonical name

**Files:**
- Modify: `src/App.jsx`:
  - `resolvePicValue`;
  - `parseExcelFile`, the `pic` column;
  - every `<select>` / free-text PIC handler that skips `resolvePicValue`. DESIGN §6.1 lists them: action PIC, mitigation PIC, subtask PIC, the RAID / My Work selects, and `addContributor`. Find each by grepping `pic:` setters near those components.

**Interfaces:**
- `resolvePicValue(input, teamMembersList, dirIndex = null)`. When `dirIndex` is set, it returns `canonicalPerson(dirIndex, input).name`. Otherwise it keeps today's behaviour.

- [ ] **Step 1: Add a failing test.** Add a small `canonicalName(dirIndex, raw)` export to `src/directory.js` (`.name` of `canonicalPerson`) and assert `canonicalName(idx, 'hattt4')` returns `'Hà Trương Thị Thu'`.
- [ ] **Step 2: Implement `canonicalName`, then route each listed write path through `resolvePicValue(…, dirIndex)`.**
- [ ] **Step 3: Run `npx vitest run`, `npm run build` and `npm run lint`.** Expected: pass; lint unchanged.
- [ ] **Step 4: Commit:** `fix(identity): pickers and Excel import write canonical names (P1)`.

### Task 7: Owner directory screen

**Files:**
- Create: `src/components/DirectoryModal.tsx`
- Modify: `src/App.jsx`. Add an Owner-only menu item **"People directory…"** next to **Settings**, and render the modal.

**Interfaces:**
- Props: `{ entries, dirIndex, onChanged(): void, onClose(): void }`.
- The table shows Name, Email, Department, Aliases, Status, and a search box.
- **Add person** writes `invites/{email}`. The email must end in `@smartosc.com` and must not already exist.
- **Edit** changes name, department and aliases (comma-separated). It refuses to save when `buildDirectoryIndex` reports a conflict, and names the conflict.
- **Deactivate / Reactivate** toggles `status`. Nothing is deleted.
- Every write sets `updatedAt: serverTimestamp()` and `updatedBy: <owner email>`. A failed write shows a toast, using the B2 pattern.

- [ ] **Step 1: Build the modal.** It writes through `setDoc` / `updateDoc` in `data.ts` helpers `upsertInvite(entry)`, `updateDirectoryEntry(path, fields)` and `setDirectoryStatus(path, status)`.
- [ ] **Step 2: Run `npm run build` and `npm run lint`.** Expected: pass.
- [ ] **Step 3: Commit:** `feat(directory): Owner people directory screen (P1)`.

### Task 8: Rollout runbook and PR

**Files:**
- Modify:
  - `CLAUDE.md`, Current Status: P1 state and the rollback row "Directory wrong → `--rollback <manifest>`".
  - `docs/DESIGN.md` §2: risk #11 → "P1: read-time".

- [ ] **Step 1: Write the PR description.** It contains this ordered runbook:
  1. HOD exports Backup JSON + Excel.
  2. Run the PR #6 dry-run. HOD fills the mapping and the roster.
  3. Run `p1:directory` without `--apply`. HOD approves the preview file.
  4. Merge the PR, then confirm CI is green on `main`.
  5. HOD publishes the rules from `main` via Console, keeping the 22/10 12:15 version for rollback.
  6. Run `--apply`.
  7. Check on production: Activity Dashboard, Team and Credit show one row for HOD and one for each person in the mapping. A teammate who has an invite signs in, and `members/{uid}` appears.
  8. Rollback, in order: `--rollback <manifest>`, then the Console rules version from 22/10 12:15, then Vercel *Promote* of the previous deploy.
- [ ] **Step 2: Open the PR with `Data / rules impact`.** Data impact: new `members` / `invites` docs only. Rules impact: two new match blocks.
