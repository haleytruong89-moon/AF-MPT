# AF MTP — My Work + Team Overview — Feature Spec v30

**App:** AF MTP (AF Master Tracking Platform) — deployed at afmpt.smartosc.com
**Spec extension to `FEATURES_SPEC_v21_to_v29.md`**
**Build target:** New tab "My Work" (all users) + "Team Overview" tab (owner-only) + supporting infrastructure
**Effort:** ~12h in-app (4 phases). Phase 5 (notification backend) = separate session, ~6h.

This spec assumes v21-v29 are already applied. Don't apply this before v29 — it depends on `computeProjectCredits`, `task.contributors`, `task.creditShares`, `task.deadlineRequest`, `findMentions`, and `meta.workspaceOwner`.

**Note on naming:** "AF MTP" is the app/workspace name. "CRP" referenced in example mockups below is the user's primary project inside this app (Corporate Restructuring Program), not the app itself.

---

## Goal

The app is currently **PM-centric** (Outline / Mind map / Gantt) — great for the workspace owner planning the project, weak for individual PICs answering "what do I need to do today?". The data is all there (assignments, mentions, action items, decisions, credit) — this spec adds two views that make it actionable for end users.

Two new tabs:
- **My Work** — visible to all, each user sees only their own data, scoped cross-project
- **Team Overview** — owner-only, sees workload + impersonate per-member

Plus engagement infrastructure: default-view setting, badge counts, last-seen timestamp, notification preferences UI (delivery wiring deferred to backend phase).

---

## Cross-cutting design principles (additional to those in v21-v29)

1. **Privacy by data filter** — `computeMyWork(author, projects)` returns only data where `author` is PIC, contributor, decidedBy, or mentioned. No team-wide leak possible at the data layer.

2. **Smart-expand sections** — sections with content auto-expand, empty sections stay collapsed. Reduces friction on first view.

3. **Memoize aggregation** — `computeMyWork` recomputes only when `projects` or `author` change. Worst case: 188 tasks × 5 fields × ~10 ops = ~10ms.

4. **Owner override pattern** — when owner uses "View as <member>", impersonation is **full edit** with audit trail. Every action by the impersonating owner logs as `"hattt4 (acting as Trangvk): posted update on Setup HIO"`.

5. **Engagement preferences are per-user** — stored in `meta.userPreferences[email]`. Default view is **global** (workspace owner sets, all users follow), but individual users can override.

6. **Inline actions = expand-on-click pattern** — default row state shows only status pill; expanding reveals quick update textarea + secondary actions. Avoids button clutter for 12+ task lists.

---

## Schema additions

```js
// Workspace metadata
meta.defaultView: 'my-work' | 'outline' | 'mindmap' | 'gantt' | 'dashboard' | 'aggregation'
                  // Workspace-wide default landing page; set by owner
                  // Defaults to 'my-work' if not set

meta.userPreferences: {
  [email]: {
    lastSeenMyWorkAt: string,       // ISO timestamp, updated when user opens My Work
    defaultViewOverride: string | null,  // user's personal override of meta.defaultView
    pushEnabled: boolean,           // for future Phase 5 wiring
    emailDigestEnabled: boolean,    // for future Phase 5 wiring
  }
}

// No task/decision/action schema changes — pure aggregation layer over existing data
```

**Backward compatibility:** missing fields → defaults applied via fallback reads. No migration needed.

---

# Phase 1 — Core My Work view (~4h)

## Helper: `computeMyWork(author, projects)`

Aggregates all data relevant to `author` across all projects.

**Returns:**
```js
{
  needsAttention: Array<NeedsAttentionItem>,  // overdue + pending approvals (for owner)
  unreadMentions: Array<MentionItem>,         // newer than lastSeenMyWorkAt
  allMentions: Array<MentionItem>,            // last 14 days, for full view
  tasksOwned: {
    today: Task[],      // pic === author, due today OR overdue
    week: Task[],       // pic === author, due in next 7 days (excl today)
    later: Task[],      // pic === author, due > 7 days OR no due date
  },
  tasksContributing: Array<{ task, primaryPic }>,  // contributors.includes(author)
  actionItems: {
    today: ActionItem[],
    week: ActionItem[],
    later: ActionItem[],
  },
  decisions: Array<{ decision, project }>,    // decidedBy.includes(author), status pending or no follow-up
  credit: {
    earned: number,
    projected: number,
    pct: number,        // earned / projected
    perProject: Array<{ project, earned, projected }>,
  },
  pendingApprovals: Array<{ task, request, project }>,  // only if isOwner
}
```

