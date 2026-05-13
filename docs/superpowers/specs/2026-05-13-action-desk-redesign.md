# Action-Desk Redesign — Phase A (v30.A)

**Date:** 2026-05-13
**App:** AF MTP — extends v30 spec (`Specs/FEATURES_SPEC_v30_my_work.md`)
**Status:** Design — pending implementation
**Effort:** ~2-3h in-app

---

## Background

v30 shipped "My Work" assuming team mostly works on tasks (PM-centric). User feedback after Phase 1+2 reveals the actual workflow centers on **action items** with these patterns:

- Most daily work = process action items, not edit tasks
- A single action (e.g., "ký hợp đồng vendor X") often has a sequence of people: prepare → review → final approve
- Users want My Work to be their **working desk**, not a navigation hub — currently clicking an action redirects to Actions tab, breaking flow

This spec covers **Phase A**: reorder + inline action editing + comment history. Phase B (sub-actions with own PIC) is a follow-up spec.

---

## Goals

1. Move "Action items assigned to me" to section #2 (right after Needs attention) — reflect that actions are primary work surface
2. Make action rows fully workable inline (status, mark done, reassign PIC, due date, title, comments) — no need to leave My Work for daily ops
3. Add `action.updates[]` schema so users can post progress notes / @mention teammates on actions (parity with `task.updates`)

**Non-goals (Phase A):**

- Sub-action / hierarchy with sub-PICs — deferred to Phase B
- Creating new actions from My Work — user still uses Actions tab to create
- Bulk operations — user uses Actions tab for that
- Replacing or removing the Actions tab — it remains the place for cross-team view, filters, email export, deletion
- Backfilling existing action items with `updates` field — schema is purely additive, default `[]`

---

## Cross-cutting principles (additional to v30)

1. **Mirror task UX where applicable** — `ActionRowInline` follows `TaskRowInline` C+D hybrid expand pattern. Same mental model for users.
2. **Additive schema** — `action.updates` defaults to `[]` when missing; existing actions render with zero comments and no migration needed.
3. **Activity log per-project, including action edits** — every inline edit emits an entry in the host project's activity log via existing `applyActionUpdate` + the new sibling `applyActionUpdateFull` helper.
4. **Mentions reach** — `computeMyWork` mention scan extends to `action.updates`. Users get notified for `@hattt4` in action comments same as task updates.

---

## Schema additions

```js
// Single new field on action items
action.updates: Array<{
  id: string,           // uid('aupd_...')
  timestamp: string,    // ISO
  author: string,       // display name
  text: string,         // raw text incl. @mentions
  isBlocker: boolean,   // surfaces as 🚨 prefix in renders
}>

// All other action fields unchanged.
```

**Backward compat:** missing `updates` → treated as `[]` via `(action.updates || [])`. No migration script.

---

## New section order in My Work

| # | Section | Old position | New position |
|---|---|---:|---:|
| 1 | 🔴 Needs attention now | 1 | 1 |
| 2 | ✅ My action items | 5 | **2** |
| 3 | 💬 Mentions | 2 | 3 |
| 4 | 📋 Tasks I own as Primary PIC | 3 | 4 |
| 5 | 🤝 Tasks I contribute to | 4 | 5 |
| 6 | 🤔 Decisions awaiting input | 6 | 6 |
| 7 | 📊 My credit | 7 | 7 |

Smart-expand defaults unchanged per-section (already content-driven).

---

## Component: `ActionRowInline`

Mirrors `TaskRowInline` shape and behavior.

**Props:**

```js
{
  action: ActionItem,
  project: Project,
  related: { program, workstream, task } | null,   // resolved by findTaskInProject(project, action.relatedTaskId)
  author: string,
  teamMembers: Array<TeamMember>,
  picSuggestions: Array<string>,                   // from same source as ActionForm
  onChange: (patch) => void,                       // patch is partial action; parent applies via applyActionUpdate
  onAddComment: (text, isBlocker) => void,
  onOpenDetails: () => void,                       // tertiary, opens Actions tab (existing behavior)
}
```

### Collapsed state

```
▢ Ký hợp đồng vendor X                       Medium   Pending
   Investor › IB › EL Signed
   📅 May 14                                  ✓  ⌄
```

Layout:

- Checkbox glyph (visual, not interactive)
- Title (single line, ellipsis)
- Breadcrumb of related task (if `relatedTaskId` resolves), shown small/muted
- Due date pill (red if overdue)
- Priority pill (right-side, same as `ActionItemRow` at L3989)
- Status pill — **clickable** `StatusQuickPill` variant with action statuses
- ✓ button — one-click mark done (only when status ≠ Done)
- ⌄ chevron — toggle expand

**Click anywhere on row body** (not on status pill, not on ✓, not on ⌄) → expand.

### Expanded state

```
▢ [inline title input ───────────────────]    [Pending ▼]    ⌃
   Investor › IB › EL Signed
   ┌────────────────────────────────────────────────────────┐
   │ PIC:    [hattt4 ▼]                                     │
   │ Due:    [2026-05-14]    Priority: [Medium ▼]           │
   │ (status is controlled by the [Pending ▼] pill above)   │
   │                                                        │
   │ 💬 Comments (2)                                        │
   │ • An · yesterday — "sent draft for review"            │
   │ • Trang · 3d ago — "@hattt4 please prepare"           │
   │                                                        │
   │ ┌──────────────────────────────────────────────────┐  │
   │ │ Type @ to mention. Posted as hattt4 on May 13.   │  │
   │ │                                                  │  │
   │ └──────────────────────────────────────────────────┘  │
   │ ☐ Mark as blocker                                      │
   │ [Post comment]  [→ Open in Actions tab]               │
   └────────────────────────────────────────────────────────┘
```

**Editable fields in expanded body** (status pill stays at top-right in BOTH states; not duplicated in the body):

- Title — `<input>` rendered in place of the title text at the top of the row; blur or Enter → emit `onChange({ title })`
- PIC — `<select>` over `picSuggestions`; changing reassigns immediately
- Due date — `<input type="date">`; commits on change
- Priority — `<select>` over `PRIORITIES`; commits on change
- Status — NOT in body; controlled by the top-right `StatusQuickPill` (always visible, identical UX collapsed vs expanded)

**Comment thread:**

- Show last 3 comments by default; "Show all (N)" expands inline
- Each comment: `author · timeAgo · text`, with `MentionedText` rendering
- Blockers prefixed `🚨` in red
- Bottom: `MentionTextarea` with "Post comment" button; "Mark as blocker" checkbox

**Tertiary action:**

- "→ Open in Actions tab" button (small, ghost variant) — still useful for description editing, deletion, related task picker. Demoted from primary nav.

### Mobile

- Below 480px viewport: pills wrap below title; buttons in expanded state stack vertically.

---

## Updated `computeMyWork`

Two behavior changes:

1. **Mention scan extension** — currently scans `task.updates` + `task.checkIns`. Extend to also scan `action.updates` for every action item across all projects (regardless of whether user is the PIC). Items emitted alongside existing mention items with same shape but `action` field instead of `task`.

   ```js
   for (const a of (proj.actionItems || [])) {
     for (const upd of (a.updates || [])) {
       const tokens = (upd.text.match(/@([A-Za-zÀ-ỹ0-9._-]+)/g) || []).map((m) => m.slice(1).toLowerCase());
       if (!tokens.includes(authorLc)) continue;
       const item = {
         ts: upd.timestamp, postAuthor: upd.author, text: upd.text,
         action: a, project: proj,    // note: action, not task
       };
       out.allMentions.push(item);
       if (upd.ts && new Date(upd.ts) > lastSeen) out.unreadMentions.push(item);
     }
   }
   ```

2. No other change. Action item bucketing (today/week/later) unchanged.

The mention render in `MyWorkView` already uses `m.task.name` — we generalize to `m.task?.name || m.action?.title` and `m.task?.id || m.action?.id` for click navigation.

---

## App-level handlers

### `applyActionUpdate(updatedAction, projectId, source)` — extended

Already exists from Phase 2. Extend the diff-logger:

