# P2.4 — Switch Real Projects to v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Admin SDK CLI, `scripts/p2-migrate.mjs`, switches **one real project in place** from v1 to v2 (spec M4). It also rolls the switch back. Production runs happen later, one project at a time, each after HOD approves a preview.

**Architecture:**
- **Pure core** in `scripts/lib/`, unit-tested with Vitest:
  - `migrate-normalise.mjs` gives real unique ids and drops `null` entries;
  - `migrate-checks.mjs` runs pre-checks, the count report and edit detection;
  - `migrate-plan.mjs` plans the sub-doc writes, reconciles existing docs and plans the activity copy.
- **I/O shell** in `scripts/p2-migrate.mjs`, Admin SDK, tested on the emulator on CI. The order of writes:
  1. A migration record.
  2. The sub-collection docs. They stay invisible while `schemaVersion` is not 2.
  3. **The flip, last:** one transaction guarded by `rev`/`writeId` sets `programMeta`, `memberUids`, `visibility`, `v1Absent` and `schemaVersion: 2`.
  4. The activity copy.
  5. A read-back verification.
- **Rollback** restores the project-doc fields from the record's before-image in one transaction. The v1 arrays were never touched.
- **Read path:** the App's v2 read (`getV2Project` in the shim) is factored into `src/readV2.js`, so the emulator test runs the exact code the App runs.

**Tech Stack:** Node ESM scripts, `firebase-admin` 12 (emulator via `FIRESTORE_EMULATOR_HOST`), Firestore client SDK v11 (`@firebase/rules-unit-testing` 4.0.1), Vitest 2.1.9, SheetJS for previews.

**Spec:**
- `docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md` §7 (data model) and §9 (M4: switch, rollback by `schemaVersion: 1`; scripts in `scripts/`, re-runnable, "if it exists, skip it").
- Binding: `docs/superpowers/plans/2026-10-23-p2-roadmap.md`:
  - "Contract fixed by P2.1";
  - both "P2.4 checklist" sections;
  - "P2.3 status".
- `docs/superpowers/plans/2026-10-23-p2-3-write-path.md` (Rulings Q, R, T, X, Z, AA).

## Global Constraints

- **Nothing in this plan writes production Firestore.**
  - Implementers run unit tests locally and emulator tests on CI only, because Java is not installed locally.
  - Production runs follow the Task 7 runbook. Each one needs an HOD-approved preview.
- **Never commit people data, backups, manifests or xlsx.** `.gitignore` already covers `workspace_backup_*.json`, `p2-*.xlsx` and `p2-*-manifest*.json`. Task 5 adds `p2-*-lost*.json`. Local dry-run output goes to the scratchpad or to a gitignored name.
- **Contract (P2.1):**
  - program data lives in `programMeta`;
  - v1 `programs[]`, `actionItems[]` and `decisions[]` stay **frozen and byte-identical** in the project doc;
  - RAID lives in `raid/{programId}` and Decisions in `decisions/{id}`;
  - every doc has `version: 1`, and the script stamps `updatedBy: 'p2-migrate'` (a script id, as `p2-pilot-copy` does);
  - rules key on `picUid`.
- **Ruling G:** every assigned `pmUid`/`deputyUid`/`leadUid` and every task/action `picUid` goes into `memberUids`. It also goes into `memberIds` when the assignments add it.
- **Owner-only fields:** `programMeta`, `memberUids`, `visibility` and `schemaVersion` on the project doc are Owner-only by rules. Only the Admin SDK script writes them here.
- **No App.jsx edits.** Shim edits are limited to Task 4's extraction, and the v1 output must stay identical.
- **Delete rule (CLAUDE.md: never hard-delete a task):** rollback deletes v2 docs only when asked (`--delete-v2-docs`). Those docs are copies; the v1 arrays still hold every task.
- **Lint:** at most 6 errors / 63 warnings. No shebang. Every CLI checks the key file before any Firestore access, like the existing `p2-*` scripts.
- **Exit codes** for `p2-migrate.mjs`: `0` ok; `1` usage error, blocked pre-check or refused apply; `2` verification mismatch after the flip; `3` rollback refused because v2 edits were found.
- **Constants** (exported from `scripts/lib/migrate-plan.mjs`):
  - `MIGRATE_STAMP = 'p2-migrate'`;
  - `MAX_PROJECT_DOC_BYTES = 900 * 1024`;
  - `RECORD_PATH = (pid) => \`workspaces/main/migrations/${pid}\``;
  - `SUBCOLS = ['workstreams','tasks','actions','raid','decisions']`;
  - `ACTIVITY_SUBCOL = 'activity'`.

## Rulings (decided while writing this plan, 24/10/2026)

Each ruling gives the decision, the reason, and the cost if it is wrong.

- **Ruling P4-1: normalise in memory only.** Generated ids and dropped nulls exist only in the v2 docs. The frozen v1 arrays are not rewritten, and there is no separate preview/apply on the v1 doc.
  - **Why:** a write to the live v1 doc would race with colleagues' saves and add a second production phase. Rollback then returns exactly what users had. The P2.3 planner diffs `split(tree)` against the loaded docs. The assembled tree carries the new ids, so the doc ids are stable and no docId map is needed (roadmap checklist).
  - **Cost if wrong:** after a rollback the v1 tree still has id-less or duplicate items, as it does today. That is harmless.
