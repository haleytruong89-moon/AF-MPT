# FEATURES_SPEC_v30_raid.md
# v30 — RAID Register (Risk · Assumption · Issue · Dependency)

## Overview

Add a full RAID register to the existing v29 CRP Project Tracker.
RAID items live at **program level** (not task level), each with its own mitigation actions,
comment threads, trend history, and an approval workflow.

### Key reference files (read before starting)
| File | Purpose |
|------|---------|
| `src/CRP_Project_Tracker_v29_reference.jsx` | Source of truth — existing production code |
| `CRPRaid.jsx` | **Approved prototype** — target UX, all interactions working |

Read both before writing any code. When spec is ambiguous, `CRPRaid.jsx` wins.

---

## What is NOT changing

- All existing views (Outline, Gantt, Mind map, Dashboard, Activity, Credits, Briefing)
- Task schema (name, pic, contributors, end, deadlineType, status, checkIns, updates…)
- Credit / weight / decision logic
- The existing "Actions" tab inside task detail (that is covered by a separate spec)

---

## 1. Data model — new fields

### 1a. Program — add `raid[]`

```js
// Add to program schema:
program.raid = [RAIDItem]   // default: []
```

### 1b. RAIDItem schema

```js
{
  id: String,
  type: "Risk" | "Assumption" | "Issue" | "Dependency",

  // Common fields
  title: String,                  // what the RAID item is
  owner: String,                  // person accountable (pic name or dept)
  status: "Draft"                 // only creator can see
        | "PendingApproval"       // submitted, owner must approve
        | "Active"                // visible to full team
        | "Mitigating"            // Risk: actions in progress
        | "Resolved"              // Issue: resolved
        | "Accepted"              // Risk: accepted without mitigation
        | "Closed",               // fully closed
  createdBy: String,
  createdAt: ISOString,
  approvedBy: String | null,
  approvedAt: ISOString | null,

  // Trend tracking (Risk + Issue only, optional on others)
  trend: "improving" | "stable" | "escalating",   // default: "stable"
  lastReviewedAt: ISOString,      // timestamp of most recent review note

  // History log
  history: [
    {
      id: String,
      ts: ISOString,
      author: String,
      note: String,               // free text review note
      trend: "improving" | "stable" | "escalating"
    }
  ],

  // Mitigation / resolution actions (own list, not linked to task actions)
  mitigationActions: [
    {
      id: String,
      name: String,
      pic: String,
      due: String | null,         // ISO date
      status: "Open" | "Done" | "Blocked",
      comments: [
        { id, author, text, ts }  // same shape as task update comments
      ]
    }
  ],

  // ── Type-specific fields ──

  // Risk only
  likelihood: "High" | "Medium" | "Low",
  impact: "High" | "Medium" | "Low",
  // riskLevel is COMPUTED, never stored:
  //   riskLevel = MATRIX[likelihood][impact]
  //   Critical = High×High, High×High/Med, Medium×High,
  //   Medium = Medium×Medium, Low×High, High×Low
  //   Low = everything else
  mitigationPlan: String | null,  // text summary
  escalateToBoD: Boolean,         // auto-set: impact === "High", can be overridden

  // Assumption only
  validationDeadline: String | null,
  validationOwner: String | null,
  validated: Boolean,             // default: false

  // Issue only
  severity: "High" | "Medium" | "Low",
  raisedAt: ISOString,

  // Dependency only
  dependsOn: String | null,       // description of what it depends on
  blockedUntil: String | null,    // ISO date
}
```

### 1c. Migration for existing data

```js
// In loadProject() and parseExcelFile(), for each program:
program.raid = program.raid ?? []
```

No further migration needed — `raid` is opt-in.

### 1d. Computed values (never stored)

```js
// Risk level matrix
const RISK_MATRIX = {
  "High:High":    "Critical",
  "High:Medium":  "High",
  "High:Low":     "High",
  "Medium:High":  "High",
  "Medium:Medium":"Medium",
  "Medium:Low":   "Low",
  "Low:High":     "Medium",
  "Low:Medium":   "Low",
  "Low:Low":      "Low",
}
const riskLevel = (likelihood, impact) =>
  RISK_MATRIX[`${likelihood}:${impact}`] ?? "Medium"

// Days since last review (for "Needs review" badge)
const daysSinceReview = (item) =>
  Math.floor((Date.now() - new Date(item.lastReviewedAt ?? item.createdAt)) / 86400000)
```

