# AF-MPT — UX/UI audit for the Member persona (25/11/2026)

- Scope: code on `main` at `b01d1a4` (after wave 3 and Replace person). Read-only code audit: no browser run, no Firestore access, nothing edited.
- Persona: **Member** — no management role. Task PIC (Assignee), sometimes contributor, sometimes owner of a step in someone else's action, sometimes only a reader.
- Line numbers are `src/App.jsx` unless another file is named.
- "Unverified" = depends on production data or on a browser run; the code path itself was read.
- Previous audit (`docs/reviews/2026-11-13-routine-audit.md`, M1–M7): M1, M2, M6, A8 were addressed in wave 3. **M4 and M5 are still open; M3 and A6 are only half fixed** — see MB-1, MB-2, MB-3, MB-4.

## 0. What the Member sees

| Thing | Now | Evidence |
|---|---|---|
| Tabs | My Work, Plan \| Actions, Decisions, RAID \| Dashboard. **No Briefing tab** | `src/tabsByRole.js:47` |
| Landing | My Work | `src/tabsByRole.js:85` |
| My Work default mode | "By project" (saved per browser); the other mode is "By urgency" | 11868–11873 |
| Header | project picker, "Your role" chip, search, help, FOCUS, "% · done/total · overdue" of the selected project, save chip, tabs, "⋯ Export", account | 14918–15042 |
| ⋯ Export menu | Meeting mode, Minutes…, Export Excel, Members & related parties…, Roles…, Project settings… | 15291–15315 |
| Task panel | opens on the right for any view once a task is selected | 15240–15252 |

## 1. Daily

### Path in the UI

| Step | Path today | Clicks |
|---|---|---|
| Open the app | lands on My Work, "By project". Top: "Needs my approval" (never for a member), "Sent for approval" (12049–12064). Then one card per project (11802) | 0 |
| See today's work | each project card: red alert strip (overdue / escalating / unread mentions, 11579–11601), then a Tasks block showing **only today + overdue** (11607–11611); "This week", "Later", "Contributing" are closed (11425–11429) | 0 |
| Change status (Planned ↔ In Progress) | status pill on the task row → menu (9258) | 2 |
| Health | not on the row. Expand row → "→ Open full details" → app switches to Outline + task panel → Health buttons (3757–3794) | 3 + view switch |
| Comment / blocker | click the row → type → tick "This is a blocker" → "Post update" (9340–9355) | 2–3 |
| Tick an action step | as PIC of the action: expand the task row → "✓ Done" on the step (9183–9190), or Actions block → expand action → step editor (9554–9562). As step owner only: "✓" on the sub-task row (9737) | 2 |
| Answer a mention | "By urgency" → open "Mentions" → "→ Open task" → Outline + panel → scroll to Updates → type → Post (12326–12363, 15113–15119, 4060–4066) | 5 |
| Submit as done | "✓" on the task row (9260–9262) or pill → "Completed"; or task panel → "Submit as done" (`src/components/CloseControl.jsx:23`) | 1 |
| React to a rejection | "By urgency" → "Needs attention now" → "✕ Close request rejected by …: reason" → "Open task" (12116–12131) | 2–3 |
| Ask for a deadline change | expand row → "Request extension" (toast "Open the task to request an extension", 11913–11916) → Outline + panel → "Request change" (3929–3936) → date + reason → "Submit request" (3219–3278) | 4 + view switch |

### Findings

**MB-1 — High — Mentions are barely usable in the default view (M4 still open)**
- Step: answer a mention.
- Now: in "By project" an unread mention is one line inside the red strip, cut at 55 characters with a hard-coded "…", **not clickable**, max 5 per project (11595–11599). Five seconds after My Work opens, everything is marked seen (11878–11882, 13512–13518): the line disappears and the red number on the My Work tab drops (13467). Read mentions are not shown in "By project" at all (`bundle.mentions` is built at 11765 and never rendered). The full list is only in "By urgency" → "Mentions", which is closed when there is nothing unread (12330), so after the 5 seconds it is closed too.
- Why it hurts: a member who opens the app and looks at something else for 5 seconds loses the only signal. Replying costs 5 steps and a view change.
- Change: (1) make each mention line in the strip a button calling the same `onTaskClick` / `onActionClick` as the Mentions section (12339–12341) and show the whole text; (2) mark as seen when the user leaves My Work or opens the item, not on a 5-second timer; (3) add a "💬 Mentions (n)" sub-toggle in the project card, like "This week (n)" (11612–11616), listing that project's recent mentions.