- **Ruling P4-2: generated ids are content-keyed and deterministic.** The format is `${prefix}_m${fnv1a32base36(pid|kind|stableJson(item without id)|n)}`.
  - Prefixes: `prog`, `ws`, `task`, `act`, `dec`. `n` is the occurrence count of identical content.
  - A collision with an existing id of the same kind appends `_2`, `_3`, …
  - The **first occurrence in tree order keeps its id**, and later duplicates get new ids. References such as `relatedTaskId`, `relatedTaskIds` and `dependencies` are not rewritten. They already resolve to the first occurrence today, as `taskWorkstreamOf` does with first-wins.
  - Ids that are not valid Firestore doc ids are also re-id'd: they contain `/`, equal `.` or `..`, match `^__.*__$`, or exceed 1500 bytes. In that case the id moves to `idMap` even when it is unique.
  - **Why:** a re-run on an unchanged or reordered v1 doc yields the same ids. This is the roadmap's "key on content".
  - **Cost if wrong:** an edit to an id-less item between two pre-flip runs gives it a new id. Reconcile then deletes the stale stamped doc. No data is lost.
- **Ruling P4-3: what normalisation does with nulls and bad RAID.**
  - `null` elements are **dropped and reported** from `programs`, `workstreams`, `tasks`, `actionItems`, `decisions`, each program's `raid` items, and the entry lists `updates`, `checkIns`, `history` and `comments`. A null entry makes every save fail (roadmap).
  - A list that is itself `null` is **only reported** (warning `null-list`), because Ruling Z treats it as `[]`.
  - A non-array `raid` **blocks** the project (`raid-not-array`); HOD fixes it in the app first.
  - **Cost if wrong:** the HOD loses nothing visible. The dropped nulls are listed in the preview.
- **Ruling P4-4: the migration record is the source of truth.** It lives at `workspaces/main/migrations/{pid}`. No rules `match` covers that path, so clients are denied by default. Rollback takes a **pid**, not a manifest.
  - The record holds `{ pid, status: 'prepared'|'switched'|'verified'|'rolled-back', v1Rev, v1WriteId, before, written: { programMeta, memberUids }, docIds: {kind: string[]}, idMap, history: [{status, at}] }`.
  - `before` is captured only when there is no record or its status is `rolled-back`.
  - Local manifests (`p2-migrate-manifest-<pid>-<stamp>.json`) are audit copies of each run.
  - **Why:** a re-run after a partial failure writes a second manifest that does not list the first run's docs. One record per project does not have that gap. It also keeps `idMap` in Firestore, not only on one laptop.
  - **Cost if wrong:** one extra admin-only doc per project.
- **Ruling P4-5: the flip is last, in one Admin transaction.**
  - It requires that the live project doc still has `rev === v1Rev`, the same `writeId`, no `deletedAt` and `schemaVersion !== 2`. Otherwise it throws `REV_CHANGED`, and the sub-docs stay invisible.
  - **Why:** a v1 save during the window would otherwise be missing from v2.
  - **Cost if wrong:** busy projects need a re-run. The runbook asks for a 10-minute freeze.
- **Ruling P4-6: re-run semantics.**
  - **Before the flip**, `reconcileExisting` compares each existing doc with the planned one:
    - a stamped (`updatedBy === MIGRATE_STAMP`), `version === 1` doc that matches the plan is skipped;
    - one that differs is overwritten;
    - a stamped `version === 1` doc that is not planned is deleted;
    - any other doc (unstamped or `version > 1`) **blocks** the run (`foreign-doc`).
  - **After the flip:** when `schemaVersion === 2` and the record status is `switched` or `verified`, a run only tops up the activity copy and re-verifies. It never rewrites sub-docs.
  - A v2 doc with no record (for example a pilot copy) is blocked (`v2-not-migrated-here`).
- **Ruling P4-7: rollback.**
  1. **Detect edits.** `detectV2Edits` lists:
     - sub-docs with `version !== 1` or not stamped (edited or created);
     - record `docIds` that are missing (deleted);
     - a `programMeta` that is not deep-equal to `record.written.programMeta`;
     - activity docs without `copiedBy` (new events).
  2. **Refuse** (exit 3) unless `--force-with-report` is given. That flag first writes `p2-rollback-lost-<pid>-<stamp>.json`, holding the full data of every listed doc, the live `programMeta` and the new events, and only then proceeds.
  3. **Flip back.** One transaction restores `programMeta`, `memberUids`, `visibility`, `v1Absent` and `schemaVersion` from `record.before`; an absent value means `FieldValue.delete()`. `memberIds` additions are **kept**, because they are grants HOD made and MembersModal keeps both arrays in sync.
  4. **Delete only on request.** Without `--delete-v2-docs`, no v2 doc is deleted. With it, stamped `version === 1` docs and copied activity are deleted, plus the edited docs when `--force-with-report` is also set. Leftovers are listed.
  - **Why:** flipping back is instant and reversible. Deleting is a second, deliberate choice.
  - **Cost if wrong:** stale v2 docs stay until the next migration, and reconcile handles them.
- **Ruling P4-8: the activity copy runs after the flip.**
  - **Source:** `workspaces/main/activity/{pid}.entries`, newest first.
  - **Target:** `projects/{pid}/activity/{docId}`.
    - `docId` = `entry.id` when it is a valid, unique doc id; otherwise `legacy_<index from oldest>`.
  - **Fields:**
    - `createdAt` = `Timestamp` of `entry.timestamp` when it parses. Otherwise it is 1 ms older than the next-newer entry, or `now` for the newest.
    - `author` = `authorName || author`, the shape the v2 shim writes; `authorEmail` = the original `author`.
    - `authorUid` = the uid of that email, or `null`.
    - `copiedBy: 'p2-migrate'`.
  - Existing doc ids are skipped (top-up).
  - **Why:** after the flip, open v1 tabs can still append to the old feed until they reload. Running the copy last, and allowing a top-up, catches those events.
