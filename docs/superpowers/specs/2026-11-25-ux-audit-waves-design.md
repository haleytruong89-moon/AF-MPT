# UX audit 25/11 — waves 1b to 5 (design)

- Source: `docs/reviews/2026-11-25-ux-routine-audit-2.md` (summary, HOD decisions in §6) and `docs/reviews/2026-11-25-ux-audit/` (findings MB-*, PM-*, market checklist).
- HOD decided 25/11: all six questions as recommended (recorded in `CLAUDE.md` Key Decisions).
- Wave 1 (MB-1..5, MB-8, PM-14, PM-8 A) is PR #60; not repeated here.
- Rules: unchanged in waves 1b–4. Wave 5 has one rules change (Q5-B). Hiding something in the UI is not security: rules still let a project member read the project's data. This is stated in the decision and must not be presented otherwise.

## Intent

The app is used to score performance. Each person must see what happens to their own work; each manager must see what needs them in their own scope; nobody is shown other people's scores by default. The screens follow the working rhythm: day (My Work), week (meeting, briefing), month (dashboard, report), quarter / year (personal record, evidence).

## Non-goals

- No new tabs. New content goes into existing screens (My Work sections, Dashboard panels, Meeting mode lists).
- No restructuring of `App.jsx`; new logic goes into small pure modules with unit tests (pattern of wave 3).
- No change to how credit is computed, weighted or locked.
- No peer comparison for members; no credit points for PMs (Q2: on-time / late only, review end of Q1/2027).
- No backend, no scheduled jobs (anything time-based is computed in the browser).

## Wave 1b — the six decisions that are UI only

| Id | Behaviour | Copy |
|---|---|---|
| Q1 / MB-16 | Task panel "Credit projection": the Owner and managers of the task (`managerLevel` non-null) see every row as today; everyone else sees only their own row(s) plus the task pool total. Dashboard "Recent activity" panel is not rendered for non-Owners (View as included) | "Your share" heading for the single row; pool line unchanged |
| Q2 / PM-26 | Outline credit pool banner for non-Owners: one muted line "Credit pool: N cp · Year Y" (no weights explanation, no top line). Weight badges stay | — |
| Q3 / PM-18 | RAID list: a `PendingApproval` item is visible to its creator, the Owner, and anyone for whom `canEditRaid` is true on that program. Non-Owners see the existing "Waiting for Owner approval" badge and note and no approve / reject. The program sidebar hourglass shows only when the viewer can see at least one pending item. The add form note becomes "New items wait for the Owner's approval before the whole team sees them." | as left |
| Q4 / PM-2 | A task with an unresolved blocker update (`isBlocker && !resolvedAt`) creates a `needsAttention` item for every manager of that task (`managerLevel` non-null: Sub-PM of its WS, PM / Deputy of its program, Owner), except the author of the blocker. Row: "🚩 Blocker on {task} — {author}: {text}" + Open (panel beside My Work). Counted in the My Work badge. On posting a new blocker update, a Chat card goes to the project webhook (same gate as close cards, fire-and-forget, only after the save succeeded) | Card top label "🚩 BLOCKER", text "{author} flagged a blocker on {task}: {text}", button "Open task" |

Calls (builder): blocker items are not deduplicated across tasks (one per task, newest blocker text); the Chat card is sent once per new blocker update, from the browser that saved it, so no duplicate.

## Wave 2 — one scope rule (project selector + FOCUS, deferred C2)

Rule: **the header scope controls appear only on tabs where they filter; on those tabs everything on screen and anything launched from there obeys them; the scope defaults to "mine" and is remembered per project.**

| Id | Behaviour |
|---|---|
| R1 | My Work, Portfolio, Team, Credits, Coaching: project selector and scope select hidden; My Work header shows "All my projects". The project numbers ("% · done/total · overdue") hidden there too |
| R2 | Actions, Decisions, header numbers, tab counts (open items only), Meeting mode, Minutes defaults, Export Excel all use the scope. Actions: by the related task's program; actions with no task appear only under "All programs". Decisions: by stored claim program, else related tasks' program |
| R3 | Switching project restores the last scope chosen for that project (per browser, `uiPrefs`), else the first program I manage there (preferring one with open tasks), else "All programs" |
| R4 | At boot, a manager whose remembered project gives them no role lands on the first project where they have one |
| R5 | RAID's own `raidScopeProgramId` removed; arrivals from a task / My Work set the shared scope. RAID program sidebar hidden when a program is in scope |
| R6 | Scope options gain "My work stream: {name}" for people who lead a work stream in this project. Outline, Gantt, Dashboard, Meeting mode accept the work-stream node |
| R7 | Label "FOCUS" → "Scope" |

Acceptance: on every project tab, the number in the header, the tab counts and the list agree for the selected scope; changing project never shows an empty list caused by a stale program id.

## Wave 3 — the manager's lens