---

## 2. New component: RAID Register view

New top-level view, accessible via a new tab in the main navigation bar labelled **"RAID"**.

### Layout: two-panel

```
┌─────────────┬──────────────────────────────────────────────────┐
│  Program    │  [Program name] — RAID Register                  │
│  sidebar    │  [badges: pending, BoD, escalating, stale]       │
│  (170px)    │                                                  │
│             │  [type filter tabs]  [status filter]  [+ Add]    │
│  LLCs  ●   │                                                  │
│  NSC   ⏰   │  <RAIDCard> × N                                  │
│  SPVs       │                                                  │
│  FINTECH    │                                                  │
│  BOD        │                                                  │
└─────────────┴──────────────────────────────────────────────────┘
```

**Sidebar program list**: each program row shows:
- Risk level dot (highest active risk level, colored)
- `⏳` badge if any items `PendingApproval`
- `⏰` badge if any active items not reviewed in >7 days

**Filters** (above item list):
- Type tabs: `All | ⚠ Risk (N) | 💡 Assumption (N) | 🔥 Issue (N) | 🔗 Dependency (N)`
- Status toggle: `Active | Closed | All`

**Summary strip** (below program title, above filters):
Shows counts of active items: `2 High · 1 Critical · 🔥 1 open · 💡 2 unvalidated · ⏰ 1 needs review`

### RAIDCard component

**Collapsed state:**
```
[icon] Title text                    [level?] [type] [status] [trend] [owner] [N open actions] ▼
```
- `⚠ BRA rejects dissolution filing   [High] [Risk] [Active] [🔴 Escalating]   @hattt4   2 open  ▼`
- `⏰ Needs review` badge if `daysSinceReview > 7`
- `⬆ BoD` badge if `escalateToBoD === true`

**Expanded state** (see `CRPRaid.jsx` for exact layout):
1. Approval banner (if `PendingApproval` and viewer is owner)
2. Type-specific metadata block (matrix / validation deadline / severity / dependency info)
3. **Trend & Review History** section (see section 2a below)
4. **Mitigation actions** list with add form
5. Status transition buttons

### 2a. Trend & Review History (key new feature)

This section lives inside the expanded RAIDCard. Reference: `TrendHistory` component in `CRPRaid.jsx`.

```
REVIEW HISTORY                              Last reviewed: 2d ago

[latest entry]
  🟢  hattt4 · May 6     "Trangvk confirmed notarised copy ready. On track."

[Show all (3)]   ← click to expand older entries

[+ Add review note]   ← expands inline form:
  [🟢 Improving]  [🟡 Stable]  [🔴 Escalating]   ← toggle buttons
  [textarea: What's the current status?]
  [Save review]  [Cancel]
```

When "Save review" is clicked:
```js
onUpdate({
  ...item,
  trend: selectedTrend,
  lastReviewedAt: new Date().toISOString(),
  history: [...item.history, {
    id: uid(),
    ts: new Date().toISOString(),
    author: currentUser,
    note: noteText,
    trend: selectedTrend,
  }]
})
```

### 2b. Add RAID item form

Full form with type selector (4 tabs), type-specific fields, matrix click-selector for Risk.
See `AddRAIDForm` in `CRPRaid.jsx`.

On save: item is created with `status: "PendingApproval"` and an initial history entry.

### 2c. Approval workflow

- `status: "Draft"` → visible only to `item.createdBy`
- `status: "PendingApproval"` → visible to creator + workspace owner
- Workspace owner sees approval banner in expanded card: **✓ Approve** / **✕ Reject**
- Reject → returns to `"Draft"` with optional rejection note
- Approve → `status: "Active"`, `approvedBy = currentUser`, `approvedAt = now`

Same permission pattern as `deadlineRequest` approval in v29. Owner-only.

### 2d. Mitigation action add form (inline, inside RAIDCard)

```
+ Add action   ← button at bottom of actions list

Expands to:
[What needs to be done? ________________________]
[Owner ▾]  [Due date __________]
[Add action]  [Cancel]
```

Each mitigation action renders as `MitigationActionRow` — same pattern as action items
in v29 task detail: expandable, comment thread, ✓ Done button for the assignee.

---

## 3. Task Detail panel — program risk signal

