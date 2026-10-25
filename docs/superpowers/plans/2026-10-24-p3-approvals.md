# P3 — Approvals Inbox, `Submitted` Status, Scoped Plan Upload: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a `schemaVersion: 2` project:
- an Assignee closes a task by **"Submit as done" / "Submit as dropped"**;
- the direct manager approves it or rejects it with a reason, and the Owner can override;
- every pending request shows in one **Approvals** tab;
- a PM or Sub-PM uploads a workstream or program plan from Excel, and the Owner approves it before it is written.

**Architecture:**
- **Task closing lives on the task doc** (Ruling P3-1):
  - `status: 'Submitted'`, a `closeRequest` map, and a prepend-only `closeRequestHistory`.
  - Firestore rules check every transition on that one doc.
  - It goes through the existing tree → `planV2Save` → `executeV2Save` path.
- **Requests that span many docs or that the requester cannot write** (`plan_import`, `scope_deadline`, `mitigation_done`) are `approvals/{reqId}` docs.
  - They are written by a small injected-Firestore module, `src/approvalsStore.js`, in the same style as `execV2Save.js`.
- **The App derives everything else from the in-memory trees through pure modules:**
  - the inbox;
  - who approves;
  - escalation;
  - the import diff.
- **The read path attaches role data to each v2 tree** as `project.__v2.roles` and `project.__v2.approvals`. The planner already skips `__v2`.
- **One choke point in `applyTaskUpdate`** turns any "set Completed/Dropped" that the user cannot do directly into a submission. So My Work, the task panel and the status pills all get the flow without being edited one by one.

**Tech Stack:** React 18 (JSX), Firestore client SDK v11 (transactions), Firestore rules + `@firebase/rules-unit-testing` (emulator, **CI only**), Vitest 2, SheetJS.

**Spec:**
- `docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md`: §2 / §2.1 decisions 3, 4, 8, 9, 12; §4 matrix and direct-manager rule; §5; §6; §10; §11 P3 gate; §12 Q3 / Q6.
- Binding contract: `docs/superpowers/plans/2026-10-23-p2-roadmap.md`, sections **"Contract fixed by P2.1"** and **"P2.3 status → Accepted until P3"**.
- Rulings this plan builds on: `docs/superpowers/plans/2026-10-23-p2-3-write-path.md` R, T, X, AA, AD, AE, AF, AH.
- Approvals parts of the review: `docs/reviews/2026-10-14-permissions-uiux-market-review.md` S4, S5, S9 and §4.4.

