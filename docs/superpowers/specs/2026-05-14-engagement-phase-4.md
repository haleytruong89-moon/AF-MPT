# Phase 4 — Engagement infrastructure (default view + badge count)

**Date:** 2026-05-14
**App:** AF MTP — extends Phase 1 / 2 / A.1 / A.2 / B / 3
**Status:** Design — pending implementation
**Effort:** ~1.5h in-app

---

## Background

Phase 1 established `meta.defaultView` + `meta.userPreferences[author].defaultViewOverride` reads with a fallback chain in App's view-resolution effect, plus the 5-second `lastSeenMyWorkAt` mark-seen timer. Those reads work today but nothing writes `meta.defaultView` or `defaultViewOverride` — owners can't pick the workspace landing view and individual users can't override it.

The other half of Phase 1's engagement story — surfacing urgency on the My Work tab itself via a badge count — was deferred to Phase 4 too. Today the My Work tab is a plain label whether the user has 0 or 50 things waiting for them.

Phase 4 ships the missing write/render surfaces: a small UI for both view-setting concepts inside the existing user menu, and a red pill badge on the My Work tab whenever the user has overdue items or unread mentions waiting.

The original v30 spec Phase 4 included notification preferences UI (toggles for email digest, browser push). That section is **explicitly skipped here** — Phase 5 backend delivery is out-of-scope, and saving "settings that don't do anything" is misleading UX.

---

## Goals

1. **Owner-set workspace default view** — owner picks the landing view via the user menu; saved to `meta.defaultView`; affects all users who haven't set a personal override
2. **Personal override** — every user can pick their own landing view via the same user menu; saved to `meta.userPreferences[author].defaultViewOverride`; falls back to workspace default when set to "Use workspace default"
3. **Badge count on My Work tab** — red pill `⚠ N` showing `needsAttention.length + (firstVisit ? unreadMentions.length : 0)` for the signed-in user
4. **First-visit gating for unread mentions** — until `lastSeenMyWorkAt` is set, treat unread mentions as 0 to avoid scary "⚠ 47" badges on new users' first sight of the tab

**Non-goals (Phase 4):**

- Notification preferences UI (skipped — no backend delivery in scope)
- Per-view "set as my default" inline icon (the user menu is the single setting surface; YAGNI)
- Per-project default (workspace-wide only)
- Auto-redirect when the user changes their default (only affects the *next* app load; the current view stays put)
- Workspace-wide settings modal (the user menu suffices; modal can land later if more settings accrue)
- Resolving badge to specific items inline (clicking the tab opens My Work which already surfaces them)

---

## Cross-cutting principles

1. **No schema additions.** Every field already exists from Phase 1's reads. Phase 4 just adds writes + a render.
2. **User menu is the settings surface.** Both view-setting controls live in the existing dropdown — discoverable without creating new modals.
3. **Owner-only fields are visible-but-disabled for non-owners.** Non-owners see "Default: <view> (set by owner)" as read-only text instead of a hidden field — clearer than absent.
4. **Badge fairness for first-time users.** A new member opening the app shouldn't see a screaming red badge from mentions accumulated before they had any context. Gate unread mentions by `lastSeenMyWorkAt` presence.
5. **Defer view changes to next app-load.** When user picks a new default, app does NOT auto-navigate. They stay on their current view; the new default takes effect on the next page load. This avoids jumpy UX.

---

## Schema additions

**None.** Reuses existing fields from Phase 1:

- `meta.defaultView: string` — owner-set workspace default. Already read.
- `meta.userPreferences[author].defaultViewOverride: string | null` — per-user override. Already read.
- `meta.userPreferences[author].lastSeenMyWorkAt: string | null` — already written by `markMyWorkSeen` timer.

---

## Components touched

| File / Component | Change |
|---|---|
| `src/App.jsx` | All Phase 4 changes (single-file invariant) |
| **User menu dropdown** (~L10671) | + 2 new sections between Workspace Owner block and Sign out: "Default landing view" (workspace-wide, owner-only) + "My personal override" |
| **Tab strip** (~L10404 area, inside the IIFE that renders tabs) | + badge render on My Work tab when `myWorkBadge > 0` |
| **`App()`** | + `myWorkBadge` useMemo + `setWorkspaceDefaultView(viewId)` async helper + `setPersonalDefaultOverride(viewId \| null)` async helper |

No new components. No new files.

---

## Detailed changes

### 1. View-options array (shared by both settings)

