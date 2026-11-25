# Market practices and standards for a small work-management + performance tool

Reference for auditing a ~10-person department tool (Owner / PM / Sub-PM / Member; Project → Program → Work stream → Task; actions, decisions, RAID, close-approval, credit points, My Work, briefing, meeting mode, plan views, portfolio).

Researched 25 Nov 2026 from vendor documentation, vendor product pages and published frameworks. Organised by working rhythm, then cross-cutting standards, then a tick-list.

## How to read this

- **Confirmed** = I read it on the linked page on the research date.
- **Search summary** = the page was found by search and the claim comes from the search result's summary of it; I could not open the page itself (several help centres block automated fetches or render by script). Treat as probably right, verify before quoting.
- **Unconfirmed** = I found no primary source; it is common practice or my inference. Flagged inline.
- Vendor feature pages describe what the vendor says the product does. They are evidence that a pattern is *standard on the market*, not that it is *proven to work*.
- Sources I wanted but could not open: PMI.org (403 on every page tried, so nothing here is a direct PMBOK citation), Asana Help Center article bodies, ClickUp and monday.com help centres, Atlassian RACI and retrospective pages.

---

## 1. Daily — personal home, My Work, inbox

### 1.1 The home page is a list of *my* work, bucketed by time, with the buckets filled automatically

- **Pattern.** The personal page groups assigned work into a small number of time buckets, and items move between buckets by date without the user doing anything. New assignments land in a separate "just arrived" bucket so they are noticed.
- **Examples.**
  - Asana My Tasks: four built-in sections "Recently Assigned, Today, Upcoming, and Later"; tasks are auto-promoted "to your Upcoming and Today sections one week and one day out"; tasks without a due date never move up. Confirmed — https://asana.com/resources/asana-tips-my-tasks (Asana labels this article as an older version of its My Tasks guidance).
  - monday.com My Work: sections "Past dates, Today, This week, Next week, Later" plus "Without a date". Search summary — https://support.monday.com/hc/en-us/articles/360019300579
  - Microsoft Planner: My Day is filled automatically with tasks due today and clears itself each night; My Tasks combines private tasks, tasks assigned to me across plans, and flagged emails. Search summary — https://support.microsoft.com/en-us/planner/training/manage-your-tasks-with-my-tasks-and-my-day
- **Why it matters.** The member's first question each morning is "what is due from me now". Date buckets answer it with no filtering. Undated items are the known weak spot: both Asana and monday.com leave them in a bucket that never surfaces.

### 1.2 What goes at the top: urgency and blockers before plain due-date order

- **Pattern.** Within "my work", the top of the list is reserved for what is urgent, overdue, or blocking someone else, not simply the earliest due date.
- **Examples.**
  - Linear My Issues, default "Focus" grouping: "urgent work, SLA-bound work, blockers, cycle work, other active work, triage, backlog, and completed work"; inside each group, sorted by priority with started issues first. Confirmed — https://linear.app/docs/my-issues
  - Jira "For you": highlights "work items that need your attention, conversations to respond to", with tabs Worked on / Viewed / Assigned to me / Starred. Search summary — https://support.atlassian.com/jira-software-cloud/docs/what-is-the-for-you-page/
- **Why it matters.** A due-date sort hides a blocker that has no date. Putting "someone is waiting on you" above "your own deadlines" is what keeps a small team unblocked.

### 1.3 Notifications live in a separate inbox that is triaged to zero

- **Pattern.** Mentions, assignments, comments and requests arrive in one inbox, newest first. Each item can be cleared (archive / delete / mark read), deferred (snooze / bookmark), and often acted on in place. An "important" tab separates what needs a response from background updates.
- **Examples.**
  - Asana Inbox: filters for @mentions, unread, tasks assigned to you, tasks you assigned to others, by person; archive, bookmark, mark unread; "reply to comments and act on tasks without leaving Inbox"; create a follow-up task from a notification in one click. No native filter by project. Confirmed — https://asana.com/features/project-management/inbox
  - Linear Inbox: a Priority tab "separates notifications that need your attention from other updates"; snooze returns the item at a chosen time or on new activity; full keyboard set (J/K move, U read/unread, H snooze, Backspace delete). Confirmed — https://linear.app/docs/inbox
  - ClickUp Inbox: tabs Primary, Other, Later (snoozed), Cleared. Search summary — https://help.clickup.com/hc/en-us/articles/12724229385623-Intro-to-Inbox
  - Notion Inbox: mentions, comments, page updates, reminders; "Archive read" / "Archive all" so the inbox holds only unfinished items. Search summary — https://www.notion.com/help/updates-and-notifications
- **Why it matters.** "My tasks" and "things that happened" are different lists with different end states (done vs. seen). Mixing them makes both unreliable. The clear / defer pair is what makes an inbox trustworthy: an item stays until the user disposes of it.

### 1.4 Match the intrusiveness of a notification to whether action is required

