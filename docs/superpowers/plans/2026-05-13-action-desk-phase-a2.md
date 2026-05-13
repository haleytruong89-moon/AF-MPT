# Action-Desk Phase A.2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter Completed tasks out of My Work, add ✓ Mark done shortcut to TaskRowInline, convert "Tasks I contribute to" to TaskRowInline, make decisions section workable inline (status pill + auto-open Edit form).

**Architecture:** Single-file React (`src/App.jsx`) invariant continues. Six logical changes: `computeMyWork` adds one filter clause; `StatusQuickPill` map adds one entry; `TaskRowInline` gains optional `onMarkDone`; `DecisionsView` mirrors Phase A.1's auto-open pattern; App() adds `applyDecisionUpdate` + `initialDecisionEditId`; `MyWorkView` wires the new behaviors across three sections.

**Tech Stack:** React 18.3, Vite 5.4, lucide-react. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-13-action-desk-phase-a2.md`

**Test workflow:** No test runner. Verification per task = `npm run build` + `npx eslint src/App.jsx`. Manual smoke test in browser at end.

---

## File structure

Only one file modified:

| File | Role |
|---|---|
| `src/App.jsx` (current 10902 lines) | All Phase A.2 changes. Will grow ~100 lines to ~11000. |

Logical units touched:

1. **`computeMyWork` (~L715)** — extend filter
2. **`StatusQuickPill` (~L7584)** — add `Open` to map
3. **`TaskRowInline` (~L7656)** — add `onMarkDone` prop + ✓ button
4. **`DecisionsView` (~L3793)** — add `initialEditId` prop + auto-open effect
5. **`App()` (~L8933 area)** — add `applyDecisionUpdate` + `initialDecisionEditId` state + signature update
6. **`MyWorkView` (~L7874)** — wire `onMarkDone` + convert contrib section + rewrite decisions section

---

## Task 1: Extend `computeMyWork` filter to skip Completed tasks

**Files:** Modify `src/App.jsx` — `computeMyWork` task walk (~L740).

**Goal:** Completed tasks disappear from Tasks I own + Tasks I contribute to (Dropped already filtered).

- [ ] **Step 1: Apply the one-line filter extension**

Use `Edit`:

**`old_string`:**
```js
        for (const t of (ws.tasks || [])) {
          if (t.status === 'Dropped') continue;
          const enriched = { task: t, project: proj, program: pg, workstream: ws };
```

**`new_string`:**
```js
        for (const t of (ws.tasks || [])) {
          if (t.status === 'Dropped' || t.status === 'Completed') continue;
          const enriched = { task: t, project: proj, program: pg, workstream: ws };
```

- [ ] **Step 2: Build verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`, no errors.

- [ ] **Step 3: Lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors, 24 warnings` (baseline).

- [ ] **Step 4: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): filter Completed tasks out of My Work aggregation

Phase A.2 step 1/6. Extends the Dropped-only filter in computeMyWork's
task walk to also skip Completed tasks. Affects Tasks I own as Primary
PIC, Tasks I contribute to, mention scan, and overdue checks (Completed
was already excluded from "overdue" via isOverdue, so no behavior change
there). Done work no longer clutters the desk.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `Open` to `StatusQuickPill` map

**Files:** Modify `src/App.jsx` — `StatusQuickPill` (~L7588).

**Goal:** Support `Open` status from `FOLLOWUP_STATUSES` so decisions can use the same pill.

- [ ] **Step 1: Add one entry to the map**

Use `Edit`:

**`old_string`:**
```js
  const map = {
    Planned: { fg: TOK.plannedFg, bg: TOK.plannedBg, icon: <Circle size={10} /> },
    InProgress: { fg: TOK.inprogFg, bg: TOK.inprogBg, icon: <PlayCircle size={10} /> },
    Completed: { fg: TOK.doneFg, bg: TOK.doneBg, icon: <CheckCircle2 size={10} /> },
    Dropped: { fg: TOK.droppedFg, bg: TOK.droppedBg, icon: <X size={10} /> },
    Pending: { fg: TOK.plannedFg, bg: TOK.plannedBg, icon: <Circle size={10} /> },
    'Pushed to OP': { fg: TOK.programFg, bg: TOK.programBg, icon: <Activity size={10} /> },
    Done: { fg: TOK.doneFg, bg: TOK.doneBg, icon: <CheckCircle2 size={10} /> },
    Cancelled: { fg: TOK.droppedFg, bg: TOK.droppedBg, icon: <X size={10} /> },
  };
```

**`new_string`:**
```js
  const map = {
    Planned: { fg: TOK.plannedFg, bg: TOK.plannedBg, icon: <Circle size={10} /> },
    InProgress: { fg: TOK.inprogFg, bg: TOK.inprogBg, icon: <PlayCircle size={10} /> },
    Completed: { fg: TOK.doneFg, bg: TOK.doneBg, icon: <CheckCircle2 size={10} /> },
    Dropped: { fg: TOK.droppedFg, bg: TOK.droppedBg, icon: <X size={10} /> },
    Pending: { fg: TOK.plannedFg, bg: TOK.plannedBg, icon: <Circle size={10} /> },
    'Pushed to OP': { fg: TOK.programFg, bg: TOK.programBg, icon: <Activity size={10} /> },
    Done: { fg: TOK.doneFg, bg: TOK.doneBg, icon: <CheckCircle2 size={10} /> },
    Cancelled: { fg: TOK.droppedFg, bg: TOK.droppedBg, icon: <X size={10} /> },
    Open: { fg: TOK.plannedFg, bg: TOK.plannedBg, icon: <Circle size={10} /> },
  };
```

- [ ] **Step 2: Build + lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -3
```

Expected: green build, 0 errors.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(actions): StatusQuickPill recognizes Open status for decisions

Phase A.2 step 2/6. Extends the internal status map with Open
(decisions' followUpStatus 'Open'), styled like Planned/Pending —
small grey pill with a circle icon. Enables MyWorkView's decisions
section to use StatusQuickPill via the statuses prop.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `onMarkDone` to `TaskRowInline` + ✓ button

**Files:** Modify `src/App.jsx` — `TaskRowInline` (signature at ~L7656, button placement in collapsed row).

**Goal:** One-click "✓ Mark done" shortcut on every TaskRowInline row.

- [ ] **Step 1: Add `onMarkDone` to signature**

Use `Edit`:

**`old_string`:**
```js
function TaskRowInline({ task, project, program, workstream, author, teamMembers, onStatusChange, onAddUpdate, onRequestExtension, onOpenDetails, onAddAction }) {
```

**`new_string`:**
```js
function TaskRowInline({ task, project, program, workstream, author, teamMembers, onStatusChange, onAddUpdate, onRequestExtension, onOpenDetails, onAddAction, onMarkDone }) {
```

- [ ] **Step 2: Insert ✓ button in collapsed row between status pill and chevron**

Find the collapsed-row JSX. The status pill wrapper + chevron block looks like this:

**`old_string`:**
```js
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <StatusQuickPill status={task.status} onChange={(st) => onStatusChange(st)} />
        </span>
        <ChevronDown size={14} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid ' + TOK.line, background: TOK.bg }}>
          <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 6 }}>Quick update</div>
```

**`new_string`:**
```js
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <StatusQuickPill status={task.status} onChange={(st) => onStatusChange(st)} />
        </span>
        {task.status !== 'Completed' && onMarkDone && (
          <Btn size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); onMarkDone(); }} title="Mark done">✓</Btn>
        )}
        <ChevronDown size={14} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid ' + TOK.line, background: TOK.bg }}>
          <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 6 }}>Quick update</div>
```

- [ ] **Step 3: Build + lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors, 24 warnings (baseline).

- [ ] **Step 4: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): TaskRowInline accepts onMarkDone quick action

Phase A.2 step 3/6. Optional onMarkDone prop renders a primary ✓
button between StatusQuickPill and the chevron, only when the task
isn't already Completed and the handler is provided. e.stopPropagation
prevents the click from collapsing the row. Mirrors ActionRowInline's
mark-done shortcut.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extend `DecisionsView` with `initialEditId` + auto-open effect

**Files:** Modify `src/App.jsx` — `DecisionsView` (~L3793).

**Goal:** Accept external trigger to auto-open a specific decision's Edit form on mount; mirror Phase A.1's ActionItemsView pattern.

- [ ] **Step 1: Add `initialEditId` to signature**

Use `Edit`:

**`old_string`:**
```js
function DecisionsView({ project, onProjectUpdate, teamMembers, author, dialogs, onActivity }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all'); // all | Open | InProgress | Done
  const [filterTaskId, setFilterTaskId] = useState('all'); // all | <taskId>
  const [query, setQuery] = useState('');
```

**`new_string`:**
```js
function DecisionsView({ project, onProjectUpdate, teamMembers, author, dialogs, onActivity, initialEditId }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all'); // all | Open | InProgress | Done
  const [filterTaskId, setFilterTaskId] = useState('all'); // all | <taskId>
  const [query, setQuery] = useState('');

  // v30.A.2 — Auto-open Edit form when navigated with initialEditId
  // (e.g., from My Work "→ Open"). Scroll the form into view.
  useEffect(() => {
    if (!initialEditId) return;
    const target = (project.decisions || []).find((d) => d.id === initialEditId);
    if (!target) return;
    setEditing(target);
    setShowForm(true);
    setTimeout(() => {
      const el = document.querySelector('[data-decision-form]');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, [initialEditId, project.decisions]);
```

- [ ] **Step 2: Add `data-decision-form` attribute to the form wrapper**

Use `Edit`:

**`old_string`:**
```js
        {showForm && (
          <div style={{ marginBottom: 14 }}>
            <DecisionForm
              initial={editing}
              project={project}
              teamMembers={teamMembers}
              author={author}
              onSave={saveDecision}
              onCancel={() => { setShowForm(false); setEditing(null); }}
            />
          </div>
        )}
```

**`new_string`:**
```js
        {showForm && (
          <div data-decision-form style={{ marginBottom: 14 }}>
            <DecisionForm
              key={editing?.id || 'new'}
              initial={editing}
              project={project}
              teamMembers={teamMembers}
              author={author}
              onSave={saveDecision}
              onCancel={() => { setShowForm(false); setEditing(null); }}
            />
          </div>
        )}
```

(The `key={editing?.id || 'new'}` prop is added defensively — same stale-state fix applied to ActionItemForm in Phase A.1.)

- [ ] **Step 3: Build + lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(decisions): DecisionsView accepts initialEditId for auto-open

Phase A.2 step 4/6. Mirrors Phase A.1's ActionItemsView pattern. New
initialEditId prop auto-opens a specific decision's Edit form on mount
and smooth-scrolls the form into view. Adds key={editing?.id || 'new'}
to DecisionForm for clean remount on switch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: App() — `applyDecisionUpdate` + state + `onDecisionClick` signature + wiring

**Files:** Modify `src/App.jsx` — inside `App()` at multiple anchor points.

**Goal:** Add cross-project decision mutation helper, the auto-edit ID state, update `onDecisionClick` signature, pass new props to MyWorkView and DecisionsView.

- [ ] **Step 1: Add `initialDecisionEditId` state alongside `initialActionEditId`**

Use `Edit`:

**`old_string`:**
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

  // v30.A.2 — Sibling state + clear effect for decisions.
  const [initialDecisionEditId, setInitialDecisionEditId] = useState(null);
  useEffect(() => {
    if (view !== 'decisions') setInitialDecisionEditId(null);
  }, [view]);
```

- [ ] **Step 2: Add `applyDecisionUpdate` helper right after `applyActionUpdate`**

Find the end of `applyActionUpdate` (closing `}, [projects, updateProject, logActivityForProject]);`). Note: the same closing line appears twice in the file (after `applyTaskUpdate` and after `applyActionUpdate`). Use a combined anchor to target the SECOND occurrence — the one right before the `createActionFromMyWork` block:

**`old_string`:**
```js
  // v30.A.1 — Create a new action in any project (from My Work entry points).
  // Prepends to actionItems so it shows immediately at the top of the
  // Actions tab list. Activity log entry tags "(from My Work)".
  const createActionFromMyWork = useCallback((newAction, projectId) => {
```

**`new_string`:**
```js
  // v30.A.2 — Apply a decision update to any project. Diff-logger covers
  // followUpStatus only (Phase A.2 inline scope). Other field edits go
  // through DecisionsView's saveDecision path which is unchanged.
  const applyDecisionUpdate = useCallback((updatedDecision, projectId, source = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const oldDecision = (targetProj.decisions || []).find((d) => d.id === updatedDecision.id);
    const updated = cloneDeep(targetProj);
    updated.decisions = (updated.decisions || []).map((d) => d.id === updatedDecision.id ? { ...d, ...updatedDecision } : d);
    updateProject(updated);
    const tag = source ? ` (from ${source})` : '';
    if (oldDecision && oldDecision.followUpStatus !== updatedDecision.followUpStatus) {
      const snippet = (updatedDecision.text || '').slice(0, 60);
      const ellipsis = (updatedDecision.text || '').length > 60 ? '…' : '';
      logActivityForProject(projectId, {
        type: 'decision_status_change',
        description: `Decision "${snippet}${ellipsis}": ${oldDecision.followUpStatus || 'Open'} → ${updatedDecision.followUpStatus}${tag}`,
      });
    }
  }, [projects, updateProject, logActivityForProject]);

  // v30.A.1 — Create a new action in any project (from My Work entry points).
  // Prepends to actionItems so it shows immediately at the top of the
  // Actions tab list. Activity log entry tags "(from My Work)".
  const createActionFromMyWork = useCallback((newAction, projectId) => {
```

- [ ] **Step 3: Update `onDecisionClick` in the my-work render switch**

Use `Edit`:

**`old_string`:**
```js
                  onDecisionClick={async (projectId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setView('decisions');
                  }}
```

**`new_string`:**
```js
                  onDecisionClick={async (projectId, decisionId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setView('decisions');
                    if (decisionId) setInitialDecisionEditId(decisionId);
                  }}
                  onDecisionUpdate={(updatedDecision, projectId) => applyDecisionUpdate(updatedDecision, projectId, 'My Work')}
```

- [ ] **Step 4: Pass `initialEditId` to DecisionsView in render switch**

Use `Edit`:

**`old_string`:**
```js
              {project && view === 'decisions' && <DecisionsView project={project} onProjectUpdate={updateProject} teamMembers={teamMembers} author={author} dialogs={dialogs} onActivity={logActivity} />}
```

**`new_string`:**
```js
              {project && view === 'decisions' && <DecisionsView project={project} onProjectUpdate={updateProject} teamMembers={teamMembers} author={author} dialogs={dialogs} onActivity={logActivity} initialEditId={initialDecisionEditId} />}
```

- [ ] **Step 5: Build + lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors, 24 warnings.

- [ ] **Step 6: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): App applyDecisionUpdate + onDecisionClick(projectId, decisionId)

Phase A.2 step 5/6. App() gains:
- initialDecisionEditId state + clear-on-view-change effect
- applyDecisionUpdate cross-project helper with diff-logger for
  followUpStatus changes (mirrors applyActionUpdate)
- onDecisionClick signature updated to (projectId, decisionId) — sets
  initialDecisionEditId when an id is passed
- onDecisionUpdate prop on MyWorkView wired to applyDecisionUpdate
- DecisionsView render now passes initialEditId

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: MyWorkView — wire onMarkDone + convert contribute section + rewrite decisions section

**Files:** Modify `src/App.jsx` — `MyWorkView` (~L7874).

**Goal:** Apply the new behaviors at the consumer side: owned tasks get ✓ button, contribute section becomes TaskRowInline-based, decisions section uses inline StatusQuickPill and passes decisionId to onDecisionClick.

- [ ] **Step 1: Add `onDecisionUpdate` to MyWorkView signature**

Use `Edit`:

**`old_string`:**
```js
function MyWorkView({
  projects, author, isOwner, userPrefs, teamMembers,
  onTaskClick, onActionClick, onDecisionClick, onCreateAction,
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
  onTaskUpdate, onActionUpdate, onDecisionUpdate,
  onApproveDeadline, onRejectDeadline,
  onMarkSeen, showToast,
}) {
```

- [ ] **Step 2: Wire `onMarkDone` on owned-tasks TaskRowInline**

Use `Edit`:

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
            onAddAction={onCreateAction ? () => onCreateAction(e.project.id, e.task.id) : null}
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
            onMarkDone={() => handleStatusChange(e.task, e.project, 'Completed')}
          />
```

- [ ] **Step 3: Convert "Tasks I contribute to" section body to use TaskRowInline**

Use `Edit`:

**`old_string`:**
```js
        {myWork.tasksContributing.length === 0 && (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>You're not a contributor on any task yet.</div>
        )}
        {myWork.tasksContributing.map((e, i) => (
          <div key={`c-${i}`} style={{ padding: '8px 12px', marginBottom: 6, border: '1px solid ' + TOK.line, borderRadius: 6, background: TOK.surface }}>
            <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500 }}>
              {e.task.name}
            </div>
            <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <MyWorkBreadcrumb project={e.project} program={e.program} workstream={e.workstream} />
              <span>Primary PIC: <span style={{ color: TOK.ink }}>{e.primaryPic || '—'}</span></span>
              {e.task.end && <span>· due {fmtDateShort(e.task.end)}</span>}
              <Pill status={e.task.status || 'Planned'} size="sm" />
            </div>
            <div style={{ marginTop: 6 }}>
              <Btn size="sm" variant="ghost" onClick={() => onTaskClick(e.task.id, e.project.id)}>→ Open</Btn>
            </div>
          </div>
        ))}
```

**`new_string`:**
```js
        {myWork.tasksContributing.length === 0 && (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>You're not a contributor on any task yet.</div>
        )}
        {myWork.tasksContributing.map((e, i) => (
          <TaskRowInline
            key={`contrib-${i}`}
            task={e.task} project={e.project} program={e.program} workstream={e.workstream}
            author={author} teamMembers={teamMembers}
            onStatusChange={(st) => handleStatusChange(e.task, e.project, st)}
            onAddUpdate={(text, blocker) => handleAddUpdate(e.task, e.project, text, blocker)}
            onRequestExtension={() => handleRequestExtension(e.task, e.project)}
            onOpenDetails={() => onTaskClick(e.task.id, e.project.id)}
            onAddAction={onCreateAction ? () => onCreateAction(e.project.id, e.task.id) : null}
            onMarkDone={() => handleStatusChange(e.task, e.project, 'Completed')}
          />
        ))}
```

- [ ] **Step 4: Rewrite Decisions section row to use inline StatusQuickPill + pass decision.id to onDecisionClick**

Use `Edit`:

**`old_string`:**
```js
        {myWork.decisions.map((e, i) => {
          const d = e.decision;
          const fuColor = followupColor(d.followUpStatus || 'Open');
          const reviewOverdue = d.expectedReviewDate && (d.followUpStatus || 'Open') !== 'Done' && parseDate(d.expectedReviewDate) < today();
          return (
            <div key={`d-${i}`} style={{ padding: '10px 12px', marginBottom: 6, border: '1px solid ' + TOK.line, borderRadius: 6, background: TOK.surface, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, marginBottom: 2 }}>
                  <MentionedText text={d.text || '(no decision text)'} teamMembers={teamMembers} />
                </div>
                <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>{e.project.name}</span>
                  <span>· decided by {(d.decidedBy || []).length} {(d.decidedBy || []).length === 1 ? 'person' : 'people'}</span>
                  {d.date && <span>· {fmtDateShort(d.date)}</span>}
                  {d.expectedReviewDate && <span style={{ color: reviewOverdue ? TOK.overdueFg : TOK.muted, fontWeight: reviewOverdue ? 500 : 400 }}>· review {fmtDateShort(d.expectedReviewDate)}{reviewOverdue ? ' ⚠' : ''}</span>}
                </div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 999, color: fuColor.fg, background: fuColor.bg, whiteSpace: 'nowrap' }}>
                {FOLLOWUP_LABEL[d.followUpStatus || 'Open']}
              </span>
              {onDecisionClick && <Btn size="sm" variant="ghost" onClick={() => onDecisionClick(e.project.id)} title="Open in Decisions tab">→</Btn>}
            </div>
          );
        })}
```

**`new_string`:**
```js
        {myWork.decisions.map((e, i) => {
          const d = e.decision;
          const reviewOverdue = d.expectedReviewDate && (d.followUpStatus || 'Open') !== 'Done' && parseDate(d.expectedReviewDate) < today();
          return (
            <div key={`d-${i}`} style={{ padding: '10px 12px', marginBottom: 6, border: '1px solid ' + TOK.line, borderRadius: 6, background: TOK.surface, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, marginBottom: 2 }}>
                  <MentionedText text={d.text || '(no decision text)'} teamMembers={teamMembers} />
                </div>
                <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>{e.project.name}</span>
                  <span>· decided by {(d.decidedBy || []).length} {(d.decidedBy || []).length === 1 ? 'person' : 'people'}</span>
                  {d.date && <span>· {fmtDateShort(d.date)}</span>}
                  {d.expectedReviewDate && <span style={{ color: reviewOverdue ? TOK.overdueFg : TOK.muted, fontWeight: reviewOverdue ? 500 : 400 }}>· review {fmtDateShort(d.expectedReviewDate)}{reviewOverdue ? ' ⚠' : ''}</span>}
                </div>
              </div>
              <span onClick={(ev) => ev.stopPropagation()} style={{ display: 'inline-flex' }}>
                <StatusQuickPill
                  status={d.followUpStatus || 'Open'}
                  statuses={FOLLOWUP_STATUSES}
                  onChange={(st) => onDecisionUpdate && onDecisionUpdate({ ...d, followUpStatus: st }, e.project.id)}
                />
              </span>
              {onDecisionClick && <Btn size="sm" variant="ghost" onClick={() => onDecisionClick(e.project.id, d.id)} title="Open in Decisions tab">→</Btn>}
            </div>
          );
        })}
```

- [ ] **Step 5: Build verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`, 0 errors.

- [ ] **Step 6: Lint verify**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors, 24 warnings`. Note: `followupColor` might become unused inside MyWorkView's decisions render (it's still used in `DecisionRowCompact` and `DecisionEntry` so the function definition stays). Verify no new unused-vars warnings appear specifically for `followupColor` within MyWorkView's scope (it's never a local — it's a top-level function, so removing the call doesn't unmount the definition).

- [ ] **Step 7: Verify all `onDecisionClick` callers pass 2 args**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && grep -n "onDecisionClick(" src/App.jsx
```

Expected: only one match for the decision row "→" button, passing `(e.project.id, d.id)`. (Decisions don't appear in needs-attention or mentions sections, so just one call site.)

- [ ] **Step 8: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): wire onMarkDone + contribute conversion + inline decisions

Phase A.2 step 6/6. MyWorkView changes:
- onMarkDone wired on owned-tasks TaskRowInline (1-click → Completed)
- Tasks I contribute to section: flat row JSX replaced with full
  TaskRowInline (status change, mark done, post update, request
  extension, open details, add action). Drops the explicit
  "Primary PIC: X" line — section header conveys the contract.
- Decisions section: static followUpStatus label replaced with
  clickable StatusQuickPill (statuses=FOLLOWUP_STATUSES), and the
  "→" button now passes decision.id so App's onDecisionClick can
  auto-open its Edit form via initialDecisionEditId.

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

For each item:

| # | Test | Pass criteria |
|---:|---|---|
| 1 | Completed tasks filtered from Tasks I own | Mark task Completed in Outline → not visible in My Work |
| 2 | Completed tasks filtered from Tasks I contribute to | Same as #1 for contribute task |
| 3 | Quick ✓ on owned task | ✓ button visible at end of row → click → task disappears + activity entry "(from My Work)" |
| 4 | Quick ✓ on contributing task | Same as #3 on a contribute task |
| 5 | No ✓ on Completed task | Edge case — gated correctly, button hidden |
| 6 | Decision status pill change | Click pill → dropdown Open/In Progress/Done → pick In Progress → activity entry |
| 7 | Decision Done removes it | Pick Done → decision disappears from My Work |
| 8 | "→ Open" auto-opens Edit form | Click → in My Work decision → Decisions tab + Edit form auto-opens + scrolled |
| 9 | Cross-project decision nav | If decision in different project, switchProject runs first |
| 10 | Phase A My Work flows unchanged | Status pill, post update, request extension on tasks work |
| 11 | Phase A.1 action flows unchanged | All action features still work |
| 12 | Outline status change has no "(from My Work)" suffix | Edit in Outline → activity entry plain |
| 13 | DecisionsView save flow unchanged | Saving via Save button still works |
| 14 | DecisionsView filters/form unaffected | Status filter, search, "New decision" all work |
| 15 | Contribute section empty | "You're not a contributor on any task yet." |
| 16 | Decisions empty | "No decisions need your input." |
| 17 | Stale initialDecisionEditId | Effect no-ops; DecisionsView renders normally |

- [ ] **Step 3: If a smoke test fails, file a follow-up note**

Add a `## Smoke test results` section at the bottom of `docs/superpowers/specs/2026-05-13-action-desk-phase-a2.md` describing what failed. Phase A.2 is feature-complete; revisions happen in a separate session.

- [ ] **Step 4: If all 17 pass, tag the commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git tag -a v30-phase-a2 -m "v30 Phase A.2: filter Done + inline decision status"
```

---

## Self-review pass

**Spec coverage:**

| Spec section | Task |
|---|---|
| Goal 1: Filter Completed tasks | Task 1 |
| Goal 2: ✓ Mark done shortcut | Task 3 (TaskRowInline), Task 6 step 2 (wire owned), Task 6 step 3 (wire contribute) |
| Goal 3: Tasks I contribute to → TaskRowInline | Task 6 step 3 |
| Goal 4: Decisions inline followUpStatus change | Task 2 (StatusQuickPill Open), Task 6 step 4 (UI), Task 5 step 2 (applyDecisionUpdate), Task 5 step 3 (wire onDecisionUpdate) |
| Goal 5: "→ Open" auto-opens specific decision | Task 4 (DecisionsView effect), Task 5 step 1 (state), Task 5 step 3 (onDecisionClick signature), Task 5 step 4 (DecisionsView render with prop), Task 6 step 4 (call site passes d.id) |
| Critical pitfall 1: Completed filter all branches | Task 1 (early continue covers all) |
| Critical pitfall 2: onMarkDone stopPropagation | Task 3 step 2 |
| Critical pitfall 3: contribute drops primaryPic line | Task 6 step 3 — accepted in commit message |
| Critical pitfall 4: StatusQuickPill Open label | Task 2 (added to map; STATUS_LABEL fallback handles label) |
| Critical pitfall 5: InProgress label inconsistency | accepted as cosmetic |
| Critical pitfall 6: applyDecisionUpdate scope | Task 5 step 2 (only followUpStatus logged) |
| Critical pitfall 7: onDecisionClick signature change | Task 5 step 3 (App), Task 6 step 4 (caller), Task 6 step 7 (grep verify) |
| Critical pitfall 8: DecisionsView effect deps | Task 4 step 1 (`[initialEditId, project.decisions]`) |

All 17 testing items covered by Task 7 walkthrough.

**Placeholder scan:** No "TBD", "implement later", or vague requirements. All code is concrete; the smoke test items are observational not procedural.

**Type consistency:**
- `onMarkDone()` — no-arg in Task 3 prop, Task 6 wires as closure that calls `handleStatusChange(task, project, 'Completed')`. Consistent.
- `onDecisionUpdate(updatedDecision, projectId)` — Task 5 step 3 (App provider), Task 6 step 4 (caller). Consistent.
- `onDecisionClick(projectId, decisionId)` — Task 5 step 3 (App handler signature), Task 6 step 4 (caller passes `e.project.id, d.id`). Consistent.
- `initialEditId: string | null` — Task 4 (DecisionsView consumer), Task 5 step 1 + step 4 (App provider). Consistent.
- `applyDecisionUpdate(decision, projectId, source)` — Task 5 step 2 (definition), Task 5 step 3 (wired with `source='My Work'`). Consistent.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-action-desk-phase-a2.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, commit per task. Same approach as Phase A.1.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Either approach stops after Task 6's commit. Task 7 (smoke test) is user-driven.
