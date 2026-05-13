# Phase B — Action Sub-tasks (multi-PIC steps inside one action)

**Date:** 2026-05-13
**App:** AF MTP — extends Phase A, A.1, A.2 specs
**Status:** Design — pending implementation
**Effort:** ~5-6h in-app

---

## Background

Phase A through A.2 built My Work into a working desk centered on action items. The original pain point that triggered this entire workstream was the workflow pattern:

> "ví dụ như để xong action về ký hợp đồng có thể sẽ cần tag nhân viên A prepare, nhân viên B review, nhân viên C final"

A single action ("Ký hợp đồng vendor X") is really a chain of steps with different people responsible at each step. Today the user has two workarounds:

1. Create 3 separate action items ("Prepare contract", "Review contract", "Final approval"), each linked to the same task — but they don't share a parent context, and the user has to mentally track dependencies.
2. Make one action with PIC = the primary responsible person, and use the comment thread to coordinate handoffs — but other PICs don't see the action in their My Work.

Phase B introduces **sub-tasks**: an action can have a list of named steps, each with its own PIC and status. The sub-PICs see their sub-task in My Work; the parent PIC sees progress rolled up.

---

## Goals

1. **Schema:** add `action.subtasks: Array<{ id, title, pic, status }>` (optional, defaults `[]`)
2. **Edit:** Reusable `SubtaskEditor` component used in both `ActionItemForm` (Actions tab Edit) and `ActionRowInline` expanded state (My Work)
3. **Sub-PIC visibility:** sub-tasks where `subtask.pic === author && subtask.status !== 'Done'` appear as rows in **"Action items assigned to me"** section of sub-PIC's My Work, bucketed by parent action's `dueDate`
4. **Parent PIC progress display:** parent action collapsed row shows `✓ X/Y` count alongside `💬 N` comment count
5. **Manual parent status:** parent action keeps its own status independent of sub-task completion — the parent PIC decides when the overall action is Done
6. **Activity log:** subtask mutations emit typed activity entries with `(from <source>)` suffix

**Non-goals:**