- **Pattern.** Action-required notifications are prominent and persist until handled; passive ones are badges or quiet rows. Status that belongs to an object (overdue, blocked) is shown as an indicator on the object, not sent as a notification.
- **Source.** NN/g, *Indicators, Validations, and Notifications*: action-required notifications are "often urgent and should be intrusive"; passive ones "can easily be missed, since they require no user action"; "a notification sent irrespective of the current user goal would likely be ignored". Confirmed — https://www.nngroup.com/articles/indicators-validations-notifications/
- **Why it matters.** An approval request and an FYI comment should not look the same. If they do, people either miss approvals or stop reading the list.

### 1.5 Quick actions from the list

- **Pattern.** Complete, reply, change status, snooze and reassign are possible on the row, without opening the item.
- **Examples.** Asana Inbox (reply and act in place, link above); Linear Triage (accept / decline / mark duplicate / snooze) — Confirmed, https://linear.app/docs/triage
- **Why it matters.** Daily use is many small actions. Each one that needs a panel opened and closed is friction that lowers update frequency, and stale status follows.

### 1.6 Zero-click status awareness

- **Pattern.** The current state is visible on arrival: counts, overdue markers, what changed since the last visit. No click is needed to learn "am I fine today".
- **Sources.** NN/g heuristic 1, *Visibility of system status* ("keep users informed about what is going on") — Confirmed, https://www.nngroup.com/articles/ten-usability-heuristics/ . NN/g dashboards: content should be consumable "fast, with a minimum of interaction or cognitive processing" — Confirmed, https://www.nngroup.com/articles/dashboards-preattentive/
- **Why it matters.** A home page that needs filtering before it says anything gets skipped.

### 1.7 The manager's home differs by adding "waiting on me" and "my team", not by replacing "my work"

- **Pattern.** Managers keep the same personal list and gain (a) a queue of things waiting for their decision and (b) a team view: who is overloaded, what is blocked, what is unreviewed.
- **Examples.**
  - Linear Triage: a team-level inbox reviewed by a named, optionally rotating, owner before work enters the normal flow. Confirmed — https://linear.app/docs/triage
  - 15Five: after a check-in is submitted, "the employee's manager reviews responses and can take action directly from the Check-in". Confirmed — https://success.15five.com/hc/en-us/articles/360002698971 . A report tracks manager review rates (search summary, same help centre).
  - Asana approvals: approval tasks appear in the approver's My Tasks with a distinct status icon and three outcomes — Approve, Request changes, Reject. Search summary — https://help.asana.com/s/article/how-to-use-approvals
- **Why it matters.** A manager's most valuable daily action is unblocking others. If the approvals queue is two clicks deep, it ages.
- **Unconfirmed.** I found no vendor document that states "manager home = member home plus X" as a rule. This is my reading across the products above.

---

## 2. Weekly — check-ins, status updates, the team meeting, manager review

### 2.1 A short written weekly update with a fixed shape and a health value

- **Pattern.** Once a week the owner of each unit of work posts a brief update: a health value (three states), what was done, what is next, what is blocked or needs a decision. The tool reminds the owner and distributes the result.
- **Examples.**
  - Atlassian Team Playbook, *Weekly project updates*: Wins / Needs input / Focus; decisions with rationale, risks, learnings; status On Track / At Risk / Off Track; "A tight headline and 1-3 sentences"; "Once a week at the end of the week". Confirmed — https://www.atlassian.com/team-playbook/plays/weekly-project-updates
  - Atlassian Home reminders: "Project owners will get a reminder weekly on their Friday"; followers are notified on Monday; goal owners are reminded on the 1st of each month. Paused or pending projects get no reminders. Confirmed — https://support.atlassian.com/platform-experiences/docs/update-reminders-for-goals-and-projects
  - Linear project updates: health "On track", "At risk", "Off track"; reminders go to the project lead on a workspace schedule, with follow-ups one and then two working days later if nothing is posted; the Updates tab keeps the full history alongside property changes. Confirmed — https://linear.app/docs/initiative-and-project-updates
  - Asana status updates: five states (on track, at risk, off track, on hold, complete); project owners get a task each Thursday, due Friday, to update status. Search summary — https://help.asana.com/s/article/project-progress-and-status-updates
- **Why it matters.** The fixed shape makes updates comparable across programs and quick to write. The reminder plus follow-up is what makes the cadence hold. The history is what makes monthly and quarterly review cheap.

### 2.2 Personal weekly check-in, reviewed by the direct manager

- **Pattern.** Each person answers a few recurring prompts (progress, priorities for next week, blockers). The manager is expected to read and respond, and the person can see exactly who has access.
- **Examples.**
  - 15Five Check-ins: pulse question, objective progress, short-term priorities, custom questions; frequency set per company / group / individual; manager can react, comment, flag for follow-up, add to the 1-on-1 agenda. Confirmed — https://success.15five.com/hc/en-us/articles/360002698971
  - 15Five visibility: "Everyone above you in the reporting hierarchy can see your Check-ins". Confirmed — https://success.15five.com/hc/en-us/articles/50989072220187 . The employee can open a "Who can view my Check-in?" list (search summary — https://success.15five.com/hc/en-us/articles/360031218951).
  - Basecamp Automatic Check-ins: recurring questions on a schedule, e.g. "What will you be working on this week?", answers collected in one place. Search summary — https://basecamp.com/learn/beyond-the-basics/automatic-check-ins (the page did not return its body when opened).
  - Lattice Updates: weekly updates feed the review context panel later (see 5.1). Confirmed — https://help.lattice.com/en-us/articles/15179081-reviews-context-panel