- **Ruling P4-9: `--apply` needs an explicit assignments choice.** It refuses unless `--assignments <xlsx>` or `--no-assignments` is given. Assignments reuse `applyAssignments` from `scripts/lib/assignments.mjs`, with `projectNames: [name, pid]`.
  - **Why:** without PM/Sub-PM, only the Owner can manage a restricted project.
- **Ruling P4-10: factor the shim's project read into `src/readV2.js`.** The new functions are `appValueFromV1`, `appValueFromV2` and `loadV2Lists`, with Firestore functions injected.
  - **Why:** the emulator test then proves that the App's own read path loads the migrated project equal to the v1 tree.
  - **Cost if wrong:** a small shim change. Task 4's test pins the v1 output byte for byte.
- **Ruling P4-11: visibility.** An existing `visibility` value is kept; otherwise it is `'restricted'`. `memberUids` ⊇ `memberIds`, so no current reader loses access. A warning `no-members` fires when `memberIds` is missing or empty.
- **Ruling P4-12: an Admin v2 restore script is out of this plan.**
  - During the pilot, recovery is rollback (Ruling P4-7) to the frozen v1 tree.
  - That restore script (preview, version+1 writes) is a **gate before wave 2** (MA, CRP, UBO, AF Lean), planned as P2.4b.
  - **Cost if wrong:** a partial corruption in a pilot project costs the pilot-period edits. The pilot projects are small.
- **Ruling P4-13: `p2-migrate-dryrun.mjs --offline`** skips the Firestore directory read, so people resolution is reported as `not checked`. The structural checks can then run locally on the HOD Backup JSON without a service-account key.
- **Ruling P4-14: no automatic rollback on a verification mismatch.** The script exits 2 with the report and leaves the record `switched`. HOD decides between a fix-forward and `--rollback`.
- **Ruling P4-15: size limit.** The block is `doc-too-large` when the UTF-8 JSON length of the merged project doc (frozen v1 + `programMeta` + `memberUids` + flags) is ≥ `MAX_PROJECT_DOC_BYTES`. This is an approximation of Firestore's size, with about 124 KB of headroom under 1 MiB.

## Review Focus

1. **A colleague saves the v1 project between the plan and the flip.** The flip must refuse (`REV_CHANGED`), v1 stays authoritative and intact, and a re-run must switch cleanly with no duplicate docs. *(Task 5, test MIG-3.)*
2. **Ids that are not valid Firestore doc ids**, such as `a/b`, `__x__`, `..`, numbers or very long strings. They must be re-id'd and listed in `idMap`, never crash `splitProject` or create a nested path. *(Task 1, test N-6.)*
3. **A stale, not-reloaded tab saves after the switch.**
   - A non-Owner's v1-shaped write to the project doc is denied by rules.
   - A stale activity append still lands in the old feed, and a re-run tops it up.
   *(Task 5, test MIG-6.)*
4. **Legacy activity with missing or invalid `timestamp` and duplicate `id`s.** Doc ids must be unique, and the v2 feed order (`createdAt desc`) must equal the v1 order. *(Task 3, test A-3.)*
5. **Rollback after a PM edited one task in v2.** It must refuse with that task listed. Forced, it must write the lost-data file **before** any Firestore write. *(Task 6, test RB-2.)*

---

### Task 1: Pure normalisation (unique ids, null entries)

**Files:**
- Create: `scripts/lib/migrate-normalise.mjs`
- Test: `tests/unit/p2-migrate-normalise.test.js`. It uses `tests/fixtures/v1-project.json`, which already has an id-less task and a duplicate `t1` in `w3`.

**Interfaces:**
- Produces:
  - `normaliseForV2(project: object, { pid: string }) -> { project: object, idMap: Array<{ kind: 'program'|'workstream'|'task'|'action'|'decision', path: string, oldId: string|number|null, newId: string, reason: 'missing'|'duplicate'|'invalid' }>, removedNulls: string[] }`
    - It is pure and never mutates its input.
    - `path` uses the form `programs[0].workstreams[2].tasks[0]`.
    - `removedNulls` lists the paths of dropped elements, for example `actionItems[3]`.
  - `isValidDocId(id: unknown) -> boolean`
  - `fnv1a32(s: string) -> string`, base36.

- [ ] **Step 1: Write the failing tests.**
  - **N-1:** `normaliseForV2(fixture,{pid:'proj_fx'})`:
    - the first `t1` keeps `id === 't1'`;
    - the `w3` task gets `/^task_m[0-9a-z]+$/` with `reason 'duplicate'`;
    - the id-less task gets an id with `reason 'missing'`;
    - `idMap.length === 2`.
  - **N-2:** determinism. Two calls give a deep-equal `idMap`. Swapping the order of two workstreams in a clone still gives the same `newId` for the same content.
  - **N-3:** `splitProject(normaliseForV2(fixture).project,{wid:'main'}).report.duplicateIds` equals `[]`, and no task/workstream/action/decision doc id starts with `__`.
  - **N-4:** the input is unchanged (`structuredClone` before, `toEqual` after).
  - **N-5:** a clone with `actionItems: [null, a]`, `decisions: [d, null]`, `tasks[0].updates: [null, u]` and `raid: [null, r]`. Every null is gone, and `removedNulls` equals `['programs[0].raid[0]','programs[0].workstreams[0].tasks[0].updates[0]','actionItems[0]','decisions[1]']` (tree order).
  - **N-6 (Review Focus 2):** ids `'a/b'`, `'__x__'`, `'..'` and `'x'.repeat(1600)` each get `reason 'invalid'`. A numeric id `7` that is unique stays `7`.
  - **N-7:** a generated id that collides with an existing id gets the suffix `_2`. Seed an item whose id equals the hash the plan would produce.