Both `<select>` dropdowns offer the same 7 view IDs. Define once as a module-level constant near the top of `src/App.jsx` to avoid drift:

```js
// v30 Phase 4 — Views eligible to be the workspace/personal default. Owner-only
// views (portfolio, credit-report, team-overview) excluded because non-owners
// can't land on them. Per-project views with potentially empty data (decisions,
// actions) also excluded to avoid landing on "no decisions yet" screens.
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

Place this near other top-of-file constants (e.g., near `DEFAULT_DEPARTMENTS` ~L76 or `DEFAULT_CREDIT_POINTS` ~L72).

### 2. App() — `myWorkBadge` useMemo

Compute the badge count at App level so it's available to the tab strip. Place after the existing `userPrefs` useMemo:

```js
// v30 Phase 4 — Badge count on My Work tab. needsAttention is always
// counted; unreadMentions only counted after user's first visit
// (lastSeenMyWorkAt is set) to avoid scaring new members with old
// mention backlogs.
const myWorkBadge = useMemo(() => {
  if (!author) return 0;
  const w = computeMyWork(author, projects, isOwner, userPrefs?.lastSeenMyWorkAt);
  const hasVisited = !!userPrefs?.lastSeenMyWorkAt;
  return w.needsAttention.length + (hasVisited ? w.unreadMentions.length : 0);
}, [projects, author, isOwner, userPrefs]);
```

Note: this calls `computeMyWork` per-render of App. Since App re-renders on most state changes anyway and `computeMyWork` is ~10ms on typical data (Phase 1 spec), this is fine. The `useMemo` deps `[projects, author, isOwner, userPrefs]` correctly invalidate only when relevant data changes.

**Important**: during impersonation (Phase 3), `userPrefs` is still the OWNER's prefs (passed unchanged to MyWorkView). The badge always reflects the owner's badge count, even when impersonating. That's correct — owner is signed in; the tab strip is hidden during impersonation anyway (tab filter from Phase 3), so the badge is never visible during impersonation. No special-casing needed.

### 3. App() — `setWorkspaceDefaultView` + `setPersonalDefaultOverride` helpers

```js
// v30 Phase 4 — Owner picks the workspace-wide default landing view.
const setWorkspaceDefaultView = useCallback(async (viewId) => {
  if (!isOwner) return;
  setMeta((m) => {
    if (!m) return m;
    const m2 = { ...m, defaultView: viewId };
    saveMeta(m2);
    return m2;
  });
  showToast(`Workspace default set to "${DEFAULT_VIEW_OPTIONS.find((o) => o.id === viewId)?.label || viewId}"`);
}, [isOwner]);

// v30 Phase 4 — Each user picks their personal override. Pass null to clear
// override and fall back to workspace default.
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
    showToast(`Your personal default: "${DEFAULT_VIEW_OPTIONS.find((o) => o.id === viewId)?.label || viewId}"`);
  } else {
    showToast(`Cleared personal override (will follow workspace default)`);
  }
}, [author]);
```

### 4. User menu — new "Default landing view" + "My personal override" sections

Locate the user menu dropdown (~L10671 in App). Insert two new bordered sections after the Workspace Owner block and before the Sign Out button. Render structure:

```jsx
{/* Default landing view (workspace-wide, owner-set) */}
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

{/* Personal override (per-user) */}
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
```

### 5. Tab strip — render badge on My Work tab

Locate the tab strip IIFE (Phase 3 added this — `(() => { const allTabs = [...]; ... return visibleTabs.map(...) })()`). Inside `visibleTabs.map((v) => ...)`, detect `v.id === 'my-work'` and append the badge.

The existing tab button render is:
```jsx
<button key={v.id} onClick={() => setView(v.id)} style={{...}}>
  {v.icon}{v.label}{v.count > 0 && <span style={{...}}>·{v.count}</span>}
</button>
```

Change to:
```jsx
<button key={v.id} onClick={() => setView(v.id)} style={{...}}>
  {v.icon}{v.label}
  {v.id === 'my-work' && myWorkBadge > 0 && (
    <span style={{
      marginLeft: 4, padding: '0 6px', borderRadius: 999,
      background: TOK.overdueFg, color: '#fff', fontSize: 10, fontWeight: 500,
      lineHeight: '14px', minWidth: 16, textAlign: 'center',
    }}>
      {myWorkBadge}
    </span>
  )}
  {v.count > 0 && <span style={{...existing...}}>·{v.count}</span>}
