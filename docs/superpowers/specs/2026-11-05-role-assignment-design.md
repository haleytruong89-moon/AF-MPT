# Role assignment in the app (PM, Deputy, Sub-PM) — design

- Date: 05/11/2026
- Status: approved by HOD in chat (05/11/2026); builder check done, calls listed in §13
- Parent spec: `docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md` (§4 role matrix, lines 66–67)
- Visual summary shown to HOD: artifact "AF-MPT Role Assignment" (https://claude.ai/artifact/GDaHx1yyRArM2EWL5pp6QM)

## 1. Why

Since P2.4, PM / Deputy (per program) and Sub-PM (per workstream) drive who may edit and who approves. Today they can only be set with `scripts/p2-assign.mjs` (Excel → preview → `--apply --expect`). HOD has to ask for a script run every time someone changes job, goes on leave, or a new project starts (2027 projects soon). The rules already allow the writes; only the screens are missing.

## 2. Goals

1. Owner sets **PM** and **Deputy** of any program from inside the app.
2. Owner, or the PM / Deputy of the program, sets the **Sub-PM** of a workstream from inside the app.
3. One screen shows every role in a project, so HOD can review a whole project at once (start of year, after someone leaves).
4. Every change is logged in Activity, and pending approvals follow the new person.
5. **Replace person** (Owner only): move one person's roles and open work in one project to another person, with a preview.

## 3. Non-goals

- No new "Project PM" / "Project Lead" role. At project level the Owner rules; the member list decides who can see the project.
- No change to who can assign task PIC / contributors (already in the app: Owner, PM, Sub-PM; frozen while Submitted / closed).
- No UI for workspace Owners (`ownerUids`); stays a script.
- No role assignment for v1 projects (MA, CRP, UBO, AF Lean until wave 2). They show a note instead.
- No bulk Excel upload in the app (P3.3 deferred); the script stays as the bulk path.
- No refactor of `App.jsx` beyond what these screens need.

## 4. Anti-goals (a failure even if it works)

- Someone gains power over their own level: a PM changing PM / Deputy of their own program, or anyone making themselves approver of their own request.
- A pending request stuck with an approver who can no longer decide it.
- A person assigned to a restricted project they cannot open.
- A role change silently lost (stale tab, failed write without a visible message).
- An old tab overwriting a role set by someone else (the problem P3.1 fixed for `p2-assign`).

## 5. Who may assign what (decided)

| Assign | Owner | PM / Deputy of the program | Sub-PM | Assignee |
|---|---|---|---|---|
| Project member (who can see) | ✓ (existing Members modal) | – | – | – |
| PM / Deputy of a program | ✓ | – | – | – |
| Sub-PM of a workstream | ✓ | ✓ own program only | – | – |
| Task PIC / contributors | ✓ | ✓ | ✓ own WS | – (unchanged) |
| Reassign a pending request | ✓ | ✓ (unchanged, P3.1) | – | – |
| Replace person | ✓ | – | – | – |

Principles (HOD approved): each level assigns the level directly below; the Owner overrides everything; nobody raises their own power; a blank role passes approval up (Sub-PM → PM/Deputy → Owner).

**Members (HOD decision, option A):** only the Owner adds project members. A PM's picker lists only people who are already members of the project and active in the directory. To use someone new, the PM asks the Owner.

## 6. Where it appears

### 6.1 Inline, in the project tree (v2 projects)

- Program header: `PM: <name> ▾` and `Deputy: <name> ▾`. Editable control only for the Owner; everyone else sees the names as text.
- Workstream header: `Sub-PM: <name> ▾`. Editable for the Owner and the PM / Deputy of that program; text for everyone else.
- Blank shows as `— (PM decides)` / `— (Owner decides)` so people understand where approval goes.
- An inactive person shows their name with an `inactive` badge.

### 6.2 Project Settings → Roles tab (v2 projects)

- One table: each program row (PM, Deputy), its workstreams indented under it (Sub-PM).
- Filters: "blank roles", "inactive people".
- Same pickers and same permissions as inline (a PM sees the table and can edit only Sub-PM cells of their programs).
- v1 project: the tab says "Roles become available after this project is switched to v2" and nothing else.

### 6.3 Picker

- Owner: any **active** person in the directory (`workspaces/main/members`). If the chosen person is not a project member, the save also adds them to the project (`memberUids` and the existing member fields, same as the Members modal) and the confirmation says so.
- PM / Deputy: active directory people who are already project members (§5, option A).
- Project member = uid in `memberUids`, also for `department` projects (call: one rule for all projects).
- Search by name / email; stores the uid. "None" clears the role.
- Validation: PM and Deputy of one program must be different people. A PM may set themselves as Sub-PM (allowed; their own tasks then go to the Deputy or Owner).

### 6.4 Confirmation before save

A small confirm panel (no browser `confirm()`), e.g.:

> PM of CASH OUT: Lybk → Trangvk
> 2 pending requests will move to Trangvk.
> Trangvk is not a member of this project and will be added. (Owner only)

## 7. Behaviour

### 7.1 Write path

- Role changes do **not** go through the tree save (`planV2Save` keeps `pmUid` / `deputyUid` / `leadUid` from the stored doc via `KEEP_PROGRAM` / `KEEP_WS`; that stays). They use a separate, small write in the storage layer (`src/storage-shim.ts` side).
- **Known gap to close in PR 1:** `programMetaPatch` (src/planV2Save.js:93) falls back to writing the whole `programMeta` map when a program id or field is not a plain segment. An Owner's stale tab could then overwrite a `pmUid` / `deputyUid` set by another tab. In that fallback, the executor must take `pmUid` / `deputyUid` of every program from the live project doc read inside the transaction. Deleting `programMeta.<id>` when a program is removed is fine (the program is gone).
- PM / Deputy: one transaction on the project doc updating only `programMeta.<programId>.pmUid` / `.deputyUid` (dotted field path, same pattern as `programMetaPatch` / `p2-assign`) plus `updatedAt`. Inside the transaction, compare the live field value with the value the user saw; if different, stop with "Someone changed this role. Reload to see it." This check is client-side only: v2 project writes carry no version stamp and the rules let the Owner update freely. That is accepted (only Owners write these fields).
- Sub-PM: one transaction on `workstreams/{wsId}`: `leadUid`, `version + 1`, `updatedBy = me`, with the same "changed since you looked" check.
- Owner adding a member: in the same transaction as the role change where possible; otherwise first, then the role.
- After success: refresh the in-memory roles (`v2RolesNow`) so buttons and approver routing update without reload.

### 7.2 Activity

One v2 activity event per change, `type: 'role_changed'`, e.g. `Role changed: PM of CASH OUT, Lybk → Trangvk`, with `before` / `after` uids, `authorUid`, `createdAt = serverTimestamp()` (existing activity rules).

### 7.3 Pending approvals follow the new person

After the role write commits (separate write, because the rules check eligibility against the stored roles):

- **Close requests.** For each **Submitted** task in the affected scope (the program for PM / Deputy, the workstream for Sub-PM), recompute the approver a new request would get under the new roles (`directApprover` in `src/closeFlow.js`). If it differs from the stored `closeRequest.approverUid`, reassign to it with a `Reassigned` history entry, through the existing P3.1 reassign path. This covers both a replaced person and a role filled from blank (requests held by the PM or Owner move down to the new Sub-PM / PM). **Exception (call):** a request whose history already has a `Reassigned` entry (someone moved it on purpose) is left alone unless its approver is the person who just lost the role.
- **Inactive approver (call):** when computing the new approver, a person who is inactive in the directory counts as not eligible (client side only; the rules already deny an inactive person any manager power, firestore.rules:323-352, so no rules change).
- If the new approver would be the requester, the next eligible approver is used (never self-approval).
- **Approval docs (`approvals/{reqId}`).** Only `mitigation_done` requests can move (`plan_import` and `scope_deadline` always go to an Owner, rules:1217-1221, 1303-1304). A PM / Deputy change recomputes them with `mitigationApprover` (src/closeFlow.js:404); a Sub-PM change touches none.
- **Requests the old person filed themselves** (call): unchanged. They already point to someone above that person, which stays valid.
- Who performs the reroute: the person who changed the role (Owner, or the PM when the PM changed a Sub-PM). Reassign is PM / Deputy / Owner only (rules:756-761), which matches who can change roles.
- If a reroute write is denied or fails: the role change stays; show "Role saved. N pending requests still point to <old person>; the PM or Owner can reassign them." and list them. No silent failure.
- Without reroute, nothing unsafe happens (a former Sub-PM loses the manager branch and cannot decide), but the request would stall; the reroute removes the stall.

### 7.4 Who sees the change

The person who gains or loses a role gets the new permissions after their tab reloads its roles. Show the saver a toast: "Saved. <name> should reload AF-MPT to get the new permissions." (Same caveat as today's script.)

## 8. Replace person (Owner only, second PR)

- Entry: Project Settings → Roles → "Replace person…".
- Input: from X (any person appearing in the project, active or not) → to Y (active directory person; added as member if needed).
- Preview lists, per item, what moves:
  - PM / Deputy of programs, Sub-PM of workstreams;
  - PIC of open tasks (Planned / InProgress) and open actions;
  - contributor slots on open tasks;
  - pending requests where X is the approver (rerouted as in 7.3).
- **Not moved** and listed as such: Completed / Dropped tasks (credit history stays with X), Submitted tasks where X is the requester or PIC (frozen fields; decide or withdraw first), RAID / decisions authorship, activity.
- Membership (call): Replace person does not remove X from the project. The preview offers a checkbox "Also remove X from project members" (default off); for someone who left, deactivating them in the directory already removes all write power.
- Apply in as few transactions as the 500-write limit allows; one activity event summarising counts (`person_replaced`), plus the per-role `role_changed` events.
- On partial failure: report what moved and what did not; a second run picks up the rest (idempotent: it only moves items still on X).

## 9. Rules

Expected: **no rules change.** Today:
- `programMeta` is Owner-only (`ownerOnlyProjectKeys`).
- `wsUpdateOk` lets the program's PM change `leadUid` (not `programId` / `start` / `end`).
- Activity create is open to readers authoring their own event.
- Close-request reassign and approvals reassign exist (P3.1).

The builder must confirm each write in §7–§8 with emulator tests (`tests/rules/`), including the denials: PM changing `pmUid` / `deputyUid`; PM setting Sub-PM in another program; Sub-PM setting Sub-PM; non-member reading after being assigned by a PM (must not happen because the picker excludes them). If a rules change turns out necessary, it follows the normal gate (CI green, previous rules kept for rollback).

## 10. Acceptance (smoke test on AF 2026 Operation / Treasury 2026, real accounts)

1. HOD changes PM of a program inline; Activity shows `role_changed`; the old PM loses edit on that program after reload; the new PM gains it.
2. A pending close request with the old Sub-PM as approver moves to the new Sub-PM; the new Sub-PM approves.
3. Lybk (PM of CASH OUT) sets a Sub-PM on a CASH OUT workstream; cannot see an editable PM / Deputy control; cannot edit Sub-PM in a program where they are not PM.
4. Lybk's picker shows only project members; HOD's picker shows all active people and adds a non-member with a visible note.
5. Two tabs: tab A changes a Sub-PM; tab B (stale) changes the same Sub-PM → refused with the reload message; tab B's ordinary task edits do not undo A's change.
6. Roles tab lists every program and workstream, filters blank and inactive.
7. View as: everything read-only, no role writes.
8. v1 project: no pickers; the Roles tab shows the note.
9. Replace person (second PR): preview for Vannh → someone on a project lists exactly the open items; apply; rerun shows nothing left.

## 11. Rollback

- Code: Vercel → Promote previous deployment, then `git revert` the merge.
- Data: each role change is one field with before/after in Activity; set it back in the app (or with `p2-assign` for many). No data migration in this work.
- Before deploy, HOD exports Backup JSON + Excel (this work writes production data through normal use).

## 12. Phasing

- **PR 1:** inline pickers + Roles tab + confirm panel + activity + reroute of pending requests (+ Owner adds member from picker).
- **PR 2:** Replace person.

## 13. Calls made after the builder check (HOD may override)

1. Filling a blank role or changing a role moves pending close requests in scope to the new approver; manually reassigned requests stay unless their approver lost the role.
2. Inactive people are never chosen as the new approver (client side).
3. "Project member" for the PM's picker = `memberUids`, in every project.
4. Requests the old person filed stay as they are.
5. Replace person keeps X as a member unless the Owner ticks "Also remove".

## 14. Left to the builder

- Exact placement and styling of the header pickers (reuse the existing person picker used for task PIC if it fits).
- Which stamp the project doc carries for the dotted `programMeta` update (follow what P3.1 / `p2-assign` already do).
- Transaction grouping for reroute and Replace person, within Firestore limits (500 writes, rules get() budget per write).
- Whether the Roles tab and inline pickers share one component (expected).