- [ ] **Step 2:** `npx vitest run tests/unit/p2-migrate-normalise.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** per Rulings P4-2 and P4-3.
  - Uniqueness scopes match `splitProject`: programs, workstreams, tasks, actions and decisions are each project-wide.
  - `stableJson` sorts keys.
- [ ] **Step 4:** run again. Expected: PASS. Also run `npm test`; all suites stay green.
- [ ] **Step 5: Commit:** `feat(p2): normalise v1 tree for migration (unique ids, null entries)`.

### Task 2: Pre-checks, order check, count report

**Files:**
- Create: `scripts/lib/migrate-checks.mjs`
- Test: `tests/unit/p2-migrate-checks.test.js`

**Interfaces:**
- Consumes: `normaliseForV2` (Task 1), `splitProject`/`assembleProject` (`src/migrateV2.js`), `compareTrees` (`scripts/p2-compare.mjs`).
- Produces:
  - `precheckProject(doc: object, { pid, dirIndex?, uidByEmail?, maxBytes? }) -> { blocking: Issue[], warnings: Issue[], normalised: ReturnType<normaliseForV2>, split: ReturnType<splitProject> }`, where `Issue = { code: string, detail: string }`.
    - **Blocking codes:**
      - `not-found`, `deleted` (`deletedAt` set);
      - `v2-fields-present` (any of `programMeta`/`memberUids`/`v1Absent` present while `schemaVersion !== 2`);
      - `raid-not-array`, `v1-stamp` (any item already has `updatedBy`, the same check as the pilot copy);
      - `doc-too-large`, `round-trip` (assemble(split(normalised)) ≠ normalised), `orphans`.
    - **Warning codes:**
      - `null-list` (detail = path);
      - `action-ws-null` (detail = action id; Owner-only in v2);
      - `pic-unresolved`, `pic-invite-only` (detail = item id);
      - `key-collisions`, `no-members`, `ids-generated` (detail = count), `nulls-removed` (detail = count).
  - `checkOrders(docs: Array<{id, data}>, groupKey: (d) => string) -> Array<{ group: string, kind: 'tied'|'missing', ids: string[] }>`
  - `taskLinkMismatches(wsDocs, taskDocs) -> string[]` returns the task doc ids whose `workstreamId` is not a workstream doc, or whose `programId` differs from that workstream's `programId` (roadmap checklist).
  - `countReport({ v1Raw, normalised, live: { meta, workstreams, tasks, actions, raid, decisions, activity }, v1ActivityCount }) -> { rows: Array<{ kind, v1, removed, v2, ok }>, roundTrip: { equal, diffs }, orphanCount, linkMismatches: string[], orderIssues, ok: boolean }`
    - Kinds: `programs`, `workstreams`, `tasks`, `actions`, `decisions`, `raid`, `activity`.
    - `ok` requires every row to have `v1 - removed === v2`, `roundTrip.equal`, 0 orphans, 0 link mismatches and no order issues.
  - `detectV2Edits(record, live: { meta, docs: {kind: Array<{id,data}>}, activity: Array<{id,data}> }) -> { edited: Array<{kind,id,version,updatedBy}>, deleted: Array<{kind,id}>, programMetaChanged: boolean, newActivity: string[], clean: boolean }`

- [ ] **Step 1: Write the failing tests.**
  - **C-1:** the fixture gives `blocking` equal to `[]`, and `warnings` codes include `pic-unresolved` (for `'Zed Unknown'`) and `ids-generated` with detail `'2'`.
  - **C-2:** each blocking code fires from a minimal clone:
    - `deletedAt: 'x'` → `deleted`;
    - `programMeta: {}` → `v2-fields-present`;
    - `raid: {}` → `raid-not-array`;
    - a task with `updatedBy` → `v1-stamp`;
    - `maxBytes: 100` → `doc-too-large`.
  - **C-3:** `tasks[0].updates = null` gives the warning `null-list` with detail `programs[0].workstreams[0].tasks[0].updates`. An action with no related task gives `action-ws-null`.
  - **C-4:** `checkOrders` returns `[{group:'w1',kind:'tied',ids:['a','b']}]` for two docs with `order: 0`, and `kind:'missing'` for a doc without `order`. A fresh `splitProject` result has no issues.
  - **C-5:** `taskLinkMismatches` flags a task whose `workstreamId` is `'nope'` and one whose `programId` is `'pg2'` under a `pg1` workstream.
  - **C-6:** `countReport` on a split-then-assembled fixture gives `ok: true`, with the `tasks` row `{v1:4, removed:0, v2:4}`. Dropping one task doc gives `ok: false` and the `tasks` row `ok: false`.
  - **C-7:** `detectV2Edits`:
    - live docs all stamped `version: 1` and equal `programMeta` give `clean: true`;
    - a task at `version: 2` gives `edited:[{kind:'tasks',id:'t2',version:2,updatedBy:'uidZ'}]`;
    - a missing doc id gives `deleted`;
    - an activity doc without `copiedBy` gives `newActivity:['e9']`.
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3: Implement.** `round-trip` compares `assembleProject(...split)` with `normalised.project` using `isDeepStrictEqual`.
- [ ] **Step 4:** run. Expected: PASS, and `npm test` green.
- [ ] **Step 5: Commit:** `feat(p2): migration pre-checks, count report, edit detection`.

### Task 3: Migration plan, reconcile, activity copy (pure)

**Files:**
- Create: `scripts/lib/migrate-plan.mjs` (holds the Global Constraints constants)
- Test: `tests/unit/p2-migrate-plan.test.js`

**Interfaces:**
- Consumes: `precheckProject` (Task 2) and `applyAssignments` (`scripts/lib/assignments.mjs`).
- Produces:
  - `planMigration(doc, { pid, dirIndex, uidByEmail, assignments: object|null }) -> { blocked: Issue[]|null, writes: Array<{ path, data }>, flip: { path, fields: object }, record: object, report }`
    - `writes` holds the sub-docs only. Each has `projectId: pid`, `version: 1` and `updatedBy: MIGRATE_STAMP`.
    - `flip.fields` has exactly the keys `programMeta`, `memberUids`, `visibility`, `schemaVersion` (= 2), plus `v1Absent` when the split has it, plus `memberIds` when assignments added uids.
    - `record` has `written`, `docIds` and `idMap` (no `before` and no `status`; the I/O layer adds them).
    - `report` holds the precheck issues, the per-kind doc counts, the assignment preview and `docBytes`.
  - `reconcileExisting(writes, existing: Array<{ path, data }>) -> { toWrite: Array<{path,data}>, skipped: string[], staleDeletes: string[], foreign: string[] }`, per Ruling P4-6. Equality ignores nothing: stamped docs hold exactly the planned data.
  - `planActivityCopy(entries: object[], { pid, uidByEmail, now: Date, existingIds: Set<string> }) -> Array<{ id, data }>`, per Ruling P4-8. `data.createdAt` is a JS `Date`, and the I/O layer converts it to a `Timestamp`.

- [ ] **Step 1: Write the failing tests.**
  - **P-1:** the fixture with `assignments: null`:
    - `blocked === null`;
    - `Object.keys(flip.fields).sort()` equals `['memberUids','programMeta','schemaVersion','visibility']`;
    - `flip.fields.visibility === 'restricted'`;
    - `flip.fields.memberUids` contains `'uidZ'` (from `memberIds`) and the resolved uid of Alice;
    - every `writes[i].data.updatedBy === 'p2-migrate'` and `version === 1`.
  - **P-2:** a fixture clone with `visibility: 'department'` keeps `'department'`.
  - **P-3:** assignments rows naming Alice as PM of `pg1` set `flip.fields.programMeta.pg1.pmUid === 'uid1'`. `flip.fields.memberIds` then exists and contains `'uid1'`. An unknown email gives `blocked[0].code === 'assignments'`.
  - **P-4:** a blocking precheck, such as `deletedAt`, gives `blocked` non-null and `writes: []`.
  - **P-5:** `reconcileExisting`:
    - an identical stamped doc → `skipped`;
    - a stamped doc whose data differs → `toWrite`;
    - a stamped doc that is not planned → `staleDeletes`;
    - a doc with `updatedBy: 'uidZ'` → `foreign`;
    - a stamped doc at `version: 2` → `foreign`.
  - **A-1:** for 3 entries (newest first) with ISO timestamps, the result is 3 docs whose ids are the entry ids. `createdAt` equals `new Date(entry.timestamp)`. `author` is `authorName || author`, `authorEmail` is the old `author`, and `copiedBy === 'p2-migrate'`.
  - **A-2:** `existingIds` containing the newest id gives 2 docs.
  - **A-3 (Review Focus 4):** the entries are, newest first, `{id:'e1',timestamp:'bad'}`, `{id:'e1',timestamp:'2026-10-01T00:00:00Z'}` and `{timestamp:null}`.
    - Ids are unique: the second `e1` → `legacy_1`, the id-less one → `legacy_0`.
    - Sorting the docs by `createdAt` desc reproduces the input order.
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `planMigration` builds the writes from `precheckProject(...).split` with `projectId: pid`.
  - For assignments, it wraps the project path plus the writes in the shape `applyAssignments` expects. The project doc entry is `{ path: 'workspaces/main/projects/<pid>', data: split.meta }`. Afterwards it splits that entry back out into `flip.fields`.
- [ ] **Step 4:** run. Expected: PASS, and `npm test` green.
- [ ] **Step 5: Commit:** `feat(p2): pure migration plan, reconcile and activity copy`.

### Task 4: Factor the App's project read into `src/readV2.js`

**Files:**
- Modify:
  - `src/readV2.js`: add 3 exports.
  - `src/storage-shim.ts`: the `project:` branch of `get` (about lines 333–361) and `getV2Project` (about lines 75–118) call them. No other change.
- Test: `tests/unit/readV2.test.js` (extend).

**Interfaces:**
- Produces:
  - `appValueFromV1(data: object, pid: string) -> object`. It returns `{ id: pid, ...rest }` without `memberIds`, `roles`, `deletedAt`, `createdBy`, `createdAt`, `updatedAt`, `rev` or `writeId`; this is today's inline code.
  - `appValueFromV2(project: object, pid: string, orphanCount: number) -> object`. It strips the same keys plus `programMeta`, `memberUids`, `visibility`, `schemaVersion` and `v1Absent`, and adds `__v2: { orphans }`; this is today's inline code.
  - `loadV2Lists(fsApi: { collection, getDocs }, db, wid: string, pid: string) -> Promise<{ ws, tasks, actions, raid, decisions }>`. Each value is an `Array<{ id, data }>`. It throws on any read error, and the shim keeps its try/catch → `null`.
  - The shim still sets `knownRev`, `pendingWriteIds` and `v2Loaded` itself. Task 5's emulator test imports these three functions.

- [ ] **Step 1: Write the failing tests.**
  - **R-1:** `appValueFromV1(docWithAclAndRev, 'p')` has no keys from the strip list and `id === 'p'`. `JSON.stringify` of it equals `JSON.stringify({ id: 'p', ...rest })`; key order is preserved.
  - **R-2:**
    - take `n = normaliseForV2(fixture)` and `s = splitProject(n.project)`;
    - assemble `s` with `assembleFromSnapshots`;
    - `appValueFromV2(project,'proj_fx',0)` minus `__v2` `toEqual`s `appValueFromV1(n.project,'proj_fx')`.
  - **R-3:** `loadV2Lists` with a fake `fsApi` calls `collection(db,'workspaces',wid,'projects',pid,c)` for the 5 sub-collections in `SUBCOLS` order and maps the snapshots to `{id,data}`.
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3: Implement**, then replace the inline code in the shim with calls. Keep the TS types with `as` casts in the same way as the existing `planV2`.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run lint` (≤ 6/63) and `npm run build` all pass.
- [ ] **Step 5: Commit:** `refactor(shim): project read values via readV2 helpers (no behaviour change)`.

