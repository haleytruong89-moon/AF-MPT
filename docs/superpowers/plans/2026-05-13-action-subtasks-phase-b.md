# Phase B — Action Sub-tasks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `action.subtasks[]` schema, a reusable `SubtaskEditor` consumed by both `ActionItemForm` and `ActionRowInline`, and a minimal `SubtaskMyWorkRow` so sub-PICs see their work in My Work.

**Architecture:** Single-file React (`src/App.jsx`) invariant continues. Schema purely additive. computeMyWork tags entries with `kind: 'action' | 'subtask'`; MyWorkView dispatches by kind. applyActionUpdate's diff-logger extends to subtask changes. Two new components + 5 modifications.

**Tech Stack:** React 18.3, Vite 5.4, lucide-react. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-13-action-subtasks-phase-b.md`

**Test workflow:** No test runner. Verification per task = `npm run build` + `npx eslint src/App.jsx`. Manual smoke test in browser at end.

---

## File structure

Only one file modified:

| File | Role |
|---|---|
| `src/App.jsx` (current 10951 lines) | All Phase B changes. Will grow ~340 lines to ~11290. |

Logical units touched:

1. **`computeMyWork` (~L715)** — tag existing entries `kind: 'action'`; add subtask walk emitting `kind: 'subtask'`
2. **`applyActionUpdate` (~L9374)** — append subtask diff-logger
3. **NEW `SubtaskEditor`** — placed near other action components (~after L4064)
4. **NEW `SubtaskMyWorkRow`** — placed near `ActionRowInline` (~after L7872)
5. **`ActionRowInline` (~L7740)** — count badge in collapsed; SubtaskEditor in expanded
6. **`ActionItemForm` (~L3928)** — SubtaskEditor below comment thread
7. **`ActionItemsView` (~L4201)** — wire `onSubtasksChange` to `applyActionUpdate` path
8. **`MyWorkView` (~L7893)** — dispatch by kind in action items render; needs-attention `overdue_subtask` branch

---

## Task 1: Extend `computeMyWork` — tag kinds + subtask walk

**Files:** Modify `src/App.jsx` — `computeMyWork` (~L715).

**Goal:** Add `kind: 'action'` to existing action entries; emit `kind: 'subtask'` entries for sub-PIC's pending subtasks bucketed by parent's dueDate.

- [ ] **Step 1: Tag existing action entries with `kind: 'action'`**

Use `Edit`:

**`old_string`:**
```js
    for (const a of (proj.actionItems || [])) {
      if (a.pic !== author) continue;
      if (a.status === 'Done' || a.status === 'Cancelled' || a.status === 'Dropped') continue;
      const dueDate = a.dueDate ? parseDate(a.dueDate) : null;
      const enriched = { action: a, project: proj };
      if (!dueDate) {
        out.actionItems.later.push(enriched);
      } else if (dueDate <= todayEnd) {
        out.actionItems.today.push(enriched);
        if (dueDate < startOfToday) out.needsAttention.push({ kind: 'overdue_action', ...enriched });
      } else if (dueDate <= weekEnd) {
        out.actionItems.week.push(enriched);
      } else {
        out.actionItems.later.push(enriched);
      }
    }
```

**`new_string`:**
```js
    for (const a of (proj.actionItems || [])) {
      // v30.B — Sub-tasks assigned to author (regardless of action.pic).
      // Bucketed by parent action's dueDate; Done subtasks filtered out.
      for (const sub of (a.subtasks || [])) {
        if (sub.pic !== author) continue;
        if (sub.status === 'Done') continue;
        const pDueDate = a.dueDate ? parseDate(a.dueDate) : null;
        const subEntry = { kind: 'subtask', subtask: sub, parentAction: a, project: proj };
        if (!pDueDate) {
          out.actionItems.later.push(subEntry);
        } else if (pDueDate <= todayEnd) {
          out.actionItems.today.push(subEntry);
          if (pDueDate < startOfToday) {
            out.needsAttention.push({ kind: 'overdue_subtask', subtask: sub, parentAction: a, project: proj });
          }
        } else if (pDueDate <= weekEnd) {
          out.actionItems.week.push(subEntry);
        } else {
          out.actionItems.later.push(subEntry);
        }
      }

      if (a.pic !== author) continue;
      if (a.status === 'Done' || a.status === 'Cancelled' || a.status === 'Dropped') continue;
      const dueDate = a.dueDate ? parseDate(a.dueDate) : null;
      const enriched = { kind: 'action', action: a, project: proj };
      if (!dueDate) {
        out.actionItems.later.push(enriched);
      } else if (dueDate <= todayEnd) {
        out.actionItems.today.push(enriched);
        if (dueDate < startOfToday) out.needsAttention.push({ kind: 'overdue_action', ...enriched });
      } else if (dueDate <= weekEnd) {
        out.actionItems.week.push(enriched);
      } else {
        out.actionItems.later.push(enriched);
      }
    }
```

- [ ] **Step 2: Build verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`, 0 errors. (Note: MyWorkView consumers don't yet check `e.kind`, so this still works — they destructure `e.action` for action entries. The `kind: 'subtask'` entries currently render as actions trying to read `e.action` which is undefined. This is a partial-state — Task 8 fixes the render. The build still passes because there's no compile-time error; just runtime errors when subtask entries appear. To verify build only, this is fine. Smoke test fails until Task 8.)

