# Wave 1 — hardening + daily UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AF-MPT safe and understandable for first-week users: no one-click data loss, approval flow visible and notified, role-aware UI, save/load feedback.

**Architecture:** Small pure helpers in new `src/*.js` modules (unit-tested with vitest), wired into the `src/App.jsx` monolith with minimal edits. Two rules changes (H4, H5) with emulator tests on CI. Six stacked PRs (A→F), each mergeable alone in order.

**Tech Stack:** React 18 + Vite, Firestore client SDK v11, vitest (unit, `tests/unit/`), `@firebase/rules-unit-testing` on CI (`tests/rules/`).

**Spec:** `docs/superpowers/specs/2026-11-11-wave1-hardening-ux-design.md`

## Global Constraints

- No mass refactor of `src/App.jsx`; each change minimal and revertible. Match surrounding style (inline styles with `TOK`, `Btn`, `useCallback`).
- Code, comments, commit messages in English; conventional commits (`feat(scope):`, `fix(scope):`). Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stage files by explicit path only. Never stage `src/MyWorkViews.jsx`, `Specs/`, `service-account.json`, backups, xlsx, manifests.
- Lint must not exceed 6 errors / 63 warnings. `npm run build` and `npx vitest run` pass before each commit.
- No Firestore production writes, no rules publishing (HOD publishes after merge).
- Exact UI copy (verbatim):
  - H1: `Move or drop its tasks first. Dropped tasks keep their history.`
  - H2: `This project uses the new storage. Ask the Owner to restore it with the restore script (no data is deleted that way).`
  - H6: `Couldn't load AF-MPT — check your connection.` + button `Retry`
  - U2 tag: `Waiting N working days — escalated` (N = number)
  - U4: `Outside the work stream dates (<start> – <end>). Use Request change.`
  - U9: chip `Saving…` / `Saved hh:mm` / `Not saved — Retry`; load banner `Couldn't load <name> — Retry`
  - U1 section titles: `Needs my approval`, `Sent for approval`
  - U6 chip: `Your role: <role>`; `View only`
  - H4 (no eligible approver): `No one else can approve this — set a Deputy or another PM`
- Working days = Mon–Fri in the browser's local time zone, no holidays. Escalation threshold = 3.

## Review Focus

1. A v1 project read failing at the moment of an activity append must never write a shorter log (H3) — test the error branch explicitly.
2. `users/{uid}` docs created before H5 may carry extra keys; the sign-in upsert (`setDoc` merge) must still pass — rules must check *changed* keys on update, all keys on create.
3. Escalation on a weekend: a request made Friday must not escalate before Wednesday; one made Saturday counts from Monday.
4. A task panel opened for a task whose work stream has no dates: PM/Sub-PM may set any date (null bound = no limit, same as rules `withinWs`).
5. Deep link to a task the user cannot read (restricted project): opens nothing, shows no error page, clears the params.

## Execution rulings (controller)

- **Ruling W1-1 (H4 scope):** spec §8 call 3 applies no-self-approval to Owners too, which contradicts the earlier P3-C3 ruling and would leave HOD's own tasks (HOD = PM, no Deputy, only Owner) with no approver. This plan implements H4 for **non-Owner managers** (closes review finding A-3). The Owner part is held for HOD confirmation; it is a separate follow-up commit if confirmed.
- **Ruling W1-2:** activity loading moves to PR-C (U9) with the lazy loader; PR-A only changes how appends write.

---

## PR-A — data safety (branch `feat/w1-a-data-safety`, from `docs/spec-wave1`)

### Task A1: No delete of a program / work stream that has tasks; no in-app restore of v2

**Files:**
- Create: `src/treeGuards.js`, `tests/unit/treeGuards.test.js`
- Modify: `src/App.jsx` — `MindMapView.actDelete` (~6704), `OutlineView.deleteProgram` (~6946), `OutlineView.deleteWorkstream` (~6972), the Restore handler (grep `Restore` near ~13818)

**Interfaces — Produces:**
- `taskCountUnder(node: {workstreams?, tasks?}): number` — counts every task (any status) under a program or work stream.
- `DELETE_HAS_TASKS_MESSAGE: string`, `V2_RESTORE_MESSAGE: string` (copy from Global Constraints).