**Implementation outline:**
```js
function computeMyWork(author, projects, isOwner, lastSeenAt) {
  const now = new Date();
  const todayEnd = endOfDay(now);
  const weekEnd = addDays(todayEnd, 7);
  const lastSeen = lastSeenAt ? new Date(lastSeenAt) : new Date(0);

  const out = {
    needsAttention: [],
    unreadMentions: [],
    allMentions: [],
    tasksOwned: { today: [], week: [], later: [] },
    tasksContributing: [],
    actionItems: { today: [], week: [], later: [] },
    decisions: [],
    credit: { earned: 0, projected: 0, pct: 0, perProject: [] },
    pendingApprovals: [],
  };

  for (const proj of Object.values(projects || {})) {
    for (const pg of (proj.programs || [])) {
      for (const ws of (pg.workstreams || [])) {
        for (const t of (ws.tasks || [])) {
          if (t.status === 'Dropped') continue;
          const enriched = { task: t, project: proj, program: pg, workstream: ws };

          // Tasks I own
          if (t.pic === author) {
            const overdue = isOverdue(t);
            const dueToday = t.end && parseDate(t.end) <= todayEnd && !overdue;
            const dueWeek = t.end && parseDate(t.end) <= weekEnd && !overdue && !dueToday;
            if (overdue) {
              out.needsAttention.push({ kind: 'overdue_task', ...enriched });
              out.tasksOwned.today.push(enriched);
            } else if (dueToday) {
              out.tasksOwned.today.push(enriched);
            } else if (dueWeek) {
              out.tasksOwned.week.push(enriched);
            } else {
              out.tasksOwned.later.push(enriched);
            }
          }

          // Tasks I contribute to
          if (Array.isArray(t.contributors) && t.contributors.includes(author) && t.pic !== author) {
            out.tasksContributing.push({ ...enriched, primaryPic: t.pic });
          }

          // Mentions in task updates
          for (const upd of (t.updates || [])) {
            const text = upd.text || '';
            const mentioned = (text.match(/@(\S+)/g) || [])
              .map((m) => m.slice(1))
              .includes(author);
            if (mentioned) {
              const item = {
                ts: upd.timestamp, author: upd.author, text, task: t,
                project: proj, program: pg, workstream: ws,
              };
              out.allMentions.push(item);
              if (new Date(upd.timestamp) > lastSeen) out.unreadMentions.push(item);
            }
          }

          // Pending deadline approvals (only owner)
          if (isOwner && t.deadlineRequest) {
            out.pendingApprovals.push({ task: t, request: t.deadlineRequest, project: proj });
            out.needsAttention.push({ kind: 'deadline_approval', task: t, request: t.deadlineRequest, project: proj });
          }
        }
      }
    }

    // Action items assigned to me
    for (const a of (proj.actionItems || [])) {
      if (a.pic !== author) continue;
      if (a.status === 'Done' || a.status === 'Dropped') continue;
      const dueDate = a.due ? parseDate(a.due) : null;
      const enriched = { action: a, project: proj };
      if (!dueDate) {
        out.actionItems.later.push(enriched);
      } else if (dueDate <= todayEnd) {
        out.actionItems.today.push(enriched);
        if (dueDate < now) out.needsAttention.push({ kind: 'overdue_action', ...enriched });
      } else if (dueDate <= weekEnd) {
        out.actionItems.week.push(enriched);
      } else {
        out.actionItems.later.push(enriched);
      }
    }

    // Decisions where I'm a decision-maker
    for (const d of (proj.decisions || [])) {
      if (!Array.isArray(d.decidedBy) || !d.decidedBy.includes(author)) continue;
      if (d.followUp && d.followUp.status === 'completed') continue;
      out.decisions.push({ decision: d, project: proj });
    }

    // Credit aggregation
    const credits = computeProjectCredits(proj);
    const myCredit = credits.perPic.get(author);
    if (myCredit && (myCredit.earned > 0 || myCredit.projected > 0)) {
      out.credit.earned += myCredit.earned;
      out.credit.projected += myCredit.projected;
      out.credit.perProject.push({
        project: proj,
        earned: myCredit.earned,
        projected: myCredit.projected,
      });
    }
  }

  out.credit.pct = out.credit.projected > 0
    ? (out.credit.earned / out.credit.projected) * 100
    : 0;

  // Sort sections by urgency
  out.tasksOwned.today.sort((a, b) => (parseDate(a.task.end) || 0) - (parseDate(b.task.end) || 0));
  out.tasksOwned.week.sort((a, b) => (parseDate(a.task.end) || 0) - (parseDate(b.task.end) || 0));
  out.allMentions.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  out.unreadMentions.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  return out;
}
```

