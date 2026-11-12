# Wave 1 — hardening + daily UX before onboarding — design

- Date: 11/11/2026
- Status: draft, HOD decisions of 11/11 included (§4); waiting for HOD OK on the whole
- Inputs: security/integrity review 05/11 (rules A, writes B, client/ops C) and UX review 11/11 (workflows, speed, design). Reports kept in `docs/reviews/2026-11-05-security-integrity-review.md` and `docs/reviews/2026-11-11-ux-review.md` (copied from the review runs)
- Parent specs: `2026-10-14-roles-permissions-v2-design.md` (§2 decision 12: no self-approval, 3-day escalation), `2026-11-05-role-assignment-design.md`

## 1. Why

The department is onboarded after wave 2 (MA, CRP, UBO, AF Lean to v2). Before that, three kinds of problems would hurt first-week users:

1. **Data can be lost by one click or one failed read** (hard delete of a program with its tasks on v1, in-app restore on v2 deleting newer actions, activity log overwritten on a read error, a phantom seed after a failed boot read).
2. **The approval flow has nowhere to live**: a submitted task disappears from the requester's My Work, the approver has no list, nobody is told, and nothing escalates.
3. **The app does not say what it is doing or what you may do**: no "saved" signal, edit buttons for people who can't edit, PM/Sub-PM locked out of end dates they are allowed to set, a walkthrough describing old roles.

## 2. Goals

1. No user action or transient error in the app can hard-delete tasks or wipe history.
2. Close two rules gaps that bypass the approval / identity model (PIC approving own task; forged user-directory entry).
3. Every person sees, in My Work, what waits for them to approve and what they sent; requests older than 3 working days surface to the next level.
4. Submit and Reject reach the right people in Google Chat, with a link that opens the task.
5. Users see save state, load failures, and what their role lets them do.
6. Start-up and project switching stop waiting on the activity log.

## 3. Non-goals

- No Approvals inbox page (P3.2 stays deferred; My Work sections cover it).
- No realtime sync, no polling, no Firebase plan change (separate HOD decision).
- No header redesign / removal of the Aggregation tab (HOD has not decided — §4 Q4).
- No change for v1 projects beyond the safety items (H1, H3, H6): role-aware UI and end dates apply to v2 projects.
- Wave-2 hardening items (weight lock on closed tasks, task-create checks, activity forgery, project-create limits, RAID per program, transaction size for CRP) — next spec.

## 4. Decisions (HOD, 11/11/2026)

| # | Question | Decision |
|---|---|---|
| Q1 | May PM / Sub-PM set and change a task's End date within the workstream dates? | **Yes** (matches 14/10 "single plan edits need no approval"). Rules already allow it (`taskLeadWith`, `taskDatesOk`); UI only |
| Q2 | Google Chat for approval events? | **Yes, for Submitted and Rejected** (extends the earlier "Chat only for Actions") |
| Q3 | Activity tab and the "Top: …" credit line on Outline | **Hide for non-Owners for now** |
| Q4 | Remove Aggregation tab, group header buttons | Not decided → out of scope |
| Q5 | "Waiting > 3 days goes to the next level" | **Build now** |

## 5. Items

### Hardening (H)

**H1 — No delete of a program / work stream that has tasks** (v1 and v2, Mind map + Outline).
If the node has any task (any status, Dropped included), the Delete action shows: "Move or drop its tasks first. Dropped tasks keep their history." and does nothing. Empty program / work stream: delete as today. (v2 rules already refuse a ws delete with tasks; this stops the UI from trying and poisoning later saves.)

**H2 — No in-app Restore for v2 projects.**
Restore on a v2 project shows: "This project uses the new storage. Ask the Owner to restore it with the restore script (no data is deleted that way)." v1 restore unchanged.

**H3 — Activity writes never wipe the log.**
- v2: an event is one new doc; the app appends to its in-memory list and never re-reads the log to write.
- v1: if reading the log failed (error, not "empty"), skip the write and keep the event in memory for the next append; appends for one project run one after another (same queue idea as project saves).
- The log is read only when a view that shows it opens (Dashboard, Activity), not on start-up or project switch (see U9).