### Task 5: `p2-migrate.mjs` preview + apply + verify (Admin SDK)

**Files:**
- Create: `scripts/p2-migrate.mjs`
- Modify:
  - `package.json`: add the script `"p2:migrate": "node scripts/p2-migrate.mjs"`.
  - `.gitignore`: add `p2-*-lost*.json` under the P2 block.
- Test: `tests/rules/p2-migrate-apply.test.js`. It is new, runs on CI only, and follows the style of `p2-pilot-copy-apply.test.js`.

**Interfaces:**
- Consumes: Tasks 2–4; `directoryFrom` (`scripts/p2-pilot-copy.mjs`); `toJsonable` (`scripts/lib/manifest.mjs`); `parseAssignmentsWorkbook` and `formatPreview` (`scripts/lib/assignments.mjs`).
- Produces:
  - `prepareMigration(db, { pid, assignments, now }) -> Promise<{ mode: 'fresh'|'post-flip'|'blocked', blocked: Issue[], plan, reconcile, activity: Array<{id,data}>, record: object|null, v1Rev: number, v1WriteId: string|null }>`. It only reads.
  - `applyMigration(db, { pid, assignments, now, Timestamp, FieldValue, writeManifest, hooks?: { beforeFlip?: () => Promise<void> } }) -> Promise<{ mode, written: number, deleted: number, activityCopied: number, verify: ReturnType<countReport> }>`
    - It throws `Error` with `code` set to `'BLOCKED'`, `'REV_CHANGED'` or `'FOREIGN_DOCS'`.
    - **Order:**
      1. Write the record (`status 'prepared'`, plus `before` per Ruling P4-4).
      2. Call `writeManifest`.
      3. Run the batched sets and stale deletes, at most 400 ops per `WriteBatch`.
      4. Run `hooks.beforeFlip`.
      5. Run the flip transaction (Ruling P4-5).
      6. Set the record to `'switched'`.
      7. Copy activity.
      8. Run `verifyMigration`.
      9. Set the record to `'verified'` when `ok`.
  - `verifyMigration(db, pid) -> Promise<countReport result>`. It reads everything back. The round-trip baseline is `normaliseForV2(frozen v1 doc)`, so it can be re-run at any time.
  - **CLI:** `node scripts/p2-migrate.mjs <pid> [--assignments x.xlsx | --no-assignments] [--apply] [--key service-account.json]`.
    - **Preview (default)** is read-only. It prints the mode, the counts per kind, the blocking issues and warnings, the size, the `idMap` size, reconcile counts, the assignment preview (`formatPreview`) and the number of activity entries to copy.
    - It writes `p2-migrate-preview-<pid>.xlsx` with the sheets Summary, Checks, Id map and Assignments. The output contains ids and counts, plus the names the HOD needs in order to approve.

