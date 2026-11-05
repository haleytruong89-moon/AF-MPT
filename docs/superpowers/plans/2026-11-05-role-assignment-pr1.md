# Role Assignment PR 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner sets PM / Deputy of a program and Owner or PM sets Sub-PM of a workstream from inside the app (v2 projects), with a confirm step, an Activity event, and pending close requests moved to the new approver.

**Architecture:** Pure logic in `src/roleAssign.js` (who may edit, picker list, validation, reroute plan, event text). One injected-Firestore executor `src/execRoleChange.js` (same pattern as `src/execV2Save.js`) does the role write in one transaction with a "changed since you looked" check; the shim wraps it and refreshes its `loaded` cache. The App wires a `changeRole` handler used by a `RolePicker` in Outline headers and by a new `RolesModal`. Reroute reuses `reassignClose` (`src/closeFlow.js:275`) and the normal v2 tree save. No rules change.

**Tech Stack:** React 18 (JSX, inline styles, `TOK` tokens), Firestore client SDK v11, vitest (unit), `@firebase/rules-unit-testing` (rules, CI only — no Java locally).

**Spec:** `docs/superpowers/specs/2026-11-05-role-assignment-design.md` (PR 1 = §6, §7, §9, §10 items 1–8; Replace person §8 is PR 2, not here).

## Global Constraints

- v2 projects only (`project.__v2` present). v1 projects: no pickers; Roles modal shows `Roles become available after this project is switched to v2.`
- Who edits: PM / Deputy = Owner only. Sub-PM = Owner, or PM / Deputy of that program who is active. View as (`me.readOnly`) = nobody (show `READ_ONLY_MESSAGE` from `src/closeWiring.js`).
- Picker: active directory people with a uid. Owner: all of them. PM / Deputy: only uids in the project's `memberUids`. Plus `None`.
- PM and Deputy of one program must differ: message `PM and Deputy must be different people.`
- Stale check message: `Someone changed this role. Reload to see it.`
- Success toast: `Saved. <name> should reload AF-MPT to get the new permissions.` (name of the newly assigned person; when cleared, `Saved.`)
- Reroute failure toast: `Role saved. <N> pending request(s) still point to <old name>; the PM or Owner can reassign them.`
- Activity: `type: 'role_changed'`, description `Role changed: <PM|Deputy|Sub-PM> of <scope name>, <old name or —> → <new name or —>`, `before: { uid }`, `after: { uid }`.
- Do not refactor `App.jsx`; additions only around the touched spots. `npm run lint` must not exceed 6 errors / 63 warnings.
- English UI copy, conventional commits, stage files by explicit path (never `src/MyWorkViews.jsx`, `Specs/`).
- No rules change. If a rules test in Task 3 fails because the rules deny a write this spec needs, stop and report — do not edit `firestore.rules`.

## Review Focus

1. A PM / Deputy trying to change PM / Deputy (UI must not offer it; the write must be denied) — covered by Task 1 `canEditRole` + Task 3 rules test.
2. Filling a blank Sub-PM moves requests that the PM / Owner currently holds down to the new Sub-PM, but leaves a request someone reassigned on purpose — Task 1 `reroutePlan` tests.
3. A new approver who is the requester or is inactive is skipped — Task 1 `reroutePlan` tests.
4. An Owner's stale tab whose tree save falls back to the whole `programMeta` map does not undo a PM set in another tab — Task 2.
5. Role write while an edit is still debounced: the edit is flushed first and survives; the role write never carries tree changes — Task 6.

---

### Task 1: Pure role logic (`src/roleAssign.js`)

**Files:**
- Create: `src/roleAssign.js`
- Test: `tests/unit/roleAssign.test.js`

