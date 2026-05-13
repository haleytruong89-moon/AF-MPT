# Action-Desk Phase A.2 — Filter Done + Inline Decision Status

**Date:** 2026-05-13
**App:** AF MTP — extends Phase A and Phase A.1 specs
**Status:** Design — pending implementation
**Effort:** ~2-3h in-app

---

## Background

Phase A and Phase A.1 made My Work a working surface for action items. User feedback after Phase A.1 smoke test:

1. "Tasks I own as Primary PIC" and "Tasks I contribute to" sections show **Completed** tasks. Done work clutters the desk; the user wants only in-flight work visible. They also want a quick `✓ Mark done` shortcut directly on the row (mirroring `ActionRowInline`), instead of the 3-click status-pill dance.
2. "Decisions awaiting your input" section is read-only: user can see decisions they need to handle but cannot change their followUpStatus inline, and clicking "→ Open" goes to the Decisions tab listing rather than the specific decision's Edit form.

Phase A.2 closes both gaps with a tight, minimal-schema change set.

---

## Goals

1. **Filter Completed** from Tasks I own + Tasks I contribute to in `computeMyWork` (Dropped is already filtered; extend to Completed)
2. **Add `✓ Mark done` quick button** to `TaskRowInline` (one-click status → Completed)
3. **Convert "Tasks I contribute to" to use `TaskRowInline`** (full feature parity with Tasks I own — inline status, mark-done, expand for comment)
4. **Decisions section: inline `followUpStatus` change via `StatusQuickPill`** — when set to `Done`, decision disappears (already filtered)
5. **Decisions section "→ Open" navigates to the specific decision's Edit form** in DecisionsView (mirrors Phase A.1's action navigation)

**Non-goals (Phase A.2):**

- Comment thread on decisions (no `decision.updates[]` schema addition)
- Inline edit of decision text / context / expectedReviewDate / decidedBy — handled via "→ Open" path
- Hierarchical sub-actions (still Phase B)
- Changes to DecisionsView save flow or filters — only the auto-open effect

---

## Cross-cutting principles (in addition to A and A.1)

1. **Decisions are records, not work items** — minimum inline workability is intentional. Full edit happens in the Edit form via the auto-open navigation. Comments are deferred until clear user demand surfaces.
2. **Tasks I own and Tasks I contribute to converge** — both render via the same `TaskRowInline` component. Distinction is preserved by section header label and the `primaryPic` text shown in the breadcrumb (contribute rows note who the primary PIC is).
3. **Cross-project decision mutations route through a shared helper** (`applyDecisionUpdate`) — mirrors `applyActionUpdate` pattern: diff-based activity log, optional `(from <source>)` suffix.

---

## Schema additions

None. Phase A.2 is purely a filter + UI change.

---

## Component changes

| Component | Change |
|---|---|
| `computeMyWork` | Extend the early-continue filter to skip `t.status === 'Completed'` in addition to `'Dropped'` |
| `TaskRowInline` | + `onMarkDone` prop, render `✓` button in the collapsed top bar when `task.status !== 'Completed' && onMarkDone` |
| `MyWorkView` Tasks I own | Wire `onMarkDone={() => handleStatusChange(e.task, e.project, 'Completed')}` |
| `MyWorkView` Tasks I contribute to | Replace flat row JSX with `<TaskRowInline>` (full props parity: status change, mark done, post update, request extension, open details) |
| `MyWorkView` Decisions section | Replace static status text with `<StatusQuickPill status={d.followUpStatus} statuses={FOLLOWUP_STATUSES} onChange={(st) => onDecisionUpdate({ ...d, followUpStatus: st }, project.id)} />`; "→ Open" passes `decision.id` |
| `StatusQuickPill` | Extend internal `map` to include `Open` (visually same as Planned/Pending) |
| `DecisionsView` | + `initialEditId` prop; auto-open useEffect (mirror Phase A.1 ActionItemsView pattern) |
| `App()` | + `applyDecisionUpdate(updatedDecision, projectId, source)` helper; + `initialDecisionEditId` state + clear-on-view-change effect; + update `onDecisionClick(projectId, decisionId)` signature; + wire `onDecisionUpdate` to MyWorkView; + DecisionsView render with new `initialEditId` prop |