- Multi-level nesting (sub-of-sub) — flat 1 level only
- Sub-task dueDate, priority, description, status beyond Pending/Done
- Comments on individual sub-tasks (the parent action's comment thread is the discussion surface)
- Mention scan inside sub-task titles
- Auto-derived parent status from sub-tasks (the user explicitly chose manual + progress display)
- Dependencies / ordering enforcement (sub-tasks are a flat list; user manages order manually)
- Push notification when a sub-task is completed by someone else (Phase 5 territory)

---

## Cross-cutting principles (in addition to A/A.1/A.2)

1. **Sub-tasks are steps, not work items.** A sub-task carries the minimum to assign and check off — title, PIC, status. Anything richer (comments, deadlines, priority) lives at the parent action level.
2. **Sub-PICs see their work cleanly, not the parent's.** A sub-PIC doesn't see the parent action in their My Work unless they are also the parent PIC or a contributor. They see one row per sub-task they own, with a small breadcrumb noting which parent action it belongs to.
3. **Subtask bucketing inherits parent's dueDate.** Without their own deadline, sub-tasks use the parent's `dueDate` for Today/Week/Later partitioning. A sub of an overdue parent is itself surfaced as overdue (via the parent's `isOverdue` check).
4. **One source of truth for the subtask UI editor.** `SubtaskEditor` is built once and consumed in two render sites. Avoids the spec/code drift that comes from duplicated row layouts.

---

## Schema additions

```js
// Single new field on action items
action.subtasks: Array<{
  id: string,           // uid('sub_...')
  title: string,        // free text
  pic: string,          // display name (same shape as action.pic)
  status: 'Pending' | 'Done',
}>

// All other action fields unchanged.
// action.dueDate is inherited by sub-PICs for Today/Week/Later bucketing.
```

**Backward compat:** missing `subtasks` → treated as `[]` via `(action.subtasks || [])`. No migration.

---

## Components

| File / Component | Change |
|---|---|
| **NEW `SubtaskEditor`** | Manages a subtasks array. Renders the list (title input + PIC `<select>` + status toggle button + remove `🗑` button per row) plus a "+ Add sub-task" button. Calls `onChange(updatedSubtasks)` immediately on every mutation. |
| **NEW `SubtaskMyWorkRow`** | Minimal row for sub-PIC's My Work: ▢ title + "Sub of: <parent.title> · <project.name>" breadcrumb + `✓ Mark done` button. No expand state. |
| `ActionItemForm` | + render `<SubtaskEditor>` between Comments and Save/Cancel; pass `picSuggestions` from existing source (project members + teamMembers — same shape as the form's PIC editor uses). Optional `onSubtasksChange` callback fires on every edit, bypassing form Save (same pattern as comment post). |
| `ActionRowInline` | + `subtasks` count badge `✓ X/Y` in collapsed row alongside `💬 N`; + render `<SubtaskEditor>` in expanded state below comment thread; + `onSubtasksChange` prop. |
| `MyWorkView` action-items section | When entry has `kind === 'subtask'`, render `<SubtaskMyWorkRow>` instead of `<ActionRowInline>`. Entry shape: `{ kind: 'subtask', subtask, parentAction, project }` |
| `computeMyWork` | Walk `action.subtasks`; for each `subtask.pic === author && subtask.status !== 'Done'`, push to `actionItems` buckets using parent action's dueDate (today/week/later). Entry shape uses `kind: 'subtask'` to distinguish from regular action entries. |
| `applyActionUpdate` | Diff the `subtasks` array (by id). Emit one entry per detected mutation: `subtask_create`, `subtask_complete`, `subtask_status_change` (revert), `subtask_reassign`, `subtask_rename`, `subtask_delete`. |

No new top-level App() state. All flows route through existing `applyActionUpdate(updatedAction, projectId, source)` since sub-tasks are a field of action, not a separate object.

---

## Detailed component changes

### 1. `SubtaskEditor` component

**Props:**
```js
{
  subtasks: Array<Subtask>,       // current list (read; component is controlled)
  picSuggestions: string[],       // names for the PIC select
  teamMembers: Array<TeamMember>, // for mention rendering (currently not used inside SubtaskEditor, kept for future)
  author: string,                 // current user, used for default PIC of new subtasks
  onChange: (updatedSubtasks) => void,  // fires on every mutation
}
```

**Render:**

```
✓ Sub-tasks (3/5 done)

▢ [Prepare contract draft.................]  [@hattt4 ▼]  [✓ Done]    🗑
▢ [Review legal terms.....................]  [@an     ▼]  [Pending]  🗑
✓ [Final approval.........................]  [@trang  ▼]  [Done]     🗑

[+ Add sub-task]
```

**Each row:**
- Status icon (▢ Pending / ✓ Done) — also serves as the click target to toggle status (via Btn variant primary if Pending, ghost if Done)
- Title input (controlled, commits on blur or Enter — same pattern as `ActionRowInline`'s title editor)
- PIC `<select>` over `picSuggestions`, with `(unassigned)` option (commits immediately)
- Remove `🗑` button (confirms inline or uses `dialogs.confirm` if available — but `SubtaskEditor` doesn't accept `dialogs` prop, so it uses native `confirm()` for simplicity; this matches existing patterns for similarly-trivial deletes)

**Add button:**

```jsx
<Btn size="sm" onClick={() => {
  const newSub = { id: uid('sub'), title: '', pic: author || '', status: 'Pending' };
  onChange([...subtasks, newSub]);
}}>+ Add sub-task</Btn>
```

After adding, focus the new row's title input (via `useRef` + `useEffect` watching list length).

### 2. `SubtaskMyWorkRow` component

**Props:**
```js
{
  subtask: Subtask,
  parentAction: ActionItem,
  project: Project,
  author: string,                       // sub-PIC (current user)
  onMarkDone: () => void,               // wired to update subtask.status = 'Done' through parent action
  onOpenParent: () => void,             // navigate to parent action's Edit form
}
```

**Render (collapsed only, no expand state):**
```
▢ Prepare contract draft                                        ✓  →
   Sub of: "Ký HD vendor X" · MA Project · 📅 May 14 (parent due)
```

- `▢` glyph (Pending) or `✓` (would not render — Done subtasks are filtered out of My Work, see Pitfall #1)
- Title (single line, ellipsis if long)
- Breadcrumb: "Sub of: <parent.title> · <project.name> · 📅 <parent.dueDate> (parent due)" — only if parent has a dueDate
- `✓ Mark done` quick button (primary variant)
- `→` ghost button: navigates to parent action's Edit form via `onOpenParent` (uses existing `onActionClick` infra)

### 3. `ActionItemForm` — render SubtaskEditor

Insert below the existing Comments section, before Save/Cancel:

```jsx
{/* ... existing fields ... */}
{/* Comments section (from Phase A.1) */}
{initial && (
  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + TOK.line }}>
    💬 Comments (N) ...
  </div>
)}

{/* v30.B — Sub-tasks section */}
{initial && onSubtasksChange && (
  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + TOK.line }}>
    <SubtaskEditor
      subtasks={initial.subtasks || []}
      picSuggestions={derivedPicSuggestions}
      teamMembers={teamMembers}
      author={author}
      onChange={onSubtasksChange}
    />
  </div>
)}

<div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
  <Btn onClick={onCancel}>Cancel</Btn>
  <Btn variant="primary" disabled={!canSave} onClick={submit}>{initial ? 'Save' : 'Create action'}</Btn>
</div>
```

The `onSubtasksChange` callback fires on every mutation, **bypassing form Save** — same lifecycle pattern as the comment post in Phase A.1. The action's subtasks array is updated immediately via the parent's mutation pipeline. The form's draft state (title/description/etc.) is untouched by this.

**ActionItemsView** wires `onSubtasksChange` to a handler that builds `updatedAction = { ...editing, subtasks: newSubtasks }` and calls `onApplyAction(updatedAction, project.id, 'Actions tab')` (or the existing fallback path).

`derivedPicSuggestions` inside ActionItemForm: derive from `teamMembers.map(m => m.name)` deduped. This is the same source `picSuggestions` uses in `ActionRowInline` (via `MyWorkView`'s `useMemo`). Compute locally inside ActionItemForm:

```js
const derivedPicSuggestions = useMemo(() => {
  const set = new Set();
  for (const m of (teamMembers || [])) if (m?.name) set.add(m.name);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}, [teamMembers]);
```

### 4. `ActionRowInline` — show progress badge + render SubtaskEditor

**Collapsed row metadata line** — add `✓ X/Y` count next to `💬 N`:

```jsx
{updates.length > 0 && <span>· 💬 {updates.length}</span>}
{(action.subtasks || []).length > 0 && (
  <span>· ✓ {(action.subtasks || []).filter((s) => s.status === 'Done').length}/{(action.subtasks || []).length}</span>
)}
```

**Expanded state** — render SubtaskEditor below the comment thread, before the existing Open Details button:

```jsx
{/* ... existing comment thread ... */}

{onSubtasksChange && (
  <div style={{ borderTop: '1px solid ' + TOK.line, paddingTop: 10 }}>
    <SubtaskEditor
      subtasks={action.subtasks || []}
      picSuggestions={picSuggestions}
      teamMembers={teamMembers}
      author={author}
      onChange={onSubtasksChange}
    />
  </div>
)}

{/* ... existing Post comment + Open in Actions tab buttons ... */}
```

**MyWorkView** wires `onSubtasksChange={(newSubtasks) => onActionUpdate({ ...a, subtasks: newSubtasks }, e.project.id)}`. The diff-logger in `applyActionUpdate` (already routed via `onActionUpdate`) detects the array change and emits the right `subtask_*` activity entries.

### 5. `computeMyWork` — walk subtasks

After the existing action-items loop (per-project), add a new walk over each action's subtasks:

```js
for (const a of (proj.actionItems || [])) {
  // ... existing mention scan (Phase A.1) ...

  // v30.B — Sub-tasks assigned to author
  for (const sub of (a.subtasks || [])) {
    if (sub.pic !== author) continue;
    if (sub.status === 'Done') continue;
    const dueDate = a.dueDate ? parseDate(a.dueDate) : null;
    const enriched = { kind: 'subtask', subtask: sub, parentAction: a, project: proj };
    if (!dueDate) {
      out.actionItems.later.push(enriched);
    } else if (dueDate <= todayEnd) {
      out.actionItems.today.push(enriched);
      if (dueDate < startOfToday) {
        out.needsAttention.push({ kind: 'overdue_subtask', subtask: sub, parentAction: a, project: proj });
      }
    } else if (dueDate <= weekEnd) {
      out.actionItems.week.push(enriched);
    } else {
      out.actionItems.later.push(enriched);
    }
  }

  // ... existing PIC-filter loop for action items ...
}
```

Existing action-item entries get an implicit `kind: 'action'` (or just no `kind`, handled by the renderer that defaults to action). For clarity, the existing action-entry shape can be tagged explicitly:

```js
const enriched = { kind: 'action', action: a, project: proj };
```

(Update the existing loop's `enriched` builder accordingly.)

Two new shapes flow through `out.actionItems`:
- `{ kind: 'action', action, project }` — existing
- `{ kind: 'subtask', subtask, parentAction, project }` — new

### 6. `MyWorkView` action-items render — dispatch by kind

```jsx
{myWork.actionItems[actionsTab].map((e, i) => {
  if (e.kind === 'subtask') {
    return (
      <SubtaskMyWorkRow
        key={`sub-${actionsTab}-${e.subtask.id}`}
        subtask={e.subtask}
        parentAction={e.parentAction}
        project={e.project}
        author={author}
        onMarkDone={() => {
          const updated = {
            ...e.parentAction,
            subtasks: (e.parentAction.subtasks || []).map((s) =>
              s.id === e.subtask.id ? { ...s, status: 'Done' } : s
            ),
          };
          onActionUpdate(updated, e.project.id);
        }}
        onOpenParent={() => onActionClick && onActionClick(e.project.id, e.parentAction.id)}
      />
    );
  }
  // kind === 'action' — existing render
  const a = e.action;
  const related = a.relatedTaskId ? findTaskInProject(e.project, a.relatedTaskId) : null;
  return <ActionRowInline ... />;
})}
```

Needs-attention render also gains a new case for `kind === 'overdue_subtask'` — render a compact row that says `⚠ Sub: <subtask.title> in "<parent.title>" was due <fmtDateShort(parent.dueDate)>`. The "→ Open" button uses `onActionClick(project.id, parent.id)`.

### 7. `applyActionUpdate` — subtask diff-logger

After the existing diff checks, add subtask diffing:

```js
const oldSubs = oldAction.subtasks || [];
const newSubs = updatedAction.subtasks || [];
const oldById = new Map(oldSubs.map((s) => [s.id, s]));
const newById = new Map(newSubs.map((s) => [s.id, s]));

// Created
for (const [id, sub] of newById.entries()) {
  if (oldById.has(id)) continue;
  log({ type: 'subtask_create', description: `Added sub-task "${sub.title || '(empty)'}" → ${sub.pic || '—'} on "${updatedAction.title}"${tag}` });
}

// Deleted
for (const [id, sub] of oldById.entries()) {
  if (newById.has(id)) continue;
  log({ type: 'subtask_delete', description: `Removed sub-task "${sub.title || '(empty)'}" from "${updatedAction.title}"${tag}` });
}

// Modified (status / pic / title)
for (const [id, sub] of newById.entries()) {
  const prev = oldById.get(id);
  if (!prev) continue;
  if (prev.status !== sub.status) {
    if (sub.status === 'Done') {
      log({ type: 'subtask_complete', description: `Sub-task done: "${sub.title}" on "${updatedAction.title}" (${sub.pic || '—'})${tag}` });
    } else {
      log({ type: 'subtask_status_change', description: `Sub-task "${sub.title}" reverted to ${sub.status} on "${updatedAction.title}"${tag}` });
    }
  }
  if (prev.pic !== sub.pic) {
    log({ type: 'subtask_reassign', description: `Sub-task "${sub.title}" reassigned: ${prev.pic || '—'} → ${sub.pic || '—'} on "${updatedAction.title}"${tag}` });
  }
  if (prev.title !== sub.title) {
    log({ type: 'subtask_rename', description: `Sub-task renamed: "${prev.title}" → "${sub.title}" on "${updatedAction.title}"${tag}` });
  }
}
```

This runs after the existing diff blocks (status / title / pic / dueDate / priority / updates).

---

## Activity log types added

| Type | When |
|---|---|
| `subtask_create` | Subtask added to an action |
| `subtask_complete` | Subtask status `Pending → Done` |
| `subtask_status_change` | Subtask status `Done → Pending` (revert) |
| `subtask_reassign` | Subtask PIC changed |
| `subtask_rename` | Subtask title changed |
| `subtask_delete` | Subtask removed |

All entries get optional `(from <source>)` suffix per existing pattern.

---

## Testing checklist

### Functional

1. **Create subtasks from Actions tab** — Edit an action → Sub-tasks section visible → click "+ Add sub-task" → row appears with focused title input → type "Prepare contract" → set PIC → activity log `Added sub-task "Prepare contract" → A on "Ký HD" (from Actions tab)`.
2. **Create subtasks from My Work** — As parent PIC, expand action in My Work → SubtaskEditor visible → add subtask → activity log `(from My Work)` suffix.
3. **Mark subtask Done from Actions tab** — Edit action → click ✓ on a subtask → status flips to Done → activity log `Sub-task done: "Prepare contract" on "Ký HD" (A) (from Actions tab)` → parent action's collapsed row in My Work shows `✓ 3/5` updated.
4. **Mark subtask Done from My Work (sub-PIC)** — As sub-PIC (different user), open My Work → subtask appears in Action items section with parent breadcrumb → click `✓` button → subtask vanishes from this user's My Work (filter `status === 'Done'`). Activity entry.
5. **Reassign subtask** — Change PIC dropdown → activity log → subtask vanishes from old PIC's My Work, appears in new PIC's My Work.
6. **Rename subtask** — Edit title input, blur → activity log `Sub-task renamed: "X" → "Y" on "..."` → only one activity entry per blur, not per keystroke.
7. **Delete subtask** — Click 🗑 → native confirm → activity log `Removed sub-task...` → row disappears.
8. **Parent shows X/Y count** — Action with 3 subtasks (1 Done) collapsed row shows `· ✓ 1/3`.
9. **Sub-PIC sees parent breadcrumb** — Row in My Work clearly indicates `Sub of: "Parent title" · Project · 📅 parent due`.
10. **Bucketing by parent's dueDate** — Action due today → all its Pending subtasks bucket to Today. Action with no dueDate → subtasks go to Later.
11. **Overdue parent → overdue subtask** — Parent action overdue → sub-PIC's needs-attention section shows the subtask with `⚠ Sub: ...`.
12. **Parent status independent** — Parent PIC marks parent action Done while subtasks still Pending → no automatic propagation. Subtasks remain visible in their PICs' My Work.

### Regression

13. **Action without subtasks renders unchanged** — Existing actions (no subtasks field) work as before. No `· ✓ X/Y` badge.
14. **Phase A.2 inline status pill / mark-done flows** — Both Action items and Tasks I own sections still work end-to-end.
15. **Phase A.1 comments flow** — Posting comments on parent action still works; subtask UI doesn't disrupt comment thread.
16. **Outline / DecisionsView untouched** — verify no changes to those views.

### Empty states

17. **Action with empty subtasks** — Sub-tasks section in Edit form shows header "Sub-tasks (0/0 done)" + "+ Add sub-task" button. No rows.
18. **No subtasks ever — display** — Parent action collapsed row shows no `· ✓ X/Y` badge (gated on `subtasks.length > 0`).

---

## Critical pitfalls

1. **Done subtasks must be filtered out of `computeMyWork`** — `if (sub.status === 'Done') continue;` is the line that prevents stale completed subtasks from cluttering sub-PIC's My Work. Same pattern as actions/decisions in Phase A.2.
2. **`computeMyWork` action entries need `kind: 'action'`** — to disambiguate from `kind: 'subtask'` in the renderer. Update the existing enriched object to include `kind`, then the MyWorkView dispatch switch is clean. Existing callers that destructure `action` from the entry will continue to work as long as `kind === 'action'` is the default render path.
3. **SubtaskEditor mutations bypass form Save (lifecycle parity with comments)** — `onChange` callback fires immediately, parent applies via `applyActionUpdate`. The form's title/description/etc. draft state is unaffected. Cancel on the form doesn't roll back subtasks (already committed).
4. **Title commit on blur/Enter, not per-keystroke** — same pattern as ActionRowInline's title input. Avoid spamming `subtask_rename` activity entries.
5. **PIC dropdown source must match between ActionItemForm and ActionRowInline** — both use `teamMembers.map(m => m.name)` deduped. ActionItemForm computes locally via useMemo; ActionRowInline already receives `picSuggestions` prop from MyWorkView. Don't introduce a third source.
6. **Subtask diff is by id, not by index** — the diff-logger uses `Map<id, sub>` lookups so reordering subtasks (a UX feature we haven't built yet but might) wouldn't produce noisy false-positive activity entries.
7. **`SubtaskMyWorkRow` is render-only — no expand** — keep it simple. If sub-PIC wants more context, the `→` button opens the parent action's Edit form via `onActionClick(projectId, parentAction.id)` (Phase A.1's auto-open path).
8. **Native `confirm()` for subtask delete is acceptable for MVP** — `dialogs.confirm` is preferred but requires threading the `dialogs` prop into SubtaskEditor. Skip the threading for now; native confirm is what TaskRowInline used at one point. Phase B.1 polish can swap if desired.
9. **Activity log entry on subtask `status === 'Pending' → 'Done'` is `subtask_complete`, the reverse is `subtask_status_change`** — same shape as action status logs in Phase A.1. Don't conflate the two.
10. **`computeMyWork` mention scan does NOT extend to subtask titles** — Phase A.1's mention scan covers `task.updates` and `action.updates`. Subtasks have no `updates[]` (per Phase B non-goals), so there's nothing to scan. If a sub-task title literally contains `@hattt4`, we don't surface it as a mention. Accepted.

---

## Implementation order

```
1. Schema reads: ensure (action.subtasks || []) used everywhere reads happen — discipline, no edits  (0 lines)
2. Build SubtaskEditor component (new, ~110 lines)
3. Build SubtaskMyWorkRow component (new, ~60 lines)
4. Extend computeMyWork: kind: 'action' tag on existing + new kind: 'subtask' walk    (~40 lines)
5. ActionRowInline: + onSubtasksChange prop + count badge + SubtaskEditor in expanded (~30 lines)
6. ActionItemForm: + onSubtasksChange prop + SubtaskEditor below comments              (~20 lines)
7. ActionItemsView: wire onSubtasksChange → applyActionUpdate                          (~10 lines)
8. MyWorkView: dispatch action vs subtask in action-items section render; wire onSubtasksChange on ActionRowInline; add overdue_subtask case in needs-attention  (~30 lines)
9. applyActionUpdate: subtasks diff block                                              (~40 lines)
10. Manual smoke test (18-item checklist)
```

Total: ~340 lines. App.jsx: 10951 → ~11290.

---

## Future-proofing notes

If users later request:

- **Sub-task comments** — add `subtask.updates[]` (same shape as action.updates). Mention scan extends. ~50 lines.
- **Sub-task dueDate** — add `subtask.dueDate`. Bucketing falls back to subtask's own dueDate if set, else parent's. ~20 lines.
- **Auto-derived parent status** — add a `parentStatusMode` field at workspace or project level. Default keeps manual.
- **Reorder subtasks** — add drag handles in SubtaskEditor. Diff-logger already handles reorder cleanly (by-id diff).
- **Multi-level nesting** — major rework. Avoid unless explicitly required.

The schema and component boundaries chosen here don't paint Phase C into a corner.
