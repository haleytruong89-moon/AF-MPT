# CRP Tracker — Feature Spec v21 → v29

**Spec for Claude Code handoff**
**Date:** 2026-05-08
**Reference impl:** `CRP_Project_Tracker.jsx` (v29, 10,454 lines)
**Previous spec covered:** v15 → v20 (Activity Dashboard, Briefing Pack, Decision Decay, Workspace Owner, All-projects toggle, Portfolio View, Gantt View) — already shipped to Claude Code via `TODAYS_FEATURES_SPEC.md`

This spec covers everything built **after v20**, in order of dependency. Apply features in version order; later features depend on earlier ones.

---

## Table of contents

1. [v21 — Multi-PIC Combo 1](#v21--multi-pic-combo-1)
2. [v22 — Credit Phase 1: Foundation + manual entry](#v22--credit-phase-1-foundation--manual-entry)
3. [v23 — Credit Phase 1.5: Auto-apply default rules + Project Lead](#v23--credit-phase-15-auto-apply-default-rules--project-lead)
4. [v24 — Credit Phase 2: Calculation engine wire-up](#v24--credit-phase-2-calculation-engine-wire-up)
5. [v25 — Credit Phase 3: Credit Report tab](#v25--credit-phase-3-credit-report-tab)
6. [v26 — PIC autocomplete + Contributor Registry + Cleanup tool](#v26--pic-autocomplete--contributor-registry--cleanup-tool)
7. [v27 — Owner approval for deadlines + Activity restriction](#v27--owner-approval-for-deadlines--activity-restriction)
8. [v28 — Decision form polish + Clear-all buttons](#v28--decision-form-polish--clear-all-buttons)
9. [v29 — Default departments seed + Excel import validation](#v29--default-departments-seed--excel-import-validation)

---

## Cross-cutting design principles

These apply across all features below. Don't violate them.

1. **Single-file React artifact** — all components live in `CRP_Project_Tracker.jsx`. No new file splits.
2. **All schema additions are optional with sensible defaults** — existing data must keep working without migration.
3. **Owner check pattern**: `meta?.workspaceOwner === author` everywhere.
4. **Inline styles via `TOK` token object** — no CSS files, no Tailwind classes added.
5. **Hooks before any return** (Rules of Hooks) — owner-only `if (!isOwner) return ...` goes AFTER all `useState`/`useMemo`.
6. **Soft validation > hard blocks** — warn the user, don't prevent saving.
7. **Audit logs**: every meaningful change goes through `logActivity({ type, description })`. Never delete log entries.
8. **Helpers and constants at top of file**; components after; App at bottom.

---

# v21 — Multi-PIC Combo 1

**Goal:** Track which non-primary people contributed to a task without splitting credit by share. Primary PIC remains accountable.

## Schema additions

```js
task.contributors: string[]   // optional, default []
                              // Names of secondary contributors. Primary PIC is task.pic (existing).
                              // Order is preserved. No duplicates.
                              // For credit splitting, see v22.
```

**Backward compatibility:** existing tasks without `contributors` field treated as empty array.

## Component: `ContributorEditor`

Location: defined alongside other UI components, before `TaskDetail`.

**Props:**
```js
{
  contributors: string[],
  onChange: (next: string[]) => void,
  suggestions: string[],            // legacy "names used in tasks" list
  primaryPic: string,               // to filter out from suggestions
  project: Project,                 // for contributorRegistry (added in v26)
  teamMembersList: Array<{name, email}>,  // for autocomplete (added in v26)
}
```

**Render (chip-style):**
```
Contributors (optional, supporters)
[ AF ✕ ] [ Legal ✕ ] [+ Add contributor]
```

**Behavior:**
- Chip per contributor with ✕ to remove
- "Add contributor" button reveals input with autocomplete dropdown
- Dropdown filters from `suggestions` (and later `contributorRegistry` + `teamMembers`)
- Free text fallback allowed (will show ⚠ warning later)
- Cannot add primary PIC as contributor (filtered out)
- Cannot add duplicate
- Enter to confirm, Esc to cancel

## Integration in `TaskDetail`

In edit form, render `ContributorEditor` directly below Primary PIC field. The save handler should set `task.contributors` to the array.

## Display in read-only view

If `task.contributors` is non-empty, show a `Row k="Contributors"` with the names joined by `, `.

---

# v22 — Credit Phase 1: Foundation + manual entry

**Goal:** Schema + UI for owner to manually enter credit weights at every level.

**Effort:** ~7 hours.

## Schema additions

```js
// Project-level
project.creditPoints: number              // total credit pool, default 100
project.creditYear: number                // e.g., 2026, default = current year
project.weightsLocked: boolean            // when true, weights are read-only
project.weightsLockHistory: Array<{
  ts: string,                             // ISO timestamp
  action: 'lock' | 'unlock',
  year: number,
}>
project.weightChangeLog: Array<{          // last 200 entries (auto-trim)
  ts: string,
  level: 'program' | 'workstream' | 'task',
  id: string,                             // ID of node changed
  to: number | null,                      // new weight value
}>

// Hierarchy nodes
program.weight: number | null             // % within siblings (optional)
workstream.weight: number | null          // % within siblings
task.weight: number | null                // % within workstream
task.creditShares: { [picName]: number }  // {AF: 70, Legal: 30}, optional
                                          // If absent → default 100% to task.pic
```

## Helper functions (at top of file, alongside existing helpers)

```js
const DEFAULT_CREDIT_POINTS = 100;

function equalSplit(count) {
  if (count <= 0) return [];
  const each = Math.round((100 / count) * 100) / 100;
  return new Array(count).fill(each);
}

function getEffectiveWeights(siblings) {
  // If all siblings have explicit numeric weight → normalize to 100, return array
  // Otherwise → equalSplit fallback
  if (!siblings || siblings.length === 0) return [];
  const allHave = siblings.every((s) =>
    typeof s.weight === 'number' && !isNaN(s.weight) && s.weight >= 0
  );
  if (!allHave) return equalSplit(siblings.length);
  const sum = siblings.reduce((acc, s) => acc + s.weight, 0);
  if (sum <= 0) return equalSplit(siblings.length);
  return siblings.map((s) => (s.weight / sum) * 100);
}

function getEffectiveCreditShares(task) {
  // Returns {picName: %} normalized to 100
  // If task.creditShares set → use it (normalize)
  // Else if task.pic exists → return {[task.pic]: 100}
  // Else → return {}
}

function isTaskCredited(task) {
  return task && task.status === 'Completed';
}
```

## UI Component: `WeightBadge`

Inline pill that displays effective weight. Click (when isOwner && !locked) opens inline number input.

**Props:**
```js
{
  weight: number | null,        // explicit weight from schema
  effectiveWeight: number,      // computed (with fallback)
  onChange: (newValue: number | null) => void,
  locked: boolean,              // project.weightsLocked
  isOwner: boolean,
  label: string,                // for tooltip, e.g., 'program "LLCs"'
  cpValue?: number,             // ADDED IN v24 — show "X% · Ycp" if provided
}
```

**Visual states:**
- Explicit weight: green tint background `rgba(59,109,17,0.10)`, color `TOK.accent`, displays `⚖ 30%`
- Auto-equal split: gray background, color `TOK.muted`, displays `⚖ ~33.3%`
- Locked: dashed border on top of either state
- Editing: replaces with `<input type="number">`, autoFocus, commit on blur/Enter, cancel on Esc
- Range validation: 0–100, allow empty (sets weight to null)

**Cursor:** `pointer` when editable, `default` otherwise.

## UI Component: `CreditSharesEditor`

Per-task editor for `task.creditShares`. Located in `TaskDetail` edit form, after Dependencies field.

**Props:**
```js
{
  task: Task,                                                    // current draft state
  onChange: ({ shares: object, mode: 'auto'|'manual' }) => void, // v23 introduces mode
  locked: boolean,
  isOwner: boolean,
}
```

**Render:**
- Field label "Credit shares" + locked/owner badges
- Helper text describing default rule status
- One row per person (primary PIC + contributors), each with:
  - Name + "(primary)" tag if primary PIC
  - `<input type="number">` for %
  - "%" suffix
- Validation banner at bottom:
  - Green ✓ "Total: 100%" if balanced (within 0.5%)
  - Amber ⚠ "Total: X% (should = 100%)" otherwise
- Action buttons (when can edit):
  - "Auto-balance" — distribute remaining among unset, or normalize all to 100
  - "Reset to default rule" (v23) — revert to computeDefaultCreditShares result + flip mode to 'auto'

**Empty state:** if no PIC and no contributors, show italic message "No PIC or contributors set. Add them above to allocate credit shares."

## ProjectSettingsModal — Credit allocation section

Add a new section inside the modal, owner-only edit, between OpenProject Code and Team members.

**State (in ProjectSettingsModal):**
```js
const [creditPoints, setCreditPoints] = useState(...)
const [creditYear, setCreditYear] = useState(...)
const [weightsLocked, setWeightsLocked] = useState(...)
```

**UI:**
```
┌─ Credit allocation ──────────────────────────┐
│ Total credit points decided by BoD/HR upfront│
│ Default rules: 1 PIC + 0 contrib → 100/0;    │
│ +1 contrib → 70/30; +2 → 70/15/15; +3+ →     │
│ enter manually.                              │
│                                              │
│ [Total credit points: 100]  [Year: 2026 ▼]   │
│                                              │
│ [🔓 Unlocked / 🔒 Locked for 2026]   [Lock] │
│                                              │
│ ▾ Lock history (3 entries)                   │
└──────────────────────────────────────────────┘
```

**Lock toggle behavior:**
- Click "Lock" → confirmation dialog → set weightsLocked=true, append to weightsLockHistory
- Click "Unlock" → confirmation → set weightsLocked=false, append to weightsLockHistory
- If `lockChanged` in save: append `{ts, action, year}` to history

## OutlineView — Credit pool banner

At the top of OutlineView (above the program list), show a banner if `creditPoints` set OR isOwner:

```
🔓 Credit pool: 100 cp · Year 2026   [hint text]
```

When locked, banner has red background `#FCEBEB`, when unlocked blue `#E6F1FB`.

## OutlineView — Wire WeightBadge for programs/workstreams/tasks

In each level of the outline render:
- After the name, render `<WeightBadge>` with appropriate props
- For programs: weights are within `project.programs`
- For workstreams: weights are within `pg.workstreams`
- For tasks: weights are within filtered `eligibleTasks` (excludes Dropped)

**Update handlers** in OutlineView:
```js
const updateProgramWeight = (pgId, newWeight) => {
  if (!isOwner || weightsLocked) return;
  // Update project, append to weightChangeLog (last 200), call onActivity
};
// Similar for updateWorkstreamWeight, updateTaskWeight
```

## TaskDetail integration

- Pass `isOwner` as prop
- In edit form, after Dependencies field, add `<CreditSharesEditor>`
- In read-only view, after Dependencies row, show "Credit shares" row if shares exist
  - Format: "AF 70%, Legal 30%" or "AF 100% (default 100% to primary)"

## Anti-gaming features

- All weight edits append to `project.weightChangeLog` (cap 200)
- `project.weightsLocked === true` disables all weight edits unless owner explicitly unlocks
- Owner-only enforcement at every UI level (disabled buttons, opacity 0.55)
- Validation is soft — sum != 100 shows amber warning, doesn't block save

---

# v23 — Credit Phase 1.5: Auto-apply default rules + Project Lead

**Goal:** Reduce friction. Auto-fill credit shares per business rules. Add "Project Lead" pool.

**Effort:** ~3 hours.

## Schema additions

```js
project.projectLead: string | null         // name from teamMembers, e.g., "hattt4"
project.projectLeadShare: number           // % of total pool, default 10

task.creditSharesMode: 'auto' | 'manual'   // tracks if PM overrode the default rule
                                           // Default 'auto' for new tasks
```

## Helper: `computeDefaultCreditShares(primaryPic, contributors)`

```js
// Returns {[name]: %} or null if no rule applies (3+ contribs, or no primary)
function computeDefaultCreditShares(primaryPic, contributors) {
  if (!primaryPic) return null;
  const contribs = Array.isArray(contributors) ? contributors.filter(Boolean) : [];
  if (contribs.length === 0) return { [primaryPic]: 100 };
  if (contribs.length === 1) return { [primaryPic]: 70, [contribs[0]]: 30 };
  if (contribs.length === 2) return { [primaryPic]: 70, [contribs[0]]: 15, [contribs[1]]: 15 };
  return null;  // 3+ contributors → manual
}
```

## Update: `computeProjectCredits(project)`

Now extracts Project Lead share **first**:

```js
function computeProjectCredits(project) {
  const totalCp = project.creditPoints ?? DEFAULT_CREDIT_POINTS;
  const perPic = new Map();
  const breakdown = [];

  // Step 1: Project Lead (if set)
  const leadName = (project.projectLead || '').trim();
  const leadSharePct = project.projectLeadShare ?? (leadName ? 10 : 0);
  const leadCp = leadName ? (totalCp * leadSharePct / 100) : 0;
  if (leadName && leadCp > 0) {
    const r = rollup(project);
    // Earned proportional to overall completion (NOT all-or-nothing)
    const projectCompletionPct = (r.weighted / Math.max(r.total, 1)) * 100;
    const leadActual = leadCp * (projectCompletionPct / 100);
    perPic.set(leadName, { earned: leadActual, projected: leadCp });
    breakdown.push({
      programId: null, programName: '— Project Lead —',
      workstreamId: null, workstreamName: '',
      taskId: null, taskName: `${leadName} (project lead, ${leadSharePct}%)`,
      picName: leadName, sharePct: 100, taskCp: leadCp,
      projected: leadCp, actual: leadActual,
      credited: r.weighted >= r.total,
      isProjectLead: true,
    });
  }

  // Step 2: Programs/workstreams/tasks share remaining (100 - leadShare)%
  const programPoolCp = totalCp - leadCp;
  // ... existing recursive walk, but use programPoolCp instead of totalCp
}
```

Returns `{ totalCp, leadCp, leadName, leadSharePct, programPoolCp, perPic, breakdown }`.

## Auto-apply in TaskDetail

When user changes Primary PIC or Contributors in draft state:

```js
// PIC change
onChange={(v) => {
  const next = { ...draft, pic: v };
  const mode = draft.creditSharesMode || 'auto';
  if (mode === 'auto') {
    const def = computeDefaultCreditShares(v, draft.contributors || []);
    if (def) next.creditShares = def;
    else next.creditSharesMode = 'manual';  // 3+ contribs → flip to manual
  }
  setDraft(next);
}}
```

Same logic in ContributorEditor onChange.

## CreditSharesEditor — mode tracking

When user manually edits any share value:
- Flip `mode` to 'manual'
- Pass `{ shares: next, mode: 'manual' }` to parent onChange

"Reset to default rule" button:
- Compute `def = computeDefaultCreditShares(primary, contribs)`
- Pass `{ shares: def || {[primary]:100}, mode: 'auto' }` to parent

## Mode badge in CreditSharesEditor

After "Credit shares" label, show pill:
- Mode='auto' → teal `⚙ Auto` (`#E1F5EE`/`#0F6E56`)
- Mode='manual' → amber `✎ Manual override` (`#FAEEDA`/`#A8660C`)

## Helper text dynamics

- Auto + default exists: "Auto-applied per default rule (70/30, 70/15/15). Editing any value switches to manual override."
- Auto + 3+ contribs: "3+ contributors — no default rule. Enter shares manually."
- Manual: "Manually edited. Click 'Reset to default' to revert to the rule-based split."

## ProjectSettingsModal — Project Lead row

Inside Credit allocation section, after Total credit points / Credit year row:

```
Project lead (receives a share of total pool, tied to overall completion)
[hattt4 ▼]                                Lead share: [10] %

ℹ️ hattt4 will earn up to 10 cp based on overall project completion.
   Remaining 90% (90 cp) is split among programs/workstreams/tasks.
```

If `members.length === 0`:
- Disable dropdown with opacity 0.5
- Show ⚠ "Add team members below first, then return to pick project lead."

## Read-only credit shares display

In TaskDetail meta info, after "Dependencies" row, conditional Row:
```
Credit shares: AF 70%, Legal 30% ⚙ Auto
```
Suffixes:
- `(default 100% to primary)` if `creditShares` empty
- `⚙ Auto` if mode=auto + explicit
- `✎ Manual` if mode=manual

## New task creation defaults

When creating a new task (in OutlineView and in mind-map view, look for `id: uid('t'), name, status: 'Planned', pic: null, contributors: [], …`), add `creditSharesMode: 'auto'` to the default object.

---

# v24 — Credit Phase 2: Calculation engine wire-up

**Goal:** Make credit numbers visible in existing views. No new tabs yet.

**Effort:** ~6 hours.

## 1. WeightBadge — show cp value inline

Add `cpValue` prop. If provided and > 0, display `⚖ 30% · 27cp`.

```jsx
const cpDisplay = (typeof cpValue === 'number' && cpValue > 0)
  ? `· ${Math.round(cpValue * 10) / 10}cp`
  : '';
// Render after the percentage with smaller font + 0.75 opacity
```

## 2. OutlineView — pre-compute creditInfo memo

Inside OutlineView, add:

```js
const creditInfo = useMemo(() => {
  const result = computeProjectCredits(project);
  const programCp = new Map();
  const workstreamCp = new Map();
  const taskCp = new Map();
  for (const b of result.breakdown) {
    if (b.isProjectLead) continue;
    if (b.programId) programCp.set(b.programId, (programCp.get(b.programId) || 0) + (b.taskCp || 0));
    if (b.workstreamId) workstreamCp.set(b.workstreamId, (workstreamCp.get(b.workstreamId) || 0) + (b.taskCp || 0));
    if (b.taskId) taskCp.set(b.taskId, b.taskCp || 0);
  }
  const programEarned = new Map();
  const workspaceEarned = result.breakdown.reduce((sum, b) => sum + (b.actual || 0), 0);
  for (const b of result.breakdown) {
    if (b.isProjectLead) continue;
    if (b.programId) programEarned.set(b.programId, (programEarned.get(b.programId) || 0) + (b.actual || 0));
  }
  return { result, programCp, workstreamCp, taskCp, programEarned, workspaceEarned };
}, [project]);
```

## 3. Pass cpValue into all 3 WeightBadge usages

```jsx
<WeightBadge ... cpValue={creditInfo.programCp.get(pg.id)} />
<WeightBadge ... cpValue={creditInfo.workstreamCp.get(ws.id)} />
<WeightBadge ... cpValue={creditInfo.taskCp.get(t.id)} />
```

## 4. Enhance OutlineView credit pool banner

Below the existing single-line banner, add a second line with totals:

```
🔓 Credit pool: 100 cp · Year 2026          [hint]
─────────────────────────────────────────────────────
Lead: hattt4 · 10 cp pool   Allocated: 90 cp
Earned so far: 12.5 cp (only Completed tasks)   Top: AF 18.7 · Legal 12.4 · HR 8.1
```

Use `creditInfo.result` for these numbers. Show top 3 PICs sorted by projected.

## 5. TaskDetail — Credit Projection panel

After the read-only meta block but before deadlineHistory, render:

```jsx
{(typeof project.creditPoints === 'number' || project.projectLead) && task.status !== 'Dropped' && (() => {
  const projectCredits = computeProjectCredits(project);
  const taskBreakdown = projectCredits.breakdown.filter((b) => b.taskId === task.id);
  if (taskBreakdown.length === 0) return null;
  const taskCp = taskBreakdown[0].taskCp || 0;
  const credited = taskBreakdown[0].credited;
  if (taskCp <= 0) return null;
  return (
    <CreditProjectionPanel ... />  // see structure below
  );
})()}
```

**Visual:**
- Green background `#E6EFD6` if credited, else gray bg
- Title: "Credit projection" + badge `✓ Earned (task complete)` or `○ Projected (not yet complete)`
- Task pool: `2.7 cp (2.7% of 100 cp project pool)`
- Per-PIC breakdown rows: `AF (70%)` ... `1.89 cp` (green if credited)
- Footer: "Mark task as Completed to award these credits." (only when not credited)

## 6. Activity Dashboard — Credits column

Add new column to PIC scoreboard:
- Header: `Credits (cp)` (text-align: right)
- Grid template: change from `1.4fr 1fr 1fr 1fr 1fr 0.9fr` to `1.3fr 0.9fr 0.9fr 0.9fr 0.9fr 0.85fr 1fr`
- New `CreditsCell` component:

```jsx
function CreditsCell({ credits }) {
  if (!credits || (credits.earned <= 0 && credits.projected <= 0)) {
    return <div style={{ textAlign: 'right' }}><div style={{ fontSize: 13, color: TOK.subtle }}>—</div></div>;
  }
  const earned = Math.round(credits.earned * 10) / 10;
  const projected = Math.round(credits.projected * 10) / 10;
  const pct = projected > 0 ? Math.round((earned / projected) * 100) : 0;
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 13, fontWeight: 500 }}>
        <span style={{ color: '#356512' }}>{earned}</span>
        <span style={{ color: TOK.subtle, fontSize: 11 }}> / {projected}</span>
      </div>
      <div style={{ fontSize: 10, color: TOK.subtle }}>{pct}% earned (projected)</div>
    </div>
  );
}
```

In ActivityDashboardView, add memo:
```js
const picCredits = useMemo(() => {
  const result = computeWorkspaceCredits(projects);
  return result.perPic;
}, [projects]);
```

Pass to PICRow as `credits={picCredits.get(m.pic)}`.

## 7. Audit logs in onTaskUpdate

When a task is saved via onTaskUpdate (in App.jsx-equivalent area), log:

```js
// Mode flip
const oldMode = oldTask.creditSharesMode || 'auto';
const newMode = updatedTask.creditSharesMode || 'auto';
if (oldMode !== newMode) {
  logActivity({
    type: 'credit_mode_change',
    description: `Credit shares for "${updatedTask.name}": ${oldMode} → ${newMode}`,
  });
}

// Manual share edit
const oldShares = JSON.stringify(oldTask.creditShares || {});
const newShares = JSON.stringify(updatedTask.creditShares || {});
if (oldShares !== newShares && newMode === 'manual') {
  const fmt = (s) => Object.entries(JSON.parse(s)).map(([n, v]) => `${n}:${Math.round(v * 10) / 10}%`).join(', ') || '—';
  logActivity({
    type: 'credit_shares_change',
    description: `Credit shares manually edited on "${updatedTask.name}": ${fmt(oldShares)} → ${fmt(newShares)}`,
  });
}
```

---

# v25 — Credit Phase 3: Credit Report tab

**Goal:** Owner-only dedicated view for year-end performance attribution.

**Effort:** ~6 hours.

## Helper: `computeWorkspaceCredits(projects, year = null)`

Aggregate credits across all projects, optionally filtered by `project.creditYear`.

```js
function computeWorkspaceCredits(projects, year = null) {
  const perPic = new Map();
  const perProject = new Map();
  let totalCp = 0;

  for (const proj of Object.values(projects || {})) {
    if (year != null && proj.creditYear != null && proj.creditYear !== year) continue;
    const result = computeProjectCredits(proj);
    totalCp += result.totalCp;
    perProject.set(proj.id, { project: proj, ...result });
    for (const [pic, val] of result.perPic.entries()) {
      if (!perPic.has(pic)) perPic.set(pic, { earned: 0, projected: 0 });
      const cur = perPic.get(pic);
      cur.earned += val.earned;
      cur.projected += val.projected;
    }
  }
  return { totalCp, perPic, perProject };
}
```

## New tab "Credits" — owner-only

Add to navigation tab list (after Portfolio):
```js
...(meta?.workspaceOwner === author ? [{ id: 'credit-report', label: 'Credits', icon: <Activity size={12} />, ownerOnly: true }] : []),
```

Add render handler:
```jsx
{view === 'credit-report' && (
  <CreditReportView projects={projects} isOwner={meta?.workspaceOwner === author} />
)}
```

## Component: `CreditReportView`

Located right after `PortfolioView`.

**Hooks order is critical** — declare ALL hooks before any return:

```js
function CreditReportView({ projects, isOwner }) {
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => { ... }, [projects, thisYear]);
  const [selectedYear, setSelectedYear] = useState(allYears[0] || thisYear);
  const [sortBy, setSortBy] = useState('projected');
  const [selectedPic, setSelectedPic] = useState(null);
  const report = useMemo(() => computeWorkspaceCredits(projects, selectedYear), [projects, selectedYear]);
  const picRows = useMemo(() => { ... }, [report, sortBy]);
  const drilldown = useMemo(() => { ... }, [selectedPic, report]);
  const summary = useMemo(() => { ... }, [report]);

  // Owner gate AFTER all hooks
  if (!isOwner) {
    return <div ...>Credit report is workspace-owner only.</div>;
  }

  const exportExcel = () => { ... };  // see below
  return ( ... );
}
```

## Layout

### Header row
```
Credit Report [OWNER ONLY]                    [Year 2026 ▼] [📥 Export Excel]
Year-end performance attribution. Earned = ... Projected = ... Effort-based: only Completed tasks earn credit, except Project Lead.
```

### Summary cards (4 cards in grid)

| Total credit pool | Earned so far | Locked projects | Distinct PICs |
| 480 cp / 5 projects | 65.2 cp / 13.6% | 3/5 / Partial | 8 |

Use a `SummaryCard` helper component:
```jsx
function SummaryCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: TOK.muted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: accent || TOK.ink }}>{value}</div>
      <div style={{ fontSize: 11, color: TOK.subtle }}>{sub}</div>
    </div>
  );
}
```

### Per-PIC table (sortable)

Columns: PIC | Earned (cp) | Projected (cp) | % of total | % earned (mini progress bar) | (expand arrow)

`SortableHeader` helper:
```jsx
function SortableHeader({ label, field, sortBy, onSort, align = 'left' }) {
  const isActive = sortBy === field;
  return (
    <div onClick={() => onSort(field)}
      style={{ textAlign: align, cursor: 'pointer', userSelect: 'none',
               color: isActive ? TOK.accent : TOK.muted, ... }}>
      <span>{label}</span>
      {isActive && <span style={{ fontSize: 9 }}>▼</span>}
    </div>
  );
}
```

Click a row → toggle drill-down. Selected row highlighted with `#E6F1FB`.

### Drill-down panel (when row selected)

For each project the PIC contributed to:
- Project header: name + year + total earned/projected
- Per program (sorted by projected desc):
  - 👑 Project Lead pseudo-program (yellow border `#E6B800`) when applicable
  - Regular programs (TOK.programFg)
  - Each program shows tasks (limit 20, "+N more" link)
- Task lines: `✓` for credited, `○` for projected, strikethrough for Dropped
- Format: `[workstream] [task name] [share %] ... [cp value]`

### Excel export — 3 sheets

Filename: `Credit_Report_2026_2026-05-08.xlsx`

```js
const exportExcel = () => {
  const wb = XLSX.utils.book_new();

  // Sheet 1: PIC summary
  const picSheet = picRows.map((r) => ({
    'PIC': r.name,
    'Earned (cp)': Math.round(r.earned * 100) / 100,
    'Projected (cp)': Math.round(r.projected * 100) / 100,
    '% of total': Math.round(r.pct * 10) / 10 + '%',
    '% earned (vs projected)': Math.round(r.pctEarned * 10) / 10 + '%',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(picSheet), 'PIC summary');

  // Sheet 2: Full breakdown — every task × pic combination
  const fullRows = [];
  for (const [, pd] of report.perProject.entries()) {
    for (const b of pd.breakdown) {
      fullRows.push({
        'Project': pd.project.name,
        'Program': b.programName,
        'Workstream': b.workstreamName || '',
        'Task': b.taskName,
        'Status': b.taskStatus || (b.isProjectLead ? 'Project Lead' : ''),
        'PIC': b.picName,
        'Share (%)': Math.round(b.sharePct * 10) / 10,
        'Task pool (cp)': Math.round((b.taskCp || 0) * 100) / 100,
        'Projected (cp)': Math.round(b.projected * 100) / 100,
        'Earned (cp)': Math.round(b.actual * 100) / 100,
        'Credited?': b.credited ? 'Yes' : 'No',
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fullRows), 'Full breakdown');

  // Sheet 3: Project metadata
  const projRows = [];
  for (const [, pd] of report.perProject.entries()) {
    projRows.push({
      'Project': pd.project.name,
      'Year': pd.project.creditYear || '',
      'Total pool (cp)': pd.totalCp,
      'Project Lead': pd.project.projectLead || '—',
      'Lead share (%)': pd.leadSharePct,
      'Lead pool (cp)': Math.round(pd.leadCp * 100) / 100,
      'Locked?': pd.project.weightsLocked ? 'Yes' : 'No',
    });
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projRows), 'Projects');

  XLSX.writeFile(wb, `Credit_Report_${selectedYear}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
```

### Empty state

When `picRows.length === 0`:
```
📊 No credit allocation for year 2026 yet.
Set Credit points, Year, and weights in Project Settings + Outline view.
PICs with credit shares on tasks will appear here.
```

---

# v26 — PIC autocomplete + Contributor Registry + Cleanup tool

**Goal:** Enforce data quality on PIC and contributor names.

## Schema additions

```js
project.contributorRegistry: Array<{ name: string }>  // owner-curated standard list
```

## Component: `PicEditor`

Single-select autocomplete from `teamMembers` only (not registry — PIC needs email).

**Props:**
```js
{
  value: string | null,
  onChange: (name: string | null) => void,
  teamMembersList: Array<{name, email}>,
  project?: Project,                    // not used after v29 revert, but kept for compat
  label?: string,
  placeholder?: string,
}
```

**States:**
1. **Read state** — chip `[name (email) | ⚠ Not a team member badge | edit icon]` + separate `[✕]` button to clear
2. **Edit state** — text input + dropdown panel below
   - Suggestions filtered by name OR email substring
   - First match wins on Enter
   - Esc cancels
   - Free-text fallback button at bottom: `⚠ Use "X" as free text (not in team members)` (with warn color)
   - Cancel button at bottom

**Visual:**
- Chip flex layout, 36px min-height
- Email shown as `(hattt4@smartosc.com)` in muted color after name
- Unknown PIC: `⚠ Not a team member` badge with `#A8660C` color, `#FAEEDA` background

## Update: `ContributorEditor` enhancements

**New props:**
- `project: Project` — to read `contributorRegistry`
- `teamMembersList: Array<{name, email}>` — for autocomplete with emails

**Combined suggestion source (deduped):**
1. Team members (with email + 'Person' or no badge)
2. Registry entries (no email + 'Registered' badge)
3. Legacy `suggestions` prop (no email + 'Used in tasks' badge)

**Chip rendering changes:**
- Known (in members or registry): `TOK.bg` background, `TOK.line` border
- Unknown: `#FAEEDA` background, `#E0BC75` border, ⚠ icon prefix
- Tooltip shows email for members; "Not in team members or contributor registry..." for unknown

## ProjectSettingsModal — Contributor Registry section

After "Team members & emails" section, add another bordered card (owner-only edit).

**State:**
```js
const [contributorRegistry, setContributorRegistry] = useState(
  Array.isArray(project.contributorRegistry) ? project.contributorRegistry : []
);
const [newContribName, setNewContribName] = useState('');
const [mergeFrom, setMergeFrom] = useState('');
const [mergeTo, setMergeTo] = useState('');

// Compute contributors actually used in tasks across this project
const usedContributors = useMemo(() => {
  const seen = new Map();  // name → {count, taskIds[]}
  for (const pg of (project.programs || [])) {
    for (const ws of (pg.workstreams || [])) {
      for (const t of (ws.tasks || [])) {
        for (const c of (t.contributors || [])) {
          if (!seen.has(c)) seen.set(c, { count: 0, taskIds: [] });
          const entry = seen.get(c);
          entry.count++;
          entry.taskIds.push(t.id);
        }
      }
    }
  }
  return seen;
}, [project]);
```

**UI structure:**
```
📋 Contributor registry
Standard list of contributor names (teams, roles, external parties)...

[Add to registry: ...]  [+ Add]  [✨ Seed defaults]   ← v29 adds Seed button

[ AF (5) ✕ ]  [ Legal (8) ✕ ]  [ HR (3) ✕ ]   ← chips with usage count

⚠ Unregistered contributor names found in tasks (3)
─────────────────────────────────────────
Accounting Team (5 tasks)      [Adopt] [Merge…] [Remove]
AF + Finance (2 tasks)         [Adopt] [Merge…] [Remove]
LegaL (1 task)                 [Adopt] [Merge…] [Remove]

[Merge form when "Merge…" clicked]
```

**Handlers:**
```js
const addContributorToRegistry = () => { /* check dup, append */ };
const removeContributorFromRegistry = (name) => { /* filter out */ };
const adoptToRegistry = (name) => { /* add unregistered name to registry */ };

const performMerge = async () => {
  // Walk all tasks. Replace contributors[name=from] → to (dedupe).
  // Replace creditShares[from] → creditShares[to] (sum if to already exists).
  // Save via onSave(updatedProject)
};

const performDeleteFromTasks = async (name) => {
  // Walk all tasks. Remove from contributors arrays. Remove from creditShares.
  // Save via onSave(updatedProject)
};
```

**Important:** When `performMerge` or `performDeleteFromTasks` calls `onSave`, the payload must include all current modal state (contributorRegistry, members, creditPoints, etc.) — not just the project changes. Otherwise the modal state will be lost on save.

## Save handler — include registry

In `save()` callback of ProjectSettingsModal:
```js
onSave({
  ...project,
  ...,  // all existing fields
  contributorRegistry,
});
```

## Wire `ContributorEditor` in TaskDetail

Pass `project={project}` and `teamMembersList={teamMembers || []}`.

## Wire `PicEditor` in TaskDetail

Replace `<Input value={draft.pic} onChange={...} />` with:
```jsx
<PicEditor
  value={draft.pic}
  onChange={(v) => {
    const next = { ...draft, pic: v };
    const mode = draft.creditSharesMode || 'auto';
    if (mode === 'auto') {
      const def = computeDefaultCreditShares(v, draft.contributors || []);
      if (def) next.creditShares = def;
      else next.creditSharesMode = 'manual';
    }
    setDraft(next);
  }}
  teamMembersList={teamMembers || []}
  project={project}
/>
```

## Remove "Rename project" menu item

In the project popover menu (`projectMenu` items), remove the "Rename project" entry. Project name is now edited via Project Settings only.

---

# v27 — Owner approval for deadlines + Activity restriction

## Schema additions

```js
task.deadlineRequest: {
  newDate: string,         // YYYY-MM-DD
  reason: string,          // min 5 chars
  requestedBy: string,     // author at time of request
  requestedAt: string,     // ISO timestamp
  days: number,            // delta (positive = extend, negative = shorten)
  action: 'extend' | 'shorten',
} | null

task.deadlineRequestHistory: Array<{
  ...request,
  status: 'approved' | 'rejected' | 'cancelled',
  resolvedBy: string,      // author who resolved
  resolvedAt: string,      // ISO timestamp
  resolverNote?: string,   // optional, for rejection reason
}>

// existing field — extend with approvedBy
task.deadlineHistory[i].approvedBy: string  // owner who approved (when via request flow)
```

## Component: `DeadlineRequestDialog`

Modal for non-owners to submit a deadline change request.

**Props:**
```js
{
  task: Task,
  currentEnd: string,
  author: string,
  onClose: () => void,
  onSubmit: (req: DeadlineRequest) => void,
}
```

**Render:**
- Description: "Submit a deadline change for **{task.name}**. Workspace owner will review..."
- Two side-by-side fields: Current end (read-only), Proposed new end (date input)
- Days delta pill: `➡ 15 days later` (amber) or `⬅ 5 days earlier` (teal)
- Reason textarea (3 rows), required min 5 chars
- Submit disabled unless: newDate is set, newDate ≠ currentEnd, reason.trim().length >= 5

**On submit:**
```js
onSubmit({
  newDate, reason: reason.trim(),
  requestedBy: author, requestedAt: new Date().toISOString(),
  days, action: days > 0 ? 'extend' : 'shorten',
});
onClose();
```

## Component: `DeadlineRequestBanner`

Visible to all users when `task.deadlineRequest` is set.

**Props:**
```js
{
  task: Task,
  request: DeadlineRequest | null,
  author: string,
  isOwner: boolean,
  onApprove: () => void,
  onReject: () => void,
  onCancel: () => void,
}
```

**Render:**
```
⏳ Deadline change request — pending owner review
hattt4 requested to extend the deadline by 15 days:
30/04/2026 → 15/05/2026
"Vendor delay on contract review"
Requested 2 May 2026, 14:32
```

**Action buttons (role-based):**
- Owner: `[✓ Approve]` `[✕ Reject]`
- Requester (`request.requestedBy === author`): `[Cancel my request]`
- Other: read-only note "Only the requester can cancel; only workspace owner can approve/reject."

## TaskDetail handlers

Inside `TaskDetail`, add:

```js
const submitDeadlineRequest = (req) => {
  onUpdate({ ...task, deadlineRequest: req });
};

const approveDeadlineRequest = async () => {
  if (!task.deadlineRequest) return;
  const req = task.deadlineRequest;
  const ok = await dialogs.confirm({
    title: `Approve deadline ${req.action || 'change'}?`,
    message: `Apply new end date ${fmtDateShort(req.newDate)} to "${task.name}"? This will be recorded in the audit log.`,
    okLabel: 'Approve',
  });
  if (!ok) return;
  const histEntry = {
    id: uid('dh'),
    from: task.end || null,
    to: req.newDate,
    changedBy: req.requestedBy,
    changedAt: new Date().toISOString(),
    reason: req.reason,
    approvedBy: author,
    approvedAt: new Date().toISOString(),
  };
  const reqHistEntry = { ...req, status: 'approved', resolvedBy: author, resolvedAt: new Date().toISOString() };
  onUpdate({
    ...task,
    end: req.newDate,
    deadlineRequest: null,
    deadlineHistory: [...(task.deadlineHistory || []), histEntry],
    deadlineRequestHistory: [...(task.deadlineRequestHistory || []), reqHistEntry],
  });
};

const rejectDeadlineRequest = async () => {
  if (!task.deadlineRequest) return;
  const req = task.deadlineRequest;
  const note = await dialogs.prompt({
    title: 'Reject deadline change?',
    message: `Optionally explain why "${req.requestedBy}" should keep the original deadline.`,
    placeholder: 'e.g., Dependencies on this task; please re-prioritize',
    okLabel: 'Reject',
    allowEmpty: true,
  });
  if (note === null) return;
  const reqHistEntry = {
    ...req, status: 'rejected',
    resolvedBy: author, resolvedAt: new Date().toISOString(),
    resolverNote: (note || '').trim() || null,
  };
  onUpdate({
    ...task,
    deadlineRequest: null,
    deadlineRequestHistory: [...(task.deadlineRequestHistory || []), reqHistEntry],
  });
};

const cancelDeadlineRequest = async () => {
  if (!task.deadlineRequest) return;
  const ok = await dialogs.confirm({
    title: 'Cancel your request?',
    message: 'Withdraw this deadline change request? You can submit a new one later.',
    okLabel: 'Cancel request',
  });
  if (!ok) return;
  const reqHistEntry = {
    ...task.deadlineRequest, status: 'cancelled',
    resolvedBy: author, resolvedAt: new Date().toISOString(),
  };
  onUpdate({
    ...task,
    deadlineRequest: null,
    deadlineRequestHistory: [...(task.deadlineRequestHistory || []), reqHistEntry],
  });
};
```

State for modal:
```js
const [showDeadlineRequest, setShowDeadlineRequest] = useState(false);
// Reset on task switch in the existing useEffect
```

## TaskDetail — gate End date editing

Find the existing date inputs (Start / End side-by-side):

```jsx
<div style={{ flex: 1 }}>
  <FieldLabel>
    End {!isOwner && <span style={{ ... }}>(request change)</span>}
  </FieldLabel>
  {isOwner ? (
    <Input type="date" value={draft.end || ''} onChange={(v) => setDraft({ ...draft, end: v || null })} />
  ) : (
    <div style={{ display: 'flex', gap: 6 }}>
      <div style={{ flex: 1, padding: '8px 10px', background: TOK.bg, border: '1px dashed ' + TOK.lineStrong,
                    borderRadius: 7, fontSize: 13, color: TOK.muted, cursor: 'not-allowed' }}>
        🔒 {draft.end ? fmtDateShort(draft.end) : '—'}
      </div>
      <Btn size="sm" onClick={() => setShowDeadlineRequest(true)} disabled={!!task.deadlineRequest}>
        {task.deadlineRequest ? '⏳ Request pending' : 'Request change'}
      </Btn>
    </div>
  )}
</div>
```

## TaskDetail — gate Hard/Soft toggle

In the Deadline type buttons, set `disabled={!isOwner}`, `onClick={() => isOwner && setDraft(...)}`, `cursor: isOwner ? 'pointer' : 'not-allowed'`, `opacity: !isOwner && !isActive ? 0.55 : 1`. Add helper text "Only workspace owner can change deadline type" when not owner.

## TaskDetail — render banner + modal

After the meta block but before the deadlineHistory section:
```jsx
<DeadlineRequestBanner
  task={task}
  request={task.deadlineRequest}
  author={author}
  isOwner={isOwner}
  onApprove={approveDeadlineRequest}
  onReject={rejectDeadlineRequest}
  onCancel={cancelDeadlineRequest}
/>
```

At the end of TaskDetail return (just before closing `</div>`):
```jsx
{showDeadlineRequest && (
  <DeadlineRequestDialog
    task={task}
    currentEnd={task.end}
    author={author}
    onClose={() => setShowDeadlineRequest(false)}
    onSubmit={submitDeadlineRequest}
  />
)}
```

## Audit logs in onTaskUpdate

```js
// New request
const oldReq = oldTask.deadlineRequest;
const newReq = updatedTask.deadlineRequest;
if (!oldReq && newReq) {
  logActivity({
    type: 'deadline_request',
    description: `${newReq.requestedBy} requested to ${newReq.action} "${updatedTask.name}" deadline by ${Math.abs(newReq.days || 0)}d → ${fmtDateShort(newReq.newDate)}`,
  });
} else if (oldReq && !newReq) {
  // Resolved — look at last entry of deadlineRequestHistory
  const lastHist = (updatedTask.deadlineRequestHistory || []).slice(-1)[0];
  if (lastHist) {
    const verb = lastHist.status === 'approved' ? 'Approved' : lastHist.status === 'rejected' ? 'Rejected' : 'Cancelled';
    logActivity({
      type: 'deadline_request_' + lastHist.status,
      description: `${verb} ${oldReq.requestedBy}'s deadline request on "${updatedTask.name}"${lastHist.resolverNote ? ' — ' + lastHist.resolverNote : ''}`,
    });
  }
}
// Type change (only owner can do this directly)
if ((oldTask.deadlineType || 'hard') !== (updatedTask.deadlineType || 'hard')) {
  logActivity({
    type: 'deadline_type_change',
    description: `Changed "${updatedTask.name}" deadline type: ${oldTask.deadlineType || 'hard'} → ${updatedTask.deadlineType || 'hard'}`,
  });
}
```

## Activity Dashboard — restrict controls for non-owners

Add `isOwner` prop to `ActivityDashboardView`. Pass from App: `isOwner={meta?.workspaceOwner === author}`.

For all sort/window controls (Window dropdowns, Sort dropdown, Difficulty button):
- Add `disabled={!isOwner}` to native selects
- Add `style={{ opacity: isOwner ? 1 : 0.55, cursor: isOwner ? 'pointer' : 'not-allowed' }}`
- Hide ⚖️ Difficulty button entirely when `!isOwner`
- Insert note before Sort: `🔒 Sort & window settings managed by workspace owner` (only when not owner)

PIC scoreboard table itself remains visible — only controls are restricted.

---

# v28 — Decision form polish + Clear-all buttons

## ContributorEditor — Clear all button

When `list.length >= 1` (NOT `> 1`), show:
```jsx
<button onClick={() => onChange([])} style={{ ... }}>
  <X size={10} /> Clear all ({list.length})
</button>
```

## DecisionForm — decidedBy multi-select rework

Replace the existing single-list of all teamMembers with a smarter UI:

```js
const memberNames = new Set((teamMembers || []).map((m) => m.name));
const registry = Array.isArray(project?.contributorRegistry) ? project.contributorRegistry : [];
const registryNames = new Set(registry.map((r) => r.name));

// Valid options: members + registry
const validOptions = [
  ...(teamMembers || []).map((m) => ({ name: m.name, kind: 'member', email: m.email })),
  ...registry.filter((r) => !memberNames.has(r.name)).map((r) => ({ name: r.name, kind: 'group' })),
];

// Legacy values: in decidedBy[] but not in either pool
const legacyValues = decidedBy.filter((n) => !memberNames.has(n) && !registryNames.has(n));
```

**Render:**
- Section 1: Valid options as toggle buttons
  - Members: just name
  - Groups: name + `(group)` suffix in muted color
  - Tooltip with email for members
- Section 2 (only if legacyValues.length > 0): amber alert box with chips for each legacy value, each with ✕ to remove
  - Hint: "Owner can add these to registry in Project Settings, or remove here."
- Section 3: `Clear all (N)` button when `decidedBy.length >= 1`

---

# v29 — Default departments seed + Excel import validation

## Constants

```js
const DEFAULT_DEPARTMENTS = ['HR', 'QA', 'GA', 'Legal', 'IT', 'FIN', 'AF', 'BOD'];
```

Add right after `const DEFAULT_CREDIT_POINTS = 100;`.

## Auto-seed for new projects

In `createNewProject` and in `parseExcelFile` (the only 2 sites where projects are created):

```js
const project = {
  id: uid('proj'),
  name: ...,
  createdAt: new Date().toISOString(),
  programs: [], decisions: [], actionItems: [],
  // Defaults for credit allocation — owner can override in Settings
  creditPoints: DEFAULT_CREDIT_POINTS,
  creditYear: new Date().getFullYear(),
  projectLeadShare: 10,
  contributorRegistry: DEFAULT_DEPARTMENTS.map((name) => ({ name })),
};
```

## Manual "Seed defaults" button

In ProjectSettingsModal, in the Add row of Contributor registry:

```jsx
<div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
  <Input value={newContribName} onChange={setNewContribName} placeholder="..." style={{ flex: 1 }} />
  <Btn size="sm" variant="primary" onClick={addContributorToRegistry} disabled={!newContribName.trim()}>
    <Plus size={11} /> Add
  </Btn>
  <Btn size="sm" onClick={seedDefaultDepartments} title={`Add common company departments: ${DEFAULT_DEPARTMENTS.join(', ')}`}>
    ✨ Seed defaults
  </Btn>
</div>
```

Handler:
```js
const seedDefaultDepartments = () => {
  const existing = new Set(contributorRegistry.map((r) => r.name.toLowerCase()));
  const toAdd = DEFAULT_DEPARTMENTS.filter((d) => !existing.has(d.toLowerCase()));
  if (toAdd.length === 0) {
    dialogs.alert({ title: 'Already seeded', message: 'All default departments are already in the registry.' });
    return;
  }
  setContributorRegistry([...contributorRegistry, ...toAdd.map((name) => ({ name }))]);
};
```

## Empty registry hint

Replace the bare "Empty registry" message with:
```jsx
<div style={{ fontSize: 12, color: TOK.subtle, padding: 12, textAlign: 'center', background: TOK.surface, borderRadius: 6, lineHeight: 1.6 }}>
  <div style={{ marginBottom: 4 }}>📋 Empty registry</div>
  <div>
    Click <strong>✨ Seed defaults</strong> above to add common departments<br />
    ({DEFAULT_DEPARTMENTS.join(', ')}), or type a custom name and click <strong>+ Add</strong>.
  </div>
</div>
```

## Project Lead dropdown — empty state hint

When `members.length === 0`:
- Disable dropdown with `opacity: 0.5`
- Below the dropdown, render warning:
```jsx
<div style={{ fontSize: 10, color: '#A8660C', marginTop: 3 }}>
  ⚠ Add team members below first, then return to pick project lead.
</div>
```

## Decision decidedBy / Contributor Clear — visibility threshold

Change `decidedBy.length > 1` to `decidedBy.length >= 1`. Same for ContributorEditor's clear button. (Already specified above in v28 — just confirm threshold is `>= 1`.)

## PicEditor — revert: teamMembers ONLY

PIC must be a person with email login (for notifications). Do NOT include `contributorRegistry` in PIC suggestions.

```js
const combinedList = useMemo(() => {
  const seen = new Set();
  const out = [];
  for (const m of (Array.isArray(teamMembersList) ? teamMembersList : [])) {
    if (!seen.has(m.name)) {
      seen.add(m.name);
      out.push({ name: m.name, email: m.email, kind: 'member' });
    }
  }
  return out;
}, [teamMembersList]);
```

Update warning text on unknown PIC: "⚠ Not a team member" (was "⚠ Not registered").
Update placeholder: "Click to select PIC from team members…"

## ActionItemForm — PIC select (also teamMembers-only)

```jsx
<select value={pic} onChange={(e) => setPic(e.target.value)} ...>
  <option value="">— Select PIC —</option>
  {teamMembers.map((m) => <option key={m.name} value={m.name}>{m.name}{m.email ? ` (${m.email})` : ''}</option>)}
  {/* If current pic is legacy (not in teamMembers), still show as option */}
  {pic && !teamMembers.some((m) => m.name === pic) && (
    <optgroup label="⚠ Legacy (not in team)">
      <option value={pic}>{pic} (no email registered — please re-select)</option>
    </optgroup>
  )}
</select>
```

Field label: `PIC / Assignee * (team member with email)`

## Excel import — post-import validation alert

In `handleFileImport`, after `parseExcelFile` succeeds, before saving:

```js
const registryNames = new Set((imported.contributorRegistry || []).map((r) => r.name.toLowerCase()));
const memberNames = new Set((imported.teamMembers || []).map((m) => m.name.toLowerCase()));
const unknownContributors = new Map();  // name → count
const unknownPics = new Map();
for (const pg of (imported.programs || [])) {
  for (const ws of (pg.workstreams || [])) {
    for (const t of (ws.tasks || [])) {
      for (const c of (t.contributors || [])) {
        if (!registryNames.has(c.toLowerCase()) && !memberNames.has(c.toLowerCase())) {
          unknownContributors.set(c, (unknownContributors.get(c) || 0) + 1);
        }
      }
      if (t.pic && !memberNames.has(t.pic.toLowerCase())) {
        unknownPics.set(t.pic, (unknownPics.get(t.pic) || 0) + 1);
      }
    }
  }
}
```

After save + state updates, if either map is non-empty, show alert:

```js
if (unknownContributors.size > 0 || unknownPics.size > 0) {
  const lines = [];
  if (unknownPics.size > 0) {
    lines.push(`PICs not in team members (${unknownPics.size} unique):`);
    for (const [n, c] of Array.from(unknownPics.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      lines.push(`  • ${n} — ${c} task${c === 1 ? '' : 's'}`);
    }
    if (unknownPics.size > 8) lines.push(`  ... and ${unknownPics.size - 8} more`);
    lines.push('');
  }
  if (unknownContributors.size > 0) {
    lines.push(`Contributors not in registry (${unknownContributors.size} unique):`);
    for (const [n, c] of Array.from(unknownContributors.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      lines.push(`  • ${n} — ${c} task${c === 1 ? '' : 's'}`);
    }
    if (unknownContributors.size > 8) lines.push(`  ... and ${unknownContributors.size - 8} more`);
    lines.push('');
  }
  lines.push('→ Open Project Settings to add these to team members / contributor registry, or use the Cleanup tool to merge with existing entries.');
  await dialogs.alert({
    title: '⚠ Import warnings — unrecognized names',
    message: lines.join('\n'),
  });
}
```

---

# Test scenarios

These are the canonical tests to run after applying all features.

## As workspace owner

1. **Project Settings → Credit allocation**
   - Set creditPoints=100, year=2026 → save
   - Re-open → values persist
   - Click ✨ Seed defaults → 8 departments appear
   - Click ✨ Seed defaults again → "Already seeded" alert
2. **Add team members with emails** → Project Lead dropdown becomes selectable
3. **Outline view**
   - Banner shows "🔓 Credit pool: 100 cp · Year 2026"
   - Click ⚖ on a program → input → enter 30 → green badge `⚖ 30%`
   - Click ⚖ on a task → input weight → see cp value update live
4. **Task edit**
   - Set Primary PIC = "hattt4" from dropdown
   - Add contributor "Legal" → credit shares auto-fills `{hattt4: 70, Legal: 30}` with `⚙ Auto` badge
   - Add 3rd contributor → mode flips to manual, badge becomes `✎ Manual override`
   - Click "Reset to default rule" → flips back to auto with default for current count
5. **Mark task Completed** → Credit Projection panel turns green with `✓ Earned`
6. **Activity Dashboard**
   - See "Credits (cp)" column with "earned / projected" values
   - Sort by Composite, by Name, etc.
7. **Credit Report tab**
   - Year selector switches data
   - Click PIC row → drill-down expands
   - Drill-down shows Project Lead 👑 separately
   - Click "📥 Export Excel" → 3-sheet workbook downloads
8. **Lock weights** → all ⚖ badges become non-editable, dashed border
9. **Unlock** → confirmation dialog → lock history entry added

## As non-owner

1. **Edit task**
   - End date is read-only with 🔒 + "Request change" button
   - Hard/Soft toggle disabled with note
2. **Submit deadline change request** → banner appears with `⏳ pending` status
3. **Activity Dashboard**
   - Sort dropdown disabled, 🔒 hint visible
   - PIC scoreboard table still visible
4. **Cannot see** Portfolio or Credits tabs in nav

## As 3rd party (not requester, not owner)

1. **Open task with pending request** → banner visible, no action buttons (only read-only note)

## Legacy data import

1. **Import Excel** with PICs like "AF", "Legal" and unregistered contributors
2. **Post-import alert** lists unknown PICs and contributors, sorted by count
3. **Open task** → PIC chip shows ⚠ "Not a team member"
4. **Click ✕** → PIC cleared
5. **Click chip** → dropdown → select from teamMembers list
6. **Save** → credit shares auto-recompute

## Cleanup tool

1. **Project Settings → Contributor registry → ⚠ Unregistered section**
2. **Click "Adopt"** on "AF" → AF added to registry, removed from unregistered list
3. **Click "Merge…"** on "Accounting Team" → form opens
4. **Select target "AF"** → click Merge → confirm → alert "Replaced 'Accounting Team' with 'AF' in N task occurrences"
5. **Click "Remove"** on a typo name → confirm → removed from all tasks

---

# Files to read for reference

- **Reference impl** (v29 source of truth): `CRP_Project_Tracker.jsx` (10,454 lines)
- **Previous spec** (already applied): `TODAYS_FEATURES_SPEC.md` (covers v15-v20)
- **This spec**: `FEATURES_SPEC_v21_to_v29.md`
- **Quick reference**: `QUICK_REFERENCE.md`

---

# Dependencies between features

```
v21 (Combo 1)
  ↓
v22 (Credit Phase 1) ──┐
  ↓                    │
v23 (Phase 1.5) ───────┤
  ↓                    │
v24 (Phase 2) ─────────┤
  ↓                    │
v25 (Phase 3) ─────────┘
  ↓
v26 (PicEditor + Registry) ── needed for ──→ v28 (Decision decidedBy)
  ↓                                                  ↓
v27 (Deadline approval + Activity restrict)    v29 (final adjustments)
  ↓
[Test + ship]
```

Apply in this order. Don't skip ahead — v29 references constants/components from earlier versions.

# Critical pitfalls (learned the hard way)

1. **Hooks before return** — `if (!isOwner) return ...` causes "Rendered fewer hooks than expected" if placed before useState/useMemo. Always declare hooks first, then gate.

2. **str_replace fragility** — when editing the file, blocks of similar JSX (especially Modal markup, button styles) appear multiple times. If your edit context isn't unique, the replace fails. Add 3-5 lines of unique surrounding context.

3. **`computeProjectCredits` perf** — called on every render in TaskDetail's Credit Projection panel. For 188 tasks it's fine (< 5ms), but don't add async ops inside.

4. **Project state during merge/cleanup** — when `performMerge` calls `onSave(updatedProject)`, you must include all current modal state (members, creditPoints, etc.) in the payload, otherwise unsaved modal edits are lost.

5. **PIC field schema is `string`** — not email, not object. Free-text is allowed for legacy. Don't try to migrate to email canonical without explicit user direction.

6. **`task.creditSharesMode` defaults to 'auto'** — but old tasks don't have this field. Always read with fallback: `task.creditSharesMode || 'auto'`.

7. **`getEffectiveCreditShares` returns normalized object** — always sums to 100 (or 0 if no PIC). Never divide by sum a second time downstream.

8. **`computeProjectCredits` returns rich object** — `{ totalCp, leadCp, leadName, leadSharePct, programPoolCp, perPic, breakdown }`. The `breakdown` array includes Project Lead pseudo-entries (`isProjectLead: true`) — filter them out when computing per-program/workstream sums.

9. **Year filter** — `computeWorkspaceCredits(projects, year)` only filters projects WITH a `creditYear` set. Projects without the field are always included. Document this in tooltip.

10. **DEFAULT_DEPARTMENTS auto-seed is idempotent** — both at project-creation time AND when manually clicking "Seed defaults". Existing entries are not duplicated.
