# Action-Desk Phase A.1 — Comment Visibility + Create-From-Desk

**Date:** 2026-05-13
**App:** AF MTP — extends Phase A spec (`docs/superpowers/specs/2026-05-13-action-desk-redesign.md`)
**Status:** Design — pending implementation
**Effort:** ~4-6h in-app

---

## Background

Phase A landed action items as section #2 in My Work with inline editing and a new `action.updates[]` comment schema. User feedback after smoke-testing:

1. Comments posted in My Work don't surface anywhere else — Actions tab still displays each action as a flat row without comments, and the Edit form there has no comment thread. Users post a comment, switch to Actions tab to look at the same action, see nothing → think comments were lost.
2. "→ Open" button on action items in My Work navigates to the Actions tab listing — user still has to find the specific action and click ✏ to edit. Not direct enough.
3. No way to create a new action from My Work. Users who want to "add a thing I need to do" while looking at their desk have to switch to Actions tab.

This phase fixes all three.

---

## Goals

1. **Comments are visible from anywhere they exist** — render the comment thread inside `ActionItemForm` (Edit mode) so users see + post comments without leaving Actions tab
2. **One-click navigation from My Work** — "→ Open" on an action lands the user on its specific Edit form (auto-opened, scrolled into view)
3. **Create actions from My Work** — two entry points: a standalone "+ New action" button at the head of the Action items section, and a small "+ Add action" button inside `TaskRowInline` expanded state (pre-fills task context)

**Non-goals:**

- Sub-actions / hierarchy with multi-PIC — still deferred to Phase B
- Showing comment thread inside the Actions tab list rows (only inside the edit form when expanded)
- Project picker inside `ActionItemForm` directly — wrapped by a new `ActionCreateModal` that handles project selection externally
- Replacing the existing inline `pencil` edit button with a side-panel ActionDetail — defer to Phase B if still wanted
- Backfilling existing actions with `updates[]` — schema is purely additive

---

## Cross-cutting principles (in addition to Phase A's)

1. **Comment-post bypasses form Save lifecycle** — the form's Save/Cancel buttons commit field edits; posting a comment is a separate immediate action. A comment posted in the form persists even if user clicks Cancel afterward.
2. **Consistent diff-logger** — all action mutations route through `applyActionUpdate` so the audit trail picks up "(from <source>)" suffixes correctly. ActionItemsView keeps using its existing `onProjectUpdate` for save-driven form commits in Phase A.1 (no global refactor), but comment-posts and creates use `applyActionUpdate`.
3. **Cross-project create is two-step** — `ActionCreateModal` first asks (or accepts as prop) which project the new action belongs to; once chosen, `ActionItemForm` renders scoped to that project. This avoids inflating `ActionItemForm` with a project picker.
4. **PIC default is current user** — when creating from My Work, the form initializes `pic = author`. User can override before save.

---

## Schema additions

None. Phase A.1 reuses existing fields:
- `action.updates[]` (introduced in Phase A) — comment thread storage
- `action.relatedTaskId` (existing) — for the task→action pre-fill flow

---

## Components touched

| File / Component | Change |
|---|---|
| `src/App.jsx` | All changes (single-file invariant) |
| `ActionItemForm` (~L3913) | + comment thread display + `onAddComment` callback prop |
| `ActionItemsView` (~L4099) | + `initialEditId` prop; auto-`startEdit` on mount when set; + `onApplyAction` prop for comment-post path |
| `MyWorkView` (~L7790-area) | + "+ New action" button in Action items header; + inline "+ Add action" handler passed to `TaskRowInline`; pass `action.id` to `onActionClick` |
| `TaskRowInline` (~L7516) | + `onAddAction` prop, render small "+ Add action" button in expanded state |
| New `ActionCreateModal` | wraps `ActionItemForm` with project picker; placed near other modals in App.jsx |
| `App()` | + `actionCreate` modal state, + `createActionFromMyWork` handler, + `initialActionEditId` state, + `onActionClick` accepts action.id |

---

## Detailed component changes

### 1. `ActionItemForm` — comment thread

