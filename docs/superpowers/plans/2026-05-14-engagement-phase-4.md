# Phase 4 — Engagement Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner-set workspace default view + per-user override (both via user menu) + badge count on My Work tab.

**Architecture:** Single-file React (`src/App.jsx`). Three additions: a module-level `DEFAULT_VIEW_OPTIONS` constant, three new App-scope hooks/callbacks (`myWorkBadge` useMemo + two setters), and two new user-menu sections plus a badge span in the tab strip. No new components. No schema changes.

**Tech Stack:** React 18.3, Vite 5.4, lucide-react. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-14-engagement-phase-4.md`

**Test workflow:** No test runner. Verification per task = `npm run build` + `npx eslint src/App.jsx`. Manual smoke test at end.

---

## File structure

Only one file modified:

| File | Role |
|---|---|
| `src/App.jsx` (current 11536 lines) | All Phase 4 changes. Will grow ~110 lines to ~11650. |

Logical units touched:

1. **Module-level constants (~L72-76 area)** — add `DEFAULT_VIEW_OPTIONS`
2. **`App()` derived state (~L9699)** — add `myWorkBadge` useMemo right after `userPrefs`
3. **`App()` callbacks (~L9700 area)** — add `setWorkspaceDefaultView` + `setPersonalDefaultOverride` near other meta-writing callbacks (e.g., near `markMyWorkSeen`)
4. **User menu dropdown (~L10720)** — insert 2 new sections between Workspace Owner block and Sign Out button
5. **Tab strip render (~L10405)** — insert badge span inside the My Work tab's button content

---

## Task 1: Module-level constant + App-scope helpers

**Files:** Modify `src/App.jsx` — top-of-file constants + inside `App()`.

**Goal:** Add `DEFAULT_VIEW_OPTIONS` (the 7-entry list of valid default views), the `myWorkBadge` useMemo, and the two setter callbacks.

### Step 1: Add `DEFAULT_VIEW_OPTIONS` near other top-of-file constants

Insert right after `DEFAULT_DEPARTMENTS` (~L76).

Use `Edit`:

**`old_string`:**
```js
const DEFAULT_DEPARTMENTS = ['HR', 'QA', 'GA', 'Legal', 'IT', 'FIN', 'AF', 'BOD'];
```

**`new_string`:**
```js
const DEFAULT_DEPARTMENTS = ['HR', 'QA', 'GA', 'Legal', 'IT', 'FIN', 'AF', 'BOD'];

// v30 Phase 4 — Views eligible to be the workspace/personal default landing
// view. Owner-only views (portfolio, credit-report, team-overview) excluded
// because non-owners can't land on them. Per-project views with potentially
// empty data (decisions, actions) also excluded to avoid landing on empty
// screens.
const DEFAULT_VIEW_OPTIONS = [
  { id: 'my-work', label: 'My Work' },
  { id: 'mindmap', label: 'Mind map' },
  { id: 'outline', label: 'Outline' },
  { id: 'gantt', label: 'Gantt' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'aggregation', label: 'Aggregation' },
  { id: 'activity', label: 'Activity Dashboard' },
];
```

### Step 2: Add `myWorkBadge` useMemo right after `userPrefs`

Find the existing `userPrefs` useMemo and insert immediately after. (`userPrefs` is at L9701; the resolution effect at L9706-9711 comes after — insert between them.)

**`old_string`:**
```js
  // v30 — per-user preferences (lastSeenMyWorkAt, defaultViewOverride, etc.)
  // meta.userPreferences is optional; default to {} so legacy workspaces just work.
  const userPrefs = useMemo(
    () => (author ? (meta?.userPreferences?.[author] || {}) : {}),
    [meta, author]
  );

  // Resolve landing view once meta + author are ready. Fallback chain:
  // personal override → workspace default → 'my-work' (the new v30 default).
  useEffect(() => {
    if (view !== null || !meta || !author) return;
    setView(userPrefs?.defaultViewOverride || meta?.defaultView || 'my-work');
  }, [meta, author, view, userPrefs]);