**MB-2 — High — A rejected close request is invisible in the default view (M3 fix incomplete)**
- Step: react to a rejection.
- Now: the `rejected_close` item is rendered only in "By urgency" → "Needs attention now" (12116–12131). `ByProjectCard` (11416–11731) renders nothing for it: not in the strip, not on the task. The only hints in "By project" are the red count on the "⚡ By urgency" toggle (11952–11957, 11974) and on the tab, which also count overdue items. The task itself is back in the list as In Progress with no mark (9233–9264). In the task panel the Status block shows the plain open buttons (`src/closeWiring.js:150–156`, `CloseControl.jsx:108–116`); the reason is an Updates entry at the bottom of the panel (`src/closeFlow.js:253`).
- Why it hurts: the person whose work was sent back does not see it unless they change view mode; when they open the task, the reason is below the fold.
- Change: (1) add the rejected line to the project card's red strip (11585–11599) and count it in `urgentCount` (11437); (2) on `TaskRowInline`, show a small "✕ Rejected: reason" line under the breadcrumb when `rejectedCloseItem` returns something (`src/myWorkItems.js:12`); (3) in `CloseControl`, when the task is open and `closeRequestHistory[0].status === 'Rejected'`, show one line above the buttons: "Last request rejected by X on date: reason".

**MB-3 — High — A step owner who is not the action's PIC still gets a "✓" that the rules refuse (A6 half fixed)**
- Step: tick an action step.
- Now: decision D3 says only the action's PIC (or a manager) ticks steps; the rules agree (`firestore.rules:1073–1086`, PIC branch needs `picUid == me`). The task card honours it: "Ask {PIC} to tick this step" (9180–9182). But `SubtaskMyWorkRow` always shows "✓" (9737–9739); both callers pass `onMarkDone` without `canTickStep` (11475–11488, 12280–12293). The click is refused and rolled back (wave 3 A1).
- Also: on the task card the step's "✓ Done" uses an exact string compare `entry.subtask.pic === author` (9292), while everything else uses the directory-aware `isMe` (9293, 895). `author` is the Google display name (13424–13426) and stored names are directory names, so for a person whose two names differ the button never shows. **Unverified on data** (depends on each person's Google name).
- Change: in both callers pass `onMarkDone` only when `canTickStep({...})` is true (same call as 9293); otherwise show the same "Ask {parent PIC} to tick this step" text in the row. Replace `entry.subtask.pic === author` with `me.isMe?.(entry.subtask.pic)`.

**MB-4 — Medium — Opening a task from My Work throws the member into Outline (M5 still open)**
- Step: every "Open", "Open task", "→ Open full details", mention, rejection, approval row.
- Now: `onTaskClick` switches project, selects the task, then `setView('outline')` (15113–15119). Outline starts with programs open and work streams closed (7248–7250) and has no scroll-to-task, so the row is usually not visible. Going back to My Work remounts it: every opened sub-section and expanded row is closed again (state lives in `ByProjectCard` 11424–11429 and `MyWorkSection` 8984).
- Why it hurts: the member only wanted the task panel. The panel does not need Outline: it renders for any view (15240), and Search already opens it without changing view (15335–15338).
- Change: remove `setView('outline')` from My Work's `onTaskClick` (keep the project switch). The panel then opens beside My Work. One line, revertible.

**MB-5 — Medium — "✓" and the status menu in My Work say "done" but send an approval request**
- Step: submit as done.
- Now: the row button is "✓" with tooltip "Mark done" (9261); the pill menu lists "Completed" and "Dropped" (64, 9056–9061). For an Assignee both become a close request; the only explanation is the toast afterwards, "Submitted for approval — X will review." (`src/closeWiring.js:20`), the same text for done and dropped. No confirmation, no Undo (11887–11888), and on a project with a webhook a Chat card goes out (13957–13964). The task panel uses the right words, "Submit as done" / "Submit as dropped" (`CloseControl.jsx:23`). The same "✓ Mark done" is used for actions and steps, where it really is done (9440, 12168), so one icon means two things on one screen. (Was M7, low; rated higher because it is the main daily button.)
- Change: when the person cannot close directly (`canCloseDirectly` false, `src/closeFlow.js:95`), label the row button "Submit" with tooltip "Submit as done — {approver} approves", and show "Submit as done" / "Submit as dropped" in the pill menu. Make the toast say "as done" / "as dropped" and give it a "Withdraw" button.