</button>
```

The badge appears immediately after the label, before the legacy `·{v.count}` indicator (which Decisions / Actions tabs use for their per-project counts). The pill uses `TOK.overdueFg` (red `#A32D2D`) on white text — consistent with the existing overdue styling.

---

## Behavior matrix

| Scenario | Workspace default | Personal override | Resolved on next load |
|---|---|---|---|
| Owner set "Outline" workspace-wide; member has no override | `outline` | `null` | `outline` |
| Owner set "Outline"; member sets "My Work" override | `outline` | `my-work` | `my-work` |
| Owner unset; member unset | `undefined` | `null` | `my-work` (final fallback in Phase 1's resolution effect) |
| Member sets override then clears to "Use workspace default" | `outline` | `null` | `outline` |
| Two members: one with override, one without | `outline` | A: `gantt`, B: `null` | A: `gantt`, B: `outline` |

The fallback chain already exists in App's view-resolution effect:
```js
setView(userPrefs?.defaultViewOverride || meta?.defaultView || 'my-work');
```

Phase 4 doesn't change this — only adds the write surfaces.

---

## Badge count formula

```js
myWorkBadge = w.needsAttention.length + (lastSeenMyWorkAt ? w.unreadMentions.length : 0)
```

Where `w = computeMyWork(author, projects, isOwner, lastSeenMyWorkAt)`.

**Examples (current user is hattt4):**

| State | needsAttention | unreadMentions | lastSeenMyWorkAt | Badge |
|---|---:|---:|---|---:|
| Brand new user, 12 historical @mentions | 0 | 12 | null | **0** |
| Same user after first My Work visit | 0 | 12 | "2026-05-14T03:00:00Z" | 12 — assuming all mentions still newer than lastSeen, which is correct (they were before they visited) |
| User after waiting 5s on My Work (lastSeen set to "now") | 0 | 0 | "now" | 0 |
| User with 2 overdue tasks + 3 unread mentions | 2 | 3 | "2026-05-13T...Z" | 5 |
| Owner with 1 overdue + 4 pending deadline approvals + 0 mentions | 5 | 0 | "..." | 5 |

The 5-second mark-seen timer (Phase 1) updates `lastSeenMyWorkAt` after the user has been on My Work for 5 seconds. After that, the badge drops as the user has "seen" the mentions; only mentions newer than `lastSeenMyWorkAt` count.

---

## Testing checklist

### Functional — default view setting

1. **Owner picks workspace default** — Owner opens user menu → "Default landing view" select → pick "Outline" → toast confirms → reload page → land on Outline.
2. **Member sees workspace default as read-only** — Sign in as non-owner → user menu → "Default landing view" section shows current default as text "Outline (set by owner)" (no select).
3. **Member sets personal override** — Member opens user menu → "My personal override" select → pick "Gantt" → toast confirms → reload → land on Gantt (overrides owner's "Outline").
4. **Member clears personal override** — Select "(Use workspace default)" → toast confirms — clearing message → reload → land on Outline (workspace default).
5. **Two members independent** — Member A picks Gantt override; member B leaves clear. Each member reloads → A lands on Gantt, B lands on Outline. Owner's setting affects only members without an override.
6. **Owner change cascades** — Owner changes workspace default from Outline → Dashboard. Member A (override: Gantt) reloads → still Gantt. Member B (no override) reloads → now Dashboard.
7. **First-time default** — Brand new workspace with no `meta.defaultView` set and no user prefs → first user lands on My Work (final fallback).
8. **No auto-redirect** — Owner picks new default → current view stays on whatever they were on. Setting takes effect next reload only.

### Functional — badge count

9. **Badge hidden when no urgent items** — User with 0 overdue + 0 unread mentions → My Work tab shows label only, no pill.
10. **Badge shows needsAttention** — User with 2 overdue tasks → tab shows "My Work [2]" pill.
11. **Owner badge includes pending approvals** — Owner with 3 pending `deadlineRequest` items → badge counts them via `needsAttention.kind === 'deadline_approval'` (already included in computeMyWork when `isOwner=true`).
12. **First-visit suppression of mentions** — Sign in as brand new user with 12 historical mentions → tab shows no badge (lastSeenMyWorkAt is null).
13. **Mentions count after first visit** — Same user visits My Work, waits 6 seconds → lastSeenMyWorkAt set → no badge (all mentions are now older than lastSeen). Now a teammate posts new @mention → badge shows 1.
14. **Badge updates on data change** — Mark an overdue task done → badge count decrements on next render.
15. **Badge hidden during impersonation** — Owner impersonates a member (Phase 3) → tab strip filtered to My Work only, but myWorkBadge still computes against owner's data; the badge value is visually irrelevant since user can't see other tabs. Acceptable.

### Regression

16. **Phase 1 view resolution unchanged** — Existing fallback chain still works correctly when only `meta.defaultView` is set without a user override.
17. **Phase 1 lastSeenMyWorkAt write still fires** — 5-second timer on My Work still updates the timestamp after user opens My Work.
18. **All other tabs unchanged** — No badge on Mind map, Outline, Gantt, Dashboard, etc. Decisions/Actions still show their existing `·N` count indicator.
19. **Phase A-3 flows unaffected** — Sub-tasks, decisions, action create modal, Team Overview, impersonation banner — all unchanged.

### Edge cases

20. **Owner who is also a member** — Owner sees BOTH the workspace-default select AND their personal override. Both work independently.
21. **Stale meta.defaultView ID** — If owner set defaultView to "outline" then later spec removes that view, fallback to `meta.defaultView || 'my-work'` still works because the resolution effect just passes whatever string is there to `setView`. Invalid view IDs would render no tab content (existing behavior).
22. **User without email** — `meta.userPreferences` is keyed by author display name, not email. A user with no email still has prefs storage via their display name. No change.
23. **Switching identity (sign-out + sign-in different user)** — Each user has their own `meta.userPreferences[author]` slot; no cross-contamination.

---

## Critical pitfalls

1. **`computeMyWork` is called twice now** (once in MyWorkView, once in App for badge). For typical data this is fine (~10ms × 2 = ~20ms total). If profiling shows it as a hotspot later, hoist the call to App level and pass results down via props.
2. **The fallback chain order matters**: `defaultViewOverride || meta.defaultView || 'my-work'`. Verify Phase 1's view-resolution effect uses this exact order. Phase 4 doesn't change it.
3. **Badge gating uses `userPrefs?.lastSeenMyWorkAt`** (the optional chain handles the first-visit case where `userPrefs[author]` doesn't exist at all). The `!!` coercion is implicit — `!!undefined === false`, `!!"2026..." === true`.
4. **Don't reset `view` state when default changes**. The setters write to meta only — they do NOT call `setView()`. The new default applies on next app load via Phase 1's resolution effect (which only runs when `view === null` on initial mount).
5. **Owner-only check in `setWorkspaceDefaultView`** is defense-in-depth — the UI only renders the select for owners, but the handler also guards. Don't remove either layer.
6. **`saveMeta` is fire-and-forget but `setMeta` is synchronous** — the functional setMeta pattern (Phase 1) keeps the local state and persistence in sync; saveMeta resolves async without blocking the UI.
7. **DEFAULT_VIEW_OPTIONS hardcoded list** — when adding a new top-level view in the future, also add it here if it should be eligible as a default. Conversely, never include `team-overview`, `portfolio`, `credit-report` here (owner-only views — non-owners can't land on them).
8. **First-visit suppression includes the owner** — even owners with old @mentions get hidden mention counts until their first My Work visit. Consistent treatment is simpler than special-casing.

---

## Implementation order

```
1. Add DEFAULT_VIEW_OPTIONS module-level constant near top of file                                       (~10 lines)
2. App.jsx: + myWorkBadge useMemo                                                                       (~12 lines)
3. App.jsx: + setWorkspaceDefaultView + setPersonalDefaultOverride useCallbacks                         (~30 lines)
4. User menu dropdown: + Default landing view section + Personal override section                       (~50 lines)
5. Tab strip render: + badge render on My Work tab                                                      (~12 lines)
6. Manual smoke test (23 items)
```

Total: ~110 lines net. App.jsx: 11536 → ~11650.

---

## Future-proofing notes

If usage reveals need:

- **Notification preferences UI** — when Phase 5 backend lands, add the modal/section here. Schema slots (`pushEnabled`, `emailDigestEnabled`) already in spec but not yet wired.
- **"Set as my default" inline icon** on each view tab — quick discoverability. ~30 lines.
- **Workspace Settings modal** — if more workspace-wide settings accrue (e.g., default credit allocation, briefing schedule), extract from user menu into dedicated modal. ~80 lines for shell + reuse handlers.
- **Per-project default** — if some projects need different defaults than others. Schema slot: `project.defaultView`. Resolution: per-project override → user override → workspace default → 'my-work'.

None of these are precluded by Phase 4's design.