- **Why it matters.** Weekly notes written at the time are the raw material for a fair year-end review. Showing who can read them is what makes people write honestly.

### 2.3 Human-judged progress, not only percent complete

- **Pattern.** Alongside computed progress, the person doing the work states where it really stands, and each statement is kept as a snapshot.
- **Example.** Basecamp Hill Charts: uphill = figuring it out, downhill = executing; "the status is human generated, not computer generated"; "Every time someone updates the Hill Chart, a new snapshot is saved to the project's history". Confirmed — https://basecamp.com/hill-charts
- **Why it matters.** Task-count percent looks healthy until the last, hardest task. A dot that has not moved for three weeks is a clearer stall signal than "80%".

### 2.4 The team meeting: agenda from live data, action items with one owner and a date

- **Pattern.** The meeting runs from the tool's current data (blocked, overdue, at-risk, decisions needed). Action items are created during the meeting, each with one owner and a due date, and land in that owner's personal list.
- **Sources.**
  - Scrum Guide: events are fixed-length "to create consistency"; the Daily Scrum is 15 minutes; the Sprint Review inspects outcomes with stakeholders; the Retrospective plans improvements. Confirmed — https://scrumguides.org/scrum-guide.html
  - Asana RAID guidance: "Review your RAID log during weekly status meetings" and "update it in real time whenever a new risk, issue, or key decision arises"; action items should always have a clear owner. Confirmed — https://asana.com/resources/raid-log
  - Microsoft Planner: tasks assigned in Teams meeting notes appear in the assignee's "Assigned to me". Search summary — https://support.microsoft.com/en-us/planner/training/manage-your-tasks-with-my-tasks-and-my-day
- **Why it matters.** Actions that live only in minutes are lost. The test is whether an action agreed on Monday is in its owner's list on Tuesday without anyone copying it.
- **Unconfirmed.** I did not find a primary vendor source describing a dedicated "meeting mode" screen. Running the meeting from a filtered live view is common practice, not a documented standard.

### 2.5 Weekly planning against capacity

- **Pattern.** At the start of the period the team sees planned load against recent throughput; unfinished work rolls forward visibly.
- **Example.** Linear Cycles: 1–8 week periods; "Open issues generally roll over automatically"; "Capacity is calculated from the velocity of the previous three completed cycles"; a graph of scope, target pace and completed work. Confirmed — https://linear.app/docs/use-cycles
- **Why it matters.** Visible rollover shows chronic over-planning. For an accounting team with month-end peaks, a simple "planned this week vs. usually done" is enough; estimate points are optional.

### 2.6 Manager's weekly sweep: blocked, stale, overdue, un-updated

- **Pattern.** The manager can filter in one step for items that are blocked, overdue, or have had no update for longer than the cadence.
- **Examples (all search summaries).** Linear: project health filter includes "outdated" updates (Linear changelog). Basecamp: a reminder when a project is active but its Hill Chart has not been updated in a while — https://updates.37signals.com/post/new-in-basecamp-better-hill-charts-and-more . Jira mobile project summary counts "not updated" alongside on track / at risk / off track — https://support.atlassian.com/jira-cloud-ios/docs/view-project-updates-in-jira-mobile/
- **Why it matters.** "No news" is treated as a state of its own. Without it, silent items look healthy.

### 2.7 Approvals queue ageing

- **Pattern.** Each pending approval shows how long it has waited; a reminder fires at one threshold and an escalation to the next level at a longer one.
- **Evidence.** In Jira Service Management this is commonly built with two automation rules (nudge approvers, then notify a lead), sometimes a "Time to approve" SLA. Search summary of an Atlassian KB article and community posts — https://confluence.atlassian.com/jirakb/jira-service-management-cloud-use-automation-rule-to-notify-pending-approvers-1443041080.html . Smartsheet users build the same with date-based reminder workflows; it is not built in (search summary of community threads — https://community.smartsheet.com/discussion/115052/reminder-workflow-for-past-due-approval).
- **Why it matters.** Where closing a task feeds performance credit, a slow approver directly delays someone's record.
- **Caveat.** The evidence shows reminder-then-escalate is a widely requested pattern that leading tools mostly leave to configuration. A native waiting-time display on the approver's queue is unconfirmed as a product default.

---

## 3. Monthly — progress vs plan, workload, slippage, reporting upward

### 3.1 The status report upward