- [ ] **Step 3: Lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors, 24 warnings` (baseline).

- [ ] **Step 4: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): computeMyWork tags entry kinds + walks subtasks

Phase B step 1/8. Existing action entries now carry kind: 'action'.
New subtask walk emits kind: 'subtask' entries with shape
{ subtask, parentAction, project } for every Pending subtask whose
sub.pic === author. Subtask entries are bucketed by the parent
action's dueDate (Today/Week/Later) and surface in needs-attention
as kind: 'overdue_subtask' when parent's dueDate is past.

MyWorkView's action-items render doesn't yet branch on kind —
subtask entries will mis-render until Task 8 wires the dispatch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `applyActionUpdate` with subtask diff-logger

**Files:** Modify `src/App.jsx` — `applyActionUpdate` (~L9374).

**Goal:** Detect adds, deletes, status changes, reassigns, and renames inside `action.subtasks`. Emit typed activity entries.

- [ ] **Step 1: Append subtask diff block after the existing `action_comment` check**

Use `Edit`:

**`old_string`:**
```js
    if ((oldAction.updates?.length || 0) < (updatedAction.updates?.length || 0)) {
      const newest = (updatedAction.updates || [])[0];
      log({ type: 'action_comment', description: `Posted comment on action "${updatedAction.title}"${newest?.isBlocker ? ' 🚨 Blocker' : ''}${tag}` });
    }
  }, [projects, updateProject, logActivityForProject]);

  // v30.A.2 — Apply a decision update to any project. Diff-logger covers
```

**`new_string`:**
```js
    if ((oldAction.updates?.length || 0) < (updatedAction.updates?.length || 0)) {
      const newest = (updatedAction.updates || [])[0];
      log({ type: 'action_comment', description: `Posted comment on action "${updatedAction.title}"${newest?.isBlocker ? ' 🚨 Blocker' : ''}${tag}` });
    }
    // v30.B — Sub-task diffs (by id; reorder is invisible)
    const oldSubs = oldAction.subtasks || [];
    const newSubs = updatedAction.subtasks || [];
    const oldSubMap = new Map(oldSubs.map((s) => [s.id, s]));
    const newSubMap = new Map(newSubs.map((s) => [s.id, s]));
    for (const [id, sub] of newSubMap.entries()) {
      if (oldSubMap.has(id)) continue;
      log({ type: 'subtask_create', description: `Added sub-task "${sub.title || '(empty)'}" → ${sub.pic || '—'} on "${updatedAction.title}"${tag}` });
    }
    for (const [id, sub] of oldSubMap.entries()) {
      if (newSubMap.has(id)) continue;
      log({ type: 'subtask_delete', description: `Removed sub-task "${sub.title || '(empty)'}" from "${updatedAction.title}"${tag}` });
    }
    for (const [id, sub] of newSubMap.entries()) {
      const prev = oldSubMap.get(id);
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
  }, [projects, updateProject, logActivityForProject]);

  // v30.A.2 — Apply a decision update to any project. Diff-logger covers
```

- [ ] **Step 2: Build + lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -3
```

Expected: green build, 0 errors.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(actions): applyActionUpdate logs subtask mutations

Phase B step 2/8. Adds six activity-log types:
- subtask_create (added by id)
- subtask_delete (removed by id)
- subtask_complete (Pending → Done)
- subtask_status_change (Done → Pending revert)
- subtask_reassign (pic change)
- subtask_rename (title change)

Diff is by id so reorder is invisible. Each entry gets the standard
"(from <source>)" tag from the existing helper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Build `SubtaskEditor` component

**Files:** Modify `src/App.jsx` — insert new component immediately before `ActionItemRow` is fine, OR immediately after `ActionItemForm` (~L4065). For minimal disruption, place AFTER `ActionItemForm` so the editor sits with its consumers.

Actually, `SubtaskEditor` is consumed by both `ActionItemForm` (caller defined first) AND `ActionRowInline` (caller defined ~3700 lines later). JavaScript function declarations are hoisted within their scope, so order doesn't matter at runtime — but for readability place it just after `ActionItemForm` (~L4065) since that's the more "design-y" surface and the form will be the primary place users encounter it.

- [ ] **Step 1: Insert `SubtaskEditor` after `ActionItemForm`'s closing `}`**

Use `Edit`:

**`old_string`:**
```js
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" disabled={!canSave} onClick={submit}>{initial ? 'Save' : 'Create action'}</Btn>
      </div>
    </div>
  );
}

// v30.A.1 — Modal wrapper for creating an action from My Work. Adds a
// project picker step (hidden when only one project exists) and forwards
// optional defaults (relatedTaskId, PIC = author) into ActionItemForm.
function ActionCreateModal({ projects, defaultProjectId, defaultRelatedTaskId, author, teamMembers, onClose, onCreate }) {
```