```

**`new_string`:**
```js
  // v30 — per-user preferences (lastSeenMyWorkAt, defaultViewOverride, etc.)
  // meta.userPreferences is optional; default to {} so legacy workspaces just work.
  const userPrefs = useMemo(
    () => (author ? (meta?.userPreferences?.[author] || {}) : {}),
    [meta, author]
  );

  // v30 Phase 4 — Badge count on the My Work tab. needsAttention always
  // counted; unreadMentions only counted after the user's first visit
  // (lastSeenMyWorkAt is set) to avoid scary backlog badges on new members.
  const myWorkBadge = useMemo(() => {
    if (!author) return 0;
    const w = computeMyWork(author, projects, isOwner, userPrefs?.lastSeenMyWorkAt);
    const hasVisited = !!userPrefs?.lastSeenMyWorkAt;
    return w.needsAttention.length + (hasVisited ? w.unreadMentions.length : 0);
  }, [projects, author, isOwner, userPrefs]);

  // Resolve landing view once meta + author are ready. Fallback chain:
  // personal override → workspace default → 'my-work' (the new v30 default).
  useEffect(() => {
    if (view !== null || !meta || !author) return;
    setView(userPrefs?.defaultViewOverride || meta?.defaultView || 'my-work');
  }, [meta, author, view, userPrefs]);
```

### Step 3: Add `setWorkspaceDefaultView` + `setPersonalDefaultOverride` after `markMyWorkSeen`

Find the closing `}, [author]);` of `markMyWorkSeen` and insert after it.

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

  // v30 Phase 4 — Owner picks the workspace-wide default landing view.
  // Writes meta.defaultView. Defense-in-depth: also guard at handler.
  const setWorkspaceDefaultView = useCallback(async (viewId) => {
    if (!isOwner) return;
    setMeta((m) => {
      if (!m) return m;
      const m2 = { ...m, defaultView: viewId };
      saveMeta(m2);
      return m2;
    });
    const label = DEFAULT_VIEW_OPTIONS.find((o) => o.id === viewId)?.label || viewId;
    showToast(`Workspace default set to "${label}"`);
  }, [isOwner]);

  // v30 Phase 4 — Per-user override. Pass null to clear and fall back to
  // workspace default on next app load.
  const setPersonalDefaultOverride = useCallback(async (viewId) => {
    if (!author) return;
    setMeta((m) => {
      if (!m) return m;
      const prefs = m.userPreferences || {};
      const m2 = {
        ...m,
        userPreferences: {
          ...prefs,
          [author]: { ...(prefs[author] || {}), defaultViewOverride: viewId || null },
        },
      };
      saveMeta(m2);
      return m2;
    });
    if (viewId) {
      const label = DEFAULT_VIEW_OPTIONS.find((o) => o.id === viewId)?.label || viewId;
      showToast(`Your personal default: "${label}"`);
    } else {
      showToast(`Cleared personal override (will follow workspace default)`);
    }
  }, [author]);
```

### Step 4: Build + lint verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors. Warnings: 24 baseline + new unused-vars for `myWorkBadge`, `setWorkspaceDefaultView`, `setPersonalDefaultOverride` (they'll be consumed in Tasks 2 and 3). `DEFAULT_VIEW_OPTIONS` is used inside both setters so it shouldn't flag as unused.

### Step 5: Commit

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(engagement): DEFAULT_VIEW_OPTIONS + myWorkBadge + default-view setters

Phase 4 step 1/3. Foundation pieces:
- DEFAULT_VIEW_OPTIONS module-level constant — 7 publicly-visible
  views eligible to be a default landing (owner-only and per-project
  potentially-empty views excluded).
- myWorkBadge useMemo at App scope — computes needsAttention +
  unreadMentions (gated by first-visit). Consumed by tab strip in
  step 3.
