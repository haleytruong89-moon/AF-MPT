# RAID Register — Phase 3 (Task Detail Signal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a read-only "Program RAID signal" block below the existing Updates/Decisions/Actions tabs inside the TaskDetail side panel. Surfaces the top 3 active RAID items in the task's parent program. "View all →" navigates to the RAID tab with that program pre-selected.

**Architecture:** Single-file React, all in `src/App.jsx`. One new component (`TaskProgramRaidSignal`) consumed by `TaskDetail`. Lifts a `raidScopeProgramId` state into `App` so the RAID tab can pre-select a program. RaidRegisterView already accepts `scopeProgramId` prop — we just wire it.

**Tech Stack:** React 18.3, Vite 5.4, single-file `src/App.jsx`. No tests — validation via `npm run lint` + `npm run build` + manual browser smoke.

**Reference files:**
- Spec: `Specs/FEATURES_SPEC_v30_raid.md` §3 (Task Detail panel — program risk signal)
- Phase 1: constants + helpers
- Phase 2: RAID Register view (`RaidRegisterView` already accepts `scopeProgramId` prop)
- Phase 4: cross-view navigation pattern via `onNavigateRaid` (mirror this)

**Out of scope:** Portfolio rollup + Excel export (Phase 5 — separate plan).

---

## File Structure

All changes in `src/App.jsx`. Locations (line numbers approximate, post-Phase-4):
- `TaskProgramRaidSignal` component — near other RAID components (between `RaidRegisterView` end and `MyWorkView` start)
- Render inside `TaskDetail` — sibling of Meeting Hub tab container (after closing `</div>` of Meeting Hub)
- `raidScopeProgramId` state inside `App` component + plumbing to `RaidRegisterView` and to `TaskDetail`

---

### Task 1: `TaskProgramRaidSignal` component

**Files:**
- Modify: `src/App.jsx` — insert before `function MyWorkView` (alongside other RAID components).

**Why:** Read-only collapsible block. Shows top 3 active RAID items in the task's program, sorted by risk level (Risk: by computed level; Issue/Dependency/Assumption: by recency). Truncates titles at 60 chars. "View all →" calls a navigation callback.

- [ ] **Step 1: Locate insertion point**

Find `function MyWorkView` — should be around L9740 area post-Phase-4. Insert the new component just before it (alongside other RAID components — `MyRaidSection`, etc.).

- [ ] **Step 2: Insert this exact block**