**New props:**
- `onAddComment?: (text: string, isBlocker: boolean) => void` — fires immediately on Post button click; the form's internal Save flow is not involved

**Render addition (placed AFTER the Related-milestone field, BEFORE the Save/Cancel button row):**

```jsx
{/* Comment thread (only shown when editing an existing action — not on Create) */}
{initial && (
  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + TOK.line }}>
    <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 8 }}>
      💬 Comments ({(initial.updates || []).length})
    </div>
    {(initial.updates || []).slice(0, showAllComments ? Infinity : 3).map((u) => (
      <div key={u.id} style={{ fontSize: 12.5, color: TOK.ink, padding: '6px 0', borderBottom: '1px dashed ' + TOK.line }}>
        <div style={{ fontSize: 10.5, color: TOK.muted, marginBottom: 2 }}>
          <span style={{ color: TOK.ink, fontWeight: 500 }}>{u.author}</span> · {myWorkTimeAgo(u.timestamp)}
          {u.isBlocker && <span style={{ marginLeft: 6, color: TOK.blocker, fontWeight: 500 }}>🚨 Blocker</span>}
        </div>
        <MentionedText text={u.text} teamMembers={teamMembers} />
      </div>
    ))}
    {(initial.updates || []).length > 3 && !showAllComments && (
      <button onClick={() => setShowAllComments(true)} style={{ background: 'none', border: 'none', color: TOK.accent, fontSize: 11.5, cursor: 'pointer', padding: '4px 0', fontFamily: FONT_STACK }}>
        Show all ({(initial.updates || []).length})
      </button>
    )}
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
          <input type="checkbox" checked={isBlocker} onChange={(e) => setIsBlocker(e.target.checked)} /> Mark as blocker
        </label>
        <div style={{ marginTop: 8 }}>
          <Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={() => {
            onAddComment(commentDraft.trim(), isBlocker);
            setCommentDraft(''); setIsBlocker(false);
          }}>Post comment</Btn>
        </div>
      </div>
    )}
  </div>
)}
```

**New state hooks (added near other useState calls at top of function):**
```js
const [commentDraft, setCommentDraft] = useState('');
const [isBlocker, setIsBlocker] = useState(false);
const [showAllComments, setShowAllComments] = useState(false);
```

**Key behavior:**
- Thread shows last 3 comments, "Show all (N)" toggle reveals rest
- Post button disabled when draft is empty
- After post, `commentDraft` and `isBlocker` clear; the textarea is ready for another comment
- Comments are visible on the Edit mode only (gated by `initial` truthy)
- When editing a Create flow (no `initial`), the comment section is hidden — newly created actions have no comments yet

### 2. `ActionItemsView` — auto-open from external trigger

**New props:**
- `initialEditId?: string | null` — when set on mount or when changes, ActionItemsView finds that action in `project.actionItems` and calls `startEdit(action)` on it; also scrolls the form into view
- `onApplyAction?: (action, projectId, source) => void` — points to App.jsx's `applyActionUpdate`; used by the comment-post path; if absent, falls back to `onProjectUpdate` (back-compat)

**New effect (inside ActionItemsView, after `editing` state is declared):**

```js
useEffect(() => {
  if (!initialEditId) return;
  const target = (project.actionItems || []).find((a) => a.id === initialEditId);
  if (!target) return;
  setEditing(target);
  setShowForm(true);
  // Scroll form into view after render
  setTimeout(() => {
    const el = document.querySelector('[data-action-form]');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}, [initialEditId, project.actionItems]);
```

**Comment-post wiring (passed to ActionItemForm):**
```js
const handleAddComment = (text, isBlocker) => {
  if (!editing) return;
  const newEntry = { id: uid('aupd'), timestamp: new Date().toISOString(), author, text, isBlocker: !!isBlocker };
  const updated = { ...editing, updates: [newEntry, ...(editing.updates || [])] };
  // Update editing state so the form re-renders the new comment immediately
  setEditing(updated);
  // Mutate project via the shared cross-project path
  if (onApplyAction) {
    onApplyAction(updated, project.id, 'Actions tab');
  } else {
    onProjectUpdate({ ...project, actionItems: (project.actionItems || []).map((a) => a.id === updated.id ? updated : a) });
    onActivity({ type: 'action_comment', description: `Posted comment on action "${updated.title}"${isBlocker ? ' 🚨 Blocker' : ''} (from Actions tab)` });
  }
};
```

