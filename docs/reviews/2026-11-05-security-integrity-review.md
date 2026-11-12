# Security & integrity review — 05/11/2026

Three read-only reviews (rules, write paths, client/ops) at commit 33f344b. Line numbers refer to that commit.

---

# Review A — Firestore rules security review (AF-MPT)

Scope: `firestore.rules` (1366 lines, branch `feat/mindmap-roles`, HEAD e325762), spec
`docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md` §2–§4/§8, tests in `tests/rules/`,
plus the client code paths that decide how rule gaps are exploitable (`src/data.ts`,
`src/storage-shim.ts`, `src/components/MembersModal.tsx`, `src/chatNotify.js`, `src/App.jsx` credit code).
Read-only; nothing run against Firebase. Production role data (who holds v1 `owner`/`operator`
on MA / CRP / UBO / AF Lean) was NOT inspected — findings that depend on it are marked.

Severity is for an internal department tool where performance credit is computed from this data.

---

## Findings (ranked)

### F1 — High — v1 projects: any `operator` can rewrite the whole tree, incl. credit and closure
`firestore.rules:227-240` (operator branch), `:191-195` (gate only covers 4 v2 keys)

- Operator branch only freezes `roles`, `memberIds`, `name`, `deletedAt`, `createdBy`. Everything
  else in the single doc is free: `programs[]` → workstreams → tasks (status → `Completed`
  without approval, delete tasks outright, change `pic`/`contributors`/`creditShares`/`weight`),
  `creditPoints`, `projectLead`, `projectLeadShare` (App.jsx:752-768 — the project lead gets
  `projectLeadShare`% of the pool), `decisions`, RAID, `googleChatWebhook`, `relatedParties`.
- Attack: operator X on CRP saves a doc where `projectLead = 'X'`, `projectLeadShare = 100`,
  or marks their own tasks Completed, or drops other people's tasks from the array. One write,
  rules accept. No approval flow, no append-only history, no `rev` check server-side
  (the `rev` guard is client-only — B3 — so a crafted write bypasses it).
- Impact depends on who holds `operator` / per-project `owner` on the 4 sensitive v1 projects
  (unverified — production data). If only HOD holds roles there, impact is low; if PMs are
  operators, every v1 project is effectively "any editor can do anything".
- Tests: `v2-gate.test.js` G-2 asserts operator content saves *succeed* (by design). No test for
  limits on v1 content.
- Fix: until those projects move to v2, list who holds `owner`/`operator` on each v1 project
  and downgrade everyone but HOD to `member` (read-only) — or freeze `creditPoints`,
  `projectLead*`, `googleChatWebhook` for operators by adding them to the operator equality list.
  Real fix = migrate them to v2 (P2 wave 2).

### F2 — High — Picker spoofing via self-written user directory → add attacker to restricted projects
`firestore.rules:1356-1359` (`workspaces/main/users/{uid}`: any domain user writes own doc, no shape check);
client: `src/data.ts:79-90` (`useUserDirectory` lists every doc), `:446-458` (`addProjectMember` uses `entry.uid` from doc *data*)

