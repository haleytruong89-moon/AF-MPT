# Wave 2 — hardening before the last v1 projects move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the v2 rules gaps that let non-Owners bend credit, history or workspace data; make CRP-sized PM saves succeed; stop silent wrong saves; finish the wave-1 follow-ups.

**Architecture:** Rules changes in `firestore.rules` with emulator tests (CI only, no local Java). Client mirrors and new pure helpers in small `src/*.js` modules (vitest), wired into `src/App.jsx`, `src/storage-shim.ts`, `src/planV2Save.js`, `src/execV2Save.js` with minimal edits. Four stacked PRs (A→D), each mergeable alone in order.

**Tech Stack:** React 18 + Vite, Firestore client SDK v11, vitest (`tests/unit/`), `@firebase/rules-unit-testing` (`tests/rules/`, emulator project `demo-afmpt`).

**Spec:** `docs/superpowers/specs/2026-11-12-wave2-hardening-design.md`

## Global Constraints

- No mass refactor of `src/App.jsx`; each change minimal and revertible. Match surrounding style.
- Code, comments, commits in English; conventional commits. Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stage files by explicit path only. Never stage `src/MyWorkViews.jsx`, `Specs/`, `service-account.json`, backups, xlsx, manifests.
- Lint must not exceed 6 errors / 63 warnings. `npx vitest run` and `npm run build` pass before each commit. Rules changes: push and confirm the CI `checks` job is green (rules tests run only there).
- Rules expression / `get()` budget: `tests/rules/v2-p3-headroom.test.js` and `v2-p3-owner-budget.test.js` must stay green. Every new rules check states its `get()` cost in a comment like the existing ones.
- No Firestore production writes, no rules publishing (HOD / controller publishes after merge, with the previous ruleset noted).
- v1-only rule paths are not changed (spec §3). The project-doc `create` rule (shared by v1 and v2) is the one exception (R4).
- Exact UI copy (verbatim):
  - W2: `Changed in another tab — reload to see it`
  - W3: `<name> isn't in the People directory — add them first`
  - O4: `Something went wrong. Your saved work is safe.` + button `Reload`; extra line when work was pending: `Some changes were not saved.`
- Owner (client) = uid in `ownerUids` OR `workspaceOwner` email (case-insensitive) — exactly `isOwnerIn` in `firestore.rules` (Ruling W2-2).
- Chunk size for non-Owner v2 saves: at most 8 distinct work streams per transaction (lower it only if the CRP emulator test proves 8 is refused; record the value as a ledger ruling).
- `main` is protected: merges only through a PR with green `checks`. After a stacked PR merges, retarget the next PR's base to `main` **before** merging it; delete merged branches only after the whole stack is merged.

## Review Focus

1. Activity events copied from v1 by `p2-migrate` (stored `author` / `timestamp`, maybe no `authorUid`) must still render their original author and time after R3 — test the read mapper on such a doc.
2. A newly invited person's first sign-in (self-claim, then first writes) must still work under R4 — a rules test walks invite → member create → first `workspaces/main` merge write.
3. A chunked save that fails in chunk 2 of 3: chunk 1 stays committed, the cache reflects it, and Retry writes only what is still different (no doc written twice, no version conflict with itself) — unit test on the shim-level flow with a fake executor.
4. A PM who is also Sub-PM of a work stream in another program: RAID / decision claims pick the right program; edits in a program where they hold no role are hidden in the UI and refused by rules.
5. The legacy-email Owner (empty `ownerUids`) gets the same powers in the app as in rules (drag, weight, New project, delete) — unit test on the Owner helper with both shapes.

## Execution rulings (controller)