**`new_string`:**
```js
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" disabled={!canSave} onClick={submit}>{initial ? 'Save' : 'Create action'}</Btn>
      </div>
    </div>
  );
}

// v30.B — Editor for an action's subtasks list. Reused in ActionItemForm
// (Actions tab Edit) and ActionRowInline (My Work expanded). Mutations
// fire onChange immediately, bypassing any form Save lifecycle.
function SubtaskEditor({ subtasks, picSuggestions, author, onChange }) {
  const list = subtasks || [];
  const doneCount = list.filter((s) => s.status === 'Done').length;
  const newRowRef = useRef(null);
  const focusNextRef = useRef(false);

  useEffect(() => {
    if (focusNextRef.current && newRowRef.current) {
      newRowRef.current.focus();
      focusNextRef.current = false;
    }
  }, [list.length]);

  const update = (idx, patch) => {
    onChange(list.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };
  const remove = (idx) => {
    const target = list[idx];
    if (!window.confirm(`Remove sub-task "${target.title || '(empty)'}"?`)) return;
    onChange(list.filter((_, i) => i !== idx));
  };
  const add = () => {
    focusNextRef.current = true;
    onChange([...list, { id: uid('sub'), title: '', pic: author || '', status: 'Pending' }]);
  };
  const toggleStatus = (idx) => {
    const target = list[idx];
    update(idx, { status: target.status === 'Done' ? 'Pending' : 'Done' });
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 8 }}>
        ✓ Sub-tasks ({doneCount}/{list.length} done)
      </div>
      {list.map((s, idx) => (
        <SubtaskEditorRow
          key={s.id}
          subtask={s}
          picSuggestions={picSuggestions}
          autoFocus={idx === list.length - 1 && newRowRef}
          inputRefAttach={idx === list.length - 1 ? newRowRef : null}
          onUpdate={(patch) => update(idx, patch)}
          onToggleStatus={() => toggleStatus(idx)}
          onRemove={() => remove(idx)}
        />
      ))}
      <Btn size="sm" onClick={add}><Plus size={11} /> Add sub-task</Btn>
    </div>
  );
}

// Inner row — title input commits on blur/Enter to avoid spamming
// subtask_rename activity entries during typing.
function SubtaskEditorRow({ subtask, picSuggestions, inputRefAttach, onUpdate, onToggleStatus, onRemove }) {
  const [titleDraft, setTitleDraft] = useState(subtask.title || '');
  useEffect(() => { setTitleDraft(subtask.title || ''); }, [subtask.title]);
  const commitTitle = () => {
    if (titleDraft !== subtask.title) onUpdate({ title: titleDraft });
  };
  const done = subtask.status === 'Done';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px dashed ' + TOK.line }}>
      <button
        type="button"
        onClick={onToggleStatus}
        title={done ? 'Mark pending' : 'Mark done'}
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: done ? TOK.doneFg : TOK.subtle, fontSize: 13, padding: '4px 6px',
        }}>
        {done ? '✓' : '▢'}
      </button>
      <input
        ref={inputRefAttach}
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
        placeholder="Sub-task title"
        style={{
          flex: 1, minWidth: 0, fontFamily: FONT_STACK, fontSize: 12,
          padding: '4px 6px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6,
          background: TOK.surface, color: TOK.ink, outline: 'none',
          textDecoration: done ? 'line-through' : 'none',
          opacity: done ? 0.65 : 1,
        }}
      />
      <select
        value={subtask.pic || ''}
        onChange={(e) => onUpdate({ pic: e.target.value })}
        style={{ fontFamily: FONT_STACK, fontSize: 11.5, padding: '3px 6px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, minWidth: 110 }}>
        <option value="">(unassigned)</option>
        {(picSuggestions || []).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button
        type="button"
        onClick={onRemove}
        title="Remove sub-task"
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: TOK.muted, padding: '4px 6px', fontSize: 13 }}>
        🗑
      </button>
    </div>
  );
}

// v30.A.1 — Modal wrapper for creating an action from My Work. Adds a
// project picker step (hidden when only one project exists) and forwards
// optional defaults (relatedTaskId, PIC = author) into ActionItemForm.
function ActionCreateModal({ projects, defaultProjectId, defaultRelatedTaskId, author, teamMembers, onClose, onCreate }) {
```

Note: `autoFocus` prop in the outer SubtaskEditor was a half-thought — actual focus is done via the `inputRefAttach` mechanism. The `autoFocus={idx === list.length - 1 && newRowRef}` line in the SubtaskEditor is harmless (passed but unused by SubtaskEditorRow); we can leave it or strip it. Strip it for cleanliness — final `new_string` should pass only `inputRefAttach`, not the `autoFocus` line. **Apply this correction before running the Edit** — i.e., the actual `new_string` you submit should NOT contain the `autoFocus={...}` line. Use:

```jsx
        <SubtaskEditorRow
          key={s.id}
          subtask={s}
          picSuggestions={picSuggestions}
          inputRefAttach={idx === list.length - 1 ? newRowRef : null}
          onUpdate={(patch) => update(idx, patch)}
          onToggleStatus={() => toggleStatus(idx)}
          onRemove={() => remove(idx)}
        />
```

(i.e., remove the `autoFocus={...}` line). Apply the Edit with this cleaner version.

- [ ] **Step 2: Build + lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -8
```

Expected: green build, 0 errors. Warnings should jump to 26 (24 baseline + 2 new `no-unused-vars` for `SubtaskEditor` and `SubtaskEditorRow` until Tasks 5/6 wire them).

- [ ] **Step 3: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(actions): add SubtaskEditor reusable component

Phase B step 3/8. Renders a list of subtasks with toggle/title/PIC/
remove controls plus an "Add sub-task" button. Title input commits
on blur or Enter to avoid spamming subtask_rename activity entries.
Native confirm() for the delete prompt (MVP simplification).

Component not yet referenced — Tasks 5 and 6 will wire it into
ActionRowInline and ActionItemForm respectively.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Build `SubtaskMyWorkRow` component

**Files:** Modify `src/App.jsx` — insert new component immediately after `ActionRowInline` (closing `}` ~L7872).

**Goal:** Minimal display row for sub-PIC's My Work: title + parent breadcrumb + ✓ Mark done button + → Open parent button. No expand state.

- [ ] **Step 1: Insert `SubtaskMyWorkRow` after `ActionRowInline`**

Use `Edit`:

**`old_string`:**
```js
      )}
    </div>
  );
}