- setWorkspaceDefaultView (owner-only) writes meta.defaultView.
- setPersonalDefaultOverride (per-user) writes
  meta.userPreferences[author].defaultViewOverride; null clears.

User-menu UI lands in step 2, tab badge in step 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Guardrails

- Modify ONLY src/App.jsx
- No destructive git operations

## Report

Status, commit SHA, build + lint outcome.

---

## Task 2: User-menu sections (default view + personal override)

**Files:** Modify `src/App.jsx` — user menu dropdown (~L10720, just before the Sign Out button).

**Goal:** Two new sections, each in its own bordered block:
1. Default landing view (workspace-wide) — `<select>` for owner, read-only label for non-owner
2. My personal override — `<select>` with "Use workspace default" + 7 view options

### Step 1: Insert the two sections before the Sign Out button

Locate the Sign Out button — anchor is the `<button onClick={signOut} ...>` line. The two new `<div>` sections go immediately before it.

**`old_string`:**
```js
                {(meta?.ownershipLog || []).length > 0 && (
                  <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 6 }}>{(meta?.ownershipLog || []).length} change{(meta?.ownershipLog || []).length === 1 ? '' : 's'} logged</div>
                )}
              </div>
              <button
                onClick={signOut}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '10px 14px', fontSize: 13,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontFamily: FONT_STACK, color: TOK.overdueFg, textAlign: 'left',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <ArrowRightLeft size={13} /> Sign out
              </button>
```

**`new_string`:**
```js
                {(meta?.ownershipLog || []).length > 0 && (
                  <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 6 }}>{(meta?.ownershipLog || []).length} change{(meta?.ownershipLog || []).length === 1 ? '' : 's'} logged</div>
                )}
              </div>
              {/* v30 Phase 4 — Default landing view (workspace-wide, owner-set) */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + TOK.line, fontSize: 12 }}>
                <div style={{ fontSize: 10, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  Default landing view
                </div>
                {isOwner ? (
                  <>
                    <select
                      value={meta?.defaultView || 'my-work'}
                      onChange={(e) => setWorkspaceDefaultView(e.target.value)}
                      style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, marginBottom: 4 }}>
                      {DEFAULT_VIEW_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <div style={{ fontSize: 10.5, color: TOK.muted }}>Workspace-wide. Members can override their own below.</div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: TOK.ink }}>
                    {DEFAULT_VIEW_OPTIONS.find((o) => o.id === meta?.defaultView)?.label || 'My Work'}
                    <span style={{ color: TOK.muted, fontWeight: 400, marginLeft: 6 }}>(set by owner)</span>
                  </div>
                )}
              </div>
              {/* v30 Phase 4 — Personal override (per-user) */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + TOK.line, fontSize: 12 }}>
                <div style={{ fontSize: 10, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  My personal override
                </div>
                <select
                  value={userPrefs?.defaultViewOverride || ''}
                  onChange={(e) => setPersonalDefaultOverride(e.target.value || null)}
                  style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, marginBottom: 4 }}>
                  <option value="">(Use workspace default)</option>
                  {DEFAULT_VIEW_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <div style={{ fontSize: 10.5, color: TOK.muted }}>Applies on your next app load.</div>
              </div>
              <button
                onClick={signOut}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '10px 14px', fontSize: 13,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontFamily: FONT_STACK, color: TOK.overdueFg, textAlign: 'left',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <ArrowRightLeft size={13} /> Sign out
              </button>
```

### Step 2: Build + lint verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors. `setWorkspaceDefaultView` and `setPersonalDefaultOverride` now referenced. `myWorkBadge` still unused until Task 3. Warning count back near baseline.

### Step 3: Commit

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(engagement): user-menu sections for workspace + personal default view

Phase 4 step 2/3. Two new sections inside the user-menu dropdown,
inserted between the Workspace Owner block and Sign Out:
- "Default landing view" — select for owner; read-only label for
  members ("X (set by owner)").
- "My personal override" — select with "(Use workspace default)"
  sentinel as the first option, applied on next app load.

