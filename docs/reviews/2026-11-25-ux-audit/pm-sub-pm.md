# AF-MPT — UX/UI audit for PM and Sub-PM (routine by cadence)

- Date: 25 Nov 2026. Code: `main` at `b01d1a4` (after wave 3 + Replace person). Read-only code audit; nothing was run in a browser and no data was touched.
- Line numbers are `src/App.jsx` unless another file is named.
- "Verified" = read in the code. Items that depend on production data or on `firestore.rules` behaviour I did not read are marked **unverified**.
- Not re-reported: the wave 3 fixes of the 13 Nov audit (P1–P8, A1–A8). Where a fix is incomplete it is said so.

## 0. Summary

The approval flow itself is solid and the role gating is now honest (controls the rules refuse are hidden). What is still missing is the **manager's lens**: almost every screen is either "mine as PIC" (My Work) or "the whole project" (Actions, Decisions, Meeting mode, Minutes, Briefing, Excel, header numbers). A PM has one partial tool for "my program" (FOCUS on Plan / Dashboard / RAID) and a Sub-PM has none for "my work stream". The things a manager checks first every morning — what is blocked, overdue, stale or waiting in my scope, and who is overloaded — are not on any manager screen; several exist only on Owner-only tabs.

Severity counts: High 6 (including the scope rule of section 6), Medium 18, Low 10.

---

## 1. Daily

### Path (verified)

1. **Open the app** → tier `manager` if the user is PM / Deputy / Sub-PM in *any* loaded v2 project (`tabsByRole.js:22-28`). Landing = Plan (last used of Mind map / Outline / Gantt, default Outline), with FOCUS pre-set to the first program the user manages **in the last-remembered project** (`tabsByRole.js:65-85`, effect at 13487-13492). Tabs: Plan, My Work | Actions, Decisions, RAID | Dashboard | Briefing (`tabsByRole.js:46`).
2. **Approve / reject / reassign** → My Work tab (red badge = attention items + requests needing me, 13593) → section "Needs my approval" on top (12054-12061) → row with task name, breadcrumb, requester, "Waiting N working days", and the same `CloseControl` as the task panel: Approve / Reject (reason prompt) / "Reassign…" select (9076-9108, `components/CloseControl.jsx:107-126`).
3. **What is overdue / blocked / stale in my program** → Dashboard tab with FOCUS on the program: 4 stat cards, "Top blockers" (max 6), "Due this week", "Overdue", "Recent updates" (8), "Recent activity" (15), "Open tasks with no updates" (10) (7760-7887). Or scan the Outline (red date + status pill per row, 7690-7723).
4. **Chase people** → click a task → panel → Updates tab → post an update with `@mention` (3990-3998). The mention shows in that person's My Work. Actions tab has "Email PICs" (5491-5506).
5. **Update own tasks** → My Work (By project / By urgency) or task panel; a manager's own task must be submitted (`closeWiring.js:163-165`); a PM's own task goes to the Owner (`closeFlow.js:71-78`).
6. **Create an action from a discussion** → task panel → Actions tab → "Add action" (4042-4063), or Actions tab → "New action" (5456), or My Work → create (`ActionCreateModal`, 5078-5122).
7. **Handle a blocker** → task panel → Updates → "Mark resolved" on the blocker entry (`resolveBlocker`, 3596-3611).

### What works well

- "Needs my approval" sits above everything in My Work, in both sub-views, with working-day age and an escalation pill; decisions are made in place.
- Reject forces a reason, writes it as an update on the task and posts to Chat; the requester gets a "Close request rejected" item.
- `Your role:` chip next to the project selector, with every role in the tooltip (14922-14936).
- A manager cannot close or approve their own task; the control simply shows Submit instead.

### Findings

**PM-1 · High · No "my program / my work stream" attention view**
- Now: `computeMyWork` only collects items where I am PIC, contributor, sub-task owner, mitigation PIC or decider (895-1040). Nothing in it depends on being PM / Sub-PM. The only manager lens is Dashboard + FOCUS, which has no approvals count, no "awaiting approval" count, no by-person view, and its "stale" list is really "never had an update" (7798).
- Why it hurts: the manager's first question each morning ("what in my area needs me today") takes three tabs (My Work for approvals, Dashboard for overdue / blockers, Outline for the rest) and still misses stale tasks.
- Change: add one section to My Work for managers, "My programs" (or the same strip above Plan): counts + click-through lists for *waiting for my approval · waiting at a Sub-PM · overdue · active blockers · no update for 7+ days · deadline change requested*. All inputs already exist: `ownerQueue()` returns `program` / `workstream` on every item (`ownerQueue.js:11-38`) and only needs filtering by `managerLevel`; stale-days logic exists in `computeActivityIndex` (473-490).

