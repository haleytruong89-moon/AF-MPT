# Wave 2 — hardening before moving the last v1 projects and onboarding — design

- Date: 12/11/2026
- Status: draft, waiting for HOD answers (§4) and OK on the whole
- Inputs: security/integrity review 05/11 (`docs/reviews/2026-11-05-security-integrity-review.md`: rules findings F*, write-path findings #*, client/ops findings H/M/L*), wave-1 follow-ups (`CLAUDE.md` Current Status), wave-1 spec §3 (items deferred here)
- Parent specs: `2026-10-14-roles-permissions-v2-design.md`, `2026-11-11-wave1-hardening-ux-design.md`

## 1. Why

Wave 1 is live (12/11). What is left before MA, CRP, UBO and AF Lean move to v2 and the department is onboarded:

1. **Credit can still be bent through gaps in v2 rules.** A PM / Sub-PM can change `weight` on a Completed task, create a task with a hand-picked credit split or fake approval history, and write activity lines that look like someone else did something (including fake `role_changed` lines, which our Rollback table treats as the record of role changes).
2. **Anyone with a company account can create projects and write workspace settings**, not only AF members.
3. **CRP-sized saves may be refused as a whole** for a PM (rules allow about 20 lookups per transaction; a PM save touching many work streams goes over). CRP is the biggest project and moves in wave 2.
4. **Silent wrong data**: a person added to the directory after a tab opened is saved as "no PIC"; a stale Owner tab overwrites newer project-level lists; actions / decisions / RAID can be hard-deleted.
5. **Small app gaps found in wave 1**: the app decides "Owner" by email while rules use `ownerUids`; Outline drag-and-drop is not role-aware; "My Work seen" still writes shared workspace data; a crash outside the main view blanks the whole page.

Moving the four v1 projects to v2 also closes every v1-only finding (F1, F5, F7, the v1 parts of F12 / F13, #10, #11, #14) — so this wave fixes v2 and does not touch v1-only rules. Exception: the project document rule is shared by v1 and v2 projects; R4 changes its `create` only.

## 2. Goals

1. No non-Owner can change a closed task's credit inputs (including `weight`), or create a task that skips the checks an edit would get.
2. Activity lines show who really wrote them and when; nobody but an Owner / PM can produce a `role_changed` line.
3. Only active AF members change workspace data; only an Owner creates projects.
4. A PM can save any normal edit on a CRP-sized project; a partial failure says so and retries safely.
5. No save silently writes a missing PIC or overwrites newer project-level data.
6. Actions, decisions and RAID are never hard-deleted by a non-Owner.
7. CI blocks a red merge; the page never goes blank on one component's error.

## 3. Non-goals

- No v1 rules changes (v1 projects disappear in this wave's migration step). Tightening / removing v1 rule paths = P2.5, after all projects are on v2.
- No backend / serverless (Chat webhook stays readable by members — the person who submits must be able to post; see R7).
- No Firebase plan change in this spec (§4 Q3 is a separate HOD decision).
- No separate dev Firebase project (review M2): the app never runs `npm run dev` against production for write-path testing; this stays a rule for the maintainer, not a code change.
- No Approvals page (P3.2), no scoped upload (P3.3), no Replace person (its own spec), no header / Aggregation change (HOD has not decided).
- Assignee free-form history fields (F15, display-only spoof) and string size caps beyond the fields named below (F17).
- Hiding the people directory from non-AF company accounts (F14): the app lists `members` and `invites` at start-up for everyone, including an invited person before they claim; restricting the list would lock new people out. Low sensitivity; revisit with multi-workspace.
- v1 activity forgery (F5) stays possible on MA, CRP, UBO, AF Lean until each one moves (accepted: days, not weeks).

## 4. Questions for HOD

| # | Question | Claude's recommendation |
|---|---|---|
| Q1 | RAID and Decisions: today (HOD 23/10) **any** PM / Sub-PM of the project may write **any program's** RAID and decisions, and a PM can delete any decision. Narrow to **own program**? | **Yes, own program** (Owner: all). Delete of a decision or a RAID doc: Owner only. Keeps 23/10 for creating and editing in one's own area; stops edits in other programs' risk logs |
| Q2 | Program / work-stream `weight` (feeds credit): today a PM can change their work streams' weights. Owner only? | **Yes, Owner only** for program and WS weight. Task weight: PM / Sub-PM while the task is open, Owner only once closed (R1) |
| Q3 | Firebase Blaze plan before onboarding (read quota: ~1,000 reads per page load once all 7 projects are v2; Spark = 50k/day ≈ 20 people × 3 loads; also unlocks daily export / PITR) | **Yes, before onboarding, with a budget alert** (expected cost: cents per month). Not needed for this wave's code |

Still open from wave 1 (not blocking this spec): W1-1 (Owner self-close), glossary proofreading, Aggregation tab.

## 5. Items

### Rules (R) — each with emulator tests (allowed + denied) on CI

**R1 — `weight` is a credit field.** (F4)
- Add `weight` to `creditKeys()`: on a task in Submitted / Completed / Dropped, only an Owner changes it.
- Program and work-stream `weight`: Owner only (Q2). PM keeps the other WS fields allowed today. Builder first locates where program weight is stored: if it is on the project doc, v2 already makes it Owner-only and only the WS rule changes.
- Client: weight inputs read-only where rules would refuse (same `uiCaps` approach as wave 1).

**R2 — Task create gets the same checks as update.** (F9)
A non-Owner create must have: status not closed (exists, P3-15), `creditSharesMode` absent / null / `'auto'`, no `creditShares` with other than auto values, none of `closeRequest`, `closeRequestHistory`, `approvedByUid`, `closedByUid`, `blockerResolutions`, and `updates` empty or one entry whose `authorUid` is the creator. `title` ≤ 500 chars.

**R3 — Activity events can't be forged.** (F6)
- Already enforced today: `authorUid == me`, `createdAt == request.time`. New: key allow-list (`type`/`action`, `description`, `before`, `after`, `taskId`, `programId`, `workstreamId`, `authorUid`, `createdAt` — builder confirms against what the app writes today); no `author`, `authorName`, `timestamp` on new events; `description` ≤ 2,000 chars.
- `role_changed` events: only an Owner, or a PM / Deputy of the program named in the event. The writer (`roleChangeEvent`) adds `programId` (and `workstreamId` for Sub-PM changes) to every such event; today it carries neither. Events written by Admin SDK scripts (`p2-assign`, `p2-migrate`) are not affected by rules.
- Client: name from the directory by `authorUid`, time from `createdAt`; stored `author` / `timestamp` used only for events without `authorUid` (copied from v1 by `p2-migrate`).

**R4 — Workspace and project creation.** (F8, part of F14)
- Project create: Owner only (spec §4), with the same Owner test as other Owner checks (`ownerUids`, legacy email while `ownerUids` is empty). The app hides "New project" for others.
- `workspaces/main` update: active member only; add `config` to `ownerFields()`. `saveMeta` sends the whole meta object with merge; rules judge changed keys only, so an unchanged `config` in a non-Owner write is fine. An invited person claims membership before the app writes meta (acceptance #5 checks it).
- Directory reads unchanged (see Non-goals, F14). `workspaces/main` stays readable by any domain account.

**R5 — RAID and decisions by program.** (F10, if Q1 = yes)
- `raid/{programId}` write: Owner, PM / Deputy of that program, Sub-PM of a work stream in that program. Delete: Owner only.
- Decisions: create / update only for the program they belong to (same set of people); delete Owner only; the "re-claim then delete" path is closed.
- If Q1 = no: only the delete parts apply.

**R6 — Removed or deactivated people stop writing.** (v2 part of F12)
Non-Owner v2 write branches (task, action, update, close) also require the caller can read the project (active member + project member, or `department` visibility). Builder checks the extra lookups against W1's chunk budget; if it doesn't fit, rules check active membership only and the spec is updated.

**R7 — Chat webhook out of backups.** (F13, M3)
- The webhook stays on the project doc (an Assignee who submits posts the card from their browser, so members must read it). On v2 it is already Owner-only to write.
- Backup JSON and Excel exports drop `googleChatWebhook`. Restore keeps the live value when the backup has none.
- Runbook line in CLAUDE.md: "Webhook leaked → in Google Chat, delete the webhook, create a new one, paste it in Project Settings."

**R8 — Sign-in provider pinned.** (F16)
`isSmartOSC()` also requires `request.auth.token.firebase.sign_in_provider == 'google.com'`.

### Write path (W)

**W1 — CRP-sized saves fit the rules budget.** (#9)
- The v2 executor splits a save into transactions of at most 8 work streams each (Owner saves: as today). `version` is per document, so chunks don't conflict with each other; the project-doc patch goes in the first chunk only. 8 is the starting value: if the CRP-sized emulator test is refused, the builder lowers it until the test passes and records the value.
- If a later chunk fails: earlier chunks stay saved, the app shows "Not saved — Retry" as for any failed save, and Retry re-plans against the live data (only what is still different is written). No chunk is written twice.
- Emulator test on a CRP-sized fixture (≥ 180 tasks, ≥ 20 work streams): a PM renaming one PIC across the whole program saves; a Sub-PM's save across their own work stream saves.

**W2 — Project-level fields check for newer edits.** (#6)
Inside the save transaction, each project-doc key the tab wants to write is compared with the value the tab loaded; if the live value changed meanwhile → `conflict` ("Changed in another tab — reload to see it"), nothing written. Covers `teamMembers`, `weightChangeLog`, `creditPoints` and every other top-level key in the patch.

**W3 — Unknown people are never saved as "nobody".** (#8)
- The directory cache refreshes when the People directory changes (DirectoryModal `onChanged`) and once more when a save meets a name it can't resolve.
- If a PIC / contributor name still doesn't resolve: the save is refused with "<name> isn't in the People directory — add them first", the task keeps the name in the panel.

**W4 — No hard delete of actions, decisions, RAID for non-Owners.** (#13)
- Action delete → status `Cancelled` (as `p2-restore` already does). Owner keeps hard delete behind a confirm.
- Decision / RAID item delete: shown to Owners only (rules R5).

**W5 — Activity writes count as pending saves.** (#15)
They are part of the unsaved-work guard and of the save chip; a failed activity write shows in the banner.

**W6 — Dialog flows don't overwrite newer state.** (#10, v2 relevant part)
Menu actions on Outline / Mind map that `await` a dialog build their update from the latest project state (`projectsRef.current`), not the one captured when the menu opened.

### App and ops (O)

**O1 — One definition of Owner.** (wave-1 follow-up)
The app treats someone as Owner when their uid is in `ownerUids`; the `workspaceOwner` email is used only when `ownerUids` is empty — the same rule as `firestore.rules`. Needed before a second Owner is added.

**O2 — Outline drag-and-drop follows the role.** (wave-1 follow-up)
Drag handles appear only where the person may move the item (`uiCaps`); a drop the rules would refuse is not attempted.

**O3 — "My Work seen" is per browser.** (W1-6)
`markMyWorkSeen` writes to localStorage (uid-namespaced, like the selected project), no longer to `workspaces/main`.

**O4 — Top-level error boundary.** (L4)
An `ErrorBoundary` already wraps the main view (App.jsx); add one around the whole `<App/>` in `main.tsx`: on a crash the page shows "Something went wrong. Your saved work is safe. [Reload]", plus "Some changes were not saved" if the save state had pending work.

**O5 — Legacy scripts removed.** (M4)
Delete `scripts/migrate.js`, `scripts/setup-rbac.js` and the `migrate` npm alias (superseded by the p1/p2 scripts, which preview by default).

**O6 — CI gates the merge.** (M1)
- CI also runs `npm run build` and `npm run lint` (lint fails only if the error count goes above today's 6).
- Repo is now public → HOD turns on branch protection for `main`: require the `checks` job, no direct pushes. (Settings → Branches; Claude writes the exact steps in the PR.)

### Migration step (after R + W + O are live and rules published)

Move MA, UBO, AF Lean, then CRP last, one project per day, with the existing `p2-migrate` flow (HOD exports JSON + Excel first → preview with hash → HOD approves → apply → verify → everyone hard-refreshes). Not new code; listed here for order only. CRP waits for W1's emulator test to be green.

## 6. Rules changes summary

R1–R6 and R8 change `firestore.rules`. All in one rules PR, published by HOD the day its client PR is live (client first: the client already avoids the writes the new rules deny). Previous rules version noted before publishing.

Tests to add (`tests/rules/`): weight on closed task (PM/Sub-PM denied, Owner allowed); program / WS weight by PM denied; non-Owner create with manual split / close history / foreign update author denied, clean create allowed; activity with `author` / `timestamp` / unknown key denied, `role_changed` by Sub-PM denied, by PM of that program allowed; project create by non-Owner denied; meta update by non-member denied, `config` by non-Owner denied; directory list by non-member denied, own invite read allowed; RAID / decision write in another program denied (if Q1), delete by non-Owner denied; deactivated PIC update denied; non-Google provider denied; W1 CRP fixture saves.

## 7. Acceptance (after deploy + hard refresh, rules published)

1. As a Sub-PM on Treasury 2026: weight of a Completed task is read-only; the rules refuse a forced write (emulator).
2. As a PM: program / WS weight read-only (if Q2 = yes).
3. Activity shows the real name and server time for new events; old migrated lines still show their original author.
4. A non-AF company account: can sign in, cannot create a project or change workspace settings (emulator).
5. A newly invited person signs in for the first time and lands in the workspace (self-claim works).
6. On a CRP-sized pilot copy, a PM renames a PIC across a program → saved (or, on a forced chunk failure, "Not saved — Retry" then saved).
7. HOD edits team members in two tabs → the second save says "Changed in another tab".
8. Owner adds a person; a PM tab opened earlier assigns a task to them → saved with the right uid, or refused with the "isn't in the People directory" message — never saved as no PIC.
9. A PM deletes an action → it shows Cancelled; decision / RAID delete not offered to non-Owners.
10. Backup JSON contains no `googleChatWebhook`.
11. A red CI blocks the merge button.

## 8. Calls made by Claude (HOD may override)

- v1 rules untouched; v1 holes close by migrating, not by patching (less rules work, no risk to the 4 v1 projects in the meantime).
- Chunk size 8 work streams per transaction (stays under the ~20 lookup limit with the role lookups each write needs).
- A partially saved chunked save is acceptable (each chunk is consistent on its own; Retry finishes it) — the alternative is that big PM saves never succeed.
- Action delete becomes Cancelled for everyone but the Owner.
- Backup JSON stays available to all members (only the webhook is stripped); Restore stays Owner-only.
- Workspace doc stays readable by any company account (needed before the app knows who you are; it holds no sensitive data after O3).

## 9. Rollback

| Change | Undo |
|---|---|
| Client PRs | Vercel → Promote previous deploy; `git revert -m 1 <merge>`; everyone hard-refresh |
| Rules PR | Console → Rules history → version noted before publishing. Client keeps working on old rules |
| Data | No item migrates or rewrites data. Cancelled actions can be set back to their old status by hand. The migration step uses `p2-migrate --rollback` (CLAUDE.md Rollback table) |

## 10. Phasing (small PRs, each mergeable alone, in this order)

1. **PR-A rules** — R1–R6, R8 + client mirrors (read-only weight, hidden New project / delete) + emulator tests. HOD publishes after merge.
2. **PR-B write path** — W1, W2, W3 (+ CRP-sized emulator test).
3. **PR-C safe edits** — W4, W5, W6, R7 (backup strip).
4. **PR-D app + ops** — O1–O5, O6 CI part (+ branch-protection steps for HOD).
5. Migration step (ops, no PR): MA → UBO → AF Lean → CRP.

## 11. Left to the builder

Exact copy beyond the strings above; the precise activity key list (from what the app writes today); how chunks are grouped (by work stream id order is fine); the lint-count check mechanism; unit-test layout.