function MyWorkSubTabs({ value, onChange, tabs }) {
```

Wait — there are multiple matches for this pattern. Use a more specific anchor that includes the unique end of `ActionRowInline` (which has the comment block ending `</div>` followed by ChevronDown). Construct a multi-line anchor that includes the last few lines of `ActionRowInline`:

**`old_string`:**
```js
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={() => {
                  onAddComment(commentDraft.trim(), isBlocker);
                  setCommentDraft(''); setIsBlocker(false);
                }}>Post comment</Btn>
                {onOpenDetails && <Btn size="sm" variant="ghost" onClick={onOpenDetails}>→ Open in Actions tab</Btn>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MyWorkSubTabs({ value, onChange, tabs }) {
```

**`new_string`:**
```js
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={() => {
                  onAddComment(commentDraft.trim(), isBlocker);
                  setCommentDraft(''); setIsBlocker(false);
                }}>Post comment</Btn>
                {onOpenDetails && <Btn size="sm" variant="ghost" onClick={onOpenDetails}>→ Open in Actions tab</Btn>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// v30.B — Minimal row for a sub-task in sub-PIC's My Work. No expand,
// no comments — just title + parent breadcrumb + ✓ Mark done + → Open
// parent. Sub-task structure: { id, title, pic, status }.
function SubtaskMyWorkRow({ subtask, parentAction, project, teamMembers, onMarkDone, onOpenParent }) {
  return (
    <div style={{ border: '1px solid ' + TOK.line, borderRadius: 8, marginBottom: 6, background: TOK.surface, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: TOK.subtle, fontSize: 13, lineHeight: 1 }}>▢</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <MentionedText text={subtask.title || '(untitled sub-task)'} teamMembers={teamMembers} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', fontSize: 11, color: TOK.muted }}>
          <span>Sub of: "<span style={{ color: TOK.ink }}>{parentAction.title}</span>"</span>
          <span>· {project.name}</span>
          {parentAction.dueDate && <span>· 📅 {fmtDateShort(parentAction.dueDate)} (parent due)</span>}
        </div>
      </div>
      {onMarkDone && (
        <Btn size="sm" variant="primary" onClick={onMarkDone} title="Mark done">✓</Btn>
      )}
      {onOpenParent && (
        <Btn size="sm" variant="ghost" onClick={onOpenParent} title="Open parent action">→</Btn>
      )}
    </div>
  );
}

function MyWorkSubTabs({ value, onChange, tabs }) {
```

- [ ] **Step 2: Build + lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -8
```

Expected: green build, 0 errors. Warnings still at 26 (SubtaskMyWorkRow now also unused — until Task 8 wires it).

- [ ] **Step 3: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): add SubtaskMyWorkRow minimal display

Phase B step 4/8. Renders one row for a sub-task in sub-PIC's My
Work: title + breadcrumb (Sub of parent · project · parent due) +
✓ Mark done + → Open parent. No expand state — sub-PIC marks done
and moves on. Component will be referenced by MyWorkView in Task 8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire `SubtaskEditor` into `ActionRowInline`

**Files:** Modify `src/App.jsx` — `ActionRowInline` (~L7740).

**Goal:** Show `✓ X/Y` count badge in collapsed row; render `<SubtaskEditor>` in expanded state below the comment thread.

- [ ] **Step 1: Add `onSubtasksChange` to props signature**

Use `Edit`:

**`old_string`:**
```js
function ActionRowInline({ action, project, related, author, teamMembers, picSuggestions, onChange, onAddComment, onOpenDetails, onMarkDone }) {
```

**`new_string`:**
```js
function ActionRowInline({ action, project, related, author, teamMembers, picSuggestions, onChange, onAddComment, onOpenDetails, onMarkDone, onSubtasksChange }) {
```

- [ ] **Step 2: Add subtask count badge next to `💬 N` in collapsed metadata line**

Use `Edit`:

**`old_string`:**
```js
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', fontSize: 11, color: TOK.muted }}>
            <span>{project.name}</span>
            {related && <span>· {related.program.name} › {related.workstream.name} › {related.task.name}</span>}
            {action.dueDate && <span style={{ color: overdue ? TOK.overdueFg : TOK.muted, fontWeight: overdue ? 500 : 400 }}>· 📅 {fmtDateShort(action.dueDate)}</span>}
            {updates.length > 0 && <span>· 💬 {updates.length}</span>}
          </div>
```

**`new_string`:**
```js
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', fontSize: 11, color: TOK.muted }}>
            <span>{project.name}</span>
            {related && <span>· {related.program.name} › {related.workstream.name} › {related.task.name}</span>}
            {action.dueDate && <span style={{ color: overdue ? TOK.overdueFg : TOK.muted, fontWeight: overdue ? 500 : 400 }}>· 📅 {fmtDateShort(action.dueDate)}</span>}
            {updates.length > 0 && <span>· 💬 {updates.length}</span>}
            {(action.subtasks || []).length > 0 && (
              <span>· ✓ {(action.subtasks || []).filter((s) => s.status === 'Done').length}/{(action.subtasks || []).length}</span>
            )}
          </div>
```

- [ ] **Step 3: Insert SubtaskEditor in expanded state between comment thread and the Open Details button**

The expanded section currently has a comments block followed by `<div style={{ marginTop: 8 }}>` containing the comment textarea and Open Details button. We want the SubtaskEditor to render in its own block AFTER the comments block AND BEFORE the Open Details button.

Looking at the structure: the comments are inside the `<div style={{ borderTop: '1px solid ' + TOK.line, paddingTop: 10 }}>` which also wraps the new-comment textarea + Open Details. We want SubtaskEditor as a peer block (its own bordered section) directly after the comments wrapper closes, before the closing `</div>` of the expanded state.

Use `Edit`:

**`old_string`:**
```js
            <div style={{ marginTop: 8 }}>
              <MentionTextarea
                value={commentDraft}
                onChange={setCommentDraft}
                rows={2}
                placeholder={`Type @ to mention. Posted as ${author || '…'}.`}
                teamMembers={teamMembers}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={isBlocker} onChange={(e) => setIsBlocker(e.target.checked)} /> Mark as blocker
              </label>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={() => {
                  onAddComment(commentDraft.trim(), isBlocker);
                  setCommentDraft(''); setIsBlocker(false);
                }}>Post comment</Btn>
                {onOpenDetails && <Btn size="sm" variant="ghost" onClick={onOpenDetails}>→ Open in Actions tab</Btn>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// v30.B — Minimal row for a sub-task in sub-PIC's My Work. No expand,
```

**`new_string`:**
```js
            <div style={{ marginTop: 8 }}>
              <MentionTextarea
                value={commentDraft}
                onChange={setCommentDraft}
                rows={2}
                placeholder={`Type @ to mention. Posted as ${author || '…'}.`}
                teamMembers={teamMembers}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={isBlocker} onChange={(e) => setIsBlocker(e.target.checked)} /> Mark as blocker
              </label>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={() => {
                  onAddComment(commentDraft.trim(), isBlocker);
                  setCommentDraft(''); setIsBlocker(false);
                }}>Post comment</Btn>
                {onOpenDetails && <Btn size="sm" variant="ghost" onClick={onOpenDetails}>→ Open in Actions tab</Btn>}
              </div>
            </div>
          </div>

          {onSubtasksChange && (
            <div style={{ borderTop: '1px solid ' + TOK.line, paddingTop: 10 }}>
              <SubtaskEditor
                subtasks={action.subtasks || []}
                picSuggestions={picSuggestions}
                author={author}
                onChange={onSubtasksChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// v30.B — Minimal row for a sub-task in sub-PIC's My Work. No expand,
```

- [ ] **Step 4: Build + lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -8
```

Expected: green build, 0 errors. Warnings now 25 (SubtaskEditor referenced; SubtaskMyWorkRow still unused until Task 8). `SubtaskEditorRow` is referenced inside `SubtaskEditor` so it should also clear from unused.

- [ ] **Step 5: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): ActionRowInline shows subtask count + embeds editor

Phase B step 5/8. Collapsed row metadata line gains "✓ X/Y" badge
next to "💬 N" when action.subtasks is non-empty. Expanded state
renders the new SubtaskEditor in its own bordered section below the
comment thread, gated by onSubtasksChange being provided.

MyWorkView wires onSubtasksChange in Task 8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire `SubtaskEditor` into `ActionItemForm`

**Files:** Modify `src/App.jsx` — `ActionItemForm` (~L3928).

**Goal:** Render SubtaskEditor below comment thread, above Save/Cancel. Compute local `picSuggestions` from `teamMembers`.

- [ ] **Step 1: Add `onSubtasksChange` to signature + derive `picSuggestions`**

Use `Edit`:

**`old_string`:**
```js
function ActionItemForm({ initial, project, teamMembers, author, defaultRelatedTaskId, onSave, onCancel, onAddComment }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [pic, setPic] = useState(initial?.pic || '');
  const [dueDate, setDueDate] = useState(initial?.dueDate || '');
  const [priority, setPriority] = useState(initial?.priority || 'Medium');
  const [relatedTaskId, setRelatedTaskId] = useState(initial?.relatedTaskId || defaultRelatedTaskId || '');
  const [status, setStatus] = useState(initial?.status || 'Pending');
  // v30.A.1 — comment thread state (Edit mode only)
  const [commentDraft, setCommentDraft] = useState('');
  const [commentIsBlocker, setCommentIsBlocker] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
```

**`new_string`:**
```js
function ActionItemForm({ initial, project, teamMembers, author, defaultRelatedTaskId, onSave, onCancel, onAddComment, onSubtasksChange }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [pic, setPic] = useState(initial?.pic || '');
  const [dueDate, setDueDate] = useState(initial?.dueDate || '');
  const [priority, setPriority] = useState(initial?.priority || 'Medium');
  const [relatedTaskId, setRelatedTaskId] = useState(initial?.relatedTaskId || defaultRelatedTaskId || '');
  const [status, setStatus] = useState(initial?.status || 'Pending');
  // v30.A.1 — comment thread state (Edit mode only)
  const [commentDraft, setCommentDraft] = useState('');
  const [commentIsBlocker, setCommentIsBlocker] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  // v30.B — picSuggestions for SubtaskEditor PIC dropdown
  const derivedPicSuggestions = useMemo(() => {
    const set = new Set();
    for (const m of (teamMembers || [])) if (m?.name) set.add(m.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [teamMembers]);
```

- [ ] **Step 2: Insert SubtaskEditor block after the comments section, before Save/Cancel**

Use `Edit`:

**`old_string`:**
```js
          {onAddComment && (
            <div style={{ marginTop: 10 }}>
              <MentionTextarea
                value={commentDraft}
                onChange={setCommentDraft}
                rows={2}
                placeholder={`Type @ to mention. Posted as ${author || '…'}.`}
                teamMembers={teamMembers}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={commentIsBlocker} onChange={(e) => setCommentIsBlocker(e.target.checked)} /> Mark as blocker
              </label>
              <div style={{ marginTop: 8 }}>
                <Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={() => {
                  onAddComment(commentDraft.trim(), commentIsBlocker);
                  setCommentDraft(''); setCommentIsBlocker(false);
                }}>Post comment</Btn>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" disabled={!canSave} onClick={submit}>{initial ? 'Save' : 'Create action'}</Btn>
      </div>
    </div>
  );
}
```

**`new_string`:**
```js
          {onAddComment && (
            <div style={{ marginTop: 10 }}>
              <MentionTextarea
                value={commentDraft}
                onChange={setCommentDraft}
                rows={2}
                placeholder={`Type @ to mention. Posted as ${author || '…'}.`}
                teamMembers={teamMembers}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={commentIsBlocker} onChange={(e) => setCommentIsBlocker(e.target.checked)} /> Mark as blocker
              </label>
              <div style={{ marginTop: 8 }}>
                <Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={() => {
                  onAddComment(commentDraft.trim(), commentIsBlocker);
                  setCommentDraft(''); setCommentIsBlocker(false);
                }}>Post comment</Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {/* v30.B — Sub-tasks (Edit mode only; new actions get them once saved) */}
      {initial && onSubtasksChange && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + TOK.line }}>
          <SubtaskEditor
            subtasks={initial.subtasks || []}
            picSuggestions={derivedPicSuggestions}
            author={author}
            onChange={onSubtasksChange}
          />
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" disabled={!canSave} onClick={submit}>{initial ? 'Save' : 'Create action'}</Btn>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build + lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors. Warnings 25 (SubtaskMyWorkRow still unused).

- [ ] **Step 4: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(actions): ActionItemForm embeds SubtaskEditor in Edit mode

Phase B step 6/8. New onSubtasksChange prop; SubtaskEditor renders
below the comment thread, above Save/Cancel. Gated by initial (Edit
mode) and onSubtasksChange — new actions don't show the editor
until they're saved and re-opened. Local derivedPicSuggestions
useMemo provides the PIC dropdown source from teamMembers.

ActionItemsView wires onSubtasksChange in Task 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire `onSubtasksChange` in `ActionItemsView`

**Files:** Modify `src/App.jsx` — `ActionItemsView` (~L4201).

**Goal:** Add a `handleSubtasksChange` handler that routes through `applyActionUpdate` (the same path used by `handleAddComment`), and pass it to the rendered `ActionItemForm`.

- [ ] **Step 1: Add `handleSubtasksChange` near `handleAddComment`**

Find the existing `handleAddComment` block. Use `Edit`:

**`old_string`:**
```js
  // v30.A.1 — Post a comment immediately (bypasses form Save). Routes
  // through the shared applyActionUpdate so the diff-logger emits the
  // standard action_comment entry. Falls back to direct project update
  // if onApplyAction prop is absent (back-compat).
  const handleAddComment = (text, isBlocker) => {
    if (!editing) return;
    const newEntry = { id: uid('aupd'), timestamp: new Date().toISOString(), author, text, isBlocker: !!isBlocker };
    const updated = { ...editing, updates: [newEntry, ...(editing.updates || [])] };
    setEditing(updated);
    if (onApplyAction) {
      onApplyAction(updated, project.id, 'Actions tab');
    } else {
      onProjectUpdate({ ...project, actionItems: (project.actionItems || []).map((a) => a.id === updated.id ? updated : a) });
      onActivity({ type: 'action_comment', description: `Posted comment on action "${updated.title}"${isBlocker ? ' 🚨 Blocker' : ''} (from Actions tab)` });
    }
  };
```

**`new_string`:**
```js
  // v30.A.1 — Post a comment immediately (bypasses form Save). Routes
  // through the shared applyActionUpdate so the diff-logger emits the
  // standard action_comment entry. Falls back to direct project update
  // if onApplyAction prop is absent (back-compat).
  const handleAddComment = (text, isBlocker) => {
    if (!editing) return;
    const newEntry = { id: uid('aupd'), timestamp: new Date().toISOString(), author, text, isBlocker: !!isBlocker };
    const updated = { ...editing, updates: [newEntry, ...(editing.updates || [])] };
    setEditing(updated);
    if (onApplyAction) {
      onApplyAction(updated, project.id, 'Actions tab');
    } else {
      onProjectUpdate({ ...project, actionItems: (project.actionItems || []).map((a) => a.id === updated.id ? updated : a) });
      onActivity({ type: 'action_comment', description: `Posted comment on action "${updated.title}"${isBlocker ? ' 🚨 Blocker' : ''} (from Actions tab)` });
    }
  };

  // v30.B — Apply sub-task list changes immediately (bypasses form Save).
  // Same lifecycle pattern as handleAddComment. Diff-logger inside
  // applyActionUpdate emits typed subtask_* activity entries.
  const handleSubtasksChange = (newSubtasks) => {
    if (!editing) return;
    const updated = { ...editing, subtasks: newSubtasks };
    setEditing(updated);
    if (onApplyAction) {
      onApplyAction(updated, project.id, 'Actions tab');
    } else {
      onProjectUpdate({ ...project, actionItems: (project.actionItems || []).map((a) => a.id === updated.id ? updated : a) });
    }
  };
```

- [ ] **Step 2: Pass `onSubtasksChange` to ActionItemForm in the render**

Use `Edit`:

**`old_string`:**
```js
            <ActionItemForm
              key={editing?.id || 'new'}
              initial={editing}
              project={project}
              teamMembers={teamMembers}
              author={author}
              onSave={saveAction}
              onCancel={() => { setShowForm(false); setEditing(null); }}
              onAddComment={editing ? handleAddComment : null}
            />
```

**`new_string`:**
```js
            <ActionItemForm
              key={editing?.id || 'new'}
              initial={editing}
              project={project}
              teamMembers={teamMembers}
              author={author}
              onSave={saveAction}
              onCancel={() => { setShowForm(false); setEditing(null); }}
              onAddComment={editing ? handleAddComment : null}
              onSubtasksChange={editing ? handleSubtasksChange : null}
            />
```

- [ ] **Step 3: Build + lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors. Warnings 25.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(actions): ActionItemsView routes subtask edits via applyActionUpdate

Phase B step 7/8. New handleSubtasksChange mirrors handleAddComment's
shape — sets editing optimistically, then routes through
onApplyAction so the diff-logger emits subtask_* activity entries
with "(from Actions tab)" suffix. Falls back to direct project
update if onApplyAction prop is absent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `MyWorkView` — dispatch by kind + wire `onSubtasksChange` + needs-attention overdue_subtask

**Files:** Modify `src/App.jsx` — `MyWorkView` (~L7893).

**Goal:** In the Action items section, render `<SubtaskMyWorkRow>` for `kind === 'subtask'` entries and `<ActionRowInline>` for `kind === 'action'`. Wire `onSubtasksChange` on ActionRowInline. Add `overdue_subtask` branch in needs-attention.

- [ ] **Step 1: Dispatch by kind in Action items section render**

Use `Edit`:

**`old_string`:**
```js
        {myWork.actionItems[actionsTab].length === 0 ? (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>No action items in this bucket.</div>
        ) : myWork.actionItems[actionsTab].map((e, i) => {
          const a = e.action;
          const related = a.relatedTaskId ? findTaskInProject(e.project, a.relatedTaskId) : null;
          return (
            <ActionRowInline
              key={`a-${actionsTab}-${a.id || i}`}
              action={a}
              project={e.project}
              related={related}
              author={author}
              teamMembers={teamMembers}
              picSuggestions={picSuggestions}
              onChange={(patch) => onActionUpdate({ ...a, ...patch }, e.project.id)}
              onAddComment={(text, blocker) => onActionUpdate({
                ...a,
```

**`new_string`:**
```js
        {myWork.actionItems[actionsTab].length === 0 ? (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>No action items in this bucket.</div>
        ) : myWork.actionItems[actionsTab].map((e, i) => {
          if (e.kind === 'subtask') {
            const sub = e.subtask;
            const parent = e.parentAction;
            return (
              <SubtaskMyWorkRow
                key={`sub-${actionsTab}-${sub.id || i}`}
                subtask={sub}
                parentAction={parent}
                project={e.project}
                teamMembers={teamMembers}
                onMarkDone={() => {
                  const updatedParent = {
                    ...parent,
                    subtasks: (parent.subtasks || []).map((s) => s.id === sub.id ? { ...s, status: 'Done' } : s),
                  };
                  onActionUpdate(updatedParent, e.project.id);
                }}
                onOpenParent={() => onActionClick && onActionClick(e.project.id, parent.id)}
              />
            );
          }
          const a = e.action;
          const related = a.relatedTaskId ? findTaskInProject(e.project, a.relatedTaskId) : null;
          return (
            <ActionRowInline
              key={`a-${actionsTab}-${a.id || i}`}
              action={a}
              project={e.project}
              related={related}
              author={author}
              teamMembers={teamMembers}
              picSuggestions={picSuggestions}
              onChange={(patch) => onActionUpdate({ ...a, ...patch }, e.project.id)}
              onAddComment={(text, blocker) => onActionUpdate({
                ...a,
```

- [ ] **Step 2: Add `onSubtasksChange` prop to the ActionRowInline call**

Find the existing ActionRowInline invocation. Use `Edit`:

**`old_string`:**
```js
              onMarkDone={() => handleActionDone(a, e.project)}
              onOpenDetails={onActionClick ? () => onActionClick(e.project.id, a.id) : null}
            />
          );
        })}
```

**`new_string`:**
```js
              onMarkDone={() => handleActionDone(a, e.project)}
              onOpenDetails={onActionClick ? () => onActionClick(e.project.id, a.id) : null}
              onSubtasksChange={(newSubtasks) => onActionUpdate({ ...a, subtasks: newSubtasks }, e.project.id)}
            />
          );
        })}
```

- [ ] **Step 3: Add `overdue_subtask` branch in needs-attention render**

Find the existing `kind === 'overdue_action'` branch — `overdue_subtask` should be handled adjacent to it.

Use `Edit`:

**`old_string`:**
```js
          if (it.kind === 'overdue_action') {
            const related = it.action.relatedTaskId ? findTaskInProject(it.project, it.action.relatedTaskId) : null;
            return (
              <div key={`na-${i}`} style={{ borderLeft: '3px solid ' + TOK.overdueFg, padding: '8px 12px', background: TOK.overdueBg + '40', marginBottom: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TOK.ink }}>
                  ⚠ <MentionedText text={it.action.title || '(untitled action)'} teamMembers={teamMembers} />
                </div>
                <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span>{it.project.name}</span>
                  {related && <span>· {related.program.name} › {related.workstream.name} › {related.task.name}</span>}
                  <span style={{ color: TOK.overdueFg, fontWeight: 500 }}>· was due {fmtDateShort(it.action.dueDate)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Btn size="sm" variant="primary" onClick={() => handleActionDone(it.action, it.project)}>✓ Mark done</Btn>
                  {onActionClick && <Btn size="sm" variant="ghost" onClick={() => onActionClick(it.project.id, it.action.id)}>→ Open</Btn>}
                </div>
              </div>
            );
          }
```

**`new_string`:**
```js
          if (it.kind === 'overdue_action') {
            const related = it.action.relatedTaskId ? findTaskInProject(it.project, it.action.relatedTaskId) : null;
            return (
              <div key={`na-${i}`} style={{ borderLeft: '3px solid ' + TOK.overdueFg, padding: '8px 12px', background: TOK.overdueBg + '40', marginBottom: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TOK.ink }}>
                  ⚠ <MentionedText text={it.action.title || '(untitled action)'} teamMembers={teamMembers} />
                </div>
                <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span>{it.project.name}</span>
                  {related && <span>· {related.program.name} › {related.workstream.name} › {related.task.name}</span>}
                  <span style={{ color: TOK.overdueFg, fontWeight: 500 }}>· was due {fmtDateShort(it.action.dueDate)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Btn size="sm" variant="primary" onClick={() => handleActionDone(it.action, it.project)}>✓ Mark done</Btn>
                  {onActionClick && <Btn size="sm" variant="ghost" onClick={() => onActionClick(it.project.id, it.action.id)}>→ Open</Btn>}
                </div>
              </div>
            );
          }
          if (it.kind === 'overdue_subtask') {
            const sub = it.subtask;
            const parent = it.parentAction;
            return (
              <div key={`na-${i}`} style={{ borderLeft: '3px solid ' + TOK.overdueFg, padding: '8px 12px', background: TOK.overdueBg + '40', marginBottom: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TOK.ink }}>
                  ⚠ Sub: <MentionedText text={sub.title || '(untitled sub-task)'} teamMembers={teamMembers} />
                </div>
                <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span>in "{parent.title}"</span>
                  <span>· {it.project.name}</span>
                  <span style={{ color: TOK.overdueFg, fontWeight: 500 }}>· parent was due {fmtDateShort(parent.dueDate)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Btn size="sm" variant="primary" onClick={() => {
                    const updatedParent = {
                      ...parent,
                      subtasks: (parent.subtasks || []).map((s) => s.id === sub.id ? { ...s, status: 'Done' } : s),
                    };
                    onActionUpdate(updatedParent, it.project.id);
                  }}>✓ Mark done</Btn>
                  {onActionClick && <Btn size="sm" variant="ghost" onClick={() => onActionClick(it.project.id, parent.id)}>→ Open parent</Btn>}
                </div>
              </div>
            );
          }
```

- [ ] **Step 4: Build verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`, 0 errors.

- [ ] **Step 5: Lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors, 24 warnings` — back to baseline. Both `SubtaskEditor` (used in Tasks 5+6) and `SubtaskMyWorkRow` (used here) are now referenced.

- [ ] **Step 6: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): dispatch action vs subtask + wire subtask editor + overdue_subtask

Phase B step 8/8. Action items section in MyWorkView now branches on
e.kind: 'subtask' renders SubtaskMyWorkRow with the parent-context
breadcrumb and a Mark-done button that patches the parent action's
subtasks array; 'action' renders ActionRowInline as before. The
ActionRowInline call now passes onSubtasksChange so parent PICs
manage subtasks inline from My Work.

Needs-attention adds a new overdue_subtask card mirroring the
overdue_action layout but with sub-task framing and an "Open
parent" action.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Manual smoke test (user-driven, no code)

**Files:** None. Verify the implementation against the spec's testing checklist.

- [ ] **Step 1: Start dev server (if not already running)**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run dev
```

Open `http://localhost:5173/` in browser.

- [ ] **Step 2: Walk the 18-item checklist from the spec**

| # | Test | Pass criteria |
|---:|---|---|
| 1 | Create subtask from Actions tab Edit | `+ Add sub-task` button → row appears with focused title input → type + set PIC → activity entry `subtask_create` |
| 2 | Create subtask from My Work expanded | Same as #1 but inside ActionRowInline expanded state |
| 3 | Mark subtask Done from Actions tab | Click ✓ on subtask row → status flips → activity `subtask_complete` → parent's collapsed row shows updated `✓ X/Y` |
| 4 | Mark subtask Done from My Work (sub-PIC) | Sub-PIC opens My Work → subtask row visible with parent breadcrumb → click ✓ → row disappears |
| 5 | Reassign subtask | PIC dropdown change → activity `subtask_reassign` → row moves between PICs' My Work views |
| 6 | Rename subtask | Edit title input, blur → activity `subtask_rename` (only on blur, not per keystroke) |
| 7 | Delete subtask | Click 🗑 → native confirm → activity `subtask_delete` |
| 8 | Parent shows X/Y count | Action with 3 subtasks (1 Done) → collapsed row shows `· ✓ 1/3` |
| 9 | Sub-PIC sees parent breadcrumb | Row clearly indicates `Sub of: "<parent>" · Project · 📅 parent due` |
| 10 | Bucketing by parent dueDate | Parent due today → all Pending subtasks in Today bucket. No parent dueDate → Later |
| 11 | Overdue parent → overdue subtask | Parent overdue → sub-PIC's needs-attention shows the subtask `⚠ Sub: ...` |
| 12 | Parent status independent | Mark parent Done while subs still Pending → no auto-propagation; subs still appear in PIC My Works |
| 13 | Action without subtasks renders unchanged | No `· ✓ X/Y` badge |
| 14 | Phase A.2 task flows unchanged | Mark done, status pill, etc. all work |
| 15 | Phase A.1 comment flow unchanged | Comments still work; SubtaskEditor doesn't disrupt |
| 16 | Outline / DecisionsView untouched | No changes |
| 17 | Empty subtasks in Edit form | "Sub-tasks (0/0 done)" header + Add button |
| 18 | Reorder no false rename | (Reorder UI not built; verify diff-by-id resilience: manually edit a subtask's title twice quickly to confirm only one rename entry on blur) |

- [ ] **Step 3: If smoke test fails, file follow-up note in spec**

Add `## Smoke test results` section at bottom of spec describing what failed. Phase B is feature-complete; revisions in a separate session.

- [ ] **Step 4: If all 18 pass, tag**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git tag -a v30-phase-b -m "v30 Phase B: action sub-tasks with multi-PIC steps"
```

---

## Self-review pass

**Spec coverage:**

| Spec section | Task |
|---|---|
| Goal 1: Schema additive | Task 2 (subtasks read in diff), Tasks 3/4/5/6/8 (reads everywhere via `(action.subtasks || [])`) |
| Goal 2: Reusable SubtaskEditor | Task 3 (build), Task 5 (consume in ActionRowInline), Task 6 (consume in ActionItemForm) |
| Goal 3: Sub-PIC visibility | Task 1 (computeMyWork emits kind:subtask), Task 4 (SubtaskMyWorkRow), Task 8 (dispatch by kind) |
| Goal 4: Parent X/Y badge | Task 5 (collapsed metadata line) |
| Goal 5: Manual parent status | No code change needed — by omission (no auto-derive logic anywhere). Spec compliance is "we don't write the auto-derive code". Verified by absence in diff. |
| Goal 6: Activity log subtask_* | Task 2 (diff-logger) |
| Critical pitfall 1: Done filter | Task 1 (`if (sub.status === 'Done') continue;`) |
| Critical pitfall 2: kind tag | Task 1 (existing → 'action', new → 'subtask') |
| Critical pitfall 3: Subtask edits bypass form Save | Task 7 (handleSubtasksChange routes through applyActionUpdate directly) |
| Critical pitfall 4: Title commit on blur/Enter | Task 3 (SubtaskEditorRow uses local draft + commitTitle) |
| Critical pitfall 5: PIC source consistency | Task 6 (derivedPicSuggestions = same shape as MyWorkView's picSuggestions) |
| Critical pitfall 6: Diff by id | Task 2 (Map<id, sub>) |
| Critical pitfall 7: SubtaskMyWorkRow no expand | Task 4 (no expand state at all) |
| Critical pitfall 8: native confirm for delete | Task 3 (`window.confirm`) |
| Critical pitfall 9: complete vs status_change distinction | Task 2 (separate branches) |
| Critical pitfall 10: mention scan does not touch subtask titles | Task 1 (no mention scan added for subtasks) |

All testing items covered by Task 9.

**Placeholder scan:** None. The Task 3 note about removing the `autoFocus={...}` line is a clarification, not a placeholder.

**Type consistency:**
- `subtask` field name on entries — consistent across Tasks 1/4/8
- `parentAction` field — consistent
- `onSubtasksChange(newSubtasks)` — signature matches across Tasks 3/5/6/7/8
- `kind: 'action' | 'subtask' | 'overdue_action' | 'overdue_subtask'` — defined in Task 1, consumed in Task 8
- Activity types `subtask_*` — defined in Task 2, no consumers in the rest of the plan

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-action-subtasks-phase-b.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, commit per task. Same approach as Phase A.1 / A.2.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Either approach stops after Task 8's commit. Task 9 (smoke test) is user-driven.