**PM-2 · High · A blocker raised on a task I manage does not reach me**
- Now: posting an update flagged "blocker" only writes the update and an Activity line (14265). No My Work item, no badge, no Chat card (`chatNotify.js` builds cards for action, new action, close submitted / reassigned / rejected only: lines 53, 123, 216, 238, 258). The manager sees it only by opening Dashboard ("Top blockers", sliced to 6, 7792-7796) or if the author happened to @mention them.
- Why it hurts: the blocker flag is the Assignee's way of asking the manager for help; today it is silent.
- Change: in `computeMyWork`, when `managerLevel(roles, task.id, uid)` is non-null and the task has an unresolved blocker update, push a `needsAttention` item "Blocker on <task> — <author>" with Open. Optional second step: a Chat card on a new blocker, same pattern as `buildCloseSubmittedCard`.

**PM-3 · High · Approving without evidence, and reviewing throws me out of the inbox**
- Now: the approval row shows name, breadcrumb, requester, outcome and waiting time (9085-9104). It does not show the planned end date (on time or late?), the last update, deliverables or reference links. The submit itself carries no note (`closeFlow.js:220`, `note: null`). To check, I click the task name → `onTaskClick` switches project **and sets the view to Outline** (15120-15126). I lose the inbox and must return to My Work for the next request. The task panel does not need the Outline: it renders beside any view (15243-15256; the comment at 13399 says exactly that).
- Why it hurts: approval awards credit used for performance scoring; a one-click Approve with no evidence on screen invites rubber-stamping, and the round trip per request is slow with 5+ requests.
- Change: (1) in the My Work `onTaskClick`, drop `setView('outline')` so the panel opens beside the inbox; (2) add one line to the row: "Due 12 Nov · submitted 2 days late · last update 14 Nov: …"; (3) optionally let the requester add a short note when submitting (the field exists and is passed to the Chat card, 13961).

**PM-4 · Medium · A PM cannot see requests waiting at their Sub-PMs until they escalate**
- Now: `approvalBuckets.needsMine` = I am the named approver, or the request has waited 3 working days and I am an escalation target (`approvalsInbox.js:62-64`). Yet a PM may decide any request in the program from minute one (`closeFlow.js:119`, the `lvl === 'pm'` branch). The Owner has "Waiting for you" on Portfolio; a PM has nothing equivalent.
- Why it hurts: the PM cannot answer "how many of my program's tasks are stuck in approval, and with whom" without opening every work stream.
- Change: third section in My Work for PM / Deputy, collapsed: "Waiting at Sub-PMs in my programs (n)" — same row, approver name shown; Approve / Reject already allowed.

**PM-5 · Medium · Deadline change requests from my people are invisible to me**
- Now: only the Owner gets deadline requests in My Work (`if (isOwner && t.deadlineRequest)`, 952-955). A PM / Sub-PM sees the request only by opening that task (banner, 3955-3963). Meanwhile the manager may edit End directly inside the work-stream window (3812-3822) and the request stays pending with a small note (3447-3449).
- Why it hurts: the manager is the one who knows whether the slip is acceptable, but learns about it last; the direct edit and the pending request can contradict each other.
- Change (no rule change, Owner still decides): show managers an informational item "Deadline change requested: <task> → <new date> (Owner decides)" with Open; in the banner, for a manager, add "Add a comment for the Owner" next to "Only the Owner approves deadline changes".

**PM-6 · Medium · The Outline cannot be filtered to what needs attention**
- Now: one search box that matches program / work stream / task **names** only (7541-7542, used at 7690); not PIC, not status. No quick filters. A task row shows health dot, name, PIC, end date, update count, weight badge, status pill (7708-7723) — no blocker flag, no "pending approval since".
- Why it hurts: Outline is the manager's landing screen; "show me overdue", "show me Hoa's tasks", "show me unassigned" are daily questions that mean scrolling a 100+ row tree.
- Change: let `matches` also test `t.pic`; add four chips beside the search (Overdue · Blocked · Pending approval · No PIC) that filter task rows the same way `q` does; add a flag on rows with an unresolved blocker.

**PM-7 · Medium · The approval trail is not visible on the task**
- Now: `closeRequestHistory`, `approvedByUid`, `approvedAt`, `closedByUid` are written (`closeFlow.js:205, 242`) but never rendered (only read for Chat cards, 13967-13975). A Completed task shows a "Completed" chip and nothing else (`CloseControl.jsx:100-104`). Earlier rejections survive only as an update line "Close request rejected: …". The Activity log is Owner-only (15160).
- Why it hurts: at review time a manager cannot tell who approved a task, when, or how many times it bounced — exactly the evidence the flow was built to create.
- Change: under the closed chip show "Approved by <name> · <date>" (or "Closed directly by <name>"); add a small collapsible "Close history (n)" like the existing "Deadline history" block (3965-3980).

**PM-8 · Medium · "Related milestone *": jargon, and no home for a general follow-up**
- Now: the action form labels the task link "Related milestone" and, for a non-Owner on v2, makes it mandatory with the placeholder "— Choose a milestone in your work stream —" (4874-4879). "Milestone" also appears in the task panel ("No decisions / actions linked to this milestone yet", 4025, 4067), the decision form (4438), Meeting mode ("milestones complete", 6124) and Briefing (12894-12895). Everywhere else the same object is a "task". Steps cannot be added while creating (4927-4937).
- Why it hurts: a meeting follow-up that is not about one task ("ask Legal for the template") cannot be logged by a PM at all, and the form does not say why; "milestone" makes people look for something that is not in the tree.
- Change: rename to "Related task" everywhere; under the field add "Actions belong to a task in a work stream you manage. For anything else ask the Owner." Allow steps in create mode (the editor already works on a plain array).