**Base branch:**
- Start `feat/p3-1` from `main` once P2.3 (#20) and P2.4 are merged.
- Until then, start from `feat/p2-4` and rebase later.
- Ship it as three PRs: **P3.1** = Tasks 1–9, **P3.2** = Tasks 10–13, **P3.3** = Tasks 14–15. Task 16 holds the docs and runbook for each PR.

## Rulings (decided while planning, 24/10/2026)

Format: **Ruling P3-x: decision — why — cost if wrong.**

- **P3-1:** `task_close` state lives on the task doc:
  - **Decision:**
    - `status: 'Submitted'`;
    - `closeRequest = { id, outcome, requestedByUid, requestedBy, approverUid, submittedAt, prevStatus, note }`;
    - `closeRequestHistory` holds the decisions, newest first, with `before` / `after`;
    - no approvals doc for `task_close`, `task_deadline` or `raid_activate`.
  - **Why:**
    - Rules can only check the doc being written, so keeping the request on it makes each transition atomic and rules-checked.
    - It reuses the one write path (planner/executor).
    - `deadlineRequest` and RAID `PendingApproval` already work this way.
  - **Cost if wrong:**
    - There is no single approvals ledger; it can be rebuilt by script from `closeRequestHistory` + activity.
    - The Owner or a PM can rewrite the history list. That is deliberate misuse only, as with Ruling T.
- **P3-2:** `approvals/{reqId}` docs exist only for `plan_import`, `scope_deadline` and `mitigation_done`.
  - **Rules:** never deleted; payload immutable after create.
  - **Read path:** loaded with the project into `__v2.approvals`. A failed read gives `null`; the project still loads, and the inbox says "Couldn't load requests for {project}".
  - **Why:**
    - Their payload spans many docs (import diff, WS/program dates).
    - For `mitigation_done`, the requester cannot write the target at all.
  - **Cost if wrong:** one extra query per v2 project load.
- **P3-3:** A manager closes directly a task they are not PIC of, stamping `approvedByUid` = themself:
  - a manager is the Sub-PM of the WS, or the PM/Deputy of the program;
  - their own tasks must be submitted (Sub-PM → PM, PM/Deputy → Owner);
  - the Owner closes anything directly.
  - **Why:** §4 gives managers the approval right, so closing a task = approving it. It also avoids a request addressed to oneself.
  - **Cost if wrong:** a Sub-PM can close an Assignee's task without a submission. It is still stamped and logged.
- **P3-4:** Who may decide a request: the named approver; the PM/Deputy of the program when the requester is neither of them; or any Owner — never the requester. Rules and UI apply the same test at any time.
  - **The 3-working-day escalation is inbox visibility only**: the request appears in the next level's Approvals. It is not a rules gate.
  - **Why:** rules cannot count working days, and a higher level deciding early is harmless and logged.
  - **Cost if wrong:** a PM can pre-empt a Sub-PM's decision.
- **P3-5:** Working days are Mon–Fri with no public holidays. A request is escalated when **more than 3** working days have passed since `submittedAt`. Dates are counted in client local time.
  - **Why:** there is no holiday calendar in the app.
  - **Cost if wrong:** around Tết, requests escalate early by the number of holidays.
- **P3-6:** Reject and withdraw.
  - **Reject:** the task goes back to `InProgress` (spec §5). A non-empty reason is required (rules check it), and an update entry `"Close request rejected: {reason}"` is prepended.
  - **Withdraw:** only the requester can withdraw, and the task goes back to `closeRequest.prevStatus`. Rules accept Planned or InProgress.
  - **Cost if wrong:** copy and UI only.
- **P3-7:** An approval keeps the requested outcome (`status == closeRequest.outcome`). To turn Done into Dropped, the approver rejects with a reason.
  - **Why:** the rule stays simple, and the approver cannot change the meaning of the request.
  - **Cost if wrong:** one extra round-trip for the Assignee.
- **P3-8 (closes Ruling W):** An Assignee or contributor resolves a blocker **without approval**, through an append-only map `task.blockerResolutions[updateId] = { resolvedAt, resolvedBy, resolution, authorUid }`.
  - Each write adds one key, with `authorUid == caller`.
  - The read path folds the map into the matching `updates` entry. The planner unfolds an in-place resolution back into the map. App.jsx is unchanged.
  - **Why:**
    - §4 gives the Assignee "update/comment" rights; resolving a blocker is an update, not a closure.
    - Rules can diff map keys but cannot target one list element.
  - **Cost if wrong:** two stored forms of a resolution (legacy in-place, new map), hidden by the fold.
- **P3-9 (closes Ruling AG):** A mitigation PIC marks a mitigation Done by sending a `mitigation_done` request.
  - The request goes to the program's PM (or Deputy, or Owner when the program has no PM).
  - A PM, a Sub-PM or the Owner approves and applies it.
  - **Why:**
    - §4 gives Assignees no RAID rights (Q1: RAID is PM/Sub-PM).
    - `mitigation.pic` is a name, not a uid, so no rule can recognise the PIC.
    - RAID stays one doc per program (K′).
  - **Cost if wrong:** friction for the PIC. Direct marking would need mitigation `picUid` plus per-mitigation docs (P4+).
- **P3-10:** `task_deadline` routing:
  - **Approver:** the direct manager when the new date is within the WS window, otherwise the Owner (spec §5).
  - **Rules are unchanged:** `taskDatesOk` already lets a Sub-PM/PM change `end` only within the WS window.
  - **New requests** carry `requestedByUid`. Legacy requests without it go to the Owner.
  - **Cost if wrong:** routing copy only.
- **P3-11:** `raid_activate` may be done by the PM/Deputy of the program or by the Owner. This is enforced in the UI only.
  - **Why:** rules cannot target a RAID item, and Q1 lets any PM/Sub-PM write RAID.
  - **Cost if wrong:** a Sub-PM could activate their own item through devtools. It would still be logged.
- **P3-12:** Scope of the scoped upload:
  - **No new structure:** it never creates programs or workstreams; rows naming an unknown WS are rejected and listed.
  - **No closing:** a non-Owner upload cannot change status to or from `Completed` / `Dropped` / `Submitted`; closing goes through Submit.
  - **Missing tasks:** a task missing from the file is dropped only when the uploader ticks "Also drop N tasks missing from the file". The default is unticked.
  - **Unknown PIC:** a PIC not in the directory blocks the whole upload (§6.2).
  - **Not read from the file:** WS/program dates (they go through `scope_deadline`) and References (edited daily by Assignees).
  - **Why:** least surprise. This deviates from §6.6, because the export has no WS date column.
  - **Cost if wrong:** a WS date change needs a separate request.
- **P3-13:** Conflict check at approval time compares field values. The request stores `from` per changed field; the Owner's review lists "changed since submitted" rows, then applies all or rejects.
  - **Why:** the App tree carries no doc versions. A field-level `from` detects the same conflicts as §5's `baseVersions`.
  - **Cost if wrong:** an edit back to the same value is not flagged.
- **P3-14:** Size limits for one apply:
  - at most **450 changed tasks** (the transaction limit is 500 writes);
  - a request payload of at most **800 000 bytes** of JSON.
  - Above either limit the upload is blocked with "Split the upload by workstream".
  - **Cost if wrong:** none at current sizes (the largest project, CRP, has 187 tasks).
- **P3-15:** The flow applies to **v2 only**: Submit/approve, `task_close` inbox items and scoped upload.
  - v1 projects keep today's status buttons.
  - **Before performance use:** all projects must be on v2 (P2.4 done), per spec §11.
  - **Cost if wrong:** a v1 project allows direct closing until it migrates.
- **P3-16:** "View as" is read-only (§2.1 decision 12).
  - Impersonation blocks every write at the choke points (`updateProject`, `logActivity*`, `approvalsApi`) with the toast "View as is read-only".
  - The inbox and badges show the viewed person's items.
  - This replaces today's "acting as" writes.
  - **Cost if wrong:** the Owner can no longer fix things while impersonating someone; they exit View as first.
- **P3-17:** The old scattered approval UI stays until P4 (role-based UI):
  - the My Work deadline-approval block;
  - the RAID pending badge;
  - the RAID approval banner.
  - Their approve buttons switch from `isOwner` to the P3 eligibility helpers.
  - **Why:** no mass App.jsx change in P3.
  - **Cost if wrong:** two places to approve until P4.
- **P3-18:** Credit and performance count `Completed` only (unchanged `isTaskCredited`).
  - `Submitted` earns nothing, has progress weight 0.5, and is never overdue.
  - **On v2, rules guarantee:**
    - every non-Owner transition to `Completed` / `Dropped` carries `approvedByUid == caller`;
    - the caller is an eligible, non-self decider;
    - Owner transitions carry the stamp too.
  - Tasks already `Completed` before cutover count as they are.
  - **Cost if wrong:** none for new data. Legacy completions were never approved.
- **P3-19:** Activity events. Each one goes through the existing `appendActivity` with `before` / `after`.
  - **Task events:** `close_submitted`, `close_approved`, `close_rejected`, `close_withdrawn`, `close_reassigned`, `close_direct`, `close_reopened`.
  - **Request events:** `approval_created`, `approval_approved`, `approval_rejected`, `approval_withdrawn`, `approval_reassigned`.
  - Activity is written after the save, so it is not atomic with it. The atomic record is `closeRequestHistory` or the approvals doc; activity is the immutable feed.
  - **Cost if wrong:** a crash between the save and the log loses one feed entry.
- **P3-20:** Approver uids for the Owner level come from `ownerUids` only, not the legacy `workspaceOwner` email.
  - The client picks `ownerUids[0]`, and any Owner may decide.
  - **Why:** the P2.1 contract set `ownerUids`, and rules compare uids.
  - **Cost if wrong:** none while `ownerUids` is set.
- **P3-Q3 (PROVISIONAL — HOD to confirm):**
  - A `Submitted` task is not overdue for anyone.
  - P3 adds no "slow approval" metric to the Activity Dashboard; pending age and escalation show in Approvals only.
  - **Why:** the spec gives no recommendation. Adding a new score is a feature beyond the spec.
  - **Cost if wrong:** a later metric computed from `closeRequest.submittedAt`; no data change needed.
- **P3-Q6 (PROVISIONAL — HOD to confirm):** Overdue = `end` < today (local date) and status ∈ {Planned, InProgress}, where a missing status counts as Planned. `Submitted`, `Completed` and `Dropped` are never overdue.
  - One helper, `isOverdueTask`, replaces every ad-hoc check.
  - **Why:** this is the spec's own proposal.
  - **Cost if wrong:** change one helper.
- **Q2 (webhook):** out of scope. Approvals send no Google Chat notifications.

## Global Constraints

- **UI labels are English, verbatim** (§2.1 decision 9):
  - status label `Pending approval`;
  - buttons `Submit as done`, `Submit as dropped`, `Approve`, `Reject`, `Withdraw`, `Reassign`, `Reopen`, `Upload plan`, `Request deadline change`;
  - tab `Approvals`;
  - inbox sections `Pending approval`, `Escalated`, `Sent`, `All pending` (Owner only).
- **Contract P2.1 binds every v2 write:**
  - `updatedBy == uid`;
  - `version` is 1 on create and +1 on update;
  - rules key people on `picUid` (never names);
  - `programMeta` and the project doc are Owner-only.
- **Tasks are never hard-deleted** (CLAUDE.md). An import "delete" becomes `Dropped`.
- **App.jsx gets wiring only**, in the places each task names. New UI goes in `src/components/`, new logic in pure `src/*.js` modules. No mass refactor.
- **Rules tests:**
  - every new rules branch gets ≥1 allow and ≥1 deny test in `tests/rules/` (CI only; no Java locally);
  - the header comment of each rules block keeps its `get()` count (≤ 6 per op);
  - all existing suites stay green.
- **Unit tests:** every pure function has Vitest tests in `tests/unit/`. Run them locally with `npm test`.
- **No Firestore production writes and no rules deploy** in this plan's tasks. Rules ship only after CI is green and HOD exports Backup JSON + Excel (runbook, Task 16).
- **Quality gates:**
  - `npm run lint` stays at ≤ 6 errors / 63 warnings;
  - `npm run build` passes;
  - commits use conventional style (`feat(p3): …`, `feat(rules): …`).

## Review Focus

1. **An Assignee clicks a "Completed" control anywhere:** the My Work one-click, a status pill, or the task panel.
   - **Expected:** the task becomes `Pending approval`, and a toast names the approver.
   - **Not expected:** a denied banner. Pinned by `applyCloseIntent` tests (Task 6) and the integration test (Task 9).
2. **Gaps in the hierarchy:**
   - A WS without a Sub-PM, or a program without a PM → the approver falls through to the PM, then the Owner.
   - A Sub-PM's own task → PM.
   - A PM's or Deputy's own task → Owner.
   - Pinned by `directApprover` tests (Task 6) and rules P3-08 / P3-09 (Task 2).
3. **Two managers decide the same request at once** (Sub-PM approves while PM rejects).
   - **Expected:** the second gets a conflict and nothing is double-applied. Pinned by integration test P3I-3 (Task 9).
4. **An uploaded Excel holds only a filtered subset of rows.**
   - **Expected:** nothing is dropped unless the uploader ticks "Also drop N tasks missing from the file". Pinned by `applyScopedPlan` tests (Task 14).
5. **The approver or requester is changed while the request is pending:**
   - reassigning to the requester is denied;
   - a requester cannot approve after being made approver.
   - Pinned by rules P3-10 (Task 2) and P3-37 (Task 4).

---

## PR P3.1 — `Submitted` status, close rules, blockers

### Task 1: Status helpers and the Q6 overdue definition

**Files:**
- Create: `src/taskStatus.js`
- Modify, in `src/App.jsx`:
  - `STATUS_LABEL`: add `Submitted: 'Pending approval'`;
  - `STATUS_WEIGHT`: add `Submitted: 0.5`;
  - the `Pill` map: add `Submitted` with `fg '#B7791F'`, `bg '#FAEEDA'` and the `Clock` icon (import from lucide-react if missing);
  - `isOverdue` (line ~218) delegates to `isOverdueTask(t, today())`.
- Also in `src/App.jsx`, every ad-hoc overdue check found by
  `grep -n "status !== 'Completed' && t.status !== 'Dropped'\|=== 'Dropped' || t.status === 'Completed'\|const isOverdueTask = " src/App.jsx`:
  - replace each condition with `isOverdueTask(...)`;
  - this covers `computeActivityIndex`'s `isOverdueTask`, the briefing / Weekly overdue lists and the My Work / dashboard overdue loops;
  - the status counter that does `else planned++` (line ~1191) counts `Submitted` as in progress.
- Test: `tests/unit/taskStatus.test.js`

**Interfaces:**
- Produces:
  - `export const OPEN_STATUSES = ['Planned', 'InProgress']`;
  - `export function statusOf(task): string`: a missing status gives `'Planned'`;
  - `export function isOverdueTask(task, today: Date): boolean`: `end` is a `'yyyy-mm-dd'` string compared as a local date;
  - `export function progressWeight(status: string): number | null`;
  - `export function isCreditedCompletion(task): boolean`.

- [ ] **Step 1: Write failing tests.**
  - `isOverdueTask({status:'InProgress', end:'2026-10-23'}, new Date(2026,9,24)) === true`;
  - `isOverdueTask({end:'2026-10-23'}, …) === true` (missing status = Planned);
  - `isOverdueTask({status:s, end:'2026-10-01'}, new Date(2026,9,24)) === false` for each s of `['Submitted','Completed','Dropped']`;
  - `isOverdueTask({status:'Planned', end:'2026-10-24'}, new Date(2026,9,24)) === false` (due today is not overdue);
  - `isOverdueTask({status:'Planned', end:null}, …) === false`;
  - `progressWeight('Submitted') === 0.5`, `progressWeight('Completed') === 1`, `progressWeight('Dropped') === null`;
  - `isCreditedCompletion({status:'Submitted'}) === false` and `isCreditedCompletion({status:'Completed'}) === true`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/taskStatus.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `src/taskStatus.js`. Wire it into App.jsx at the places listed under **Files**.
- [ ] **Step 4:** Run `npm test`, `npm run lint` and `npm run build`. Expected: all pass; lint ≤ 6/63.
- [ ] **Step 5:** Commit: `feat(p3): Submitted status label/weight; one overdue helper (Q6 provisional)`.

### Task 2: Rules — task close transitions

**Files:**
- Modify: `firestore.rules`, the v2 tasks block (`assigneeKeys`, `taskAssigneeUpdate`, `taskPMUpdate`, `taskLeadUpdate`, `taskUpdateOk`, task `create`).
- Test: `tests/rules/v2-p3.test.js` (new). Copy the fixture constants and helpers from `tests/rules/v2-p23.test.js`.
  - The seed task `t1` has `picUid: ASG.uid`, programId `prg1`, workstreamId `w1` (lead LEAD), status `InProgress`.
  - `programMeta.prg1` has `pmUid: PM.uid`, `deputyUid: DEPUTY.uid`.
  - `ownerUids: [OWNER.uid]`.

**Rules contract.** In this contract, `o` = `resource.data`, `n` = `request.resource.data`, `me` = `request.auth.uid`.
- **Helpers:**
  - `closeKeys() = ['status','closeRequest','closeRequestHistory','approvedByUid','approvedAt','closedByUid']`.
  - `isClosedSt(s)` = s ∈ {Completed, Dropped}; `isOpenSt(s)` = s ∈ {Planned, InProgress}. A status is read with `get('status','Planned')`.
- **`eligibleApprover(wid, pid, d, a, requester)`**, a mirror of `eligibleApprovers` in Task 6:
  - `a` is a string and `a != requester`; and
  - one of:
    - `a in v2Workspace(wid).get('ownerUids', [])`;
    - `requester` is neither the PM nor the Deputy of `d.programId`, and `a` is that PM or Deputy;
    - `requester` is neither PM nor Deputy, and `a` is the `leadUid` of `d.workstreamId`.
- **`canDecide(wid, pid, d, cr)`:**
  - `me != cr.requestedByUid`; and
  - one of:
    - `me == cr.approverUid`;
    - `isWsOwner(wid)`;
    - `isPM(wid, pid, d.programId)`, and `cr.requestedByUid` is neither the PM nor the Deputy of that program.
- **`histOk(status)`:** `appendOnly(ch, 'closeRequestHistory')`, the size grows by exactly 1, `n.closeRequestHistory[0].status == status`, and `n.closeRequestHistory[0].decidedByUid == me`.
- **`closeTransitionOk(wid, pid, ch, mgr)`** is true when `!ch.hasAny(closeKeys())`, or when one of these transitions holds:
  - **openMove:** `isOpenSt(s0) && isOpenSt(s1)`, and no close key other than `status` changed.
  - **submit:**
    - `isOpenSt(s0) && s1 == 'Submitted'`;
    - `n.closeRequest.requestedByUid == me`;
    - `n.closeRequest.outcome in ['Completed','Dropped']`;
    - `eligibleApprover(…, n.closeRequest.approverUid, me)`;
    - `(o.picUid == me || mgr)`;
    - `!ch.hasAny(['closeRequestHistory','approvedByUid','approvedAt','closedByUid'])`.
  - **withdraw:** `s0 == 'Submitted'`, `o.closeRequest.requestedByUid == me`, `isOpenSt(s1)`, `n.get('closeRequest', null) == null`, and `histOk('Withdrawn')`.
  - **approve:** `s0 == 'Submitted'`, `canDecide(…, o.closeRequest)`, `s1 == o.closeRequest.outcome`, `n.closeRequest == null`, `n.approvedByUid == me`, and `histOk('Approved')`.
  - **reject:** `s0 == 'Submitted'`, `canDecide`, `s1 == 'InProgress'`, `n.closeRequest == null`, `histOk('Rejected')`, and `n.closeRequestHistory[0].reason` is a string of size > 0.
  - **reassign:**
    - `s0 == s1 == 'Submitted'`;
    - `n.closeRequest.diff(o.closeRequest).affectedKeys().hasOnly(['approverUid'])`;
    - `eligibleApprover(…, n.closeRequest.approverUid, o.closeRequest.requestedByUid)`;
    - `isPM(wid, pid, o.programId)` (the Owner is unrestricted through the Owner branch);
    - `histOk('Reassigned')`.
  - **directClose** (`mgr` only): `isOpenSt(s0)`, `isClosedSt(s1)`, `o.get('picUid', null) != me`, and `n.approvedByUid == me`.
  - **reopen** (`mgr` only): `isClosedSt(s0)`, `isOpenSt(s1)`, and `!ch.hasAny(['closeRequest','closeRequestHistory'])`.
- **`closeStampOk(ch)`** applies to all writers, the Owner included: `!(ch.hasAny(['status']) && isClosedSt(s1)) || n.get('approvedByUid', null) == me`.
- **Assignee branch:**
  - keys allowed: `assigneeKeys()` + `['closeRequest','closeRequestHistory','blockerResolutions']` (the `blockerResolutions` checks are added in Task 3);
  - `s0 in ['Planned','InProgress','Submitted']`;
  - `closeTransitionOk(…, false)`;
  - the old line `request.resource.data.status in ['Planned','InProgress']` is removed (the transitions replace it);
  - `updates` / `checkIns` stay append-only.
- **PM and Lead branches:** add `&& closeTransitionOk(…, true)`.
- **`taskUpdateOk`:** add `closeStampOk(ch)` beside `newEntryOk`.
- **Task create by a non-Owner:** `request.resource.data.get('status','Planned') in ['Planned','InProgress']`.

- [ ] **Step 1: Write failing tests.** Each name states the actor and the outcome:
  - `P3-01 ASG submits t1 as Completed naming LEAD: allowed`.
  - `P3-02 ASG submit naming ASG / OUTSIDER: denied; naming PM / OWNER: allowed`.
  - `P3-03 ASG sets Completed directly, or Submitted without closeRequest: denied`.
  - `P3-04 ASG withdraws (→ InProgress, history[0] {status:'Withdrawn', decidedByUid: ASG}): allowed; LEAD withdrawing ASG's request: denied`.
  - `P3-05 LEAD approves (status Completed, approvedByUid LEAD, history Approved): allowed`. It is denied when `approvedByUid` is ASG, or when the status is `Dropped` against outcome `Completed`.
  - `P3-06 ASG approves own request: denied`.
  - `P3-07 LEAD rejects with reason 'missing evidence': allowed; reason '': denied`.
  - `P3-08 PM approves a request addressed to LEAD: allowed; DEPUTY approves PM's own request: denied; OWNER approves: allowed`.
  - `P3-09 LEAD submits own task naming PM: allowed`.
    - LEAD direct-closes their own task: denied.
    - LEAD direct-closes ASG's task with `approvedByUid` LEAD: allowed; without it: denied.
  - `P3-10 PM reassigns LEAD→DEPUTY with history Reassigned: allowed; ASG reassigns: denied; PM reassigns to ASG (requester): denied`.
  - `P3-11 OWNER sets Completed without approvedByUid: denied; with approvedByUid OWNER: allowed`.
  - `P3-12 LEAD reopens Completed → InProgress: allowed; ASG reopens: denied`.
  - `P3-13 ASG appends an update while Submitted: allowed; ASG changes closeRequest.outcome while Submitted: denied`.
  - `P3-14 VIEWER (contributor) submits: denied`.
  - `P3-15 LEAD creates a task with status Completed: denied; with InProgress: allowed`.
  - Existing P2.3 tests stay. **P23-21 (Ruling W) keeps its in-place list-edit denial.**
- [ ] **Step 2:** Push the branch and confirm CI fails on the new tests only.
- [ ] **Step 3:** Implement.
  - Compute `ch`, `s0`, `s1` once with `let` (expression limit, see the note at `changedKeys`).
  - Update the tasks header comment, including the `get()` counts (update stays ≤ 5: workspace, members, project, old ws, new ws).
- [ ] **Step 4:** Push and confirm CI is green across all suites.
- [ ] **Step 5:** Commit: `feat(rules): P3 — Submitted transitions, no self-approval, approvedByUid stamp`.

### Task 3: Rules — blocker resolutions map

**Files:**
- Modify: `firestore.rules`, the tasks block.
- Test: `tests/rules/v2-p3.test.js`.

**Rules contract:**
- **`mapOrEmpty(d, k)`:** `d.get(k, null) == null ? {} : d.get(k, null)`.
- **`resolutionNewOk(ch)`** applies to all writers:
  - `!ch.hasAny(['blockerResolutions'])`, or
  - the new value is a map with at most 1 added key, and the added key's value has `authorUid == me`.
  - Compute the diff once: `let df = n2.diff(o2)`.
- **`resolutionAppendOnly(ch)`** applies to the Assignee and contributor branches:
  - `!ch.hasAny(['blockerResolutions'])`, or
  - `df.removedKeys().size() == 0 && df.changedKeys().size() == 0 && df.addedKeys().size() == 1`.
- **Keys:** add `'blockerResolutions'` to `contributorKeys()`; the Assignee list already got it in Task 2.

- [ ] **Step 1: Write failing tests:**
  - `P3-20 ASG adds blockerResolutions.u1 {resolvedAt, resolvedBy, resolution, authorUid: ASG}: allowed`.
  - `P3-21 contributor VIEWER adds one with authorUid VIEWER: allowed; with authorUid ASG: denied`.
  - `P3-22 ASG adds two keys in one write: denied; ASG edits an existing key: denied; LEAD edits an existing key: allowed`.
- [ ] **Step 2:** Push and confirm CI fails on these tests.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Push and confirm CI is green.
- [ ] **Step 5:** Commit: `feat(rules): P3 — append-only blockerResolutions (closes Ruling W)`.

### Task 4: Rules — `approvals/{reqId}`

**Files:**
- Modify: `firestore.rules`. Add a new block after `decisions`.
- Test: `tests/rules/v2-p3.test.js`.

**Doc shape (P3-2):**

```
{ workspaceId, projectId, type: 'plan_import'|'scope_deadline'|'mitigation_done',
  scope: { programId, workstreamId?, taskId? }, title, payload,
  requestedByUid, requestedBy, approverUid,
  status: 'Pending'|'Approved'|'Rejected'|'Withdrawn',
  createdAt, decidedByUid, decidedAt, reason, reassignLog: [],
  version, updatedBy, updatedAt }
```

**Rules contract:**
- **read:** `canReadProject(wid, pid)`.
- **create:** all of these must hold:
  - `pathFieldsOk`, `versionOnCreate`, `stampedByMe`;
  - `n.requestedByUid == me`, `n.status == 'Pending'`, `n.createdAt == request.time`;
  - `n.get('decidedByUid', null) == null`, `n.reassignLog == []`;
  - `canReadProject`;
  - plus one of:
    - (a) `type in ['plan_import','scope_deadline']`, and `approverUid in ownerUids`, and the requester is either `isPM(wid, pid, scope.programId)` or `isLead(wid, pid, scope.workstreamId) && wsInProgram(…, scope.workstreamId, scope.programId)`;
    - (b) `type == 'mitigation_done'`, and `scope.programId in programMeta`, and `approverUid` is the PM, the Deputy or in `ownerUids`.
- **update — withdraw:**
  - `o.status == 'Pending'`, `o.requestedByUid == me`, `n.status == 'Withdrawn'`;
  - `n.decidedByUid == me`, `n.decidedAt == request.time`;
  - keys ⊆ `['status','decidedByUid','decidedAt','version','updatedBy','updatedAt']`.
- **update — decide:**
  - `o.status == 'Pending'`, `n.status in ['Approved','Rejected']`, `me != o.requestedByUid`;
  - the decider:
    - plan_import / scope_deadline: `isWsOwner`;
    - mitigation_done: `isWsOwner || me == o.approverUid || isPM(…, o.scope.programId)`;
  - `n.decidedByUid == me`, `n.decidedAt == request.time`;
  - Rejected ⇒ `n.reason is string && n.reason.size() > 0`;
  - keys ⊆ `['status','decidedByUid','decidedAt','reason','version','updatedBy','updatedAt']`.
- **update — reassign:**
  - `o.status == n.status == 'Pending'`;
  - keys ⊆ `['approverUid','reassignLog','version','updatedBy','updatedAt']`;
  - the caller is `isWsOwner || isPM(…, o.scope.programId)`;
  - `n.approverUid != o.requestedByUid`;
  - the new approver is valid for the type (the same test as on create);
  - `reassignLog` is append-only +1, with `[0].byUid == me`.
- **Always on update:** `versionBumped`, `stampedByMe`, `pathFieldsOk`.
- **delete:** `false`.
- **`get()` count:** ≤ 5 (workspace, members, project, ws ×2). Write it in the header comment.

- [ ] **Step 1: Write failing tests:**
  - `P3-30 LEAD creates plan_import for w1 approver OWNER: allowed; for wx: denied; approver PM: denied`.
  - `P3-31 PM creates scope_deadline for prg1: allowed; ASG creates plan_import: denied`.
  - `P3-32 ASG creates mitigation_done approver PM: allowed`.
    - OUTSIDER creating one: denied.
    - Creating with status Approved: denied.
    - `createdAt` set to a client date: denied.
  - `P3-33 OWNER approves plan_import: allowed; PM approves plan_import: denied`.
  - `P3-34 PM approves ASG's mitigation_done: allowed`.
    - ASG approving their own request: denied.
    - LEAD approving: denied.
    - LEAD approving after being reassigned as approver: allowed.
  - `P3-35 reject without reason: denied; with reason: allowed`.
  - `P3-36 requester withdraws Pending: allowed; withdraws Approved: denied; non-requester withdraws: denied`.
  - `P3-37 PM reassigns mitigation_done to LEAD with reassignLog+1: allowed; reassign plan_import to PM: denied; reassign to requester: denied`.
  - `P3-38 OWNER deletes a request: denied; requester edits payload after create: denied`.
- [ ] **Step 2:** Push and confirm CI fails on these tests.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Push and confirm CI is green.
- [ ] **Step 5:** Commit: `feat(rules): P3 — approvals requests (plan_import, scope_deadline, mitigation_done)`.

### Task 5: Read path attaches roles and approvals

**Files:**
- Modify: `src/readV2.js`. Add `rolesFromLoaded` (pure).
- Modify: `src/storage-shim.ts`, `getV2Project`:
  - one more `getDocs` on `approvals`, kept separate from `V2_SUBCOLS` so the planner's `loaded.docs` is unchanged; its failure gives `approvals: null`;
  - map each approval doc to a plain object with `createdAt` / `decidedAt` as ISO strings (`ts?.toDate?.().toISOString() ?? null`) and `version`;
  - `__v2: { orphans, roles, approvals }`;
  - export `ownerUidsNow(): Promise<string[]>`, reading the workspace doc through the existing `wsMetaCache`.
- Test: `tests/unit/readV2.test.js`.

**Interfaces:**
- Produces:
  - `export function rolesFromLoaded(loaded, ownerUids: string[]): V2Roles`, where
    `V2Roles = { ownerUids: string[], programs: Record<programId, { pmUid, deputyUid, start, end }>, workstreams: Record<wsId, { programId, leadUid, start, end }>, tasks: Record<taskId, { programId, workstreamId, picUid, contributorUids }> }`.
    Missing values are `null`; `contributorUids` defaults to `[]`.
  - Tree contract: a v2 tree has `__v2.roles: V2Roles` and `__v2.approvals: Approval[] | null`. A v1 tree has no `__v2`. Program keys equal tree program ids (P2.4 makes ids unique).

- [ ] **Step 1: Write failing tests:**
  - `rolesFromLoaded maps programMeta pm/deputy/start/end, ws leadUid/programId/start/end, task picUid/contributorUids`;
  - `rolesFromLoaded with missing fields yields null / []`;
  - `planV2Save ignores __v2.roles and __v2.approvals (no ops, no metaPatch)`: add this to `tests/unit/planV2Save.test.js`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/readV2.test.js tests/unit/planV2Save.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement, then run `npm run build` (typecheck).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(p2): v2 read path attaches roles and approvals to the tree`.

### Task 6: Pure close flow

**Files:**
- Create: `src/closeFlow.js`
- Test: `tests/unit/closeFlow.test.js`

**Interfaces:**
- Consumes: `V2Roles` (Task 5) and `statusOf` (Task 1).
- Produces (all pure; `me = { uid, name }`; `now` = an ISO string):
  - `managerLevel(roles, taskId, uid): 'owner' | 'pm' | 'lead' | null`.
  - `directApprover(roles, taskId, requesterUid): string | null`:
    - `null` when the requester is an Owner;
    - otherwise the WS lead if set and ≠ requester and the requester is not PM/Deputy;
    - else the PM, else the Deputy (each ≠ requester, and the requester not PM/Deputy);
    - else `ownerUids[0]`.
  - `eligibleApprovers(roles, taskId, requesterUid): string[]`: order `[lead, pm, deputy, ...ownerUids]`, unique, mirroring the rules' `eligibleApprover`.
  - `canCloseDirectly(roles, taskId, uid): boolean`: an Owner, or (a lead/PM/Deputy of the task) with `picUid !== uid`.
  - `canDecideClose(roles, task, uid): boolean`: mirrors the rules' `canDecide`.
  - `applyCloseIntent({ roles, oldTask, nextTask, me, now, reason? }): { task, outcome }`. `outcome` ∈ `'legacy' | 'unchanged' | 'prepared' | 'submit' | 'direct' | 'approve' | 'reject' | 'withdraw' | 'reopen' | 'needs-reason' | 'denied'`.
    - `'legacy'` when `roles` is null.
    - `'prepared'` when `nextTask` already carries the transition, so a second pass is a no-op. That is the case when:
      - its status is `Submitted` with a `closeRequest`;
      - or `closeRequestHistory` grew;
      - or it is closed with `approvedByUid === me.uid`, which `oldTask` lacked.
    - `'denied'` returns `oldTask` unchanged.
    - **Approve:** sets `approvedByUid` / `approvedAt` / `closedByUid = requestedByUid`, clears `closeRequest`, and prepends a history entry `{ id, outcome, requestedByUid, approverUid, status, decidedByUid, decidedBy, decidedAt, reason, before: { status }, after: { status } }`.
    - **Reject:** also prepends the update `{ id, timestamp: now, author: me.name, text: 'Close request rejected: ' + reason, isBlocker: false }`.
  - `reassignClose({ roles, task, me, toUid, now }): task | null`: `null` unless `toUid` is in `eligibleApprovers` and `me` is the Owner or the PM/Deputy.
  - `closeEventsFor(oldTask, newTask, nameOf: (uid) => string): Array<{ type, description, before, after }>`. Types per P3-19; descriptions in English, e.g. `Submitted "{task}" as done — approver {name}`.
  - `deadlineApprover(roles, taskId, newDate, requesterUid): string | null` (P3-10). The WS window comes from `roles.workstreams[ws].start/end`; a null bound means no limit.
  - `canApproveDeadline(roles, task, uid): boolean`: `uid !== task.deadlineRequest.requestedByUid`, and the uid is eligible for the window case.
  - `canActivateRaid(roles, programId, uid): boolean` (P3-11).
  - `canWriteRaid(roles, uid): boolean`: an Owner, or any PM/Deputy/lead in the project (Q1).

- [ ] **Step 1: Write failing tests.** Fixture roles: lead L, PM P, Deputy D, Owner O, Assignee A.
  - `directApprover`:
    - A → L;
    - A with no lead → P;
    - A with no lead and no PM → D, else O;
    - L → P;
    - P → O and D → O;
    - O → null.
  - `eligibleApprovers(roles, t, L)` deep-equals `[P, D, O]`.
  - `canCloseDirectly`:
    - L on A's task → true;
    - L on L's own task → false;
    - A → false;
    - O on O's own task → true.
  - `applyCloseIntent`:
    - A sets Completed on an InProgress task → outcome `'submit'`, `task.status === 'Submitted'`, `task.closeRequest` matches `{ outcome: 'Completed', requestedByUid: A, approverUid: L, prevStatus: 'InProgress' }`.
    - L approves (next status Completed) → `'approve'`, `approvedByUid === L`, `closeRequest === null`, `closeRequestHistory[0].status === 'Approved'`.
    - L sets Dropped on a Completed-outcome request → `'denied'`, and the task is unchanged.
    - L sets InProgress on a Submitted task without a reason → `'needs-reason'`. With reason `'x'` → `'reject'`; `updates[0].text === 'Close request rejected: x'`; `closeRequestHistory[0].reason === 'x'`.
    - A sets InProgress on their own Submitted task → `'withdraw'`, and the status equals `prevStatus`.
    - L closes A's task directly → `'direct'`, `approvedByUid === L`.
    - A reopens a Completed task → `'denied'`.
    - Feeding a `'submit'` result back as `nextTask` → `'prepared'`, with the task deep-equal to the input.
    - `roles` null → `'legacy'`, and the task is `nextTask` unchanged.
  - `reassignClose` by P to D → `closeRequest.approverUid === D` and `closeRequestHistory[0].status === 'Reassigned'`. By A → `null`.
  - `closeEventsFor` on a submit → `[{ type: 'close_submitted', before: { status: 'InProgress' }, after: { status: 'Submitted' } }]` (description checked with `toContain('approver')`).
  - `deadlineApprover`:
    - with WS end `2026-12-31` and newDate `2026-11-30` → L;
    - with newDate `2027-01-15` → O.
- [ ] **Step 2:** Run `npx vitest run tests/unit/closeFlow.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(p3): pure close flow — approver routing, intents, events`.

### Task 7: App wiring — choke point, close control, View as read-only

**Files:**
- Create: `src/components/meContext.js`:
  - `export const MeContext = React.createContext({ uid: null, name: null, isOwner: false, readOnly: false, nameOf: (uid) => uid })`.
- Create: `src/components/CloseControl.jsx`:
  - signature `CloseControl({ task, roles, onUpdate })`; reads `MeContext`.
- Modify `src/App.jsx`:
  1. **Provide context:** wrap the App tree in `MeContext.Provider` with:
     - `uid: authUser.uid`;
     - `name: author`;
     - `isOwner`;
     - `readOnly: !!impersonatingAs`;
     - `nameOf` built from `dirEntries` by uid.
  2. **Choke point in `applyTaskUpdate`:**
     - before `Object.assign`, run `applyCloseIntent({ roles: targetProj.__v2?.roles || null, oldTask, nextTask: updatedTask, me, now })`;
     - on `'denied'`: toast `You can't change this task's status — ask your Sub-PM or PM.` and return;
     - on `'needs-reason'`: toast `Use Reject to give a reason.` and return;
     - on `'submit'`: toast `Submitted for approval — {approver name} will review.`;
     - use the returned `task`;
     - log `closeEventsFor(...)` entries through `logActivityForProject`, which now passes `before` / `after` through into the entry.
  3. **TaskDetail status block:** replace the `STATUSES.map` block with `project.__v2 ? <CloseControl task={task} roles={project.__v2.roles} onUpdate={onUpdate} /> : <existing buttons/>`.
  4. **View as read-only (P3-16):**
     - `updateProject`, `logActivity` and `logActivityForProject` return early with the toast `View as is read-only` when `impersonatingAs` is set;
     - remove the `actingAs` strings passed from My Work;
     - My Work's `onTaskUpdate` / `onActionUpdate` / `onDecisionUpdate` are `null` while impersonating.
  5. **`DeadlineRequestDialog`:** the request it builds also carries `requestedByUid: authUser.uid` (pass a `uid` prop).
  6. **SaveBanner `denied` copy:** `(closing a task needs your Sub-PM or PM)` → `(use Submit as done to close a task)`.

**CloseControl behaviour:**
- **Open status:**
  - always the buttons `Planned` and `In Progress`;
  - `Completed` and `Dropped` when `canCloseDirectly`, otherwise `Submit as done` and `Submit as dropped`.
- **`Submitted`:** the pill `Pending approval · {approver name} · since {date}`, then:
  - `Withdraw` for the requester;
  - `Approve` and `Reject` when `canDecideClose`. Reject opens the existing `dialogs.prompt` with `allowEmpty: false` and passes `reason` into `applyCloseIntent`;
  - `Reassign` (a select of `eligibleApprovers`) for the Owner or PM/Deputy.
- **Closed status:** `Reopen` for managers.
- **readOnly:** no buttons, only the pill.

- [ ] **Step 1: Write the failing test.** In `tests/unit/closeFlow.test.js`, add `applyCloseIntent result passed through applyCloseIntent again is 'prepared'` for each of submit / approve / reject / withdraw / reassign. This is the contract that CloseControl → `onUpdate` → choke point relies on.
- [ ] **Step 2:** Run it. Expected: FAIL for any case Task 6 did not cover; fix in `closeFlow.js`.
- [ ] **Step 3:** Implement the wiring.
- [ ] **Step 4:** Run `npm test`, `npm run lint` and `npm run build`.
- [ ] **Step 5:** Manual check against the dev server (`npm run dev`), using a v2 pilot copy in the Emulator or the Treasury pilot copy:
  - as an Assignee, My Work "Mark done" shows `Pending approval`;
  - as the Sub-PM, the panel shows Approve / Reject;
  - View as shows no buttons, and a write attempt toasts.
- [ ] **Step 6:** Commit: `feat(p3): Submit as done / approve / reject in the task panel; View as is read-only`.

### Task 8: Blocker resolutions — fold on read, unfold on save

**Files:**
- Create: `src/blockerResolutions.js`
- Modify: `src/migrateV2.js`, `assembleProject`:
  - each task goes through `foldResolutions` after `unwrap`;
  - add `'blockerResolutions'` to `TASK_V2`, so it is never part of the v1 tree.
- Modify: `src/planV2Save.js`, the task diff: `data = unfoldResolutions(old, data, uid)` after `overlay` and before `carryDoc`.
- Test: `tests/unit/blockerResolutions.test.js`, `tests/unit/planV2Save.test.js`, `tests/unit/migrateV2.test.js`.

**Interfaces:**
- `export function foldResolutions(taskData): taskData`:
  - for each `updates` entry with `id` in `blockerResolutions` that lacks `resolvedAt`, merge `{ resolvedAt, resolvedBy, resolution }`;
  - `blockerResolutions` is dropped from the output.
- `export function unfoldResolutions(storedRaw, nextFolded, uid): data`:
  - for each next entry whose stored raw entry (same `id`) lacks `resolvedAt`:
    - if its resolution fields equal the stored map value, restore the raw entry;
    - if they are new, move them to `blockerResolutions[id]` with `authorUid: uid` and restore the raw entry;
  - in-place legacy resolutions and id-less entries stay as they are;
  - `blockerResolutions` is emitted only when it is non-empty or was stored.

- [ ] **Step 1: Write failing tests:**
  - `fold merges map into the matching update and drops the key`;
  - `unfold of an unchanged folded task deep-equals the stored raw task`;
  - `unfold of a newly resolved blocker adds one map key with authorUid and leaves updates raw`;
  - `planV2Save: Assignee resolving a blocker → one update op whose data.updates equals stored updates and data.blockerResolutions has one key`;
  - `migrateV2 round trip of all fixtures unchanged`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/blockerResolutions.test.js tests/unit/planV2Save.test.js tests/unit/migrateV2.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(p3): blocker resolutions as append-only map (fold/unfold), App unchanged`.

### Task 9: Emulator integration of the close flow

**Files:**
- Test: `tests/rules/v2-p3-exec.test.js` (new). Use the setup of `tests/rules/v2-save-exec.test.js`:
  - trees come from `assembleProject` over seeded docs;
  - transitions are built with `applyCloseIntent`;
  - saves go through `planV2Save` → `executeV2Save` with the rules-unit-testing client.

- [ ] **Step 1: Write the tests:**
  - `P3I-1 ASG submit → ok; stored status 'Submitted', closeRequest.approverUid == LEAD`.
  - `P3I-2 LEAD approve → ok; stored status 'Completed', approvedByUid LEAD, closeRequestHistory[0].status 'Approved'`.
  - `P3I-3` LEAD approves and PM rejects, both planned from the same loaded snapshot. The first gets `ok`, the second gets `status === 'conflict'`, and the stored status stays `'Completed'`.
  - `P3I-4 ASG resolves a blocker → ok; reassembled tree shows resolvedAt on that update`.
  - `P3I-5 ASG direct Completed (roles null → legacy intent) → status 'denied', nothing written`.
- [ ] **Step 2:** Push and confirm CI is green. If not, the fault sits in Tasks 2–8: fix it there, with a test.
- [ ] **Step 3:** Commit: `test(p3): emulator integration of submit/approve/reject/conflict`.

---

## PR P3.2 — Approvals inbox

### Task 10: Pure inbox derivation and working days

**Files:**
- Create: `src/approvalsInbox.js`
- Test: `tests/unit/approvalsInbox.test.js`

**Interfaces:**
- Consumes: `closeFlow.js` (`canDecideClose`, `deadlineApprover`, `canApproveDeadline`, `canActivateRaid`, `directApprover`).
- Produces:
  - `workingDaysBetween(startIso: string, now: Date): number`: the Mon–Fri days after the start date, up to and including `now`'s date (P3-5).
  - `isEscalated(startIso, now): boolean` = `workingDaysBetween(...) > 3`.
  - `nextLevelUids(roles, item): string[]`:
    - when the approver is a lead → `[pm, deputy]`, falling back to the owners if both are empty;
    - when the approver is a PM or Deputy → the owners;
    - when the approver is an Owner → `[]`.
  - `buildApprovalsInbox({ projects, me: { uid }, now: Date }): { mine, escalated, sent, all, badge }`.
    - Each item is `{ key, kind, projectId, projectName, programId, workstreamId, taskId, title, requestedByUid, requestedBy, approverUid, submittedAt, workingDays, escalated, canDecide, canReassign, source }`.
    - `kind` ∈ `task_close | task_deadline | raid_activate | plan_import | scope_deadline | mitigation_done`.
    - **Sources (v2 trees only, P3-15):**
      - `Submitted` tasks;
      - tasks with `deadlineRequest`;
      - RAID items in `PendingApproval` (approver: the program PM, else the Owner);
      - `__v2.approvals` entries with status `Pending`.
    - **`mine`:** `approverUid === me.uid`, or the approver is an Owner and `me` is an Owner.
    - **`escalated`:** not in `mine`, `escalated` is true, and `me` is in `nextLevelUids`.
    - **`sent`:** pending items with `requestedByUid === me.uid`, plus decisions from the last 30 days (`closeRequestHistory` entries and decided approvals docs).
    - **`all`:** every pending item when `me` is an Owner, otherwise `[]`.
    - **`badge`:** `mine.length + escalated.length`.

- [ ] **Step 1: Write failing tests:**
  - `workingDaysBetween('2026-10-23', new Date(2026,9,28)) === 3` (Fri → Wed);
  - `isEscalated('2026-10-23', new Date(2026,9,28)) === false` and `isEscalated('2026-10-23', new Date(2026,9,29)) === true`;
  - `workingDaysBetween('2026-10-24', new Date(2026,9,25)) === 0` (a weekend submission);
  - `inbox: Submitted task addressed to L is in L.mine, not in P.mine; after 4 working days it is in P.escalated; O.all contains it; A.sent contains it`;
  - `inbox: deadline request within WS window → mine of L; outside → mine of O`;
  - `inbox: v1 project (no __v2) contributes no task_close items`;
  - `inbox: approvals doc mitigation_done Pending → mine of approverUid; Withdrawn → not listed`;
  - `badge equals mine + escalated`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/approvalsInbox.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(p3): pure approvals inbox with 3-working-day escalation`.

### Task 11: Approvals store (Firestore) and shim API

**Files:**
- Create: `src/approvalsStore.js`. Firestore functions are injected: `fs = { runTransaction, doc, serverTimestamp }`.
- Modify: `src/storage-shim.ts`. Export `approvalsApi`, bound to `db`, `WORKSPACE` and the current user. After a successful `applyScopeDeadline`, refresh the `v2Loaded` cache through `applyWritten`.
- Test: `tests/rules/v2-p3-approvals-store.test.js` (emulator, CI).

**Interfaces:**
- `createApproval(fs, { db, wid, pid, uid, req }) → Promise<{ status: 'ok'|'denied'|'error', doc }>`:
  - `req = { id, type, scope, title, payload, approverUid, requestedBy }`;
  - writes the full shape from Task 4 with `status 'Pending'`, `createdAt: serverTimestamp()`, `version: 1`, `updatedBy: uid`, `reassignLog: []`;
  - a doc that already exists → `'error'`.
- `decideApproval(fs, { db, wid, pid, uid, id, expectVersion, status, reason }) → Promise<{ status: 'ok'|'conflict'|'denied'|'error', doc }>`:
  - `status` ∈ `'Approved' | 'Rejected' | 'Withdrawn'`;
  - a version mismatch, or a stored status other than `Pending` → `'conflict'`.
- `reassignApproval(fs, { db, wid, pid, uid, id, expectVersion, toUid, now }) → same result shape`. It prepends `{ at: now, byUid: uid, from, to: toUid }` to `reassignLog`.
- `applyScopeDeadline(fs, { db, wid, pid, uid, id, expectVersion }) → Promise<{ status, written }>`. One transaction:
  - read the request, which must be `Pending` with `payload = { target: 'workstream'|'program', targetId, from, to, reason }`;
  - **workstream:** read the ws doc; `end !== from` → `'conflict'`; otherwise set `{ ...data, end: to, version + 1, updatedBy, updatedAt }`;
  - **program:** read the project doc; `programMeta[targetId].end !== from` → `'conflict'`; otherwise `update({ ['programMeta.' + targetId + '.end']: to, updatedAt })`;
  - then set the request to `Approved`, with `decidedByUid` and `decidedAt`.
  - `written` uses the `executeV2Save` shape, for the cache.
- Shim: `export const approvalsApi = { create(pid, req), decide(pid, id, expectVersion, status, reason), reassign(pid, id, expectVersion, toUid), applyScopeDeadline(pid, id, expectVersion) }`. Every call returns `{ status, doc? }` and maps Firestore Timestamps to ISO strings.

- [ ] **Step 1: Write failing tests:**
  - `S-1 LEAD creates plan_import → ok, stored status 'Pending', version 1`;
  - `S-2 OWNER decides Approved with expectVersion 1 → ok; second decide with expectVersion 1 → conflict`;
  - `S-3 PM decides plan_import → denied`;
  - `S-4 applyScopeDeadline workstream from '2026-12-31' to '2027-01-31' → ws end '2027-01-31', ws version +1, request 'Approved'`;
  - `S-5 applyScopeDeadline when ws end changed meanwhile → conflict, nothing written`.
- [ ] **Step 2:** Push and confirm CI fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Push and confirm CI is green. Run `npm run build` locally.
- [ ] **Step 5:** Commit: `feat(p3): approvals store and scope-deadline apply (transactional)`.

### Task 12: Approvals tab

**Files:**
- Create: `src/components/ApprovalsView.jsx`, `ApprovalsView({ projects, now, onOpenTask, onTaskUpdate, onDeadlineDecision, onRaidActivate, onRequestDecision, approvalsApi })`. It reads `MeContext`.
- Modify: `src/App.jsx`:
  - `allTabs`: add `{ id: 'approvals', label: 'Approvals' }` right after `my-work`, with a badge of `buildApprovalsInbox(...).badge`;
  - under View as, the visible tabs are My Work + Approvals, read-only;
  - render the view;
  - the handlers reuse `applyTaskUpdate` (built with `closeFlow` helpers) and the existing deadline approve/reject code;
  - P3-17 swaps `isOwner` for `canApproveDeadline` in TaskDetail's deadline banner and in My Work's approve buttons, and for `canActivateRaid` in the RAID approval banner.
- Test: `tests/unit/approvalsInbox.test.js`. Add `inbox item canDecide/canReassign flags match closeFlow helpers for L, P, A` (the UI shows buttons from these flags only).

**View contract:**
- **Sections:**
  - `Pending approval` (`mine`);
  - `Escalated` (with the pill `Waiting {n} working days`);
  - `Sent`;
  - `All pending` (Owner only, collapsed by default).
- **Row:** kind label, project › program › WS, title, requester, approver, age in working days.
- **Actions, from the flags:**
  - `Approve`;
  - `Reject` (the reason is required; for `task_deadline` it is optional, as in today's v27 flow);
  - `Withdraw` (in `Sent`);
  - `Reassign`;
  - `Open`.
  - `plan_import` rows show `Review` instead of `Approve` (Task 15).
- **After every decision:** log the P3-19 event, then refresh `__v2.approvals` locally with `setProjects`. Do not call `updateProject`; the planner ignores `__v2`.

- [ ] **Step 1:** Write the failing flag test.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the component and the wiring.
- [ ] **Step 4:** Run `npm test`, `npm run lint` and `npm run build`. Manual check on a v2 pilot copy:
  - the Sub-PM sees the badge;
  - Approve clears it;
  - the Assignee sees the decision under Sent.
- [ ] **Step 5:** Commit: `feat(p3): Approvals tab — pending, escalated, sent, all`.

### Task 13: `mitigation_done` and `scope_deadline` requests

**Files:**
- Create: `src/components/ScopeDeadlineRequestModal.jsx`, `ScopeDeadlineRequestModal({ project, roles, onSubmit, onClose })`.
  - It lists the scopes the user may request for: PM → their programs and the WS in them; lead → their WS.
  - It shows the current `end` from `roles`.
  - The new date and a reason (≥ 5 characters) are required.
  - `onSubmit(req)` receives the `createApproval` `req` with `type 'scope_deadline'` and `approverUid = roles.ownerUids[0]`.
- Modify: `src/components/ApprovalsView.jsx`:
  - a header button `Request deadline change`, shown when the user leads a WS or is the PM of a program in any v2 project;
  - for `scope_deadline` rows, the Owner's Approve calls `approvalsApi.applyScopeDeadline`;
  - on `'ok'`, patch `__v2.roles` locally.
- Modify: `src/App.jsx`, `MitigationRowInline`'s status change (`writePatch({ status })`), on v2 when `!canWriteRaid(roles, me.uid)`:
  - **status `Done`:** call `approvalsApi.create` with
    - `type: 'mitigation_done'`;
    - `scope: { programId }`;
    - `payload: { itemId, mitigationId, from, to: 'Done' }`;
    - `approverUid`: the PM, else the Deputy, else `ownerUids[0]`;
    - `title: 'Mark mitigation done: {name}'`.

    Then toast `Sent to {name} for approval`.
  - **any other status:** toast `Only the PM or Sub-PM can change this mitigation.`
- Also in `src/App.jsx`: add `commitProjectNow(updated): Promise<string>`, which runs `setProjects`, cancels the debounce timer for that pid, `await saveProject(updated)` and updates `saveState`.
  - The `mitigation_done` Approve uses it to apply the patch to the tree, which the planner writes with the manager's RAID claim.
  - Only on `'ok'` does it call `approvalsApi.decide(…, 'Approved')`.
- Test: `tests/unit/closeFlow.test.js`. Add `canWriteRaid: Owner/PM/Deputy/lead true, Assignee false`.

- [ ] **Step 1:** Write the failing test.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`, `npm run lint` and `npm run build`. Manual check:
  - the PIC's Done becomes a request;
  - the PM's Approve marks it Done and clears the request;
  - the WS deadline request is applied by the Owner.
- [ ] **Step 5:** Commit: `feat(p3): mitigation-done and scope-deadline requests (closes Ruling AG)`.

---

## PR P3.3 — Scoped plan upload

### Task 14: Pure scoped import

**Files:**
- Create: `src/scopedImport.js`
- Modify: `src/App.jsx`, `projectToExcelBlob`:
  - add a last column `'Task ID': t.id`;
  - hide it with `ws['!cols']`, setting that column index to `{ hidden: true }`.
- Test: `tests/unit/scopedImport.test.js`

**Interfaces:**
- `export const TASK_ID_COL = ['Task ID', 'task id', 'TaskId']`.
- `export function rowToPlanRow(raw, rowNo): PlanRow`, with `PlanRow = { rowNo, taskId, program, workstream, task, status, pic, start, end, duration, deliverables, dependencies }`.
  - It uses the same column aliases as App's `COL`, copied here with a comment pointing to App.jsx `COL`.
  - Status mapping: `pending…` → `'Submitted'`, otherwise App's `normStatus` rules.
  - Dates: `Date` → local `yyyy-mm-dd`; an Excel serial → a date; a `yyyy-mm-dd` string as is; blank → `null`.
- `export function scopesFor(roles, uid): Array<{ kind: 'project'|'program'|'workstream', programId?, workstreamId?, label }>`:
  - Owner: the project, every program and every WS;
  - PM/Deputy: their programs and the WS in them;
  - lead: their WS.
- `export function diffScopedPlan(project, rows, scope, { resolvePic, isOwner }): PlanDiff`, with
  `PlanDiff = { scope, adds: [{ rowNo, programId, workstreamId, task }], edits: [{ rowNo, taskId, changes: Record<field, { from, to }> }], drops: [{ taskId, name, from }], rejected: [{ rowNo, reason }], blocked: null | 'unknown-pic' | 'too-large' }`.
  - **Matching:** by `taskId` inside the scope, else by folded name inside the same WS (WS matched by program + WS name inside the scope).
  - **Fields:** `name, status, pic, start, end, duration, deliverables, dependencies`. `''` equals `null`.
  - **Rejection reasons:** `'out-of-scope' | 'unknown-workstream' | 'missing-task-name' | 'duplicate-row' | 'close-needs-approval' | 'pending-approval'`.
  - `resolvePic(value) → { known, name }`. An unknown, non-blank PIC adds a rejected row with `'unknown-pic'` and sets `blocked = 'unknown-pic'`.
  - **Drops:** in-scope tasks not matched, whose status is not `Completed` / `Dropped` / `Submitted`.
  - `too-large`: adds + edits + drops > 450 (P3-14).
- `export function applyScopedPlan(project, diff, { includeDrops, approverUid, requestedBy, now, newId }): project` (pure):
  - **adds:** `{ id: newId('t'), status 'Planned' unless given, health 'green', updates: [], checkIns: [], references: [], contributors: [], creditSharesMode: 'auto' }`;
  - **edits:** set the field values; an `end` change prepends nothing and appends `deadlineHistory` `{ id, from, to, changedBy: requestedBy, changedAt: now, reason: 'Plan upload', approvedBy: approverUid }`;
  - **drops:** applied only when `includeDrops`, as `status 'Dropped'`, `approvedByUid: approverUid`, `approvedAt: now`, `closedByUid: approverUid`.
- `export function stalePlanRows(project, diff): Array<{ taskId, field, expected, actual }>`.
- `export function payloadTooLarge(diff): boolean`: `JSON.stringify(diff).length > 800000`.

- [ ] **Step 1: Write failing tests**, with a fixture project of 1 program and 2 WS (w1 led by L, w2):
  - `rowToPlanRow maps 'Pending approval' to Submitted and Excel serial 46317 to '2026-10-22'`;
  - `scopesFor(L) === [{ kind: 'workstream', workstreamId: 'w1', … }]`;
  - `diff in w1 scope: row with w2 task id → rejected out-of-scope`;
  - `diff: matched by id, end changed → edits[0].changes.end deep-equals { from: '2026-11-01', to: '2026-11-15' }`;
  - `diff: unknown WS name → rejected unknown-workstream; nothing added`;
  - `diff: non-owner status Completed → rejected close-needs-approval, other fields still edited`;
  - `diff: unknown PIC → blocked 'unknown-pic'`;
  - `apply with includeDrops false: tasks missing from file keep their status`;
  - `apply with includeDrops true: dropped task has status 'Dropped' and approvedByUid O`;
  - `apply: added task has a fresh id and status 'Planned'`;
  - `stalePlanRows lists a field whose current value differs from 'from'`;
  - `diff with 451 adds → blocked 'too-large'`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/scopedImport.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`, `npm run lint` and `npm run build`.
- [ ] **Step 5:** Commit: `feat(p3): pure scoped plan import — diff, apply, stale check; export carries Task ID`.

### Task 15: Upload plan UI, Owner apply and approval review

**Files:**
- Create: `src/components/ScopedImportModal.jsx`:
  - `ScopedImportModal({ project, roles, resolvePic, onApply, onSubmitRequest, onClose })`;
  - also export `PlanDiffPreview({ diff, includeDrops, onToggleDrops, stale })`.
- Modify: `src/components/ApprovalsView.jsx`. `plan_import` rows get a `Review` modal (`PlanDiffPreview` with `stalePlanRows`), offering `Apply` (all) and `Reject` (with reason).
- Modify: `src/App.jsx`:
  - an `Upload plan` button next to the Excel export button, shown when `project.__v2` and `scopesFor(...)` is non-empty;
  - `onApply(newProject) = commitProjectNow(newProject)`;
  - `onSubmitRequest(req) = approvalsApi.create(project.id, req)`;
  - on success, log `approval_created`, or `plan_import_applied` for an Owner direct apply.

**Modal flow:**
1. Pick the scope: a select from `scopesFor`.
2. Pick the `.xlsx` file. Read it with `XLSX.read(..., { cellDates: true })` and `sheet_to_json(..., { defval: null })`, then map each row through `rowToPlanRow`.
3. Show the preview:
   - the counts `+{adds} · ~{edits} · ⏰{deadline changes} · ✕{drops} · ⚠{rejected}`;
   - a table of changes;
   - the rejected rows with their reasons;
   - the checkbox `Also drop {n} tasks missing from the file` (default off);
   - a blocked banner when `blocked` is set, or when `payloadTooLarge` is true: `Split the upload by workstream`.
4. Act:
   - **Owner:** `Apply` → `applyScopedPlan(..., { approverUid: me.uid })` → `onApply`.
   - **Others:** `Submit for approval` → `req = { type: 'plan_import', scope, title: 'Plan upload: {scope label} ({n} changes)', payload: { diff, includeDrops }, approverUid: roles.ownerUids[0], requestedBy: me.name }`.

**Owner review of a request:**
- `Apply` runs `applyScopedPlan` on the current tree with the stored `includeDrops` → `commitProjectNow`.
- Only on `'ok'` does it call `approvalsApi.decide(…, 'Approved')`.
- On any other status, toast `Plan not applied — the request stays pending.`

- [ ] **Step 1: Write the failing test.** In `tests/unit/scopedImport.test.js`, add `applyScopedPlan is idempotent: applying the same diff twice equals applying once (adds keyed by rowNo via injected newId)`. This guards a retry after a failed `decide`.
- [ ] **Step 2:** Run it. Expected: FAIL. Fix by keying the adds and skipping existing ids.
- [ ] **Step 3:** Implement the UI and the wiring.
- [ ] **Step 4:** Run `npm test`, `npm run lint` and `npm run build`. Manual check on the pilot copy:
  - the Sub-PM exports, edits two rows and uploads with the w1 scope; the request is visible to the Owner;
  - the Owner reviews and applies; the changes land and the request shows `Approved` under the Sub-PM's Sent.
- [ ] **Step 5:** Commit: `feat(p3): Upload plan by scope; Owner applies or approves requests`.

---

### Task 16: Docs, runbooks, PRs (controller)

- [ ] **Update the docs:**
  - **`CLAUDE.md`:** Current Status; the Rollback row "P3 rules block a valid close" → republish the P2.3 rules.
  - **`docs/PROJECT_LOG.md`:** one entry per PR, plus the decisions.
  - **The roadmap:** a "P3 status" section. List Rulings P3-1…P3-20 and P3-Q3 / P3-Q6, marked PROVISIONAL. Mark the "Accepted until P3" items closed:
    - A4 → Submit;
    - W → P3-8;
    - AG → P3-9.
  - **`docs/DESIGN.md`:** the risk entry for approvals.
- [ ] **Each PR body states:**
  - its rules impact (P3.1: tasks + approvals blocks; P3.2: none beyond P3.1; P3.3: none);
  - its data impact: new optional task fields and new `approvals` docs, with no migration;
  - rollback:
    - republish the previous rules from git;
    - Vercel Promote;
    - `Submitted` tasks left behind are closed by a PM/Sub-PM (the P2.3 rules allow managers any status).
- [ ] **Runbook for P3.1:**
  1. HOD exports Backup JSON + Excel.
  2. CI is green.
  3. Publish the rules, keeping the previous version.
  4. Merge, then hard-refresh every device.
  5. On a Treasury 2026 pilot copy with real colleagues, run: Assignee submit → Sub-PM approve; one reject with a reason; one escalation (backdate `submittedAt` on the copy only).
  6. HOD confirms that Credit counts the approved task only.
- [ ] **Runbook for P3.3:** the Sub-PM uploads one WS on the pilot copy and the Owner approves it. This is the spec §11 gate: "Pilot duyệt được Done và 1 lần upload WS" (the pilot approves one Done and one WS upload).
- [ ] **Ask HOD to confirm:** P3-Q3 and P3-Q6 (provisional), P3-3 (managers close directly), P3-9 (mitigation via request), P3-12 (no drops by default; no WS dates from the file).

---

## Self-review (24/10/2026)

**1. Spec coverage:**

| Spec item | Where |
|---|---|
| §4 approve row and the direct-manager rule | Tasks 2 and 6 |
| §4 Assignee proposes Done/Dropped | Tasks 2, 6, 7 |
| §4 Owner bulk upload applied directly; PM/Sub-PM bulk upload proposed | Tasks 14, 15 |
| §4 WS/program deadline change → Owner | Tasks 4, 11, 13 |
| §4 Duyệt RAID (RAID approval) | P3-11, Task 12 |
| §5 task_close / task_deadline / scope_deadline / plan_import / raid_activate | Tasks 2/6/7, P3-10 + Task 12, Tasks 11/13, Tasks 14/15, Task 12 |
| §5 states Pending / Approved / Rejected (reason) / Withdrawn | Tasks 2, 4 |
| §5 Submitted not overdue and no credit | Task 1, P3-18 |
| §5 reject → InProgress with reason in updates | P3-6, Task 6 |
| §5 conflict | P3-13, Task 15 |
| §5 badge for "mine" and "Sent" | Tasks 10, 12 |
| §2.1 decision 12: no self-approval | Rules P3-06, P3-34 |
| §2.1 decision 12: reassign is logged | P3-10, P3-37, history / reassignLog |
| §2.1 decision 12: 3 working days → next level | Task 10 |
| §2.1 decision 12: before/after | P3-19, history entries |
| §2.1 decision 12: View as read-only | P3-16, Task 7 |
| §6.1–6.5 | Tasks 14, 15 |
| §6.6 | Deviation P3-12 |
| §11 P3 gate | Task 16 runbook |
| Roadmap "Accepted until P3": A4, W, AG | Closed |
| Roadmap "Accepted until P3": "denied edit stays in memory" | Unchanged; a choke-point submit removes the most common case |
| Roadmap "Accepted until P3": PM cross-program move, programMeta Owner-only, teamMembers, ActionForm completedAt | Stay as accepted; not in the P3 spec scope |
| Q2 | Out of scope |

**2. Step scan:** every code step names its file, its exact signature and the pinned values (450, 800 000, 3 working days, labels). Rules steps give the full contract per branch. No step says "handle edge cases".

**3. Type consistency:**
- `V2Roles` is defined in Task 5 and used in Tasks 6, 10, 13, 14.
- `applyCloseIntent` outcomes are used in Task 7 (`'denied'`, `'needs-reason'`, `'submit'`).
- The `approvalsApi` method names are the same in Tasks 11–15.
- The approvals doc shape in Task 4 equals what `createApproval` writes in Task 11.
- `closeRequestHistory[0].{status, decidedByUid, reason}` match between the rules (Task 2) and `closeFlow` (Task 6).

**4. Review Focus:** each of the 5 lines names its pinning test and the task that owns it.

**5. Proportion:** code appears only as signatures, the doc shape and test assertions. The rules contract is spelled out because a reviewer must be able to reject it independently of the code.
