# W3-C / W3-D Plan, FOCUS and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The Plan tab shows structure (Gantt grouped by Program → Workstream, an all-projects Gantt), one filter rule for the project selector + FOCUS, a Portfolio that opens projects and lists every pending approval, and the remaining Owner / PM operations report and behave honestly.

**Architecture:** New pure logic goes into small modules with vitest tests (`src/ganttRows.js`, `src/focusScope.js`, `src/ownerQueue.js`, `src/holdings.js`, `src/activityFilter.js`, `src/workload.js`, plus additions to `src/tabsByRole.js`, `src/treeGuards.js`, `src/chatNotify.js`). `src/App.jsx` and the components only wire them in at the existing call sites. No rules, no data, no new Firestore reads except the Owner's on-demand activity log (existing `loadActivity` per project).

**Tech Stack:** React 18, Vite, Vitest. Firestore rules unchanged.

**Spec:** `docs/superpowers/specs/2026-11-13-wave3-design.md` §4 (W3-C) and §5 (W3-D). Finding ids (O*, P*) refer to `docs/reviews/2026-11-13-routine-audit.md`. Line numbers below are `src/App.jsx` at `89850ee` and will drift; locate by the quoted function / string.

## Global Constraints

- Start C1 only after W3-A3 (`feat/w3-a3-owner-ops`) has merged; it edits the same `App.jsx` regions (⋯ menu, delete / import). W3-B may land before or between these PRs; each PR rebases on `main`.
- Six PRs, each opened against `main` after the previous one merges (no stacked PRs): **C1** Gantt, **C2** FOCUS rule, **C3** Portfolio, **D1** Owner operations, **D2** Coaching log + workload, **D3** PM items. D2 is split from D1 because it changes numbers the Owner reads (workload) and adds the only new read path (full log); D1 stays a pure UI-honesty PR.
- No rules change, no data change, no `App.jsx` restructuring. No hard delete of tasks (CLAUDE.md).
- `npm test`, `npm run typecheck`, `npm run lint:gate` (≤ 2 errors / 32 warnings; new files lint-clean), `npm run build` green before each PR.
- UI copy in English, exactly as quoted below. View as (impersonation) stays read-only everywhere.
- Each PR: one line in `docs/PROJECT_LOG.md` and the CLAUDE.md status line. Rollback for every PR: Vercel Promote previous deployment, then `git revert -m 1 <merge>`.

## Review Focus

- FOCUS never filters a cross-project tab, and never survives a project change with a program id from another project (`scopeProgramId` not in `project.programs` must read as "All programs").
- Gantt: collapsed groups do not break dependency arrows (arrows to hidden rows are skipped, not drawn to row 0); summary bars ignore Dropped tasks; a WS with no dated task draws no bar.
- All-projects Gantt only uses projects already in memory (no extra reads); a project the person cannot read is simply absent.
- Approvals strip counts match: Submitted tasks = My Work "Needs my approval" for the Owner, plus deadline requests and RAID `PendingApproval`.
- Owner-only surfaces (strip, full log, Deactivate confirm) are not rendered during View as.

## Deferred (not before onboarding)

- **O14 header polish** — cosmetic; the tab-row wrap and account-menu anchor touch the whole header and risk layout regressions for no data benefit. Revisit with onboarding feedback.
- **P7 Chat on 3-day escalation** — escalation is computed in each browser (no backend), so every open client would post the same card; doing it once needs a "notified" marker in data + rules. Reassign Chat and the deep-link toast are planned (D3).
- **P8 "who approves" hint before Submit** — not in spec §5 (only the Mind map colour is); the toast already names the approver.

---

## PR W3-C1 — Gantt grouping + All-projects Gantt (branch `feat/w3-c1-gantt`; also carries this plan)

### Task 1: `src/ganttRows.js` + `tests/unit/ganttRows.test.js`

**Produces** (pure, no React):
- `nodeSpan(node)` → `{ start: 'YYYY-MM-DD' | null, end: … }` = earliest `start` / latest `end` of the non-Dropped tasks under a project / program / WS.
- `nodePct(node)` → integer %, **same formula as `rollup` in `App.jsx` (`function rollup`)**: Dropped excluded, weights from `progressWeight` in `src/taskStatus.js`, `Math.round(weighted / total * 100)`, 0 when no active task.
- `buildGanttRows(project, { scopeProgramId, collapsed })` → ordered rows `{ kind: 'program' | 'workstream' | 'task', key, depth, label, start, end, pct, status?, task?, programId, workstreamId?, collapsed }`. `collapsed` is a `Set` of keys (`pg:<id>`, `ws:<id>`); children of a collapsed key are omitted. Tasks keep today's order (`sortTasksByStart`; move that helper here and import it in `GanttView.tsx`). A scope id not found in the project = no scope.
- `buildAllProjectsGanttRows(projects, projectIds, { collapsed })` → rows `{ kind: 'project' | 'program' | 'workstream', key, depth, label, start, end, pct, projectId }` in `projectIds` order, skipping ids not in `projects`. Never task rows. Default keys collapsed by the caller: every `pg:` (shows Project → Program).
- `ganttTaskIndex(rows)` → `{ [taskId]: rowIndex }` over task rows only (for arrows).