**MB-6 — Medium — Deadline change: three names, a detour, and no answer comes back**
- Step: ask for a deadline change.
- Now: (a) My Work says "Request extension" (9356), the panel says "Request change" (3933), the dialog says "Request deadline change" (3241). (b) The My Work button does not open the dialog: it navigates to Outline and toasts "Open the task to request an extension" (11913–11916); in the panel the button sits unlabeled between the End and Deadline rows (3929–3936). (c) While waiting there is a banner in the panel (3281–3325), but **nothing in My Work**: a pending deadline request is listed only for the Owner (964–967); the row button stays active. (d) If the Owner rejects, the request is cleared and the note is written to `deadlineRequestHistory` (3553–3562), which is **never displayed** (only written: 3538, 3561, 3581, 14570, 14598). No Chat card either (`src/chatNotify.js` has no deadline card). The member just sees the banner gone and the date unchanged. (The rejection does appear as one line in Dashboard → Recent activity, 14289 — see MB-16.)
- Change: (1) one name everywhere: "Request deadline change"; (2) let the My Work button open `DeadlineRequestDialog` directly (it only needs task, current end, author, uid — 4150–4157); (3) add pending deadline requests I sent to "Sent for approval" (one line: task, new date, "Waiting for Owner"); (4) under "Deadline history" (4015–4029) also list the last resolved request: "Rejected by X on date: note"; show the same line in Needs attention for 14 days, like the rejected close request.

**MB-7 — Medium — Updating a task: the form is far down the panel, the row gives no feedback**
- Step: update status / health / comment / blocker.
- Now: in the panel the order is name → Status → Health → PIC / dates / deliverables / dependencies / credit shares → Credit projection → deadline banner → deadline history → References → tabs with the update form (3701–4066). The most used control is last. On the My Work row: no health control; "Post update" collapses the row with no toast (9352–9355, 11898–11912), the only feedback is the small save chip in the header (14968–14976); the collapsed row shows no sign of an open blocker, amber / red health, or a pending request (9243–9254); "Recent updates" marks a resolved blocker as "🚩 Blocker" (9329, no `resolvedAt` check).
- Change: (1) in the panel move the Updates / Decisions / Actions block to just under Health, above the field list; (2) add the three health dots to the expanded My Work row (same `onUpdate({ ...task, health })` as 3771); (3) toast "Update posted" after posting; (4) on the collapsed row add small chips: "🚩 blocker" when an update has `isBlocker && !resolvedAt`, a health dot when not green, "⏳ deadline request" when `task.deadlineRequest`; (5) do not show "🚩 Blocker" for a resolved entry.

**MB-8 — Medium — "This week" is hidden in both modes**
- Step: see today's work, plan the week.
- Now: "By project" shows only today / overdue; with nothing due today the card reads "Nothing due today / overdue." and the week's work is behind "▶ This week (n)", closed, per project and per block (11607–11623, 11637–11653). "By urgency": "Tasks I own as Primary PIC" is the 5th section, below RAID, Action items and Mentions, and is closed unless something is due today (12366–12376); the default sub-tab is Today.
- Why it hurts: on a normal day (nothing due today) a member with 4 projects sees four "Nothing due" lines and needs 4–8 clicks to see the week.
- Change: in the project card open "This week" by default when `owned.today` is empty (initial state at 11425–11429); in "By urgency" move "Tasks I own" directly under "Needs attention now" and open it when today **or** week has items.

**MB-9 — Medium — Approval is silent; the task just disappears**
- Step: after submit.
- Now: Chat cards exist for submitted, reassigned and rejected (13957–13982), not for approved. On approval the task leaves "Sent for approval" (`src/approvalsInbox.js:57`) and is skipped everywhere in My Work (905). Nothing tells the member it was approved or by whom.
- Change: see MB-14 ("Closed by me" section). Minimum: keep an approved task in "Sent for approval" for 7 days with a green "Approved by X on date" chip (`approvedAt` / `approvedByUid` are stored, `src/closeFlow.js:242`).

