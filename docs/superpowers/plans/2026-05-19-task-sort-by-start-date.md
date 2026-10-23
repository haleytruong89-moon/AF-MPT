# Task sort by start date — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sort tasks by their `start` date in MindMap, Outline, and Gantt views, so a newly-created task with an earlier start date naturally moves up instead of always landing at the bottom.

**Architecture:** Visual-only sort applied at render time. Underlying `ws.tasks[]` array order is not mutated — Excel export, OpenProject export, save/load, activity log, weight log, credit math, all keep current array-order semantics. A single helper `sortTasksByStart(tasks)` lives next to other task utilities in App.jsx and is reused by MindMap (`buildMindTree`) and Outline. GanttView already sorts; we refactor it to use the same helper for consistency.

**Sort rules:**
1. Tasks with `start` set → ascending date.
2. Tasks without `start` → fall to the end, in their original array order (stable).
3. Tie-break by original array index (stable sort — modern JS guarantees this).

**Tech Stack:** React + plain JS. No new dependencies. Helper is pure.

---

## File structure

| File | Change |
|---|---|
| `src/App.jsx` | **Modify** — add `sortTasksByStart()` helper (~line 540, alongside other task utilities); apply in `buildMindTree` (~line 5976) and in `OutlineView` task iteration (~line 6707). |
| `src/components/GanttView.tsx` | **Modify** — replace inline sort (lines 79-83) with the shared helper. Optional but recommended for consistency. Skip if importing from App.jsx is awkward; can inline a copy with comment "duplicate of sortTasksByStart in App.jsx — keep in sync". |

No new files. No schema change. No migration.

---

### Task 1: Add the shared sort helper in App.jsx

**Files:**
- Modify: `src/App.jsx` (insert new function near line ~540, immediately AFTER the existing `getDecisionDecay` function and BEFORE the "Credit allocation helpers (v22)" section)

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "function getDecisionDecay\|Credit allocation helpers" src/App.jsx | head -4
```

Expected: two lines — one with `function getDecisionDecay`, one with the `// ─── Credit allocation helpers (v22) ───` comment. The new helper goes BETWEEN them, after `getDecisionDecay`'s closing `}` and before the credit helpers comment.

- [ ] **Step 2: Insert the helper**

Insert this block immediately before the line `// ─── Credit allocation helpers (v22) ───`:

```js
// v30 — Visual sort for task lists. Tasks with a start date come first in
// ascending order; tasks without a start date fall to the end. Stable on
// modern engines, so equal keys keep their original array order. Returns a
// new array — does NOT mutate the input. Used by MindMap, Outline, and
// Gantt render paths so a newly-created task with an earlier start date
// naturally moves up instead of always landing at the bottom.
function sortTasksByStart(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  return [...list].sort((a, b) => {
    const ad = a?.start ? +new Date(a.start) : Infinity;
    const bd = b?.start ? +new Date(b.start) : Infinity;
    if (isNaN(ad) && isNaN(bd)) return 0;
    if (isNaN(ad)) return 1;
    if (isNaN(bd)) return -1;
    return ad - bd;
  });
}
```

- [ ] **Step 3: Verify build still parses**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: build succeeds with no TypeScript errors. The helper is unused so far — that's fine, the next tasks wire it up.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(tasks): add sortTasksByStart helper for visual ordering"
```

---

### Task 2: Apply sortTasksByStart in MindMap (buildMindTree)

**Files:**
- Modify: `src/App.jsx:5976-5986` — `buildMindTree`

- [ ] **Step 1: Locate the current code**

```bash
sed -n '5976,5986p' src/App.jsx
```

Expected output:

```js
function buildMindTree(project, collapsed) {
  const mk = (o, kind, children, ref) => ({ _id: o.id, _ref: ref ?? o, name: o.name, kind, children, _collapsed: collapsed.has(o.id) });
  const programs = (project.programs || []).map((p) => {
    const ws = (p.workstreams || []).map((w) => {
      const tasks = (w.tasks || []).map((t) => mk(t, 'task', null));
      return mk(w, 'workstream', tasks);
    });
    return mk(p, 'program', ws);
  });
  return mk(project, 'project', programs);
}
```

- [ ] **Step 2: Replace the task-mapping line**

Change the line:

```js
      const tasks = (w.tasks || []).map((t) => mk(t, 'task', null));
```

to:

```js
      const tasks = sortTasksByStart(w.tasks).map((t) => mk(t, 'task', null));
```

- [ ] **Step 3: Verify build**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Manual smoke check**

Start dev server if not already running:

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run dev
```