---

## Detailed component changes

### 1. `computeMyWork` — filter Completed

Inside the task walk (current line ~740):

**Old:**
```js
        for (const t of (ws.tasks || [])) {
          if (t.status === 'Dropped') continue;
```

**New:**
```js
        for (const t of (ws.tasks || [])) {
          if (t.status === 'Dropped' || t.status === 'Completed') continue;
```

This filter applies to both `tasksOwned` and `tasksContributing` (same `t` loop). The needs-attention overdue-task check is also inside this loop — Completed tasks were already excluded from "overdue" by `isOverdue()` returning false for Completed status, so no regression.

### 2. `TaskRowInline` — `✓ Mark done` quick button

Add `onMarkDone` prop to signature:

```js
function TaskRowInline({ task, project, program, workstream, author, teamMembers, onStatusChange, onAddUpdate, onRequestExtension, onOpenDetails, onAddAction, onMarkDone }) {
```

Render `✓` button between StatusQuickPill and chevron, gated by `task.status !== 'Completed' && onMarkDone`:

```jsx
<span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
  <StatusQuickPill status={task.status} onChange={(st) => onStatusChange(st)} />
</span>
{task.status !== 'Completed' && onMarkDone && (
  <Btn size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); onMarkDone(); }} title="Mark done">✓</Btn>
)}
<ChevronDown size={14} ... />
```

### 3. `MyWorkView` Tasks I own — wire `onMarkDone`

In the existing `<TaskRowInline>` invocation in "Tasks I own" section:

```jsx
<TaskRowInline
  ...
  onOpenDetails={() => onTaskClick(e.task.id, e.project.id)}
  onAddAction={onCreateAction ? () => onCreateAction(e.project.id, e.task.id) : null}
  onMarkDone={() => handleStatusChange(e.task, e.project, 'Completed')}
/>
```

`handleStatusChange` is the existing handler that calls `onTaskUpdate({ ...task, status: newStatus }, project.id)`.

### 4. `MyWorkView` Tasks I contribute to — convert to TaskRowInline

The current flat render (~L8087 area) becomes:

```jsx
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

The "primary PIC" distinction (`e.primaryPic`) is currently shown as breadcrumb. After conversion, it's lost in the row UI. Mitigation: leave the existing `primaryPic` info inside the breadcrumb area is not feasible since TaskRowInline doesn't take a primaryPic prop. Two options to preserve the "who else is responsible" info:

(a) Just drop it — section header "Tasks I contribute to" already implies "you're not the primary PIC"
(b) Add a small `primaryPic` prop to TaskRowInline that renders as `· PIC: X` in the breadcrumb line

Phase A.2 picks **(a)** for minimum scope — the section header is sufficient context. If users miss the info, Phase A.3 can add the prop.

### 5. `MyWorkView` Decisions section — inline status pill

Replace the existing decision row (~L8090):

```jsx
{myWork.decisions.length === 0 && (
  <div style={{ color: TOK.muted, fontSize: 12.5 }}>No decisions need your input.</div>
)}
{myWork.decisions.map((e, i) => {
  const d = e.decision;
  const reviewOverdue = d.expectedReviewDate && d.followUpStatus !== 'Done' && parseDate(d.expectedReviewDate) < today();
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

The current static label pill is replaced by clickable StatusQuickPill. `onDecisionClick` now takes `(projectId, decisionId)`.

### 6. `StatusQuickPill` — extend map with `Open`

Add one entry to the internal map:

```js
Open: { fg: TOK.plannedFg, bg: TOK.plannedBg, icon: <Circle size={10} /> },
```

(Same visual as Planned/Pending.) Existing entries InProgress, Done are reused. No change to label resolution — the `STATUS_LABEL[st] || st` fallback handles Open/Done correctly (returns raw string).

### 7. `DecisionsView` — auto-open Edit form

Add `initialEditId` to props:

```js
function DecisionsView({ project, onProjectUpdate, teamMembers, author, dialogs, onActivity, initialEditId }) {
```

Add auto-open useEffect:

```js
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

Add `data-decision-form` attribute to the form wrapper:

```jsx
{showForm && (
  <div data-decision-form style={{ marginBottom: 14 }}>
    <DecisionForm ... />
  </div>
)}
```

### 8. `App()` — applyDecisionUpdate + state + wiring

**New state:**
```js
const [initialDecisionEditId, setInitialDecisionEditId] = useState(null);

useEffect(() => {
  if (view !== 'decisions') setInitialDecisionEditId(null);
}, [view]);
```

**New cross-project decision helper:**
```js
const applyDecisionUpdate = useCallback((updatedDecision, projectId, source = '') => {
  const targetProj = projects[projectId];
  if (!targetProj) return;
  const oldDecision = (targetProj.decisions || []).find((d) => d.id === updatedDecision.id);
  const updated = cloneDeep(targetProj);
  updated.decisions = (updated.decisions || []).map((d) => d.id === updatedDecision.id ? { ...d, ...updatedDecision } : d);
  updateProject(updated);
  const tag = source ? ` (from ${source})` : '';
  if (oldDecision && oldDecision.followUpStatus !== updatedDecision.followUpStatus) {
    logActivityForProject(projectId, {
      type: 'decision_status_change',
      description: `Decision "${(updatedDecision.text || '').slice(0, 60)}${(updatedDecision.text || '').length > 60 ? '…' : ''}": ${oldDecision.followUpStatus || 'Open'} → ${updatedDecision.followUpStatus}${tag}`,
    });
  }
}, [projects, updateProject, logActivityForProject]);
```

**Update render switch:**

`onDecisionClick`:
```js
onDecisionClick={async (projectId, decisionId) => {
  if (projectId && projectId !== currentId) {
    await switchProject(projectId);
  }
  setView('decisions');
  if (decisionId) setInitialDecisionEditId(decisionId);
}}
```

Add `onDecisionUpdate` to MyWorkView:
```js
onDecisionUpdate={(updatedDecision, projectId) => applyDecisionUpdate(updatedDecision, projectId, 'My Work')}
```

Update DecisionsView render:
```jsx
{project && view === 'decisions' && <DecisionsView project={project} onProjectUpdate={updateProject} teamMembers={teamMembers} author={author} dialogs={dialogs} onActivity={logActivity} initialEditId={initialDecisionEditId} />}
```

---

## Files touched

Only `src/App.jsx` (single-file invariant).

Net add: ~100 lines. Current 10902 → ~11000.

---

## Testing checklist

### Functional

1. **Completed tasks filtered from "Tasks I own"** — Mark a task Completed in Outline → switch to My Work → task no longer appears in any Today/Week/Later bucket.
2. **Completed tasks filtered from "Tasks I contribute to"** — same as #1 but for a task user is contributor on.
3. **Quick ✓ button on owned task** — Expand or just see a task in My Work owned by user → `✓` button visible at end of row → click → status → Completed → row disappears. Activity log entry `Changed "X" status: A → Completed (from My Work)`.
4. **Quick ✓ button on contributing task** — Same as #3 but on a contributing task. User can mark someone else's primary-PIC task as Completed from My Work (this is allowed; user is a contributor and they're saying their part is done).
5. **No ✓ button on Completed task** — Edge case: if somehow a Completed task slips through (it shouldn't, due to filter), the row wouldn't show the ✓ button (gated on `task.status !== 'Completed'`).
6. **Decision status pill change** — Click status pill on a decision in My Work → dropdown shows Open / In Progress / Done → pick In Progress → pill updates immediately → activity log entry `Decision "X": Open → InProgress (from My Work)`.
7. **Mark decision Done removes it** — Click status pill → Done → decision disappears from My Work (filtered).
8. **Decision "→ Open" auto-opens Edit form** — Click → on a decision in My Work → app navigates to Decisions tab → that decision's Edit form auto-opens + scrolls into view.
9. **Cross-project decision nav** — If decision is in a different project, `switchProject` runs first, then auto-open.

### Regression

10. **Phase A My Work flows unchanged** — Status pill change, post update, request extension, open details on tasks all still work.
11. **Phase A.1 action flows unchanged** — All action-related features still work.
12. **Outline status change does NOT have "(from My Work)" suffix** — Verify by editing a task in Outline; activity entry is plain.
13. **DecisionsView save flow unchanged** — Saving a decision via the Edit form's Save button still uses `saveDecision` (which calls `onProjectUpdate` + `onActivity`). The new `applyDecisionUpdate` is only invoked from My Work inline status changes.
14. **DecisionsView filters and form unaffected** — Status filter, related-task filter, search query all still work; "New decision" button still opens a blank form.

### Empty states

15. **Contribute section empty** — User is contributor on zero tasks → "You're not a contributor on any task yet." message.
16. **Decisions empty** — User is decidedBy on zero pending decisions → "No decisions need your input."
17. **Open with deleted decision ID** — Stale `initialDecisionEditId` not matching any decision → effect no-ops, DecisionsView renders normally.

---

## Critical pitfalls

1. **The Completed filter affects ALL task-loop branches** — including mention scan, contributing scan, owned scan. Since all happen in the same `for (const t of ws.tasks)` loop, the early continue covers all. Re-verify by running through: a Completed task with `@hattt4` in an update should NOT generate a mention. This is the intended behavior — user has dealt with that work; archived mentions are noise.
2. **`onMarkDone` must call `e.stopPropagation()`** — TaskRowInline's outer div has a click handler that toggles expand. Without `e.stopPropagation()` the mark-done click would also expand the row. Same pattern as the StatusQuickPill wrapper.
3. **`Tasks I contribute to` conversion drops the explicit `primaryPic` line** — Currently the flat row renders "Primary PIC: <name>" as a secondary detail; after switching to TaskRowInline this is gone (TaskRowInline has no equivalent slot). The section header "Tasks I contribute to" already conveys that the row's PIC field belongs to someone else; users reading their own My Work understand the contract. If smoke testing reveals confusion, the follow-up fix is to add a `primaryPic` prop to TaskRowInline that renders as `· PIC: X` in the breadcrumb line — straightforward, ~10 lines.
4. **StatusQuickPill `Open` label** — `STATUS_LABEL` doesn't have `Open`; the fallback `STATUS_LABEL[st] || st` returns raw `'Open'` which is correct. `FOLLOWUP_LABEL.Open = 'Open'` matches. No issue.
5. **InProgress label inconsistency** — `STATUS_LABEL.InProgress = 'In Progress'` (capital P) while `FOLLOWUP_LABEL.InProgress = 'In progress'` (lowercase p). Decisions in My Work show via StatusQuickPill which uses STATUS_LABEL → `In Progress`. Decisions in DecisionsView use FOLLOWUP_LABEL → `In progress`. Cosmetic inconsistency. Acceptable for Phase A.2.
6. **`applyDecisionUpdate` diff-logger covers only followUpStatus** — Other field changes (text, expectedReviewDate, decidedBy) are not logged via this helper because Phase A.2 only mutates followUpStatus inline. If the user later wants inline edit of other fields, extend the diff-logger to handle each.
7. **`onDecisionClick` signature change** — All 1 call site (mention card → no, decisions don't have mentions; only the decision row → button) must update. Grep before deploying.
8. **DecisionsView `initialEditId` effect deps `[initialEditId, project.decisions]`** — Same edge case as ActionItemsView in Phase A.1: re-fires when decisions array updates. Benign in practice (effect re-applies same state). Document for awareness.

---

## Implementation order

```
1. computeMyWork: extend Dropped filter to also skip Completed              (~1 line)
2. TaskRowInline: + onMarkDone prop + quick ✓ button                        (~10 lines)
3. StatusQuickPill: extend map with Open                                    (~1 line)
4. MyWorkView Tasks I own: wire onMarkDone                                  (~1 line)
5. MyWorkView Tasks I contribute to: convert to TaskRowInline               (~25 lines)
6. MyWorkView Decisions section: rewrite with inline StatusQuickPill + decisionId nav  (~30 lines)
7. DecisionsView: + initialEditId prop + auto-open useEffect + data-attr    (~15 lines)
8. App: + applyDecisionUpdate + initialDecisionEditId state + onDecisionClick update + DecisionsView render with new prop + MyWorkView onDecisionUpdate prop  (~40 lines)
9. Manual smoke test (17-item checklist)
```

Total: ~120 lines, ~2-3h.

---

## Phase B preview unchanged

Phase B (sub-actions with own PIC) is still deferred. Nothing in Phase A.2 precludes either embedded-subtask or reference-subtask schema choice.
