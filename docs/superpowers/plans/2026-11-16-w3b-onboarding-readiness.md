# W3-B Onboarding Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A new member can sign in, see and act on what is assigned to them, read and comment on their projects, and is not shown red work they cannot do, before the department is onboarded.

**Architecture:** (1) one rules change, published once: an append-only comment branch for every project reader on task and action docs (D1) plus a project-list read branch so `visibility: 'department'` (D5) has an effect; (2) two Admin SDK scripts in the `p2-assign` pattern (preview → plan hash → `--apply --expect <hash>` → local manifest → `--rollback <manifest>`): uid backfill (M1) and per-project visibility (D5); (3) pure helpers (unit-tested) wired into My Work at the existing call sites: mentions through the directory (M2), a Rejected item and focus reload (M3), unlinked-assignment hint (M1), "who can update" notes and badge exclusion for RAID / decision rows (M6).

**Tech Stack:** React 18, Vite, Vitest, Firestore rules + Emulator (CI), firebase-admin scripts.

**Spec:** `docs/superpowers/specs/2026-11-13-wave3-design.md` §1 (D1, D5), §3 (B-1..B-6). Findings: `docs/reviews/2026-11-13-routine-audit.md` M1, M2, M3, M6.

## Global Constraints

- Three PRs, each against `main`, opened only after the previous one merged (no stacked PRs). Order: **B1 rules → B2 scripts → B3 My Work UI**. Start each from fresh `main`; W3-A3 (`feat/w3-a3-owner-ops`) must be merged first, it edits the same App.jsx areas.
- No App.jsx restructuring: new logic lives in pure modules; App.jsx only calls them at the existing sites (find sites by function name, line numbers drift).
- Rules: every new branch has emulator tests (allowed and denied) and a headroom scenario; HOD publishes after merge, same day, keeping ruleset `a83cbde0-bc2a-417b-9b70-3369b8d4f5e9` for rollback.
- Scripts: read-only by default; write only with `--apply --expect <hash>`; one project per run; refuse on `STATE_CHANGED`; manifest written before the transaction (gitignored by `p2-*-manifest*.json`); never run against production by the engineer, HOD runs preview and apply.
- `npm test`, `npm run typecheck`, `npm run lint:gate` (≤ 2 errors / 32 warnings), `npm run build`, CI rules job green.
- UI copy in English, exactly as quoted below.

## Review Focus

- B1: the reader branch must not widen anything else: one new `updates` entry, authored by the caller, no other content key; removed / deactivated people stay denied (W2-RV-5, -9 must still fail). Branch order keeps the Owner `ownerUids` test first (I1 get budget).
- B1: a manager or PIC comment that also changes another key must still go through their own branch (the reader branch fails fast on `hasOnly`).
- B1: the department list query must not let a deactivated member or a non-SmartOSC account list projects.
- B2: backfill never overwrites a non-null `picUid`; a mismatch is reported, not fixed. Rollback never removes `memberUids` grants (Ruling G, as `p2-migrate` / `p2-assign`).
- B2: `restricted` refuses when an open task / action PIC or contributor would lose access.
- B3: focus reload never replaces a project that has a queued, in-flight or held save, and never runs while a close flow is busy.
- B3: View as (`me.readOnly`) keeps today's behaviour for every new item.

---

## PR W3-B1 — comments for every reader + department listing (branch `feat/w3-b1-reader-comments`; **rules**)

Why one PR: both are rules changes, so one emulator run, one publish and one rollback point; the listing is what makes B-5's script mean anything.

### Task 1: rules — reader comment on tasks and actions (B-4, D1)

`firestore.rules`, next to `taskContributorUpdate`:

- `readerCommentKeys()` → `['updates', 'updatedAt', 'updatedBy', 'version']`.
- `readerComment(wid, pid, ch)` → `ch.hasOnly(readerCommentKeys()) && ch.hasAny(['updates']) && appendOnly(ch, 'updates') && activeMemberDoc(wid) && projectMemberIn(v2Project(wid, pid))`. The authorUid of the new entry is already enforced for every writer by `newEntryOk(ch, 'updates')` in `taskUpdateWith` / `actionUpdateOk`; `appendOnly` limits it to exactly one prepended entry with the old list unchanged.
- `taskUpdateWith`: add `|| readerComment(wid, pid, ch)` after `taskContributorUpdate(...)` and before the manager branch (no WS doc reads on this path). Any status (Planned … Dropped, Submitted): D1 says any task.
- `actionUpdateOk`: add `|| readerComment(wid, pid, ch)` after `actionPicUpdate(...)`, before `actionManager(...)`. Cancelled actions included (`actionEditMode` already returns `'comment'` there). Note `actionUpdateOk` uses `isActiveMember`; the helper uses `activeMemberDoc` (same members doc, counted once).
- If HOD answers Q1 "no blockers from readers": add `&& request.resource.data.updates[0].get('isBlocker', false) == false` to `readerComment` (cheap, no get).
- Update the comment blocks above both rules (who may write, get() counts: reader path = workspace, members/{me}, project = 3).