**PM-9 · Low · Reassign and Approve are bare one-click controls**
- Now: "Reassign…" is a select that fires on change with no confirmation (`CloseControl.jsx:119-124`, `reassign` at 86-90); the label does not say it changes the *approver*, not the task's PIC. Approve is one click with no toast and no undo (the Undo toast exists only for a direct completion from My Work, 11889-11896).
- Change: label "Change approver…"; confirm "Send this request to <name>?"; after Approve show a toast "Approved — <task> is Completed".

**PM-10 · Low · An escalated request does not say whose queue it came from**
- Now: in "needs" mode the row shows "Requested by …" and "Waiting N working days — escalated" (9080-9099), not the original approver.
- Change: append "· was with <approver name>".

**PM-11 · Low · Approval is silent in Chat**
- Now: cards exist for Submitted, Rejected, Reassigned only (`chatNotify.js:216-258`). The requester learns of an approval when the row disappears from "Sent for approval". (Remainder of the old P7.)
- Change: optional one-line card on Approved.

**PM-12 · Medium · [Sub-PM] Actions tab: whole project, same Edit button, different result**
- Now: Actions lists every action of the project, ignores FOCUS, default status filter "All" so Done and Cancelled are included (5229-5231, 5262-5266); the tab count is the total including closed ones (14982). Every row opens the same form; for an action outside my work stream it opens in "comment" mode with a grey line at the top (4826-4830).
- Why it hurts: a Sub-PM with 6 actions in their work stream scans 60; the same click edits here and is read-only there, discovered only after opening.
- Change: add a "Scope" select (My work streams / All) defaulting to mine for non-Owners, using `managesWs` + `actionWsId` (`roleUi.js:209-222`); default the status filter to open statuses; tab count = open actions; a small lock icon on rows that will open read-only.

---

## 2. Weekly

### Path (verified)

- **Meeting mode**: header button `⋯ Export` → "Meeting mode" (15017, 15293) → full-screen, read-only page: per project % complete, health pills, counts, "Active blockers" (first 5), "Recent decisions" (first 5), "Open actions" (first 8); toggle This project / All projects (6022-6185).
- **Minutes**: `⋯ Export` → "Minutes…" → dialog: date range, attendees, project checkboxes → Markdown preview → copy / download / Gmail (6626-6770).
- **Briefing**: the "Briefing" tab opens a dialog (14994) → look-back 3 / 7 / 14 days → Markdown: at a glance, talking points, overdue, decisions to review, new decisions, active blockers, resolved blockers, completed (12826-12990).
- **Re-plan / assign**: Outline → click task → pencil → PIC, contributors, Start, End (inside the work-stream dates), Save (3760-3822); drag a task to another work stream in my program (PM only, `roleUi.js:86-93`). New task: "+" on the work-stream row → name prompt (7349-7361).
- **RAID**: RAID tab → program sidebar → cards; "Add" → modal → "Submit for approval" (10448-10605); mitigations inline on the card and also listed on the Actions tab (5510-5540).
- **Decisions**: Decisions tab or task panel → "Add decision" (4006-4010).

### What works well

- Minutes output is good: grouped by project and task, three copy targets.
- RAID register: type tabs, Active / Closed toggle, "needs review" after 7 days, mitigations surfaced on Actions and My Work.
- Outline hides "+ / rename / delete / drag" exactly where the rules refuse, and says why a drop was refused.

### Findings

**PM-13 · High · Meeting mode cannot run a program or work-stream meeting**
- Now: scope is "This project" or "All projects" only; FOCUS is ignored (the component does not receive it, 15404-15408). It is read-only and nothing is clickable (6140-6182): I cannot open the blocked task, resolve a blocker, add an action or log a decision without pressing Esc and navigating. It shows the overdue **count** but not the overdue tasks, no "due next 7 days", no requests awaiting approval, no RAID. Lists are cut at 5 / 5 / 8 with no "+N more" (6096, 6097, 6144). `dateFrom` / `dateTo` are never passed, so "Recent decisions" is simply the first five (15404-15408 vs 6038-6045).
- Why it hurts: the weekly meeting is where a manager would use the app in front of the team; today the screen is a static slide for the whole project, so the PM runs the meeting from the Outline instead.
- Change: pass `scopeProgramId` and filter the project node like `DashboardView` does (7761-7765); add two lists "Overdue" and "Due in the next 7 days" (code exists in Dashboard, 7771-7777); make task / action rows call `onExit()` and open the item; show "+N more".

