# W3-A Honest Saves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Nobody sees a change as saved, logged or announced when the rules refuse it.

**Architecture:** (1) side effects of an edit (activity entries, Chat cards) are held per project until that project's pending save settles, sent on `ok`, dropped on `denied`; (2) a denied v2 save reverts the project in memory to `v2SavedTree` and names what was not saved; (3) pure capability helpers in `src/roleUi.js` hide every control the rules refuse; (4) Owner operations report their real result.

**Tech Stack:** React 18, Vite, Vitest, Firestore rules (unchanged in W3-A).

**Spec:** `docs/superpowers/specs/2026-11-13-wave3-design.md` §2

## Global Constraints

- No rules change, no data change in W3-A. No App.jsx restructuring: minimal edits at the existing choke points.
- `npm test`, `npm run typecheck`, `npm run lint:gate` (≤ 2 errors / 32 warnings), build (PowerShell) green.
- Three PRs, each against `main` after the previous merges: A1 engine, A2 gating, A3 Owner operations.
- UI copy in English.

## Review Focus

- An edit followed within 400 ms by a second edit: both activity entries are sent once, after the single save, in order.
- A save that is `denied` in one chunk and `ok` in another (≤ 8 WS chunks): the revert keeps what was saved (it reads `v2SavedTree`), and only the refused items are named.
- v1 project (none left in production, but the code path exists) and View as: behaviour unchanged.
- Network `error` (retryable): held entries stay held and go out after a successful Retry, not dropped.
- An activity entry logged when no save is pending (e.g. after a close flow already saved) is written immediately as today.

---

## PR W3-A1 — engine (branch `feat/w3-a1-held-effects`; also carries spec + plan)

### Task 1: `src/afterSave.js` + tests

**Produces:**
- `createHeldEffects()` → `{ hold(pid, fn), settle(pid, status), has(pid) }`. `hold` queues `fn` for `pid`; `settle(pid, 'ok')` runs queued fns in order and clears; `settle(pid, 'denied' | 'refused' | 'history' | 'conflict' | 'readonly')` clears without running; any other status (`'error'`, unknown-person) keeps them queued.
- `changedItemLabels(current, saved)` → array of short labels (`Task "<name>"`, `Action "<title>"`, `Work stream "<name>"`, `Program "<name>"`, `Project settings`) for items whose JSON differs between the in-memory tree and the saved tree (added, changed or removed), max 3 + `"and N more"`.

Tests: ordering, ok runs once, denied drops, error keeps then ok runs; labels for changed task / added action / removed WS / project field; truncation.

### Task 2: wire into `App.jsx`

- `logActivity` / `logActivityForProject`: for a v2 project with a pending or in-flight save (`saveTimers.current[pid] || inflightSaves.current[pid]`), `held.hold(pid, () => appendActivity(...))` and update the visible feed only when it runs; otherwise as today.
- Chat sends that follow an edit (`createActionFromMyWork`, `saveAction`, task-panel action notify, close-flow cards are already after save — leave them): wrap in `held.hold(pid, …)` when a save is pending.
- `persistProject` and `flushProjectSave`: after the status is known, `held.settle(pid, status)`.
- On `status === 'denied'` for a v2 tree: `const saved = v2SavedTree(pid)`; if present, `labels = changedItemLabels(projectsRef.current[pid], saved)`, `setProjects` to `saved`, toast `Not saved: you can't change ${labels.join(', ')}. It is back to the last saved version.`; mark the save state ok for that project so the sticky banner does not remain (the toast replaces it). If `saved` is null keep today's banner.
- Banner text for remaining `denied` cases (`src/persistence.js` / line ~2072): drop "(use Submit as done to close a task)"; say "Reload to see the saved version."
- Verify all checks. Commit, push, PR.

## PR W3-A2 — gate the surfaces (branch `feat/w3-a2-gating`, from `main` after A1)

### Task 3: helpers in `src/roleUi.js` + tests

**Produces** (inputs: `{ isOwner, isV2, roles, uid }` plus the item; v1 → today's behaviour = all true):
- `managesWs(roles, uid, wsId)` — PM / Deputy of the WS's program (`roles.workstreams[wsId].programId` → `roles.programs[pg]`) or Sub-PM of the WS.
- `actionTaskOptions(project, ctx)` → tasks whose WS the person manages (all tasks for Owner).
- `canCreateAction(project, ctx)` → `actionTaskOptions(...).length > 0`.
- `actionEditMode(ctx, action)` → `'full' | 'pic' | 'comment'` (rules: `firestore.rules` 1033–1064; action with null WS → `'full'` only for Owner).
- `taskPanelCaps(ctx, task)` → `{ health, refs, resolveBlocker, addAction }` per `firestore.rules` 856–970 (Owner / manager: all; PIC with status Planned / InProgress / Submitted: health, refs, resolveBlocker; contributor: resolveBlocker only; others: none); `addAction` = `canCreateAction` restricted to this task's WS.
- `canTickStep(ctx, action)` → Owner, manager of its WS, or `action.picUid === uid`.

Tests: one case per role per helper, null WS action, closed task PIC, v1 passthrough.

### Task 4: apply in `App.jsx`

- New action buttons (Actions tab, My Work header, My Work task row, task panel): hidden unless allowed; non-Owner form: milestone required, options = `actionTaskOptions`.
- `ActionItemForm` and My Work `ActionRowInline`: fields read-only per `actionEditMode`; drop "Cancelled" unless `'full'`; pencil hidden for `'comment'`.
- Task panel: Health buttons + note, References add / remove, resolve blocker, Add action follow `taskPanelCaps`; disabled state has `title` with the reason.
- `ProjectSettingsModal`: non-Owner read-only (inputs disabled, no Save, no Add / Remove, no Lock), header note "Only the Owner can change project settings."
- My Work contributor rows: do not pass `onMarkDone` / `onStatusChange`; muted "Only the PIC submits".
- Step ✓ (My Work rows, task row steps): only when `canTickStep`; else muted "Ask <PIC> to tick this step"; such steps excluded from that person's Needs attention / badge.
- ⋯ menu: Backup JSON only for Owner.
- Verify, PR.

## PR W3-A3 — Owner operations (branch `feat/w3-a3-owner-ops`, from `main` after A2)

### Task 5

- **New project** creates a v2 doc: `schemaVersion: 2`, `visibility: 'restricted'`, `memberUids: [uid]`, empty programs; the shim loads it as v2 (check `storage-shim.ts` create path; add a unit test for the create payload).
- **Import Excel**: if the v2 save path can write the imported tree right after creating the v2 doc (planner handles all-new items, chunked), do it; otherwise block Import with "Import is not available for v2 yet — ask Claude to import via script" and ledger the ruling.
- **Delete project**: `deleteProjectStore` returns ok / error from the shim; on error keep the project and toast; confirm text "The Owner can restore it later."
- **Lock / Unlock weights**: persist immediately after the confirm (same path as the modal's merge tools).
- **Chat webhook**: commit in `save()` only (remove `onBlur` commit); fix help text to "Posts Action updates and task Submitted / Rejected".
- Verify, PR; CLAUDE.md status line.
