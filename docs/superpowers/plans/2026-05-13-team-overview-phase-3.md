# Phase 3 — Team Overview + Impersonation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner-only Team tab with workload aggregation + "View as <member>" impersonation flow (full edit mode, audited via description prefix).

**Architecture:** Single-file React (`src/App.jsx`). All 4 apply* helpers gain optional `actingAs` parameter (description prefix wrapper). App-level `impersonatingAs` state + `effectiveAuthor` derived. Two new components (`TeamOverviewView`, `MemberOverviewRow`, `ImpersonationBanner`) + two helpers (`computeTeamOverview`, `getLastActivityForMember`). Tab visibility filtered down to My Work only during impersonation.

**Tech Stack:** React 18.3, Vite 5.4, lucide-react (`Users` icon already to be added), XLSX (already imported). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-13-team-overview-phase-3.md`

**Test workflow:** No test runner. Verification per task = `npm run build` + `npx eslint src/App.jsx`. Manual smoke test in browser at end.

---

## File structure

Only one file modified:

| File | Role |
|---|---|
| `src/App.jsx` (current 11232 lines) | All Phase 3 changes. Will grow ~340 lines to ~11570. |

Logical units touched:

1. **`applyTaskUpdate` (~L9564)** — wrapper extended for actingAs prefix
2. **`applyActionUpdate` (~L9625)** — same
3. **`applyDecisionUpdate` (~L9695)** — same
4. **`createActionFromMyWork` (~L9716)** — same + PIC fallback via effectiveAuthor
5. **`ActionCreateModal` (~L4216)** — accept `defaultPic` override for impersonation
6. **`App()` state (~L9335+)** — add `impersonatingAs`, derive `effectiveAuthor`, add handlers
7. **TABS render (~L10104)** — filter to visibleTabs; add Team tab
8. **Banner render (~before tab bar)** — new `ImpersonationBanner` placement
9. **`MyWorkView` render call (~L10192)** — wire effectiveAuthor + actingAs + gated owner features
10. **NEW components/helpers** — placed near existing similar components

---

## Task 1: Extend all 4 `apply*` helpers with optional `actingAs` parameter

**Files:** Modify `src/App.jsx` — `applyTaskUpdate` (~L9564), `applyActionUpdate` (~L9625), `applyDecisionUpdate` (~L9695), `createActionFromMyWork` (~L9716).

**Goal:** Each helper accepts optional `actingAs = ''` parameter. When set, the `log` wrapper prepends `acting as <actingAs>: ` to every description. Non-impersonation callers (passing nothing) behave exactly as before.

### Step 1: Edit `applyTaskUpdate`

Use `Edit`:

**`old_string`:**
```js
  const applyTaskUpdate = useCallback((updatedTask, projectId, source = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const loc = findTaskInProject(targetProj, updatedTask.id);
    if (!loc) return;
    const oldTask = loc.task;
    const updated = cloneDeep(targetProj);
    const ul = findTaskInProject(updated, updatedTask.id);
    Object.assign(ul.task, updatedTask);
    updateProject(updated);

    const tag = source ? ` (from ${source})` : '';
    const log = (entry) => logActivityForProject(projectId, entry);
```

**`new_string`:**
```js
  const applyTaskUpdate = useCallback((updatedTask, projectId, source = '', actingAs = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const loc = findTaskInProject(targetProj, updatedTask.id);
    if (!loc) return;
    const oldTask = loc.task;
    const updated = cloneDeep(targetProj);
    const ul = findTaskInProject(updated, updatedTask.id);
    Object.assign(ul.task, updatedTask);
    updateProject(updated);

    const tag = source ? ` (from ${source})` : '';
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    const log = (entry) => logActivityForProject(projectId, {
      ...entry,
      description: actingPrefix + entry.description,
    });
```

### Step 2: Edit `applyActionUpdate`

**`old_string`:**
```js
  const applyActionUpdate = useCallback((updatedAction, projectId, source = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const oldAction = (targetProj.actionItems || []).find((a) => a.id === updatedAction.id);
    const updated = cloneDeep(targetProj);
    updated.actionItems = (updated.actionItems || []).map((a) => a.id === updatedAction.id ? { ...a, ...updatedAction } : a);
    updateProject(updated);

    const tag = source ? ` (from ${source})` : '';
    const log = (entry) => logActivityForProject(projectId, entry);
    if (!oldAction) return;
```

**`new_string`:**
```js
  const applyActionUpdate = useCallback((updatedAction, projectId, source = '', actingAs = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const oldAction = (targetProj.actionItems || []).find((a) => a.id === updatedAction.id);
    const updated = cloneDeep(targetProj);
    updated.actionItems = (updated.actionItems || []).map((a) => a.id === updatedAction.id ? { ...a, ...updatedAction } : a);
    updateProject(updated);

    const tag = source ? ` (from ${source})` : '';
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    const log = (entry) => logActivityForProject(projectId, {
      ...entry,
      description: actingPrefix + entry.description,
    });
    if (!oldAction) return;
```

### Step 3: Edit `applyDecisionUpdate`

**`old_string`:**
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
      const snippet = (updatedDecision.text || '').slice(0, 60);
      const ellipsis = (updatedDecision.text || '').length > 60 ? '…' : '';
      logActivityForProject(projectId, {
        type: 'decision_status_change',
        description: `Decision "${snippet}${ellipsis}": ${oldDecision.followUpStatus || 'Open'} → ${updatedDecision.followUpStatus}${tag}`,
      });
    }
  }, [projects, updateProject, logActivityForProject]);
```

**`new_string`:**
```js
  const applyDecisionUpdate = useCallback((updatedDecision, projectId, source = '', actingAs = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const oldDecision = (targetProj.decisions || []).find((d) => d.id === updatedDecision.id);
    const updated = cloneDeep(targetProj);
    updated.decisions = (updated.decisions || []).map((d) => d.id === updatedDecision.id ? { ...d, ...updatedDecision } : d);
    updateProject(updated);
    const tag = source ? ` (from ${source})` : '';
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    if (oldDecision && oldDecision.followUpStatus !== updatedDecision.followUpStatus) {
      const snippet = (updatedDecision.text || '').slice(0, 60);
      const ellipsis = (updatedDecision.text || '').length > 60 ? '…' : '';
      logActivityForProject(projectId, {
        type: 'decision_status_change',
        description: `${actingPrefix}Decision "${snippet}${ellipsis}": ${oldDecision.followUpStatus || 'Open'} → ${updatedDecision.followUpStatus}${tag}`,
      });
    }
  }, [projects, updateProject, logActivityForProject]);
```

### Step 4: Edit `createActionFromMyWork` — add actingAs + use it for PIC fallback

**`old_string`:**
```js
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
```

**`new_string`:**
```js
  const createActionFromMyWork = useCallback((newAction, projectId, actingAs = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const updated = cloneDeep(targetProj);
    updated.actionItems = [newAction, ...(updated.actionItems || [])];
    updateProject(updated);
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    logActivityForProject(projectId, {
      type: 'action_create',
      description: `${actingPrefix}Created action: "${newAction.title}" → ${newAction.pic || '—'} (from My Work)`,
    });
    showToast(`Action created in ${targetProj.name}`);
  }, [projects, updateProject, logActivityForProject]);
```

### Step 5: Build + lint verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors, 24 warnings (baseline).

### Step 6: Commit

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(audit): apply* helpers accept optional actingAs parameter

Phase 3 step 1/8. Adds a 4th optional parameter to applyTaskUpdate,
applyActionUpdate, applyDecisionUpdate, and createActionFromMyWork.
When set, the log wrapper prepends "acting as <name>: " to every
description before persisting. activity.author stays as the real
user — preserves Activity Dashboard group-by-PIC integrity.

Non-impersonation callers (TaskDetail, ActionItemsView, DecisionsView,
Outline) pass nothing and see unchanged behavior. Impersonation
wiring lands in step 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Guardrails

- Modify ONLY src/App.jsx
- No destructive git operations

## Self-review

- All 4 edits succeeded?
- Build green?
- Lint 0 errors, 24 warnings?
- Commit created?

## Report

Status, commit SHA, build + lint outcome.

---

## Task 2: ActionCreateModal accepts `defaultPic` for impersonation

**Files:** Modify `src/App.jsx` — `ActionCreateModal` (~L4216).

**Goal:** Modal passes a `defaultPic` value (impersonated member's name) to ActionItemForm as the `author` parameter. The form's PIC normalization (`pic: newAction.pic || author || ''`) then defaults the new action's PIC to the impersonated user.

### Step 1: Add `defaultPic` prop and use it in author handoff

**`old_string`:**
```js
function ActionCreateModal({ projects, defaultProjectId, defaultRelatedTaskId, author, teamMembers, onClose, onCreate }) {
  const projectIds = useMemo(() => Object.keys(projects || {}).filter((id) => id !== '__all__'), [projects]);
  const [projectId, setProjectId] = useState(defaultProjectId && projects?.[defaultProjectId] ? defaultProjectId : (projectIds[0] || ''));
  const project = projects?.[projectId];

  return (
    <Modal title="New action item" onClose={onClose} width={520} zHigh>
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
```

**`new_string`:**
```js
function ActionCreateModal({ projects, defaultProjectId, defaultRelatedTaskId, author, defaultPic, teamMembers, onClose, onCreate }) {
  const projectIds = useMemo(() => Object.keys(projects || {}).filter((id) => id !== '__all__'), [projects]);
  const [projectId, setProjectId] = useState(defaultProjectId && projects?.[defaultProjectId] ? defaultProjectId : (projectIds[0] || ''));
  const project = projects?.[projectId];
  // v30 Phase 3 — defaultPic overrides author for the form's PIC pre-fill,
  // so an action created during impersonation lands on the impersonated user.
  const effectivePic = defaultPic || author;

  return (
    <Modal title="New action item" onClose={onClose} width={520} zHigh>
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
          author={effectivePic}
          defaultRelatedTaskId={defaultRelatedTaskId || null}
          onSave={(newAction) => {
            const finalAction = { ...newAction, pic: newAction.pic || effectivePic || '' };
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

### Step 2: Build + lint verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -3
```

Expected: green build, 0 errors.

### Step 3: Commit

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(actions): ActionCreateModal accepts defaultPic for impersonation

Phase 3 step 2/8. New defaultPic prop overrides the form's PIC pre-fill
so creating an action during impersonation lands the new action on the
impersonated member (not the owner). The form's title-author parameter
(used as the byline in @mention rendering and the PIC fallback at save)
becomes defaultPic || author.

Wired by App.jsx in step 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: App state + impersonation handlers

**Files:** Modify `src/App.jsx` — inside `App()` near other state declarations and callbacks.

**Goal:** Add `impersonatingAs` state, derive `effectiveAuthor`, add `startImpersonation` and `clearImpersonation`. Add `Users` icon import.

### Step 1: Add `Users` to the lucide-react import

**`old_string`:**
```js
import {
  Plus, Edit2, Trash2, X, Upload, Download, ChevronRight, ChevronDown,
  Save, Map as MapIcon, List as ListIcon, Calendar, FileSpreadsheet,
  Clock, AlertTriangle, CheckCircle2, Circle, PlayCircle,
  MessageSquare, Search, MoreHorizontal, FolderPlus, FileDown,
  FileUp, Activity, Home, ArrowRightLeft, Info, RefreshCw, UserCircle,
  Move, FileText, History, Grip, BarChart3, HelpCircle
} from 'lucide-react';
```

**`new_string`:**
```js
import {
  Plus, Edit2, Trash2, X, Upload, Download, ChevronRight, ChevronDown,
  Save, Map as MapIcon, List as ListIcon, Calendar, FileSpreadsheet,
  Clock, AlertTriangle, CheckCircle2, Circle, PlayCircle,
  MessageSquare, Search, MoreHorizontal, FolderPlus, FileDown,
  FileUp, Activity, Home, ArrowRightLeft, Info, RefreshCw, UserCircle,
  Move, FileText, History, Grip, BarChart3, HelpCircle, Users
} from 'lucide-react';
```

### Step 2: Add `impersonatingAs` state and handlers right after `markMyWorkSeen`

Find the existing `markMyWorkSeen` block ending (closing `}, [author]);`). Insert new state + handlers immediately after.

**`old_string`:**
```js
  const markMyWorkSeen = useCallback(async () => {
    if (!author) return;
    setMeta((m) => {
      if (!m) return m;
      const prefs = m.userPreferences || {};
      const m2 = {
        ...m,
        userPreferences: {
          ...prefs,
          [author]: { ...(prefs[author] || {}), lastSeenMyWorkAt: new Date().toISOString() },
        },
      };
      saveMeta(m2);
      return m2;
    });
  }, [author]);
```

**`new_string`:**
```js
  const markMyWorkSeen = useCallback(async () => {
    if (!author) return;
    setMeta((m) => {
      if (!m) return m;
      const prefs = m.userPreferences || {};
      const m2 = {
        ...m,
        userPreferences: {
          ...prefs,
          [author]: { ...(prefs[author] || {}), lastSeenMyWorkAt: new Date().toISOString() },
        },
      };
      saveMeta(m2);
      return m2;
    });
  }, [author]);

  // v30 Phase 3 — Owner impersonation state. In-memory only; cleared on refresh.
  // effectiveAuthor flows through MyWorkView render and apply* handlers so
  // the impersonated user appears to be acting from the desk.
  const [impersonatingAs, setImpersonatingAs] = useState(null);
  const effectiveAuthor = impersonatingAs || author;

  const startImpersonation = useCallback((memberName) => {
    if (!isOwner) return;
    if (!memberName || memberName === author) return;
    setImpersonatingAs(memberName);
    setView('my-work');
  }, [isOwner, author]);

  const clearImpersonation = useCallback(() => {
    setImpersonatingAs(null);
  }, []);
```

### Step 3: Build + lint verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors. Warnings: 24 baseline + likely 1 new for `Users` being defined-but-unused (until Task 4 wires the Team tab) + likely 1 for `startImpersonation`/`clearImpersonation`/`effectiveAuthor`/`impersonatingAs` defined-but-unused (until Tasks 5–7 wire them). Total 25–28 warnings is OK.

### Step 4: Commit

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(team): App-level impersonation state and handlers

Phase 3 step 3/8. Adds:
- impersonatingAs state (in-memory only; cleared on refresh)
- effectiveAuthor = impersonatingAs || author (passed to MyWorkView in step 7)
- startImpersonation(memberName) — guarded by isOwner + name validity
- clearImpersonation() — returns to owner's view
- Users icon imported from lucide-react for the Team tab in step 4

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Tab visibility filter + add Team tab

**Files:** Modify `src/App.jsx` — TABS rendering block (~L10104).

**Goal:** Extract the tabs array into a `visibleTabs` derivation that filters down to My Work only when impersonating. Add the Team tab as owner-only.

### Step 1: Refactor the tabs block to use visibleTabs

**`old_string`:**
```js
          <div data-tour="view-tabs" style={{ display: 'flex', gap: 2, padding: 2, background: TOK.bg, borderRadius: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'my-work', label: 'My Work', icon: <UserCircle size={12} /> },
              { id: 'mindmap', label: 'Mind map', icon: <MapIcon size={12} /> },
              { id: 'outline', label: 'Outline', icon: <ListIcon size={12} /> },
              { id: 'gantt', label: 'Gantt', icon: <BarChart3 size={12} /> },
              { id: 'dashboard', label: 'Dashboard', icon: <Home size={12} /> },
              { id: 'decisions', label: 'Decisions', icon: <CheckCircle2 size={12} />, count: (project?.decisions?.length || 0) },
              { id: 'actions', label: 'Actions', icon: <Activity size={12} />, count: (project?.actionItems?.length || 0) },
              { id: 'aggregation', label: 'Aggregation', icon: <Activity size={12} /> },
              { id: 'activity', label: 'Activity', icon: <Activity size={12} /> },
              ...(isOwner ? [{ id: 'portfolio', label: 'Portfolio', icon: <Home size={12} />, ownerOnly: true }] : []),
              ...(isOwner ? [{ id: 'credit-report', label: 'Credits', icon: <Activity size={12} />, ownerOnly: true }] : []),
            ].map((v) => (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 6,
                border: 'none', background: view === v.id ? TOK.surface : 'transparent',
                color: v.ownerOnly ? TOK.accent : TOK.ink, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                boxShadow: view === v.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }} title={v.ownerOnly ? 'Workspace owner only' : undefined}>{v.icon}{v.label}{v.count > 0 && <span style={{ fontSize: 10, color: TOK.muted, fontWeight: 400 }}>·{v.count}</span>}</button>
            ))}
          </div>
```

**`new_string`:**
```js
          <div data-tour="view-tabs" style={{ display: 'flex', gap: 2, padding: 2, background: TOK.bg, borderRadius: 8, flexWrap: 'wrap' }}>
            {(() => {
              const allTabs = [
                { id: 'my-work', label: 'My Work', icon: <UserCircle size={12} /> },
                { id: 'mindmap', label: 'Mind map', icon: <MapIcon size={12} /> },
                { id: 'outline', label: 'Outline', icon: <ListIcon size={12} /> },
                { id: 'gantt', label: 'Gantt', icon: <BarChart3 size={12} /> },
                { id: 'dashboard', label: 'Dashboard', icon: <Home size={12} /> },
                { id: 'decisions', label: 'Decisions', icon: <CheckCircle2 size={12} />, count: (project?.decisions?.length || 0) },
                { id: 'actions', label: 'Actions', icon: <Activity size={12} />, count: (project?.actionItems?.length || 0) },
                { id: 'aggregation', label: 'Aggregation', icon: <Activity size={12} /> },
                { id: 'activity', label: 'Activity', icon: <Activity size={12} /> },
                ...(isOwner ? [{ id: 'portfolio', label: 'Portfolio', icon: <Home size={12} />, ownerOnly: true }] : []),
                ...(isOwner ? [{ id: 'credit-report', label: 'Credits', icon: <Activity size={12} />, ownerOnly: true }] : []),
                ...(isOwner ? [{ id: 'team-overview', label: 'Team', icon: <Users size={12} />, ownerOnly: true }] : []),
              ];
              // v30 Phase 3 — during impersonation, only My Work tab is visible.
              const visibleTabs = impersonatingAs ? allTabs.filter((t) => t.id === 'my-work') : allTabs;
              return visibleTabs.map((v) => (
                <button key={v.id} onClick={() => setView(v.id)} style={{
                  fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 6,
                  border: 'none', background: view === v.id ? TOK.surface : 'transparent',
                  color: v.ownerOnly ? TOK.accent : TOK.ink, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  boxShadow: view === v.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }} title={v.ownerOnly ? 'Workspace owner only' : undefined}>{v.icon}{v.label}{v.count > 0 && <span style={{ fontSize: 10, color: TOK.muted, fontWeight: 400 }}>·{v.count}</span>}</button>
              ));
            })()}
          </div>
```

### Step 2: Build + lint verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors. `Users` icon now referenced; `impersonatingAs` referenced. Some unused-vars (`effectiveAuthor`, `startImpersonation`, `clearImpersonation`) still flagged until later tasks. Acceptable.

### Step 3: Commit

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(team): Team tab in TABS + impersonation tab filter

Phase 3 step 4/8. The tab strip extracts to an IIFE that builds the
full tab list (now including team-overview as the third owner-only
tab after Portfolio and Credits) and filters to My Work only when
impersonatingAs is set. Non-impersonation behavior unchanged.

Team view itself lands in step 7. Wiring of team-overview into the
render switch lands in step 8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: ImpersonationBanner component + render in App

**Files:** Modify `src/App.jsx` — insert new component near other UI primitives (e.g., near `SummaryCard` at ~L7684 area, or between existing top-of-file components). Render in App's JSX before the tab bar.

**Goal:** Sticky banner above the tab bar when `impersonatingAs` is set. Shows "🎭 Viewing as <member>", explains audit prefix, includes Exit button.

### Step 1: Insert ImpersonationBanner component near other top-of-App primitives

Insert immediately before the `SummaryCard` function definition for locality.

Use `Edit`:

**`old_string`:**
```js
function SummaryCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8, padding: 12,
    }}>
      <div style={{ fontSize: 11, color: TOK.muted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: accent || TOK.ink, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: TOK.subtle }}>{sub}</div>
    </div>
  );
}
```

**`new_string`:**
```js
function SummaryCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8, padding: 12,
    }}>
      <div style={{ fontSize: 11, color: TOK.muted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: accent || TOK.ink, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: TOK.subtle }}>{sub}</div>
    </div>
  );
}

// v30 Phase 3 — Sticky banner shown when owner is impersonating a member.
// Signals the impersonated identity, reminds of the audit format, and
// offers a single Exit button.
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
          Actions will log as "acting as {actingAs}: ...". Signed in: {realAuthor}.
        </span>
      </div>
      <Btn size="sm" variant="primary" onClick={onExit}>Exit impersonation</Btn>
    </div>
  );
}
```

### Step 2: Render ImpersonationBanner in App's JSX immediately before the tab bar

Find the structure: the tab bar is inside the top-of-app element. We want the banner to render ABOVE the tab bar so it's sticky/visible during impersonation.

The cleanest anchor: render right before the `<div data-tour="view-tabs" ...>` block. Find where that element opens.

Looking at the file, the tab bar appears inside a flex container. The element just before it is typically a `<Btn ... title="Open project switcher" ...>` or similar. Use the unique opening of the tab bar as the anchor target.

**`old_string`:**
```js
          <div data-tour="view-tabs" style={{ display: 'flex', gap: 2, padding: 2, background: TOK.bg, borderRadius: 8, flexWrap: 'wrap' }}>
            {(() => {
              const allTabs = [
```

Apply `Edit` with the SAME `old_string` and a `new_string` that prepends the banner. But the banner needs to render outside this tab bar container, ideally before the row that contains the tab bar.

Actually a simpler approach: insert the banner block at the very top of the main app's outermost render (right inside the outermost `<div>` of the App's return). Locate the existing `<Toast toast=...>` rendering for a reference point — the Toast renders at the bottom. We want the banner at the top.

Locate the first child of the outermost App `<div>`. The cleanest visible anchor is the `<style>` block (CSS injection) immediately followed by the main wrapper `<div>`. Search for this:

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && grep -n "fontFamily: FONT_STACK, color: TOK.ink, background: TOK.bg, fontSize: 13, position: 'relative'" src/App.jsx
```

That uniquely identifies the outermost `<div>` of App's return.

Once you have the line, read the next 5 lines to find where the first child element begins. Typically it's something like a Members modal conditional or the top header bar.

**Recommended Edit anchor**: find the line immediately after the outermost `<div>` opens — typically there's a header element or the top toolbar. Place the banner conditional just before that first element. Read the file to confirm exact text before applying Edit.

For the Edit operation, use this anchor pattern (you'll need to adjust based on what's actually there):

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && grep -n "position: 'relative'" src/App.jsx
```

Once located, read 10 lines after to capture the unique start of the first child. Then construct an Edit whose `old_string` = the opening of that child element and `new_string` = `{impersonatingAs && <ImpersonationBanner ... />}` followed by the original opening.

**Suggested concrete approach for the subagent executing this task:**

```
1. Read lines around `position: 'relative'` to locate the outermost App div
2. Identify the first child element (likely the top-bar div)
3. Build Edit with old_string = the opening of that first child element verbatim
   and new_string prepends: {impersonatingAs && (
     <ImpersonationBanner
       actingAs={impersonatingAs}
       realAuthor={author}
       onExit={clearImpersonation}
     />
   )}
```

If the structure is unclear, fall back to: insert the banner inside the same `<div>` that contains the tab bar, on its own row above the tab bar.

### Step 3: Build + lint verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors.

### Step 4: Commit

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(team): ImpersonationBanner component + sticky render in App

Phase 3 step 5/8. New component renders a sticky banner with the
acting-as identity, the audit format reminder ("Actions will log
as 'acting as <name>: ...'"), and a primary Exit button.

Rendered at the top of the App container only when impersonatingAs
is set. clearImpersonation handler from step 3 wired here.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `computeTeamOverview` + `getLastActivityForMember` helpers

**Files:** Modify `src/App.jsx` — insert helpers just before `MyWorkView` (~L8096) for locality with `computeMyWork`.

**Goal:** Two pure functions that aggregate per-member workload metrics. `getLastActivityForMember` walks all task updates + check-ins + action updates to find the latest. `computeTeamOverview` calls `computeMyWork` per member and packages metrics.

### Step 1: Insert both helpers before MyWorkView

Find the line just before `function MyWorkView({`. Insert two new functions.

**`old_string`:**
```js
function MyWorkView({
  projects, author, isOwner, userPrefs, teamMembers,
```

**`new_string`:**
```js
// v30 Phase 3 — Walk every task/check-in/update + action comment to find
// the latest entry authored by member. Returns { ts, t, description } or null.
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
        for (const tk of (ws.tasks || [])) {
          for (const upd of (tk.updates || [])) {
            if (upd.author === member.name) consider(upd.timestamp, `Posted update on "${tk.name}"`);
          }
          for (const ci of (tk.checkIns || [])) {
            if (ci.author === member.name) consider(ci.timestamp, `Posted check-in on "${tk.name}"`);
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

// v30 Phase 3 — Per-member workload aggregation. Reuses computeMyWork
// (isOwner=false so deadline_approval items don't leak into member counts).
function computeTeamOverview(projects, members) {
  return (members || []).map((m) => {
    const myWork = computeMyWork(m.name, projects, false, null);
    const tasksOwned = myWork.tasksOwned.today.length + myWork.tasksOwned.week.length + myWork.tasksOwned.later.length;
    const actionItemsOpen = myWork.actionItems.today.length + myWork.actionItems.week.length + myWork.actionItems.later.length;
    const tasksOverdue = myWork.needsAttention.filter((it) =>
      it.kind === 'overdue_task' || it.kind === 'overdue_action' || it.kind === 'overdue_subtask'
    ).length;
    return {
      member: m,
      tasksOwned,
      tasksOverdue,
      tasksContributing: myWork.tasksContributing.length,
      actionItemsOpen,
      credit: myWork.credit,
      lastActivity: getLastActivityForMember(m, projects),
    };
  });
}

function MyWorkView({
  projects, author, isOwner, userPrefs, teamMembers,
```

### Step 2: Build + lint verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors. Both helpers will be flagged as unused until Task 7 consumes them. Acceptable.

### Step 3: Commit

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(team): add computeTeamOverview + getLastActivityForMember helpers

Phase 3 step 6/8. Pure functions used by TeamOverviewView in step 7.
computeTeamOverview iterates teamMembers, calls computeMyWork per
member (with isOwner=false so deadline_approval items stay scoped to
the real workspace owner), and packages workload metrics +
lastActivity. getLastActivityForMember walks task updates/check-ins
and action comments to find the latest entry the member authored.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `MemberOverviewRow` + `TeamOverviewView` components

**Files:** Modify `src/App.jsx` — insert two new components after `getLastActivityForMember`/`computeTeamOverview` (i.e., before `MyWorkView`). Place `MemberOverviewRow` first since `TeamOverviewView` consumes it.

**Goal:** Owner-only view: 4 summary cards, sort controls, per-member rows, Excel export.

### Step 1: Insert MemberOverviewRow + TeamOverviewView before MyWorkView

**`old_string`:**
```js
function MyWorkView({
  projects, author, isOwner, userPrefs, teamMembers,
```

**`new_string`:**
```js
// v30 Phase 3 — One row per team member showing workload metrics and
// last activity. "(you)" badge on self; View-as button hidden for self.
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

// v30 Phase 3 — Owner-only Team Overview view.
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
          for (const tk of (ws.tasks || [])) {
            if (tk.deadlineRequest) pendingApprovals++;
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
              Team Overview <span style={{ color: TOK.accent, fontSize: 11, fontWeight: 400, marginLeft: 6 }}>[OWNER ONLY]</span>
            </h2>
            <div style={{ fontSize: 12, color: TOK.muted, marginTop: 2 }}>
              Workload, activity, and credit attribution for all team members.
            </div>
          </div>
          <Btn size="sm" onClick={exportExcel}><FileSpreadsheet size={11} /> Export Excel</Btn>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Active members" value={summary.activeMembers} />
          <SummaryCard label="Open action items" value={summary.totalOpenActions} />
          <SummaryCard label="Overdue across team" value={summary.totalOverdue} accent={summary.totalOverdue > 0 ? TOK.overdueFg : null} />
          <SummaryCard label="Pending approvals" value={summary.pendingApprovals} accent={summary.pendingApprovals > 0 ? TOK.inprogFg : null} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, color: TOK.muted, flexWrap: 'wrap' }}>
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

function MyWorkView({
  projects, author, isOwner, userPrefs, teamMembers,
```

### Step 2: Build + lint verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors. `TeamOverviewView` flagged as unused until Task 8 wires it. `MemberOverviewRow` is referenced inside `TeamOverviewView`, so not unused. `computeTeamOverview` + `getLastActivityForMember` references resolved. Total warnings should be 24 + 1 (TeamOverviewView) = 25.

### Step 3: Commit

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(team): TeamOverviewView + MemberOverviewRow components

Phase 3 step 7/8. Owner-only Team Overview view: 4 summary cards
(Active members / Open action items / Overdue across team / Pending
approvals), 5-way sort controls (Overdue first / Name / Open tasks /
Credit earned / Last activity), per-member rows with 4 metric chips +
credit progress + last activity + View-as button (self row gets a
"(you)" badge instead of the button), and Excel export.

TeamOverviewView gets wired into the render switch in step 8 and
receives onImpersonate = startImpersonation from step 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire `team-overview` into render switch + update MyWorkView render call

**Files:** Modify `src/App.jsx` — main render switch (~L10231-10257 area) + MyWorkView render call (~L10192).

**Goal:** Render `TeamOverviewView` for `view === 'team-overview' && isOwner && !impersonatingAs`; show owner-only message for non-owners. Update `MyWorkView` render call to use `effectiveAuthor`, gate `isOwner`, gate `onMarkSeen`, pass `impersonatingAs` to handlers via `actingAs` parameter, and route Create-action flow with `defaultPic = effectiveAuthor`.

### Step 1: Add team-overview branches in render switch

Find the existing owner-only conditional blocks (Portfolio + Credits). Insert team-overview branches after them.

**`old_string`:**
```js
              {view === 'credit-report' && isOwner && (
                <CreditReportView projects={projects} isOwner={isOwner} />
              )}
              {view === 'credit-report' && !isOwner && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOK.muted, fontSize: 13 }}>
                  Credit report is workspace-owner only.
                </div>
              )}
```

**`new_string`:**
```js
              {view === 'credit-report' && isOwner && (
                <CreditReportView projects={projects} isOwner={isOwner} />
              )}
              {view === 'credit-report' && !isOwner && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOK.muted, fontSize: 13 }}>
                  Credit report is workspace-owner only.
                </div>
              )}
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

### Step 2: Update MyWorkView render call to use effectiveAuthor + actingAs

**`old_string`:**
```js
                <MyWorkView
                  projects={projects}
                  author={author}
                  isOwner={isOwner}
                  userPrefs={userPrefs}
                  teamMembers={teamMembers}
                  onTaskClick={async (taskId, projectId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setSelectedTaskId(taskId);
                    setView('outline');
                  }}
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
                  onDecisionClick={async (projectId, decisionId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setView('decisions');
                    if (decisionId) setInitialDecisionEditId(decisionId);
                  }}
                  onDecisionUpdate={(updatedDecision, projectId) => applyDecisionUpdate(updatedDecision, projectId, 'My Work')}
                  onTaskUpdate={(updatedTask, projectId) => applyTaskUpdate(updatedTask, projectId, 'My Work')}
                  onActionUpdate={(updatedAction, projectId) => applyActionUpdate(updatedAction, projectId, 'My Work')}
                  onApproveDeadline={myWorkApproveDeadline}
                  onRejectDeadline={myWorkRejectDeadline}
                  onMarkSeen={markMyWorkSeen}
                  showToast={showToast}
                />
```

**`new_string`:**
```js
                <MyWorkView
                  projects={projects}
                  author={effectiveAuthor}
                  isOwner={isOwner && !impersonatingAs}
                  userPrefs={userPrefs}
                  teamMembers={teamMembers}
                  onTaskClick={async (taskId, projectId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setSelectedTaskId(taskId);
                    setView('outline');
                  }}
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
                    defaultPic: effectiveAuthor,
                  })}
                  onDecisionClick={async (projectId, decisionId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setView('decisions');
                    if (decisionId) setInitialDecisionEditId(decisionId);
                  }}
                  onDecisionUpdate={(updatedDecision, projectId) => applyDecisionUpdate(updatedDecision, projectId, 'My Work', impersonatingAs || '')}
                  onTaskUpdate={(updatedTask, projectId) => applyTaskUpdate(updatedTask, projectId, 'My Work', impersonatingAs || '')}
                  onActionUpdate={(updatedAction, projectId) => applyActionUpdate(updatedAction, projectId, 'My Work', impersonatingAs || '')}
                  onApproveDeadline={impersonatingAs ? null : myWorkApproveDeadline}
                  onRejectDeadline={impersonatingAs ? null : myWorkRejectDeadline}
                  onMarkSeen={impersonatingAs ? null : markMyWorkSeen}
                  showToast={showToast}
                />
```

### Step 3: Update ActionCreateModal render to pass defaultPic + actingAs through createActionFromMyWork

Find the ActionCreateModal render block.

**`old_string`:**
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
```

**`new_string`:**
```js
        {actionCreate && (
          <ActionCreateModal
            projects={projects}
            defaultProjectId={actionCreate.projectId}
            defaultRelatedTaskId={actionCreate.relatedTaskId}
            author={author}
            defaultPic={actionCreate.defaultPic || null}
            teamMembers={teamMembers}
            onClose={() => setActionCreate(null)}
            onCreate={(newAction, projectId) => createActionFromMyWork(newAction, projectId, impersonatingAs || '')}
          />
        )}
```

### Step 4: Build verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`, 0 errors.

### Step 5: Lint verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors, 24 warnings` — back to baseline. All previously-unused identifiers (`Users`, `effectiveAuthor`, `startImpersonation`, `clearImpersonation`, `TeamOverviewView`, `computeTeamOverview`, `getLastActivityForMember`, `MemberOverviewRow`, `ImpersonationBanner`) now referenced.

### Step 6: Verify all wiring with a grep

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && grep -n "impersonatingAs\|effectiveAuthor\|TeamOverviewView\|ImpersonationBanner" src/App.jsx | head -30
```

Expected: at least 1 occurrence each, with `impersonatingAs` appearing in multiple contexts (state, render switch, tab filter, MyWorkView props, modal render).

### Step 7: Commit

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(team): wire team-overview render + impersonation flows in MyWorkView

Phase 3 step 8/8. Final wiring:
- team-overview render switch: TeamOverviewView for owner+!impersonating;
  "Team overview is workspace-owner only." message for non-owners.
- MyWorkView render call passes effectiveAuthor (impersonatingAs ||
  author), gates isOwner to false during impersonation, gates
  onApproveDeadline/onRejectDeadline/onMarkSeen to null during
  impersonation (don't update owner-state on member's behalf), and
  passes impersonatingAs to apply* handlers via actingAs param.
- onCreateAction stores defaultPic = effectiveAuthor; ActionCreateModal
  receives defaultPic and createActionFromMyWork gets actingAs.

Owner clicks "View as →" on a member row → My Work shows that member's
desk, all actions log as "acting as <name>: ..." and any inline edits
land on the member, not the owner.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Manual smoke test (user-driven, no code)

**Files:** None. Verify against spec's 23-item checklist.

- [ ] **Step 1: Start dev server (if not already running)**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run dev
```

Open `http://localhost:5173/` in browser.

- [ ] **Step 2: Walk the 23-item checklist from the spec**

For each item below, verify pass/fail. Spec section "Testing checklist" has full details.

| # | Test |
|---:|---|
| 1 | Team tab visible only to owner |
| 2 | Summary cards correct counts |
| 3 | Per-member row counts derived from computeMyWork |
| 4 | Empty member shows "🌱 No assignments yet" |
| 5 | Sort by overdue (default) — most overdue at top |
| 6 | Sort by name/tasks/credit/activity works |
| 7 | Excel export downloads file with all member columns |
| 8 | View as impersonation — banner + tab filter + computeMyWork shows member's work |
| 9 | Inline edit during impersonation → activity entry has "acting as" prefix + "(from My Work)" suffix |
| 10 | Create action during impersonation → action's pic is impersonated user |
| 11 | markMyWorkSeen skipped during impersonation — member's lastSeenMyWorkAt not updated |
| 12 | Owner-only deadline approve/reject buttons hidden during impersonation |
| 13 | Exit impersonation → tab nav restored, on My Work view |
| 14 | Auto-clear on refresh → impersonation cleared |
| 15 | Phase 1-2 flows unchanged (no "acting as" prefix when not impersonating) |
| 16 | Phase A.1 create-action without impersonation: PIC defaults to author |
| 17 | Phase A.2 decision status pill without impersonation: activity entry plain |
| 18 | Phase B sub-tasks without impersonation: activity entries plain |
| 19 | ActionItemsView edit form save does NOT prefix with "acting as" |
| 20 | Member with email but no work shows name + email + empty message |
| 21 | Member with no email shows name only |
| 22 | Owner self-row has "(you)" badge, no View-as button |
| 23 | Activity Dashboard group-by-PIC correctly attributes impersonated edits to real author |

- [ ] **Step 3: If smoke test fails, file follow-up note in spec**

Add a `## Smoke test results` section to the spec describing what failed.

- [ ] **Step 4: If all 23 pass, tag**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git tag -a v30-phase-3 -m "v30 Phase 3: Team Overview tab + impersonation"
```

---

## Self-review pass

**Spec coverage:**

| Spec section | Task |
|---|---|
| Goal 1: Team tab owner-only | Task 4 (TABS entry), Task 8 (render switch) |
| Goal 2: Per-member row | Task 7 (MemberOverviewRow) |
| Goal 3: Summary cards | Task 7 (TeamOverviewView summary block) |
| Goal 4: Sort options | Task 7 (sort controls in TeamOverviewView) |
| Goal 5: Excel export | Task 7 (exportExcel function) |
| Goal 6: Full edit impersonation | Tasks 3 (state) + 8 (MyWorkView wiring) |
| Goal 7: Audit "acting as <name>: ..." prefix | Tasks 1 (all apply* helpers prepend) |
| Goal 8: Sticky banner + tab filter | Tasks 4 (filter) + 5 (banner) |
| Goal 9: Auto-clear on refresh | Task 3 (state declared with useState, no persistence) |
| Critical pitfall 1: activity.author stays real user | Task 1 — wrapper modifies description, not author |
| Critical pitfall 2: isOwner false during impersonation | Task 8 (MyWorkView prop) |
| Critical pitfall 3: markMyWorkSeen skip | Task 8 (`impersonatingAs ? null : markMyWorkSeen`) |
| Critical pitfall 4: PIC default = effectiveAuthor | Task 8 (defaultPic) + Task 2 (ActionCreateModal uses effectivePic) |
| Critical pitfall 5: all 4 apply* gain actingAs | Task 1 (all 4 in one commit) |
| Critical pitfall 6: tab .filter() | Task 4 (filter, not disabled) |
| Critical pitfall 7: no persistence | Task 3 (no save to meta) |
| Critical pitfall 8: O(N×M) accepted | Task 6 (no batching) |
| Critical pitfall 9: "Active members" definition | Task 7 (`tasksOwned + actionItemsOpen + tasksContributing > 0`) |
| Critical pitfall 10: computeMyWork(name, ..., false, null) | Task 6 (isOwner: false) |

All 23 testing items covered by Task 9.

**Placeholder scan:** Task 5 Step 2 has procedural guidance ("Locate the line immediately after the outermost div opens...") rather than a concrete Edit, because the exact anchor depends on the current top-of-App JSX structure which I haven't fully traced. This is intentional — the executor reads + locates the anchor, then applies Edit. Not a placeholder for missing logic; the banner code itself is fully concrete.

**Type consistency:**
- `actingAs` parameter — 4 occurrences in Task 1, consumed correctly in Task 8 (passed `impersonatingAs || ''`)
- `effectiveAuthor` — declared in Task 3, consumed in Task 8 (MyWorkView prop, ActionCreateModal defaultPic)
- `defaultPic` — declared in Task 2 (ActionCreateModal prop), consumed in Task 8 (modal render `defaultPic={actionCreate.defaultPic}`)
- `onImpersonate` — TeamOverviewView prop in Task 7, consumed via `startImpersonation` in Task 8
- `actionCreate.defaultPic` — new field added by Task 8 (`{ projectId, relatedTaskId, defaultPic }`); ActionCreateModal reads it in Task 2 via the new `defaultPic` prop

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-team-overview-phase-3.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, commit per task. Same approach as previous phases.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Either approach stops after Task 8's commit. Task 9 (smoke test) is user-driven.
