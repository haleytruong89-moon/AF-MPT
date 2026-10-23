# P2.1 — Foundations and Migration Dry-Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the v2 data model on real data without changing app behaviour.
- Pure functions split a v1 project into project / workstream / task / action docs, and assemble them back into the identical tree.
- A dry-run report and an assignment template are built from a Backup JSON.
- `ownerUids` is introduced.
- Additive Firestore rules (with emulator tests) are added for the new sub-collections.

**Architecture:**
- **`src/migrateV2.js` (pure):** `splitProject` and `assembleProject` are exact inverses. P2.2 reuses `assembleProject` as the adapter's read path, and P2.4 reuses `splitProject` for the real migration. People resolve to uid through the P1 directory (`canonicalPerson` → email → members doc id). The raw v1 strings are kept alongside the uid fields until P2.5.
- **Production writes:** the only production write in P2.1 is `workspaces/main.ownerUids`.
- **Rules:** the new match blocks for `workstreams` / `tasks` / `actions` / `activity` are additive. No client uses those paths yet.

**Tech Stack:** JS (Vitest), Firebase Admin SDK scripts, SheetJS, Firestore rules + `@firebase/rules-unit-testing` on the CI emulator.

**Spec:** `docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md` §3, §4, §7, §8, §9 (M2, M3). Roadmap: `docs/superpowers/plans/2026-10-23-p2-roadmap.md`.

## Global Constraints

- **HOD decisions (23/10):**
  - Q1: Decisions and RAID stay in the project doc. Owner or any PM/Sub-PM of the project may write them.
  - A2/A3: 1 PM + optional Deputy per program; 1 Sub-PM per workstream; an empty lead means the PM covers it.
  - A4: an Assignee may not set `Completed` or `Dropped`.
- **Workspace path:** `workspaces/{wid}` everywhere. AF is `wid = 'main'`. No hard-coded `'main'` inside new rules functions; take `wid` from the match path.
- **v2 doc fields:**
  - **Project doc keeps every v1 field untouched.** v2 adds:
    - `programMeta`: a map `{ [programId]: { name, order, pmUid, deputyUid, start, end } }`
    - `memberUids: string[]`
    - `visibility: 'restricted'` (default)
    - `schemaVersion: 2`, written only in P2.4
  - **`workstreams/{wsId}`:** `{ workspaceId, projectId, programId, name, order, leadUid, start, end, difficultyPreset?, difficultyMultiplier?, weight?, version: 1 }`
  - **`tasks/{taskId}`:** `{ workspaceId, projectId, programId, workstreamId, order, ...every v1 task field unchanged, picUid, picEmail, contributorUids, version: 1 }`
  - **`actions/{actionId}`:** `{ workspaceId, projectId, order, ...every v1 action field unchanged, picUid, picEmail, workstreamId, version: 1 }`
- **Person resolution:** raw → `canonicalPerson(dirIndex, raw)`.
  - Known person with a `members` entry → `picUid` = members doc id.
  - Known person who exists only as an invite → `picUid: null`, `picEmail` = email.
  - Unknown → both null, and the person is listed in the report.
  - The raw `pic` / `contributors` strings stay as they are.
- **No production writes** except `ownerUids`, through `scripts/p2-set-owner-uids.mjs` with the same preview → `--apply` → `--rollback` pattern as `p1-build-directory.mjs`, after HOD approval.
- **Lint and gitignore:**
  - Lint ≤ 6 errors / 63 warnings.
  - No shebang in scripts.
  - Gitignore `p2-*.xlsx` and `p2-*-manifest*.json`.

## Review Focus