- [ ] **Step 1: Write the failing emulator tests.**
  - **Seed:** the fixture at `projects/proj_fx`, with `memberIds:['uidZ']`, `roles`, `rev: 9` and `writeId: 'w9'`. Add `workspaces/main` with `ownerUids:['u_hod']`, members `u_hod`/`uid1`/`uidZ`, and `workspaces/main/activity/proj_fx` with 3 entries.
  - **MIG-1:** a fresh apply:
    - the project doc has `schemaVersion 2` and `visibility 'restricted'`, and `memberUids` includes `'uidZ'`;
    - `programs`, `actionItems` and `decisions` deep-equal the seed;
    - the sub-collection counts equal `plan.report` counts;
    - there are 3 activity docs with `copiedBy`;
    - the record status is `'verified'` and `idMap.length === 2`;
    - `verify.ok === true`.
  - **MIG-2:** as client user `uidZ` (`asUser`), `loadV2Lists` plus `assembleFromSnapshots` plus `appValueFromV2` minus `__v2` `toEqual`s `appValueFromV1(normaliseForV2(seed).project,'proj_fx')`. A non-member's `getDoc` of a task fails (`assertFails`). `getDoc` of `workspaces/main/migrations/proj_fx` as `u_hod` fails.
  - **MIG-3 (Review Focus 1):**
    - `hooks.beforeFlip` updates the project to `rev: 10`, so the apply rejects with `code 'REV_CHANGED'`;
    - the project still has no `schemaVersion`, and the record is `'prepared'`;
    - a re-run applies, and the task doc count equals the planned count (no duplicates).
  - **MIG-4:** re-run after the switch. A client-edited task (`version: 2`) is unchanged, `mode === 'post-flip'`, and `written === 0`. A 4th v1 activity entry added before the re-run gets copied (`activityCopied === 1`).
  - **MIG-5:** a stray `tasks/x` with `updatedBy:'uidZ'` before the first apply rejects with `code 'FOREIGN_DOCS'`, and nothing is written (no record, no `schemaVersion`). A pilot-copy-shaped v2 doc with no record gives `mode 'blocked'` (`v2-not-migrated-here`).
  - **MIG-6 (Review Focus 3):** after apply, `uidZ` (per-project owner, not workspace Owner) running `updateDoc(project, { name: 'x' })` fails. `uidZ` appending to the old `workspaces/main/activity/proj_fx` still succeeds, and the next re-run copies it.
