# Action-Desk Phase A.1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface action comments in Actions tab, add direct-to-edit navigation from My Work, and enable creating actions from My Work.

**Architecture:** Single-file React (`src/App.jsx`) invariant continues. Six components touched: `ActionItemForm` gets a comment thread, `ActionItemsView` accepts an `initialEditId` prop + comment-post path via shared `applyActionUpdate`, a new `ActionCreateModal` wraps `ActionItemForm` with a project picker, `TaskRowInline` gains an optional "+ Add action" button, App() adds modal state and updates `onActionClick` to a `(projectId, actionId)` signature, `MyWorkView` adds a standalone "+ New action" button and forwards `action.id` through its callers.

**Tech Stack:** React 18.3, Vite 5.4, lucide-react icons, inline styles via `TOK`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-13-action-desk-phase-a1.md`

**Test workflow note:** No test runner. Verification per task = `npm run build` (= `tsc --noEmit && vite build`) + `npx eslint src/App.jsx`. Manual smoke test in browser only at the end after all tasks land.

---

## File structure

Only one file modified:

| File | Role |
|---|---|
| `src/App.jsx` (current 10728 lines) | All Phase A.1 changes. Will grow ~250 lines to ~10980. |

Logical units touched (current line numbers):

1. **`ActionItemForm` (~L3913)** — add comment thread + `onAddComment` prop
2. **New `ActionCreateModal`** — placed immediately above `ActionItemsView` (~L4099 area)
3. **`ActionItemsView` (~L4099)** — add `initialEditId` + `onApplyAction` props, auto-open effect, comment-post handler
4. **`TaskRowInline` (~L7536)** — add optional `onAddAction` prop + button
5. **`MyWorkView` (~L7751)** — add `onCreateAction` prop, "+ New action" button, wire `onAddAction` for owned tasks, update 3 `onActionClick` call sites
6. **`App()` (~L8933)** — add modal state + create handler + render `ActionCreateModal`, update `onActionClick` signature, update `ActionItemsView` render with new props

Edits use anchor-string matching (not line numbers) so they survive line drift between tasks.

---

## Task 1: Extend `ActionItemForm` with comment thread

**Files:** Modify `src/App.jsx` — `ActionItemForm` at ~L3913.

**Goal:** Render existing comments and a new-comment textarea inside the Edit form. Posting fires `onAddComment` callback immediately (bypassing form Save).

- [ ] **Step 1: Add new useState hooks at top of function body**

Use `Edit`:

**`old_string`:**
```js
function ActionItemForm({ initial, project, teamMembers, author, defaultRelatedTaskId, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [pic, setPic] = useState(initial?.pic || '');
  const [dueDate, setDueDate] = useState(initial?.dueDate || '');
  const [priority, setPriority] = useState(initial?.priority || 'Medium');
  const [relatedTaskId, setRelatedTaskId] = useState(initial?.relatedTaskId || defaultRelatedTaskId || '');
  const [status, setStatus] = useState(initial?.status || 'Pending');
```

**`new_string`:**
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

- [ ] **Step 2: Insert comment thread block after Related-milestone, before Save/Cancel row**

Use `Edit`:

**`old_string`:**
```js
      <div style={{ height: 12 }} />
      <FieldLabel>Related milestone (optional)</FieldLabel>
      <select value={relatedTaskId || ''} onChange={(e) => setRelatedTaskId(e.target.value)}
        style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 13, padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink }}>
        <option value="">— None —</option>
        {taskOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>

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
      <div style={{ height: 12 }} />
      <FieldLabel>Related milestone (optional)</FieldLabel>
      <select value={relatedTaskId || ''} onChange={(e) => setRelatedTaskId(e.target.value)}
        style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 13, padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink }}>
        <option value="">— None —</option>
        {taskOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>

      {/* v30.A.1 — Comment thread (Edit mode only; new actions have no comments yet) */}
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

- [ ] **Step 3: Build verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`, no errors.

- [ ] **Step 4: Lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors, 24 warnings` baseline.

- [ ] **Step 5: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(actions): comment thread inside ActionItemForm

Phase A.1 step 1/6. ActionItemForm renders existing comments and a new-
comment textarea in Edit mode (hidden during Create). Post button fires
onAddComment callback immediately, bypassing form Save lifecycle. Show
last 3 + "Show all (N)" toggle. Blocker checkbox flags comment with 🚨.

Form save flow unchanged; comments are a separate write channel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `ActionCreateModal` wrapper component

**Files:** Modify `src/App.jsx` — insert new component immediately before `ActionItemRow` (which starts at ~L4004 after Task 1's insertion).

**Goal:** Wrap `ActionItemForm` with a project picker so My Work's "+ New action" button has a place to land cross-project.

- [ ] **Step 1: Insert ActionCreateModal above ActionItemRow**

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

function ActionItemRow({ action, project, onEdit, onDelete, onSelect, selected, showCheckbox = false, teamMembers }) {
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

// v30.A.1 — Modal wrapper for creating an action from My Work. Adds a
// project picker step (hidden when only one project exists) and forwards
// optional defaults (relatedTaskId, PIC = author) into ActionItemForm.
function ActionCreateModal({ projects, defaultProjectId, defaultRelatedTaskId, author, teamMembers, onClose, onCreate }) {
  const projectIds = useMemo(() => Object.keys(projects || {}).filter((id) => id !== '__all__'), [projects]);
  const [projectId, setProjectId] = useState(defaultProjectId && projects[defaultProjectId] ? defaultProjectId : (projectIds[0] || ''));
  const project = projects[projectId];

  return (
    <Modal title="New action item" onClose={onClose} width={520}>
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
          initial={null}
          project={project}
          teamMembers={teamMembers}
          author={author}
          defaultRelatedTaskId={defaultRelatedTaskId || null}
          onSave={(newAction) => {
            const finalAction = { ...newAction, pic: newAction.pic || author || '' };
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

function ActionItemRow({ action, project, onEdit, onDelete, onSelect, selected, showCheckbox = false, teamMembers }) {
```

- [ ] **Step 2: Build verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`. No errors.

- [ ] **Step 3: Lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -10
```

Expected: `0 errors`. `ActionCreateModal` may be flagged as `no-unused-vars` warning until Task 5 wires it. That's expected — one new warning.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(actions): add ActionCreateModal wrapper

Phase A.1 step 2/6. New modal renders a project picker (hidden when
only one project in workspace) above ActionItemForm. Save normalizes
PIC to current author if empty. App.jsx wires it in step 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extend `ActionItemsView` with initialEditId + comment-post path

**Files:** Modify `src/App.jsx` — `ActionItemsView` at ~L4099.

**Goal:** Accept an external trigger to auto-open a specific action's Edit form on mount, plus wire the comment-post callback to the shared `applyActionUpdate`.

- [ ] **Step 1: Add new props to signature**

Use `Edit`:

**`old_string`:**
```js
function ActionItemsView({ project, onProjectUpdate, teamMembers, author, dialogs, onActivity, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
```

**`new_string`:**
```js
function ActionItemsView({ project, onProjectUpdate, teamMembers, author, dialogs, onActivity, showToast, initialEditId, onApplyAction }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
```

- [ ] **Step 2: Add auto-open effect after the useState block**

Find the block where local state is declared. Use `Edit`:

**`old_string`:**
```js
  const [copyHelper, setCopyHelper] = useState(null); // { html, title, gmailUrl } | null

  const actions = project.actionItems || [];
```

**`new_string`:**
```js
  const [copyHelper, setCopyHelper] = useState(null); // { html, title, gmailUrl } | null

  // v30.A.1 — Auto-open Edit form when navigated with initialEditId
  // (e.g., from My Work "→ Open"). Scroll the form into view.
  useEffect(() => {
    if (!initialEditId) return;
    const target = (project.actionItems || []).find((a) => a.id === initialEditId);
    if (!target) return;
    setEditing(target);
    setShowForm(true);
    setTimeout(() => {
      const el = document.querySelector('[data-action-form]');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, [initialEditId, project.actionItems]);

  const actions = project.actionItems || [];
```

- [ ] **Step 3: Add handleAddComment function near other handlers**

Use `Edit`:

**`old_string`:**
```js
  const startEdit = (a) => { setEditing(a); setShowForm(true); };
```

**`new_string`:**
```js
  const startEdit = (a) => { setEditing(a); setShowForm(true); };

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

- [ ] **Step 4: Wire `onAddComment` + `data-action-form` into the ActionItemForm render**

Use `Edit`:

**`old_string`:**
```js
        {showForm && (
          <div style={{ marginBottom: 14 }}>
            <ActionItemForm
              initial={editing}
              project={project}
              teamMembers={teamMembers}
              author={author}
              onSave={saveAction}
              onCancel={() => { setShowForm(false); setEditing(null); }}
            />
          </div>
        )}
```

**`new_string`:**
```js
        {showForm && (
          <div data-action-form style={{ marginBottom: 14 }}>
            <ActionItemForm
              initial={editing}
              project={project}
              teamMembers={teamMembers}
              author={author}
              onSave={saveAction}
              onCancel={() => { setShowForm(false); setEditing(null); }}
              onAddComment={editing ? handleAddComment : null}
            />
          </div>
        )}
```

- [ ] **Step 5: Build verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`, no errors.

- [ ] **Step 6: Lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors`. Warning count: 25 (24 baseline + 1 for `ActionCreateModal` unused from Task 2 — still unused until Task 5).

- [ ] **Step 7: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(actions): ActionItemsView accepts initialEditId + comment-post path

Phase A.1 step 3/6. New initialEditId prop auto-opens a specific
action's Edit form on mount with smooth scroll. New handleAddComment
routes comment posts through applyActionUpdate (via onApplyAction
prop) so the diff-logger emits the standard action_comment entry with
"(from Actions tab)" suffix. Falls back to direct project mutation +
onActivity log when onApplyAction is absent (back-compat).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `onAddAction` to `TaskRowInline`

**Files:** Modify `src/App.jsx` — `TaskRowInline` at ~L7536.

**Goal:** Render a small "+ Add action" button in the expanded state alongside Post update / Request extension / Open details.

- [ ] **Step 1: Add prop to signature**

Use `Edit`:

**`old_string`:**
```js
function TaskRowInline({ task, project, program, workstream, author, teamMembers, onStatusChange, onAddUpdate, onRequestExtension, onOpenDetails }) {
```

**`new_string`:**
```js
function TaskRowInline({ task, project, program, workstream, author, teamMembers, onStatusChange, onAddUpdate, onRequestExtension, onOpenDetails, onAddAction }) {
```

- [ ] **Step 2: Add button to expanded button row**

Use `Edit`:

**`old_string`:**
```js
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <Btn size="sm" variant="primary" disabled={!draft.trim()} onClick={() => {
              onAddUpdate(draft.trim(), isBlocker);
              setDraft(''); setIsBlocker(false); setExpanded(false);
            }}>Post update</Btn>
            <Btn size="sm" onClick={onRequestExtension}><Calendar size={11} /> Request extension</Btn>
            <Btn size="sm" variant="ghost" onClick={onOpenDetails}>→ Open full details</Btn>
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
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <Btn size="sm" variant="primary" disabled={!draft.trim()} onClick={() => {
              onAddUpdate(draft.trim(), isBlocker);
              setDraft(''); setIsBlocker(false); setExpanded(false);
            }}>Post update</Btn>
            <Btn size="sm" onClick={onRequestExtension}><Calendar size={11} /> Request extension</Btn>
            {onAddAction && (
              <Btn size="sm" onClick={(e) => { e.stopPropagation(); onAddAction(); }}><Plus size={11} /> Add action</Btn>
            )}
            <Btn size="sm" variant="ghost" onClick={onOpenDetails}>→ Open full details</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function MyWorkSubTabs({ value, onChange, tabs }) {
```

- [ ] **Step 3: Build verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`.

- [ ] **Step 4: Lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors`. Warnings 25 (baseline + ActionCreateModal still unused).

- [ ] **Step 5: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): TaskRowInline accepts onAddAction handler

Phase A.1 step 4/6. Adds optional onAddAction prop and renders a small
"+ Add action" button in the expanded state alongside Post update /
Request extension / Open full details. Button is only visible when
onAddAction is provided. e.stopPropagation prevents the row from
collapsing when clicked.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: App-level state, handlers, and modal render

**Files:** Modify `src/App.jsx` — inside `App()` at ~L8933.

**Goal:** Add state for the create modal and the initial edit ID, write the create handler, update the My Work render switch to use the new `onActionClick(projectId, actionId)` signature and pass `onCreateAction`, update the Actions tab render with new props, and render `ActionCreateModal` at the bottom.

- [ ] **Step 1: Add state right after existing markMyWorkSeen callback**

Find the state block in App. Use `Edit`:

**`old_string`:**
```js
  // v30 — mark mentions as seen. Functional setMeta keeps deps stable.
  const markMyWorkSeen = useCallback(async () => {
```

**`new_string`:**
```js
  // v30.A.1 — modal state for creating an action from My Work + state
  // for routing "→ Open" from My Work to a specific action's Edit form.
  const [actionCreate, setActionCreate] = useState(null);
  const [initialActionEditId, setInitialActionEditId] = useState(null);

  // Clear the auto-edit trigger when leaving the Actions tab so a future
  // navigation doesn't re-open a stale ID.
  useEffect(() => {
    if (view !== 'actions') setInitialActionEditId(null);
  }, [view]);

  // v30 — mark mentions as seen. Functional setMeta keeps deps stable.
  const markMyWorkSeen = useCallback(async () => {
```

- [ ] **Step 2: Add `createActionFromMyWork` handler near `applyActionUpdate`**

Use `Edit`:

**`old_string`:**
```js
  }, [projects, updateProject, logActivityForProject]);

  // v30 — Owner-only inline approve/reject of a deadline change request,
```

**`new_string`:**
```js
  }, [projects, updateProject, logActivityForProject]);

  // v30.A.1 — Create a new action in any project (from My Work entry points).
  // Prepends to actionItems so it shows immediately at the top of the
  // Actions tab list. Activity log entry tags "(from My Work)".
  const createActionFromMyWork = useCallback((newAction, projectId) => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const updated = cloneDeep(targetProj);
    updated.actionItems = [newAction, ...(updated.actionItems || [])];
    updateProject(updated);
    logActivityForProject(projectId, {
      type: 'action_create',
      description: `Created action: "${newAction.title}" → ${newAction.pic || '—'} (from My Work)`,
    });
    showToast(`Action created in ${targetProj.name}`);
  }, [projects, updateProject, logActivityForProject]);

  // v30 — Owner-only inline approve/reject of a deadline change request,
```

- [ ] **Step 3: Update `onActionClick` definition + add `onCreateAction` in render switch**

Use `Edit`:

**`old_string`:**
```js
                  onActionClick={async (projectId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setView('actions');
                  }}
```

**`new_string`:**
```js
                  onActionClick={async (projectId, actionId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setView('actions');
                    if (actionId) setInitialActionEditId(actionId);
                  }}
                  onCreateAction={(projectId, relatedTaskId) => setActionCreate({
                    projectId: projectId || currentId,
                    relatedTaskId: relatedTaskId || null,
                  })}
```

- [ ] **Step 4: Update `ActionItemsView` render call with new props**

Use `Edit`:

**`old_string`:**
```js
              {project && view === 'actions' && <ActionItemsView project={project} onProjectUpdate={updateProject} teamMembers={teamMembers} author={author} dialogs={dialogs} onActivity={logActivity} showToast={showToast} />}
```

**`new_string`:**
```js
              {project && view === 'actions' && <ActionItemsView project={project} onProjectUpdate={updateProject} teamMembers={teamMembers} author={author} dialogs={dialogs} onActivity={logActivity} showToast={showToast} initialEditId={initialActionEditId} onApplyAction={applyActionUpdate} />}
```

- [ ] **Step 5: Render `ActionCreateModal` near the bottom of App's JSX (before the closing fragment / end of return)**

Find a good spot — same level as other modal renders. The cleanest anchor is right before `<Toast />` near the end of the App component's main JSX. First read the area:

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && grep -n "<Toast toast" src/App.jsx
```

That gives one line. The modal goes just before it (sibling element).

Apply Edit:

**`old_string`:**
```js
        <Toast toast={toast} onClose={() => setToast(null)} />
```

**`new_string`:**
```js
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
        <Toast toast={toast} onClose={() => setToast(null)} />
```

- [ ] **Step 6: Build verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`, 0 errors.

- [ ] **Step 7: Lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors`. Warnings: 24 (baseline — `ActionCreateModal` is now referenced, so its unused warning clears).

- [ ] **Step 8: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): App state + handlers wire ActionCreateModal and direct nav

Phase A.1 step 5/6. App() gains:
- actionCreate state (modal control) + initialActionEditId state
- createActionFromMyWork handler — prepends to project.actionItems
  and logs action_create entry with "(from My Work)" suffix
- updated onActionClick to (projectId, actionId) signature — sets
  initialActionEditId when an actionId is passed
- onCreateAction prop on MyWorkView wired to setActionCreate
- ActionItemsView render now passes initialEditId + onApplyAction
- ActionCreateModal rendered conditionally near the end of App
- Effect clears initialActionEditId when leaving Actions tab

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: MyWorkView wires standalone button + TaskRowInline integration + onActionClick callers

**Files:** Modify `src/App.jsx` — `MyWorkView` at ~L7751.

**Goal:** Add `onCreateAction` prop to signature, render "+ New action" button in the Action items section header, wire `onAddAction` for owned-tasks `TaskRowInline` instances, and update the 3 `onActionClick` call sites to pass `action.id`.

- [ ] **Step 1: Add `onCreateAction` to MyWorkView signature**

Use `Edit`:

**`old_string`:**
```js
function MyWorkView({
  projects, author, isOwner, userPrefs, teamMembers,
  onTaskClick, onActionClick, onDecisionClick,
  onTaskUpdate, onActionUpdate,
  onApproveDeadline, onRejectDeadline,
  onMarkSeen, showToast,
}) {
```

**`new_string`:**
```js
function MyWorkView({
  projects, author, isOwner, userPrefs, teamMembers,
  onTaskClick, onActionClick, onDecisionClick, onCreateAction,
  onTaskUpdate, onActionUpdate,
  onApproveDeadline, onRejectDeadline,
  onMarkSeen, showToast,
}) {
```

- [ ] **Step 2: Add "+ New action" button to Action items section header**

Use `Edit`:

**`old_string`:**
```js
      {/* ✅ Action items assigned to me */}
      <MyWorkSection
        icon="✅" title="Action items assigned to me"
        count={counts.actions}
        defaultOpen={myWork.actionItems.today.length > 0}
        headerRight={
          <MyWorkSubTabs value={actionsTab} onChange={setActionsTab} tabs={[
            { id: 'today', label: 'Today', count: myWork.actionItems.today.length },
            { id: 'week', label: 'Week', count: myWork.actionItems.week.length },
            { id: 'later', label: 'Later', count: myWork.actionItems.later.length },
          ]} />
        }>
```

**`new_string`:**
```js
      {/* ✅ Action items assigned to me */}
      <MyWorkSection
        icon="✅" title="Action items assigned to me"
        count={counts.actions}
        defaultOpen={myWork.actionItems.today.length > 0}
        headerRight={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {onCreateAction && (
              <Btn size="sm" variant="primary" onClick={() => onCreateAction(null, null)}>
                <Plus size={11} /> New action
              </Btn>
            )}
            <MyWorkSubTabs value={actionsTab} onChange={setActionsTab} tabs={[
              { id: 'today', label: 'Today', count: myWork.actionItems.today.length },
              { id: 'week', label: 'Week', count: myWork.actionItems.week.length },
              { id: 'later', label: 'Later', count: myWork.actionItems.later.length },
            ]} />
          </div>
        }>
```

- [ ] **Step 3: Wire `onAddAction` for owned-tasks TaskRowInline instances**

Find the Tasks I own section render where `<TaskRowInline>` is invoked. Use `Edit`:

**`old_string`:**
```js
          <TaskRowInline
            key={`own-${ownedTab}-${i}`}
            task={e.task} project={e.project} program={e.program} workstream={e.workstream}
            author={author} teamMembers={teamMembers}
            onStatusChange={(st) => handleStatusChange(e.task, e.project, st)}
            onAddUpdate={(text, blocker) => handleAddUpdate(e.task, e.project, text, blocker)}
            onRequestExtension={() => handleRequestExtension(e.task, e.project)}
            onOpenDetails={() => onTaskClick(e.task.id, e.project.id)}
          />
```

**`new_string`:**
```js
          <TaskRowInline
            key={`own-${ownedTab}-${i}`}
            task={e.task} project={e.project} program={e.program} workstream={e.workstream}
            author={author} teamMembers={teamMembers}
            onStatusChange={(st) => handleStatusChange(e.task, e.project, st)}
            onAddUpdate={(text, blocker) => handleAddUpdate(e.task, e.project, text, blocker)}
            onRequestExtension={() => handleRequestExtension(e.task, e.project)}
            onOpenDetails={() => onTaskClick(e.task.id, e.project.id)}
            onAddAction={onCreateAction ? () => onCreateAction(e.project.id, e.task.id) : null}
          />
```

- [ ] **Step 4: Update overdue_action card's `onActionClick` call to pass action.id**

Use `Edit`:

**`old_string`:**
```js
                  {onActionClick && <Btn size="sm" variant="ghost" onClick={() => onActionClick(it.project.id)}>→ Open</Btn>}
```

**`new_string`:**
```js
                  {onActionClick && <Btn size="sm" variant="ghost" onClick={() => onActionClick(it.project.id, it.action.id)}>→ Open</Btn>}
```

- [ ] **Step 5: Update action items section row's `onOpenDetails` to pass action.id**

Find the `<ActionRowInline>` invocation in MyWorkView. Use `Edit`:

**`old_string`:**
```js
              onOpenDetails={onActionClick ? () => onActionClick(e.project.id) : null}
```

**`new_string`:**
```js
              onOpenDetails={onActionClick ? () => onActionClick(e.project.id, a.id) : null}
```

- [ ] **Step 6: Update Mentions card's `handleOpen` for action mentions**

Use `Edit`:

**`old_string`:**
```js
          const handleOpen = isAction
            ? () => onActionClick && onActionClick(m.project.id)
            : () => onTaskClick(m.task.id, m.project.id);
```

**`new_string`:**
```js
          const handleOpen = isAction
            ? () => onActionClick && onActionClick(m.project.id, m.action?.id)
            : () => onTaskClick(m.task.id, m.project.id);
```

- [ ] **Step 7: Build verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`, 0 errors.

- [ ] **Step 8: Lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors, 24 warnings` (baseline).

- [ ] **Step 9: Verify all `onActionClick` callers now pass action.id**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && grep -n "onActionClick(" src/App.jsx
```

Expected: every call site passes 2 arguments. Should see:
- `onActionClick(it.project.id, it.action.id)` (needs-attention)
- `onActionClick(e.project.id, a.id)` (action items row)
- `onActionClick(m.project.id, m.action?.id)` (mentions card)

No single-arg call sites should remain.

- [ ] **Step 10: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): standalone "+ New action" + inline "+ Add action" + direct-nav

Phase A.1 step 6/6. MyWorkView wires the two create-action entry points:
- "+ New action" button in the Action items section header
- Pass-through onAddAction for owned-tasks TaskRowInline instances, pre-
  fills relatedTaskId with the task's id

Also updates all three onActionClick call sites (needs-attention card,
action items row, mentions card) to pass action.id alongside project.id
so App's onActionClick handler can auto-open the specific action's Edit
form.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Manual smoke test (user-driven, no code)

**Files:** None modified. Verify the implementation against the spec's testing checklist.

- [ ] **Step 1: Start dev server (if not already running)**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run dev
```

Open `http://localhost:5173/` in browser.

- [ ] **Step 2: Walk the 17-step testing checklist from the spec**

Open `docs/superpowers/specs/2026-05-13-action-desk-phase-a1.md` and follow the "Testing checklist" section. For each item:

| # | Test | Pass criteria |
|---:|---|---|
| 1 | Comment thread inside Actions tab Edit form | Click ✏ on action → form expands → comments section visible at bottom |
| 2 | Comment sync My Work ↔ Actions | Post comment in one, see it in the other after switching |
| 3 | "→ Open" auto-opens specific action | From My Work, click → on an action → Actions tab with Edit form pre-opened + scrolled into view |
| 4 | Standalone "+ New action" | Header button in My Work Action items section → modal → save → action created |
| 5 | Inline "+ Add action" in TaskRowInline | Expand a task row → "+ Add action" button visible → click → modal with project + related task pre-filled |
| 6 | PIC defaults to current user | Open create modal without changing PIC → save → action has `pic = current user` |
| 7 | Cross-project create | Modal shows project picker when >1 project exists → switch → save → action in chosen project |
| 8 | Blocker comment | Post comment with blocker checked → activity entry has 🚨 Blocker; comment shows 🚨 |
| 9 | @mention surfaces in target user's Mentions | Sign in as mentioned user → My Work Mentions has the action mention |
| 10 | Cancel form preserves comment | Open Edit form → post comment → click Cancel → reopen → comment still there |
| 11 | Phase A flows unchanged | Inline status/PIC/due edits in My Work still work, activity entries correct |
| 12 | TaskRowInline existing buttons unchanged | Post update, Request extension, Open full details all still functional |
| 13 | ActionItemsView save flow unchanged | Saving Edit form via Save button still updates the action |
| 14 | Bulk operations unaffected | Multi-select, email PICs, Excel export all still work |
| 15 | Create with no projects | Empty workspace → modal shows "No project available." |
| 16 | Single-project workspace | Project picker hidden in modal |
| 17 | Open with deleted action ID | Stale ID → no-op, ActionItemsView renders normally |

- [ ] **Step 3: If a smoke test fails, file a follow-up note**

Add a `## Smoke test results` section at the bottom of `docs/superpowers/specs/2026-05-13-action-desk-phase-a1.md` describing what failed. Do NOT attempt fixes inside this task — Phase A.1 is feature-complete; revisions happen in a separate session.

- [ ] **Step 4: If all 17 pass, tag the commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git tag -a v30-phase-a1 -m "v30 Phase A.1: comment visibility + create-from-desk"
```

---

## Self-review pass

**Spec coverage:**

| Spec section | Task |
|---|---|
| Goals — 1. Comments visible everywhere | Task 1 (ActionItemForm comments), Task 3 (wire onAddComment via applyActionUpdate) |
| Goals — 2. One-click direct nav | Task 3 (initialEditId effect), Task 5 (App onActionClick), Task 6 (3 callers updated) |
| Goals — 3. Create from My Work | Task 2 (modal), Task 4 (TaskRowInline button), Task 5 (App state + handler), Task 6 (MyWorkView header button) |
| Components — ActionItemForm | Task 1 |
| Components — ActionItemsView | Task 3 |
| Components — MyWorkView | Task 6 |
| Components — TaskRowInline | Task 4 |
| Components — ActionCreateModal | Task 2 |
| Components — App() | Task 5 |
| Critical pitfalls — comment-post bypasses form Save | Task 1 (separate state), Task 3 (handleAddComment outside saveAction) |
| Critical pitfalls — initialEditId scrollIntoView deferred | Task 3 Step 2 (setTimeout 50) |
| Critical pitfalls — `onActionClick` signature change | Task 5 (App definition), Task 6 (3 callers) |
| Critical pitfalls — mention card for actions | Task 6 Step 6 |
| Critical pitfalls — don't double-log on comment | Task 3 Step 3 (uses applyActionUpdate exclusively; else branch is no-op fallback) |
| Critical pitfalls — PIC fallback at save | Task 2 (onSave normalizes pic) |

All 16 testing checklist items are covered between Task 1 (#1, #10), Task 3 (#3, #11), Task 5 (#4, #5), and Task 6 (#2, #3, #5, #6, #9), with Task 7 walking the full list.

**Placeholder scan:** No "TBD", "implement later", or vague requirements. All steps have full code blocks. The only `// ...` comments are inline annotations explaining intent, not placeholders.

**Type consistency:**
- `onAddComment(text, isBlocker)` — Task 1 (signature), Task 3 (caller). Consistent.
- `onAddAction()` — no-arg in Task 4. In Task 6 wired as `() => onCreateAction(projectId, taskId)`. Consistent.
- `onCreateAction(projectId, relatedTaskId)` — both nullable. Task 5 wires App state; Task 6 invokes from MyWorkView. Consistent.
- `onApplyAction(action, projectId, source)` — matches `applyActionUpdate` signature. Task 3 (caller), Task 5 (provider). Consistent.
- `initialEditId: string | null` — Task 3 (consumer), Task 5 (provider state). Consistent.
- `onActionClick(projectId, actionId)` — 2-arg form. Task 5 (App definition), Task 6 (3 call sites). Consistent.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-action-desk-phase-a1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, commit per task. Same approach as Phase A.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Either approach stops after Task 6's commit. Task 7 (smoke test) is user-driven.