```js
// v30 RAID Phase 3 — Read-only collapsible signal inside TaskDetail panel.
// Shows up to 3 highest-priority active RAID items for the task's parent program.
// `program` is the task's parent program object (already destructured in TaskDetail
// from findTaskInProject). `onNavigateRaid` switches to RAID tab + scopes program.
function TaskProgramRaidSignal({ program, onNavigateRaid }) {
  const activeItems = useMemo(() => {
    return (program?.raid || [])
      .filter((r) => r.status === 'Active' || r.status === 'Mitigating')
      .sort((a, b) => {
        // PendingApproval items already excluded by filter above.
        // Sort: Risk by computed level desc, then non-Risk by createdAt desc.
        const levelOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        const al = a.type === 'Risk' ? levelOrder[raidRiskLevel(a.likelihood, a.impact)] : 4;
        const bl = b.type === 'Risk' ? levelOrder[raidRiskLevel(b.likelihood, b.impact)] : 4;
        if (al !== bl) return al - bl;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
  }, [program]);

  const [expanded, setExpanded] = useState(activeItems.length > 0);

  if (!program) return null;

  const top3 = activeItems.slice(0, 3);
  const extra = activeItems.length - top3.length;
  const issueCount = activeItems.filter((r) => r.type === 'Issue').length;
  const dependencyCount = activeItems.filter((r) => r.type === 'Dependency').length;
  const escalatingCount = activeItems.filter((r) => r.trend === 'escalating').length;

  return (
    <div style={{ marginTop: 14, border: '1px solid ' + TOK.line, borderRadius: 8, background: TOK.surface, fontFamily: FONT_STACK }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <span style={{ fontSize: 14 }}>⚠</span>
        <div style={{ flex: 1, fontSize: 12.5, color: TOK.ink, fontWeight: 500 }}>
          {activeItems.length === 0 ? (
            <span style={{ color: TOK.muted, fontWeight: 400 }}>No active RAID items in {program.name}</span>
          ) : (
            <>
              {activeItems.length} active RAID item{activeItems.length === 1 ? '' : 's'} in {program.name}
              {escalatingCount > 0 && <span style={{ marginLeft: 8, color: '#A32D2D', fontSize: 11, fontWeight: 500 }}>🔴 {escalatingCount} escalating</span>}
            </>
          )}
        </div>
        {activeItems.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigateRaid(program.id); }}
            style={{ background: 'none', border: 'none', color: TOK.accent, fontSize: 11, cursor: 'pointer', fontFamily: FONT_STACK, padding: '2px 6px' }}>
            View all →
          </button>
        )}
        <ChevronDown size={13} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>
      {expanded && activeItems.length > 0 && (
        <div style={{ padding: '4px 12px 12px', borderTop: '1px solid ' + TOK.line }}>
          {top3.map((item) => {
            const tcfg = RAID_TYPES[item.type] || RAID_TYPES.Risk;
            const trendCfg = item.trend ? RAID_TREND_CONFIG[item.trend] : null;
            const isRisk = item.type === 'Risk';
            const truncated = item.title.length > 60 ? item.title.slice(0, 60) + '…' : item.title;
            return (
              <div key={item.id} style={{ padding: '6px 0', borderBottom: '1px dashed ' + TOK.line, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ fontSize: 13 }}>{tcfg.icon}</span>
                <span style={{ flex: 1, minWidth: 0, color: TOK.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {truncated}
                </span>
                {isRisk && <RiskLevelBadge likelihood={item.likelihood} impact={item.impact} />}
                {trendCfg && <span style={{ fontSize: 12 }} title={trendCfg.label}>{trendCfg.icon}</span>}
                <span style={{ fontSize: 10.5, color: TOK.muted }}>@{item.owner || '—'}</span>
              </div>
            );
          })}
          {extra > 0 && (
            <div style={{ padding: '6px 0', fontSize: 11, color: TOK.muted, fontStyle: 'italic' }}>
              +{extra} more · {issueCount > 0 && <>🔥 {issueCount} issue{issueCount === 1 ? '' : 's'} · </>}{dependencyCount > 0 && <>🔗 {dependencyCount} dependenc{dependencyCount === 1 ? 'y' : 'ies'} · </>}
              <button
                type="button"
                onClick={() => onNavigateRaid(program.id)}
                style={{ background: 'none', border: 'none', color: TOK.accent, fontSize: 11, cursor: 'pointer', fontFamily: FONT_STACK, padding: 0 }}>
                View all →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify lint + build**

```
npm run lint
npm run build
```

Expected: +1 unused-vars warning (consumed in Task 2). Build green.

- [ ] **Step 4: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): TaskProgramRaidSignal component (phase 3)"
```

---

### Task 2: Wire signal into TaskDetail + raidScopeProgramId state

**Files:**
- Modify: `src/App.jsx` — `TaskDetail` body to render the signal, `App` body to manage `raidScopeProgramId` state, `RaidRegisterView` already accepts the prop.

**Why:** Final integration. Adds a state lifted into App that captures which program to pre-scope when navigating to the RAID tab. TaskDetail receives an `onNavigateRaid` prop that triggers the cross-view navigation.

- [ ] **Step 1: Add `onNavigateRaid` prop to `TaskDetail` signature**

Find the `TaskDetail` signature (~L2892):

```js
function TaskDetail({ project, taskId, onClose, onUpdate, onDelete, onProjectUpdate, author, teamMembers, dialogs, isOwner = false }) {
```

Add `onNavigateRaid` to the destructured props. Replace the line with:

```js
function TaskDetail({ project, taskId, onClose, onUpdate, onDelete, onProjectUpdate, author, teamMembers, dialogs, isOwner = false, onNavigateRaid }) {
```