**Performance:** memoize with `useMemo([projects, author, isOwner, lastSeenAt])`. Don't pull `Date.now()` into deps — recompute per render is fine since `<10ms` for typical data.

## Component: `MyWorkView`

**Props:**
```js
{
  projects: { [id]: Project },
  author: string,                  // user email
  isOwner: boolean,
  userPrefs: object,               // meta.userPreferences[author] || {}
  onTaskClick: (taskId, projectId) => void,
  onTaskUpdate: (updatedTask, projectId) => void,
  onActionUpdate: (updatedAction, projectId) => void,
  onApproveDeadline: (taskId, projectId) => void,
  onRejectDeadline: (taskId, projectId) => void,
  onMarkSeen: () => void,          // updates meta.userPreferences[author].lastSeenMyWorkAt
  dialogs: object,
  showToast: (msg) => void,
}
```

**Mount behavior:**
```js
useEffect(() => {
  // Mark mentions as seen 5s after view mount (gives user time to see badges)
  const t = setTimeout(() => onMarkSeen(), 5000);
  return () => clearTimeout(t);
}, []);
```

## Layout (top to bottom, smart-expand)

### Header
```
┌────────────────────────────────────────────────────────────────────┐
│ My Work                                                            │
│ hattt4@smartosc.com · Today: Friday, 8 May 2026                    │
└────────────────────────────────────────────────────────────────────┘
```

### Section: 🔴 Needs attention now

**Auto-expand if** `needsAttention.length > 0`.

Items shown:
- Overdue tasks (kind: 'overdue_task')
- Overdue action items (kind: 'overdue_action')
- Pending deadline approvals (only if isOwner, kind: 'deadline_approval')

Each item: 1-line summary + 1-2 action buttons.

```
🔴 Needs attention now (3)                                  [collapse]
─────────────────────────────────────────────────────────────────────
⚠ Setup HIO bank account            CRP › LLCs › HIO     🔒 Hard
  was due 5 May · 3 days overdue
  [Update status ▼] [💬 Add update] [→ Open]

⚠ Send KYC docs to bank             CRP · action item
  was due yesterday
  [Mark done] [→ Open]

⏳ Approval pending: Trangvk wants +7 days on "Tax filing"
  Reason: "External auditor needs more time"
  [✓ Approve] [✕ Reject] [→ Open]
```

### Section: 💬 Mentions

**Auto-expand if** `unreadMentions.length > 0`. Show badge count.

```
💬 Mentions (2 unread, 5 total)                             [collapse]
─────────────────────────────────────────────────────────────────────
[UNREAD] Trangvk · 2h ago · in "Setup HIO bank account"
"@hattt4 can you review the dissolution paperwork before BoD?"
[→ Open task]

[UNREAD] An · yesterday · in "Vendor contract review"
"@hattt4 reminder, deadline is tomorrow"
[→ Open task]

[Show older mentions ▾]
```

### Section: 📋 Tasks I own as Primary PIC

**Auto-expand if** `tasksOwned.today.length > 0`.

Sub-tabs: `Today (N)` `This week (N)` `Later (N)`. Default: Today.

```
📋 Tasks I own (12)                          [Today (4) | Week (5) | Later (3)]
─────────────────────────────────────────────────────────────────────
Today
▢ Submit dissolution resolution        CRP › LLCs › HIO     🔒 Hard
   [In progress ▼]                                              ⌄
   
▢ Review legal docs from vendor        CRP › NSC            🎯 Soft
   [Planned ▼]                                                  ⌄
```

Each row: `<TaskRowInline>` component (see below).

### Section: 🤝 Tasks I contribute to