**Interfaces:**
- Consumes: `eligibleApprovers(roles, taskId, requesterUid)` from `src/closeFlow.js:61`; roles shape from `rolesFromLoaded` (`src/readV2.js:64`): `{ ownerUids, programs: { [prgId]: { pmUid, deputyUid } }, workstreams: { [wsId]: { programId, leadUid } }, tasks: { [taskId]: { programId, workstreamId, picUid, contributorUids } } }`.
- Produces (all pure):
  - `change` shape: `{ kind: 'pm' | 'deputy' | 'lead', programId: string, wsId?: string, fromUid: string | null, toUid: string | null }`
  - `canEditRole(roles, me, kind, programId) -> boolean` — `me = { uid, isOwner, readOnly, isActive(uid) }`.
  - `pickerPeople({ dirEntries, memberUids, isOwner }) -> Array<{ uid, name, email }>` sorted by name; `dirEntries` items `{ uid, displayName, email, status }`; `status === 'deactivated'` excluded; entries without uid excluded.
  - `validateRoleChange(roles, change) -> string | null`.
  - `rolesAfter(roles, change) -> roles` (new object, input untouched).
  - `reroutePlan({ before, after, change, tasks, isActive }) -> Array<{ taskId, fromUid, toUid }>`; `tasks` = tree tasks `[{ id, status, closeRequest, closeRequestHistory }]`.
  - `roleChangeEvent(change, nameOf, scopeName) -> { type, description, before, after }`.
  - `rowsForRoles(project, roles) -> Array<{ kind: 'program', programId, name, pmUid, deputyUid } | { kind: 'ws', programId, wsId, name, leadUid }>` in tree order (`project.programs[].workstreams[]`).

- [ ] **Step 1: Write the failing tests** in `tests/unit/roleAssign.test.js` with a fixture: owner `o`, program `p1` (pm `pm1`, deputy `d1`), program `p2` (pm `pm2`), ws `w1` in `p1` (lead `l1`), ws `w2` in `p1` (lead null), ws `w3` in `p2`. Cases:
  - `canEditRole`: owner → true for pm/deputy/lead; `pm1` → false for `pm`/`deputy` on p1, true for `lead` on p1, false for `lead` on p2; `d1` → true for `lead` on p1; `l1` → false for `lead`; `pm1` inactive → false; any `readOnly` → false.
  - `pickerPeople`: owner gets all active with uid; PM gets only those in `memberUids`; deactivated and invite (no uid) excluded; sorted by name.
  - `validateRoleChange`: deputy = current pm → `'PM and Deputy must be different people.'`; pm = current deputy → same; `toUid === fromUid` → `'No change.'`; otherwise null.
  - `reroutePlan`:
    - (a) change lead of `w1` `l1 → x`: Submitted task in `w1` with approver `l1` → `{ toUid: 'x' }`.
    - (b) fill blank lead of `w2` with `x`: Submitted task in `w2` with approver `pm1` → moves to `x`.
    - (c) same as (b) but its `closeRequestHistory` has an entry `status: 'Reassigned'` → not moved.
    - (d) same as (c) but the current approver is the person who lost the role (change `l1 → x` on `w1`, history Reassigned, approver `l1`) → moved.
    - (e) new lead is the requester → next eligible (`pm1`), and if that equals current approver → no entry.
    - (f) new approver inactive → next active eligible.
    - (g) tasks outside scope (other ws / program) and non-Submitted tasks → ignored.
    - (h) pm change on `p1` `pm1 → y`: Submitted task in `w2` (no lead) approver `pm1` → `y`.
  - `roleChangeEvent`: `{ kind:'pm', fromUid:'pm1', toUid:'y' }` with names → description `Role changed: PM of CASH OUT, Lybk → Trangvk`; null side renders `—`; `before`/`after` carry `{ uid }`.
  - `rowsForRoles`: order and fields from a two-program tree.

- [ ] **Step 2: Run** `npx vitest run tests/unit/roleAssign.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/roleAssign.js`. Scope for `reroutePlan`: `pm`/`deputy` → tasks whose `after.tasks[id].programId === change.programId`; `lead` → `workstreamId === change.wsId`. New approver = `eligibleApprovers(after, id, cr.requestedByUid).find(isActive)`; skip when undefined or equal to the stored `approverUid`; skip a task whose history has `Reassigned` unless `cr.approverUid === change.fromUid`.

- [ ] **Step 4: Run** the test file — Expected: PASS. Run `npm test` — all pass.