In browser at the dev URL:
1. Open a project with multiple tasks in one workstream.
2. Switch to Mindmap view.
3. Add a new task whose start date (set via task detail editor) is earlier than existing tasks.
4. Confirm: the new task node now appears in chronological position, not at the bottom of the workstream's children.
5. Tasks with no start date appear at the end of their workstream.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(mindmap): sort tasks by start date inside each workstream"
```

---

### Task 3: Apply sortTasksByStart in OutlineView

**Files:**
- Modify: `src/App.jsx:6705-6710` (the task iteration inside OutlineView's workstream render)

- [ ] **Step 1: Locate the current code**

```bash
sed -n '6705,6712p' src/App.jsx
```

Expected: line 6707 shows `{wsOpen && (ws.tasks || []).map((t) => {` opening the task render loop. (Exact line number may shift by ±2 from prior tasks; the matching string is the unique anchor.)

- [ ] **Step 2: Replace the iteration**

Change:

```js
                    {wsOpen && (ws.tasks || []).map((t) => {
```

to:

```js
                    {wsOpen && sortTasksByStart(ws.tasks).map((t) => {
```

- [ ] **Step 3: Verify build**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Manual smoke check**

1. Switch to Outline view in the dev server.
2. Add a new task in an existing workstream with a start date earlier than its siblings.
3. Confirm: new task appears in chronological position, NOT at the bottom of the workstream's task list.
4. Tasks with no start date still appear, at the bottom of the workstream.
5. Click a task to open the detail editor and edit its start date — confirm the row moves to its new chronological position after save.
6. Confirm collapsing/expanding the workstream still works.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(outline): sort tasks by start date inside each workstream"
```

---

### Task 4: Use the shared helper in GanttView for consistency

**Files:**
- Modify: `src/components/GanttView.tsx:79-83`

This task is OPTIONAL but recommended. GanttView already sorts correctly via an inline copy of the same logic. Centralising avoids drift if the rule changes (e.g. a future "tasks with hard deadline jump above soft" rule). Skip this task if importing across the App.jsx/components boundary feels awkward — in that case keep the inline copy with a clear comment.

- [ ] **Step 1: Locate the inline sort**

```bash
sed -n '78,85p' src/components/GanttView.tsx
```

Expected:

```ts
      for (const ws of pg.workstreams || []) {
        const sorted = [...(ws.tasks || [])].sort((a, b) => {
          const ad = a.start ? +new Date(a.start) : Infinity;
          const bd = b.start ? +new Date(b.start) : Infinity;
          return ad - bd;
        });
        for (const t of sorted) {
```

- [ ] **Step 2: Inline a typed local helper**

Because App.jsx is `.jsx` and GanttView is `.tsx` and the two are not otherwise coupled, do NOT import. Instead replace the inline sort with a tiny typed local function at the top of the file (right after the existing imports). Add this near the other helpers in GanttView.tsx (around line 65, before `export function GanttView`):

```ts
// Visual sort for task lists. Tasks with a start date come first in
// ascending order; tasks without a start date fall to the end. Mirrors
// sortTasksByStart in App.jsx — keep in sync. Returns a new array.
function sortTasksByStart<T extends { start?: string | null }>(tasks: T[] | null | undefined): T[] {
  const list = Array.isArray(tasks) ? tasks : [];
  return [...list].sort((a, b) => {
    const ad = a?.start ? +new Date(a.start) : Infinity;
    const bd = b?.start ? +new Date(b.start) : Infinity;
    if (isNaN(ad) && isNaN(bd)) return 0;
    if (isNaN(ad)) return 1;
    if (isNaN(bd)) return -1;
    return ad - bd;
  });
}
```

Then replace the inline block (lines 79-83 of the current file) with:

```ts
        const sorted = sortTasksByStart(ws.tasks);
```

- [ ] **Step 3: Verify build**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: build succeeds (tsc passes with the typed helper).

- [ ] **Step 4: Manual smoke check**

1. Switch to Gantt view.
2. Confirm visual order in each workstream's row group: tasks ordered by start date asc; tasks without start date at the bottom.
3. Edit a task's start date and confirm the row moves to the right chronological position immediately.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/components/GanttView.tsx && git commit -m "refactor(gantt): extract task sort to local helper mirroring App.jsx"
```

---

### Task 5: Final verification and deploy

- [ ] **Step 1: Production build clean**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: `✓ built in N.NNs` — no TS errors, no warnings other than the existing chunk-size warning.

- [ ] **Step 2: Cross-view consistency check on dev server**

With dev server running:
1. In one project, pick a workstream with at least 3 tasks.
2. Create a 4th task. Set its start date to a date earlier than the existing earliest task.
3. View the workstream in Mindmap → confirm chronological order.
4. View the same workstream in Outline → confirm chronological order matches Mindmap.
5. View the same workstream in Gantt → confirm row order matches the other two.
6. Edit any task to clear its start date → confirm it falls to the bottom in all three views.
7. Edit it again to set a middle start date → confirm it moves to the chronological position in all three views.

- [ ] **Step 3: Push and verify Vercel deploy is Ready**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git push origin main
```

After push, wait for Vercel auto-deploy:

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && until npx vercel ls --yes 2>&1 | sed -n '6p' | grep -E "Ready|Error|Failed" >/dev/null; do sleep 10; done; npx vercel ls --yes 2>&1 | sed -n '5,7p'
```

Expected: most recent deploy reaches `● Ready` within ~30s of push.

- [ ] **Step 4: Production smoke check**

Open https://af-mpt.vercel.app, sign in, repeat the cross-view consistency check from Step 2 on a real project.

---

## Non-goals (explicitly out of scope)

- **Reordering programs or workstreams** — user asked only about tasks. Programs and workstreams keep current array order.
- **Mutating `ws.tasks[]` order on save** — this is a visual sort only. Excel export, OpenProject export, activity log, weight log, credit math all continue to read array order. Changing array order risks subtle bugs across many call sites.
- **Drag-and-drop reorder** — would conflict with auto-sort. Not requested.
- **Secondary sort by deadline type (hard vs soft)** — not requested. Date is the only key.
- **Sorting check-ins, updates, decisions, action items** — these have their own ordering rules and are out of scope here.

## Risk note

The sort is stable, so the only behavior change for users is: tasks with start dates surface in chronological order. Two pre-existing UX assumptions are worth flagging:

1. **Task creation flow ([App.jsx:6406](src/App.jsx#L6406))** initialises new tasks with `start: null`. They will land at the bottom until the user sets a start date — same as before this change. The fix lets them rise once a date is set.
2. **Bulk Excel imports** create tasks in row order and may set start dates. After this fix, the imported task order will be re-sorted by start in the views, which may differ from the row order in the spreadsheet. If the user wants spreadsheet row order preserved, they should leave start blank during import.

Neither is a behavior regression — they are inherent consequences of "sort by start date".
