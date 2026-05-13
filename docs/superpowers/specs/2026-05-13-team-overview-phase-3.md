# Phase 3 — Team Overview tab (owner-only) + impersonation

**Date:** 2026-05-13
**App:** AF MTP — extends Phase 1 / 2 / A.1 / A.2 / B
**Status:** Design — pending implementation
**Effort:** ~5-6h in-app

---

## Background

Phase 1 + 2 built My Work for everyone; Phases A.1, A.2, B made action items, decisions and sub-tasks workable from the desk. The workspace owner now has full visibility into their own work via My Work but no equivalent into other team members' workload. They have to ask "How's X's plate looking?" via Slack instead of seeing it.

Phase 3 closes that gap with:

1. A new owner-only **Team Overview tab** showing per-member workload aggregation, sort, and Excel export
2. A **"View as <member>" impersonation flow** — owner clicks on a member row, the app switches to that member's My Work, and the owner can act on the member's behalf (full edit mode, audited)

The original v30 spec (`Specs/FEATURES_SPEC_v30_my_work.md` lines 559-712) drafted Phase 3 before Phases A/A.1/A.2/B existed. This spec supersedes it where the patterns diverge — specifically: the `source` parameter on `applyXxxUpdate` from Phase 2, the new `overdue_subtask` kind from Phase B, and the description-prefix audit format chosen during this brainstorm.

---

## Goals

1. **Team Overview tab** visible only when `isOwner` — adds to existing TABS array after Credits
2. **Per-member workload row** with 4 metric chips + credit progress + last activity + "View as →" button
3. **Summary cards** at top: Active members, Open actions across team, Overdue across team, Pending deadline approvals
4. **Sort options**: by Name / Overdue / Open tasks / Credit / Last activity
5. **Excel export** of the per-member table
6. **Impersonation** with full edit mode — owner can take any action the impersonated member can take
7. **Audit trail**: every action during impersonation logs as `description: "acting as <name>: <original description>"` (description prefix, not author rewrite)
8. **Sticky banner** during impersonation + only My Work tab visible
9. **Auto-clear** impersonation on page refresh (state is in-memory only)

**Non-goals (Phase 3):**

- Notification to impersonated user (Phase 5 territory)
- Persistent impersonation across refresh
- "View as" from any surface other than the Team Overview tab
- Impersonation history dashboard
- Read-only impersonation mode — full edit only per Q1
- Team Overview features for non-owners — view itself is owner-only
- Cross-workspace member directory — uses existing `deriveTeamMembers` output

---

## Cross-cutting principles

1. **`activity.author` always reflects the real user**, never a composite string. The "acting as X" context is encoded in the description prefix. This preserves filter / aggregate-by-author logic in Activity Dashboard and other downstream consumers.
2. **`effectiveAuthor = impersonatingAs || author`** is derived once at App level and passed to MyWorkView's `author` prop. computeMyWork sees the impersonated user as if they were logged in.
3. **`markMyWorkSeen` skips during impersonation** so the owner doesn't accidentally mark the impersonated user's mentions as seen. The impersonated user's `lastSeenMyWorkAt` is read-only from the owner's perspective.
4. **PIC default on create-from-impersonation** uses `effectiveAuthor` so a freshly created action lands in the impersonated user's My Work, not the owner's.
5. **Impersonation is in-memory only** — refresh clears it. This is a privacy and safety feature; owner shouldn't accidentally re-enter impersonation after a session interruption.
6. **Tab hiding during impersonation is total** — only My Work tab visible. Owner exits to do anything else. Trades some flexibility for clear mental model and prevents accidental owner-level actions.

---

## Schema additions

**None.**

