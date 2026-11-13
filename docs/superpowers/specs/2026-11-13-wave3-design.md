# Wave 3 — honest saves, onboarding readiness, Plan / FOCUS, operations

- Status: HOD approved direction 13/11/2026 (answers to the 5 questions in `docs/reviews/2026-11-13-routine-audit.md` §8, recommendations 1, 3, 4, 5 accepted, 2 = Owner keeps approving).
- Source: `docs/reviews/2026-11-13-routine-audit.md` (finding ids A*, M*, P*, O* below refer to it).
- Delivery: one small PR per item group, each opened against `main` after the previous one merges (no stacked PRs). Rules changes only where marked **(rules)**; each needs an emulator test and HOD publishes after merge, keeping the previous ruleset for rollback.

## 1. Decisions (13/11)

| # | Decision | Consequence |
|---|---|---|
| D1 | Any member of a project may **append a comment** (`updates`) to any task or action in that project. Contributor stays for people who do part of the work and share credit. | **(rules)** append-only `updates` branch for readers; UI shows the comment box to every reader; mentions become answerable. |
| D2 | RAID activation and deadline-change requests stay **Owner-only**. | No rules change. Surface every pending item to the Owner (Portfolio strip); PM / Sub-PM see "Waiting for HOD" instead of a dead end. |
| D3 | Action steps (sub-tasks) are ticked **by the action PIC only** (rules cannot scope an array element). | Hide ✓ for others, show "Ask <PIC> to tick this step", exclude from their badge. Revisit if steps move to their own docs. |
| D4 | **Backup JSON = Owner only.** PM / members use Export Excel. | Hide the menu item for non-Owners. |
| D5 | **No visibility button.** Department visibility is set per project by script (preview → HOD approves) when onboarding. | No UI. Add a `p2-visibility` script in W3-B. |

## 2. W3-A — no false "saved" (first)

Goal: a person never sees a change as saved, logged or announced when the rules refuse it.

### A-1 Capabilities in one place (`src/roleUi.js`)

Pure helpers, unit-tested, used by every surface below. Inputs are the v2 `roles`, `uid`, `isOwner`, the item.

- `canCreateActionOn({ isOwner, roles, uid, task })` — Owner always; otherwise the task's workstream is managed by `uid` (PM / Deputy of its program, or Sub-PM of the WS). Also `actionTaskOptions(project, roles, uid, isOwner)` = the tasks a person may attach a new action to.
- `actionEditMode({ isOwner, roles, uid, action })` → `'full'` (Owner / manager of its WS) | `'pic'` (PIC only: status except Cancelled, steps, comments) | `'comment'` (any other project reader, after D1) .
- `taskPanelCaps({ isOwner, roles, uid, task })` → `{ health, refs, resolveBlocker, comment }` matching `firestore.rules` (Owner, manager, PIC while open, contributor append-only; `comment` true for every reader after D1).
- `canTickStep({ uid, action })` = action PIC (or Owner / manager).

### A-2 Gate the surfaces that are still ungated

| Surface | Change |
|---|---|
| New action (Actions tab, My Work, My Work task row, task panel) | Hidden when the person can attach to no task; milestone becomes **required** for non-Owner and lists only `actionTaskOptions`. |
| Action edit form and My Work inline action row | Fields follow `actionEditMode`; "Cancelled" only for `'full'`; pencil hidden for `'comment'` (comment box stays). |
| Task panel: Health, health note, References, Resolve blocker, Add action | Follow `taskPanelCaps`; disabled controls get a one-line reason. |
| Project settings | Read-only for non-Owner (no Save, no Add / Remove, no Lock). |
| My Work contributor rows | No ✓ and no status menu; muted line "Only the PIC submits". |
| Step ✓ (My Work, task row) | Per D3. |
| Backup JSON | Owner only (D4). |

### A-3 A refused save is undone and named

On a `denied` result for a v2 project: revert that project in memory to its last saved tree (`v2SavedTree`, already used for close requests), drop the queued edits, and toast `Not saved: you can't change <field> on <item>`. Replace the fixed banner text ("…use Submit as done…") with that message. No reload needed.