**Auto-expand if** `tasksContributing.length > 0`.

```
🤝 Tasks I contribute to (8)                                [collapse]
─────────────────────────────────────────────────────────────────────
Primary: AF · "Quarterly compliance report" (due 12 May)
   Status: In progress · I'm one of 2 contributors
   [💬 Add update] [→ Open]

Primary: Legal · "Contract review SPVs" (due 15 May)
   Status: Planned · I'm one of 1 contributor
   [💬 Add update] [→ Open]
```

### Section: ✅ Action items assigned to me

**Auto-expand if** `actionItems.today.length > 0`.

```
✅ Action items (5)                          [Today (2) | Week (2) | Later (1)]
─────────────────────────────────────────────────────────────────────
Today
▢ Send updated KYC docs to bank      Created 7 May in BoD meeting
   Priority: High
   [✓ Mark done] [→ Open]
```

### Section: 🤔 Decisions awaiting input

**Auto-expand if** `decisions.length > 0`.

```
🤔 Decisions awaiting your input (2)                        [collapse]
─────────────────────────────────────────────────────────────────────
"Approve vendor switch for SPVs"     CRP · decided by 3 people
   Status: pending · Expected review: 12 May
   [→ Review]

"Choose external auditor"             CRP · decided by 5 people
   Status: pending · Expected review: 15 May
   [→ Review]
```

### Section: 📊 My credit so far

**Always collapsed by default** (less urgent, more reference).

```
📊 My credit this year (2026)                                   [expand]
─────────────────────────────────────────────────────────────────────
Earned:    24.5 cp                                  ████████░░░░░░ 36%
Projected: 67.2 cp                                  (year still in progress)

By project:
  CRP        15.5 / 45.2 cp  (34%)
  Internal   9.0 / 22.0 cp  (41%)

[→ Open Credit Report for full breakdown]
```

If `credit.projected === 0`:
```
📊 My credit this year (2026)
No credit allocation set up for projects you're in.
```

### Empty state — when ALL sections empty

```
🌤 Nothing urgent today

You have no overdue tasks, no unread mentions, no pending action items,
and no decisions to review.

Quick stats:
  📋 5 tasks owned (due later)
  🤝 3 tasks contributing  
  📊 12.5 cp earned this year

[→ View Outline] [→ View Credit Report]
```

If user has NO assignments at all (new member):
```
🌱 No tasks assigned yet

Ask your workspace owner (hattt4) to assign you to a task or invite you
to a project. Once you're added as a PIC or contributor, your work will
appear here.
```

## Component: `TaskRowInline` (the C+D hybrid expand pattern)

**Props:**
```js
{
  task: Task,
  project: Project,
  context: { program, workstream },
  author: string,
  onStatusChange: (newStatus) => void,
  onAddUpdate: (text) => void,
  onRequestExtension: () => void,    // opens DeadlineRequestDialog
  onOpenDetails: () => void,         // navigates to task detail
}
```

**Default state (collapsed):**
```
▢ Setup HIO bank account   CRP › LLCs › HIO   🔒 Hard   [In progress ▼]   ⌄
```

- Click anywhere on row OR ⌄ button → expand
- Status pill is a quick-select dropdown — click → menu (Planned / In progress / Completed)
- Project breadcrumb is clickable → navigates to project + task

**Expanded state:**
```
▢ Setup HIO bank account   CRP › LLCs › HIO   🔒 Hard   [In progress ▼]   ⌃
   ┌──────────────────────────────────────────────────────────────────┐
   │ Quick update                                                     │
   │ [Type @ to mention. Posted as hattt4 on 8 May.                  ]│
   │ [                                                                ]│
   │ ☐ This is a blocker                                              │
   │ [Post update]                                                    │
   │                                                                  │
   │ Actions: [📅 Request extension] [→ Open full details]            │
   └──────────────────────────────────────────────────────────────────┘
```

- Quick update textarea is `<MentionsInput>` (reuse if exists, otherwise plain Textarea)
- "Post update" → calls `onAddUpdate(text)` → row collapses + toast "Update posted"
- "Request extension" → opens DeadlineRequestDialog (from v27)
- "Open full details" → calls `onOpenDetails()` → app navigates to TaskDetail