- **Pattern.** One short report per project or program: name and date, health (RAG), a few-sentence summary, progress by key area, blockers and risks, next steps, links to detail. Decisions needed from the reader are stated with a date.
- **Sources.**
  - Asana, *8 steps to write an effective project status report*: name, health ("green = on track, yellow = at risk, red = off track"), summary of highlights and major blockers, key area overviews, links, blockers, next steps; weekly for fast work, monthly for long-term work and senior stakeholders, quarterly for executive reporting. Confirmed — https://asana.com/resources/how-project-status-reports
  - Atlassian play: tag stakeholders, say what you need from them and by when. Confirmed — https://www.atlassian.com/team-playbook/plays/weekly-project-updates
  - PMI, *Anatomy of an effective status report*: review the report with the team and key stakeholders before wider distribution. Search summary only (page returned 403) — https://www.pmi.org/learning/library/anatomy-highly-effective-status-report-2198
- **Why it matters.** The reader should get the verdict in the first line and the ask in the second. Building it from data already in the tool removes the monthly copy-paste.
- **Unconfirmed.** "Decisions needed" as a named section comes from the Atlassian play (as "Needs input") and common PMO practice; I could not confirm PMBOK wording.

### 3.2 Portfolio health on one page

- **Pattern.** One row per project: health, progress, dates, owner, with drill-down. Sorting or grouping by health puts problems first.
- **Examples.** Asana Portfolios: "See the health of key initiatives at a glance, and drill down for more information"; an owner per project; a timeline of start/end dates and milestones across projects; portfolio status updates shared with every stakeholder. Confirmed — https://asana.com/features/goals-reporting/portfolios . Basecamp Hilltop View: Hill Charts from all projects in one report. Search summary — https://updates.37signals.com/post/new-in-basecamp-hilltop-view
- **Why it matters.** The Owner's monthly question is "where do I need to step in". A page sorted by health answers it; a page of equal-weight cards does not.

### 3.3 Workload and capacity

- **Pattern.** Load per person over time against a capacity line, with over-capacity marked, measured in a unit the team already has (task count is acceptable), and rebalancing done from the same view.
- **Examples.** Asana Workload: measure by task count, hours or points; a person's bar turns red when over their weekly capacity; drag tasks to reassign or reschedule. Search summary — https://asana.com/features/resource-management/workload . ClickUp Workload view: switch between tasks and time estimates; per-person capacity limits. Search summary — https://help.clickup.com/hc/en-us/articles/30799838221335-Measure-availability-or-capacity-in-Workload-view
- **Why it matters.** For ten people the value is spotting the one overloaded person before month-end, not resource planning. One agreed definition of "open work" used everywhere matters more than precision.

### 3.4 Slippage: show the change, not only the current date

- **Pattern.** Date changes are recorded and shown next to status history, so a reader sees that a deadline moved, by how much and why.
- **Examples.** Linear: "Updates appear in chronological order along with any changes to properties", such as target dates. Confirmed — https://linear.app/docs/initiative-and-project-updates . Atlassian play: update the due date if needed, with a reason. Confirmed — https://www.atlassian.com/team-playbook/plays/weekly-project-updates
- **Why it matters.** A project that is "on track" after three date moves is not on track against the original plan. Baseline-vs-current is what a monthly review needs.
- **Unconfirmed.** Baseline comparison in Gantt views (Microsoft Project, Smartsheet) is a long-standing feature I did not verify from a source in this pass.

### 3.5 Charts for the monthly view

- **Pattern.** Bars and lines for quantities; no pie, donut, gauge or 3D; colour reinforces a category, it does not carry magnitude.
- **Source.** NN/g: bar charts are "a reliable means of representing quantitative data"; pie and donut charts are "notoriously poor at most information-communication tasks"; radial gauges are "harder to interpret than linear graphs". Confirmed — https://www.nngroup.com/articles/dashboards-preattentive/

---

## 4. Quarterly — goals, RAID, roles, retrospective

### 4.1 Goal review and re-planning on a quarterly cycle

- **Pattern.** Set → check in weekly → review mid-period → close, score and reflect → set the next period. Planning starts in the last weeks of the quarter.
- **Sources.**
  - Microsoft Viva Goals guidance, the "four Cs": Collaborate, Create, Check-in, Close; planning starts "during the last 1-2 weeks of a quarter"; check-ins "generally every week for 12 weeks"; closing takes 1–2 hours once a quarter; set reminders to avoid a "set it and forget it" mentality. Confirmed — https://learn.microsoft.com/en-us/viva/goals/viva-goals-healthy-okr-program/rhythm-of-business-overview
  - Google re:Work: annual and quarterly OKRs; graded 0.0–1.0 with a 60–70% sweet spot; a mid-quarter check-in; "OKRs are public so that everyone in the organization can see what others are working on"; "OKRs are not synonymous with performance evaluation". Confirmed — https://rework.withgoogle.com/intl/en/guides/set-goals-with-okrs
  - What Matters: craft, commit and share, check in and review, grade and reflect; quarterly is the most common cadence. Search summary — https://www.whatmatters.com/okrs-explained/okr-cycle-phases
  - Asana Goals: time frame "quarter, half, annual, or custom"; progress rolls up from linked sub-goals or projects; status on track / at risk / off track. Confirmed — https://asana.com/features/goals-reporting/goals
- **Why it matters.** Linking programs to a small set of period goals gives the quarterly review a fixed agenda. The Google point is directly relevant to a credit-point system: goal scores and individual evaluation are deliberately kept apart, because tying them together makes people set safe goals.