- [ ] **Step 2: Render the signal below the Meeting Hub tabs**

Find the closing `</div>` of the Meeting Hub block (~L3495). It looks like:

```jsx
          )}
        </div>
      </div>
      {showDeadlineRequest && (
```

The first `</div>` (~L3495) closes the Meeting Hub container. The second `</div>` (~L3496) closes the outer panel content area. We insert the signal block BETWEEN these two — as a sibling of Meeting Hub.

Find:
```jsx
          )}
        </div>
      </div>
      {showDeadlineRequest && (
```

Replace with:
```jsx
          )}
        </div>

        {/* v30 RAID Phase 3 — Program RAID signal */}
        {program && onNavigateRaid && (
          <TaskProgramRaidSignal program={program} onNavigateRaid={onNavigateRaid} />
        )}
      </div>
      {showDeadlineRequest && (
```

(One block of JSX inserted before the outer `</div>` closing.)

- [ ] **Step 3: Add `raidScopeProgramId` state inside `App` component**

Find existing App-level state declarations. Search for `const [view, setView]` or similar. Insert a new state declaration on the line after one of the view-related states:

```js
  // v30 RAID Phase 3 — When navigating to the RAID tab from another view
  // (e.g. via TaskDetail's "View all →"), this state pre-selects the program.
  // Reset to null when the user manually switches programs in the sidebar.
  const [raidScopeProgramId, setRaidScopeProgramId] = useState(null);
```

You can place this anywhere among the existing `useState` calls inside `App` — a sensible neighbor is near other view-related state.

- [ ] **Step 4: Pass `scopeProgramId` to `RaidRegisterView`**

Find the existing `<RaidRegisterView ...>` render in the view router (~L11890 area post-Phase-4). Currently it passes `scopeProgramId={scopeProgramId}` (the existing per-project FOCUS dropdown state). Replace that with the RAID-specific state:

Find:
```jsx
              {view === 'raid' && (
                <RaidRegisterView
                  projects={projects}
                  currentProjectId={isAllProjectsMode ? null : currentId}
                  author={effectiveAuthor}
                  isOwner={isOwner && !impersonatingAs}
                  teamMembers={teamMembers}
                  scopeProgramId={scopeProgramId}
```

Replace with:
```jsx
              {view === 'raid' && (
                <RaidRegisterView
                  projects={projects}
                  currentProjectId={isAllProjectsMode ? null : currentId}
                  author={effectiveAuthor}
                  isOwner={isOwner && !impersonatingAs}
                  teamMembers={teamMembers}
                  scopeProgramId={raidScopeProgramId || scopeProgramId}
```

(So RAID-specific scope wins; fall back to the global FOCUS scope when no RAID-specific scope is set.)

- [ ] **Step 5: Wire `onNavigateRaid` to `TaskDetail`**

Find every place `<TaskDetail ...>` is rendered. There are at least 1-2 instances inside App's view router. Search for `<TaskDetail ` to find them.

For each render, add the `onNavigateRaid` prop. Example: find a `<TaskDetail` render and append this prop alongside the existing ones:

```jsx
                  onNavigateRaid={(programId) => {
                    setRaidScopeProgramId(programId);
                    setView('raid');
                  }}
```

If there are multiple `<TaskDetail` renders (e.g. one for inline task detail, one for modal), wire all of them identically.

- [ ] **Step 6: Update the existing `onNavigateRaid` in `<MyWorkView ...>` to set raidScopeProgramId**

Find the existing `onNavigateRaid` prop on `<MyWorkView>` (wired in Phase 4). It currently looks like:

```jsx
                  onNavigateRaid={async (projectId, _programId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setView('raid');
                    // Note: programId not used to scope yet — RaidRegisterView
                    // auto-selects first program. Future enhancement: lift a
                    // raidScopeProgramId state for cross-tab program pre-select.
                  }}
```

Replace with:

```jsx
                  onNavigateRaid={async (projectId, programId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setRaidScopeProgramId(programId || null);
                    setView('raid');
                  }}
```

