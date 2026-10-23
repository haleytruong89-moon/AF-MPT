# P2.2 — Pre-P2.2 Gate and v2 Read Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
1. Close the pre-P2.2 gate: v2 permission fields on the project doc become Owner-only, RAID moves to its own docs, contributors may append updates, and the v1 save path keeps v2 fields from the server.
2. Let the app **read** a `schemaVersion: 2` project from its sub-collections, read-only.
3. Prove it on a pilot **copy** of one real project.

**Architecture:**
- `storage-shim.ts` `get('project:…')` branches on `schemaVersion`.
  - v1: unchanged.
  - v2: read `workstreams`, `tasks`, `actions`, `raid` → `assembleProject` → the same JSON string App.jsx already expects.
- v2 projects are **read-only** until P2.3: the shim refuses saves with `error: 'readonly'`, and the existing save banner shows it.
- **Pilot:** a script writes a v2 copy of a real project under a new id. The copy is visible only to HOD. A compare CLI proves that the copy assembles to the original.

**Tech Stack:** JS/TS, Firestore client + Admin SDK, Vitest, rules emulator tests on CI.

**Spec / binding contract:** spec v2 §7–§9, plus `docs/superpowers/plans/2026-10-23-p2-roadmap.md`, section **"Contract fixed by P2.1"**, which every task must follow.

**Depends on:** PR #14 merged (the transactional v1 save in `storage-shim.ts`). Task 3 edits that code.

## Global Constraints

- **Ruling K′ (replaces K, 23/10): RAID lives in `workspaces/{wid}/projects/{pid}/raid/{programId}`.**
  - Fields: `{ workspaceId, projectId, programId, items: <the v1 raid array>, viaProgramId?, viaWorkstreamId?, updatedBy, version }`.
  - `programMeta` no longer carries `raid`.
  - Writes allowed to:
    - the Owner;
    - the PM/Deputy of `viaProgramId`;
    - the lead of `viaWorkstreamId`, where that ws belongs to the same project.
  - This is "any PM/Sub-PM of the project" (Q1), expressed without iterating a map.
- **Owner-only project-doc fields:** `programMeta`, `memberUids`, `visibility`, `schemaVersion`.
  - On the **v1 project doc rule**, a non-Owner update may not affect them.
  - Owner = `isOwnerIn(workspaces/main)`. This is the P2.1 helper; do not use the v1 per-project `owner` role.
- **Contributors** (HOD decision 23/10): a uid in `contributorUids` who is not the PIC and has no PM/Sub-PM role may update a task only with keys `updates, updatedAt, updatedBy, version`. `updates` is append-only. Stamping and version rules apply.
- Every v2 write stamps `updatedBy` = the caller's uid and bumps `version` (P2.1 rules already enforce this).
- **No App.jsx refactor.** The only App.jsx change allowed: SaveBanner/`nextSaveState` learn a `readonly` status.
- **Production data writes:** only the pilot-copy script, which follows preview → `--apply` → `--rollback` after HOD approves. It never touches the source project.
- **Lint:** ≤ 6 errors / 63 warnings. **Gitignore** `p2-*.xlsx` and `p2-*-manifest*.json` (already done).

## Review Focus

1. **A v1 client (old bundle) saving a project after the gate** must not drop or revert `programMeta`/`memberUids`/`visibility`/`schemaVersion`. The shim takes them from `ex`, and the rules reject a non-Owner change.
2. **A v2 project opened by an old cached bundle** (no v2 read path) shows the frozen v1 tree. Saving from that bundle must not overwrite the v1 arrays in a way that breaks rollback. Decide and test: the rules deny a non-Owner update to a doc whose `schemaVersion == 2`, except the shim-preserved fields.
3. **Orphans on read** (ws/task/raid docs that do not attach) must be visible: a console warning plus an `orphans` count in the returned value. They must never be silently dropped.
4. **Read cost:** one `getDocs` per sub-collection (4 queries) per v2 project load, not one per task.
5. **The pilot copy must be invisible to everyone but HOD** (`memberIds`/`roles` = HOD only, `memberUids` = [HOD], `visibility: 'restricted'`), and deletable by rollback without touching the source.

---

### Task 1: RAID out of `programMeta`; orphan tasks under orphan workstreams

**Files:**
- Modify: `src/migrateV2.js`
- Modify: `scripts/p2-migrate-dryrun.mjs`
- Tests: `tests/unit/migrateV2.test.js`, `tests/unit/p2-dryrun.test.js`