**H4 — Rules: the PIC never decides their own task's close request.**
`canDecide` and the Owner-less approve branch add `resource.data.get('picUid', null) != request.auth.uid`. The client (`canDecideClose`, `eligibleApprovers`) mirrors it: the PIC is not an eligible approver, and Submit never names them. The Owner who is PIC of a task: decides as Owner? **No** — same rule for everyone; another Owner, or the PM, decides. If the PIC is the only Owner and also the PM, the request goes to the Deputy; if there is none, the app says "No one else can approve this — set a Deputy or another PM" (rare; HOD can reassign PIC).

**H5 — Rules: user-directory entries are pinned to the signed-in account.**
`workspaces/main/users/{uid}` write requires `request.resource.data.uid == uid`, `email == request.auth.token.email`, and keys only `uid, email, name, photo, lastSeen`. Client side, the member picker uses the doc id as the uid, not `data.uid`.

**H6 — A failed read at start-up never seeds.**
`workspace:meta` read errors are told apart from "doc missing". On error: no seed, no write; the app shows "Couldn't load AF-MPT — check your connection. [Retry]". The CRP seed path runs only when the doc is truly missing (first ever run) — in production that never happens again.

### UX (U)

**U1 — Approval sections in My Work** (v2 projects, where the close flow runs).
- **Needs my approval**: tasks in `Submitted` where I may decide: I am `closeRequest.approverUid`, or the request is escalated to me (U2). Each row: task, project › program › ws, requester, outcome (Done / Drop), waiting time, and the existing Approve / Reject / Reassign controls (`CloseControl`).
- **Sent for approval**: my submitted requests (requestedByUid = me) with approver name, waiting time, Withdraw.
- The My Work tab badge counts *Needs my approval* (+ existing mentions).
- Submitted tasks stay out of the normal Today / Week / Later lists (as now).

**U2 — Escalation after 3 working days** (Q5).
- Working days = Mon–Fri, no holiday calendar (call, §8). Counted from `closeRequest.requestedAt`.
- Next level: approver is the Sub-PM of the ws → the PM and Deputy of the program; approver is PM / Deputy (or anyone not an Owner) → the Owners. Approver is an Owner → no further level.
- Escalated requests appear in the next level's *Needs my approval* with the tag "Waiting N working days — escalated". The original approver still sees it and can still decide. Rules already let the PM / Deputy decide any request in their program (except one from another PM/Deputy) and the Owner any request, so **no rules change**.
- No Chat post at escalation time (there is no server to fire it); the Owner digest / My Work badge carries it.

**U3 — Google Chat on Submitted and Rejected** (Q2).
- After the close write succeeds, if the project has a webhook, post a card:
  - Submitted: "<requester> submitted <task> as Done/Dropped — waiting for <approver>" + note + "Open task" link.
  - Rejected: "<decider> rejected <task> — <reason>. Back to <requester>" + "Open task" link.
- Failure to post never blocks or undoes the close; it shows the existing "Chat notification failed" toast.
- No per-user toggle (UI toggles for notifications were removed in v2–v30).

**U4 — PM / Sub-PM edit End (and Start) date** (Q1, v2 projects).
In the task panel, the date inputs are editable when `managerLevel` is PM, Deputy or Sub-PM for the task. The value must be within the work stream's dates; otherwise the input shows "Outside the work stream dates (<start> – <end>). Use Request change." and the existing request path stays available. Assignee / Viewer: unchanged (Request change). Owner: unchanged.

**U5 — Hide Activity tab and the "Top: …" credit line for non-Owners** (Q3).
Owner sees both as today. The Dashboard keeps its own recent-activity panel (call, §8).

**U6 — Show only what my role can do** (v2 projects).
- Add / rename / delete program and work stream, and task Edit / Drop, are hidden when the rules would refuse them (same helpers as the rules: Owner; PM of the program; Sub-PM of the ws for its tasks).
- A small chip next to the project name: "Your role: Owner / PM · <program> / Sub-PM · <ws> / Assignee / Viewer" (the highest role; tooltip lists all). "View only" when nothing is editable.

**U7 — Personal state stays personal.**
The selected project and "dismiss Monday banner" are stored per browser (`localStorage`, wrapped in try/catch), no longer in the shared workspace doc. The workspace `defaultView` (Owner setting) is unchanged.