(Now MyWork RAID mini-cards correctly scope the destination program too — bonus Phase 4 follow-up.)

- [ ] **Step 7: Reset `raidScopeProgramId` when user manually picks a program in the RAID sidebar**

The current `RaidRegisterView` auto-selects the first program when `selectedProgramKey` is null, and resets when the user clicks a sidebar row. The `scopeProgramId` prop narrows `allProgramEntries`. To avoid sticky scoping (user clicks "View all" once, then can't see other programs), the user clicking a sidebar entry should clear `raidScopeProgramId`.

This is handled automatically: `RaidRegisterView.allProgramEntries` filters by `scopeProgramId`, but once user clicks a row, `selectedProgramKey` is set and the user sees the program they picked. If they want to see OTHER programs, they need a way to clear the scope.

Simple fix: when the user enters the RAID view via tab strip (not via signal click), clear the scope. Find the existing tab strip render where `<button onClick={() => setView(v.id)}>` lives. For the RAID tab specifically, also clear scope.

Find the tab strip IIFE map function. The `onClick` is:
```jsx
                <button key={v.id} onClick={() => setView(v.id)} style={{
```

Replace with:
```jsx
                <button key={v.id} onClick={() => {
                  if (v.id === 'raid') setRaidScopeProgramId(null);
                  setView(v.id);
                }} style={{
```

This way: clicking the RAID tab manually clears the scope; clicking "View all →" from a TaskDetail or MyWork row sets it.

- [ ] **Step 8: Verify lint + build**

```
npm run lint
npm run build
```

Expected: previously-unused warnings for `TaskProgramRaidSignal` and `raidScopeProgramId` setter drop. Build green.

- [ ] **Step 9: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): wire TaskProgramRaidSignal + raidScopeProgramId (phase 3 final)"
```

---

## Phase 3 acceptance criteria (verified manually)

1. Open a task in Outline/Gantt/Mind map — TaskDetail panel opens.
2. Scroll below the Updates/Decisions/Actions tabs — see "⚠ N active RAID items in {programName}" block.
3. If 0 active items, block shows "No active RAID items in {programName}" muted, collapsible.
4. If 1+ active items, block is expanded by default. Top 3 items listed: type icon, title (truncated 60 chars), risk level badge (Risk only), trend icon, owner.
5. If escalating items exist, header shows "🔴 N escalating" in red.
6. If >3 active items, footer shows "+N more · 🔥 N issues · 🔗 N dependencies · View all →".
7. "View all →" button click: switches to RAID tab AND that program is pre-selected in the RAID sidebar.
8. From RAID tab, click another program in sidebar → that program shows up normally. Click RAID tab from main strip → all programs visible again (scope cleared).
9. From My Work, click a RAID mini-card → switch project (if cross-project) + RAID tab + correct program pre-selected.
10. Build green, lint baseline ≤ baseline (54 warnings before Phase 3).

---

## Self-Review Notes

**Spec coverage:**
- §3 "Read-only Program RAID signal block" — PASS, no edit capability
- §3 "Top 3 risks + issue count, title truncated at 60 chars" — PASS
- §3 "View all → button navigates to RAID Register with that program pre-selected" — PASS via raidScopeProgramId
- §3 "Collapsible: collapsed by default if 0, expanded if >0" — PASS via initial state

**No placeholders.** All code provided inline.

**Type consistency:** `onNavigateRaid` prop signature differs between TaskDetail (`(programId) =>`) and MyWorkView (`(projectId, programId) =>`). This is intentional — TaskDetail already operates within the current project context so projectId is implicit; MyWorkView is cross-project so both args needed.

**No new mutations.** Phase 3 is fully read-only. Existing `applyRaidUpdate` / `deleteRaidItem` are unchanged.

**Frequent commits.** 2 commits across 2 tasks.

**Cleanup of Phase 4 placeholder.** Phase 4 had a comment "Future enhancement: lift a raidScopeProgramId state for cross-tab program pre-select" — Task 2 Step 6 removes that comment and wires the now-existing state.