- [ ] **Step 1: Write failing tests**
```js
import { taskCountUnder, DELETE_HAS_TASKS_MESSAGE, V2_RESTORE_MESSAGE } from '../../src/treeGuards.js';
it('counts tasks under a program across work streams, dropped included', () => {
  expect(taskCountUnder({ workstreams: [{ tasks: [{ status: 'Dropped' }] }, { tasks: [{}, {}] }] })).toBe(3);
});
it('counts tasks under a work stream', () => { expect(taskCountUnder({ tasks: [{}] })).toBe(1); });
it('is 0 for empty / missing', () => { expect(taskCountUnder({})).toBe(0); expect(taskCountUnder({ workstreams: [{}] })).toBe(0); });
it('has the spec copy', () => {
  expect(DELETE_HAS_TASKS_MESSAGE).toBe('Move or drop its tasks first. Dropped tasks keep their history.');
  expect(V2_RESTORE_MESSAGE).toMatch(/^This project uses the new storage\./);
});
```
- [ ] **Step 2:** `npx vitest run tests/unit/treeGuards.test.js` → FAIL (module missing).
- [ ] **Step 3:** Implement `src/treeGuards.js`.
- [ ] **Step 4:** Wire: in the three delete functions, before the confirm, `if (taskCountUnder(node) > 0) { await dialogs.alert?.(...) ?? showToast }` — use whichever info dialog `useDialogs` offers (check `dialogs` API; fall back to `dialogs.confirm` with a single OK only if no alert exists) with title `Can't delete` and `DELETE_HAS_TASKS_MESSAGE`; return without changes. In the Restore handler, when the target project is v2 (`__v2` on the loaded project or `schemaVersion === 2` in the backup's project), show `V2_RESTORE_MESSAGE` and return before any write.
- [ ] **Step 5:** `npx vitest run && npm run build && npm run lint` → pass, lint ≤ baseline.
- [ ] **Step 6:** Commit `fix(tree): block deleting a program or work stream that has tasks; no in-app restore for v2`.

### Task A2: Activity appends never wipe the log

**Files:**
- Create: `src/activityLog.js`, `tests/unit/activityLog.test.js`
- Modify: `src/App.jsx` — `loadActivity`/`appendActivity` (~1556), `logActivity` and `logActivityForProject` (~13021–13046)

**Interfaces — Produces:**
- `planActivityAppend({ v2: boolean, read: Array|null, pending: Array, entry: object, cap = 500 }) -> { write: Array|null, pending: Array, display: Array|null }`
  - v2 → `write: [entry]`, `pending: []`, `display: null` (caller prepends `entry` to its in-memory list).
  - v1, `read === null` (read failed) → `write: null`, `pending: [entry, ...pending]`, `display: null`.
  - v1, read ok → merged `[entry, ...pending, ...read].slice(0, cap)` as both `write` and `display`, `pending: []`.
- In `App.jsx`: `loadActivityStrict(id)` — returns the parsed array, or `null` when the shim read failed (the shim returns `'[]'` for a missing log, so `null` from `sgetShared` means an error). `appendActivity(id, e, { v2 })` runs through a module-level `createKeyedQueue()` (from `src/persistence.js`) keyed by project id, keeps `pending` per project in a module-level `Map`, and returns `display` (or `null`).

- [ ] **Step 1: Failing tests** for the three branches above, plus: cap trims to 500; pending order is newest first; v2 never includes `read` in `write`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement `planActivityAppend`.
- [ ] **Step 4:** Wire `appendActivity`. `logActivity`: if the result is `null` and the project is v2, `setActivity((prev) => [entry, ...prev])`; if a display list came back, `setActivity(display)`; if `null` on v1, leave the list as is. `logActivityForProject`: same, only when `projectId === currentId`, and drop its second `loadActivity` call. v2 detection: `projectsRef.current[id]?.__v2`.
- [ ] **Step 5:** tests + build + lint.
- [ ] **Step 6:** Commit `fix(activity): appends never rewrite the log after a failed read; v2 appends write one event`.

### Task A3: A failed start-up read never seeds

**Files:**
- Create: `src/bootLoad.js`, `tests/unit/bootLoad.test.js`
- Modify: `src/storage-shim.ts` (catch of `get`, ~488), `src/App.jsx` load-on-mount effect (~12673), render of the loading state

**Interfaces — Produces:**
- `loadMetaStrict(storage: { get(key, shared) }) -> Promise<{ status: 'ok' | 'missing' | 'error', meta: object|null }>`: `get` resolving `null` → missing; resolving a value → ok (parse failure → error); throwing → error.
- Shim: for key `workspace:meta`, a read error is re-thrown instead of returning `null` (other keys unchanged).

- [ ] **Step 1: Failing tests** with fake storages: resolves null → missing; resolves `{value:'{"a":1}'}` → ok + meta; throws → error; bad JSON → error.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** shim rethrow (check every caller of `get('workspace:meta')` — `sgetShared` already catches, so other paths still see `null`). App: replace `loadMeta()` in the mount effect with `loadMetaStrict(window.storage)`; on `error` set `bootError` and `setLoading(false)` and return (no seed, no write); seed only on `missing`. Render: when `bootError`, a centred panel with `Couldn't load AF-MPT — check your connection.` and a `Retry` button (`window.location.reload()`).
- [ ] **Step 5:** tests + build + lint. **Step 6:** Commit `fix(boot): a failed workspace read shows Retry and never seeds`.

## PR-B — rules (branch `feat/w1-b-rules`, from PR-A)

### Task B1: A non-Owner manager never decides a close request on a task they are PIC of (H4, Ruling W1-1)

**Files:**
- Modify: `firestore.rules` (`canDecide` ~679, `eligibleWith` ~662), `src/closeFlow.js` (`eligibleApprovers`, `canDecideClose`), `tests/unit/closeFlow.test.js`
- Create: `tests/rules/w1-self-approval.test.js` (reuse `tests/rules/helpers.js` and the P3 fixtures in `tests/rules/p3-scenarios.js`)

**Interfaces:** `eligibleApprovers` never returns the task's `picUid` among lead / PM / Deputy candidates (Owners unchanged). `canDecideClose(roles, task, uid)` returns `false` for a non-Owner whose uid is the task's `picUid`. When `eligibleApprovers` is empty for a non-Owner requester, Submit shows `No one else can approve this — set a Deputy or another PM` (wire where Submit computes `directApprover`).

- [ ] **Step 1: Failing unit tests** (closeFlow): PM who is PIC is not in `eligibleApprovers` for a Sub-PM's request; `canDecideClose` false for PM-PIC with approverUid = PM; true for the PM when PIC is someone else; Owner-PIC still true.
- [ ] **Step 2: Failing rules tests:** Sub-PM submits PM's task naming PM → denied; naming Deputy → allowed; PM-PIC approves via `approverUid` → denied; PM-PIC approves via PM branch → denied; Deputy approves → allowed; Owner approves own-PIC task → still allowed (W1-1).
- [ ] **Step 3:** Rules: `eligibleWith` add `a != d.get('picUid', null)` on the non-Owner branch; `canDecide` add `resource.data.get('picUid', null) != request.auth.uid`. Watch the expression budget (see `tests/rules/v2-p3-owner-budget.test.js` / `v2-p3-headroom.test.js` — keep them green).
- [ ] **Step 4:** Client mirrors + the empty-approver message.
- [ ] **Step 5:** `npx vitest run`, build, lint; push and confirm CI rules job green (no local Java).
- [ ] **Step 6:** Commit `fix(rules): a PM or Sub-PM never decides a close request on their own task`.

### Task B2: User-directory entries pinned to the signed-in account (H5)

**Files:**
- Modify: `firestore.rules` (`/workspaces/main/users/{uid}` ~1356), `src/data.ts` (`useUserDirectory` ~79: set `uid` from `d.id`)
- Create: `tests/rules/w1-users-dir.test.js`

- [ ] **Step 1: Failing rules tests:** create own doc `{uid, email (= token email), name, photo, lastSeen}` → allowed; other uid → denied; own uid with another email → denied; `uid` field ≠ doc id → denied; extra key on create → denied; update of an existing doc that has a legacy extra key, changing only `name` / `lastSeen` → allowed; update adding a new key → denied; update changing `email` to another → denied.
- [ ] **Step 2:** Rules: `allow create: if isSmartOSC() && request.auth.uid == uid && userDirOk(request.resource.data) && request.resource.data.keys().hasOnly(['uid','email','name','photo','lastSeen'])`; `allow update: if isSmartOSC() && request.auth.uid == uid && userDirOk(request.resource.data) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['uid','email','name','photo','lastSeen'])`; `userDirOk(d) = d.get('uid', null) == uid && d.get('email', null) == request.auth.token.email`. Read unchanged.
- [ ] **Step 3:** `data.ts`: directory entries take `uid` from the doc id.
- [ ] **Step 4:** build, tests, CI green. **Step 5:** Commit `fix(rules): user directory entries must match the signed-in account`.

## PR-C — speed + feedback (branch `feat/w1-c-speed-feedback`, from PR-B)

### Task C1: Parallel project load, lazy activity, load-failure banner

**Files:** Modify `src/App.jsx` (mount effect ~12692, `switchProject` ~13645, Dashboard/Activity render), `src/persistence.js` (+ test)

**Interfaces — Produces:** `loadFailures(ids: string[], results: Array<object|null>) -> string[]` (ids whose result is null) in `src/persistence.js`.
- [ ] **Step 1:** failing test for `loadFailures`.
- [ ] **Step 2:** Mount: `Promise.all(m.projectIds.map(loadProject))`; failed ids into state `loadFailed`; do not load activity here. `switchProject`: no `loadActivity`. Add an effect: when `view` is `dashboard` or `activity` and `currentId` is a real project and activity for it is not loaded, `loadActivityStrict(currentId)` → `setActivity(list || [])` and remember the loaded id; reset the remembered id on project switch.
- [ ] **Step 3:** Banner under the header when `loadFailed.length`: `Couldn't load <name> — Retry` per project (`meta.names[id]`); Retry re-runs `loadProject` for those ids and merges successes.
- [ ] **Step 4:** tests, build, lint. **Step 5:** Commit `perf(load): load projects in parallel, activity on demand; show failed loads with Retry`.

### Task C2: Save chip with Retry and auto-retry when back online

**Files:** Modify `src/persistence.js` (+ tests), `src/App.jsx` (`persistProject` ~12962, header render, `SaveBanner`)

**Interfaces — Produces:** `saveChip({ pending: number, saveState, lastSavedAt: string|null }) -> { label, tone: 'muted'|'ok'|'error', retry: boolean }` — any entry in `saveState` with status `error` → `Not saved — Retry`, retry true; else `pending > 0` → `Saving…`; else `lastSavedAt` → `Saved hh:mm` (local time, 24h); else label `''`.
- [ ] **Step 1:** failing tests for each branch (conflict/denied entries still show their banner; the chip only reports error/pending/saved).
- [ ] **Step 2:** Track `lastSavedAt` (set on status `ok`) and a re-render trigger for pending count (state mirror of `pendingSaves.current`). Retry: for each pid with status `error`, `persistProject(projectsRef.current[pid])`. `window` `online` listener calls the same retry once. In `SaveBanner`, the error case gets a `Retry` button next to Reload.
- [ ] **Step 3:** tests, build, lint. **Step 4:** Commit `feat(save): Saving / Saved / Not saved chip with Retry`.

### Task C3: Personal state stays personal (U7)

**Files:** Modify `src/storage-shim.ts` (export `rememberCurrentProject(pid)`), `src/uiPrefs.js` (+ test), `src/App.jsx` (`switchProject`, Monday banner ~14024–14052)

**Interfaces — Produces:** `rememberCurrentProject(pid: string): void` (localStorage, uid-namespaced key already used by the meta read). `isBriefingDismissed(dateISO): boolean`, `dismissBriefing(dateISO): void` in `uiPrefs.js` (localStorage key `afmpt:briefingDismissed`, JSON list of dates, keep last 10, try/catch).
- [ ] **Step 1:** failing tests for the uiPrefs pair (with a stubbed `localStorage`).
- [ ] **Step 2:** `switchProject`: `rememberCurrentProject(id)` and `setMeta`, no `saveMeta`. Monday banner reads `isBriefingDismissed(todayISODate())` and writes with `dismissBriefing`; stop writing `dismissedBriefingDates` to meta (still honour the old list when reading).
- [ ] **Step 3:** tests, build, lint. **Step 4:** Commit `fix(prefs): selected project and briefing dismiss are per browser`.

## PR-D — approvals (branch `feat/w1-d-approvals`, from PR-C)

### Task D1: Approval buckets and escalation helpers

**Files:** Create `src/approvalsInbox.js`, `tests/unit/approvalsInbox.test.js`. Consumes `managerLevel`, `canDecideClose` from `src/closeFlow.js`.

**Interfaces — Produces:**
- `workingDaysSince(fromISO: string, now: Date): number` — Mon–Fri days strictly after the local date of `fromISO`, up to and including the local date of `now`.
- `escalationTargets(roles, task): string[]` — `closeRequest.approverUid` is the ws lead → PM + Deputy of the program; approver is any other non-Owner → `roles.ownerUids`; approver is an Owner → `[]`. Never includes the requester or the task's PIC.
- `approvalBuckets(projects: object, uid: string, now: Date) -> { needsMine: Item[], sent: Item[] }`, `Item = { project, program, workstream, task, waitingDays, escalated }`. Only v2 projects (`project.__v2?.roles`); task status `Submitted` with a `closeRequest`. `needsMine`: (`approverUid === uid`) or (`waitingDays >= 3` and `uid ∈ escalationTargets`), and `canDecideClose(roles, task, uid)`. `sent`: `closeRequest.requestedByUid === uid`. Sorted by `waitingDays` desc.
- [ ] **Step 1: Failing tests:** Fri→next Wed = 3, Fri→Tue = 2; Sat request → Wed = 3; same day = 0; lead approver escalates to PM and Deputy only; PM approver escalates to Owners; Owner approver → []; requester/PIC excluded; buckets for approver, for PM after 3 days (escalated true), not before; sent bucket for requester; v1 projects ignored.
- [ ] **Step 2:** FAIL → implement → PASS. **Step 3:** Commit `feat(approvals): approval buckets and 3-working-day escalation helpers`.

### Task D2: My Work sections and badge

**Files:** Modify `src/App.jsx` — the My Work view (component using `computeMyWork`, ~11244), the tab badge count (~12770–12777).
- [ ] **Step 1:** In My Work, above Today, render `Needs my approval` (count in the title; each row: task name (click opens the panel), `project › program › ws`, requester name, outcome, waiting time, the escalated tag `Waiting N working days — escalated` when `escalated`, and the existing close controls — reuse `CloseControl` with the same props/model the task panel uses). Then `Sent for approval` (approver name, waiting time, Withdraw via the same control). Hide a section when empty. `now` = `new Date()` per render.
- [ ] **Step 2:** Badge adds `needsMine.length`.
- [ ] **Step 3:** build, lint, existing tests. **Step 4:** Commit `feat(my-work): Needs my approval and Sent for approval sections`.

### Task D3: Deep link to a task

**Files:** Create `src/deepLink.js`, `tests/unit/deepLink.test.js`; modify `src/App.jsx` (deep-link parse ~12719, task panel header).

**Interfaces — Produces:** `taskUrl(origin: string, pid: string, tid: string): string` → `${origin}/?project=<pid>&task=<tid>` (encoded); `parseDeepLink(search: string) -> { project: string|null, action: string|null, task: string|null }`.
- [ ] **Step 1:** failing tests (encode/decode, missing params, ignores unknown params).
- [ ] **Step 2:** Parse `task` alongside `action`: if the project is accessible, switch to it and `setSelectedTaskId(task)`; always clear the params; inaccessible → nothing happens. Task panel header: a `Link` icon button `title="Copy link"` that copies `taskUrl(window.location.origin, project.id, task.id)` and toasts `Link copied`.
- [ ] **Step 3:** tests, build, lint. **Step 4:** Commit `feat(link): open a task from a link; Copy link in the task panel`.

### Task D4: Google Chat cards on Submitted and Rejected

**Files:** Modify `src/chatNotify.js` (+ `tests/unit/chatNotify.test.js`, create if missing), `src/App.jsx` close wiring (where close events are logged after a successful close write — grep `closeEventsFor`).

**Interfaces — Produces:** `buildCloseSubmittedCard({ projectName, taskName, requesterName, approverName, outcome, note, taskUrl })`, `buildCloseRejectedCard({ projectName, taskName, deciderName, requesterName, reason, taskUrl })` — same card shape as `buildNewActionCard`, all text through `escapeChatText`, an `Open task` button to `taskUrl`.
- [ ] **Step 1:** failing tests: text contains the names, outcome (`Done` / `Dropped`), reason; HTML-ish input is escaped; button URL is `taskUrl`.
- [ ] **Step 2:** implement. Wiring: after a successful submit write → post Submitted card; after a successful reject → Rejected card; only when `project.googleChatWebhook` is set; on failure the existing Chat-failure toast; never awaited before UI updates.
- [ ] **Step 3:** tests, build, lint. **Step 4:** Commit `feat(chat): notify Google Chat when a task is submitted or rejected`.

## PR-E — role-aware UI (branch `feat/w1-e-role-ui`, from PR-D)

### Task E1: Role helpers

**Files:** Create `src/roleUi.js`, `tests/unit/roleUi.test.js`. Consumes `managerLevel` (`src/closeFlow.js`).

**Interfaces — Produces:**
- `datesWithinWs(start: string|null, end: string|null, ws: {start?, end?}): boolean` — same as rules `withinWs` (null bound = no limit; ISO string compare).
- `canEditTaskDates({ isOwner, isV2, roles, taskId, uid }): boolean` — Owner always; v2 and `managerLevel ∈ {'pm','lead'}` → true; else false.
- `uiCaps({ isOwner, isV2, roles, uid, programId, wsId }) -> { programEdit, wsAdd, wsEdit, wsDelete, taskAdd, taskEdit }` — v1 or Owner → all true; v2: `programEdit` false (Owner-only fields); `wsAdd`, `wsEdit`, `wsDelete` = PM/Deputy of `programId`; `taskAdd`, `taskEdit` = PM/Deputy of `programId` or lead of `wsId`. Implementer verifies each against `firestore.rules` (workstreams ~487, tasks ~943) and records any mismatch as a test.
- `myRoleSummary(roles, uid, project) -> { label: string, detail: string[] }` — label is the highest of `Owner`, `PM · <program>`, `Deputy · <program>`, `Sub-PM · <ws>`, `Assignee`, `View only`; detail lists all.
- [ ] **Step 1:** failing tests for each (incl. null ws dates, v1 → all true, Viewer → all false + `View only`). **Step 2:** implement. **Step 3:** Commit `feat(roles): role capability helpers for the UI`.

### Task E2: Wire dates, hiding, chip

**Files:** Modify `src/App.jsx` — task panel dates (~3694–3712), Outline headers (program ~7243, ws ~7298), Mind map menu items, task panel Edit/Drop (~3578), tabs (~13962: Activity `ownerOnly`), Outline `Top:` line (~7202, Owner only), header next to the project selector (chip).
- [ ] **Step 1:** Task panel: Start/End inputs editable when `canEditTaskDates`; on change, if not `datesWithinWs` with the task's ws, show the U4 message under the input and do not apply; Request change stays for others.
- [ ] **Step 2:** Hide controls with `uiCaps` (v2 only; v1 unchanged). Activity tab and `Top:` line only for Owner.
- [ ] **Step 3:** Chip `Your role: <label>` (title = detail joined), `View only` styling muted.
- [ ] **Step 4:** build, lint, tests. **Step 5:** Commit `feat(ui): PM/Sub-PM edit dates; hide what my role can't do; role chip`.

## PR-F — onboarding (branch `feat/w1-f-onboarding`, from PR-E)

### Task F1: Walkthrough for today's app

**Files:** Modify `src/components/Walkthrough/steps.ts`, `useWalkthrough.ts`, `Walkthrough.jsx`; `data-tour` attributes in `src/App.jsx` as needed.
- [ ] **Step 1:** Steps: My Work (Today/Week/Later), Needs my approval / Sent for approval, task panel + Submit as done, roles (Owner / PM / Deputy / Sub-PM / Assignee) and the role chip, Roles… menu, Mind map / Outline, `?` for walkthrough and Glossary. Remove Owner/Operator/Viewer wording and the forced Mind map switch.
- [ ] **Step 2:** Auto-start on first visit regardless of task count; backdrop click closes without marking seen; `Skip` / `Done` mark seen.
- [ ] **Step 3:** build, lint. **Step 4:** Commit `feat(onboarding): walkthrough for roles, My Work and approvals`.

### Task F2: Glossary

**Files:** Create `src/components/Glossary.jsx`, `src/glossary.js`, `tests/unit/glossary.test.js`; modify `src/App.jsx` (`?` button ~13924 becomes a small menu: `Walkthrough`, `Glossary`).

**Interfaces — Produces:** `GLOSSARY: Array<{ term, en, vi }>` with entries for PIC, Assignee, PM, Deputy, Sub-PM, RAID, Credit points (cp), Weight, Hard deadline, Soft deadline, Submitted.
- [ ] **Step 1:** test: every term present, each has non-empty `en` and `vi`. **Step 2:** implement data + modal (uses `Modal`). **Step 3:** build, lint. **Step 4:** Commit `feat(help): glossary of terms (EN + VI)`.

---

## After each PR

Push the branch, open a PR stacked on the previous one (base = previous branch), body: what changes, data/rules impact, undo, smoke steps from spec §7. Update `CLAUDE.md` Current Status in PR-F (one line per PR merged).