**PM-14 · Medium · Meeting mode and Roles are filed under a button called "Export"**
- Now: for a non-Owner the header button reads `⋯ Export` (15017) and contains Meeting mode, Minutes…, Export Excel, Members & related parties…, Roles…, Project settings… (15293-15315).
- Why it hurts: a PM looking for "assign a Sub-PM" or "start the meeting" has no reason to open "Export". (Old O14, still open, more visible now that the manager has fewer other entry points.)
- Change: label the button "⋯ More" (or "Project") for everyone; inside, order as Meeting mode · Minutes · Roles · Members · Export Excel · Project settings.

**PM-15 · Medium · Minutes dialog defaults fight the weekly use**
- Now: every project is ticked (6630), the range is today → today (6628-6629), no program scope, attendees typed by hand. Meeting mode, by contrast, defaults to the current project (W3-D1).
- Why it hurts: three corrections before every weekly export; forgetting to untick puts other projects' updates in my minutes.
- Change: default = current project only (all when in All projects), From = today − 7 days; pre-fill attendees with the PM / Deputy / Sub-PMs and task PICs of the program in scope.

**PM-16 · Medium · Briefing is workspace-wide and three of its numbers are off**
- Now: (a) it always covers every loaded project, with no project or program choice (13158, 12861); (b) "Completed this week" tests the task's **planned end date**, not when it was approved (`t.status === 'Completed' && inWindowDate(t.end)`, 12882) — a task due last month and closed yesterday is missing, one due this week but closed a month ago is listed; (c) "Active blockers" lists only blockers **raised inside the window** (12875, 12958), so a three-week-old open blocker drops off; (d) the preview is editable, but "Copy rich text" regenerates from data and discards the edits (13167-13171); (e) it is the only tab that opens a dialog instead of a screen (14994).
- Why it hurts: this is the natural "report upward" artefact for a PM, and it can be neither scoped to their program nor trusted on completions.
- Change: add a scope select (This project / program in scope / All); use `approvedAt` (fallback `end`) for completions; list all unresolved blockers and mark the new ones; make the preview read-only or build the rich copy from the edited text.

**PM-17 · Medium · Planning a new task takes six steps and the work-stream window is hidden**
- Now: "+" asks for a name only and creates a task with no PIC and no dates (7349-7352); the panel does not open, the new row sorts to the bottom of the work stream (undated last, `ganttRows.js:46-56`); the manager must find it, click it, press the pencil, fill in, Save. The work-stream dates that bound the task dates are shown only inside a task's edit form (3434-3438) — not on the work-stream row of the Outline, not on the Gantt.
- Why it hurts: weekly and quarterly planning is many tasks in a row; and "Outside the work stream dates" (3492) arrives as an error after the fact.
- Change: after creating, call `onTaskClick(t.id)` and open the panel in edit mode; show "1 Oct – 31 Dec" in muted text on the work-stream row (the data is in `roles.workstreams[ws.id]`).

**PM-18 · Medium · A RAID item logged by my Sub-PM is hidden from me until the Owner activates it**
- Now: `PendingApproval` items are visible to their creator and the Owner only (10917-10918). The program sidebar still shows an hourglass for the program (`hasPending`, 11013, 11040), so a PM sees an hourglass and an empty list. The add form says "New items start as **PendingApproval**. Workspace owner must approve before everyone can see." (10605) — a raw status name. This applies to Issues too, i.e. things that are already happening.
- Why it hurts: the PM is accountable for the program's risks but is the last to see a new one; the hourglass with nothing behind it looks like a bug. (Old P1: label fixed in W3-D3, visibility not.)
- Change (a UI filter only — the RAID doc is per program and already loaded): show pending items to PM / Deputy / Sub-PM of that program (`canEditRaid`) with the existing "Waiting for Owner approval" label and no approve button; reword the form note to "New items wait for the Owner's approval before the team sees them." Needs HOD agreement (section 9).