- Status change → existing `action_complete` or `action_status_change` (unchanged)
- **New diff cases:**
  - `oldAction.title !== updatedAction.title` → `action_rename`: `Renamed action "<old>" → "<new>"`
  - `oldAction.pic !== updatedAction.pic` → `action_reassign`: `Reassigned action "<title>": <old> → <new>`
  - `oldAction.dueDate !== updatedAction.dueDate` → `action_due_change`: `Changed action "<title>" due date: <old> → <new>`
  - `oldAction.priority !== updatedAction.priority` → `action_priority_change`
  - `(oldAction.updates?.length || 0) < (updatedAction.updates?.length || 0)` → `action_comment`: `Posted comment on action "<title>" 🚨 Blocker (from My Work)` (blocker marker if newest entry's `isBlocker` is true)

All entries get `(from <source>)` suffix when `source` is set.

### Helpers (inline arrow funcs in `ActionRowInline`)

```js
const postComment = (text, isBlocker) => {
  onChange({
    updates: [
      { id: uid('aupd'), timestamp: new Date().toISOString(), author, text, isBlocker: !!isBlocker },
      ...(action.updates || []),
    ],
  });
};
```

Note: `onChange` always passes the FULL patched action to `applyActionUpdate` — the inline editor accumulates the diff and emits `{ ...action, ...patch }` to parent. This keeps `applyActionUpdate` signature unchanged.

---

## Files touched

| File | Change |
|---|---|
| `src/App.jsx` | All changes here (single-file React invariant from v30 spec) |
| `Specs/FEATURES_SPEC_v30_my_work.md` | No change |
| `docs/superpowers/specs/2026-05-13-action-desk-redesign.md` | This file (new) |

### Edits in `App.jsx`

1. **`computeMyWork`** — extend mention scan to `action.updates` (~15 lines)
2. **`applyActionUpdate`** — add 5 diff cases (~25 lines)
3. **New `ActionRowInline` component** — placed near `TaskRowInline` (~180 lines)
4. **`MyWorkView` action-items section** — replace current inline JSX (~50 lines) with `<ActionRowInline>` per row (~10 lines)
5. **`MyWorkView` mention rendering** — generalize `m.task` → `m.task || m.action` accessors (~8 lines diff)
6. **`MyWorkView` section render order** — move Action items section JSX block from #5 to #2 (cut+paste, ~50 lines moved)
7. **`MyWorkView` needs-attention overdue_action branch** — no change (already uses `action.title` + `action.dueDate` from earlier fix)

**Estimated net adds:** ~200 lines. `App.jsx`: 10501 → ~10700.

---

## Testing checklist

### Functional

1. **Reorder** — Open My Work. Verify section order: Needs attention → My action items → Mentions → Tasks owned → Tasks contributing → Decisions → Credit.
2. **Status change inline** — Click status pill on action row → menu shows ACTION_STATUSES. Change to "InProgress" → activity log entry `Action "X": Pending → InProgress (from My Work)`.
3. **Mark done shortcut** — Click `✓` on collapsed row → status → Done → row disappears from My Work (filtered by computeMyWork).
4. **Reassign PIC** — Expand row → change PIC dropdown → activity log `Reassigned action "X": A → B (from My Work)`. Row disappears from current user's My Work, appears in new PIC's.
5. **Due date edit** — Expand → change due input → activity log + row may re-bucket (Today/Week/Later).
6. **Title edit** — Expand → edit title input → blur → activity log `Renamed action "old" → "new"`.
7. **Post comment** — Expand → type "test comment @hattt4" → Post → comment appears in list; activity log `Posted comment on action "X" (from My Work)`.
8. **Blocker comment** — Same as #7 with blocker checked → activity log includes `🚨 Blocker` marker; comment renders with `🚨` prefix.
9. **Mention in comment surfaces in Mentions section** — Post `@trangvk fyi` in a comment → sign in as trangvk → My Work Mentions section shows the comment with `[UNREAD]` badge, link points to the action's project.
10. **Open in Actions tab** — Click "→ Open in Actions tab" button → app navigates to project + Actions view (unchanged behavior from Phase 2's onActionClick).

### Regression

11. **Tasks unchanged** — Outline + TaskDetail status/update flows unaffected; activity log entries for task edits do NOT have `(from My Work)` suffix when posted from Outline.
12. **ActionItemsView unchanged** — Actions tab renders unchanged. Comments posted from My Work are stored on `action.updates` but are NOT shown in any form in ActionItemsView (no badge, no thread). Verify by posting a comment in My Work, switching to Actions tab → no visible change to the action's row.
13. **No subaction UI** — there are no buttons or fields hinting at sub-actions or hierarchy. (Phase B will add.)

### Empty states

14. **Action with no related task** — breadcrumb omitted, row still renders cleanly.
15. **Action with no comments** — comment section header shows `💬 Comments (0)`; textarea visible; "Show all" hidden.
16. **Action with 0 due date** — falls into Later bucket; row renders without `📅` pill.

---

## Open questions resolved during brainstorming

- **Q:** Should `ActionItemsView` (Actions tab) also render the new comment thread or any indicator?
  **A:** No — neither thread nor badge in Phase A. Comments are silently stored on the action and visible only via My Work. Phase B introduces the full UI in ActionItemsView together with sub-actions. Reason: a badge alone with no way to read the thread from Actions tab is bad UX; deferring keeps scope clean.

- **Q:** Should creating a new action from My Work be supported?
  **A:** No. Out of scope for Phase A; keep ActionItemsView as the single "create" path.

- **Q:** Should `applyActionUpdate` get a separate path for comment-only updates vs full edits?
  **A:** No. Single function with diff-logger handles all cases; comment-add is just a diff in `updates.length`.

- **Q:** PIC editor in expanded row — full `PicEditor` (L2120) or simpler `<select>`?
  **A:** Start with simpler `<select>` over `picSuggestions` (deriveable from project members + existing PICs). `PicEditor` is heavier and primarily for task PIC where invitation flow matters. Cleanup if needed in Phase B.

---

## Phase B preview (for context — separate spec)

**Sub-actions with own PIC** to support patterns like "ký hợp đồng → A prepare → B review → C final":

- Two schema shapes under consideration:
  - **Embedded** (Asana style): `action.subtasks: Array<{ id, title, pic, status, dueDate, completedAt }>`
  - **Reference** (Jira style): each subtask is itself an action item with `parentActionId` pointing up
- Tentative lean: embedded — simpler reads, no JOIN-style lookups, no cross-array integrity concerns. Phase B brainstorm will lock the choice.
- Rolls up: parent `status` derived from subtask completion (% done) OR parent has own status + subtasks tracked separately
- UI: subtask rows render nested under parent in `ActionRowInline` expanded state; each subtask is a mini-row with own status/PIC
- ActionItemsView gets a hierarchy renderer (tree-flat)
- My Work shows BOTH parent action (if I'm parent PIC) AND any subtask I own (if I'm subtask PIC)

This spec leaves the door open: nothing in Phase A precludes either implementation choice.

---

## Critical pitfalls

1. **Don't add `action.updates` rendering to ActionItemsView in Phase A** — even though it feels natural. Scope-creep would make Phase A larger and conflict with Phase B's restructure.
2. **Mention scan must walk all projects** — `computeMyWork` already does. Just add the action.updates loop inside the existing project iteration.
3. **PIC dropdown source** — derive from existing `deriveTeamMembers` output (L829) and per-project member list. Don't introduce a new source.
4. **Title commit timing** — title `<input>` uses local state inside `ActionRowInline`; emits `onChange({ title })` only on **blur or Enter key**, not on every keystroke. Avoids spamming activity log + flicker on every character. Other fields (status, PIC, due, priority) commit immediately on change since they have discrete values.
5. **Activity log per project** — use `logActivityForProject(projectId, ...)` (the Phase 2 helper), NOT `logActivity(...)` (which writes only to currentId). Phase 2 wiring already routes through this correctly via `applyActionUpdate`.
6. **Don't migrate existing actions** — `action.updates` is added on-write only. Reads use `(action.updates || [])` defensively.
7. **`ActionRowInline` is NOT a drop-in replacement for `ActionItemRow`** — they have different needs. Don't refactor `ActionItemsView` to use `ActionRowInline`.

---

## Implementation order

```
1. Schema fallback reads (~0 lines, just discipline) — every read of action.updates uses (... || [])
2. Extend computeMyWork mention scan to action.updates                                    (~15 lines)
3. Extend applyActionUpdate diff-logger with 4 new cases                                  (~25 lines)
4. Create ActionRowInline component near TaskRowInline                                    (~180 lines)
5. Move action-items section JSX from #5 to #2 in MyWorkView; swap to <ActionRowInline>   (~60 lines net)
6. Generalize mention renderer to m.task || m.action                                      (~10 lines)
7. Manual smoke test 16-step checklist
8. Build + lint + commit
```

Total: ~290 lines added net to App.jsx (~+2.7%).