Tests: `nodeSpan` ignores Dropped and undated tasks; `nodePct` fixture (1 Completed, 1 InProgress, 1 Submitted, 1 Planned, 1 Dropped → 50); group order and depths; collapsed program hides its WS and tasks; scope filters to one program; unknown scope = all; all-projects rows skip missing ids and contain no `task` kind; `ganttTaskIndex` skips group rows.

### Task 2: `src/components/GanttView.tsx`

- Rows come from `buildGanttRows`; local `useState<Set<string>>` for `collapsed` (default empty = expanded), reset when `scopeProgramId` changes.
- Group row (left pane): chevron toggle + label, bold for program, indented for WS, `pct%` at the right; height `ROW_H`; click toggles. Task rows indent one more level; click opens the task as today.
- Group bar: thin (8px) summary bar from `start` to `end` in `TOK.lineStrong` with a filled part = `pct%`; no bar when `start` or `end` is null.
- `barColors`: add `Submitted` → fg `#B7791F`, bg `#FAEEDA`, dashed border; `Dropped` → fg `TOK.subtle`, bg transparent, dashed border, task label `line-through`, opacity 0.6. Overdue keeps priority only for open statuses (already true via `isOverdueTask`).
- `DependencyArrows` uses `ganttTaskIndex`; arrows whose end is not a visible task row are skipped.
- Toolbar count text: `{n} tasks` counts task rows only.
- New export `AllProjectsGantt({ projects, projectIds, onOpenProject })`: same timeline (reuse `TimelineHeader`, `TodayLine`, zoom), rows from `buildAllProjectsGanttRows`, default `collapsed` = all `pg:` keys; project row label is a link button "Open" → `onOpenProject(pid)`; corner header text `Project / Program / Work stream`. Empty: "No dated tasks in any project yet."

### Task 3: wire in `App.jsx` (render block near `view === 'gantt'`)

- `isAllProjectsMode && view === 'gantt'` → `<AllProjectsGantt projects={projects} projectIds={meta.projectIds} onOpenProject={(pid) => switchProject(pid)} />` (stays on Gantt, now one project).
- `isAllProjectsMode && (view === 'mindmap' || view === 'outline' || view === 'dashboard')` replaces the "This view is project-specific" block with `ProjectList` (small component next to it in `App.jsx`): heading "Choose a project", one row per `meta.projectIds` entry present in `projects`: name, `rollup(p).pct`%, `done/total`, "Your role: …" (`myRoleSummary`, v2 only); click → `switchProject(pid)` keeping the view. Keep the Owner "Open Activity" button below.
- Mind map task node (`function MindNode`): `Submitted` → same amber pair as Gantt (P8; moved here because it is the same token pair).
- Verify, PR.

---

## PR W3-C2 — one filter rule (branch `feat/w3-c2-focus`, from `main` after C1)

> **DEFERRED (HOD 16/11):** the project selector + FOCUS are to be brainstormed again together with a UI / UX review of the project view. Do not implement this PR; the tasks below are input for that brainstorm only. C3 follows C1 directly.

### Task 4: `src/focusScope.js` + tests; exports in `src/tabsByRole.js`

**Produces:**
- `PROJECT_TABS = ['mindmap', 'outline', 'gantt', 'actions', 'decisions', 'raid', 'dashboard']`; `showsProjectControls(view)` → `PROJECT_TABS.includes(view)`.
- `validScope(project, scopeProgramId)` → the id if it is a program of `project`, else `null`.
- `actionProgramId(project, action)` → program of `action.relatedTaskId` (tree lookup), else `roles.workstreams[action.workstreamId].programId`, else `null`.
- `decisionProgramId(project, decision)` → `project.__v2.roles.decisions[id].programId` when present, else program of the first `relatedTaskIds` entry found, else `null`.
- `scopeActions(project, scope)` / `scopeDecisions(project, scope)` → `{ items, hiddenUnassigned }`; scope `null` returns all with `hiddenUnassigned: 0`; otherwise items whose program is `scope`, and the count of items with no program.
- `scopedNode(project, scope)` → the program object, or `project` when no scope (for header progress and Dashboard).
- In `src/tabsByRole.js`: export the existing `managerProgramId(project, uid)`; add `firstManagedProjectId(projects, projectIds, uid)` → first id (in `projectIds` order) whose `__v2.roles` gives `managerProgramId` ≠ null, else `null`.