**Mobile UX:**
- Tap row → expand (whole row is tappable except status dropdown)
- Expanded state takes full width
- Buttons stack vertically below ~480px viewport

## Sub-component: `StatusQuickPill`

```jsx
<StatusQuickPill
  status={task.status || 'Planned'}
  health={task.health}
  onChange={(newStatus) => onStatusChange(newStatus)}
/>
```

Renders the status as a pill with `▼` indicator. Click → dropdown menu:
```
○ Planned        (current)
◐ In progress
✓ Completed
✕ Dropped         (with confirm dialog)
```

Status change → calls onStatusChange → bubbles up to App → updates task → activity log.

---

# Phase 2 — Inline actions wire-up (~3h)

## Quick status change

In `TaskRowInline`, the StatusQuickPill calls `onStatusChange(newStatus)`. This:
1. Updates `task.status` in the project
2. Logs `status_change` activity entry
3. Shows toast "Marked as <new status>"
4. If marking Completed → trigger credit projection update (already handled by computeProjectCredits memo)

## Inline check-in/update

`TaskRowInline` expanded state shows textarea + Post update button. On post:
```js
onAddUpdate(text) => {
  onUpdate({
    ...task,
    updates: [{
      id: uid('upd'),
      timestamp: new Date().toISOString(),
      author,
      text: text.trim(),
      isBlocker,
    }, ...(task.updates || [])],
  });
  showToast('Update posted');
  // Collapse row after successful post
};
```

If `text.length === 0` — button disabled. If `text.length > 0 && isBlocker` — append "🚨 Blocker:" prefix or use existing convention.

## Inline deadline extension request

Button "📅 Request extension" → opens existing `DeadlineRequestDialog` (from v27). On submit, request goes through standard flow.

If owner: extension is direct edit (skip request workflow) — show different button "📅 Change deadline" → opens date picker inline or use existing flow.

## Resolve action item

For action items in the action-items section:
```jsx
<Btn size="sm" onClick={() => onActionUpdate({ ...action, status: 'Done', completedAt: new Date().toISOString() }, projectId)}>
  ✓ Mark done
</Btn>
```

Activity log: `action_complete` entry.

## Owner approve/reject deadline request inline

For items in `needsAttention` with `kind: 'deadline_approval'`, render:
```jsx
<div>
  <Btn size="sm" variant="primary" onClick={() => onApproveDeadline(task.id, project.id)}>✓ Approve</Btn>
  <Btn size="sm" onClick={() => onRejectDeadline(task.id, project.id)}>✕ Reject</Btn>
</div>
```

These call the same logic as `approveDeadlineRequest` / `rejectDeadlineRequest` in TaskDetail. Pass through dialogs for confirmation.

---

# Phase 3 — Team Overview tab (owner-only, ~3h)

## New tab "Team Overview"

Add to navigation, after "Credits":
```js
...(meta?.workspaceOwner === author ? [{
  id: 'team-overview',
  label: 'Team',
  icon: <Users size={12} />,
  ownerOnly: true
}] : []),
```

(Import `Users` from lucide-react.)

## Component: `TeamOverviewView`

**Props:**
```js
{
  projects: { [id]: Project },
  author: string,                  // current user (owner)
  meta: object,                    // workspace meta with userPreferences
  isOwner: boolean,
  onImpersonate: (memberEmail) => void,
  onClearImpersonation: () => void,
  impersonatingAs: string | null,  // null when owner sees own view
}
```

**Owner gate after hooks** (Rules of Hooks):
```jsx
if (!isOwner) {
  return <div ...>Team overview is workspace-owner only.</div>;
}
```

## Layout

### Header
```
Team Overview [OWNER ONLY]                            [📥 Export Excel]
Workload, activity, and credit attribution for all team members.
```

### Summary cards (4 cards)

```
Active members      Total open tasks    Overdue across team    Pending approvals
   8                     127                  12                      3
```

### Per-member table (detailed rows)

Compute aggregation per team member:
```js
function computeTeamOverview(projects, members) {
  return members.map((m) => {
    const myWork = computeMyWork(m.name, projects, false, null);
    return {
      member: m,
      tasksOwned: countAll(myWork.tasksOwned),
      tasksOverdue: myWork.needsAttention.filter((x) => x.kind === 'overdue_task').length,
      actionItemsOpen: countAll(myWork.actionItems),
      tasksContributing: myWork.tasksContributing.length,
      credit: myWork.credit,
      lastActivity: getLastActivity(m.name, projects),  // walk updates/checkIns
      unreadMentions: 0,  // skip for owner view
    };
  });
}
```