- [ ] **Step 5: Commit** `feat(roles): pure role assignment logic` (files: `src/roleAssign.js`, `tests/unit/roleAssign.test.js`).

### Task 2: Stale Owner tab cannot undo a PM via the whole-map fallback

**Files:**
- Modify: `src/execV2Save.js` (inside the transaction, before `tx.update(projectRef, …)`)
- Test: `tests/unit/execV2Save.test.js`

**Interfaces:**
- Consumes: plan `metaPatch` with a whole `programMeta` key (from `programMetaPatch` fallback, `src/planV2Save.js:93`).
- Produces: unchanged `executeV2Save` signature.

- [ ] **Step 1: Failing test:** fake tx whose project snapshot has `programMeta: { 'p 1': { pmUid: 'B', deputyUid: 'D' } }` and a plan `metaPatch: { programMeta: { 'p 1': { pmUid: 'A', deputyUid: null, start: '2026-01-01' } } }`. Expect the `tx.update` payload's `programMeta['p 1']` to have `pmUid: 'B'`, `deputyUid: 'D'`, `start: '2026-01-01'`. A program in the patch but absent live keeps the patch's values. A program absent from the patch stays absent.
- [ ] **Step 2: Run** `npx vitest run tests/unit/execV2Save.test.js` — FAIL.
- [ ] **Step 3: Implement:** when `meta.programMeta` is a whole map, overlay `pmUid` / `deputyUid` of each program from `projectSnap.data().programMeta` (when the live entry exists and has the key). Comment: why (spec §7.1 known gap).
- [ ] **Step 4: Run** — PASS; `npm test` all pass.
- [ ] **Step 5: Commit** `fix(p2): whole programMeta save keeps live PM/Deputy`.

### Task 3: Role write executor + rules tests

**Files:**
- Create: `src/execRoleChange.js`
- Test: `tests/unit/execRoleChange.test.js` (fake tx), `tests/rules/role-assign.test.js` (emulator, CI)

**Interfaces:**
- Consumes: `change` from Task 1.
- Produces: `executeRoleChange(fs, { db, wid, pid, uid, change, addMemberUid }) -> Promise<{ status: 'ok' | 'changed' | 'conflict' | 'denied' | 'error', ws?: { version, data } }>`; `fs = { runTransaction, doc, serverTimestamp, arrayUnion }`.

Behaviour, one transaction:
- `tx.get(project)`; missing or `schemaVersion !== 2` → `conflict`.
- `pm`/`deputy`: `programId` must match `/^[A-Za-z0-9_-]+$/` else `error`. Live `programMeta[programId][pmUid|deputyUid] ?? null` !== `change.fromUid` → `changed`. `tx.update(project, { 'programMeta.<id>.<field>': toUid, updatedAt })`.
- `lead`: `tx.get(workstreams/{wsId})`; missing → `conflict`; live `leadUid ?? null` !== `fromUid` → `changed`; `tx.update(ws, { leadUid: toUid, version: v + 1, updatedBy: uid, updatedAt })`; return `ws: { version: v + 1, data: { ...live, leadUid: toUid, version: v + 1, updatedBy: uid } }`.
- `addMemberUid` (Owner only; caller decides): when not already in live `memberUids`, add to the project update `memberUids: arrayUnion(u)`, `memberIds: arrayUnion(u)`, and `'roles.<u>': 'member'` only if live `roles[u]` is absent.
- `permission-denied` → `denied`; other throw → `error`.

- [ ] **Step 1: Unit tests (fake tx)** for each branch above, including `changed` on both kinds, the member add (and no `roles.<u>` overwrite when present), and the unsafe id.
- [ ] **Step 2: Rules tests** in `tests/rules/role-assign.test.js`, seeding a v2 project like `tests/rules/v2-save-exec.test.js` (Owner, PM of p1, Deputy of p1, PM of p2, Sub-PM of w1, plain member, an active non-member). Through `executeRoleChange` with each user's client:
  - Owner sets pm, deputy, lead → ok; Owner sets lead with `addMemberUid` of the non-member → ok and the non-member can then read the project.
  - PM of p1 sets lead of a p1 ws → ok; Deputy of p1 → ok.
  - PM of p1 sets pm or deputy of p1 → denied; sets lead of a p2 ws → denied; with `addMemberUid` → denied.
  - Sub-PM sets lead of own ws → denied; plain member → denied.
  - Deactivated PM sets lead → denied.