- **Ruling W2-1:** `WeightBadge` is already editable only when `isOwner` (App.jsx ~2947), so R1 needs no client change beyond verifying the task panel has no other weight input for non-Owners.
- **Ruling W2-2:** spec O1 says "email only when `ownerUids` is empty"; rules `isOwnerIn` accept uid OR email. The client follows the rules (the spec's own aim: "the same rule as `firestore.rules`"). Spec line amended in PR-D.
- **Ruling W2-3:** W4 also gets a rules line: action delete becomes Owner-only (today managers may delete). Cheap, and goal 6 says non-Owners never hard-delete.
- **Ruling W2-4:** decisions have no `programId`; their program = the program of the stored claim (`viaProgramId`, or the program of `viaWorkstreamId`). R5 for decisions = a non-Owner update must claim the same program as the stored claim.

---

## PR-A — rules (branch `feat/w2-a-rules`, from `main`)

### Task A1: Credit inputs locked (R1, R2, W2-3)

**Files:**
- Modify: `firestore.rules` — `creditKeys()` (~620), `wsUpdateOk` (~480), task `allow create` (~954), actions `allow delete`
- Create: `tests/rules/w2-credit.test.js` (reuse `tests/rules/helpers.js` and the P3 fixtures in `tests/rules/p3-scenarios.js`)

- [ ] **Step 1: Failing rules tests:** PM / Sub-PM change `weight` on a Completed task → denied; on an open task → allowed; Owner on a Completed task → allowed; PM changes WS `weight` → denied, Owner → allowed (program weight: locate where it is stored — if on the project doc, assert PM denied there too); non-Owner create with `creditSharesMode: 'manual'` → denied; with `closeRequest` / `closeRequestHistory` / `approvedByUid` / `closedByUid` / `blockerResolutions` → denied each; with `updates: [{authorUid: other}]` → denied; with two updates → denied; with `title` of 501 chars → denied; clean create (open status, auto split, one own update) → allowed; PM deletes an action → denied, Owner → allowed.
- [ ] **Step 2:** Rules: add `'weight'` to `creditKeys()`; add `'weight'` to the PM-forbidden keys in `wsUpdateOk`; add a `taskCreateClean(d)` helper used on the non-Owner create branch; action delete → `isWsOwner(wid)` only.
- [ ] **Step 3:** Grep the task panel for any weight input not behind `isOwner` (Ruling W2-1); gate it if found.
- [ ] **Step 4:** `npx vitest run`, build, lint; push; CI green (incl. headroom tests).
- [ ] **Step 5:** Commit `fix(rules): weight is a credit field; task create gets update checks; action delete Owner-only`.

### Task A2: Activity events can't be forged (R3)

**Files:**
- Create: `src/activityDoc.js`, `tests/unit/activityDoc.test.js`, `tests/rules/w2-activity.test.js`
- Modify: `firestore.rules` (activity `allow create` ~1349), `src/storage-shim.ts` (v2 activity write ~610 and read ~459), `src/roleAssign.js` (`roleChangeEvent`), its caller in `src/App.jsx` (~13397), `tests/unit/roleAssign.test.js`

**Interfaces — Produces:**
- `ACTIVITY_KEYS: string[]` = the allow-list (`id`, `type`, `description`, `before`, `after`, `taskId`, `programId`, `workstreamId`, `projectId`, `workspaceId`, `authorUid`, `createdAt` — trim to what the app writes; grep every `logActivity*` call).
- `activityDocFor(entry: object, uid: string) -> object` — keeps only allow-listed keys, drops `author` / `authorName` / `timestamp`, sets `authorUid: uid` (caller adds `createdAt: serverTimestamp()`).
- `activityEntryFromDoc(data: object, id: string, nameOfUid: (uid) => string|null) -> object` — `timestamp` from `createdAt` when present, else stored `timestamp`; `author` from `nameOfUid(authorUid)` when it returns a name, else stored `author`; `id` from doc id when missing.
- `roleChangeEvent(change, nameOf, scopeName)` also returns `programId: change.programId` and, for `kind === 'lead'`, `workstreamId: change.wsId`.

- [ ] **Step 1: Failing unit tests** for both helpers (incl. a migrated v1 doc without `authorUid`: keeps stored author and timestamp) and for the new `roleChangeEvent` fields.
- [ ] **Step 2: Failing rules tests:** event with `author`, `authorName`, `timestamp`, or an unknown key → denied each; `description` over 2,000 chars → denied; `type: 'role_changed'` by a Sub-PM → denied; by PM / Deputy of the event's `programId` → allowed; by PM of another program → denied; by Owner → allowed; `role_changed` without `programId` by a PM → denied; ordinary event by a Viewer member → allowed.
- [ ] **Step 3:** Rules as tested (`role_changed` branch: `isWsOwner(wid) || isPM(wid, pid, d.get('programId', null))`; state the `get()` cost).
- [ ] **Step 4:** Shim: the write uses `activityDocFor`; the read uses `activityEntryFromDoc` with a name lookup from the members directory already loaded for planning (`directoryForPlan` keeps a uid → displayName map; add it to `PlanDirectory`). Caller passes the new event fields through `logActivityForProject` (it currently copies only `type`, `description`, `before`, `after` — add `programId`, `workstreamId`).
- [ ] **Step 5:** tests, build, lint, CI. **Step 6:** Commit `fix(activity): events carry only allow-listed fields; role changes only by Owner or the program's PM`.

### Task A3: Workspace, project create, sign-in provider (R4, R8)

**Files:**
- Modify: `firestore.rules` (`ownerFields()` ~70, workspace `allow update` ~114, project `allow create` ~211, `isSmartOSC()` ~30), `tests/rules/workspace-owner.test.js` (OU-8 / B1-4 expect non-owner meta writes to succeed — they now need an active-member fixture, and a non-member case expecting denial), `src/App.jsx` (New project button ~14214: Owner only)
- Create: `tests/rules/w2-workspace.test.js`

- [ ] **Step 1: Failing rules tests:** non-Owner project create → denied; Owner create → allowed; non-member domain account updates `workspaceName` → denied; active member → allowed; active member writes `config` → denied, Owner → allowed; non-Google provider token (`firebase.sign_in_provider: 'password'`) reading a project → denied; **self-claim walk**: invited person (no member doc) reads own invite → allowed, creates own member doc per the existing claim rule → allowed, then a merge write on `workspaces/main` touching only `userPreferences` → allowed.
- [ ] **Step 2:** Rules: `ownerFields()` += `'config'`; workspace update non-owner branch requires `isActiveMember('main')`; project create requires `isDirectoryOwner()`; `isSmartOSC()` += `request.auth.token.firebase.sign_in_provider == 'google.com'`. Update the emulator auth helper if test tokens lack the provider claim.
- [ ] **Step 3:** App: hide the New project button unless `isOwner`.
- [ ] **Step 4:** tests, build, lint, CI. **Step 5:** Commit `fix(rules): only active members write workspace data; only Owners create projects; Google sign-in only`.

### Task A4: RAID and decisions by program (R5, Ruling W2-4)

**Files:**
- Modify: `firestore.rules` (`claimWriterOk` / `raidWriterOk` ~1060, decisions `allow update` / `allow delete` ~1112), `src/planV2Save.js` (`roleClaims` ~262), `tests/unit/planV2Save*.test.js` (the file that covers `roleClaims`), the RAID / decision edit + delete controls in `src/App.jsx` (grep `raid` / `decision` delete and edit handlers)
- Create: `tests/rules/w2-raid-decisions.test.js`

**Interfaces:**
- `roleClaims(loaded, uid).raid(programId)` → `{viaProgramId}` if PM/Deputy of it, else `{viaWorkstreamId}` of a led WS in that program, else `{}` (no fallback to other programs).
- `roleClaims(...).decision(stored?)` → for an existing decision, a claim for the stored claim's program (same rules as `raid`); for a new one, as today.
- `canEditRaid(roles, uid, programId)` / `canEditDecision(roles, uid, decision)` in `src/roleUi.js` (Owner true; else holds a claim on that program) — used to hide edit / delete controls; delete controls Owner-only.

- [ ] **Step 1: Failing unit tests** for the claim picker and the two caps (PM of P1 editing P2 RAID → `{}` / false; Sub-PM of a WS in P2 → `{viaWorkstreamId}` / true).
- [ ] **Step 2: Failing rules tests:** PM of P1 writes `raid/P2` with any claim → denied; PM of P2 → allowed; Sub-PM of a WS in P2 → allowed, of a WS in P1 → denied; decision created via P1 updated by PM of P2 (claiming P2) → denied; by Sub-PM of a WS in P1 → allowed; decision delete by PM → denied, Owner → allowed; RAID delete by PM → denied (already).
- [ ] **Step 3:** Rules: RAID claim must resolve to `programId` (`viaProgramId == prg`, or `v2WsData(...viaWorkstreamId).programId == prg`); decision update (non-Owner) claim must resolve to the stored claim's program; decision delete `isWsOwner(wid)` only. State `get()` costs.
- [ ] **Step 4:** Client: planner claims + hidden controls.
- [ ] **Step 5:** tests, build, lint, CI. **Step 6:** Commit `fix(rules): RAID and decisions are edited within one's own program; delete Owner-only`.

### Task A5: Removed or deactivated people stop writing (R6)

**Files:** Modify `firestore.rules` (`taskAssigneeUpdate`, `taskContributorUpdate`, action PIC branch, activity create already uses `canReadProject`); create `tests/rules/w2-revoked.test.js`.

- [ ] **Step 1: Failing rules tests:** PIC removed from `memberUids` (restricted project) updates own task → denied; deactivated PIC (`members/{uid}.status: 'deactivated'`) → denied; contributor removed → adds update denied; action PIC removed → denied; active PIC → allowed (regression).
- [ ] **Step 2:** Rules: those branches also require `canReadProject(wid, pid)` (its `get()`s are the workspace, `members/{me}` and project docs already read on these paths — confirm in the comment). If the headroom test fails, use `activeMemberDoc(wid)` + project membership only and note it.
- [ ] **Step 3:** CI green. **Step 4:** Commit `fix(rules): removed or deactivated people can no longer write their tasks or actions`.

**After PR-A:** open PR (base `main`), body lists every rules change, the tests, and "HOD publishes after merge; previous ruleset id noted in CLAUDE.md".

---

## PR-B — write path (branch `feat/w2-b-write-path`, from PR-A)

### Task B1: CRP-sized saves in chunks (W1)

**Files:**
- Create: `src/saveChunks.js`, `tests/unit/saveChunks.test.js`, `tests/rules/w2-crp-chunks.test.js` (pattern: `tests/rules/v2-save-exec.test.js`)
- Modify: `src/planV2Save.js` (end of `planV2Save`, ~430: split batch 0 for non-Owners), `src/execV2Save.js` (header comment: chunks precede follow-up steps; metaPatch still only in the first transaction)

**Interfaces — Produces:**
- `chunkOpsByWorkstream(ops: Op[], wsOf: (op) => string|null, max = 8) -> Op[][]` — keeps op order inside a chunk; ops with no work stream (RAID, decisions, project-level) go in the first chunk; a work stream's ops never split across chunks; each chunk has at most `max` distinct work streams.
- `wsOf` for tasks / actions = `data.workstreamId` (and the old one on a move — a move counts both); workstreams = their id.

- [ ] **Step 1: Failing unit tests:** 20 WS × 9 tasks → 3 chunks of ≤ 8 WS; a move op counts both work streams; no-WS ops in chunk 0; order preserved; Owner plans are not chunked.
- [ ] **Step 2:** Implement; planner returns `[...chunks, ...followUps]` for non-Owners. Grep every reader of `plan.batches` / `failedBatch` (shim, App close flow) and confirm nothing assumes follow-ups start at index 1; fix if so.
- [ ] **Step 3: Emulator test** on a generated CRP-sized fixture (≥ 180 tasks, ≥ 20 work streams in 2 programs): PM renames one PIC across their whole program → `executeV2Save` status `ok`; same plan unchunked → `denied` (proves the test bites); Sub-PM edits all tasks of their WS → `ok`.
- [ ] **Step 4: Unit test (Review Focus 3)** with a fake executor failing on chunk 2: cache holds chunk 1's writes; re-plan produces only chunk 2–3 ops.
- [ ] **Step 5:** tests, build, lint, CI. **Step 6:** Commit `fix(save): non-Owner v2 saves run in chunks of at most 8 work streams`.

### Task B2: Project-level fields check for newer edits (W2)

**Files:** Modify `src/planV2Save.js` (add `metaBase`), `src/execV2Save.js` (compare inside the first transaction), the save-banner copy for this conflict in `src/App.jsx` / `src/persistence.js`; tests in the existing planner / executor unit tests and `tests/rules/v2-save-exec.test.js`.

**Interfaces:** plan gains `metaBase: { [topLevelKey]: valueLoaded }` for every non-dotted key in `metaPatch` (dotted `programMeta.*` keys keep today's live-role overlay). Executor: before `tx.update(projectRef, meta)`, for each key in `metaBase`, `stableEqual(live[k], metaBase[k])` else return `{ status: 'conflict' }` writing nothing in that transaction. `stableEqual` = deep equal with Firestore Timestamps compared by millis (put it in `src/saveChunks.js` or reuse an existing deep-equal if one exists).

- [ ] **Step 1: Failing tests:** live `teamMembers` changed after load → conflict, nothing written; unchanged → ok; dotted programMeta keys unaffected.
- [ ] **Step 2:** Implement; the conflict banner shows `Changed in another tab — reload to see it`.
- [ ] **Step 3:** tests, build, lint, CI. **Step 4:** Commit `fix(save): project-level fields are not overwritten by a stale tab`.

### Task B3: Unknown people are never saved as nobody (W3)

**Files:** Modify `src/storage-shim.ts` (`directoryForPlan` ~242: export `invalidatePlanDirectory()`; `saveV2Project` ~281: on refusal `'unknown-person'`, invalidate and re-plan once), `src/planV2Save.js` (new refusal `'unknown-person'` with `refusedName`), `src/App.jsx` (`reloadDirectory` calls `invalidatePlanDirectory`; banner copy), planner unit tests.

- [ ] **Step 1: Failing tests:** with a directory present, a task whose `pic` (or a contributor) changed to a name the index can't resolve → `refused: 'unknown-person'`, `refusedName: '<name>'`, no batches; unchanged unresolved legacy names → not refused (stored uid kept).
- [ ] **Step 2:** Implement; shim re-plans once after invalidating; still refused → error with `<name> isn't in the People directory — add them first`; the in-memory task keeps the name.
- [ ] **Step 3:** tests, build, lint. **Step 4:** Commit `fix(save): a PIC not in the directory is refused, never saved as no one`.

---

## PR-C — safe edits (branch `feat/w2-c-safe-edits`, from PR-B)

### Task C1: No hard delete for non-Owners in the UI (W4)

**Files:** Modify `src/App.jsx` — action delete handlers (~3573 and ~5204): non-Owner → set `status: 'Cancelled'` (confirm text `Cancel "<title>"?`, button `Cancel action`), Owner → today's delete; decision / RAID delete controls shown only to Owners (A4 caps).
- [ ] **Step 1:** implement; **Step 2:** build, lint; **Step 3:** Commit `fix(actions): non-Owners cancel actions instead of deleting them`.

### Task C2: Activity writes count as pending saves (W5)

**Files:** Modify `src/App.jsx` (`appendActivity` / `logActivity*` ~13224 use `bumpPending` like project saves; a failed activity write adds a banner entry), `src/persistence.js` if the banner needs a new kind; unit test for any new pure piece.
- [ ] **Step 1:** implement; unsaved-work guard counts pending activity writes. **Step 2:** tests, build, lint. **Step 3:** Commit `fix(activity): activity writes count as unsaved work; failures show in the banner`.

### Task C3: Dialog flows use the latest project state (W6)

**Files:** Modify `src/App.jsx` — in `OutlineView` and `MindMapView`, every handler that `await`s `dialogs.*` and then calls `onProjectUpdate({ ...project, ... })` builds from the latest state instead. The views receive `project` as a prop; add a `getLatestProject()` prop (App passes `() => projectsRef.current[currentId]`) and use it after the await.
- [ ] **Step 1:** grep `await dialogs.` in both views; list the handlers in the commit body. **Step 2:** implement. **Step 3:** build, lint. **Step 4:** Commit `fix(tree): menu actions after a dialog build on the latest project state`.

### Task C4: Webhook out of backups (R7)

**Files:** Create `src/backupStrip.js`, `tests/unit/backupStrip.test.js`; modify `src/App.jsx` (`backupJson` ~14072, the Excel export, the restore path keeps the live `googleChatWebhook` when the backup has none), `CLAUDE.md` (Rollback / runbook line: `Webhook leaked → in Google Chat, delete the webhook, create a new one, paste it in Project Settings.`).

**Interfaces:** `stripSecrets(project) -> project` (removes `googleChatWebhook`, never mutates).
- [ ] **Step 1:** failing test; **Step 2:** implement + wire; **Step 3:** tests, build, lint. **Step 4:** Commit `fix(backup): exports never contain the Chat webhook`.

---

## PR-D — app + ops (branch `feat/w2-d-app-ops`, from PR-C)

### Task D1: One Owner rule, role-aware drag, per-browser My Work seen (O1, O2, O3)

**Files:** Modify `src/roleUi.js` (+ tests), `src/App.jsx` (~12940 `isOwner`; Outline drag handles ~7369 / ~7416; `markMyWorkSeen` ~13002 and where `lastSeenMyWorkAt` is read ~12954), `src/uiPrefs.js` (+ tests), spec line O1 (Ruling W2-2).

**Interfaces — Produces:**
- `isWorkspaceOwner(meta, uid, email) -> boolean` (roleUi.js) — `ownerUids` contains uid, or `workspaceOwner` equals email ignoring case.
- `uiCaps(...)` gains `wsMove` and `taskMove` (Owner / v1: true; PM: within own program; Sub-PM: tasks within own WS only, no WS moves).
- `lastSeenMyWork(uid) -> string|null`, `markMyWorkSeenLocal(uid, iso)` (uiPrefs.js, uid-namespaced localStorage, try/catch).

- [ ] **Step 1: Failing tests:** Owner helper with uid-only, email-only, both, neither; caps for move; uiPrefs round-trip and storage-throws fallback.
- [ ] **Step 2:** Implement; `draggable` only when the cap allows; drop handlers ignore drops the caps refuse; `markMyWorkSeen` no longer calls `saveMeta`.
- [ ] **Step 3:** tests, build, lint. **Step 4:** Commit `fix(app): Owner follows ownerUids like the rules; role-aware drag; My Work seen per browser`.

### Task D2: Error boundary, legacy scripts, CI gate (O4, O5, O6)

**Files:** Create `src/components/RootErrorBoundary.tsx`, `scripts/lint-gate.mjs`; modify `src/main.tsx` (wrap the rendered tree), `package.json` (remove `migrate`; add `lint:gate`), `.github/workflows/ci.yml` (add `npm run build` and `npm run lint:gate` steps); delete `scripts/migrate.js`, `scripts/setup-rbac.js`; `CLAUDE.md` (Cấu trúc mã: scripts row; Current Status).

**Interfaces:** `RootErrorBoundary` reads a pending-work flag via a tiny exported getter from `src/persistence.js` (or `window.__afmptPending`, whichever the save state already exposes) to show `Some changes were not saved.`; `lint-gate.mjs` runs ESLint's Node API on `src`, fails when errors > 6 or warnings > 63, prints counts.
- [ ] **Step 1:** implement; **Step 2:** `npm run lint:gate` passes locally at 6 / ≤ 63; build; tests. **Step 3:** grep the repo for `migrate.js` / `setup-rbac` references (docs keep history; update CLAUDE.md only). **Step 4:** Commit `chore: root error boundary, remove legacy write scripts, CI builds and gates lint`.

---

## After each PR

Push the branch, open the PR (base = previous branch while it is open; retarget to `main` before merging once the previous one merged). Body: what changes, rules / data impact, undo, smoke steps from spec §7. PR-A: list the rulesets to publish. Update `CLAUDE.md` Current Status in PR-D. After all four merge and the PR-A rules are published: migration step per spec §5 (separate, with HOD approval per project).