setWorkspaceDefaultView and setPersonalDefaultOverride from step 1
wire up the writes. Toast confirms each change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Guardrails

- Modify ONLY src/App.jsx
- No destructive git operations

## Report

Status, commit SHA, build + lint outcome.

---

## Task 3: Tab strip — render badge on My Work tab

**Files:** Modify `src/App.jsx` — tab strip render (~L10405-10413).

**Goal:** Add a red pill `myWorkBadge` span inside the My Work tab button, only when count > 0.

### Step 1: Edit the tab button render to include the badge

**`old_string`:**
```js
              return visibleTabs.map((v) => (
                <button key={v.id} onClick={() => setView(v.id)} style={{
                  fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 6,
                  border: 'none', background: view === v.id ? TOK.surface : 'transparent',
                  color: v.ownerOnly ? TOK.accent : TOK.ink, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  boxShadow: view === v.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }} title={v.ownerOnly ? 'Workspace owner only' : undefined}>{v.icon}{v.label}{v.count > 0 && <span style={{ fontSize: 10, color: TOK.muted, fontWeight: 400 }}>·{v.count}</span>}</button>
              ));
```

**`new_string`:**
```js
              return visibleTabs.map((v) => (
                <button key={v.id} onClick={() => setView(v.id)} style={{
                  fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 6,
                  border: 'none', background: view === v.id ? TOK.surface : 'transparent',
                  color: v.ownerOnly ? TOK.accent : TOK.ink, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  boxShadow: view === v.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }} title={v.ownerOnly ? 'Workspace owner only' : undefined}>{v.icon}{v.label}{v.id === 'my-work' && myWorkBadge > 0 && (
                  <span style={{
                    marginLeft: 2, padding: '0 6px', borderRadius: 999,
                    background: TOK.overdueFg, color: '#fff', fontSize: 10, fontWeight: 500,
                    lineHeight: '14px', minWidth: 16, textAlign: 'center',
                  }}>{myWorkBadge}</span>
                )}{v.count > 0 && <span style={{ fontSize: 10, color: TOK.muted, fontWeight: 400 }}>·{v.count}</span>}</button>
              ));
```

### Step 2: Build + lint verify

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: green build, 0 errors, **24 warnings (baseline)** — all previously-unused identifiers (`DEFAULT_VIEW_OPTIONS`, `myWorkBadge`, `setWorkspaceDefaultView`, `setPersonalDefaultOverride`) now referenced.

### Step 3: Verify wiring with grep

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && grep -n "myWorkBadge\|DEFAULT_VIEW_OPTIONS\|setWorkspaceDefaultView\|setPersonalDefaultOverride" src/App.jsx | head -15
```

Expected: multiple occurrences across constant definition, useMemo, callbacks, user menu, tab strip.

### Step 4: Commit

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(engagement): badge count on My Work tab

Phase 4 step 3/3. Red pill `myWorkBadge` rendered inside the My Work
tab button when count > 0. Uses TOK.overdueFg background, white text,
small min-width for single-digit consistency. Placed between the
label and the existing legacy "·N" indicator that other tabs use.

Tab strip remains otherwise unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Guardrails

- Modify ONLY src/App.jsx
- No destructive git operations

## Report

Status, commit SHA, build + lint outcome, grep verification output.

---

## Task 4: Manual smoke test (user-driven, no code)

**Files:** None. Verify against spec's 23-item checklist.

- [ ] **Step 1: Start dev server**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run dev
```

Open `http://localhost:5173/` in browser.

- [ ] **Step 2: Walk the 23-item checklist from the spec**

For each item below, verify pass/fail. Full details in spec section "Testing checklist".