1. **A v1 field that is absent, null or unusual** (task without `id`, workstream without tasks, program without workstreams, duplicate task ids across workstreams, tasks with `start/end: null`, `duration: null`) must round-trip exactly. Duplicate ids are reported, never silently merged.
2. **Order** of programs, workstreams, tasks and actions must survive split → assemble. Arrays are ordered; Firestore query results are not.
3. **People in fields other than `pic`** (contributors, creditShares keys, decidedBy, RAID owner, mitigation pic, subtask pic) stay as raw strings in P2. Only `pic`, `contributors` and action `pic` gain uid fields. The report must list every unresolved person in the uid-bearing fields.
4. **The rules for the new collections** must never let an Assignee set `Completed`/`Dropped`, change `programId`/`workstreamId`/`picUid`, or touch someone else's task. A Viewer of a `restricted` project must not be able to read it at all.
5. **`ownerUids` empty or missing** must not lock the Owner out during the transition. `isOwner` accepts `ownerUids` OR the legacy `workspaceOwner` email until P2.5.

---

### Task 1: `splitProject` / `assembleProject` (pure, round-trip)

**Files:**
- Create: `src/migrateV2.js`
- Test: `tests/unit/migrateV2.test.js`
- Test fixture: `tests/fixtures/v1-project.json`. Build it by hand to cover Review Focus 1–2: 2 programs; one program with 0 workstreams; one workstream with 0 tasks; tasks with null dates; one action with `relatedTaskId`, one without; RAID with mitigations.

**Interfaces:**
- Produces:
  - `splitProject(project, { wid, dirIndex, uidByEmail }) → { meta, workstreams: Array<{id, data}>, tasks: Array<{id, data}>, actions: Array<{id, data}>, report }`.
    - `meta` is the v1 project object with `programs` and `actionItems` **unchanged**, plus `programMeta` and `memberUids`. It does not set `visibility` or `schemaVersion`; P2.4 sets those.
    - `report` = `{ counts: {programs, workstreams, tasks, actions}, unresolved: Array<{field, raw, where}>, duplicateIds: string[] }`.
  - `assembleProject(meta, workstreams, tasks, actions) → project`. It rebuilds `programs[].workstreams[].tasks[]` and `actionItems[]` from the docs, sorted by `order`, and strips the v2-only fields (`workspaceId`, `projectId`, `programId`, `workstreamId`, `order`, `picUid`, `picEmail`, `contributorUids`, `version`, `leadUid`, workstream `start`/`end`).
  - `taskWorkstreamOf(project) → Map<taskId, {programId, workstreamId}>`. Used to fill an action's `workstreamId` from its `relatedTaskId`.
- **Ruling: workstream `start`/`end`** are `null` after the split. HOD sets them in the assignment template (Task 3). A null bound means "no limit" in the rules.

- [ ] **Step 1: Write failing tests.**
  - `assembleProject(...splitProject(fixture))` deep-equals the fixture with `programMeta` and `memberUids` removed.
  - Counts in `report` are correct.
  - A duplicate task id appears in `report.duplicateIds`.
  - `pic: 'Hà Trương Thị Thu'` with a directory where her email maps to `uid1` gives `picUid: 'uid1'`.
  - An invite-only person gives `picUid: null` and `picEmail` set.
  - An unknown name is listed in `report.unresolved`.
  - An action whose `relatedTaskId` is in WS w1 gets `workstreamId: 'w1'`.
  - `memberUids` = sorted unique uids found in `pic` / `contributors` / action `pic`, plus `project.memberIds`.