**MB-10 — Low — Contributor and reader rows**
- Now: a contributor's row shows "Only the PIC submits" where the PIC has "Request extension" (9356–9357): the sentence answers a question the contributor did not ask. A mitigation the member cannot update says "Use 'Open RAID item' below to view or comment" (9704), but RAID offers nothing to write for a non-manager (reviews and mitigation edits are gated by `canEdit`, 10773–10793): dead end.
- Change: replace "Only the PIC submits" with "You are a contributor: you can post updates and resolve blockers". For the mitigation, when `canEdit` is false, change the text to "Tell the program PM in a task comment or in Chat when it is done".

## 2. Weekly

### Path in the UI

| Step | Path today |
|---|---|
| What is due next week | My Work → per project "This week" (closed), or "By urgency" → "Tasks I own" → Week tab. Buckets are "today" and "next 7 days" (868–870), not calendar weeks |
| What is blocked | no personal list. Dashboard → "🚩 Top blockers" (7812–7826): one project at a time, everyone's blockers, max 6 |
| Weekly update / check-in | no weekly form. `checkIns` is legacy data, read only (892–895). The update is "Post update" on each task |
| Briefing | only the yellow Monday banner (15057–15086) → dialog → "Generate preview" → Markdown in a textarea (13196–13221) |
| What I am waiting on | My Work → "Sent for approval": approver, "Waiting n working days", escalation label, Withdraw (9076–9108) |
| Meeting | ⋯ Export → Meeting mode (15293) |

### Findings

**MB-11 — Medium — The member cannot open the briefing except on Monday, and it is not about them**
- Now: member tabs have no Briefing (`src/tabsByRole.js:47`); `setShowBriefingDialog(true)` is called only from the tab (14993) and the Monday banner (15075). If the banner is dismissed, or it is Tuesday, there is no way in. The banner says "Weekly briefing ready" but the dialog is empty until "Generate preview" (13207), and the result is raw Markdown with table pipes in an editable textarea (13212). Content is the whole workspace, looking back 7 days (12826–12991): no "your items", nothing about next week. "Completed this week" tests the task's **end date**, not when it was closed (12882), so a task closed early or late lands in the wrong week.
- Change: (1) add "Weekly briefing" to the member's ⋯ menu (15291–15296) so it works any day; (2) generate on open (call `generate()` once at mount); (3) put a short "For you" block first: my overdue, my due in the next 7 days, my open blockers, my requests waiting — all already computed by `computeMyWork` / `approvalBuckets`; (4) use `approvedAt` for "Completed this week" when present.

**MB-12 — Medium — No personal "prepare for the meeting" view; the Dashboard is project-wide and one project at a time**
- Now: Dashboard panels (Due this week, Overdue, Top blockers, No updates) cover every person in the selected project (7767–7798); with "All projects" selected the member gets "Choose a project" (15231–15234). "Due this week" excludes only Completed, so Dropped and Submitted tasks are listed as due (7771–7775). There is no list of my own open blockers anywhere. Meeting mode sits in a menu named "Export" (15026).
- Change: (1) in My Work add one line under the header: "This week: n due · n overdue · n open blockers · n waiting for approval" — no new screen; (2) add "My open blockers" to Needs attention (updates with `isBlocker && !resolvedAt` on tasks where I am PIC or contributor); (3) Dashboard "Due this week": filter with `OPEN_STATUSES` (`src/taskStatus.js:2`); (4) Dashboard: add a "Mine / Everyone" toggle that filters `tasks` by `me.isMe(t.pic)`.

**MB-13 — Low — The Actions tab is laid out for the person who runs the meeting**
- Now: default "Group by PIC", groups in alphabetical order, filter "All PICs" (5229–5230, 5286). Above the list: "Excel template" and "📧 Email PICs", and per group "Excel" / "📧 Email" for other people's actions (5525–5526, 5603–5604) — manager tools, shown to everyone. Above that, every open RAID mitigation of the project (5530–5561). The row's status is a static label; the pencil ("Edit") opens a form that for a member is mostly locked (5159, 4829–4832).
- Change: put my own group first in `groupedByPic` (5286); hide the email / Excel-template buttons unless `mayCreate` is true (the flag used for "New action", 5489); show the mitigations block only when `canEditRaid` is true for at least one program; change the pencil tooltip to "Open" when the edit mode is not `full`.

**Works well (keep):** "Sent for approval" at the top of My Work in both modes, with approver name, working days waited, escalation label and Withdraw (12057–12064, 9076–9108). Reload on tab focus so a rejection or approval shows up without F5 (13650–13697).

## 3. Monthly

### Path in the UI