### A-4 Activity and Chat only after the save succeeds

Activity entries and Chat cards produced by an edit are queued with that project's pending save and sent only when the save returns `ok`; dropped on `denied`. Applies to task, action, project-settings and action-create paths.

### A-5 Owner operations that report wrong

- **New project / Import Excel create v2 projects** (O1): new doc carries `schemaVersion: 2`, `visibility: 'restricted'`, `memberUids: [owner uid]`; the imported tree is written through the v2 save path. If import cannot be made v2 safely in one PR, block Import with a message and do it in a follow-up (plan decides, ledger the ruling).
- **Delete project** returns a status; on failure keep the project and show an error; confirm text says it can be restored by the Owner (soft delete) (O2).
- **Lock / Unlock weights** saves immediately after its confirm (O3).
- **Chat webhook** saves only on Save, not on blur (O12).

Acceptance: for each row of A-2, a member / PM / Sub-PM never sees a control the rules refuse; a forced refusal (e.g. stale tab) reverts and names the item; Activity contains no entry for a refused change; `npm test`, lint gate, build green.

## 3. W3-B — before onboarding

- **B-1** uid backfill script for tasks / actions assigned by name before first sign-in (preview → HOD approves → apply), plus UI hint "Assignment not linked to your account yet — ask the Owner" (M1).
- **B-2** Mentions resolve through the directory (`canonicalPerson`) and include Submitted / closed tasks (M2).
- **B-3** "Rejected" item in My Work Needs attention with the reason (M3); reload projects when the tab regains focus and nothing is pending.
- **B-4 (rules)** D1 comment for every project reader (task + action `updates` append-only).
- **B-5** `p2-visibility` script (D5).
- **B-6** Mitigation / decision rows in My Work: note who can update, excluded from the red badge for non-editors (M6).

## 4. W3-C — Plan, All projects, FOCUS, Portfolio

- **C-1 Gantt grouping**: Program → Workstream header rows (collapsible, summary bar from earliest start to latest end, % from `rollup`); Submitted / Dropped drawn distinctly.
- **C-2 Gantt in All projects**: Project → Program → Workstream rows only (no tasks) on one time axis, to see when the department is busy. Outline / Mind map in All projects show a project list to open instead of the placeholder.
- **C-3 One filter rule**: project selector + FOCUS appear only on project tabs (Plan, Actions, Decisions, RAID, Dashboard); hidden on My Work, Portfolio, Team, Credits, Activity. FOCUS applies to every project tab including Actions / Decisions, tab counts and the header progress line. RAID's separate scope is removed. FOCUS resets wherever the project changes; for a manager it re-presets to their program; at landing a manager goes to the first project where they hold a role.
- **C-4 Portfolio**: clicking a project opens it (Plan); an **Approvals strip** lists every pending close request, deadline request and RAID activation across projects with waiting days, linking to the place to act (D2).

## 5. W3-D — remaining operations

Owner: View as hides admin actions and returns to Team on exit (O6); Restore checks the file before confirming and gives the script command (O7); Members modal on v2 shows member / not member only (O8); Activity tab renamed "Coaching", full filterable activity log for the Owner (O9); one workload helper for all views (O10); Briefing tab opens Owner digest for the Owner, Meeting mode defaults to the current project (O11); Deactivate asks for confirmation and lists what the person holds (O13); header polish (O14).
PM: RAID / deadline items show "Waiting for HOD" (P1, P2 under D2); workstream date check only when dates change, WS window shown (P3); workstream delete message (P4); Sub-PM picker hint (P5); drag hints per capability and refusal toast (P6); Chat on reassign / escalation, deep-link "no access" toast (P7); Submitted colour in Mind map (P8).

## 6. Non-goals

No App.jsx restructuring; no workspace switcher; no visibility UI (D5); no per-step docs (D3); no change to who approves (D2).

## 7. Rollback

UI PRs: Vercel Promote previous deployment, then `git revert -m 1 <merge>`. Rules PRs (B-4): Console → Rules history → previous ruleset (ID recorded in CLAUDE.md before publish). Scripts (B-1, B-5): manifest-based rollback like `p2-migrate`, preview first.