**Render each row:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ hattt4@smartosc.com                              [View as →]         │
│                                                                      │
│ 📋 12 tasks owned   ⚠ 2 overdue   🤝 3 contributing   ✅ 5 actions │
│ 📊 Credit: 24.5 / 67.2 cp (36% earned)                              │
│ 🕐 Last activity: 2 hours ago — posted update on "Setup HIO"        │
└──────────────────────────────────────────────────────────────────────┘
```

Sort options (top of table): by Name | by Tasks | by Overdue | by Credit | by Last activity.

Empty member (no assignments):
```
┌──────────────────────────────────────────────────────────────────────┐
│ newmember@smartosc.com                           [View as →]         │
│                                                                      │
│ 🌱 No assignments yet                                                │
│ Add them as PIC or contributor on tasks to track their workload.    │
└──────────────────────────────────────────────────────────────────────┘
```

### Excel export

```js
const exportTeamOverview = () => {
  const wb = XLSX.utils.book_new();
  const rows = teamData.map((d) => ({
    'Member': d.member.name,
    'Email': d.member.email,
    'Tasks owned': d.tasksOwned,
    'Tasks overdue': d.tasksOverdue,
    'Contributing': d.tasksContributing,
    'Action items open': d.actionItemsOpen,
    'Credit earned (cp)': Math.round(d.credit.earned * 100) / 100,
    'Credit projected (cp)': Math.round(d.credit.projected * 100) / 100,
    'Credit % earned': Math.round(d.credit.pct * 10) / 10 + '%',
    'Last activity': d.lastActivity ? fmtDateTime(d.lastActivity.ts) : '—',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Team Overview');
  XLSX.writeFile(wb, `Team_Overview_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
```

## "View as <member>" impersonation flow

**Full edit mode** (per user's choice):
- Owner clicks `[View as →]` on a member row
- App sets state: `impersonatingAs = "trangvk@smartosc.com"`
- Navigation switches to My Work view
- Renders banner at top: `🎭 Viewing as Trangvk · Actions will log as "hattt4 (acting as Trangvk)"` + `[Exit impersonation]` button
- All actions (status change, post update, etc.) call existing handlers but with the `author` field set to the impersonated member
- Activity log entries automatically prefixed: `description: "hattt4 (acting as Trangvk): posted update on Setup HIO"`

**Critical implementation detail:**
Use a separate `effectiveAuthor` state derived from `impersonatingAs || author`. Pass `effectiveAuthor` to MyWorkView and to action handlers, but log activity with both names:

```js
const effectiveAuthor = impersonatingAs || author;

const handleTaskUpdate = (updatedTask, projectId) => {
  // Update task
  onUpdateTask(updatedTask, projectId);
  // Log with impersonation note if applicable
  const logAuthor = impersonatingAs
    ? `${author} (acting as ${impersonatingAs})`
    : author;
  logActivity({
    type: 'task_update_inline',
    description: `${logAuthor} updated "${updatedTask.name}"`,
  });
};
```

**UI for owner during impersonation:**
- Top of app: persistent banner (don't hide on scroll) with "🎭 Viewing as Trangvk"
- Tab navigation: only "My Work" tab visible while impersonating (other tabs hidden) — focused experience
- Exit button → `impersonatingAs = null` → returns to owner's normal view
- Auto-exit if owner navigates to another project or refreshes

---

# Phase 4 — Engagement features (~2h)

## Default view setting (workspace-wide)

Add to Project Settings modal OR a separate "Workspace Settings" modal accessible from the owner menu:

```
Default landing view (workspace-wide)
[My Work ▼]
   My Work
   Outline
   Mind map
   Gantt
   Activity Dashboard
   Aggregation
This is what users see when they first open the workspace.
Individual users can override in their personal preferences.
```

On save: `meta.defaultView = 'my-work'`.

On app load:
```js
const initialView = userPrefs?.defaultViewOverride || meta?.defaultView || 'outline';
const [view, setView] = useState(initialView);
```

## User preference: override default view

Add a small icon next to current view name in nav (only visible after first interaction):
```
Outline ⋆ (← set as my default)
```

Click → updates `meta.userPreferences[author].defaultViewOverride`. Persists per-user.

## Badge count on tab name

Compute `needsAttentionCount` at App level:
```js
const myWorkBadge = useMemo(() => {
  const w = computeMyWork(author, projects, isOwner, userPrefs?.lastSeenMyWorkAt);
  return w.needsAttention.length + w.unreadMentions.length;
}, [projects, author, isOwner, userPrefs]);
```

Render in tab:
```jsx
<TabButton id="my-work">
  My Work
  {myWorkBadge > 0 && (
    <span style={{ 
      marginLeft: 4, padding: '0 6px', borderRadius: 999,
      background: '#A32D2D', color: '#fff', fontSize: 10, fontWeight: 500 
    }}>
      {myWorkBadge}
    </span>
  )}
</TabButton>
```

## Last-seen timestamp

When user mounts MyWorkView, after 5 seconds, update:
```js
useEffect(() => {
  const t = setTimeout(() => {
    onMarkSeen();  // updates meta.userPreferences[author].lastSeenMyWorkAt
  }, 5000);
  return () => clearTimeout(t);
}, [author]);
```

5-second delay ensures user actually saw the mentions, not just navigated through.

## Notification preferences UI (delivery wiring deferred)

Add to Workspace Settings modal OR an icon `🔔` near user identity:

```
Notification preferences (your personal settings)

☐ Email digest at 8 AM with My Work summary
   [hattt4@smartosc.com] (from your team member registration)
   
☐ Browser notifications for new mentions
   [Request permission]
   
☐ Browser notifications for overdue tasks

Delivery: requires backend setup. Settings are saved now and will activate
when notifications are enabled by the workspace owner.
```

Save toggles to `meta.userPreferences[author].pushEnabled` and `.emailDigestEnabled`.

**No actual sending in Phase 4** — UI only. Wiring happens in Phase 5 (separate session).

---

# Phase 5 — Notification backend (separate session, ~6h)

**Out of scope for this spec.** Requires:
- Firebase Cloud Functions setup
- Scheduled function for daily email digest (8 AM in user's timezone)
- Web Push subscription endpoint
- SMTP configuration (SendGrid, SES, etc.)
- Service Worker for browser push

Don't build this in Phase 1-4. Mention it in handoff for future session.

---

# Test scenarios

## As regular team member (Trangvk)

1. Open app → land on My Work (because `meta.defaultView = 'my-work'`)
2. Header shows "Trangvk · Today: Friday, 8 May 2026"
3. 🔴 Needs attention shows 1 overdue task (auto-expanded)
4. 💬 Mentions shows 2 unread (auto-expanded), badge `[UNREAD]` on each
5. 📋 Tasks I own shows Today tab with 3 tasks (auto-expanded, others collapsed)
6. Click expand `⌄` on a task → quick update textarea appears
7. Type "@hattt4 reviewed and ready for approval" → click Post → row collapses, toast "Update posted"
8. Check Activity feed → entry `"Trangvk posted update on Setup HIO bank account"`
9. After 5s, lastSeenMyWorkAt updates → next visit, mentions count clears
10. 📊 My credit collapsed by default → expand → see 9.0 / 22.0 cp

## As workspace owner (hattt4)

1. Open app → My Work view
2. 🔴 Needs attention shows: 1 overdue + 2 pending deadline approvals (since isOwner)
3. Click `✓ Approve` on approval item → confirmation dialog → task.end updates → activity log
4. Switch to Team Overview tab → see 8-member table
5. Sort by Overdue → Trangvk top with 3 overdue
6. Click `View as →` next to Trangvk
7. Banner appears: `🎭 Viewing as Trangvk · Actions will log as "hattt4 (acting as Trangvk)"`
8. Other tabs hidden, only My Work visible
9. View Trangvk's My Work — see her overdue tasks
10. Click expand on a task → post update → log entry `"hattt4 (acting as Trangvk): posted update on..."`
11. Click `Exit impersonation` → return to owner's normal view, all tabs visible

## Empty states

1. New member added to team, no assignments yet → My Work shows "🌱 No tasks assigned yet"
2. Member has tasks but none today/this week → "🌤 Nothing urgent today"
3. Section with 0 items → auto-collapsed
4. Credit not set up for any project → "No credit allocation set up..."

## Badge behavior

1. User has 2 unread mentions + 1 overdue task → tab shows `My Work ⚠ 3`
2. User views My Work, waits 5s → lastSeenMyWorkAt updates → mentions count clears → badge becomes `My Work ⚠ 1` (just overdue)
3. User marks overdue task as Completed → badge clears → tab shows just `My Work`

## Default view setting

1. Owner sets `meta.defaultView = 'outline'` → all users now land on Outline
2. Trangvk overrides personal preference: defaultViewOverride = 'my-work' → she lands on My Work, others land on Outline
3. Owner changes default to 'gantt' → users without override land on Gantt; Trangvk still lands on My Work

---

# Dependencies + critical pitfalls

## Dependencies

```
v21 (Combo 1 — task.contributors)
v22-25 (Credit system — computeProjectCredits, perPic)
v27 (Deadline approval — task.deadlineRequest, request handlers)
─────────────────────────────────────────────
v30 Phase 1: computeMyWork + MyWorkView
v30 Phase 2: Inline actions (depend on Phase 1 + v27 handlers)
v30 Phase 3: TeamOverviewView (depends on computeMyWork)
v30 Phase 4: Engagement settings (depend on schema additions)
─────────────────────────────────────────────
Phase 5 (separate, future): notification backend
```

## Critical pitfalls

1. **Don't compute `computeMyWork` inside every render of every TaskRowInline** — pass results down via props.

2. **Impersonation banner must persist across navigation** — store `impersonatingAs` in App-level state, not in TeamOverviewView local state.

3. **Activity log with impersonation** — every action handler must check `impersonatingAs` before composing the log entry. Audit trail integrity depends on this.

4. **Mention parsing** — current `findMentions(text, teamMembers)` returns `{name, start, end}`. The author field for matching is `task.pic` (name string), so mentions like `@hattt4` should match `author = "hattt4"`. Test with the existing 188 tasks to ensure consistency.

5. **lastSeenMyWorkAt timing** — 5-second delay prevents accidental "mark all read" on quick navigation. Don't reduce below 3s.

6. **Empty userPreferences object** — when user first opens, `meta.userPreferences[author]` may not exist. Always default to `{}` with fallback reads.

7. **Workspace defaultView fallback chain** — `userPrefs.defaultViewOverride || meta.defaultView || 'outline'`. Don't crash if any is undefined.

8. **TeamOverviewView calls `computeMyWork` per member** — for 10 members × 188 tasks = ~1880 ops per render. Memoize aggressively or batch into single walk.

9. **Status change from My Work doesn't auto-deselect a selected task in Outline** — these are independent UI states. Don't try to sync.

10. **Don't show My Work badge in TabButton if user hasn't visited My Work yet** — could confuse first-time users with red ⚠ on a tab they don't know about. Show zero badge until first visit.

---

# Implementation order summary

```
Phase 1 (~4h):
├── Schema: meta.defaultView, meta.userPreferences (with fallback reads)
├── Helper: computeMyWork(author, projects, isOwner, lastSeenAt)
├── Component: MyWorkView with 7 sections + smart-expand
├── Component: TaskRowInline (expand pattern C+D)
├── Component: StatusQuickPill
├── Tab integration (new "My Work" tab, visible to all)
└── Tests: walk through "As regular team member" scenario

Phase 2 (~3h):
├── Wire inline actions: status, update, request extension, approve/reject, mark action done
├── Activity log entries for each
├── Tests: walk through inline action paths

Phase 3 (~3h):
├── Helper: computeTeamOverview(projects, members)
├── Component: TeamOverviewView (per-member rows)
├── Component: impersonation state at App level
├── Banner UI when impersonating
├── Activity log with "X (acting as Y)" pattern
├── Excel export for team data
├── Tab integration (owner-only)
└── Tests: walk through "As workspace owner" scenario

Phase 4 (~2h):
├── meta.defaultView setting in Workspace Settings
├── Personal override (defaultViewOverride)
├── Badge count on tab
├── Notification preferences UI (no backend)
├── lastSeenMyWorkAt 5-sec mount effect
└── Tests: walk through badge + default view scenarios

Total: ~12h, can be done in 2-3 sessions of Claude Code.
```