Tests: `showsProjectControls` for every tab id in `tabsFor('owner')` plus Plan sub-views; `validScope` with a foreign id; action via task, via WS, none; decision via stored claim, via related task, none; `hiddenUnassigned` count; `firstManagedProjectId` order and v1 skip.

### Task 5: wire in `App.jsx`

- Header: render the project `<select>` and the FOCUS block only when `showsProjectControls(view)`. On other tabs show nothing in their place (no "All projects" label).
- `const scope = validScope(project, scopeProgramId)`; pass `scope` (not `scopeProgramId`) to Mind map, Outline, Gantt, Dashboard, RAID.
- Header progress: `r = project ? rollup(scopedNode(project, scope)) : null`; when `scope` is set append ` · {program name}` after "complete".
- Tab counts: `actions` / `decisions` counts use `scopeActions` / `scopeDecisions(...).items.length`.
- `ActionItemsView` and `DecisionsView` get a `scopeProgramId={scope}` prop and filter their list with the helpers at the top of the list memo; when `hiddenUnassigned > 0` show a muted line under the list: "{n} items with no program are hidden while FOCUS is set."
- RAID: delete `raidScopeProgramId` state and every `setRaidScopeProgramId` (tab click, My Work `onNavigateRaid`, Actions `onNavigateRaid`, task panel `onNavigateRaid`). Those navigations call `switchProject(pid, { focus: programId })` (or `setScopeProgramId(programId)` when already on the project) and `setView('raid')`.
- `switchProject(id, { focus } = {})`: sets `scopeProgramId` to `focus ?? managerProgramId(projects[id], uid) ?? null` (Owner: `focus ?? null`). Route the direct `setCurrentId` calls in `createNewProject`, Import, `deleteCurrentProject`, and the deep-link handler through it (or call `setScopeProgramId(null)` beside them where `switchProject`'s side effects are unwanted, e.g. deep link before load).
- Landing effect: when `tier === 'manager'` and the current project yields no `managerProgramId`, switch to `firstManagedProjectId(projects, meta.projectIds, uid)` (if any) before `setView`, so the FOCUS preset applies.
- Verify, PR.

---

## PR W3-C3 — Portfolio click-through + Approvals strip (branch `feat/w3-c3-portfolio`, from `main` after C1; C2 deferred)

### Task 6: `src/ownerQueue.js` + tests

**Produces:** `ownerQueue(projects, now)` → items sorted by `waitingDays` desc, then project name:
- `{ kind: 'close', project, program, workstream, task, waitingDays, escalated }` for every v2 task with `status === 'Submitted'` and a `closeRequest` (reuse `workingDaysSince`, `escalationTargets` from `src/approvalsInbox.js`; no `uid` filter — the Owner sees all).
- `{ kind: 'deadline', project, program, workstream, task, waitingDays }` for every task with `deadlineRequest` (from `requestedAt`).
- `{ kind: 'raid', project, program, item, waitingDays }` for every `program.raid[]` item with `status === 'PendingApproval'` (from `createdAt`).
Missing dates → `waitingDays: 0`. Dropped / Completed tasks with a stale `deadlineRequest` are excluded.

Tests: one of each kind; v1 project contributes deadline + raid but not close; sort order; stale request on a Completed task excluded; invalid date → 0.

### Task 7: wire in `App.jsx`

- `PortfolioView` gets `onOpenProject(pid)` and `onOpenItem(item)`. `HealthHeatmap` card click → `onOpenProject` → `switchProject(pid)` then `setView(readPlanView())`.
- New `ApprovalsStrip` (in `App.jsx`, above `HealthHeatmap`): title "Waiting for you ({n})"; empty state "Nothing is waiting for your approval."; one row per item: kind label ("Close request" / "Deadline change" / "RAID activation"), `Project › Program › item name`, "Waiting {d} working days" (red when ≥ 3), button "Open". Show the first 8, then "Show all {n}".
- `onOpenItem`: close / deadline → `switchProject(pid, { focus: program.id })`, `setView(readPlanView())`, `setSelectedTaskId(task.id)`; raid → `switchProject(pid, { focus: program.id })`, `setView('raid')`.
- Hidden during View as. Verify, PR.

---

## PR W3-D1 — Owner operations (branch `feat/w3-d1-owner-ops`, from `main` after C3)

### Task 8: pure helpers + tests

- `src/treeGuards.js`: `restorePreview(data, liveProjects)` → `{ v1Names, v2: [{ id, name }], invalid: string | null }` (wraps `splitRestoreByV2`; `invalid` = "Invalid backup file." when `meta` / `projects` missing). `restoreScriptHint(v2, fileName)` → lines `npm run p2:restore -- <id> --backup "<fileName>"`, one per project.
- `src/holdings.js`: `personHoldings(projects, uid, personKeyOf)` → `{ roles: ['PM of <Program> (<Project>)', 'Deputy of …', 'Sub-PM of <WS> (<Project>)'], openTasks, openActions, approvalsWaiting }` (roles from `__v2.roles`; tasks with `picUid === uid` or PIC key match and status Planned / InProgress / Submitted; actions not Done / Cancelled; `approvalsWaiting` = Submitted tasks with `closeRequest.approverUid === uid`). `holdingsText(h)` → one-line summary or `''` when nothing is held.

Tests: restore all-v2 / mixed / invalid; hint quoting; holdings per role kind, closed tasks excluded, empty → `''`.

### Task 9: wire

- **View as (O6):** ⋯ menu when `impersonatingAs`: only Export items except Backup (Meeting mode, Minutes, Export Excel); no Import, People, Project sections. `clearImpersonation` also `setView('team-overview')`.
- **Restore (O7):** `restoreJson(file)` parses and calls `restorePreview` **before** any confirm. `invalid` → alert. All v2 → alert title "Restore by script", message: "These projects use the new storage and are restored by script (preview first, nothing is deleted): {names}." followed by the hint lines. Mixed → confirm lists only `v1Names`; skipped v2 names + hint shown after, as today.
- **Members modal (O8):** pass `isV2={!!project.__v2}`. On v2: no Owner / Operator / Viewer select; each row shows a "Member" badge and (Owner) Remove; Add buttons collapse to one "Add"; note under the title: "Access is member / not member. Set PM, Deputy and Sub-PM in Roles…". v1 unchanged.
- **Briefing / Meeting mode (O11):** Briefing tab click → `setBriefingDialogIsOwnerMode(isOwner && !impersonatingAs)`. `MeetingMode` gets `currentProjectId`; state `onlyCurrent` (default `true` when a project is selected); header toggle "This project" / "All projects"; list = `onlyCurrent ? [projects[currentProjectId]] : all`.
- **Deactivate (O13):** `DirectoryModal` gets `holdingsOf(uid)` from App (`personHoldings` over `projects`) and `dialogs`. Deactivate (not Reactivate) opens a confirm: title "Deactivate {name}?", message "They lose access at their next sign-in. {holdingsText} Reassign these first, or they stay assigned to an inactive person." (holdings sentence omitted when empty), ok label "Deactivate", danger.
- Verify, PR.

---

## PR W3-D2 — Coaching tab, full activity log, one workload helper (branch `feat/w3-d2-coaching`, from `main` after D1)

### Task 10: `src/activityFilter.js`, `src/workload.js` + tests

- `filterActivity(entries, { projectId, person, types, from, to, text })` → entries newest first; `person` matches `author` case-insensitively; `from` / `to` inclusive local dates; `text` matches `description`. `activityTypes(entries)` → sorted distinct `type`s.
- `personWorkload(projects, { keyOf, now })` → `Map<key, { key, label, openTasks, awaitingApproval, overdueTasks, openActions, overdueActions, perProject: Map<pid, { project, openTasks }> }>` with fixed definitions: **open task** = Planned / InProgress; **awaiting approval** = Submitted (not open, not overdue — `isOverdueTask`); **overdue** counted separately for tasks and actions; `keyOf` = `personKey(dirIndex, raw)` so raw names and directory names merge.

Tests: filters combine; date bounds inclusive; workload: Submitted only in `awaitingApproval`, alias and display name merge under one key, Dropped / Completed ignored, action overdue separate.

### Task 11: wire

- `src/tabsByRole.js`: `T.activity.label = 'Coaching'` (id stays `activity` so saved overrides keep working); update `tests/unit/tabsByRole.test.js` and the walkthrough / glossary text that names the tab.
- `ActivityDashboardView` header: Owner button "Activity log" opens `ActivityLogModal` (new, in `App.jsx`): on open loads `loadActivity(pid)` for every `meta.projectIds` entry in parallel (shows "Loading activity…", per-project failures listed as "Couldn't load {name}"), tags each entry with `projectId`, then filters with `filterActivity`: Project select, Person input, Type select, From / To dates, Search. Shows 200 rows at a time with "Show more"; note "Up to 500 newest events per project." Dashboard "Recent activity" panel gets an Owner link "View full log" opening the same modal for that project.
- `computePortfolioMetrics` workload block and `computeTeamOverview` (`tasksOwned`, `tasksOverdue`) read from `personWorkload`; `WorkloadDistribution` and the Team row add "{n} awaiting approval" when > 0. Credit cards that sum all years get the label suffix "(all years)"; no change to credit maths.
- Verify (compare Team vs Portfolio numbers on the emulator-free fixture in the test), PR.

---

## PR W3-D3 — PM items (branch `feat/w3-d3-pm-items`, from `main` after D2)

### Task 12: helpers + tests

- `src/treeGuards.js`: `deleteBlockMessage(node)` → `null` when no task; when every task is Dropped: "This work stream keeps {n} dropped tasks for history, so it can't be deleted. Rename it, or move the tasks to another work stream first." (program wording "This program…"); otherwise the current `DELETE_HAS_TASKS_MESSAGE`.
- `src/roleUi.js`: `dropRefusalReason({ isOwner, isV2, roles, uid, kind, sourcePgId, targetPgId, targetWsId, taskStart, taskEnd })` → `null` when `canDropMove` is true, else one of: "Only the Owner moves work streams." / "Tasks can only move within your own program." / "Only the PM or Deputy of this program moves tasks." / "The task's dates are outside that work stream's dates." `dragHint(ctx)` → Owner / v1: today's text; PM / Deputy of any program: "Drag tasks between work streams in your programs"; others: `null`.
- `src/chatNotify.js`: `buildCloseReassignedCard({ projectName, taskName, fromName, toName, byName, taskUrl })` in the style of `buildCloseSubmittedCard`.

Tests: message per case (no task / all dropped / mixed); each refusal reason; hint per tier; card snapshot fields.

### Task 13: wire

- **P1 / P2 (D2, Owner-only stays):** RAID item card, non-Owner, `status === 'PendingApproval'`: badge "Waiting for Owner approval" and the line "Only the Owner activates RAID items." `DeadlineRequestBanner`: title "Deadline change request — waiting for Owner approval"; non-Owner footer "Only the Owner approves deadline changes." TaskDetail `save()`: when a manager changes `end` while `deadlineRequest` is pending, show under the dates "A deadline request is still waiting for the Owner." (no auto-cancel). `canApproveDeadline` stays unused.
- **P3:** `save()` runs `datesOutsideWs()` only when `draft.start !== task.start || draft.end !== task.end`. Under the date inputs (v2, non-Owner) a muted line "Work stream dates: {start} – {end}" from `wsWindow`.
- **P4:** the 8 `taskCountUnder(...) > 0` alerts in Mind map and Outline use `deleteBlockMessage(node)`.
- **P5:** `RolePicker` for non-Owner adds a muted line "Only project members are listed. Ask the Owner to add someone."
- **P6:** Outline header hint uses `dragHint` (hidden when `null`); `dropTaskIntoWs` / WS drop: when `dropOk` is false and the target differs from the source, `showToast(dropRefusalReason(...))`. `OutlineView` needs `showToast` passed from App.
- **P7:** close-flow Chat block: `close_reassigned` event → `buildCloseReassignedCard` (same webhook gate, fire-and-forget). Deep-link handler: when `dpProj` is not in `ps`, `showToastRef.current("You don't have access to that project, or it was removed.")` after load.
- Verify, PR; CLAUDE.md status: W3-C/D done.

## Questions for HOD — answered 16/11: 1, 3, 4 as recommended; 2 deferred with C2 (FOCUS brainstorm)

1. Workload numbers (D2): **open = Planned + In Progress; Submitted shown separately as "awaiting approval"; task and action overdue in separate columns.** Changes Team and Portfolio counts slightly.
2. FOCUS on Actions / Decisions (C2): items with no program (action with no task, old decision) are **hidden while FOCUS is set, with a count line** — not shown in every program.
3. Pending-state wording (D3): spec says "Waiting for HOD"; UI uses **"Waiting for Owner approval"** (app is EN, glossary says Owner, multi-workspace ready).
4. Full activity log (D2) opens as **a modal from the Coaching tab and the Dashboard**, not a new tab (keeps the P4 tab bar).