### 4.2 RAID review

- **Pattern.** Every entry has one owner, a priority, a status and a date identified. The log is reviewed at the regular status meeting and updated when things happen; a deeper review at phase or period boundaries closes dead items and re-rates the rest.
- **Source.** Asana RAID guide (fields and weekly review, quoted in 2.4). Confirmed — https://asana.com/resources/raid-log
- **Why it matters.** A risk with no owner and no review date is a note, not a control.
- **Unconfirmed.** A specific *quarterly* RAID review is my mapping of "review at each reporting interval and phase gate" (from a non-PMI secondary source) onto this team's rhythm. PMBOK's own wording on risk monitoring could not be opened.

### 4.3 Role and ownership changes

- **Pattern.** Exactly one accountable person per unit of work; responsibility may be shared. Changes of owner are logged, and open items and pending approvals move to the new owner.
- **Sources.** PMI blog on RACI treats the single accountable owner as the core rule. Search summary only (page returned 403) — https://www.pmi.org/blog/stakeholder-management-raci . Linear sends update reminders only to the project lead, and Asana lets you "view and assign owners for each project" (both confirmed, links in 2.1 and 3.2).
- **Why it matters.** Quarter boundaries are when people rotate. If a pending approval stays addressed to the previous manager, it is stuck with no visible cause.
- **Unconfirmed.** Automatic hand-over of pending approvals on role change is not something I found documented in any vendor source.

### 4.4 Retrospective

- **Pattern.** A time-boxed session at the end of each period that produces a short list of improvements, which are then tracked like any other action.
- **Source.** Scrum Guide: "The purpose of the Sprint Retrospective is to plan ways to increase quality and effectiveness"; at most three hours for a one-month Sprint. Confirmed — https://scrumguides.org/scrum-guide.html
- **Why it matters.** The output must land in the same action list as everything else, with an owner and a date, or it is forgotten by the next retrospective.

---

## 5. Yearly — performance evidence, transparency, roll-over

### 5.1 Reviews are written with the year's record open beside the form

- **Pattern.** While writing a review, the reviewer sees the person's goals, feedback, weekly updates, 1:1 notes and past reviews in a side panel, so the text draws on the whole period.
- **Examples.**
  - Lattice review context panel: Reviews (current and past), Feedback, Goals, Competencies, Growth areas, Updates, 1:1s; it "will update with new data even after the review cycle begins". Confirmed — https://help.lattice.com/en-us/articles/15179081-reviews-context-panel
  - Workday: a review template can include "Anytime Feedback" given during the period. Search summary — https://doc.workday.com/admin-guide/en-us/human-capital-management/talent/employee-reviews/common-employee-review-setup/employee-review-templates/sla1553895201351.html
  - Betterworks describes "evidence-based performance context" from goals, conversations and feedback. Vendor marketing, search summary only — https://www.betterworks.com/platform/peer-feedback/
- **Why it matters.** This is the direct counter to recency bias. Culture Amp: "Recency bias is the tendency to focus on the most recent time period instead of the total time period", remedied by "collecting employee feedback at different points throughout the year". Confirmed — https://www.cultureamp.com/blog/performance-review-bias

### 5.2 Calibration across managers

- **Pattern.** Before results are shared, ratings are looked at together so managers apply the same standard. The employee sees the final result, not the working notes.
- **Sources.** Culture Amp: "Calibration is when all reviews and ratings are looked at holistically". Confirmed — https://www.cultureamp.com/blog/performance-review-bias . Lattice: reviewees see only the calibrated rating; calibration notes are not visible to them. Search summary — https://help.lattice.com/hc/en-us/sections/1500002952521-Calibration
- **Why it matters for ten people.** With several PMs approving closes and one Owner, the equivalent is the Owner checking that credit is awarded to a similar standard across programs before it is used in a review.

### 5.3 What the person measured can see

- **Pattern.** The person sees their own record through the year, and can see who else has access to it. Every piece of feedback carries an explicit visibility level chosen when it is written.
- **Examples.** Lattice feedback visibility: Public, Private, Private + manager, Manager only; the recipient sees all but Manager only. Search summary — https://help.lattice.com/en-us/articles/15178958-customize-feedback-visibility-options-for-your-organization . 15Five: reporting-line access is always on and cannot be turned off, and the employee can view the access list (links in 2.2). 15Five's Private Manager Assessment is hidden from the employee by default. Search summary — https://success.15five.com/hc/en-us/articles/360004914871
- **Why it matters.** Market practice is not "everything is visible to everyone". It is: my own data is visible to me, the audience of each item is stated, and manager-only notes exist but are labelled as such. Nothing about a person should surprise them at year end.
- **Unconfirmed.** I found no source for a standard on showing an individual their *score relative to peers*. The tools above show the person their own record; peer comparison stays with managers.

### 5.4 Fairness practices