**ActionItemForm invocation gets `onAddComment={handleAddComment}` and `data-action-form` attribute on the wrapper.**

### 3. New `ActionCreateModal`

Wraps `ActionItemForm` with project-selection step. Placed near other modal-style components (e.g., `MeetingExportDialog`).

```jsx
function ActionCreateModal({ projects, defaultProjectId, defaultRelatedTaskId, author, teamMembers, onClose, onCreate }) {
  const projectIds = useMemo(() => Object.keys(projects || {}), [projects]);
  const [projectId, setProjectId] = useState(defaultProjectId || projectIds[0] || '');
  const project = projects[projectId];

  return (
    <Modal title="New action item" onClose={onClose} width={520}>
      {/* Project picker — hidden if only one project available */}
      {projectIds.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Project</FieldLabel>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
            style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 13, padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink }}>
            {projectIds.map((id) => <option key={id} value={id}>{projects[id]?.name || id}</option>)}
          </select>
        </div>
      )}
      {project ? (
        <ActionItemForm
          initial={null}                                    // create mode
          project={project}
          teamMembers={teamMembers}
          author={author}
          defaultRelatedTaskId={defaultRelatedTaskId || null}
          onSave={(newAction) => {
            // PIC default: if not set by user, use author
            const finalAction = { ...newAction, pic: newAction.pic || author };
            onCreate(finalAction, projectId);
            onClose();
          }}
          onCancel={onClose}
        />
      ) : (
        <div style={{ color: TOK.muted, fontSize: 13 }}>No project available.</div>
      )}
    </Modal>
  );
}
```