| Need | Path today |
|---|---|
| My progress across projects | none. My Work lists open items only (905). Dashboard / Plan show project progress, one project at a time |
| My workload | counts in card headers "n tasks · n actions" (11573); no total, no per-week view. Team / Portfolio workload is Owner only (15215, 15191) |
| My overdue trend | none. Current overdue only |
| What I closed this month | none. Completed tasks are not listed anywhere for the member; in Plan they are mixed with everyone's |

### Findings

**MB-14 — High (for this cadence) — Nothing shows the member their own closed work, on-time record or load**
- Now: `computeMyWork` drops Completed / Dropped / Submitted before any bucket (905). The data needed is already on each task: `approvedAt`, `approvedByUid`, `closedByUid` (`src/closeFlow.js:205, 242`), `end`, `deadlineType`, `deadlineHistory`.
- Why it hurts: the app is used for performance scoring, yet the person being scored cannot see their own record. They will keep a private list, or ask the Owner.
- Change: one new collapsed section at the bottom of My Work (both modes), "✅ Closed by me", with a period picker (This month / Last month / This quarter / This year). One row per task where I am PIC or contributor and status is Completed or Dropped: task, project, closed date, approver, "on time" / "n days late" (closed date vs `end`), cp earned. Header line: "n closed · n on time · n late · n cp". Built in the same loop as `computeMyWork`. This one section also answers MB-9, part of MB-15 and the weekly "what did I finish".
- Smaller: add a one-line total above the project cards: "Open: n tasks · n actions · n overdue · n waiting for approval" (numbers already in `counts`, 11932–11935, and `approvals.sent`).

## 4. Quarterly / Yearly

### Path in the UI

| Need | Path today |
|---|---|
| My credit points | My Work → switch to "By urgency" → last section "📊 My credit (all years)", closed (12464–12503): Earned, Projected, %, and one line per project |
| Per-task evidence | open each task → "Credit projection" panel (3952–4003). No list |
| Export for a review talk | ⋯ Export → Export Excel = the current project's plan (1754–1779): no closed date, no approver, no credit, no updates; does nothing when "All projects" is selected (14787). Credits tab and its export are Owner only (15207–15214) |

### Findings

**MB-15 — High (for this cadence) — Credit is hidden, has no year, no detail, and cannot be taken out**
- Now: the credit section exists only in "By urgency" (the non-default mode), last, closed, labelled "(all years)" (12466), although every project has a `creditYear` (12516–12517) and reviews are yearly. It shows totals per project; the member cannot see which tasks produced the points, although `computeProjectCredits` already returns a per-task `breakdown` (used at 3955). The text in the task panel says "Mark task as Completed to award these credits." (3998) to a person who cannot mark it Completed.
- Change: (1) show the credit section in both modes (move it out of the `viewMode` branch, at the bottom); (2) add a year select defaulting to the current year (filter projects by `creditYear`); (3) under each project line, list my rows from `breakdown` (task, share %, cp, earned / projected); (4) add "Copy as table" (same clipboard approach as the briefing, 13164–13166) on this section and on "Closed by me" (MB-14) — that is the member's review evidence; (5) change 3998 to "Awarded when the task is approved as Completed."
- Export Excel: when "All projects" is selected, disable the item or toast "Choose a project first" (14787).

**MB-16 — Low — Confirm with HOD: what a member can see about other people's scores**
- Now: the Credit projection panel shows every person's share and cp for the task to any reader (3986–3994). Dashboard "Recent activity" shows the last 15 activity lines to members (7864–7871; rules allow the read, `firestore.rules:1456`), including "Rejected close request for … (requested by Y): reason" (`src/closeFlow.js:330`) and deadline-request rejections with the Owner's note (14289). On 11/11 HOD chose to hide the Activity tab and the "Top credit" line from non-Owners.
- Change (if HOD wants the same rule here): in the panel show non-managers only their own row plus the task pool; in Dashboard hide the "Recent activity" panel for non-Owners, or filter out `close_rejected` / `deadline_request_*` lines that are not about the viewer.

## 5. Across all cadences

**MB-17 — Low — Words that do not match what the member thinks**