**Tests** — new `tests/rules/w3-comments.test.js` (harness: `helpers.js` `asUser` / `seedDoc`, users and paths from `p3-scenarios.js`; `VIEWER` = active member with no role, in `memberUids`):

Allowed: `W3-C-1` VIEWER appends a comment to a Planned task of ASG; `-2` to a Submitted task; `-3` Completed; `-4` Dropped; `-5` VIEWER comments on an action whose PIC is ASG; `-6` on a Cancelled action; `-7` department project, active member not in `memberUids`; `-8` PM comments on a task outside their program (reader path); `-9` comment with `isBlocker: true` (flip to denied if Q1 = no).

Denied: `-10` two new entries in one write; `-11` new entry `authorUid` = another uid; `-12` new entry without `authorUid`; `-13` same size, an old entry's text edited; `-14` an entry removed; `-15` comment + `status` / `health` / `name` in the same write; `-16` only `updatedAt` + `version` changed (no `updates` change); `-17` removed from `memberUids` (restricted); `-18` deactivated in `members`; `-19` project with `schemaVersion` 1; `-20` non-`@smartosc.com` account.

Headroom: add a `reader-comment` entry to `scenarios` in `tests/rules/p3-scenarios.js` (VIEWER, realistic task with ~40 updates, one appended) so `v2-p3-headroom.test.js` measures it with `MIN_UNITS`; and one transaction test in `w3-comments.test.js` (`-21`): VIEWER comments on 8 tasks in 8 different WS in one transaction (non-Owner chunk limit, `saveChunks.js` `MAX_WS_PER_CHUNK`) → succeeds (no WS doc gets on this path).

Regression: whole `tests/rules` suite green, in particular `w2-revoked.test.js` W2-RV-5 / -9 (removed / deactivated contributor) still fail.

### Task 2: rules + shim — list department projects (B-5 prerequisite)

Today `src/storage-shim.ts` builds `projectIds` with `where('memberIds', 'array-contains', uid)` (two places: the workspace meta read and `list('project')`), so a `department` project is invisible to a non-member even though `canReadProject` would allow reading it.

- Rules, `match /workspaces/main/projects/{pid}` `allow read`: add a third alternative `(resource.data.get('schemaVersion', 1) == 2 && resource.data.get('visibility', 'restricted') == 'department' && isActiveMember('main'))` (query-provable: it reads only `resource.data` and the fixed members path; `canReadProject` reads the project by `pid`, which a list query cannot prove).
- Shim: in both places, also run `query(PROJECTS_COL(), where('schemaVersion', '==', 2), where('visibility', '==', 'department'))`; merge by id (memberIds result first), skip `deletedAt`. The second query is wrapped in its own try/catch: on failure `console.warn('[storage] department list failed', e)` and continue with the first list (so the code is safe before the rules are published).
- Unit: extract the merge into a pure `mergeProjectLists(primary, extra)` (in `src/persistence.js`) → ids in order, de-duplicated, deleted skipped; `tests/unit/persistence.test.js` cases: overlap, deleted in either list, extra empty.

**Tests** (`w3-comments.test.js`, describe "department listing"): `W3-L-1` active member not in `memberIds` runs the department query → succeeds and returns the doc; `-2` same query by a deactivated member → denied; `-3` non-SmartOSC → denied; `-4` `where('schemaVersion','==',2)` alone (no visibility filter) by a non-member → denied; `-5` get of a restricted project by a non-member → denied (regression); `-6` the memberIds query keeps working for members.

### Task 3: UI — the comment box for every reader