Uses existing fields:
- `meta.workspaceOwner` (already used for `isOwner` check)
- `deriveTeamMembers(projects, currentAuthor, currentUserEmail, directory)` for team roster
- `meta.userPreferences[author]` (unchanged — `markMyWorkSeen` reads/writes the real owner's key, skipped during impersonation)

---

## Components touched

| File / Component | Change |
|---|---|
| `src/App.jsx` | All Phase 3 changes (single-file invariant) |
| **NEW `TeamOverviewView`** | The main view — summary cards + per-member table + Excel export |
| **NEW `MemberOverviewRow`** | One row per member: name/email/avatar + 4 metric chips + credit progress + last activity + View-as button |
| **NEW `ImpersonationBanner`** | Sticky top banner when `impersonatingAs` set |
| **NEW `computeTeamOverview(projects, members)`** | Helper: per-member aggregation |
| **NEW `getLastActivityForMember(member, projects)`** | Helper: walk updates/checkIns to find latest |
| **NEW `teamOverviewToExcel(teamData)`** | XLSX export builder |
| `applyTaskUpdate` / `applyActionUpdate` / `applyDecisionUpdate` / `createActionFromMyWork` | Accept optional `actingAs` parameter; description prefixed when set |
| `App()` | + `impersonatingAs` state, + `effectiveAuthor` derived, + `team-overview` tab in TABS array, + render `TeamOverviewView` for that view, + render `ImpersonationBanner` when impersonating, + hide other tabs during impersonation |
| `MyWorkView` render in App | Pass `effectiveAuthor` as `author`; pass `onMarkSeen={impersonatingAs ? null : markMyWorkSeen}` so the timer doesn't update lastSeenAt during impersonation. Pass `actingAs={impersonatingAs}` through to handlers |

---

## Detailed component changes

### 1. `applyTaskUpdate` / `applyActionUpdate` / `applyDecisionUpdate` / `createActionFromMyWork` — optional `actingAs` parameter

Currently each `apply*` helper takes `(updatedX, projectId, source = '')`. Add a 4th optional `actingAs` parameter (string display name).

**Existing pattern** inside `applyActionUpdate`:
```js
const tag = source ? ` (from ${source})` : '';
const log = (entry) => logActivityForProject(projectId, entry);
// ... per-field diff blocks ...
log({ type: 'action_complete', description: `Marked action done: "${updatedAction.title}"${tag}` });
```

**New pattern** — augment the `log` wrapper to prepend `actingPrefix`:
```js
const tag = source ? ` (from ${source})` : '';
const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
const log = (entry) => logActivityForProject(projectId, {
  ...entry,
  description: actingPrefix + entry.description,
});
// ... per-field diff blocks unchanged — they still build descriptions with ${tag} suffix ...
// Result when both apply: "acting as Trangvk: Marked action done: \"X\" (from My Work)"
```

The diff blocks themselves don't change — they keep using `${tag}` for the source suffix. Only the wrapper prepends the impersonation prefix. Apply the same pattern to `applyTaskUpdate`, `applyDecisionUpdate`, and `createActionFromMyWork`.

For `createActionFromMyWork`, add `actingAs` parameter; the single `logActivityForProject` call inside it gets the prefix.

**Important**: `actingAs` is only relevant during impersonation. MyWorkView's render in App passes `actingAs={impersonatingAs}` only when wiring handlers. ActionItemsView / TaskDetail / DecisionsView (which exist in non-impersonation flows) don't pass `actingAs` so behavior is unchanged.

### 2. `App()` — impersonation state + tab visibility + banner

**New state:**
```js
const [impersonatingAs, setImpersonatingAs] = useState(null);  // display name string or null
const effectiveAuthor = impersonatingAs || author;
```

**Tab array filter** — extend existing pattern. When impersonating, only show My Work:

```js
const allTabs = [
  { id: 'my-work', label: 'My Work', icon: <UserCircle size={12} /> },
  { id: 'mindmap', label: 'Mind map', icon: <MapIcon size={12} /> },
  // ... existing tabs ...
  ...(isOwner ? [{ id: 'portfolio', label: 'Portfolio', icon: <Home size={12} />, ownerOnly: true }] : []),
  ...(isOwner ? [{ id: 'credit-report', label: 'Credits', icon: <Activity size={12} />, ownerOnly: true }] : []),
  ...(isOwner ? [{ id: 'team-overview', label: 'Team', icon: <Users size={12} />, ownerOnly: true }] : []),
];
const visibleTabs = impersonatingAs ? allTabs.filter((t) => t.id === 'my-work') : allTabs;
```

Render `visibleTabs.map(...)` instead of the inline array. (Adds `Users` to lucide-react imports.)

**Auto-switch to My Work when impersonation starts:**

The "View as →" button click handler in TeamOverviewView calls:
```js
onImpersonate(member.name)
```

App-level handler:
```js
const startImpersonation = (memberName) => {
  setImpersonatingAs(memberName);
  setView('my-work');
};
```

**Exit impersonation:**

ImpersonationBanner has an Exit button:
```js
const clearImpersonation = () => {
  setImpersonatingAs(null);
  // Stay on My Work; owner can navigate as needed
};
```

**Render `ImpersonationBanner`** — sticky at top of the main app `<div>`, before the tab bar:

```jsx
{impersonatingAs && (
  <ImpersonationBanner
    actingAs={impersonatingAs}
    realAuthor={author}
    onExit={clearImpersonation}
  />
)}
```

**Render `TeamOverviewView`** in the view switch (inside ErrorBoundary):

```jsx
{view === 'team-overview' && isOwner && !impersonatingAs && (
  <TeamOverviewView
    projects={projects}
    teamMembers={teamMembers}
    currentAuthor={author}
    onImpersonate={startImpersonation}
  />
)}
{view === 'team-overview' && !isOwner && (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOK.muted, fontSize: 13 }}>
    Team overview is workspace-owner only.
  </div>
)}
```

(The `!impersonatingAs` guard isn't strictly necessary since tab visibility hides team-overview when impersonating, but defensive.)

### 3. MyWorkView render in App — pass effectiveAuthor + actingAs

In the my-work render switch:

```jsx
{view === 'my-work' && (
  <MyWorkView
    projects={projects}
    author={effectiveAuthor}              // CHANGED: was `author`
    isOwner={isOwner && !impersonatingAs} // CHANGED: owner privileges suppressed during impersonation
    userPrefs={userPrefs}                 // unchanged — still real owner's prefs
    teamMembers={teamMembers}
    onTaskClick={...}
    onActionClick={...}
    onDecisionClick={...}
    onCreateAction={(projectId, relatedTaskId) => setActionCreate({
      projectId: projectId || currentId,
      relatedTaskId: relatedTaskId || null,
      defaultPic: effectiveAuthor,        // CHANGED: pre-fill PIC with effectiveAuthor
    })}
    onTaskUpdate={(updatedTask, projectId) => applyTaskUpdate(updatedTask, projectId, 'My Work', impersonatingAs || '')}
    onActionUpdate={(updatedAction, projectId) => applyActionUpdate(updatedAction, projectId, 'My Work', impersonatingAs || '')}
    onDecisionUpdate={(updatedDecision, projectId) => applyDecisionUpdate(updatedDecision, projectId, 'My Work', impersonatingAs || '')}
    onApproveDeadline={impersonatingAs ? null : myWorkApproveDeadline}  // CHANGED: owner-only, hide during impersonation
    onRejectDeadline={impersonatingAs ? null : myWorkRejectDeadline}    // CHANGED: same
    onMarkSeen={impersonatingAs ? null : markMyWorkSeen}                // CHANGED: skip during impersonation
    showToast={showToast}
  />
)}
```

`ActionCreateModal` receives `defaultPic` from `actionCreate` state and pre-fills the form's PIC field. Currently `ActionCreateModal`'s ActionItemForm gets `author={author}` and the PIC normalizes to `newAction.pic || author || ''`. We extend `actionCreate` state shape to `{ projectId, relatedTaskId, defaultPic }` and update the form to use `defaultPic` as the author parameter:

```jsx
{actionCreate && (
  <ActionCreateModal
    projects={projects}
    defaultProjectId={actionCreate.projectId}
    defaultRelatedTaskId={actionCreate.relatedTaskId}
    author={actionCreate.defaultPic || author}  // CHANGED: use defaultPic when set
    teamMembers={teamMembers}
    onClose={() => setActionCreate(null)}
    onCreate={(newAction, projectId) => createActionFromMyWork(newAction, projectId, impersonatingAs || '')}
  />
)}
```

`createActionFromMyWork` gains the `actingAs` parameter and uses it both for the activity description prefix and for the PIC fallback:

```js
const createActionFromMyWork = useCallback((newAction, projectId, actingAs = '') => {
  // ... unchanged top ...
  const effective = actingAs || author;
  // PIC fallback uses effective
  const finalAction = { ...newAction, pic: newAction.pic || effective || '' };
  // ... existing push + log ...
  const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
  logActivityForProject(projectId, {
    type: 'action_create',
    description: `${actingPrefix}Created action: "${finalAction.title}" → ${finalAction.pic || '—'} (from My Work)`,
  });
  // ... showToast ...
}, [projects, updateProject, logActivityForProject, author]);
```

### 4. `ImpersonationBanner` component

```jsx
function ImpersonationBanner({ actingAs, realAuthor, onExit }) {
  return (
    <div style={{
      padding: '8px 16px',
      background: TOK.mentionBg,
      borderBottom: '2px solid ' + TOK.mention,
      display: 'flex', alignItems: 'center', gap: 12,
      fontFamily: FONT_STACK,
    }}>
      <span style={{ fontSize: 18 }}>🎭</span>
      <div style={{ flex: 1, fontSize: 13, color: TOK.mention }}>
        <strong>Viewing as {actingAs}</strong>
        <span style={{ marginLeft: 8, opacity: 0.85 }}>
          Actions will log as "acting as {actingAs}: ..." Signed in: {realAuthor}.
        </span>
      </div>
      <Btn size="sm" variant="primary" onClick={onExit}>Exit impersonation</Btn>
    </div>
  );
}
```

### 5. `computeTeamOverview(projects, members)` helper

```js
function computeTeamOverview(projects, members) {
  return members.map((m) => {
    const myWork = computeMyWork(m.name, projects, false, null);
    const ownedCount = myWork.tasksOwned.today.length + myWork.tasksOwned.week.length + myWork.tasksOwned.later.length;
    const actionsCount = myWork.actionItems.today.length + myWork.actionItems.week.length + myWork.actionItems.later.length;
    const overdueCount = myWork.needsAttention.filter((it) =>
      it.kind === 'overdue_task' || it.kind === 'overdue_action' || it.kind === 'overdue_subtask'
    ).length;
    const lastActivity = getLastActivityForMember(m, projects);
    return {
      member: m,
      tasksOwned: ownedCount,
      tasksOverdue: overdueCount,
      tasksContributing: myWork.tasksContributing.length,
      actionItemsOpen: actionsCount,
      credit: myWork.credit,
      lastActivity,
    };
  });
}
```

**Note**: `computeMyWork` is currently called once per render in MyWorkView. Calling it N times (one per member) in TeamOverviewView is the same cost — for typical workspace (~8 members), ~80ms total. Acceptable. If performance becomes an issue, batch into a single walk later (Phase 3.1).

`isOwner` parameter is passed as `false` so we don't include `pendingApprovals` / `deadline_approval` items in each member's count (those are owner-only signals, not relevant to per-member workload).

### 6. `getLastActivityForMember(member, projects)`

Walks every task's `updates` + `checkIns` + every action's `updates` + every decision's `decidedBy` mention, finds the latest entry where `entry.author === member.name`. Returns `{ ts, description }` or null.

```js
function getLastActivityForMember(member, projects) {
  let latest = null;
  const consider = (ts, description) => {
    if (!ts) return;
    const t = new Date(ts).getTime();
    if (isNaN(t)) return;
    if (!latest || t > latest.t) latest = { t, ts, description };
  };
  for (const proj of Object.values(projects || {})) {
    for (const pg of (proj.programs || [])) {
      for (const ws of (pg.workstreams || [])) {
        for (const t of (ws.tasks || [])) {
          for (const upd of (t.updates || [])) {
            if (upd.author === member.name) consider(upd.timestamp, `Posted update on "${t.name}"`);
          }
          for (const ci of (t.checkIns || [])) {
            if (ci.author === member.name) consider(ci.timestamp, `Posted check-in on "${t.name}"`);
          }
        }
      }
    }
    for (const a of (proj.actionItems || [])) {
      for (const upd of (a.updates || [])) {
        if (upd.author === member.name) consider(upd.timestamp, `Commented on action "${a.title}"`);
      }
    }
  }
  return latest;
}
```

### 7. `MemberOverviewRow` component

```jsx
function MemberOverviewRow({ data, onViewAs, currentAuthor }) {
  const { member, tasksOwned, tasksOverdue, tasksContributing, actionItemsOpen, credit, lastActivity } = data;
  const isSelf = member.name === currentAuthor;
  const empty = tasksOwned === 0 && actionItemsOpen === 0 && tasksContributing === 0 && credit.projected === 0;
  return (
    <div style={{ padding: '12px 14px', border: '1px solid ' + TOK.line, borderRadius: 8, background: TOK.surface, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: TOK.ink }}>
          {member.name}
          {member.email && <span style={{ color: TOK.muted, fontWeight: 400, marginLeft: 8 }}>{member.email}</span>}
          {isSelf && <span style={{ color: TOK.accent, fontWeight: 400, marginLeft: 8, fontSize: 11 }}>(you)</span>}
        </div>
        {!isSelf && (
          <Btn size="sm" variant="primary" onClick={() => onViewAs(member.name)}>View as →</Btn>
        )}
      </div>
      {empty ? (
        <div style={{ fontSize: 12.5, color: TOK.muted }}>
          🌱 No assignments yet. Add them as PIC or contributor to track their workload.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: TOK.ink, marginBottom: 4 }}>
            <span>📋 {tasksOwned} owned</span>
            {tasksOverdue > 0 && <span style={{ color: TOK.overdueFg, fontWeight: 500 }}>⚠ {tasksOverdue} overdue</span>}
            <span>🤝 {tasksContributing} contributing</span>
            <span>✅ {actionItemsOpen} actions</span>
          </div>
          {credit.projected > 0 && (
            <div style={{ fontSize: 12, color: TOK.muted }}>
              📊 {Math.round(credit.earned * 10) / 10} / {Math.round(credit.projected * 10) / 10} cp ({Math.round(credit.pct)}%)
            </div>
          )}
          {lastActivity && (
            <div style={{ fontSize: 11.5, color: TOK.muted, marginTop: 2 }}>
              🕐 Last activity: {myWorkTimeAgo(lastActivity.ts)} — {lastActivity.description}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

**Self row**: when `member.name === currentAuthor`, the View-as button is hidden (owner can't impersonate themselves).

### 8. `TeamOverviewView` component

```jsx
function TeamOverviewView({ projects, teamMembers, currentAuthor, onImpersonate }) {
  const [sortBy, setSortBy] = useState('overdue'); // overdue | name | tasks | credit | activity

  const teamData = useMemo(
    () => computeTeamOverview(projects, teamMembers),
    [projects, teamMembers]
  );

  const sorted = useMemo(() => {
    const arr = [...teamData];
    if (sortBy === 'name') arr.sort((a, b) => a.member.name.localeCompare(b.member.name));
    else if (sortBy === 'overdue') arr.sort((a, b) => b.tasksOverdue - a.tasksOverdue || a.member.name.localeCompare(b.member.name));
    else if (sortBy === 'tasks') arr.sort((a, b) => b.tasksOwned - a.tasksOwned || a.member.name.localeCompare(b.member.name));
    else if (sortBy === 'credit') arr.sort((a, b) => b.credit.earned - a.credit.earned || a.member.name.localeCompare(b.member.name));
    else if (sortBy === 'activity') {
      arr.sort((a, b) => {
        const ta = a.lastActivity?.t || 0;
        const tb = b.lastActivity?.t || 0;
        return tb - ta;
      });
    }
    return arr;
  }, [teamData, sortBy]);

  const summary = useMemo(() => {
    let activeMembers = 0;
    let totalOpenActions = 0;
    let totalOverdue = 0;
    let pendingApprovals = 0;
    for (const d of teamData) {
      if (d.tasksOwned + d.actionItemsOpen + d.tasksContributing > 0) activeMembers++;
      totalOpenActions += d.actionItemsOpen;
      totalOverdue += d.tasksOverdue;
    }
    for (const proj of Object.values(projects || {})) {
      for (const pg of (proj.programs || [])) {
        for (const ws of (pg.workstreams || [])) {
          for (const t of (ws.tasks || [])) {
            if (t.deadlineRequest) pendingApprovals++;
          }
        }
      }
    }
    return { activeMembers, totalOpenActions, totalOverdue, pendingApprovals };
  }, [teamData, projects]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows = sorted.map((d) => ({
      'Member': d.member.name,
      'Email': d.member.email || '',
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

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontFamily: FONT_STACK, background: TOK.bg }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Team Overview <span style={{ color: TOK.accent, fontSize: 11, fontWeight: 400, marginLeft: 6 }}>[OWNER ONLY]</span></h2>
            <div style={{ fontSize: 12, color: TOK.muted, marginTop: 2 }}>
              Workload, activity, and credit attribution for all team members.
            </div>
          </div>
          <Btn size="sm" onClick={exportExcel}><FileSpreadsheet size={11} /> Export Excel</Btn>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Active members" value={summary.activeMembers} />
          <SummaryCard label="Open action items" value={summary.totalOpenActions} />
          <SummaryCard label="Overdue across team" value={summary.totalOverdue} accent={summary.totalOverdue > 0 ? TOK.overdueFg : null} />
          <SummaryCard label="Pending approvals" value={summary.pendingApprovals} accent={summary.pendingApprovals > 0 ? TOK.inprogFg : null} />
        </div>

        {/* Sort controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, color: TOK.muted }}>
          <span>Sort:</span>
          {[
            { id: 'overdue', label: 'Overdue first' },
            { id: 'name', label: 'Name' },
            { id: 'tasks', label: 'Open tasks' },
            { id: 'credit', label: 'Credit earned' },
            { id: 'activity', label: 'Last activity' },
          ].map((opt) => (
            <button key={opt.id} onClick={() => setSortBy(opt.id)}
              style={{
                background: sortBy === opt.id ? TOK.surface : 'transparent',
                border: '1px solid ' + (sortBy === opt.id ? TOK.lineStrong : TOK.line),
                borderRadius: 6, padding: '4px 10px', fontSize: 12,
                fontFamily: FONT_STACK, cursor: 'pointer', color: TOK.ink,
              }}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Per-member rows */}
        {sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: TOK.subtle, fontSize: 13, background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10 }}>
            No team members yet. Members appear as you assign PICs or invite them via Members modal.
          </div>
        ) : (
          sorted.map((d) => (
            <MemberOverviewRow key={d.member.email || d.member.name} data={d} onViewAs={onImpersonate} currentAuthor={currentAuthor} />
          ))
        )}
      </div>
    </div>
  );
}
```

`SummaryCard` already exists in the file (used by other views — `function SummaryCard({ label, value, sub, accent })`).

---

## Activity log behavior summary

| Surface | Description format example |
|---|---|
| TaskDetail edit (no impersonation) | `Posted check-in on "Setup HIO"` |
| My Work inline edit (no impersonation) | `Changed "Setup HIO" status: Planned → InProgress (from My Work)` |
| My Work inline edit (impersonating Trangvk) | `acting as Trangvk: Changed "Setup HIO" status: Planned → InProgress (from My Work)` |
| Actions tab edit | `Posted comment on action "X" (from Actions tab)` (no impersonation surface here) |
| Create from My Work (impersonating) | `acting as Trangvk: Created action: "Y" → Trangvk (from My Work)` |

`activity.author` is always the real user — filters and aggregations work correctly. The `acting as <X>: ` prefix is purely descriptive.

---

## Testing checklist

### Functional

1. **Team tab visible only to owner** — Owner sees Team tab; non-owner doesn't.
2. **Summary cards** — Active members count matches number of team members with non-zero workload; Open actions sum matches per-member counts; Overdue across team aggregates all overdue kinds; Pending approvals counts tasks with deadlineRequest set.
3. **Per-member row** — Each row shows correct counts derived from `computeMyWork(member.name, ...)`. Self row has "(you)" badge and no View-as button.
4. **Empty member** — Member with zero assignments shows "🌱 No assignments yet" message.
5. **Sort by overdue (default)** — Member with most overdue items at top.
6. **Sort by name / tasks / credit / activity** — Each sort works correctly.
7. **Excel export** — Click button → file downloads as `Team_Overview_<YYYY-MM-DD>.xlsx` with all member columns.
8. **View as impersonation** — Click "View as →" on a member row → impersonation banner appears + view switches to My Work + tab nav shows only My Work + computeMyWork shows impersonated user's work.
9. **Inline edit during impersonation** — Mark a task done from impersonated My Work → activity entry has `acting as <member>: ` prefix and `(from My Work)` suffix.
10. **Create action during impersonation** — "+ New action" → modal opens → save without changing PIC → newly created action has `pic = <impersonated member>` (not owner). Activity entry tagged appropriately.
11. **markMyWorkSeen skipped during impersonation** — Open impersonated My Work for 6+ seconds → impersonated member's `lastSeenMyWorkAt` NOT updated (verify via inspecting meta in DevTools or by signing in as them and checking unread badges).
12. **Owner-only buttons hidden during impersonation** — Owner-approval / reject buttons on deadline_approval cards don't appear (because `isOwner && !impersonatingAs` is false).
13. **Exit impersonation** — Click Exit → impersonating cleared → tab nav restored → still on My Work view (owner's own).
14. **Auto-clear on refresh** — Impersonate, refresh page → impersonation cleared, owner back on whatever default view resolves to.

### Regression

15. **Phase 1-2 flows unchanged** — Outline edits, TaskDetail flows, comment posts (no impersonation) work as before, activity entries without `acting as` prefix.
16. **Phase A.1 create-action** — Modal save without impersonation: PIC defaults to author (current user) as before.
17. **Phase A.2 decision status pill** — Status change without impersonation: activity entry plain.
18. **Phase B sub-tasks** — Add/edit/mark sub-task without impersonation: activity entries plain.
19. **ActionItemsView edit form** — Saving from Actions tab does NOT prefix with `acting as` (no impersonation surface here — owner has to use My Work for impersonation).

### Edge cases

20. **Member with email but no observed work** — Row shows name + email + "No assignments yet".
21. **Member with no email** — Row shows name only, no email span.
22. **Owner views their own row** — Self row visible with "(you)" badge, no View-as button.
23. **Activity Dashboard during impersonation** — Owner can't access Activity Dashboard tab (hidden during impersonation), but if they exit and return, entries from impersonated edits show with prefix in description and real author (owner) as `author` field. Group-by-PIC aggregation correctly attributes work to owner.

---

## Critical pitfalls

1. **`activity.author` MUST remain the real user.** Do NOT set it to a composite string. The description prefix carries the impersonation context. This preserves Activity Dashboard's group-by-PIC integrity and any future filter UIs.
2. **`isOwner` passed to MyWorkView during impersonation must be FALSE.** Owner-only features inside MyWorkView (e.g., needs-attention `deadline_approval` cards with approve/reject buttons) should not render when impersonating. Compute `isOwner && !impersonatingAs` at the call site.
3. **`markMyWorkSeen` must be skipped during impersonation.** Pass `onMarkSeen={impersonatingAs ? null : markMyWorkSeen}` so the timer in MyWorkView simply doesn't fire when the prop is null.
4. **PIC default on Create from impersonation uses `effectiveAuthor`, not `author`.** Otherwise newly created action lands in owner's My Work (the very thing impersonation tries to avoid).
5. **All four `apply*Update` functions accept `actingAs`.** Missing one means part of the audit trail lacks the prefix. Easy to forget `applyDecisionUpdate` since decisions are less frequently used from My Work.
6. **Tab hiding during impersonation must filter the visible tabs array, not just disable clicks.** Visible-but-disabled is confusing UX. Use `.filter()` on the tabs array.
7. **Impersonation does NOT persist in state.** Owner refreshes → impersonation gone. This is by design (Q4 non-goal). Don't write impersonatingAs to meta.userPreferences.
8. **`getLastActivityForMember` walks the whole projects tree.** For very large workspaces this is O(N) per call. computeTeamOverview calls it once per member — total O(N×M). For typical sizes (~8 members, ~200 tasks) this is fine. Don't over-optimize.
9. **"Active members" definition** — a member is "active" if they have at least one task owned OR contributing OR action item OR open decision (per the spec's definition). Empty members are counted in the row table but NOT in the "Active members" summary card.
10. **`computeMyWork(member.name, projects, false, null)` passes `isOwner: false`**. This is critical — passing `true` would include deadline_approval kinds for every member, which makes no sense (only the workspace owner can approve).

---

## Implementation order

```
1. Add `actingAs` parameter to applyTaskUpdate / applyActionUpdate / applyDecisionUpdate / createActionFromMyWork; description prefix logic                                          (~30 lines)
2. Add App state: impersonatingAs + effectiveAuthor + startImpersonation + clearImpersonation                                                                                        (~20 lines)
3. Tab visibility filter: visibleTabs = impersonatingAs ? [my-work only] : allTabs; render visibleTabs.map(...) instead of inline array; add team-overview tab to allTabs            (~30 lines)
4. Render ImpersonationBanner above tab bar when impersonating + create the component                                                                                                (~30 lines)
5. Update MyWorkView render call: pass effectiveAuthor, isOwner gated, onMarkSeen gated, onTaskUpdate / onActionUpdate / onDecisionUpdate / onCreateAction with actingAs param        (~25 lines)
6. createActionFromMyWork: accept actingAs + use it for PIC fallback + description prefix; ActionCreateModal: support defaultPic                                                     (~25 lines)
7. Build helpers: computeTeamOverview + getLastActivityForMember                                                                                                                     (~50 lines)
8. Build TeamOverviewView + MemberOverviewRow components                                                                                                                             (~150 lines)
9. Wire team-overview into render switch (gated on isOwner && !impersonatingAs); fallback message for non-owners                                                                     (~10 lines)
10. Manual smoke test (23-item checklist)
```

Total: ~340 lines. App.jsx: 11232 → ~11570.

---

## Future-proofing notes

Phase 3.1 candidates if usage reveals need:
- **Persistent impersonation** across refresh — write `impersonatingAs` to localStorage (NOT meta, since it's owner-specific session state).
- **Audit dashboard** — filter Activity Dashboard by `description.startsWith('acting as ')` to surface impersonation events.
- **Notify impersonated user** — Phase 5 backend.
- **Drill-down per member** — click member row → expand to show their actual Today/Week/Later breakdown without entering impersonation.
- **Batch operations** — owner selects multiple members → bulk message via Email PICs flow (similar to ActionItemsView's email-PICs).

None of these are precluded by Phase 3's design.