- **Pattern.** Rate on more than one dimension; define the scale so the top is rare; gather evidence across the full period; calibrate.
- **Source.** Culture Amp on halo / horns (rate at least 2–3 aspects), leniency (scale labels) and recency. Confirmed — https://www.cultureamp.com/blog/performance-review-bias
- **Why it matters for a credit-point system.** A single number per task invites halo and leniency effects. Published rules for how points are set, locking them after close, and logging manual adjustments are the equivalents.
- **Unconfirmed.** No vendor source describes a task-credit-point scheme. The mapping from review-tool practice to credit points is my inference.

### 5.5 Year roll-over and archiving

- **Pattern.** Finished work is archived, not deleted: it leaves active lists, stays searchable, and still opens by link. Goals are attached to a named period so a new year starts clean while the old one stays readable.
- **Examples.** Asana: archiving lets you "focus on active projects"; archived projects are found through Search and open for anyone with the link. Search summary — https://help.asana.com/s/article/understanding-projects . Asana Goals time periods (4.1). Linear cycles close and roll unfinished work forward (2.5).
- **Why it matters.** Performance evidence must outlive the project it came from. Year filters on credit and contribution views need an explicit label when they span all years.
- **Unconfirmed.** Whether archived Asana projects are read-only was not confirmed.

---

## 6. Cross-cutting standards

### 6.1 Role-based navigation and landing pages

- **Standard.** Show each role the few destinations it uses; defer the rest behind one clearly labelled control; keep to two levels of disclosure.
- **Source.** NN/g progressive disclosure: "Initially, show users only a few of the most important options"; "designs that go beyond 2 disclosure levels typically have low usability". Confirmed — https://www.nngroup.com/articles/progressive-disclosure/ . NN/g heuristic 8: "Interfaces should not contain information that is irrelevant or rarely needed". Confirmed — https://www.nngroup.com/articles/ten-usability-heuristics/
- **Market shape.** Personal page first for everyone (Asana My Tasks, Linear My Issues, Jira For you); portfolio / workload for managers (Asana Portfolios). Links above.
- **Unconfirmed.** No source prescribes a specific landing page per role; this is the common product shape.

### 6.2 Scope and filter controls