| Where | Now | Suggest |
|---|---|---|
| 12367 | "Tasks I own as Primary PIC" | "My tasks" |
| 12421, 11698 | "Decisions awaiting your input" — the list is decisions I already made whose follow-up is open (1042–1046), and a member cannot update the follow-up (12444) | "My decisions — follow-up open" |
| 15456 | "My personal override" | "Open the app on" |
| 15026 | button "⋯ Export" holding Meeting mode, Members, Roles, Project settings | "⋯ More" |
| 9349 / 9510 / 2399 | "This is a blocker" / "Mark as blocker" / "🚩 Mark as Blocker / Risk"; icons 🚩 and 🚨 (9329, 9490) | one label, one icon |
| 9238, 9408, 9633, 9726 | "▢" at the start of each row looks like a checkbox and does nothing | remove, or make it the expand arrow |
| 9120 | "🔒 Hard" / "🎯 Soft" pills with no tooltip | add `title` with the glossary line (`src/glossary.js:11–12`) |

**MB-18 — Low — The walkthrough is the same for every role**
- Now: a member is shown "Approvals in My Work — requests waiting for your approval", "Assigning roles", and a menu said to hold "Excel and Backup" (`src/components/Walkthrough/steps.ts:45–82`); the My Work step says tasks are "grouped by Today, Week and Later" while the default mode is "By project" (`steps.ts:42`). Nothing on posting an update, flagging a blocker, mentions, asking for a deadline change, or what happens after a rejection.
- Change: skip the `approvals` and `roles-menu` steps for the member tier (add a `tiers` field next to `skipIfMissing`); replace them with one step "Update a task" and one "If your request is rejected". Fix the My Work wording.

**MB-19 — Low — Header numbers on My Work belong to the selected project (known, C2 deferred)**
- Now: on My Work the header still shows the project picker, FOCUS, and "42% · 12/50 complete · 3 overdue" for whichever project is selected (14922–14963); the tab labels show "Actions ·n" and "Decisions ·n" for the whole project (14983). A red "3 overdue" next to "My Work" reads as "mine". Already recorded as deferred item C2 in `CLAUDE.md`.
- Change (when C2 is done): hide the picker, FOCUS and the project numbers on My Work.

**MB-20 — Low — A member with no assignment reaches a dead end**
- Now: "No tasks assigned yet — ask your workspace owner…" (12029–12043), although the person can read projects and comment on any task (D1), and may have been added for exactly that.
- Change: add a second line with a button: "You can still follow the projects you belong to" → Plan.

**MB-21 — Low — Two names for the same person (unverified on data)**
- Now: comments are signed with the Google display name ("Posted as {author}", 9345, 11905), while PIC fields and pickers use the directory name. A member may see themselves under two names; the exact compares at 9292 (MB-3) and 3283 depend on it.
- Change: sign new entries with the directory display name (`personLabel`, `src/directory.js:72`); the uid is already stored on each entry (`authorUid`).

## 6. What works well (do not break)

- Landing on My Work, with a personal start-view setting (15458–15465).
- "Sent for approval": approver, working days waited, escalation, Withdraw in place (9076–9108).
- Controls follow the rules: contributor rows have no status menu and no "✓" (9222, 9258–9262); the action form says what the PIC may change (9448, 4829); disabled Health buttons explain why (3770); "Assignment not linked…" hint (9213–9215); "Only the PM / Sub-PM of … can update this" (`src/roleUi.js:135–138`).
- A refused save rolls back, and Activity / Chat fire only after a successful save (wave 3 A1).
- Rejection requires a reason, and the reason is shown in the My Work item (12120).
- "NEXT" step preview on the collapsed task row (9266–9280).
- Mentions resolve against the directory, on tasks of any status and on actions (`src/mentions.js`, 890–915, 949–958).
- Reload when the tab regains focus, never over a pending save (13650–13697).
- Copy link to a task (3678–3690).
- Glossary with Vietnamese helper lines (`src/glossary.js`).

## 7. Suggested order

1. **Before onboarding (small, no rules, no data):** MB-1, MB-2, MB-3, MB-4, MB-5. Each is a few lines in `App.jsx`; together they make the default My Work view tell the member everything that happened to their work.
2. **Next:** MB-6 (the deadline answer comes back), MB-7, MB-8, MB-11.
3. **One new section, several gaps closed:** MB-14 "Closed by me" + MB-15 credit by year with per-task rows and "Copy as table" (also closes MB-9).
4. **Ask HOD:** MB-16 (visibility of other people's credit and rejections).
5. **Polish:** MB-10, MB-12, MB-13, MB-17 – MB-21.

None of these needs a rules change or a data migration. MB-14 / MB-15 add a section, so they need a short spec first (project rule: no feature outside an approved spec).