- [ ] **Step 2:** push the branch. CI shows the new suite failing; other suites stay green.
- [ ] **Step 3: Implement** the I/O functions and the CLI.
  - The CLI reuses the `openDb` and `parseArgs` patterns of `p2-pilot-copy.mjs`.
  - `--apply` without an assignments choice exits 1 (Ruling P4-9).
  - The manifest file is `p2-migrate-manifest-<pid>-<stamp>.json`, with `{ kind:'p2-migrate', pid, v1Rev, entries, idMap }`.
- [ ] **Step 4:** push; CI is green on all suites. Locally, `npm test` and `npm run lint` pass.
- [ ] **Step 5: Commit:** `feat(p2): in-place migration CLI (preview, apply, verify)`.

### Task 6: Rollback

**Files:**
- Modify: `scripts/p2-migrate.mjs`
- Test: `tests/rules/p2-migrate-apply.test.js` (extend), `tests/unit/p2-migrate-checks.test.js` (if `detectV2Edits` needs new cases)

**Interfaces:**
- Consumes: `detectV2Edits` (Task 2), `RECORD_PATH`, `MIGRATE_STAMP`.
- Produces:
  - `rollbackMigration(db, { pid, force: boolean, deleteDocs: boolean, FieldValue, writeLostReport: (obj) => void }) -> Promise<{ edits: ReturnType<detectV2Edits>, flippedBack: boolean, deleted: number, leftover: string[] }>`
    - It throws `code 'EDITS_FOUND'` when the edits are not clean and `force` is false; nothing is written in that case.
    - It throws `code 'NOT_MIGRATED'` when there is no record or the record status is `'rolled-back'`.
    - The flip-back transaction requires `schemaVersion === 2` on the live doc.
  - **CLI:** `node scripts/p2-migrate.mjs --rollback <pid> [--force-with-report] [--delete-v2-docs] [--key …]`.
    - It prints the edit summary (kind, id, version, updatedBy; counts of deleted docs and new events).
    - Exit 3 on `EDITS_FOUND`.
    - With force, it writes `p2-rollback-lost-<pid>-<stamp>.json` before any write.

- [ ] **Step 1: Write the failing tests.**
  - **RB-1:** apply, then rollback (no force, no delete):
    - the project doc has none of `schemaVersion`, `programMeta`, `memberUids`, `visibility`;
    - `memberIds` is unchanged from after apply;
    - `programs` deep-equals the seed;
    - `appValueFromV1(live)` equals `appValueFromV1(seed)`;
    - the record is `'rolled-back'`.
    - A second apply then succeeds (reconcile skips the stamped docs) and `verify.ok`.
  - **RB-2 (Review Focus 5):** apply, then an Admin update of `tasks/t2` to `{version:2, updatedBy:'uidZ'}`.
    - Rollback rejects `EDITS_FOUND`, `edits.edited` equals `[{kind:'tasks',id:'t2',version:2,updatedBy:'uidZ'}]`, and the project keeps `schemaVersion 2`.
    - With `force: true`, `writeLostReport` is called once with an object containing `tasks.t2` data, and it is called **before** the project doc changes. Assert this by reading the doc inside the callback: it is still `schemaVersion 2`. The flip-back then happens.
  - **RB-3:** `deleteDocs: true` after a clean apply leaves the 5 sub-collections and the copied activity empty, with `leftover: []`. A client-created activity event (no `copiedBy`) makes rollback refuse without force.
  - **RB-4:** rollback of a pid with no record rejects with `NOT_MIGRATED`, and nothing is written.
- [ ] **Step 2:** push; CI shows them failing.
- [ ] **Step 3: Implement** per Ruling P4-7.
- [ ] **Step 4:** push; CI is green on all suites.
- [ ] **Step 5: Commit:** `feat(p2): migration rollback with edit detection`.

### Task 7: Dry-run integration and local check on the HOD backup

**Files:**
- Modify: `scripts/p2-migrate-dryrun.mjs`:
  - `buildDryRun` runs `precheckProject` per project;
  - it adds the Summary columns `Blocking`, `Warnings`, `Ids generated`, `Nulls removed`, `Activity entries`;
  - it adds the sheets `Checks` (one row per issue) and `Id map`;
  - `--offline` (Ruling P4-13) passes an empty directory and reports `Unresolved` as `not checked`.
- Test: `tests/unit/p2-dryrun.test.js` (extend).

**Interfaces:**
- Consumes: `precheckProject` (Task 2) and `planActivityCopy` (Task 3; counts only).
- Produces: `buildDryRun(backup, entries, uidByEmail, { offline?: boolean })`. The return shape adds `perProject[i].checks: { blocking, warnings }` and `idMap`. Existing fields are unchanged.

- [ ] **Step 1: Write the failing tests.**
  - **D-1:** a backup with the fixture project has a `Checks` sheet with a `pic-unresolved` row, and Summary `Ids generated` is `2`.
  - **D-2:** with `offline: true`, Summary `Unresolved` is `'not checked'`, and nothing calls Firestore. This is a pure function, so the test checks that no `db` argument is needed.
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement. Run with `--offline` without opening Firestore, so the key check is skipped only in that mode.
- [ ] **Step 4:** `npm test` is green.
- [ ] **Step 5: Local run (no commit of outputs).** Run `node scripts/p2-migrate-dryrun.mjs <HOD backup path given at run time> --offline --out <scratchpad>/p2-dryrun-report.xlsx --template <scratchpad>/p2-assignments.xlsx`.
  - Expected: 7/7 `OK`, and every blocking issue is listed per project.
  - Report the counts only (no names) to the controller.
  - Confirm with `git status` that no new untracked output is in the repo.