| Id | Behaviour |
|---|---|
| PM-1 | My Work gets a section for managers only, "My programs" (title uses "My work stream" for a Sub-PM only), above the personal lists: counts that open lists — Waiting for my approval · Waiting at Sub-PMs (PM / Deputy) · Overdue · Open blockers · No update for 7+ days (open tasks) · Deadline change requested. Scope = everything I manage across projects |
| PM-4 | "Waiting at Sub-PMs in my programs (n)" list: same row as "Needs my approval", approver name shown, Approve / Reject allowed (rules already allow a PM) |
| PM-5 | Deadline requests on tasks I manage listed as information: "Deadline change requested: {task} → {date} (Owner decides)" + Open |
| PM-3 | Approval row adds one line: "Due {end} · {on time / n days late} · last update {date}: {text}" |
| PM-7 | Closed task shows "Approved by {name} · {date}" or "Closed directly by {name} · {date}"; collapsible "Close history (n)" with each request, decision and reason |
| PM-21 + Q2 | Dashboard panel "By person" for the scoped node: person · open · awaiting approval · overdue · closed this year on time / late. No credit columns (Q2). Uses `personWorkload` + closed-task dates |
| PM-22 | Dashboard: title names the scope; "Due this week" = Planned / In Progress only; "Open tasks with no updates" → "No update for 7+ days" (sorted by days, every row opens); card "Awaiting approval"; small table per work stream (done/total · % · overdue) |

Definition (shared, unit-tested): **closed on** = `approvedAt` (set on a direct close and on an approval, `src/closeFlow.js:205, 242`). **On time** = closed on ≤ `end`; **late** = otherwise, in calendar days. A task without `end` is "no due date"; a task closed before P3.1 (no `approvedAt`) is "close date unknown"; neither counts as on time or late, and both are shown as such.

## Wave 4 — the personal record (Q6)

| Id | Behaviour | Copy |
|---|---|---|
| MB-14 | My Work, both modes, last section (collapsed): "Closed by me" with a period select (This month · Last month · This quarter · This year · Last year). Rows: tasks where I am PIC or contributor, Completed or Dropped in the period: task · project · closed on · approved by · on time / n days late · cp earned. Header: "n closed · n on time · n late · n cp" | — |
| MB-15 | Credit section in both modes with a year select (default current year, projects by `creditYear`). Under each project, my rows from the credit breakdown: task · share % · cp · earned / projected. Label under the section: "Projected — may change until the Owner locks the weights" when the project's weights are not locked. "Copy as table" on this section and on "Closed by me" | as left |
| MB-9 | An approved task stays in "Sent for approval" for 7 days with a green "Approved by {name} · {date}" chip | — |
| MB-6 | One name: "Request deadline change". The My Work button opens the dialog directly. Pending requests I sent appear in "Sent for approval" ("Waiting for Owner"). The last resolved request shows under "Deadline history": "Rejected by {name} on {date}: {note}" / "Approved …"; a rejection also appears in Needs attention for 14 days | as left |
| — | Visibility line at the top of the record: "Visible to you and the Owner." | — |

## Wave 5 — meetings and reports

| Id | Behaviour |
|---|---|
| PM-13 | Meeting mode uses the scope (wave 2); adds "Overdue" and "Due in the next 7 days"; rows open the item (exit meeting mode, open panel); "+N more" instead of silent cuts |
| PM-15 | Minutes: default = current project (all when All projects), From = today − 7 days, attendees pre-filled with the scope's PM / Deputy / Sub-PMs and task PICs |
| PM-16 / MB-11 | Briefing: scope select inside the dialog; generated on open; "Completed" by approval date (fallback end date); all unresolved blockers, new ones marked; rich copy built from the edited text; members open it from the ⋯ More menu any day; a "For you" block first |
| PM-24 | Export Excel: uses the scope; adds Contributors, Health, Closed on, Approved by, Original end, Latest update; in All projects: toast "Choose a project first" |
| Q5-B | Rules: a PM / Deputy may create an action scoped to their program without a related task (new field `programId` on the action doc; Owner unchanged). Emulator tests allowed / denied; HOD publishes after merge |

## Order and size

| Wave | PRs | Needs |
|---|---|---|
| 1b | 1 | — (decided) |
| 2 | 2 (R1–R3, R5, R7 core; then R4, R6) | — |
| 3 | 2 (My Work manager section; Dashboard + close trail) | wave 2 for scope |
| 4 | 1–2 | — |
| 5 | 2 (UI; rules for Q5-B) | wave 2; rules publish by HOD |

Each PR: unit tests for new pure helpers, typecheck, lint gate 2/32, build, CI green; check list in the PR for the Vercel preview; rollback = Vercel Promote + `git revert -m 1`.

## Left to the builder

- Exact placement inside existing sections, styling, empty-state text not quoted above.
- Module names for new helpers.
- Whether "My programs" counts are links to filtered lists or expandable sub-lists.