- [ ] **Step 3: Run** `npx vitest run tests/unit/execRoleChange.test.js` — FAIL, implement, PASS. Rules tests run on CI only (`npm run test:rules` needs Java); push the branch and check CI.
- [ ] **Step 4: Commit** `feat(roles): role change executor with stale check` (+ tests). If a rules test fails on CI because the rules deny a spec'd write, stop and report (Global Constraints).

### Task 4: Shim wrapper and member list for the App

**Files:**
- Modify: `src/storage-shim.ts` (new export near `v2RolesNow`; load path near line 115)
- Test: covered by Task 3 unit + Task 6 manual; add a `readV2` unit test only if `appValueFromV2` changes.

**Interfaces:**
- Produces: `export async function changeRoleV2(pid: string, change, opts: { addMemberUid?: string }) -> Promise<'ok' | 'changed' | 'conflict' | 'denied' | 'error'>`; `export function v2MemberUidsNow(pid: string): string[]`.

- [ ] **Step 1:** `changeRoleV2` calls `executeRoleChange` with the app SDK (`runTransaction, doc, serverTimestamp, arrayUnion`), uid from `getUser()`, and runs inside `projectWriteQueue` for that pid (so it never interleaves with a tree save of the same project). On `ok`, update `v2Loaded.get(pid)`: `meta.programMeta[prg][field] = toUid` or `docs.workstreams.set(wsId, ws)`; on member add, add to `meta.memberUids`.
- [ ] **Step 2:** `v2MemberUidsNow(pid)` returns `loaded.meta.memberUids` (array copy, `[]` if absent).
- [ ] **Step 3:** `npm run typecheck && npm test` — pass.
- [ ] **Step 4: Commit** `feat(roles): shim changeRoleV2 and member list`.

### Task 5: `RolePicker` and Outline headers

**Files:**
- Create: `src/components/RolePicker.jsx`
- Modify: `src/App.jsx` — `OutlineView` program header (around the `pg.name` span, ~line 7214) and workstream header (around `ws.name`, ~line 7256); pass new props from the `<OutlineView … />` call (~line 13973).

**Interfaces:**
- Consumes: `canEditRole`, `pickerPeople` (Task 1); `onChangeRole(change)` from Task 6.
- Produces: `<RolePicker label="PM" | "Deputy" | "Sub-PM" valueUid={string|null} editable={bool} people={[{uid,name}]} nameOf={fn} isActive={fn} blankText={string} onPick={(toUid) => void} />`. Not editable → text `PM: <name>` (or `PM: <blankText>`), inactive person gets an `inactive` badge. Editable → compact `<select>` styled like the CloseControl reassign select (`src/components/CloseControl.jsx`), options `None` + people; when the current uid is not in `people` (inactive or non-member), it still shows as the selected option.
- OutlineView gets props `roles`, `me`, `people`, `onChangeRole`; renders pickers only when `project.__v2`. Blank text: program PM/Deputy `— (Owner decides)`, workstream `— (PM decides)`.

- [ ] **Step 1:** Build `RolePicker` (no test file; logic lives in Task 1). Respect `prefers-reduced-motion` n/a; give the select an `aria-label` like `PM of CASH OUT`.
- [ ] **Step 2:** Insert pickers in both headers; header row must still fit (the pickers sit after the name, before `WeightBadge`, `flex-wrap` allowed).
- [ ] **Step 3:** `npm run build && npm run lint` — build ok, lint not above baseline.
- [ ] **Step 4: Commit** `feat(roles): role pickers in Outline headers`.

### Task 6: `changeRole` flow in `App()`

**Files:**
- Modify: `src/App.jsx` (`App()`, near `runV2CloseNow` ~line 13040)