**U8 — Walkthrough and glossary.**
- Walkthrough steps rewritten for today's app: My Work, Submit as done, Needs my approval, roles (Owner / PM / Deputy / Sub-PM / Assignee), Roles…, Mind map / Outline. It starts on the first visit even when the current project is empty; clicking the backdrop no longer marks it seen ("Skip" does).
- A **Glossary** entry under the `?` button: PIC, Assignee, PM, Deputy, Sub-PM, RAID, Credit points (cp), Weight, Hard/Soft deadline, Submitted. English term + one short English line + one Vietnamese line. UI labels stay English.

**U9 — Start-up, switching and save feedback.**
- Projects load in parallel; the first screen does not wait for activity (H3).
- Save status chip in the header: "Saving…" / "Saved hh:mm" / "Not saved — Retry". Retry re-runs the queued save (already idempotent). On a browser `online` event, retry once automatically.
- A project that fails to load shows "Couldn't load <name> — Retry" instead of "(unknown)" / vanishing.

**U10 — Link to a task.**
URL `?project=<pid>&task=<tid>` opens the project and the task panel; a "Copy link" icon in the task panel header. Chat cards (U3) use it.

## 6. Rules changes

Only H4 and H5. Each with emulator tests on CI (allowed + denied cases), the previous rules version saved for rollback, published by HOD in the Console on the day the client change is live (client first, then rules — the client already avoids the denied writes).

Tests to add (`tests/rules/`):
- PIC (who is also PM / Sub-PM / approverUid) cannot approve or reject own task; PM of the program can; Owner who is PIC cannot, other Owner can.
- `users/{uid}`: own doc with matching email OK; other uid denied; own uid with someone else's email denied; extra keys denied; `uid` field mismatch denied.

## 7. Acceptance (on Treasury 2026 / AF 2026 Operation with real accounts, after deploy + hard refresh)

1. Delete on a program / work stream that has tasks is refused with the message; an empty one deletes.
2. Restore on a v2 project is refused with the message.
3. Lybk submits a task → it shows in Lybk's *Sent for approval*, in the approver's *Needs my approval* with a badge, and a Chat card with a working link arrives in the project space.
4. Approver rejects with a reason → Chat card; task back in Lybk's lists with the reason.
5. A request whose `requestedAt` is 3+ working days old shows in the PM's (or Owner's) list tagged escalated (test with a request submitted earlier, or check the date helper's unit tests).
6. The PIC who is also PM cannot approve their own task (button hidden; a forced write is denied by rules).
7. Lybk (Sub-PM) sets an End date inside the ws dates → saved; outside → message + Request change.
8. As a non-Owner: no Activity tab, no "Top:" line, no edit buttons on other programs, role chip correct.
9. Header shows Saving… → Saved; with the network off, "Not saved — Retry", and it saves when back online.
10. Two people with different selected projects no longer switch each other's project.
11. Walkthrough on first visit; Glossary opens from `?`.

## 8. Calls made by Claude (HOD may override)

- Working days ignore Vietnamese public holidays (no calendar to maintain; a request over Tết may escalate early — acceptable).
- Escalation does not hide the request from the original approver.
- Dashboard recent-activity panel stays visible to everyone (only the Activity tab is hidden).
- H4 applies to Owners too (no self-approval for anyone, per decision 12).
- Chat cards name people by display name (incoming webhooks cannot @mention by email).
- U6 on v1 projects: not done (v1 permissions are per project role; they move to v2 in wave 2).

## 9. Rollback

| Change | Undo |
|---|---|
| Client (any PR) | Vercel → Promote previous deploy; `git revert -m 1 <merge>`; everyone hard-refresh |
| Rules H4 / H5 | Console → Rules history → previous version (time noted at publish). Client keeps working on old rules |
| Data | None of these items migrate or rewrite data. Personal state (U7) falls back to defaults if localStorage is empty |

## 10. Phasing (small PRs, each mergeable alone, in this order)

1. **PR-A data safety** — H1, H2, H3, H6 (client only).
2. **PR-B rules** — H4, H5 + client mirrors + emulator tests. HOD publishes rules after merge.
3. **PR-C speed + feedback** — U9, U7.
4. **PR-D approvals** — U1, U2, U3, U10.
5. **PR-E role-aware UI** — U4, U5, U6.
6. **PR-F onboarding** — U8.

## 11. Left to the builder

Exact copy beyond the strings above, chip styling, where the Copy-link icon sits, how many rows the My Work sections show before "Show more", unit-test layout.