**PM-19 · Medium · A new decision is filed under my first program, whatever it is about**
- Now: for a non-Owner the planner claims a new decision for "the first program where I am PM, else my first work stream" (`planV2Save.js:331-336`), ignoring the related tasks; only the Owner path uses `programOfRelatedTasks` (455-458). The Decisions list shows no program, ignores FOCUS, and filters by "milestone" only (4651-4656, 4704).
- Why it hurts: a PM of two programs logs a decision about program B and it is stored under A; B's Deputy / Sub-PM then see it read-only with "Only the PM / Sub-PM of its program can update the follow-up", and nobody can tell which program that is.
- Change: for non-Owners use `programOfRelatedTasks` first when the caller holds a role in that program, falling back to today's rule; show a program chip on each decision row; add a program filter (or obey the scope, section 6). **Unverified:** that the rules accept a claim on a program other than the caller's first one (they should: the claim is checked against the caller's role in that program).

**PM-20 · Low · PIC of a RAID mitigation still cannot mark it done**
- Known limit (P3.2 deferred); the note "Only the PM / Sub-PM of <program> can update this. Tell them when it is done." is shown (`roleUi.js:141-144`). For the manager it means mitigation status is updated by hand after a chat message. Listed so it is not forgotten; no change proposed beyond P3.2.

---

## 3. Monthly

### Path (verified)

- **Progress vs plan**: Plan → Gantt with FOCUS (program → work stream → task rows, summary bars with %, today line, zoom day / week / month; `GanttView.tsx:95-115`, `ganttRows.js:66-88`); Outline rows show `done/total · %` per program and work stream (7620, 7676); Dashboard stat cards (7805-7810).
- **Workload of my people**: no screen (PM-21).
- **Slippage / deadline requests**: task panel only — "Deadline history" block and request banner (3955-3980).
- **Report upward**: `⋯ Export` → Export Excel (whole project, 14786-14790), Briefing, Minutes; or screen-share Gantt / Dashboard.

### What works well

- Gantt after W3-C1: grouping, folding, Submitted dashed, Dropped struck through, today line scrolled into view.
- One progress formula everywhere (`rollup` and `nodePct` agree; Dropped excluded).

### Findings

**PM-21 · High · A manager has no workload view of their people**
- Now: `personWorkload` is used only by Team and Portfolio (8555, 9804), both Owner-only tabs (`tabsByRole.js:45-46`; guards at 15207-15240). On the Gantt the PIC is only in the bar tooltip (`GanttView.tsx:617`); the Dashboard has no by-person panel.
- Why it hurts: assigning and re-assigning is the manager's weekly job, and "who has room" cannot be answered inside the app.
- Change: add a "By person" panel to Dashboard: for the scoped node, one row per PIC with open · awaiting approval · overdue · open actions. `personWorkload` accepts a project list, so pass `[{ ...project, programs: [scopedProgram] }]`; no new logic.

**PM-22 · Medium · Dashboard under FOCUS: wrong labels, leaky lists, no work-stream level**
- Now (7760-7887): no heading says which program is shown; cards still read "Overall progress" and "Timeline — project span" (7806, 7809). "Due this week" excludes only Completed, so Dropped and Submitted tasks appear as due (7771-7775). "Open tasks with no updates" means *never* updated, includes Submitted, shows 10 and a dead "+ N more" (7798, 7880-7884). "Recent activity" is the whole project regardless of FOCUS (7862-7870). No count of tasks awaiting approval; no per-work-stream breakdown.
- Why it hurts: the PM's monthly number comes from here; a Sub-PM gets the parent program's numbers, never their work stream's.
- Change: title "Dashboard — <program>"; relabel "Program span"; filter Due this week to Planned / In Progress; replace the last panel by "No update for 7+ days" (open tasks, sorted by days, every row clickable); add a fifth card "Awaiting approval"; add a small table "Work streams: done/total · % · overdue" (the per-`ws` rollup is already used in Outline).

**PM-23 · Medium · Slippage is not visible anywhere above a single task**
- Now: `deadlineHistory` and a pending `deadlineRequest` are rendered only in the task panel (3955-3980). The Gantt draws current dates only; a manager has no "moved this month" list (the Owner has the Portfolio strip for pending requests).
- Why it hurts: "what slipped this month and why" is the core of a monthly review; today it means opening tasks one by one.
- Change: Dashboard panel "Deadline changes (last 30 days)": task · from → to · by · reason, with pending requests on top; built from `deadlineHistory` / `deadlineRequest` of the scoped tasks.

**PM-24 · Medium · Export Excel is an import sheet, not a report**
- Now: always the whole project, FOCUS ignored (14786-14790); columns are the import template (1758-1771): no contributors, health, closed / approved date, approver, original end. "Latest check-in" reads the legacy `checkIns` array (1770) while the app now writes `updates` (3585-3593), so the column is empty for current work. In All projects the menu item does nothing and says nothing (`if (!project) return`, 14787; old M7, still open).
- Why it hurts: this is the only file a PM can hand upward or keep as evidence.
- Change: respect the scope (file name gets the program); add Contributors, Health, Closed on (`approvedAt`), Approved by, Original end (`deadlineHistory[0].from`), Latest update (newest of `updates`, fallback `checkIns`); in All projects show a toast "Choose a project first".

**PM-25 · Low · Gantt is silent about undated tasks**
- Now: a task without both dates draws no bar and no hint (`GanttView.tsx:603-604`).
- Change: show "no dates" in muted text in the row so the gap is visible while planning.

---

## 4. Quarterly

### Path (verified)

- **Re-plan**: Outline → "+" on my program (work stream, PM only) / on a work stream (task, PM or its Sub-PM) (7623, 7680); rename / delete work stream (PM); drag tasks between work streams inside the program (PM). A PM-created work stream has no dates; only the Owner sets them (`roleUi.js:47-49, 64`). Weights: Owner only in the UI at every level (7366, 7377, 7390).
- **Change Sub-PMs**: Sub-PM picker on the work-stream row in Outline (7654-7663), or `⋯ Export` → Roles… (15582-15650), or ⋯ on a Mind map node; the confirmation lists pending requests that will move.
- **Credit of my people**: Outline shows cp on each weight badge and a "Credit pool" banner; the task panel shows "Credit projection"; My Work shows my own credit. The Credits tab is Owner-only.
- **RAID review**: RAID tab, "needs review" markers, trend history per card.

### What works well

- Role changes: one confirm with the consequences spelled out, Activity `role_changed`, pending requests re-routed.
- Deleting a work stream that only has Dropped tasks now explains why it is kept.

### Findings

**PM-26 · Medium · Credit: managers see the machinery but not the distribution**
- Now: the top of the manager's landing screen (Outline) is a permanent blue "Credit pool: N cp · Year … Weights set by workspace owner." banner (7556-7584) and every row carries a weight badge (7624-7632, 7664-7672, 7711-7721). The one line that would tell a manager something — "Top: name cp" — is Owner-only (7578), as is the Credits tab. So a PM sees pool sizes and percentages but cannot see how credit lands on their people.
- Why it hurts: prime screen space is spent on something the manager cannot act on, and the quarterly question "is credit in my program distributed sensibly" has no answer.
- Change: collapse the banner to one muted line for non-Owners. Separately, **HOD decision needed**: may a PM see per-person projected / earned credit for their own program? If yes, the "By person" panel of PM-21 can carry two more columns from `computeProjectCredits`.

**PM-27 · Medium · [Sub-PM] The app treats a Sub-PM as if they managed the whole program**
- Now: the landing FOCUS for a Sub-PM is the *parent program* (`tabsByRole.js:70-74`); the Outline then expands **all** work streams of that program (7254-7262) with no "yours" marker; Dashboard, Gantt summary and RAID show program-wide numbers; in sibling work streams the "+", pencil and drag grip are simply absent (7680-7682, 7705) with no explanation. FOCUS offers programs only (14949-14953).
- Why it hurts: the Sub-PM has to re-find their work stream on every screen and learns the boundary by missing buttons — the "works here, refused next door" confusion.
- Change: (1) the scope list gains the work streams I lead ("My work stream: <name>") — see section 6, R6; minimum version: on landing expand only my work stream(s), collapse the siblings, and put a small "You" tag after "Sub-PM: <name>" on my row; (2) Dashboard / Gantt accept a work-stream scope the same way they accept a program (both already take a node: 7761-7765, `ganttRows.js:66-70`).

**PM-28 · Low · Roles… for someone who cannot assign anything**
- Now: every non-Owner sees "Only project members are listed. Ask the Owner to add someone." at the top of Roles (15617-15619), including a Sub-PM for whom every picker is read-only. The table is not pre-scoped to FOCUS when opened from the header (a focus only comes from the Mind map menu, 15364).
- Change: show the note only when at least one picker is editable for me; open with `focus = { programId: scopeProgramId }` when a program is in scope.

**PM-29 · Low · [Sub-PM] No way to hand over approvals before leave**
- Now: changing the approver of a pending request is PM / Deputy / Owner only (`closeWiring.js:171-175`); a Sub-PM's queue just waits 3 working days and escalates.
- Change: no rule change; in the "Needs my approval" header for a Sub-PM add the hint "Away? Ask your PM to take these — they can approve any request in the program." Moot once PM-4 is done.

**PM-30 · Low · Work-stream dates for a PM-created work stream**
- Now: a PM adds a work stream with no dates and cannot set, see or request them (`roleUi.js:47-49`); until the Owner sets them, the "inside the work-stream window" rule does not bind. The request path (`scope_deadline` approvals) is P3.2, deferred.
- Change: after "Add work stream" show a toast "Ask the Owner to set its dates"; show "no dates set" on the row (with PM-17).

**PM-31 · Low · Task weights** — **unverified against the rules**: the UI lets only the Owner set task weights (7390), although the HOD ruling quoted in `CLAUDE.md` (wave 2, Q2) names only program / work-stream weights as Owner-only. If the rules allow PM task weights, the badge should be editable for the PM; if not, nothing to do.

---

## 5. Yearly

### Path (verified)

- **Evidence per person**: none for a manager. Credits (per person, per year, Excel export, 12510-12820), Team, Coaching and the Activity log are Owner-only (`tabsByRole.js:45`; 15160, 15207-15240). A manager sees their own credit in My Work and can open tasks one by one.
- **Close out / roll over a program**: nothing. A PM cannot rename, archive or delete a program (`programEdit: false`, `roleUi.js:61`); finished programs stay in the FOCUS list and the Outline.

### Findings

**PM-32 · Medium · No "what did each of my people deliver" for the manager who writes the review input**
- Now: as above; in addition the approval date and approver are not shown on tasks (PM-7) and not exported (PM-24), so "delivered on time" cannot be reconstructed by a PM even by hand.
- Why it hurts: the approval flow exists to make this data trustworthy, but only the Owner can read it out; PMs will keep their own spreadsheets.
- Change: smallest useful step = PM-24's extra Excel columns + scope (gives task · PIC · contributors · planned end · closed on · approved by for my program). A per-person screen for managers needs the HOD decision in PM-26.

**PM-33 · Low · No end state for a finished program**
- Now: nothing marks a program as closed; `landingFor` picks the first program I manage by object order (`tabsByRole.js:65-67`), which can be a finished one.
- Change: when choosing the landing scope prefer a program that still has open tasks.

---

## 6. Project selector + FOCUS (deferred C2)

### Current behaviour (verified)

State: `currentId` (a project or `__all__`), `scopeProgramId` (FOCUS), `raidScopeProgramId` (RAID's own). FOCUS is rendered whenever a project with programs is selected, on every tab (14945-14955). `switchProject` always resets FOCUS to "All programs" (14611-14620). FOCUS is not persisted; on load it is set once from `landingFor` (13487-13492).

| Tab / feature | Project selector | FOCUS | In "All projects" |
|---|---|---|---|
| My Work | no effect on content (always all projects); still silently changes the current project | shown, no effect | same content |
| Plan · Mind map | yes | yes (6817-6822) | "Choose a project" list (15234-15237) |
| Plan · Outline | yes | yes (7242-7246) | "Choose a project" list |
| Plan · Gantt | yes | yes (`ganttRows.js:68`) | all-projects Gantt (15231-15233) |
| Actions | yes | **no** (15162) | cross-project Aggregation view (15164) |
| Decisions | yes | **no** (15161) | cross-project Aggregation view (15163) |
| RAID | yes | yes, but `raidScopeProgramId || scopeProgramId` (15174) plus its own program sidebar | all programs, prefixed with the project name |
| Dashboard | yes | yes, except "Recent activity" (7862) | "Choose a project" list |
| Briefing (dialog) | **no** — always all projects | no | — |
| Meeting mode | default current, toggle to all (6031-6036) | **no** | all |
| Minutes | **no** — all projects ticked (6630) | no | — |
| Export Excel | current project | **no** | silent no-op (14787) |
| Header "% · done/total · overdue" | current project | **no** (`rollup(project)`, 14895, 14958-14963) | hidden |
| Tab counts (Actions ·n, Decisions ·n) | current project | **no**, and they include closed items (14982) | 0 |
| Roles… | current project | no (only the Mind map menu passes a focus) | hidden |

### Problems

1. **FOCUS promises more than it does.** It sits in the global header next to the project name, so it reads as "everything below is this program". Actions, Decisions, Briefing, Meeting mode, Minutes and Excel ignore it, and the progress figure printed right beside it is the whole project's (14958-14963).
2. **It is shown where it cannot act.** On My Work both selectors are visible; changing the project there changes nothing on screen but silently changes which project the other tabs will open.
3. **It forgets me.** Changing project resets FOCUS to "All programs" (14615) even when I am PM of a program in the new project; the automatic "my program" scope happens once per page load, and only if the *last remembered* project is one I manage (`managerProgramId` on `projects[currentId]`, 13489). A manager whose last project was one where they are a plain member lands on that project's full plan.
4. **RAID has a second, competing scope.** `raidScopeProgramId` (set when arriving from a task panel or My Work, 15136, 15254) overrides FOCUS and is not cleared by `switchProject`; after switching project the list is filtered by a program id of the previous project → the empty state "No programs to show — Create a program first" (10994-11000). And with FOCUS set, the RAID sidebar shows "Programs (1)": two program pickers for one choice.
5. **No work-stream level.** A Sub-PM can only focus on the parent program (PM-27).
6. **Naming.** "FOCUS" in small caps is not a word used anywhere else in the app.
7. **"All projects" is three different things.** On Gantt it is a real view, on Actions / Decisions / RAID a cross-project list, on Mind map / Outline / Dashboard a "Choose a project" list, on My Work nothing.

### Recommended rule

**The header shows a scope control only on tabs where it filters, and on those tabs everything on screen — lists, counts, the header numbers, and anything launched from there (Meeting mode, Minutes, Excel) — obeys it; the scope defaults to "mine" and is remembered per project.**

As small changes:

- **R1 · Hide on cross-project screens.** On My Work hide both the project selector and the scope select (show muted text "All my projects"). Briefing gets its own scope select inside the dialog (PM-16).
- **R2 · Apply everywhere on project tabs.** Pass `scopeProgramId` to `ActionItemsView` (filter by the related task's program via `findTaskInProject`; actions without a task show only under "All programs"), `DecisionsView` (by stored claim / related tasks), the header rollup (use the scoped node, as `DashboardView` does), the tab counts (open items in scope), `MeetingMode`, the Minutes defaults and `exportExcel`.
- **R3 · Default to mine, remember the choice.** In `switchProject`, replace `setScopeProgramId(null)` by: last choice for this project from localStorage, else `managerProgramId(newProject, uid)`, else null. Store the choice per project id in `uiPrefs` (same pattern as `readPlanView`).
- **R4 · Land where I manage.** At boot, for tier `manager`, if I hold no role in the remembered project, pick the first project where I do.
- **R5 · One scope for RAID.** Remove `raidScopeProgramId`: the three callers set `scopeProgramId` instead (the Portfolio handler already does, 15196). Hide the RAID program sidebar when a program is in scope.
- **R6 · Work-stream level for Sub-PMs.** Options: "All programs", each program, and — only for someone who leads work streams here — "My work stream: <name>" (value `ws:<id>`). Views that take a node (Outline, Gantt, Dashboard, Meeting mode) accept the work-stream node the same way.
- **R7 · Rename** the label "FOCUS" to "Program" (or "Scope" once R6 exists).
- **R8 · All projects**: keep it for Gantt, Actions, Decisions, RAID; keep the existing "Choose a project" list on Mind map / Outline / Dashboard. Nothing else needed beyond R1.

R2 + R3 + R5 are the core; each is a few lines in `App()` plus one prop per view. None restructures `App.jsx`.

---

## 7. Findings by severity

| Id | Sev | One line |
|---|---|---|
| PM-1 | High | No "my program / work stream" attention view; My Work is only "me as PIC" |
| PM-2 | High | A blocker raised on a task I manage reaches me nowhere |
| PM-3 | High | Approval row has no evidence; opening the task throws me out of the inbox |
| PM-13 | High | Meeting mode: whole project, read-only, truncated, nothing clickable |
| PM-21 | High | No workload view of my people (Team is Owner-only, Gantt hides the PIC) |
| C2 (section 6) | High | Scope control acts on some surfaces only, resets on project switch, competes with RAID's own |
| PM-4 | Medium | PM cannot see requests waiting at Sub-PMs before escalation |
| PM-5 | Medium | Deadline change requests from my people are invisible to me |
| PM-6 | Medium | Outline: name-only search, no overdue / blocked / PIC filters |
| PM-7 | Medium | Who approved, when, and the rejection history are not shown on the task |
| PM-8 | Medium | "Related milestone *": jargon and no place for a general follow-up |
| PM-12 | Medium | [Sub-PM] Actions tab lists the whole project; same Edit button, read-only outside my work stream |
| PM-14 | Medium | Meeting mode and Roles live under a button named "Export" |
| PM-15 | Medium | Minutes defaults: all projects, today only |
| PM-16 | Medium | Briefing: all projects, completions by planned date, old blockers dropped, edits lost on rich copy |
| PM-17 | Medium | New task = 6 steps; work-stream dates visible only inside a task's edit form |
| PM-18 | Medium | Sub-PM's new RAID item hidden from the PM; hourglass with an empty list |
| PM-19 | Medium | New decision filed under my first program regardless of its tasks; no program shown |
| PM-22 | Medium | Dashboard under FOCUS: labels, Dropped / Submitted in "Due", "no updates" = never, no work-stream level |
| PM-23 | Medium | Slippage visible only task by task |
| PM-24 | Medium | Export Excel: whole project, import columns, empty "Latest check-in", silent in All projects |
| PM-26 | Medium | Credit banner and badges on the manager's landing screen, but no distribution view (HOD decision) |
| PM-27 | Medium | [Sub-PM] Everything is scoped to the parent program; own work stream unmarked |
| PM-32 | Medium | No per-person delivery evidence for the manager at year end |
| PM-9 | Low | "Reassign…" fires on select without confirm; Approve has no feedback / undo |
| PM-10 | Low | Escalated request does not say whose queue it was in |
| PM-11 | Low | No Chat card on Approved |
| PM-20 | Low | Mitigation PIC still cannot mark done (P3.2) |
| PM-25 | Low | Gantt gives no hint for undated tasks |
| PM-28 | Low | Roles… note shown to people who cannot assign; not pre-scoped |
| PM-29 | Low | [Sub-PM] No way to hand over approvals before leave |
| PM-30 | Low | PM-created work stream has no dates and no way to ask |
| PM-31 | Low | Task weights Owner-only in the UI (rules unverified) |
| PM-33 | Low | Finished programs have no end state; may be the landing scope |

## 8. Suggested order

1. **Scope rule** (section 6: R2, R3, R5, R1, R7) — removes the largest daily confusion and is the base for the rest.
2. **Manager inbox** (PM-1, PM-2, PM-4, PM-5, PM-3) — one section in My Work + open the panel in place.
3. **Meeting + reports** (PM-13, PM-14, PM-15, PM-16, PM-24).
4. **Dashboard for managers** (PM-21, PM-22, PM-23) and **Outline** (PM-6, PM-17).
5. **Sub-PM scope** (R6 / PM-27, PM-12), then the Low items.

## 9. Decisions needed from the HOD

1. May a PM / Deputy see per-person credit (projected / earned) for their own program? (PM-26, PM-32)
2. May a PM / Deputy / Sub-PM see RAID items of their program that are still waiting for Owner approval? (PM-18)
3. Should a blocker on a task post a Chat card to the project space, or only appear in the manager's My Work? (PM-2)
4. Should a manager be able to create an action without a related task (rule change), or is "ask the Owner" the intended path? (PM-8)

## 10. Not verified

- Behaviour in a browser (layout wrapping, speed) — code reading only.
- `firestore.rules` for: task weights by a PM (PM-31); a decision claim on a program other than the caller's first (PM-19).
- The Mind map node menu for PM / Sub-PM was not walked in detail (only its role and scope wiring).
- Whether production projects have a Chat webhook set (affects PM-2, PM-11).