- **Standard.** The current scope is always visible, uses one consistent control in one place, and the same words everywhere. Users should not have to remember what they selected.
- **Source.** NN/g heuristic 4, *Consistency and standards* ("Users should not have to wonder whether different words, situations, or actions mean the same thing") and heuristic 6, *Recognition rather than recall* ("Minimize the user's memory load by making elements, actions, and options visible"). Confirmed — https://www.nngroup.com/articles/ten-usability-heuristics/
- **Market shape.** Linear exposes grouping through one "display options" control "on the top-right of the view" (confirmed — https://linear.app/docs/my-issues). Asana Inbox has no project filter, which Asana itself lists as a limitation (confirmed — https://asana.com/features/project-management/inbox).
- **Unconfirmed.** Where a project picker should sit, whether its value should persist across tabs and sessions, and when it should be hidden: I found no primary source. Reasonable defaults by inference from the two heuristics: one picker in a fixed header position; selection persists across tabs and reloads; on pages that are by nature cross-project (My Work, Portfolio) the picker is hidden or replaced by a visible "All projects" label, not left showing a value that is being ignored.

### 6.3 Status and colour consistency (RAG)

- **Standard.** One status vocabulary with one colour per meaning across every view; three health states are the market norm; colour is never the only signal.
- **Sources.**
  - WCAG 2.2 SC 1.4.1 (Level A): "Color is not used as the only visual means of conveying information". Confirmed — https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
  - IBM Carbon status indicator pattern: indicators combine colour with shape, icon or text; red = danger / error, yellow = warning, green = success, blue = in progress / information, grey = draft / not started; when statuses are consolidated "use the highest-attention color to represent the group"; more than five or six indicators on a screen can overwhelm. Confirmed — https://carbondesignsystem.com/patterns/status-indicator-pattern/
  - On track / At risk / Off track in Linear, Asana, Atlassian (links in 2.1).
- **Why it matters.** If amber means "at risk" on the portfolio and "submitted, awaiting approval" on the Gantt, readers must learn two legends. Roll-up by worst child is the documented rule for parent nodes.

### 6.4 Empty states and first-run onboarding

- **Standard.** An empty area says whether it is loading, failed, or truly empty; explains what will appear there; and offers a direct link to the first action. Teach in context at the moment of need, not with an up-front tour.
- **Sources.** NN/g empty states: communicate system status, provide learning cues, "Provide direct pathways (i.e., links) to getting started with key tasks". Confirmed — https://www.nngroup.com/articles/empty-state-interface-design/ . NN/g onboarding: tutorials "interrupt users", "don't tend to be memorable" and "don't result in better task performance"; prefer "help content triggered by some signal that the user would benefit from that information at that moment", easy to dismiss and to find again. Confirmed — https://www.nngroup.com/articles/onboarding-tutorials/
- **Why it matters.** A new member's My Work is empty on day one. "Nothing assigned yet — your PM assigns tasks in Plan" is the whole onboarding for that screen.

### 6.5 Feedback after save and on permission refusal

- **Standard.** Every action gets a visible result promptly. Failures are shown next to their cause, in plain language, say what to do next, and keep what the user typed. Controls the user may not use are either absent or shown disabled with the reason.
- **Sources.**
  - NN/g visibility of system status: "Whenever users interact with a system, they need to know whether the interaction was successful"; "No action with consequences to users should be taken without informing them". Confirmed — https://www.nngroup.com/articles/visibility-system-status/
  - NN/g error messages: "Display the error message close to the error's source"; "Avoid technical jargon and use language familiar to your users instead"; "Offer constructive advice"; let users fix the original input "instead of starting over". Confirmed — https://www.nngroup.com/articles/error-message-guidelines/ . Errors should not use toasts because users can miss them. Confirmed — https://www.nngroup.com/articles/indicators-validations-notifications/
  - NN/g on disabled buttons: use sparingly and explain why the action is unavailable. Confirmed from the video summary only — https://www.nngroup.com/videos/why-disabled-buttons-hurt-ux-and-how-to-fix-them/
  - Wix design system: for permission-restricted elements, explain why and how to gain access. Search summary — https://dev.wix.com/docs/wix-design-system/guidelines/interaction-behavior/disabled-states
- **Why it matters.** With server-enforced permissions, a refusal after the user has typed is the worst case. Prevent it by gating the control; where a refusal still happens, name who can do it.

### 6.6 Approval flows

- **Standard.** Three outcomes (approve / send back with a reason / reject); the request sits in the approver's personal list; the requester sees who it is waiting on; reminders then escalation on age.
- **Sources.** Asana approvals: Approve, Request changes, Reject, with comments to explain the decision (search summary — https://help.asana.com/s/article/how-to-use-approvals). A known Asana pain point: "Request changes" marks the approval task complete so it leaves My Tasks, and users ask for it to stay open (search summary of forum threads — https://forum.asana.com/t/approvals-request-change-should-keep-the-task-incomplete/76962). Reminder / escalation evidence in 2.7. Linear's stepped follow-up reminders for missing updates are a documented example of ageing-based nudges (confirmed — https://linear.app/docs/initiative-and-project-updates).
- **Why it matters.** The Asana forum thread is the useful lesson: a sent-back item must return to the requester's list as open work with the reason attached, or it vanishes from both sides.
- **Unconfirmed.** "Requester sees the named approver and waiting time" as a product default: not found in a primary source.

### 6.7 Transparency of performance data to the person measured

- See 5.3 and 5.4. Standard in short: own record visible all year; audience of each item stated; manager-only content exists but is labelled; goal scoring kept distinct from evaluation (Google re:Work, confirmed link in 4.1).

### 6.8 Mobile and small screens

- **Standard.** Content works at 320 CSS px wide without two-direction scrolling, except content that needs two dimensions (data tables, diagrams). Tables keep headers and the first column fixed and signal that more columns exist. Personal list and inbox are the mobile-first surfaces; dense planning views are desktop-first.
- **Sources.** WCAG 2.2 SC 1.4.10 Reflow. Confirmed — https://www.w3.org/WAI/WCAG22/Understanding/reflow.html . NN/g mobile tables: "Sticky column headers help users know what they are looking at"; "It must be apparent that there is more data beyond the horizontal fold". Confirmed — https://www.nngroup.com/articles/mobile-tables/ . monday.com mobile My Work supports table and calendar views only (search summary — https://support.monday.com/hc/en-us/articles/360019159959-Mobile-app-My-Work). Jira mobile shows project updates and a status summary (search summary, link in 2.6).
- **Why it matters.** Realistic mobile use for this team: check My Work, approve or reject, comment, mark an action done. Gantt and mind map fall under the two-dimension exception, but should not break the page.

### 6.9 Density for a small team

- **Standard.** Add process only where an existing rhythm needs it; keep the first screen to the frequent few; one definition per metric.
- **Sources.** Microsoft: "Don't force a new process"; a 20-person startup can run a "loose and flexible" rhythm with status as "a few bullet points in a chat conversation". Confirmed — https://learn.microsoft.com/en-us/viva/goals/viva-goals-healthy-okr-program/rhythm-of-business-overview . NN/g heuristic 8 and progressive disclosure (links in 6.1). Carbon's five-to-six indicators per screen limit (link in 6.3).
- **Why it matters.** Enterprise features (points estimation, capacity in hours, multi-step approval chains, configurable workflows) cost more attention than they return at ten people. Workload by task count, one approval level, three health states and one weekly update are the proportionate versions.

---

## 7. Checklist

### Member

1. A member lands on their own work list after sign-in, without choosing a project first.
2. That list is grouped by time (overdue / today / this week / later) and items move between groups by date automatically.
3. Overdue items and items where someone is waiting on the member appear above everything else.
4. Tasks with no due date are visible in a labelled group, not hidden.
5. New assignments since the last visit are marked as new until the member opens or dismisses them.
6. Mentions, comments and decisions on the member's requests arrive in one place and each can be cleared or deferred.
7. A member can update status, add a comment, or submit a task for approval from the list row without opening a full page.
8. After submitting for approval, the member still sees the task, the name of the approver, and how long it has been waiting.
9. A rejected request returns to the member's list as open work with the reason shown on it.
10. A member can see their own credit record and closed work for the year at any time, with the period it covers labelled.
11. A member can see who else is able to view their performance data.

### PM

12. A PM sees the number of requests waiting for their decision without clicking.
13. Each pending approval shows how long it has waited, and items past the escalation threshold are visually distinct.
14. A PM can approve or reject (reason required) from the queue row.
15. A PM can list blocked, overdue and not-updated-this-week items in their programs in one step.
16. A PM can see open work per person against a stated capacity, using one definition of "open" that matches every other screen.
17. A PM can produce the periodic status report (health, highlights, risks, decisions needed, next steps) from data already in the tool.
18. Date changes to a program or work stream are visible as history (old date, new date, who, when), not only the current date.
19. When a PM or Sub-PM is replaced, their pending approvals and open items move to the successor and the change is logged.

### Sub-PM

20. A Sub-PM sees their own tasks and their work stream's tasks as two distinct groups on one page.
21. A Sub-PM can see which of their work stream's tasks have had no update within the cadence.
22. A Sub-PM can create an action item during a meeting with one owner and a due date, and it appears in that owner's list immediately.
23. Controls a Sub-PM is not allowed to use are hidden, or disabled with the reason and who can do it.
24. A Sub-PM can see every RAID item in their work stream with its owner, status and date identified.

### All

25. Every status uses the same word and the same colour in every view, and no status is shown by colour alone.
26. A parent node (work stream, program, project) shows the worst health of its children.
27. The current project scope is visible on every page; on cross-project pages the picker is hidden or reads "All projects".
28. The selected project and view survive a reload and a tab switch.
29. Every save shows a visible result within a moment; a failed save says what failed, keeps the user's input, and says what to do.
30. A permission refusal names the reason in plain language and never appears as a raw error code.
31. Every empty list says why it is empty and offers the first action.
32. Every action item, risk and decision has exactly one owner and a date.
33. Closed and dropped work stays searchable and readable; nothing is hard-deleted.
34. My Work, approvals and commenting are usable at 320 px width without horizontal page scrolling.
35. The first screen for each role shows no more than about six status indicators and no control that role cannot use.

---

## Source list

Asana
- https://asana.com/resources/asana-tips-my-tasks
- https://asana.com/features/project-management/inbox
- https://asana.com/resources/how-project-status-reports
- https://asana.com/features/goals-reporting/portfolios
- https://asana.com/features/goals-reporting/goals
- https://asana.com/features/resource-management/workload
- https://asana.com/resources/raid-log
- https://help.asana.com/s/article/how-to-use-approvals
- https://help.asana.com/s/article/project-progress-and-status-updates
- https://help.asana.com/s/article/understanding-projects

Linear
- https://linear.app/docs/inbox
- https://linear.app/docs/my-issues
- https://linear.app/docs/triage
- https://linear.app/docs/initiative-and-project-updates
- https://linear.app/docs/use-cycles

Atlassian
- https://www.atlassian.com/team-playbook/plays/weekly-project-updates
- https://support.atlassian.com/platform-experiences/docs/update-reminders-for-goals-and-projects
- https://support.atlassian.com/jira-software-cloud/docs/what-is-the-for-you-page/

Other work tools
- https://basecamp.com/hill-charts
- https://support.monday.com/hc/en-us/articles/360019300579
- https://help.clickup.com/hc/en-us/articles/12724229385623-Intro-to-Inbox
- https://help.clickup.com/hc/en-us/articles/30799838221335-Measure-availability-or-capacity-in-Workload-view
- https://www.notion.com/help/updates-and-notifications
- https://support.microsoft.com/en-us/planner/training/manage-your-tasks-with-my-tasks-and-my-day

Performance tools
- https://success.15five.com/hc/en-us/articles/360002698971
- https://success.15five.com/hc/en-us/articles/50989072220187
- https://help.lattice.com/en-us/articles/15179081-reviews-context-panel
- https://help.lattice.com/en-us/articles/15178958-customize-feedback-visibility-options-for-your-organization
- https://www.cultureamp.com/blog/performance-review-bias

Frameworks and guidelines
- https://scrumguides.org/scrum-guide.html
- https://rework.withgoogle.com/intl/en/guides/set-goals-with-okrs
- https://learn.microsoft.com/en-us/viva/goals/viva-goals-healthy-okr-program/rhythm-of-business-overview
- https://www.nngroup.com/articles/ten-usability-heuristics/
- https://www.nngroup.com/articles/indicators-validations-notifications/
- https://www.nngroup.com/articles/dashboards-preattentive/
- https://www.nngroup.com/articles/progressive-disclosure/
- https://www.nngroup.com/articles/empty-state-interface-design/
- https://www.nngroup.com/articles/onboarding-tutorials/
- https://www.nngroup.com/articles/visibility-system-status/
- https://www.nngroup.com/articles/error-message-guidelines/
- https://www.nngroup.com/articles/mobile-tables/
- https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- https://carbondesignsystem.com/patterns/status-indicator-pattern/