- [ ] **Step 2: Run `npx vitest run tests/unit/migrateV2.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement.** The `order` value is the array index.
- [ ] **Step 4: Run again.** Expected: PASS. Run the full suite and lint.
- [ ] **Step 5: Commit:** `feat(p2): pure split/assemble between v1 tree and v2 docs`.

### Task 2: Dry-run CLI on a Backup JSON

**Files:**
- Create: `scripts/p2-migrate-dryrun.mjs` (no shebang)
- Modify:
  - `package.json`: add the script `"p2:dryrun": "node scripts/p2-migrate-dryrun.mjs"`
  - `.gitignore`: add `p2-*.xlsx`
- Test: `tests/unit/p2-dryrun.test.js`

**Interfaces:**
- Consumes: `splitProject`, `assembleProject` (Task 1); `buildDirectoryIndex` (P1).
- Produces:
  - `buildDryRun(backup, directoryEntries, uidByEmail) → { perProject: Array<{name, before, after, roundTripOk, sizeKb, unresolved, duplicateIds}>, ok: boolean }`.
    - `before` and `after` are counts.
    - `roundTripOk` is a deep-equal check of assemble(split(p)) against p.
  - `buildAssignmentTemplate(backup) → workbook` with two sheets:
    - `Programs`: Project, Program id, Program, PM email, Deputy email.
    - `Workstreams`: Project, Workstream id, Program, Workstream, Sub-PM email, Start, End. Start/End are prefilled with the min start and max end of the workstream's tasks, blank if there are none.
- CLI: `npm run p2:dryrun -- <backup.json> [--key service-account.json] [--out p2-dryrun-report.xlsx] [--template p2-assignments.xlsx]`.
  - It reads `members`, `invites` and `users` **read-only** with the Admin key.
  - Without a key it exits 1 with `Missing service-account key`.
  - It writes the report sheets `Summary`, `Unresolved`, `Duplicates`, plus the template.
  - Exit code 2 if any project has `roundTripOk === false`.

- [ ] **Step 1: Write failing tests** for `buildDryRun` on `tests/fixtures/fixture-workspace.json` + a small directory: counts equal, `roundTripOk` true, size > 0. Also test `buildAssignmentTemplate` sheet names, rows and prefilled dates.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the functions and the CLI. Follow `scripts/p1-build-directory.mjs` for the Admin init, the key handling and the `isMain` guard.
- [ ] **Step 4: Run the tests** (expected PASS), the full suite and lint.
- [ ] **Step 5: Commit:** `feat(p2): migration dry-run report and PM/Sub-PM assignment template`.

### Task 3: `ownerUids` with a legacy fallback

**Files:**
- Modify: `firestore.rules`
  - Replace the bodies of `isWorkspaceOwner()` (workspace doc) and `isDirectoryOwner()` (sub-collections) so both accept `request.auth.uid in <wsdoc>.get('ownerUids', [])` **or** the legacy email check.
  - Writes to `ownerUids` are owner-only (add it to `ownerFields()`).
  - An update that would leave `ownerUids` empty is denied: `request.resource.data.get('ownerUids', ['x']).size() > 0`.
- Create: `scripts/p2-set-owner-uids.mjs`. It sets `workspaces/main.ownerUids = [uid of workspaceOwner email]`, looked up in `workspaces/main/members` by email. It follows the preview → `--apply` → `--rollback <manifest>` pattern; reuse `applyPlan`/`rollbackManifest` from `p1-build-directory.mjs`, imported, not copied. `applyPlan` is shaped for members/invites. If it does not fit, extract a generic `applyWrites(db, writes: Array<{path, data}>, deps)` into `scripts/lib/manifest.mjs`, make `applyPlan` call it, and keep the existing p1 tests green. Writes are merged into the existing doc (`set` with `{ merge: true }` limited to `ownerUids`), so no other workspace field is touched.
- Test: `tests/rules/workspace-owner.test.js` (extend), `tests/unit/p2-owner-uids.test.js`.

- [ ] **Step 1: Write failing rules tests.**
  - A uid listed in `ownerUids` can update owner fields.
  - Legacy email-only still can.
  - A non-owner cannot add themselves to `ownerUids`.
  - The Owner cannot set `ownerUids: []`.
  - Directory owner writes are allowed via `ownerUids`.
- [ ] **Step 2: Write a failing unit test for the plan function** `planOwnerUids(wsDoc, membersByEmail)`.
  - It returns `{ ownerUids: [uid] }`.
  - It errors when `workspaceOwner` has no member entry.
  - It is a no-op when the field is already set.
- [ ] **Step 3: Implement the rules and the script.** Push the branch and confirm CI is green, since the rules tests run only on CI.
- [ ] **Step 4: Commit:** `feat(p2): ownerUids with legacy email fallback`.

### Task 4: Rules for the v2 sub-collections + emulator tests

**Files:**
- Modify: `firestore.rules`. Add `match /workspaces/{wid}/projects/{pid}/workstreams/{wsId}`, `/tasks/{tid}`, `/actions/{aid}`, `/activity/{eid}` with the helpers from spec §8:
  - `isActiveMember`
  - `isOwner` (Task 3 version)
  - `isPM(wid, pid, programId)`, reading `programMeta`
  - `isLead(wid, pid, wsId)`, where an empty `leadUid` means false
  - `canReadProject`, which uses `memberUids` / `visibility` and falls back to the v1 `memberIds` while `memberUids` is absent
  - `withinWs`, where a null ws `start`/`end` means no limit
  - `onlyKeys`
- Test: `tests/rules/v2-matrix.test.js`

**Interfaces (rules contract):** spec §4 rows, limited to P2 scope (approvals are P3):

| Row | Allow | Deny |
|---|---|---|
| Task create | Owner; PM of the program; Sub-PM of the WS within WS dates | Assignee; Viewer; Sub-PM of another WS; Sub-PM outside WS dates |
| Task delete | Owner, PM | Sub-PM (must use `Dropped`) |
| Task update | Owner; PM (own program); Sub-PM (own WS, within dates) | — |
| Task update by Assignee (`picUid == me`) | only keys `status, health, healthNote, updates, checkIns, updatedAt, updatedBy, version`, with `status` in `['Planned','InProgress']` | setting `Completed`/`Dropped`; changing `end`, `picUid`, `programId`, `workstreamId` |
| Workstream create/delete, set `leadUid` | Owner, PM | Sub-PM, Assignee |
| Action create | Owner, PM, Sub-PM | Assignee |
| Action update | the above, or the action PIC (may set `Done`) | others |
| Read (`restricted` project) | Owner and `memberUids` | an active member not in `memberUids` |
| Read (`department` project) | any active member | a deactivated member; a non-smartosc account |
| Activity | create with `authorUid == me` by any reader | update, delete |

- [ ] **Step 1: Write one allow test and one deny test per row.** Seed: `workspaces/main` (with `ownerUids`); `members` for owner / pm / lead / assignee / viewer / outsider; a project with `programMeta` and `memberUids`; a ws with `leadUid` and dates; a task with `picUid`.
- [ ] **Step 2: Push; confirm CI fails** on the new tests.
- [ ] **Step 3: Implement the match blocks.** Keep at most 3 `get()` calls per evaluation, and note the count in a comment on each block.
- [ ] **Step 4: Push; confirm CI is green**, including `baseline`, `workspace-owner`, `directory` and `p1-apply`.
- [ ] **Step 5: Commit:** `feat(rules): v2 sub-collection rules per role matrix (additive, unused until P2.4)`.

### Task 5: Runbook, docs, PR

- [ ] Update CLAUDE.md Current Status (P2.1) and DESIGN §2 risks #2, #5, #7 (→ P2.2–P2.4).
- [ ] The PR description carries the runbook below.
  1. HOD exports Backup JSON.
  2. Run `p2:dryrun` and check that every project has `roundTripOk = true`.
  3. HOD fills `p2-assignments.xlsx` for the pilot projects first (AF 2026 Key Results, AF 2026 Operation), then all projects.
  4. Publish the rules from the PR head (additive), keeping the P1 version 23/10 6:35 for rollback.
  5. Merge.
  6. Run `p2-set-owner-uids` preview, HOD approves, then `--apply`.
  7. Check that the Owner can still transfer ownership and edit the directory.
  8. Rollback: `--rollback <manifest>`, the Console rules version, then Vercel Promote.