**Interfaces:**
- `splitProject(...)` gains `raid: Array<{ id: programDocKey, data: { workspaceId, projectId, programId, items, version: 1 } }>`.
  - `programMeta[k]` drops `raid`. Record a presence flag so a v1 program without `raid` round-trips.
- `assembleProject(meta, workstreams, tasks, actions, raid = [])` re-merges `items` into each program's `raid`.
  - `orphans.raid` lists raid docs whose `programId` is not in `programMeta`.
  - `orphans.tasks` now also includes tasks whose workstream is itself an orphan.
- The dry-run counts RAID docs and keeps `roundTripOk` semantics.

- [ ] **Step 1: Write failing tests.**
  - The round trip still deep-equals the fixture.
  - `programMeta` has no `raid`.
  - Split produces a raid doc per program.
  - A program without a `raid` key round-trips.
  - A raid doc with an unknown program appears in `orphans.raid`.
  - A task under an orphan ws appears in `orphans.tasks`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them** (expected PASS). Re-run the real-backup round trip, uncommitted, and record all 7 OK in the report.
- [ ] **Step 5: Commit:** `feat(p2): RAID docs per program; orphan tasks under orphan workstreams`.

### Task 2: Gate rules

**Files:**
- Modify: `firestore.rules`
  - v1 project update rule.
  - New `match …/raid/{programId}`.
  - Task update: contributor branch.
  - Project-doc rule for `schemaVersion == 2`.
- Test: `tests/rules/v2-gate.test.js` (new), plus the existing suites unchanged.

**Interfaces (rules contract):**
- **v1 project doc update:** if `diff().affectedKeys()` touches any of `['programMeta','memberUids','visibility','schemaVersion']`, it requires `isOwnerIn(workspace)`. Existing owner/operator semantics stay unchanged for every other key.
- **Project doc with `resource.data.schemaVersion == 2`:** a non-Owner update is denied entirely; v2 writes go to sub-collections. The Owner keeps full rights.
- **`raid/{programId}`:**
  - read = `canReadProject`.
  - create/update = Owner, or PM/Deputy of `viaProgramId`, or lead of `viaWorkstreamId` (ws in the same project). In every case `programId` must equal the doc id and be a key in `programMeta`.
  - Stamping and version rules apply. delete = Owner only.
- **Task contributor branch:** as in Global Constraints.

- [ ] **Step 1: Write failing tests (allow + deny each).**
  - Operator changes `programMeta`: denied. Operator changes `name`: still per the v1 rule.
  - Owner changes `visibility`: allowed.
  - Non-Owner update on a v2 project doc: denied.
  - RAID write by:
    - Owner (allow);
    - PM via `viaProgramId` (allow);
    - Sub-PM via `viaWorkstreamId` of the same project (allow);
    - Sub-PM claiming a ws of another project (deny);
    - Assignee (deny).
  - Contributor appends an update: allowed. Contributor changes status: denied. Contributor rewrites an old update: denied.
- [ ] **Step 2: Push and confirm CI fails** on the new tests.
- [ ] **Step 3: Implement.** Keep at most 6 `get()` calls and comment the counts.
- [ ] **Step 4: Push and confirm CI is green**, including all P1/P2.1 suites.
- [ ] **Step 5: Commit:** `feat(rules): pre-P2.2 gate — owner-only v2 fields, RAID docs, contributor updates`.

### Task 3: v1 save keeps v2 fields from the server

**Files:**
- Modify: `src/persistence.js` (`buildProjectWrite`)
- Test: `tests/unit/persistence.test.js`

**Interfaces:**
- `buildProjectWrite(ex, incoming, opts)` copies `programMeta`, `memberUids`, `visibility` and `schemaVersion` from `ex` when present, the same way it already handles `relatedParties`.
  - Values in `incoming` are ignored.
  - With no `ex`, those keys are omitted.
- `buildProjectWrite` returns `{ readonly: true }` when `ex.schemaVersion === 2`, so the shim never writes a v2 project doc through the v1 path.

- [ ] **Step 1: Write failing tests.**
  - An incoming `programMeta` is ignored.
  - Server values are kept.
  - A v2 doc gives `readonly`.
  - A new project has none of the keys.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** In the shim, a `readonly` result returns `{ key, value, shared: true, error: 'readonly' }`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit:** `fix(save): v1 save keeps v2 fields from the server; v2 projects are read-only`.

### Task 4: v2 read path in the shim + read-only banner