- Any `@smartosc.com` account (not only AF people) writes `workspaces/main/users/{myUid}` =
  `{uid: myUid, email: 'hattt4@smartosc.com', name: 'Hà Trương Thị Thu'}` (or a colleague's name).
  The MembersModal picker (MembersModal.tsx:59, :409/:416) shows it as a normal entry. When an
  owner picks that entry, `addProjectMember` puts *my* uid in `memberIds`/`roles` (and
  `memberUids` on v2) → read access to MA/UBO etc., possibly `operator` (then F1 applies).
- Variant: write `uid: <victimUid>` in the data to make the owner add / grant a role to someone else.
- Requires an owner to click the wrong entry, but two identical-looking entries is a realistic trap.
- Tests: none for `workspaces/main/users` (only referenced as headroom padding in `v2-p3-headroom.test.js:12`).
- Fix: rule `request.resource.data.uid == uid && request.resource.data.email == request.auth.token.email`
  and `keys().hasOnly(['uid','email','name','photo','lastSeen'])`; better, switch the picker to
  `members/{uid}` (Owner-managed, P1) and use the doc id, not `data.uid`.

### F3 — Medium-High — PIC can approve their own close request (self-approval) when a Sub-PM submitted it
`firestore.rules:678-683` (`canDecide`), `:709-716` (`closeSubmitOk`: `picUid == me || mgr`),
`:662-669` (`eligibleWith` does not exclude the task's PIC)

- `canDecide` excludes the requester and stored `contributorUids`, but not `resource.data.picUid`.
- Attack: task T (PIC = PM P) in WS led by Sub-PM S. S, as manager, submits T as Completed
  (allowed: `mgr`) naming P as approver (eligible: P is PM, requester S is not PM). P approves:
  requester ≠ P, P not a contributor, `approverUid == P` → Completed, credit to P, approved by P.
  Even if S names the Owner, P still decides via the `pm && !isPMOrDeputyUid(m, requester)` branch.
  Same for PIC = Deputy. Needs the Sub-PM's submit (collusion or an innocent "Submit as done"
  click), but it breaks spec §2.1 #12 "cấm tự duyệt" and the direct-close branch's own
  `picUid != me` rule (`:732`).
- Tests: P3-06/P3-08/P3-16..19 cover requester self-approval, contributor managers and pic swaps —
  not "approver is the PIC". Not covered.
- Fix: in `canDecide` add `&& resource.data.get('picUid', null) != request.auth.uid`; in
  `eligibleWith` add `a != d.get('picUid', null)` (mirror in client `eligibleApprovers`).

### F4 — Medium — Credit can still be moved through `weight` after a task closes
`firestore.rules:620-622` (`creditKeys` lacks `weight`), `:899-906`; `:480-485` (WS update: PM may change any key but programId/start/end)

- Credit per task = pool × program/WS/task `weight` (App.jsx:702-709 `getEffectiveWeights`) ×
  share. `weight` is not in `creditKeys`, so a PM / Sub-PM can change task `weight` on a
  Completed task (where `picUid`/shares are locked by P3-C5), and a PM can change WS `weight`.
  Attack: Sub-PM raises the weight of their own Completed task (or lowers a peer's) — rules accept.
- Tests: P3-17 locks pic swap after close; no test on `weight`.
- Fix: add `'weight'` to `creditKeys()` (closed-task lock + Owner-only after close); decide
  whether WS weight should be Owner-only.

### F5 — Medium — v1 activity log can be wiped/rewritten by any project member (incl. read-only `member`)
`firestore.rules:257-277`

- Update only checks `entries.size() <= 500` and `entries[0].author == my email`. A member writes
  `entries: [ {author: me, ...} ]` → whole history gone, or rewrites every older entry (authors,
  `authorName`, timestamps). `authorName` (display name, storage-shim.ts:476-640) is never
  validated, so even entry[0] can display as someone else. Read-only `member` role and deactivated
  people still in `memberIds` can do this. This is the live audit trail for MA/CRP/UBO/AF Lean.
- Tests: none for `workspaces/main/activity/{pid}` client writes (only admin seeding in p2-* tests).
- Fix: require `entries.size() == resource.data.entries.size() + 1 && entries[1:] == resource.data.entries`
  (trim case: allow `size()==500` and `entries[1:] == resource.data.entries[0:499]`), and
  `entries[0].authorName` only via a known mapping or dropped; restrict writes to `canEdit`.

### F6 — Medium — v2 activity events: forged display author / type / timestamp
`firestore.rules:1344-1348`; client `src/storage-shim.ts:463-467` (prefers stored `timestamp` over `createdAt`)

- Create checks `authorUid == me` and `createdAt == request.time` only; no key allow-list. Any
  reader (including a Viewer, or any active member on a `department` project) can write
  `{authorUid: me, author: 'HOD', authorName: 'Hà Trương', action: 'role_changed', timestamp: '2026-10-01…'}`.
  The UI shows `author`/`authorName` and the forged `timestamp`. The Rollback table (CLAUDE.md,
  "Gán vai trò sai") treats `role_changed` Activity lines as the record of role changes.
- Unbounded doc count/size (spam), but doc id is client-chosen and update is denied, so no overwrite.
- Tests: `v2-matrix.test.js:88-94` checks only authorUid. Forged fields not covered.
- Fix: drop `timestamp`/`author`/`authorName` from stored events or require
  `!('timestamp' in data)` and render the name from `members/{authorUid}`; restrict
  `role_changed`-type events to Owner/PM; cap `keys().size()` and string sizes.

### F7 — Medium — v1 projects: no workspace-Owner override; per-project owner can lock HOD out and hard-delete
`firestore.rules:204-207` (read = memberIds only for v1), `:230-231`, `:247-248`

- On v1 docs the workspace Owner has no read/update/delete right unless they are in
  `memberIds`/`roles`. A per-project `owner` can remove HOD from `memberIds` and `roles`
  (`hasAtLeastOneOwner` only needs one owner) → HOD can no longer read the project; the same
  person can hard-delete the doc (spec §4: delete project = Owner only; CLAUDE.md: no hard delete).
  Per-project owners can also add arbitrary members (bypasses Q4 "only Owner adds people").
- Who holds per-project `owner` on the 4 v1 projects: unverified (setup-rbac.js gave it only to the
  admin uid; projects created in-app give it to the creator).
- Tests: none for v1 delete or owner removing another owner.
- Fix: add `|| isDirectoryOwner()` to v1 read/update; change v1 delete to `isDirectoryOwner()` only;
  require `request.resource.data.roles[ownerUid] == 'owner'` is not removable by non-Owner.

### F8 — Medium — Any `@smartosc.com` account can create projects and write workspace meta
`firestore.rules:111-117` (workspace update: any domain user, any non-owner key, any size),
`:211-218` (project create: any domain user, no `isActiveMember`)

- Company-wide (not AF) accounts can: create projects in `workspaces/main` (spec: Owner only);
  rewrite `userPreferences`, `workspaceName`, any new key on `workspaces/main`; pad it toward
  1 MiB so every other user's `saveMeta` merge fails (DoS — every v2 rule also `get()`s this doc).
  Spec §8 sketch: workspace read/update require `isActiveMember` and `config` is owner-only — when
  the planned `workspaces/{wid}.config` (webhook, credit rules) lands, it will be writable by
  any domain user unless `config` is added to `ownerFields()`.
- Tests: `workspace-owner.test.js` OU-8/B1-4 assert non-owner meta writes succeed (by design).
- Fix: add `'config'` to `ownerFields()` now; gate meta update and project create on
  `isActiveMember('main')`; project create on `isDirectoryOwner()` per spec §4.

### F9 — Medium — Task create skips the integrity checks enforced on update
`firestore.rules:949-958`

- A PM / Sub-PM creating a task may set `creditSharesMode: 'manual'` and any `creditShares`
  (P3-C6′ says manual is Owner-only), pre-filled `closeRequestHistory`, `approvedByUid`,
  `blockerResolutions`, and `updates` entries with someone else's `authorUid` (documented "not
  checked on create"). Attack: Sub-PM creates a task with `creditShares: {me: 100}` manual and
  forged history showing prior approvals.
- Tests: P3-15 covers status only.
- Fix: on non-Owner create require `creditSharesMode in [null,'auto']`, no `closeRequest*`,
  `approvedByUid`, `closedByUid`, `blockerResolutions`; every `updates[i].authorUid` can't be
  looped, so require `updates` empty or size ≤ 1 with `[0].authorUid == me`.

### F10 — Medium (spec gap) — Sub-PM can activate RAID / rewrite any program's RAID & decisions
`firestore.rules:1055-1070`, `:1100-1122`

- `claimWriterOk` lets any PM/Sub-PM of *any* program write `raid/{anyProgram}` and any decision
  (HOD Q1 accepted "every PM/Sub-PM of the project"). But spec §4: "Duyệt RAID (Draft → Active)"
  is Owner/PM only; rules can't tell (whole `items[]` array, nested history unchecked). A Sub-PM can
  also overwrite decision fields such as who decided / when. A PM can delete any decision in two
  writes (update with `viaProgramId` = own program, then delete, `:1115-1121`).
- Tests: v2-matrix covers claim validity; not "Sub-PM sets item Active" or "PM re-claims then deletes".
- Fix: accept as documented, or bump RAID activation to the `approvals` flow (`raid_activate`)
  and make decision delete Owner-only.

### F11 — Low-Medium — PM can delete a workstream, orphaning its tasks
`firestore.rules:505-508`

- PM of the program deletes `workstreams/{wsId}`; tasks keep `workstreamId` → Sub-PM branch
  errors (`taskLeadOk` get() on missing doc), create/move checks fail, and the assembler likely
  drops the tasks from the tree (unverified) → tasks/credit "disappear" without being Dropped.
  Spec §4 does allow PM to delete WS.
- Fix: make WS delete Owner-only (PM sets an archived flag), or have the client refuse deletion of
  a WS with tasks and keep rules Owner-only.

### F12 — Low-Medium — Deactivation and membership removal don't fully revoke
`firestore.rules:40-42, 204-207, 258` (v1 & project-doc read use `memberIds`, no active check);
`:829-837, 849-857` (Assignee/contributor writes don't require `canReadProject`)

- A deactivated person (e.g. Vannh) still in `memberIds` keeps full v1 read and, if `operator`, v1
  write; still reads the v2 project doc (which still carries the frozen v1 `programs[]` tree for
  rollback, plus `programMeta`, `googleChatWebhook`) and the v1 activity doc. Mitigated if the
  Google account is suspended (token refresh fails within ~1 h).
- A PIC/contributor/PM removed from `memberUids` (still active) can still write their tasks blind.
- Fix: v1 read `isMember(p) && isActiveMember('main')` (costs 1–2 get); v2 project-doc read only
  via `canReadProject`; add `canReadProject` to non-Owner v2 write branches.

### F13 — Low — Chat webhook secret on the project doc, editable by v1 operators
`firestore.rules:227-240`; client `src/App.jsx:14545`, `src/chatNotify.js:225-228`

- `googleChatWebhook` (contains key+token) is readable by every project reader; anyone can post as
  the bot into that space. On v1 projects an operator can repoint it to another
  `chat.googleapis.com` space they control, so others' action notifications leak there
  (prefix check prevents arbitrary hosts). Spec §7 wanted `private/settings` readable by Owner+PM.
- Fix: move to `projects/{pid}/private/settings` with Owner/PM read; freeze the field for operators.

### F14 — Low — Directory and workspace meta readable by every company account
`firestore.rules:109, 161, 167, 1357`
- Any `@smartosc.com` employee (outside AF) can list `members`, `invites`, `users`, and read
  `workspaces/main` (ownershipLog, userPreferences). Spec §8 sketch: `isActiveMember`. Low
  sensitivity (names/emails/department), but invites reveal who is being onboarded.
- Fix: `isActiveMember('main') || isDirectoryOwner()` for members/invites/users list; self-read of
  own invite for the self-claim path.

### F15 — Low — Free-form fields the Assignee can write
`firestore.rules:558-562`
- `deadlineRequestHistory` / `deadlineRequest` / `references` have no shape checks: an Assignee can
  fabricate a history entry "Approved by PM". `end` itself is not writable, so only display spoof.
- Fix: same prepend-one + `decidedByUid` pattern as `histWith`, or treat as Owner-only history.

### F16 — Low — Sign-in identity checks
`firestore.rules:30-34`
- Relies on `email_verified` + regex. Solid for Google sign-in on a Workspace-managed domain. If
  the Email/Password or other providers are ever enabled in Firebase Auth, the rule does not pin the
  provider. Unverified which providers are enabled in the console.
- Fix (cheap): `&& request.auth.token.firebase.sign_in_provider == 'google.com'`.

### F17 — Low — Unbounded sizes / no shape checks
- `approvals` `title`/`payload` (`:1197-1215`), task/action/decision/RAID free fields, `users`
  docs, workspace meta. Only practical effect is doc bloat (1 MiB per doc) and UI noise.
- Fix: `size()` caps on strings that render (`title`, `text`, `reason`) where cheap.

---

## Spec ↔ rules gaps (summary)
| Spec | Rules | Ref |
|---|---|---|
| §4 Create/delete project: Owner only | Any domain user creates; v1 per-project owner hard-deletes | F7, F8 |
| §4 Project settings, webhook, members: Owner only | v1 per-project owner manages members; operator edits webhook | F1, F7, F13 |
| §2.1 #12 no self-approval | PIC (as PM) can approve a Sub-PM's submit of their task | F3 |
| P3-C5/C6′ no self-credit, manual split Owner-only | `weight` unlocked; manual split on create | F4, F9 |
| §4 RAID Draft→Active: PM/Owner | any Sub-PM | F10 |
| §8 workspace read/update: active member; `config` owner-only | any domain user; `config` not listed | F8, F14 |
| §7 webhook in `private/settings` Owner+PM | on project doc, all readers | F13 |
| A1 Credit / Activity dashboard: Owner + PM | every reader reads all tasks (credit computed client-side) and activity | design limitation, note only |
| §4 Viewer may comment | Viewer cannot write task updates (only contributors) | functional gap, not security |

## Missing emulator tests (highest value first)
1. PIC-as-approver (F3): Sub-PM submits PM's task naming PM → PM approve must fail.
2. `weight` change on Completed task by PM/Sub-PM (F4).
3. `workspaces/main/users/{uid}` writing someone else's email / `uid` (F2).
4. v1 activity: member truncating / rewriting entries (F5).
5. v2 activity with forged `author`/`timestamp`/type (F6).
6. v1: per-project owner removing workspace Owner, hard delete; operator changing `projectLead*`,
   `creditPoints`, `googleChatWebhook` (F1, F7).
7. Non-Owner task create with `creditSharesMode: 'manual'` / forged history (F9).
8. Non-AF domain user creating a project / writing meta keys (F8).

## Checked and found solid
- Workspace owner fields: `ownerUids` non-empty, owner-only, no client claim; create can't seed owner
  fields; delete denied (`:93-120`; tests B1-*, OU-*).
- Directory writes Owner-only; self-claim must exactly mirror an active invite, uid == caller,
  stamped with `request.time` (`:142-164`; directory.test.js).
- Non-domain / unverified / anonymous users denied everywhere (`isSmartOSC` on every allow;
  baseline.test.js).
- v2 project doc frozen for non-Owners; `programMeta`/`memberUids`/`visibility`/`schemaVersion`
  Owner-only on v1 too (`:181-195`; v2-gate.test.js).
- v2 sub-collections closed when project is not v2 (`projectIsV2`; v2-rollback-gate.test.js).
- Restricted default (`visibility` absent → restricted), active-member requirement for non-Owner
  readers and writers; no collection-group wildcard, so no cross-project list leak.
- `pathFieldsOk`, `version` +1, `updatedBy == me` on every v2 write (anti-spoof, optimistic lock).
- Task: Assignee key allow-list, append-only `updates`/`checkIns` with `authorUid == me`,
  no direct close by Assignee, close stamp `approvedByUid == me` for all incl. Owner, requester
  never decides, contributor managers can't decide/direct-close, credit keys locked once not open,
  reopen clears stamps, PM moves need target-program PM (v2-p3*.test.js, v2-p23.test.js).
- Task / RAID delete Owner-only; approvals never deleted; activity v2 update/delete denied.
- Approvals: keys allow-list, requester == caller, approver ≠ caller, Pending-only updates,
  reassign log append-only, decided requests final.
- Action PIC: allow-listed keys, cannot cancel, append-only updates.
- Unlisted paths default-deny; other `wid` values can't host projects (projects match is `main`-only).
- Uncertain: list queries on `projects` using the v2 branch (`canReadProject` with the `{pid}`
  wildcard) — expected to be denied/unprovable rather than leak; unverified in emulator.

---

# AF-MPT write-path / data-integrity review (read-only)

Branch `feat/mindmap-roles` @ `e325762`, 2026-11-05. Unit tests: `npx vitest run` passes (32 files, 619 tests).
Nothing was modified; no Firebase access.

Severity: Critical / High / Medium / Low. "(unverified)" = based on reading the code, not reproduced.

---

## Findings (ranked)

### 1. HIGH: v1 "Delete program / Delete work stream" hard-deletes every task (including Completed ones with credit)
- `src/App.jsx:6704-6721` (MindMap `actDelete`), `src/App.jsx:6946-6952` / `6972-6982` (Outline `deleteProgram` / `deleteWorkstream`), buttons at `7252`, `7303`, menu items at `6742`, `6755`.
- Scenario: on a v1 project (CRP, MA, UBO and AF Lean are all still v1), any editor (v1 `canEdit` operator, since nothing checks roles in the UI) clicks Delete program and confirms. `onProjectUpdate` drops `programs[i]`, and the whole-doc v1 save (`persistence.js:92-104`) writes the project without those tasks, their check-ins and updates, the program's RAID, and its credit weights. The `rev` guard does not help because it is a legitimate current write. The dialog says "cannot be undone". The only recovery is a JSON backup restore, which also rolls back everything else in the project.
- This breaks the "never hard-delete tasks" policy. Credit and performance data are lost.
- Fix: block the delete when the node has any task (ask the user to Drop the tasks first), or move the tasks to Dropped instead. Restrict it to Owner on v1 as well.

### 2. HIGH: the v1 activity log is rewritten whole on every append; a failed read wipes it to one entry
- `src/App.jsx:1556-1563` (`loadActivity` returns `[]` when the read fails, then `appendActivity` writes `[entry]`), `src/storage-shim.ts:488-491` (`get` turns any error into `null`), `src/storage-shim.ts:625-651` (`setDoc(ACTIVITY_REF, { entries })`, full replace). The rules at `firestore.rules:270-273` only check `entries[0].author` and the size, so the replacement is allowed.
- Scenario A (wipe): the activity read fails once (network blip, quota, token refresh). The user then changes a task. `appendActivity` writes `[newEntry]` over up to 500 entries, including role_changed, credit_shares_change and approval history.
- Scenario B (lost entries, very likely): `applyTaskUpdate` fires several `log()` calls without awaiting them (`App.jsx:13287-13329`). For example, a status change plus a new update plus a credit-share edit in one save. The same happens in the close-event loops (`13118`, `13186`). Each call reads the doc and writes it back, so concurrent calls overwrite each other. Two users logging at the same time also lose entries.
- Fix: for v1, append with a transaction or `updateDoc({ entries: arrayUnion(e) })` and accept the cap trim server-side. Never write after a failed read: make `loadActivity` distinguish "failed" from "empty". Await `log()` calls one after another.

### 3. HIGH (unverified, needs the CRP id): a transient failure at boot can run the "first-ever workspace" seed path
- `src/storage-shim.ts:389-435`: any exception in the `workspace:meta` get (offline, `getDocs` error) is caught and returns `null` at `488-491`. `src/App.jsx:12679-12687` treats `null` as "no workspace" and seeds.
- Scenario: a user opens the app while offline or on a flaky network. `saveProject(SEED_CRP)` fails safely: the pre-read classifies as fatal, or the `rev` check fires. But `saveMeta(m)` queues `setDoc(workspaces/main, { workspaceName: 'Project Tracker', seeded: true }, merge)`. `appendActivity('proj_crp', seed)` reads activity, which fails and returns `[]`, then queues `setDoc(activity/proj_crp, { entries: [seed] })`. Both queued writes land when the network returns while the tab is still open. If the real CRP project id is `proj_crp` (the seed id is `proj_crp` in `App.jsx:42`, and docs refer to `proj_crp`), the CRP v1 activity log is wiped and the workspace name is reset.
- Fix: in the shim, return `null` for `workspace:meta` only when `!metaSnap.exists()`. On error, rethrow or return an error marker, and have the App show "can't load" instead of seeding. Better: delete the client seed path; the workspace exists.

### 4. HIGH: in-app Restore of a v2 project silently deletes or reverts more than "tasks/comments"
- `src/App.jsx:13818-13841` → `storage-shim.ts:545` → `planV2Save.js:356-363` (delete op for every stored action, decision, RAID or workstream not in the backup tree), `planV2Save.js:375-379` (refuses only when updates become empty or close history shrinks).
- Scenario: the Owner restores a backup taken a week ago, while the v2 project is loaded. Actions and decisions created since the backup are hard-deleted (`tx.delete`). RAID docs revert to the backup content, so newer risks and their history disappear, and nested history is not checked. Task fields (status, dates, progress, credit split) revert. Task comments added since the backup are removed whenever at least one older comment remains (only an empty list is refused). `FORCE_WRITE_FLAG` is ignored on v2, but that does not help here. CLAUDE.md describes this as "Restore in app refuses if the backup loses tasks or wipes comments", which understates what is lost. `scripts/p2-restore.mjs` handles the same case safely: Cancelled/Dropped instead of delete, and it refuses history loss.
- Fix: refuse in-app restore for v2 projects and point to `p2:restore`. Alternatively, make the planner refuse any delete or list shrink when a `restore` flag is set.

### 5. MEDIUM-HIGH: v2 Delete program / work stream with tasks is allowed by the UI, refused by the planner, and then blocks every later save
- `src/App.jsx:6704-6721`, `6946-6982` → `planV2Save.js:360` (`none('task-delete')`) → banner `refused` (`App.jsx:2033`).
- Scenario: a PM on Treasury 2026 (v2) deletes a work stream with 5 tasks. The in-memory tree loses the WS and its tasks, and the save is refused. `onActivity` still writes "Deleted work stream ... (5 tasks)" to the v2 activity log, which is permanent and append-only and now false. The tasks stay hidden from this user until reload. Every following edit in the project re-sends the same tree and is also refused. Everything typed after this is lost on reload. The banner says so, but users often keep working.
- Same pattern for any Owner-only change made by a non-Owner on v2. For example, a PM renames a program in MindMap/Outline (`actRename`, `6685-6702`): this produces a `programMeta.<id>.name` metaPatch, which is denied (`denied` banner), and all later saves in the session are denied because the tree keeps the change.
- Fix: on v2, hide or disable Delete when the node has tasks, and hide program rename for non-Owners. Log the activity only after the save returns `ok`. After refused or denied, revert the in-memory tree to `v2SavedTree(pid)` plus the still-valid edits, or at least to the saved tree.

### 6. MEDIUM: v2 project-doc fields are written without any version check, so a stale Owner tab overwrites them
- `src/execV2Save.js:97-101` (`tx.update(projectRef, meta)`; the tx reads the project doc but only checks `schemaVersion`), `planV2Save.js:404-412` (`metaPatch` = every top-level key that differs from this tab's `loaded.meta`, written as a whole value).
- Scenario: HOD has two tabs or devices. Tab 1 (loaded Monday) edits `teamMembers` or `weightChangeLog` or `creditPoints` on Friday. Tab 2 changed the same array on Wednesday. Tab 1 writes its whole array, and Wednesday's members or weight-log entries are lost without a conflict. Only `pmUid`/`deputyUid` are protected (`overlayLiveRoles`). Risk is limited today (one Owner) but grows with a second Owner. These fields feed credit scoring.
- Fix: keep a `metaVersion` (or compare the live value of each patched key with `loaded.meta[k]` inside the transaction) and return `conflict` on mismatch.

### 7. MEDIUM: a failed v2 close step leaves the optimistic close in memory, and the next ordinary save writes it
- `src/App.jsx:13112` (`if (res.status !== 'ok') return;`, no revert for `save-failed`), `12972` (the v2 debounced save uses `projectsRef.current`, which includes `intent.task` from `setTaskNow` at `13275`).
- Scenario: Submit as done fails with `error` (network). The task still shows Submitted or Completed. The user edits another field, and the debounced save writes the close transition as a plain tree save. Closes made up of several steps (credit step, then status) are collapsed into one write, which rules may deny. That poisons later saves as in #5. No close events are logged. The `error` banner is cleared by the next `ok`, so the user never learns that the close was not recorded properly. (unverified end-to-end)
- Fix: on `save-failed`, `setTask(res.task)` (the last saved state), the same as is already done for `flush-failed` and `denied`.

### 8. MEDIUM: membership and directory changes made after load are invisible to the v2 planner for the whole session
- `src/storage-shim.ts:242-268` (`dirPromise` is cached forever once it succeeds), `src/migrateV2.js:123-136` (an unknown name gives `picUid: null`).
- Scenario: the Owner adds a new invite or member at 10:00. A PM whose tab opened at 09:00 assigns a task to that person. The planner resolves `picUid: null` / `contributorUids: []` and saves without error. That person cannot submit their task, and approval routing and My Work rely on the uid. `overlay()` only keeps the stored uid when `pic` is unchanged, so the null stays until someone edits `pic` again in a fresh tab.
- Fix: invalidate `dirPromise` when the directory reloads (DirectoryModal `onChanged`), or re-fetch when the planner meets an unresolved name. Report unresolved PIC names to the user instead of saving null silently.

### 9. MEDIUM (unverified): large non-Owner v2 saves can exceed the rules get() budget for one transaction
- `src/execV2Save.js:66-104` puts every op of a save in one transaction (batch 0). Each task or action rule for a PM or Sub-PM does a `get()` on the task's workstream (`firestore.rules:339-358`). Firestore allows about 20 distinct access calls per transaction (10 per op).
- Scenario: a PM's save touches tasks in more than about 15 workstreams. Examples: cleanup or rename of a PIC across the project, or an index shift that renumbers `order`. The whole batch is `denied`, with the same sticky effect as #5. CRP (187 tasks) has the most exposure after it moves to v2. The Owner path is cheap, so this mostly affects PMs.
- Fix: split batch 0 into chunks grouped by workstream (for example ≤ 8 workstreams per transaction). Test with the emulator on a CRP-sized fixture.

### 10. MEDIUM: v1 stale `programs` closures after awaited dialogs
- `src/App.jsx:6685-6721`, `6931-6993` (and similar `onProjectUpdate({ ...project, ... })` after `await dialogs.prompt/confirm`).
- Scenario: `project` is captured when the menu opens. Background updates that land while the dialog is open (`setTaskNow` from a close in flight at `13185` or `13108`, or `refreshV2Roles`) are overwritten in memory by the stale spread. On v1 that becomes the saved state. On v2 the planner may see the close "revert": if close history shrinks it refuses, otherwise it writes the older task state. (unverified; narrow window)
- Fix: build updates from `projectsRef.current[pid]` (functional update) instead of the render-time `project`.

### 11. MEDIUM: v1 Restore replaces newer activity and rewrites the author of the newest entry
- `src/App.jsx:13833` → `storage-shim.ts:630-651`.
- Entries logged after the backup are lost, and `entries[0].author` / `authorName` become the restorer. Risk #13 in CLAUDE.md covers the author rewrite; the loss of post-backup activity is not stated there. Acceptable for a full restore, but worth one line in the restore confirm text.

### 12. LOW-MEDIUM: workspace meta is echoed from a stale copy on every project switch
- `src/App.jsx:13656-13658` (`saveMeta({ ...meta, currentProjectId })`) → `storage-shim.ts:507-537` (merge write of every non-owner key). The rules allow any user to update non-owner keys (`firestore.rules:114-117`).
- Scenario: the Owner changes a workspace-level non-owner field (today `workspaceName`; later the multi-workspace `config` planned for P2). Any user with an older tab who switches project writes the old value back.
- Fix: when only `currentProjectId` changed, write it to localStorage and skip the Firestore write. Otherwise, add `config` and similar fields to the owner-only list now.

### 13. LOW: v2 hard deletes of actions, decisions, RAID docs and empty workstreams
- `planV2Save.js:361`, `execV2Save.js:86-90`. Only tasks are protected. Deleting an action, decision, or a whole program's RAID doc is permanent (the rules allow it for Owner and managers). This is consistent with v1 behaviour but outside the "Dropped/Cancelled" philosophy. `p2-restore` already uses Cancelled for actions.
- Fix: soft-delete (`status: 'Cancelled'` / `archivedAt`) for actions, decisions and RAID items, or at least require Owner.

### 14. LOW: the v1 pre-read "permission-denied ⇒ missing ⇒ create" branch writes outside the transaction
- `src/storage-shim.ts:575-588`. A member removed while their tab is open gets permission-denied, takes this branch, and calls `setDoc` with `memberIds: [uid]` and `roles: { uid: 'owner' }`. The rules deny it because the doc exists and the caller is not a member, so nothing is lost. But it is only safe because of the rules. The same branch would overwrite a real doc if the read was denied but the write allowed (for example a v1 doc readable only via v2 `canReadProject`).
- Fix: on the create path use a transaction / `tx.create`-like precondition (or `setDoc` only when the pid was created in this session).

### 15. LOW: activity writes are not counted in `pendingSaves`
- `src/App.jsx:13004-13013`. The unload guard ignores pending v1 or v2 activity writes, so closing the tab while offline drops them silently. `ssetShared` failures in `appendActivity` are also ignored (no banner).

---

## Checked and found solid
- **v1 project save**: read, `rev` check and write in one `runTransaction`. `writeId`/`pendingWriteIds` correctly treat a lost commit response as "ours". ACL, `relatedParties` and v2 server keys always come from the server copy. A v2 doc is refused (`readonly`) even with force. Stale tabs get a sticky conflict, not an overwrite. Per-project `createKeyedQueue` serialises saves.
- **v2 save**: diff-based per-doc ops with `expectVersion` checked inside the transaction. The project `schemaVersion` is checked per batch, so rollback is safe. The rules enforce version+1 and `updatedBy`, which closes gaps in the client check. Orphans are never deleted. Task deletes are refused. Close-history wipes are refused. Ruling X stepping is correct and partial commits refresh the cache (`applyWritten`). `programMetaPatch` writes field paths and `KEEP_PROGRAM` is never nulled. `overlayLiveRoles` covers the whole-map fallback. The directory-unavailable refusal prevents null uids when the directory failed to load (but see #8 for a stale directory).
- **Role change** (`execRoleChange.js`): one transaction with a live `fromUid` check, a workstream programId check, and arrayUnion for members. `wsCacheAfterRoleChange` keeps the stale version so a later tree save conflicts instead of overwriting.
- **Close flow** (`closeWiring.js`): steps are saved from `v2SavedTree` plus that task only, so unrelated unsaved edits never ride along. Flush failure aborts. Re-plan after a credit step.
- **v2 activity**: one doc per event, create-only by rules. Re-sent ids are skipped through `v2ActivityKnown`. A failed read cannot wipe anything.
- **MembersModal/data.ts**: `updateDoc` of changed fields only, a live `onSnapshot` source, and `arrayUnion`/`arrayRemove` for `memberUids` (the `memberIds`/`roles` snapshot debt is already listed in CLAUDE.md, and its impact is no worse than described). The unused `saveProject`/`hardDeleteProject` in data.ts are not imported anywhere.
- **Excel import** creates a new project only; it can't overwrite an existing one. Project delete is a soft delete (`deletedAt`).
- **Workspace owner fields** are stripped from ordinary meta writes (`metaForWrite`).
- **Doc size**: v2 removes the 1 MiB single-doc risk for tasks. v1 CRP is 77 KB.
- **Scripts**: `p2-assign` writes `programMeta.<id>.<field>` through FieldPath plus arrayUnion and bumps the workstream version inside a fingerprinted transaction. This matches the client cache rules: stale tabs conflict on the workstream, and `pmUid` is kept via `KEEP_PROGRAM`. `p2-restore` reuses `META_SKIP` and `splitProject` from `src`, so the data shape agrees with the client. The scripts themselves were not reviewed in depth.

---

# Review C — Client-side security & operations (AF-MPT)

Date: 2026-11-05. Branch checked out: `feat/mindmap-roles` (HEAD `e325762`). Read-only: no files changed, nothing deployed, no production access.
Secret files (`service-account.json`, `.env.local`, `.vercel/`, manifests, backups, xlsx) were **not opened**; only their presence/ignore status was checked.

Severity scale: Critical / High / Medium / Low. "Unverified" = inferred from code/config, not confirmed against production.

---

## Ranked findings

### H1 — High — v2 activity reads amplify: up to 500–1,000 Firestore reads per logged event
- Where: `src/App.jsx:1557-1563` (`appendActivity` = `loadActivity` then set), `src/App.jsx:13021-13027` (`logActivity`), `src/App.jsx:13032-13045` (`logActivityForProject` reloads again), `src/storage-shim.ts:457-470` (v2 `activity:` get = `getDocs(... limit(ACTIVITY_CAP))`, `ACTIVITY_CAP = 500` at `:56`). Also `switchProject` `src/App.jsx:13653` and Backup JSON `:13812`.
- Scenario: in a v2 project every logged event (task edit, role change, close/approve, settings) first re-reads the newest ≤500 activity docs, writes one doc, then (`logActivityForProject` on the current project) re-reads ≤500 again. Every project switch also reads ≤500. A migrated project with a full v1 log (p2-migrate copies activity) costs ~1,000 reads per edit. On Spark (50k reads/day) ~50 edits/day across the team exhausts the quota. Magnitude depends on current activity counts per v2 project (unverified).
- Fix: in `appendActivity` for v2, write just the new event (no pre-read; the shim already writes only unseen ids) and prepend it locally; load the feed lazily with a small page (e.g. 50) and "load more".

### H2 — High — Spark daily read quota is a hard outage cliff once projects move to v2; failures look like data loss
- Where: page-load path `src/App.jsx:12673-12700` + `src/storage-shim.ts:395-470`, `src/readV2.js:47-53,108-110`, `src/data.ts:82` (users listener), `:145-146` (members+invites).
- Estimate per page load (memory cache only, no persistence): workspace doc 1 + project list query (N docs) + each project doc again (N) + per v2 project 6 queries reading **every** workstream/task/action/raid/decision/approval doc + current project activity ≤500 + all `users` docs + all members/invites. With all 7 projects on v2 (CRP alone 187 tasks) ≈ 600–700 docs + ≤500 activity ≈ **~1,000+ reads per load**. 20 users × 3 loads (hard-refresh is part of every runbook) ≈ 60k > 50k/day. Rule `get()` calls on writes also bill reads. `approvals` is read whole and only grows.
- Behaviour when quota hits (reads return `resource-exhausted` until ~14:00–15:00 VN): shim swallows errors and returns `null` (`storage-shim.ts:488-490`; v2 read → `null` at `:88-91`), so projects silently disappear / workspace shows empty — no error banner for reads. Writes abort ("fatal") so data is not corrupted, but users will believe data is lost. Any domain user (not only roster members) can also burn the quota by scripting reads of domain-readable collections (insider DoS, unlikely).
- Fix: before onboarding, move to Blaze with a budget alert (cost at this scale is cents; removes the cliff and unlocks PITR/scheduled export, see M5); plus H1 fix, enable `persistentLocalCache`, and show a "Couldn't load data (quota/network) — don't edit, retry later" banner when a read fails instead of an empty view.

### M1 — Medium — CI is not enforceable: private repo on GitHub Free has no branch protection; Vercel deploys `main` regardless
- Where: `gh api repos/haleytruong89-moon/AF-MPT/branches/main/protection` → 403 "Upgrade to GitHub Pro or make this repository public" (rulesets endpoint same). `.github/workflows/ci.yml`.
- Scenario: a red PR (or a direct push to `main`) merges and Vercel auto-deploys to production; "CI green before merge" is discipline only. CI also does not run `vite build` or lint.
- Fix: enable Vercel "Deployment Checks" (block production promotion until the GitHub `checks` job passes) or upgrade to GitHub Pro / move repo to an org to enforce required checks; add `npm run build` to CI.

### M2 — Medium — Local dev (and probably Vercel previews) run against the production Firebase project
- Where: local `dist/assets/index-*.js` contains `projectId:"af-mpt"`, `authDomain:"af-mpt.firebaseapp.com"` (public config; built from `.env.local`). No dev/staging project, no emulator wiring for the app.
- Scenario: `npm run dev` testing of unmerged write-path code (planV2Save/execV2Save, role changes) writes to real data. Vercel Preview deployments of feature branches likely get the same env vars (unverified); if a preview domain is ever added to Firebase Auth authorized domains, unreviewed code can write production.
- Fix: create a separate `af-mpt-dev` Firebase project (or connect the app to the emulator in dev) and scope prod env vars to the Production environment only in Vercel; keep `*.vercel.app` previews out of authorized domains.

### M3 — Medium — Google Chat webhook URLs are bearer credentials readable by every project reader and exported in Backup JSON
- Where: field `googleChatWebhook` on the project doc (`src/App.jsx:14533-14545` write, `:3519, :5072, :8829, :13556` use); Backup JSON `src/App.jsx:13809-13816` dumps `projects` as-is; backup button is shown to **all** users (`:14000`, only Restore is owner-gated).
- Scenario: any member (or any active member for `department` projects) can read the URL in Firestore or in a downloaded `workspace_backup_*.json` and post arbitrary messages as the bot into the project's Chat space (phishing that looks like the tracker). Backups get emailed/copied around. No secrets were found in git history (only placeholders: `spaces/X/messages?key=...`, `AIzaSy...`).
- Fix: strip `googleChatWebhook` from Backup JSON (and Excel), document "rotate webhook if leaked"; longer term move posting behind a small serverless function that holds the URL (needs a decision: CLAUDE.md says no backend).

### M4 — Medium — Legacy Admin SDK scripts write production immediately, no preview, and `migrate.js` overwrites whole project docs
- Where: `scripts/migrate.js` (`projectRef.set({...})` without merge, ~line 81; activity `set` ~line 93; exposed as `npm run migrate`), `scripts/setup-rbac.js` (writes on first run, merge). All P1/P2 scripts (`p1-build-directory`, `p2-assign`, `p2-migrate`, `p2-pilot-copy`, `p2-restore`, `p2-set-owner-uids`) default to preview and need `--apply` (P2 also `--expect <hash>`) — good.
- Scenario: someone runs `npm run migrate <uid> <email> backup.json` against production: every project in the backup is replaced by the v1 tree with `memberIds=[admin]`, dropping `schemaVersion: 2`, `memberUids`, `visibility`, roles → v2 sub-collections orphaned, everyone loses access.
- Fix: delete both legacy scripts and the `migrate` npm alias (they are superseded), or make them refuse unless `--apply` and refuse any existing doc.

### M5 — Medium — Backup/recovery is manual-only and Backup JSON is incomplete for v2
- Where: Spark plan (no PITR, no scheduled export) per CLAUDE.md; `backupJson` `src/App.jsx:13809-13816` stores in-memory projects + `loadActivity` (capped at newest 500 per project, `storage-shim.ts:56,461`).
- Scenario: a bad write between HOD's manual backups is unrecoverable; v2 activity older than the newest 500 events is never in any backup. Whether approvals/role history survive a backup round-trip was not verified.
- Fix: Blaze + daily managed export to a GCS bucket (or enable PITR, 7 days); until then, a scheduled read-only Admin script export.

### M6 — Medium — `service-account.json` is present again in the repo root
- Where: `C:\Users\hattt4\projects\afmpt-tracker\afmpt-tracker\service-account.json` (gitignored, not tracked, never in history; content not opened). CLAUDE.md says the P1 key file was deleted and the key should be revoked.
- Scenario: a long-lived owner-level key on a laptop; any tool/agent/backup sync of the repo folder can leak full Firestore admin.
- Fix: after each approved batch, delete the file and disable the key in GCP IAM; prefer short-lived keys or `gcloud auth application-default login` with impersonation.

### M7 — Medium (unverified) — Read errors on boot are treated as "first-ever run" and can seed a phantom project
- Where: `src/storage-shim.ts:395-397,488-490` (any error on `workspace:meta` → `null`), `src/App.jsx:12678-12686` (null meta → seed `SEED_CRP` + `saveMeta` + activity).
- Scenario: a transient error (e.g. `unavailable`) reading `workspaces/main` at load makes the app seed a "CRP" project (`proj_crp`) owned by that user; the create succeeds if `proj_crp` doesn't exist (pre-read permission-denied → "missing" → `setDoc`; rules allow any domain user to create a project, `firestore.rules:211-218`). Quota errors are "fatal" so the write aborts in that case.
- Fix: distinguish "doc does not exist" from "read failed" in the meta get (throw / return an error marker) and remove the auto-seed path from production.

### L1 — Low — Domain check: rules are solid, client is advisory; non-domain sign-ins still create Auth users
- Where: `src/firebase.ts:26,33` (`hd` hint), `src/auth.tsx:31-37` (client `endsWith` + signOut), `firestore.rules:30-34` (`email_verified == true` and `email.matches('.*@smartosc[.]com$')`, used on every match).
- Scenario: a personal Google account can complete OAuth (hd is only a hint); it is signed out client-side and denied by rules, but a Firebase Auth user record remains. Rules do not pin `sign_in_provider == 'google.com'` — harmless unless another provider (e.g. email link) is enabled (unverified).
- Fix: confirm only Google is enabled in Auth providers; optionally add `request.auth.token.firebase.sign_in_provider == 'google.com'` to `isSmartOSC()`.

### L2 — Low — Reference links rendered as `href` without re-validation
- Where: `src/App.jsx:2451` renders `reference.url`; validation only on form save (`:2492`, `isValidUrl` `:189-197`) and Excel import (`:1593`).
- Scenario: a member writing directly via SDK (or a restored JSON) can store `javascript:` URLs; React 18 only warns. Mitigated: CSP `script-src` has no `'unsafe-inline'`, so `javascript:` navigation is blocked.
- Fix: render `href={isValidUrl(url) ? url : undefined}`.

### L3 — Low — Chat notifications and Gmail/briefing exports carry restricted-project content to wider audiences
- Where: `src/chatNotify.js:51-215` (action title, description, comment text, PIC, breadcrumb), `src/App.jsx:12536-12545` (owner digest CCs all team members).
- Scenario: content of `restricted` projects (MA, UBO) can be posted to a Chat space whose membership is broader than the project. Process risk, not a code bug. Text is properly escaped (`escapeChatText`, `chatNotify.js:266-268`).
- Fix: show the target space name / a warning when notifying from a restricted project.

### L4 — Low — No top-level error boundary
- Where: `src/App.jsx:2117-2120` ErrorBoundary wraps only the main view (`:14060-14181`); `src/main.tsx` has none.
- Scenario: an exception in header, modals or My Work outside the boundary unmounts the whole tree → blank page.
- Fix: wrap `<App/>` in `main.tsx` with a boundary offering "Reload" and showing the save-banner state.

### L5 — Low — Dependencies
- `npm audit --omit=dev`: 3 (1 critical `websocket-driver` via `@firebase/database`→`faye-websocket`; 2 high `@grpc/grpc-js`, `protobufjs` via `@firebase/firestore`). These are Node-only code paths, not shipped in the browser bundle → low real impact; fixed by `npm audit fix` (non-breaking).
- Full `npm audit`: 59 (4 critical, 21 high) — all dev/CI tooling (firebase-tools, firebase-admin, vite/esbuild, vitest, eslint). Relevant one: `vite.config` has `server.host: true` with esbuild ≤0.24.2 (dev server readable by other sites/LAN) → set `host: false` or upgrade Vite.
- `npm outdated`: firebase 11.10 (latest 13.2), react 18.3 (19.3), vite 5.4 (8.3), lucide 0.400, firebase-admin 12 (14). No urgency; plan one upgrade PR after onboarding.
- `xlsx` 0.20.3 from `cdn.sheetjs.com` tarball (not npm, not covered by `npm audit`); 0.20.3 is the version with the prototype-pollution/ReDoS fixes. Lockfile pins integrity. Keep, watch SheetJS advisories manually.

### L6 — Low — CI hardening
- Where: `.github/workflows/ci.yml`. Actions pinned by tag (`@v4`), not SHA; no explicit `permissions:` block (repo default is `read`, verified via API — OK); no secrets used (good).
- Fix: add `permissions: contents: read`, pin actions by SHA, add `npm run build` and `npm audit --omit=dev --audit-level=high`.

### L7 — Low — Firestore rules deploy is a manual Console paste; no drift check
- Where: CLAUDE.md process; `firebase.json` is ready for `firebase deploy --only firestore:rules`.
- Scenario: pasting the rules from the wrong branch/working copy; no way to prove production == `main`.
- Fix: add a header comment with the git SHA in `firestore.rules` and a read-only script that fetches the released ruleset (Rules API) and diffs it with `main`.

### L8 — Low — `.gitignore` gaps
- Where: `.gitignore`. Covers `service-account.json`, `.env`, `.env.local`, `.env.*.local`, `.vercel`, `workspace_backup_*.json`, `backup*.json`, P1/P2 manifests and xlsx.
- Gaps: `.env.production` / `.env.development` (non-`.local`), generic `*.xlsx` exports (e.g. `CRP_2026-11-05.xlsx` from the Excel button, `p1-identity-mapping` covered, but project exports are not), `briefing-*.md`, `*-service-account*.json` variants are covered. Nothing sensitive is tracked now (`git ls-files` clean; history has no added xlsx/backup/manifest/.env files).
- Fix: add `.env*` with `!.env.example`, `*.xlsx`, `*.xls`, `briefing-*.md`.

### L9 — Low — Privacy at rest in the browser and directory
- `localStorage`: `user:local` = name + email (`storage-shim.ts:325-328`), cleared on sign-out (`App.jsx:13058`); per-uid current project & UI prefs remain — fine for company laptops.
- `users` directory: every domain user who signs in is upserted with name/email/photo/lastSeen and the collection is readable by all domain users (`data.ts:63-95`). Acceptable internally; mention in privacy page.
- Console: only `[storage shim] ... initialized` at `storage-shim.ts:737`; warnings log keys/pids, not emails. OK.

### L10 — Low — Bundle size
- Local build: `App-*.js` 1.07 MB (303 KB gzip), `index-*.js` 660 KB (173 KB gzip) → ~476 KB gzip JS. Fine on office network; `xlsx` could be dynamically imported only when exporting/importing. No sourcemaps shipped (`sourcemap: false`).

---

## Checked and found solid
- **XSS**: only one `dangerouslySetInnerHTML` (`App.jsx:1990`, copy-rich-text modal). All three HTML builders (action email `:4950-4990`, meeting minutes `:6150-6352`, weekly briefing `:12400-12500`) escape every user field with `escapeHtml` (`:1762-1770`, escapes `& < > " '`); remaining interpolations are numbers/constants. No `innerHTML`, `document.write`, `eval`, `new Function`, `insertAdjacentHTML` in shipped code. `window.open` not used; `openLinkInNewTab` only for Gmail URLs built with `URLSearchParams`; `rel="noopener noreferrer"` set.
- **Excel**: export uses `json_to_sheet`/`aoa_to_sheet` → strings are written as text cells, not formulas (no CSV export) → formula injection not exploitable on open. Import parses with SheetJS 0.20.3; reference URLs validated to http/https.
- **Chat card** text escaped; webhook prefix check `https://chat.googleapis.com/v1/spaces/` before every POST.
- **Secrets**: `git log -S` for `chat.googleapis.com/v1/spaces/`, `private_key`, `VERCEL_OIDC`, `AIza`, `client_secret`, `BEGIN PRIVATE` → only placeholders/docs mentions. No sensitive file ever added to history. Firebase web config is public by design.
- **Leftover files** in `src/` (`App.jsx.before-*.backup`, `App.secured-backup.jsx`, `CRP_Project_Tracker_v29_reference.jsx`, untracked `MyWorkViews.jsx`, tracked `CRPRaid.jsx`) are not imported by `main.tsx`/`App.jsx` → not bundled.
- **Headers** (`vercel.json`): CSP with `script-src 'self' apis.google.com www.gstatic.com` (no inline/eval), `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'`; HSTS 2y + preload; `X-Frame-Options: DENY`; `nosniff`; `Referrer-Policy strict-origin-when-cross-origin`; Permissions-Policy; COOP `same-origin-allow-popups` (needed for the Google popup). Minor: `'unsafe-inline'` for styles and the broad `www.gstatic.com` script host are accepted trade-offs.
- **Rules domain gate** requires `email_verified` + `@smartosc.com` on every path (full rules review is another reviewer's scope). Note for that reviewer: any domain user (not only roster members) may create projects (`firestore.rules:211`) and update non-owner fields of `workspaces/main` (`:114-117`).
- **P1/P2 Admin scripts** default to preview, require `--apply` (+ `--expect <hash>` for migrate/restore/assign), write manifests/before-images, and refuse when the key is missing.
- **Writes** use transactions with `rev`/`version` checks; quota/network pre-read errors abort instead of rebuilding ACLs (`persistence.js:5-7`).
- **GitHub Actions** default token permission is `read` (verified via API); no secrets in workflows.

## Not checked / out of reach
- Firebase Auth authorized domains and enabled providers (Console only).
- Vercel environment-variable scoping, Preview Deployment Protection, and whether previews are reachable/authorized.
- Actual per-project doc and activity counts in production (needed to size H1/H2 precisely).