- `src/roleUi.js` `taskPanelCaps`: add `comment: true` to every return (spec A-1; the field is missing today). Test in `tests/unit/roleUi.test.js`: every role, incl. no role, closed task → `comment === true`.
- App.jsx: the task panel `UpdateForm` (Updates tab) is already shown to everyone, and `ActionItemForm` keeps its comment box in `'comment'` mode, so no visible change is expected. Check only: a reader posting a comment produces `status 'ok'` (no W3-A3 revert toast) against the emulator or a preview deploy; the comment box in `ActionItemForm` is reachable for a `'comment'` action (row click opens it read-only).
- Verify, PR. Description: rules change, publish runbook below, rollback.

### Publish runbook (HOD, same day as merge)

1. CI green on the merge commit (rules job included). Vercel deploy Ready. Ask everyone to hard-refresh.
2. Record the running ruleset id (`a83cbde0-bc2a-417b-9b70-3369b8d4f5e9`) in CLAUDE.md "Firestore rules production" as the rollback target.
3. Publish `firestore.rules` from `main` (Rules API with the service account, as 13/11, or Console). Compare the published source with the file in git. Record the new ruleset id and time.
4. Smoke test: a member with no role comments on someone else's task and action (no "Not saved" toast; entry visible after reload); browser console has no `[storage] department list failed`; a removed member still cannot comment.
5. Rollback: Console → Rules history → previous ruleset, or point release `cloud.firestore` back to `a83cbde0…`. Code needs no revert (the shim's second query fails soft; refused comments are reverted by W3-A3).

## PR W3-B2 — scripts (branch `feat/w3-b2-scripts`)

Both scripts copy the structure of `scripts/p2-assign.mjs`: exported pure `prepare*` / `decide*Rollback` (testable), `apply*` with an Admin transaction that re-reads and compares a fingerprint, `hash16(stableJson(...))`, `writeManifest` before the transaction (CLI removes it if the transaction fails), one activity event (`authorUid: null`, `author: <STAMP>`), verify after apply. Exit codes: 0 ok / noop; 1 usage / blocked / `PLAN_CHANGED` / `STATE_CHANGED`; 2 verify mismatch.

### Task 4: `scripts/p2-backfill-uids.mjs` + `scripts/lib/backfill-plan.mjs` (B-1, M1)

Usage:
```
node scripts/p2-backfill-uids.mjs --summary [--key …]                       (read-only: per v2 project, counts of fixable / mismatch / unresolved)
node scripts/p2-backfill-uids.mjs <pid> [--key …]                           (preview; prints the plan hash)
node scripts/p2-backfill-uids.mjs <pid> --apply --expect <hash> [--key …]
node scripts/p2-backfill-uids.mjs --rollback <manifest.json> [--apply --expect <hash>] [--key …]
```

**Produces** `planBackfill({ project, tasks, actions, directory, members })` (pure, in `lib/backfill-plan.mjs`):
- Resolve names with `buildDirectoryIndex` / `canonicalPerson` (`src/directory.js`, as `p2-pilot-copy.mjs` `directoryFrom`); uid by email from `workspaces/main/members` with `status: 'active'` only.
- Task / action: `pic` known, uid found, stored `picUid` null → set `picUid`, `picEmail`. Stored `picUid` ≠ resolved uid → `mismatch` (listed, not changed). Unknown name / group (`contributorRegistry`) → `unresolved` (listed). Deactivated person → `inactive` (listed).
- Task `contributors`: union the resolved uids into `contributorUids` (never remove, keep order, append).
- All statuses, including closed (credit and My Work read uids; admin writes bypass the credit lock).
- Project: `memberUids` and `memberIds` `arrayUnion` of every uid set (Ruling G), only when `visibility` is not `department`. Without this the PIC is still refused on a restricted project (`projectMemberIn`).
- Each changed doc: `version + 1`, `updatedBy: 'p2-backfill-uids'`, `updatedAt` server time.
- `blocked` when the project is not `schemaVersion: 2`, is deleted, the directory has alias conflicts touching a resolved name, or the ops exceed 450 (one transaction).
- `planHash = hash16({ kind: 'p2-backfill-uids', pid, fingerprint, changes, warnings })`; fingerprint = project `memberUids` + each touched doc's `version`.

Rollback: `decideBackfillRollback({ manifest, state })` restores `picUid` / `picEmail` / `contributorUids` before-values on docs that still hold the applied value (else `SKIP … changed since the apply`), `version + 1`, `updatedBy: 'p2-backfill-uids-rollback'`. Grants on the project are kept.

**Tests:** `tests/unit/p2-backfill-uids.test.js` (planner): invite-only PIC now signed in → set; non-null different uid → mismatch, no change; group name → unresolved; deactivated → inactive; contributors union keeps existing; department project → no memberUids change; closed task included; hash stable for the same input and changes when a doc version changes. `tests/rules/p2-backfill-uids-apply.test.js` (Admin on emulator, like `p2-assign-apply.test.js`): apply sets fields + version + activity; `--expect` mismatch → `PLAN_CHANGED`, nothing written; a doc edited between preview and apply → `STATE_CHANGED`; after apply the PIC (client SDK) can update their task (`taskAssigneeUpdate`); rollback restores and skips a doc edited after apply.

npm: `"p2:backfill-uids": "node scripts/p2-backfill-uids.mjs"`.

### Task 5: `scripts/p2-visibility.mjs` (B-5, D5)

Usage: `node scripts/p2-visibility.mjs <pid> --set department|restricted [--key …]` (preview) · `… --apply --expect <hash>` · `--rollback <manifest.json> [--apply --expect <hash>]`.

**Produces** `prepareVisibility({ project, tasks, actions, members, to })`:
- `blocked` unless `schemaVersion: 2`, not deleted, `to` ∈ {`restricted`, `department`}; `noop` when already `to`.
- Preview lists: active members who **gain** read + comment (department: active members not in `memberUids`) or **lose** it (restricted).
- To `restricted`: `blocked: lockout` when the `picUid` / `contributorUids` of an open task (Planned / InProgress / Submitted) or the `picUid` of an open action is not in `memberUids`; message: "Add these people as project members first (Members), then re-run." No override flag.
- Write (transaction, re-read; `STATE_CHANGED` if `visibility` or `memberUids` changed): `visibility`, `updatedAt` only (`rev` untouched: v2 meta saves skip `visibility`, `planV2Save.js` META_SKIP); activity `{ type: 'visibility_changed', before: { visibility }, after: { visibility } }`.
- Rollback restores the before-value if the field still holds the applied one.

**Tests:** `tests/unit/p2-visibility.test.js` (gain / lose lists, lockout, noop, hash); `tests/rules/p2-visibility-apply.test.js` (apply + activity; `PLAN_CHANGED`; `STATE_CHANGED`; after apply to department a non-member active user reads a task and lists the project — requires W3-B1 rules; rollback).

npm: `"p2:visibility": "node scripts/p2-visibility.mjs"`.

### Task 6: docs

- CLAUDE.md Rollback table: two rows ("Backfill uid sai" → `npm run p2:backfill-uids -- --rollback <manifest>` preview → HOD duyệt → `--apply --expect <hash>`; "Visibility sai" → `npm run p2:visibility -- --rollback <manifest>` same way).
- PR description = runbook for HOD: backup JSON + Excel of the project first; run when nobody is editing it; preview → send HOD the output → apply with the hash; everyone hard-refreshes after. Backfill runs after each invited person's first sign-in (needs their uid); visibility only after W3-B1 rules are published.
- Verify, PR.

## PR W3-B3 — My Work (branch `feat/w3-b3-my-work`)

### Task 7: pure helpers + tests

- `src/mentions.js` `mentionsMe(text, isMe)` → true when any `@token` sequence names me: for each `@`, try the 4-, 3-, 2-, 1-word candidate (same word pattern as `findMentions` in App.jsx) and return true on the first `isMe(candidate)`. `isMe` comes from `isMeFor(dirIndex, author, authorEmail)` (directory aliases, username, display name, email local-part). Without a directory, `isMe` is exact, so also compare the 1-word token case-insensitively with `author` (today's behaviour). Tests (`tests/unit/mentions.test.js`): username, display name with spaces, alias, diacritics folded, trailing punctuation, another person with the same first word → false, no index fallback.
- `src/roleUi.js`:
  - `unlinkedAssignment({ isV2, uid, storedUid, isPic })` → `isV2 && !!uid && isPic && storedUid !== uid`. `unlinkedContribution({ isV2, uid, storedUids, isContributor })` likewise.
  - `raidUpdaterNote({ isOwner, isV2, roles, uid, programId, programName })` → `null` when `canEditRaid(...)`, else `` `Only the PM / Sub-PM of ${programName} can update this. Tell them when it is done.` ``.
  - `decisionUpdaterNote({ isOwner, isV2, roles, uid, decision })` → `null` when `canEditDecision(...)`; else for a stored `programId` null: `"Only the Owner can update the follow-up."`, otherwise `"Only the PM / Sub-PM of its program can update the follow-up."`.
- `src/readV2.js` `rolesFromLoaded`: add `actions: { [id]: { picUid } }` (the tree drops `picUid` from actions, `assembleProject`). Test in `readV2.test.js`.
- `src/myWorkItems.js` `rejectedCloseItem(task, { uid, isMe, now })` → `{ reason, decidedBy, decidedAt }` when the task is Planned / InProgress, `closeRequestHistory[0].status === 'Rejected'`, the requester is me (`requestedByUid === uid`, or `isMe(task.pic)` when `uid` is null) and `decidedAt` is within 14 days; else `null`. Tests: rejected → item; resubmitted (status Submitted) → null; later Approved entry first → null; 15 days old → null; someone else's request → null.
- `src/persistence.js` `shouldReloadOnFocus({ visible, pendingCount, saveState, savePendingSize, closeBusy, lastLoadAt, now })` → true only when visible, `!hasUnsavedWork(pendingCount, saveState)`, `savePendingSize === 0`, no close flow busy, and `now - lastLoadAt >= 60_000`. Tests for each false case.

### Task 8: wire into App.jsx

- `computeMyWork`:
  - Move the task mention scan (task `updates` + `checkIns`) **above** the `Dropped / Completed / Submitted` `continue`, so closed and Submitted tasks are scanned (M2); replace the token compare with `mentionsMe(text, isMe)`; same for the action `updates` scan.
  - After the PIC block (open tasks only): `const rej = rejectedCloseItem(t, { uid, isMe, now: new Date() })` → `out.needsAttention.push({ kind: 'rejected_close', ...enriched, ...rej })`.
  - `overdue_mitigation`: push only when `!uid || canEditRaid({ isOwner, isV2: !!proj.__v2, roles, uid, programId: pg.id })`; the row stays in `actionItems` (M6).
- `computeMyRaid(author, projects, isOwner, uid = null, isMe = null)`: with `isMe`, use it instead of `=== author`; with `uid`, leave `escalating`, `needsReview`, `overdueActions` empty for items the person cannot edit (`canEditRaid`); `owned` / `dueThisWeek` unchanged. Pass `authUser.uid` + `isMeFor(...)` in `myWorkBadge` and `me.uid` (null when `me.readOnly`) in the My Work view.
- Needs attention list (`myWork.needsAttention.map`): render `rejected_close` as "Close request rejected by {decidedBy}: {reason}" with the task name, project, and a button "Open task" (same handler as the overdue task row).
- Unlinked hint (muted, one line, under the row title) on My Work owned task rows (`roles.tasks[id].picUid`), contributor rows (`roles.tasks[id].contributorUids`), action rows (`roles.actions[id].picUid`) and the task panel header: "Assignment not linked to your account yet — ask the Owner". Not shown in View as.
- `MitigationRowInline`: when `raidUpdaterNote(...)` is not null, show it as a muted line (its `canEdit` already disables the controls). My Work decision rows: show `decisionUpdaterNote(...)` under the meta line when not null.
- Focus reload: one `useEffect` in `App()` listening to `visibilitychange` and window `focus`; when `shouldReloadOnFocus(...)` (inputs: `pendingSaves.current`, `saveStateRef.current`, `savePending.size`, `Object.keys(closeBusy.current).some(k => closeBusy.current[k])`, a `lastLoadAt` ref set by boot load and by this reload), run `loadMetaStrict(window.storage)` then `loadProject` for its `projectIds`, and `setProjects(prev => …)` replacing only projects for which `savePending.has(pid)` is still false when the results arrive (new projects added, removed ids dropped). Failed reads keep the old copy. No toast.
- Verify all checks; manual check: two browsers, reject a close request in one, focus the other → Needs attention shows the Rejected item; a member with a mitigation in another PM's program sees no red badge for it.
- CLAUDE.md status line; PROJECT_LOG entry. PR.

---

## Questions for HOD — answered 16/11: all as recommended (Q1 yes, Q2 none by default — HOD names each project, Q3 accept)

- **Q1** Reader comments may carry the blocker flag (🚩)? Recommended: **yes** — a person waiting on a task is the one who knows it is blocked; only PIC / contributor / manager resolve it. If no, Task 1 adds the `isBlocker == false` check and the UI hides the checkbox for `'comment'` readers.
- **Q2** Which projects go `department` at onboarding? Recommended: none by default; HOD names them one by one (AF 2026 Operation and Key Results are the likely ones; MA, UBO stay restricted).
- **Q3** Rejected item lifetime: until the task is resubmitted / closed, max 14 days. Recommended: accept.