**Files:**
- Create: `src/readV2.js`, a pure assembler wrapper: `assembleFromSnapshots({ meta, ws, tasks, actions, raid }) → { project, orphans }`, which turns Firestore `{id, data}` lists into `assembleProject` input.
- Modify:
  - `src/storage-shim.ts`: in the `get('project:…')` branch, when `data.schemaVersion === 2`, read the four sub-collections with `getDocs` and assemble. Return `{ id: pid, ...project, __v2: { readOnly: true, orphans: <counts> } }`. Strip the v2 meta fields exactly as v1 strips RBAC fields. Warn when any orphan count > 0.
  - `src/persistence.js`: `nextSaveState` handles `'readonly'`, a sticky state like `conflict`.
  - `src/App.jsx`: `saveProject` maps `error === 'readonly'` to the `'readonly'` status. SaveBanner shows: "“{name}” is a v2 pilot project and is read-only for now. Your change was not saved."
- Test: `tests/unit/readV2.test.js`, `tests/unit/persistence.test.js`.

- [ ] **Step 1: Write failing tests** for `assembleFromSnapshots`: fixture split → snapshots → equal project; orphan counts surfaced. Also `nextSaveState` with `readonly`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** No App.jsx change beyond the status mapping and the banner text.
- [ ] **Step 4: Run tests, build and lint.** Expected: pass, lint unchanged.
- [ ] **Step 5: Commit:** `feat(p2): read v2 projects from sub-collections (read-only)`.

### Task 5: Pilot copy + compare CLI

**Files:**
- Create:
  - `scripts/p2-pilot-copy.mjs`: preview, `--apply`, `--rollback`.
  - `scripts/p2-compare.mjs`: read-only.
- Test: `tests/unit/p2-pilot-copy.test.js`; `tests/rules/p2-pilot-copy-apply.test.js` (emulator, real firebase-admin).

**Interfaces:**
- `planPilotCopy(sourceProject, { sourcePid, newPid, ownerUid, dirIndex, uidByEmail })` → `writes: Array<{ path, data }>`.
  - The new project doc is the full v1 source (frozen copy) with:
    - `name: '[v2 pilot] ' + name`
    - `memberIds: [ownerUid]`, `roles: { [ownerUid]: 'owner' }`
    - `memberUids: [ownerUid]`, `visibility: 'restricted'`
    - `programMeta`, `schemaVersion: 2`, `rev: 0`
  - Plus every workstream, task, action and raid doc under `newPid`.
  - Every doc has `version: 1` and `updatedBy: 'p2-pilot-copy'`. The Admin SDK bypasses the rules, and the stamp is a script id by design. Document this.
- `newPid` defaults to `<sourcePid>__v2pilot`. The script refuses if any doc already exists at `newPid`.
- The manifest records every path; rollback deletes them all, since they are new docs.
- **`p2-compare.mjs <sourcePid> <copyPid>`:** reads both with Admin, assembles the copy with `src/readV2.js`, deep-compares it to the source v1 tree (ignoring name, ACL and v2-only fields) and prints OK or the first differences. Exit code 1 on a difference.

- [ ] **Step 1: Write failing unit tests for `planPilotCopy`.**
  - Paths are under `newPid`.
  - The ACL is HOD only.
  - Every doc has `version: 1`.
  - The source pid is never in any path.
- [ ] **Step 2: Write an emulator test.** Apply a copy of a fixture project, compare it equal, roll back, and check that no doc remains under `newPid`.
- [ ] **Step 3: Implement.** Reuse `scripts/lib/manifest.mjs` `applyWrites`/rollback.
- [ ] **Step 4: Run unit tests; push; confirm CI is green.**
- [ ] **Step 5: Commit:** `feat(p2): pilot copy + compare for the v2 read path`.

### Task 6: Runbook, docs, PR (controller)

- [ ] Update the roadmap: Ruling K′ replaces K; record P2.2 status.
- [ ] Update CLAUDE.md Current Status once PR #12 is merged.
- [ ] The PR description carries the runbook below.
  1. Publish the rules from the PR head (gate). Smoke-test v1 saves as HOD and as an operator.
  2. Merge and wait for Vercel.
  3. Run the pilot copy of **Treasury 2026**: preview → HOD approval → `--apply`.
  4. Run `p2-compare` and expect OK.
  5. HOD opens "[v2 pilot] Treasury 2026" in the app and checks:
     - the same programs, workstreams, tasks and actions;
     - Credit numbers;
     - an edit shows the read-only banner.
  6. Rollback: `--rollback <manifest>`, the rules version, then Vercel Promote.