- [ ] **Step 6: Commit:** `feat(p2): dry-run shows migration pre-checks and id map`.

### Task 8: Runbook, docs, PR (controller)

**Files:**
- Modify: `docs/superpowers/plans/2026-10-23-p2-roadmap.md` ("P2.4 status" with Rulings P4-1…P4-15), `CLAUDE.md` (Rollback table row and Current Status), `docs/PROJECT_LOG.md`.

- [ ] **Step 1: Add the Rollback table row to CLAUDE.md.**
  - **Incident:** "Chuyển một project sang v2 lỗi".
  - **Recovery:** `npm run p2:migrate -- --rollback <pid>` (if it refuses, read the list, then `--force-with-report`), then hard-refresh.
  - **Who:** HOD.
- [ ] **Step 2: Put the runbook in the PR description and the roadmap.** Each project goes through every step below, one project per session.
  1. **Preconditions, once:**
     - P2.3 (PR #20) and P2.4 are merged and live on Vercel.
     - The P2.3 rules are published, with the previous version noted for rollback.
     - The role pilot on the Treasury 2026 copy has passed and been rolled back.
     - `ownerUids` is set.
     - HOD has filled `p2-assignments.xlsx` for the project.
  2. **Backup:** HOD exports Backup JSON + Excel for **all** projects.
  3. **Freeze:** a message in Chat, about 10 minutes, "do not edit <project>". HOD closes other tabs and hard-refreshes their own devices.
  4. **Preview:** `npm run p2:migrate -- <pid> --assignments p2-assignments.xlsx`. HOD reviews the console output and `p2-migrate-preview-<pid>.xlsx`: counts, blocking (must be 0), warnings, Id map, Assignments. **HOD approves in writing.**
  5. **Apply:** the same command plus `--apply`. Expect `verified`. On `REV_CHANGED`, re-run steps 4–5.
  6. **Compare:** HOD opens the project after a hard refresh and checks the screens and the Credit numbers against the Backup Excel. Re-running `--apply` re-verifies and tops up activity.
  7. **Notice to everyone:** "Hard-refresh (Ctrl+Shift+R) before editing <project>; open tabs cannot save it." End the freeze.
- [ ] **Step 3: Set the project order in the runbook.**
  - **Wave 1 (pilot):** AF 2026 Key Results → AF 2026 Operation → Treasury 2026.
  - **Pilot period:** 1–2 weeks with no data loss, and a re-verify of each wave-1 project at the end.
  - **Gate before wave 2:** the v2 restore script P2.4b (Ruling P4-12) is merged.
  - **Wave 2:** MA, CRP, UBO, AF Lean, one per session. A new Backup before each.
  - **Onboarding** the department starts only after wave 2.
- [ ] **Step 4: Update the PR description.** State the data impact: none from merging; each run writes one project, reversible by `--rollback`. List the open questions:
  - HOD confirms Treasury 2026 in wave 1;
  - A1, Q2, Q3 and Q6 are still open in spec v2.
- [ ] **Step 5: Commit:** `docs(p2): P2.4 runbook, rulings, status`.

## Self-review (done while writing)

- **Coverage.** The scope items map to tasks as follows:
  - in-place CLI pre-checks → Tasks 2, 5;
  - normalisation (Ruling P4-1: in memory, no separate v1 apply) → Task 1;
  - the size check → Task 2;
  - the flags (null lists, null entries, order, non-array raid, `workstreamId` null, task links) → Tasks 1–2;
  - sub-collection writes, `programMeta`, `memberUids`, assignments, visibility and `schemaVersion` last → Tasks 3, 5;
  - the activity copy → Tasks 3, 5;
  - the manifest and the count report → Tasks 2, 5;
  - rollback with edit detection and `--force-with-report` → Tasks 2, 6;
  - idempotency and the id mapping record → Rulings P4-2, P4-4, P4-6, tests MIG-3, MIG-4, RB-1;
  - emulator tests of the App read path → MIG-2;
  - the unit tests → Tasks 1–4, 7;
  - the local dry-run → Task 7;
  - the runbook → Task 8.
  - Excluded, as asked: P2.5, P3 and App.jsx.
- **The roadmap checklist** maps to tasks as follows:
  - `memberUids` (Ruling G) → P-1, P-3;
  - id mapping → P4-2/P4-4;
  - task link mismatches → C-5 + `countReport`;
  - empty-or-reconcile → P-5, MIG-5;
  - 0 duplicates or id-less items → N-3;
  - size → C-2;
  - `workstreamId` null → C-3;
  - activity → A-1..3, MIG-1;
  - restore → Ruling P4-12, deferred with a gate;
  - null lists, null entries and order → N-5, C-3, C-4;
  - pilot first → runbook precondition.
- **Names are consistent across tasks:** `normaliseForV2`, `precheckProject`, `checkOrders`, `taskLinkMismatches`, `countReport`, `detectV2Edits`, `planMigration`, `reconcileExisting`, `planActivityCopy`, `appValueFromV1`, `appValueFromV2`, `loadV2Lists`, `prepareMigration`, `applyMigration`, `verifyMigration`, `rollbackMigration`, `MIGRATE_STAMP`, `RECORD_PATH`.