**Interfaces:**
- Consumes: Tasks 1, 4; existing `rolesNowFor`, `refreshV2Roles`, `flushProjectSave`, `v2SavedTree`, `replaceTask`, `saveProject`, `logActivityForProject`, `dialogs.confirm`, `meRef`, `dirEntries`.
- Produces: `changeRole(projectId, change)` passed to OutlineView (Task 5) and RolesModal (Task 7).

Flow:
1. `meRef.current.readOnly` → toast `READ_ONLY_MESSAGE`, stop. `canEditRole` false → stop.
2. `before = rolesNowFor(pid)`; `validateRoleChange` → toast message, stop.
3. `after = rolesAfter(before, change)`; `moves = reroutePlan({ before, after, change, tasks: all tasks of v2SavedTree(pid), isActive })`.
4. Owner and `toUid` not in `v2MemberUidsNow(pid)` → `addMemberUid = toUid`.
5. `dialogs.confirm({ title: 'Change role?', message: lines: '<Role> of <scope>: <old> → <new>', then 'N pending request(s) will move to <names>.' when moves, then '<name> is not a member of this project and will be added.' when addMemberUid, okLabel: 'Save' })`. Cancel → stop.
6. `await flushProjectSave(pid)`; then `status = await changeRoleV2(pid, change, { addMemberUid })`. `changed` → toast stale message; `denied`/`conflict`/`error` → toast `Role not saved (<status>). Reload and try again.`; stop.
7. `refreshV2Roles(pid)`; `logActivityForProject(pid, roleChangeEvent(...))`.
8. If moves: `saved = v2SavedTree(pid)`; for each move `t = reassignClose({ roles: rolesNowFor(pid), task, me, toUid, now })`; `tree = replaceTask(...)` per non-null `t`; `status = await saveProject(tree)`; update in-memory tasks like `setTaskNow`. Not `ok` (or any `t` null) → reroute failure toast. Log the close events with `closeEventsFor` the same way `runV2CloseNow` does.
9. Success toast (Global Constraints).

- [ ] **Step 1:** Implement; keep `changeRole` a `useCallback` with refs like `runV2CloseNow`.
- [ ] **Step 2:** `npm run build && npm test && npm run lint` — pass / baseline.
- [ ] **Step 3:** Manual check on `npm run dev` is not possible against production rules from a branch; leave the smoke test to HOD after deploy (spec §10). Note this in the report.
- [ ] **Step 4: Commit** `feat(roles): change role flow with reroute and activity`.

### Task 7: `RolesModal` (whole-project table)

**Files:**
- Modify: `src/App.jsx` — new `function RolesModal(...)` near `ProjectSettingsModal` (~line 14282); a `Roles…` item in the project menu next to `Project settings…` (~line 13825), visible to every reader of a v2 or v1 project.

**Interfaces:**
- Consumes: `rowsForRoles` (Task 1), `RolePicker` (Task 5), `changeRole` (Task 6).
- Produces: `<RolesModal project roles me people onChangeRole onClose />`.

- [ ] **Step 1:** v1 project → body is the single line `Roles become available after this project is switched to v2.` v2 → table: program rows (name, PM picker, Deputy picker), workstream rows indented (name, Sub-PM picker). Filters (checkboxes): `Blank roles only`, `Inactive people only`. Uses the app `Modal` (Esc closes).
- [ ] **Step 2:** `npm run build && npm run lint`.
- [ ] **Step 3: Commit** `feat(roles): Roles modal for the whole project`.

### Task 8: Docs and PR

**Files:**
- Modify: `CLAUDE.md` (Current Status line for role assignment PR 1; Rollback row `Gán vai trò sai` → set it back in the app or `p2-assign`; Activity shows before/after)
- Modify: `docs/superpowers/specs/2026-11-05-role-assignment-design.md` §6.2: Roles is a `Roles…` modal from the project menu, not a Project Settings tab (Project Settings is Owner-only; PMs need the table).

- [ ] **Step 1:** Edit both docs.
- [ ] **Step 2:** `npm run build && npm test`; push; wait for CI green (unit + rules).
- [ ] **Step 3: Commit** `docs(roles): status, rollback, Roles modal placement`; open the PR with: what changes, no rules change, no data written by merging, smoke test = spec §10 items 1–8, rollback = Vercel Promote + `git revert`.