**Key behavior:**
- Project picker only renders when more than one project is in the workspace
- `defaultProjectId` from caller (e.g., current task's project) pre-selects
- `defaultRelatedTaskId` flows through to `ActionItemForm`
- PIC defaults to `author` on save if user didn't pick

### 4. `MyWorkView` — entry points

**Standalone button** in the Action items section header (next to the Today/Week/Later tabs):

```jsx
headerRight={
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Btn size="sm" variant="primary" onClick={() => onCreateAction && onCreateAction(null, null)}>
      <Plus size={11} /> New action
    </Btn>
    <MyWorkSubTabs value={actionsTab} onChange={setActionsTab} tabs={[
      { id: 'today', label: 'Today', count: myWork.actionItems.today.length },
      { id: 'week', label: 'Week', count: myWork.actionItems.week.length },
      { id: 'later', label: 'Later', count: myWork.actionItems.later.length },
    ]} />
  </div>
}
```

`onCreateAction(projectId, relatedTaskId)` is a new prop; when called with `(null, null)` it means "no defaults, user picks project in modal."

**Inline button** in the `TaskRowInline` expanded state (added next to existing buttons):

```jsx
{onAddAction && (
  <Btn size="sm" onClick={() => onAddAction()}>
    <Plus size={11} /> Add action
  </Btn>
)}
```

`onAddAction` is a new prop; the caller (MyWorkView) wires it as `() => onCreateAction(project.id, task.id)`.

**Mention/Open routing:**
- `onActionClick` signature changes from `(projectId) => void` to `(projectId, actionId) => void`
- Where called: action row "→" button, overdue_action needs-attention button, mention card "→ Open action" button — all pass `(e.project.id, e.action.id)` or equivalent

### 5. `TaskRowInline` — pass through

**New prop:** `onAddAction?: () => void` — when present, render the "+ Add action" button in the expanded state's action row alongside Post update / Request extension / Open full details.

### 6. `App()` — wire everything

**New state:**
```js
const [actionCreate, setActionCreate] = useState(null); // { projectId, relatedTaskId } | null
const [initialActionEditId, setInitialActionEditId] = useState(null);
```

**New handler:**
```js
const createActionFromMyWork = (newAction, projectId) => {
  const targetProj = projects[projectId];
  if (!targetProj) return;
  const updated = cloneDeep(targetProj);
  updated.actionItems = [newAction, ...(updated.actionItems || [])];
  updateProject(updated);
  logActivityForProject(projectId, {
    type: 'action_create',
    description: `Created action: "${newAction.title}" → ${newAction.pic} (from My Work)`,
  });
  showToast(`Action created in ${targetProj.name}`);
};
```

**Updated `onActionClick` in my-work render switch:**
```js
onActionClick={async (projectId, actionId) => {
  if (projectId && projectId !== currentId) {
    await switchProject(projectId);
  }
  setView('actions');
  if (actionId) setInitialActionEditId(actionId);
}}
```

**Pass `initialEditId` to `ActionItemsView` in render switch:**
```jsx
{project && view === 'actions' && (
  <ActionItemsView
    project={project}
    onProjectUpdate={updateProject}
    teamMembers={teamMembers}
    author={author}
    dialogs={dialogs}
    onActivity={logActivity}
    showToast={showToast}
    initialEditId={initialActionEditId}
    onApplyAction={applyActionUpdate}
  />
)}
```

**Clear `initialActionEditId` after consume** — add to the existing effect that resets state on view change, or use a one-shot mechanism:
```js
useEffect(() => {
  if (view !== 'actions') setInitialActionEditId(null);
}, [view]);
```

Also clear when ActionItemsView consumes it (the auto-edit effect inside ActionItemsView could call an `onConsumed` callback, but the view-change reset above is simpler and sufficient).

**Pass `onCreateAction` to MyWorkView:**
```jsx
onCreateAction={(projectId, relatedTaskId) => setActionCreate({ projectId: projectId || currentId, relatedTaskId })}
```

**Render the modal at the bottom of App.jsx:**
```jsx
{actionCreate && (
  <ActionCreateModal
    projects={projects}
    defaultProjectId={actionCreate.projectId}
    defaultRelatedTaskId={actionCreate.relatedTaskId}
    author={author}
    teamMembers={teamMembers}
    onClose={() => setActionCreate(null)}
    onCreate={createActionFromMyWork}
  />
)}
```

---

## Testing checklist

### Functional

1. **Comment in Actions tab edit form** — In Actions tab, click ✏ on an action → form expands → comment section visible at bottom with existing comments rendered. Post a comment → it appears in thread immediately. Activity log entry `Posted comment on action "X" (from Actions tab)`.
2. **Same action shows comment in My Work** — Post comment in Actions tab → switch to My Work → expand same action → comment visible in its thread. Vice versa.
3. **"→ Open" from My Work goes to specific action** — Click → on an action in My Work → Actions tab view → that action's Edit form is auto-opened + scrolled into view. (If cross-project: project switches first, then Actions tab opens with target editing.)
4. **Standalone "+ New action" in My Work** — Click "+ New action" in Action items header → modal opens. Project picker shows current project pre-selected. Fill title + Save → action created in selected project. Toast confirms. Activity log entry `Created action: "X" → <pic> (from My Work)`.
5. **Inline "+ Add action" in TaskRowInline** — Expand a task row in "Tasks I own" → "+ Add action" button visible alongside "Post update" / "Request extension" / "Open full details". Click → modal opens with project + related task pre-filled. Title input focused. Save → action created with `relatedTaskId = task.id`.
6. **PIC defaults to current user** — Open create modal without changing PIC → save → created action has `pic = current user`.
7. **Cross-project create** — In workspace with multiple projects, click "+ New action" → project picker visible → switch project → form re-scopes → save → action created in chosen project.
8. **Blocker comment from Actions tab** — Post comment with blocker checked → activity entry has `🚨 Blocker`; comment renders with red marker.
9. **@mention in comment surfaces** — In Actions tab, post `@trangvk fyi` → sign in as Trangvk → My Work Mentions section has the action mention with [UNREAD] badge.
10. **Cancel form preserves comment** — Open Edit form → post comment → click Cancel on form fields → reopen → comment still there (post bypasses form Save).

### Regression

11. **Phase A flows unchanged** — All Phase A inline edits still work; no breaking changes to `applyActionUpdate` signature or behavior beyond what's specified.
12. **TaskRowInline still posts task updates** — Adding "+ Add action" doesn't break Post update / Request extension / Open details buttons.
13. **ActionItemsView form save unchanged** — Saving an action via Save button on the Edit form still works via existing `onProjectUpdate` + `onActivity` chain.
14. **Bulk operations unaffected** — Multi-select, email PICs, Excel export in ActionItemsView all still work.

### Empty states

15. **Create with no projects** — If `projects` is empty (impossible in practice but worth checking), modal shows "No project available."
16. **Single project workspace** — Project picker hidden; form scoped to the only project.
17. **Open from My Work with deleted action** — If user has stale data, `initialEditId` doesn't match any action; auto-edit effect no-ops; ActionItemsView renders normally.

---

## Critical pitfalls

1. **Comment-post must not be inside the form's draft state** — `commentDraft`, `isBlocker`, `showAllComments` are local to ActionItemForm. The `updates[]` array on the action is updated via `onAddComment` callback (which calls back to ActionItemsView → `applyActionUpdate`). After the parent updates the action, the form re-renders with the new comment in `initial.updates`. Do NOT include `updates[]` in the form's local draft state — that would cause race conditions and lost comments on Cancel.
2. **`initialEditId` consumption** — The effect that triggers auto-edit must depend on `[initialEditId, project.actionItems]` so it re-runs if the action list changes. If only `[initialEditId]`, switching to Actions tab with an old initialEditId won't re-trigger after data refresh.
3. **Scroll-into-view must be deferred** — `scrollIntoView` runs after the form is mounted. Use a `setTimeout(..., 50)` to wait for the next paint. Without delay, the form node doesn't exist yet and scroll silently no-ops.
4. **ActionCreateModal project picker disappearance** — When `projectIds.length === 1`, picker is hidden. If the workspace later gains a second project (unlikely mid-session, but defensively), the next open of the modal will show the picker. No state should persist between modal sessions.
5. **PIC default fallback** — `pic: newAction.pic || author` runs at save time. If `author` is null (race condition before name resolution), PIC could be empty string. The action would still save but show as unassigned. Defensible behavior; not a regression.
6. **Don't double-log on comment post** — The diff-logger in `applyActionUpdate` already emits `action_comment` when `updates.length` increases. ActionItemsView's `handleAddComment` should call `applyActionUpdate` (which logs once) — NOT call both `applyActionUpdate` AND `onActivity` (would double-log).
7. **`onActionClick` signature change is breaking** — All call sites must update to pass `(projectId, actionId)`. Phase A has 3+ call sites (mention card, overdue_action card, "→" buttons in action rows). Grep before deploying to ensure no stale single-arg calls.
8. **Mention card for actions used to pass `m.project.id` only** — Now must pass `m.action.id` too. Update the `handleOpen` ternary in MyWorkView Mentions section accordingly.

---

## Implementation order

```
1. Extend ActionItemForm with comment section (+ onAddComment prop)         (~60 lines)
2. ActionItemsView: add initialEditId + onApplyAction props + handleAddComment + scroll effect  (~30 lines)
3. New ActionCreateModal component                                          (~70 lines)
4. App.jsx: state + handlers + onActionClick signature + render modal       (~40 lines)
5. TaskRowInline: + onAddAction prop + button in expanded state             (~10 lines)
6. MyWorkView: + onCreateAction prop + standalone button + wire to TaskRowInline + update onActionClick callers  (~40 lines)
7. Manual smoke test (17-item checklist above)
```

Total: ~250 lines added. App.jsx: 10728 → ~10980.

---

## Phase B preview (still deferred)

Phase B will introduce sub-actions hierarchy and a dedicated ActionDetail side-panel. Phase A.1 does NOT preclude either — adding subtasks later just augments the existing Edit form, and adding a side-panel doesn't conflict with the inline form. The choice between embedded vs reference schema (Asana vs Jira style) remains open.