In the task detail panel (the side panel opened when clicking a task in any view),
add a new collapsible section **below** the existing Updates/Actions/Info tabs.

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠ 4 active RAID items in LLCs              View all →     │
│─────────────────────────────────────────────────────────────│
│  🔴 Escalating:  "BRA backlog delays acknowledgment…"       │
│  ●  High · BRA rejects dissolution filing    🟡             │
│  ●  High · BRA processing backlog            🔴             │
│  🔥  HIO bank account closure delayed                       │
│  +1 more risks → View all                                   │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**
- Find the program the task belongs to via `task.programId` (or walk programs to find task)
- Filter `program.raid` for `status === "Active" || status === "Mitigating"`
- Show top 3 risks + issue count, truncate title at 60 chars
- "View all →" button navigates to RAID Register with that program pre-selected

**Collapsible**: collapsed by default if 0 active RAID items for the program, expanded if > 0.

**No edit capability here** — this is read-only. Click through to RAID Register to act.

---

## 4. My Work view — RAID section

Add a new section **"RAID items needing my attention"** in the My Work view.
Position: after "Needs attention now" section, before tasks.

Reference: `MyWorkView` in `CRPRaid.jsx`.

### Section: "RAID items needing my attention"

Contains 4 sub-groups (only shown if non-empty):

```
⏳ Pending your approval (N)          ← owner-only, items where status=PendingApproval
🔴 Escalating risks I own (N)         ← items where owner===me AND trend=escalating
⚠  Overdue mitigation actions (N)    ← mitigationActions where pic===me AND isOverdue
⏰ Risks not reviewed in >7 days (N) ← items where owner===me AND daysSinceReview>7
```

Each sub-group shows mini cards: icon + truncated title + program name + level badge + trend icon + click → navigate to RAID Register.

### Section: "Mitigation actions due this week"

Below the attention section. Shows actions across all RAID items where `action.pic === currentUser`
and `action.due <= today + 7 days` and `action.status !== "Done"`.

Format: same as action items in My Work — show action name, parent RAID item title, program, due date, ✓ Done button.

### Section: "All RAID items I own"

Collapsed by default. Shows all active RAID items where `item.owner === currentUser`.
Mini card format: click navigates to RAID Register at that program.

---

## 5. Portfolio view — RAID rollup

Add RAID summary to the existing Portfolio view. If Portfolio view doesn't have it,
add a "RAID Risk Summary" section.

Per-program card shows:
- Risk level counts: `2 High · 1 Critical`
- `🔴 N escalating` if any
- `⏰ N stale` if any not reviewed in >7 days
- `🔥 N` open issues, `🔗 N` blocked dependencies

Plus a **"BoD Escalation" box** at the top listing all `escalateToBoD === true` risks
with `status === "Active" || "Mitigating"`, sorted by risk level descending.

See `PortfolioView` in `CRPRaid.jsx` for exact layout.

---

## 6. Navigation — new RAID tab

Add **"RAID"** to the main tab bar alongside Outline, Gantt, Mind map, Dashboard, etc.

Tab label: `RAID` (no badge by default, add badge count for pending approvals if owner):
```js
// Badge logic for RAID tab:
const raidBadge = isOwner
  ? programs.reduce((s, p) => s + (p.raid ?? []).filter(r => r.status === "PendingApproval").length, 0)
  : 0
```

Tab position: after "Aggregation", before "Portfolio" (or at end of left group).

---

## 7. Implementation order

```
Phase 1 — Schema only (no UI)
  1. Add raid: [] default to program schema in createNewProject() and parseExcelFile()
  2. Add riskLevel() computed helper function (pure, no side effects)
  3. Add daysSinceReview() helper
  4. saveProject() already handles dynamic keys — no change needed
  5. Verify existing data loads without errors

Phase 2 — Core RAID Register (no integrations yet)
  6. RAIDCard component (collapsed + expanded)
  7. TrendHistory component
  8. MitigationActionRow component (reuse pattern from existing UpdateEntry)
  9. AddRAIDForm component
  10. RAIDProgramView (sidebar + filters + list)
  11. Wire "RAID" tab in main nav → RAIDProgramView
  12. Parse check. Manual test: add a Risk, approve it, add review note, add mitigation action.

Phase 3 — Task Detail connection
  13. Identify which program a task belongs to (use task.programId if present, else walk programs)
  14. Add "Program RAID signal" collapsible block to task detail panel
  15. "View all →" link: set active RAID tab + pre-select program

Phase 4 — My Work
  16. Add "RAID items needing my attention" section
  17. Add "Mitigation actions due this week" section
  18. Add "All RAID items I own" section

Phase 5 — Portfolio
  19. Add RAID rollup to Portfolio view
  20. End-to-end test all paths
```