| # | Test |
|---:|---|
| 1 | Owner picks workspace default → reload → land on new default |
| 2 | Member sees default as read-only "X (set by owner)" |
| 3 | Member sets personal override → reload → land on override |
| 4 | Member clears personal override → reload → land on workspace default |
| 5 | Two members independent: A with override, B without |
| 6 | Owner changes default cascades to members without override |
| 7 | Brand new workspace → first user lands on My Work (fallback) |
| 8 | No auto-redirect when setting changes (current view stays) |
| 9 | Badge hidden when 0 urgent items |
| 10 | Badge shows for overdue items |
| 11 | Owner badge includes pending approvals |
| 12 | First-visit suppression of mentions (new user, no badge from old @mentions) |
| 13 | Mentions count after first visit + new @mention |
| 14 | Badge updates after data change (mark done) |
| 15 | Badge hidden during impersonation (tab strip filtered to My Work only — badge value irrelevant since not visible to others) |
| 16 | Phase 1 view resolution still works (fallback chain unchanged) |
| 17 | Phase 1 lastSeenMyWorkAt timer still fires |
| 18 | Other tabs unchanged (Decisions/Actions still show ·N count) |
| 19 | Phase A-3 flows unaffected |
| 20 | Owner who is also a member sees BOTH default-view selects |
| 21 | Stale defaultView ID → fallback to 'my-work' |
| 22 | User without email — prefs still work (keyed by display name) |
| 23 | Switching identity → different user's prefs apply |

- [ ] **Step 3: If smoke test fails, file follow-up note in spec**

Add `## Smoke test results` section to the spec describing what failed.

- [ ] **Step 4: If all 23 pass, tag**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git tag -a v30-phase-4 -m "v30 Phase 4: engagement infrastructure (default view + badge)"
```

---

## Self-review pass

**Spec coverage:**

| Spec section | Task |
|---|---|
| Goal 1: Owner workspace default | Task 1 (setWorkspaceDefaultView) + Task 2 (select UI) |
| Goal 2: Personal override | Task 1 (setPersonalDefaultOverride) + Task 2 (select UI) |
| Goal 3: Badge count on My Work tab | Task 1 (myWorkBadge useMemo) + Task 3 (badge render) |
| Goal 4: First-visit gating for mentions | Task 1 (`hasVisited` ternary inside useMemo) |
| Critical pitfall 1: computeMyWork called twice | Task 1 (intentional, documented) |
| Critical pitfall 2: Fallback chain order | Pre-existing in Phase 1 — Task 1 preserves it |
| Critical pitfall 3: Badge gates on userPrefs?.lastSeenMyWorkAt | Task 1 (optional chain + `!!` coercion) |
| Critical pitfall 4: Setters write meta only | Task 1 (no setView calls inside setters) |
| Critical pitfall 5: Owner-only check defense-in-depth | Task 1 (handler guard) + Task 2 (UI conditional) |
| Critical pitfall 6: saveMeta + setMeta sync pattern | Task 1 (functional setMeta + saveMeta) |
| Critical pitfall 7: DEFAULT_VIEW_OPTIONS single source | Task 1 (module-level constant) |
| Critical pitfall 8: First-visit applies to owner too | Task 1 (`!!userPrefs?.lastSeenMyWorkAt` regardless of isOwner) |

All 23 testing items covered by Task 4.

**Placeholder scan:** No placeholders. All code blocks are concrete.

**Type consistency:**
- `myWorkBadge: number` — defined in Task 1, consumed in Task 3 with `myWorkBadge > 0` and `{myWorkBadge}` render
- `setWorkspaceDefaultView(viewId: string)` — defined in Task 1, called in Task 2 (`onChange={(e) => setWorkspaceDefaultView(e.target.value)}`)
- `setPersonalDefaultOverride(viewId: string | null)` — defined in Task 1, called in Task 2 (`onChange={(e) => setPersonalDefaultOverride(e.target.value || null)}` — `""` coerces to `null`)
- `DEFAULT_VIEW_OPTIONS: Array<{ id, label }>` — used in setter toasts (Task 1) and select options (Task 2)

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-14-engagement-phase-4.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, commit per task. Same proven pattern.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Either approach stops after Task 3's commit. Task 4 (smoke test) is user-driven.