---

## 8. Test scenarios (walk through with Claude Code after each phase)

### Phase 2 — RAID Register
1. Open RAID tab → see LLCs program with 5 items (2 Risk, 1 Assumption, 1 Issue, 1 Dependency)
2. Click ⚠ Risk type filter → see only risks
3. Expand "BRA rejects dissolution" → see risk matrix, mitigation plan, trend history
4. Click "Show all" in history → see 3 entries with 🟢🟡 icons
5. Add review note with "🔴 Escalating" trend → card immediately shows 🔴 badge
6. Add mitigation action → appears in list, owner can ✓ Done
7. Switch to NSC program → see "r2 BRA backlog" in PendingApproval state
8. As owner: expand it → see approval banner → Approve → status becomes Active

### Phase 3 — Task Detail
9. Open task "Submit dissolution resolution to BRA" (in Outline or Mind map)
10. Scroll task detail → see "4 active RAID items in LLCs" block
11. See 🔴 escalating warning for BRA backlog risk
12. Click "View all →" → navigates to RAID Register, LLCs program selected

### Phase 4 — My Work
13. Open My Work → see "RAID items needing my attention" section
14. See 1 pending approval (BRA backlog — owner view)
15. See 1 escalating risk (FX rate — hattt4 owns it)
16. See "Mitigation actions due this week" with ma2, ma9 etc.
17. ✓ Done on a mitigation action → disappears from My Work

### Phase 5 — Portfolio
18. Portfolio → RAID section shows per-program heatmap
19. BoD escalation box lists 4 high-impact risks
20. SPVs shows "🔴 0 escalating" (after improvement)

---

## 9. Things to be careful of

1. **riskLevel is always computed, never stored.** Never save it to project data.
   Recalculate from `likelihood × impact` on every render.

2. **Visibility rules for Draft/PendingApproval:**
   - `Draft` → only `item.createdBy === author` can see
   - `PendingApproval` → creator + workspace owner only
   - `Active` and beyond → all team members

3. **`escalateToBoD` is auto-set but manually overridable.**
   Default: `impact === "High"`. Owner can manually override to `true` or `false` via a checkbox
   in the form. Do not re-compute it on every save (would override manual changes).

4. **Mitigation actions are NOT the same as task action items.**
   They live inside `raidItem.mitigationActions[]`, not in `task.actions[]`.
   They share the same comment structure but are separate data.

5. **`lastReviewedAt` updates ONLY when user explicitly saves a review note.**
   Do NOT update it when status changes or when a mitigation action is marked done.

6. **History entries are append-only.** Never delete or edit existing history entries.
   Only add new ones via "Add review note" action.

7. **The "Needs review" badge threshold is 7 days** (`daysSinceReview > 7`).
   Only applies to items with `status === "Active" || "Mitigating"`.
   Draft/Pending/Closed items do not show this badge.

8. **RAID tab badge shows pending count for owner only.**
   Non-owners see no badge on the RAID tab.

9. **In task detail, identify the program** by walking `project.programs` to find which
   program contains `task.id`. Use this to pull `program.raid`.
   If `task.programId` already exists in your schema, use that directly.

10. **Excel export:** if existing export includes a "Programs" sheet, add a "RAID" sheet
    with columns: Program, Type, Title, Level, Status, Trend, Owner, Last Reviewed,
    Open Actions. One row per RAID item.

---

## Initial prompt for Claude Code session

```
I need to implement a RAID Register feature (v30) on top of the existing v29 CRP Project Tracker.

Read these files in order:
1. src/CRP_Project_Tracker_v29_reference.jsx — current production codebase (source of truth)
2. specs/FEATURES_SPEC_v30_raid.md — this spec (what to build)
3. src/CRPRaid.jsx — approved interactive prototype (target UX; use this when spec is ambiguous)

After reading all three, please:
1. Confirm you understand the RAID data model (4 types, trend history, mitigation actions)
2. Tell me where in the v29 codebase programs are defined and saved
3. Tell me where the task detail panel renders (which component, which line)
4. Tell me where My Work view is (which component, which line)
5. Outline your Phase 1→5 implementation plan from the spec

Do NOT start editing yet. Wait for my approval of the plan.
```
