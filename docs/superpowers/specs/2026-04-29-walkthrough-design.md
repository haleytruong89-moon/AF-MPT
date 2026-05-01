# Walkthrough for new users — design

**Date:** 2026-04-29
**Status:** Draft (awaiting user review)
**Project:** AF Master Project Tracker (afmpt-tracker)

## Goal

Help first-time users (SmartOSC AF team members) understand AFMPT's structure and core interactions within ~60–90 seconds of their first visit, while still allowing them to skip and explore on their own. Reduce the "I don't know what to do here" moment that comes from the app's many views (Mind Map / Outline / Dashboard / Gantt / Action Items / Decisions / Aggregation / Meeting Mode) and hidden affordances (Ctrl+K search, @mention, member roles).

## Decisions captured during brainstorm

| # | Decision |
|---|----------|
| 1 | **Scope**: hybrid — 3 mandatory basic steps + branch + 4 optional advanced steps. |
| 2 | **Trigger**: auto-show on first visit (Firestore flag) + manual "?" button to replay. |
| 3 | **Style**: hybrid — spotlight (dim + cutout + tooltip pointing at element) for steps that target a specific UI element; centered modal for conceptual intro/branch/closing steps. |
| 4 | **Language**: English (matches existing UI strings). |
| 5 | **Step content**: 7 steps + 1 branch modal — copy approved (see "Step content" section below). |
| 6 | **Step 3 task pick**: auto-pick first task in current project's Mind Map; do not require user click. |
| 7 | **Code structure**: modular, 3 files in `src/components/Walkthrough/`. |
| 8 | **No new dependency** — build spotlight + tooltip positioning manually (~400 LOC total). |

## Architecture

Three new files under `src/components/Walkthrough/`:

```
src/components/Walkthrough/
├── Walkthrough.jsx       — Main component: renders modal & spotlight overlay
├── steps.ts              — Array config of 8 steps (id, type, target, copy, CTAs)
└── useWalkthrough.ts     — Hook: state machine, persistence, auto-trigger
```

`Walkthrough` is mounted at the App.jsx root, sibling to `<Toast>` and `<DialogHost>`. It renders nothing while `active = false`.

### Why 3 files (vs single file)

- `App.jsx` is already 4635 lines — pushing more into it makes future maintenance harder.
- Separating `steps.ts` lets non-developers on the team edit walkthrough copy without touching logic.
- `useWalkthrough.ts` isolates persistence so it can be tested independently from rendering.

## Data flow & state

### State machine

`useWalkthrough` returns:

```ts
{
  active: boolean,            // is tour visible
  stepIndex: number,          // 0..steps.length-1
  start: () => void,          // always resets stepIndex to 0; does NOT clear flag
  next: () => void,           // advance index (no-op at last step — use finish())
  skip: () => void,           // mark complete + close (callable from any step)
  finish: () => void,         // mark complete + close (called from final step's CTA)
  branchContinue: () => void, // jump from branch to first advanced step (step 4)
  branchSkip: () => void,     // mark complete + close from branch
}
```

### Auto-trigger guards

Tour auto-starts only when **all** of these are true:

1. User is signed in (`authUser` truthy).
2. `meta` and `currentProjectId` are loaded.
3. The project for `currentProjectId` exists in `projects` map.
4. `users/{uid}.tourCompletedAt` is `undefined` in Firestore.
5. Current project has ≥ 1 task. (If 0 tasks, Step 3 has no target → defer tour to next visit.)

When all true, hook calls `start()` after a 800ms delay (lets initial render settle).

### Manual trigger

A new "?" icon button in the header calls `start()`. This does **not** clear `tourCompletedAt` — the flag stays set; only `active` flips to true.

### Skip/finish behavior

Both `skip` and `finish` write `tourCompletedAt = serverTimestamp()` to Firestore. If the write fails (network error), tour still ends locally; the flag is also written to localStorage as a backup so the user isn't pestered while offline.

## Step content

| # | Type | Target | Copy |
|---|------|--------|------|
| 1 | modal | — | **Welcome to AFMPT!** This tracker organizes your work as: Project → Programs → Workstreams → Tasks. Let's take a quick 1-minute tour. — *[Skip tour] [Start tour →]* |
| 2 | spotlight | `view-tabs` | **Switching views.** AFMPT has multiple views of the same project. **Mind Map** is the visual canvas, **Outline** edits the tree, **Dashboard** shows stats. — *[Next →]* |
| 3 | spotlight | `first-task` (requires Mind Map view) | **Click a task to open details.** Inside, you can log **check-ins**, change **status**, set **dates**, and **@mention teammates** — they'll see it in the activity feed. — *[Next →]* |
| ★ | branch | — | **You've got the basics!** Want to see the advanced features (search, members, action items)? — *[Skip — I'll explore] [Show me more →]* |
| 4 | spotlight | `search` | **Quick search.** Press **Ctrl+K** (Cmd+K on Mac) anywhere to jump to any task or project instantly. — *[Next →]* |
| 5 | spotlight | `members` | **Members & roles.** Each project has roles: **Owner** (manages membership), **Operator** (edits content), **Viewer** (read-only). Click the people icon to manage. — *[Next →]* |
| 6 | spotlight | `view-tabs` | **Beyond tasks.** Use the **Decisions**, **Actions**, and **Aggregation** tabs for decision logs, action items with PIC, and cross-project rollups. The **▶ Meeting** button (right of tabs) launches a presentation mode for stand-ups with auto-generated minutes. — *[Next →]* |
| 7 | modal | — | **You're all set!** Click the **?** icon in the header anytime to replay this tour. Happy tracking! — *[Got it]* |

Steps 1, ★ (branch), 7 are modals (centered, dimmed background). Steps 2–6 are spotlights pointing at a specific element.

## Spotlight positioning algorithm

When the active step is type `spotlight`:

1. `document.querySelector(\`[data-tour="${target}"]\`)` → resolve element.
2. **Fallback**: if element not found, render a centered modal with the same copy plus an italic note. The note copy is per-step (e.g., for step 3: *"This step is about clicking a task — try it once you've added one"*; for step 5: *"You'll see this when you're a member with permissions"*). Defined alongside step config in `steps.ts` as an optional `fallbackNote` field.
3. Read `target.getBoundingClientRect()` → store as `targetRect` state.
4. Render the overlay as **four absolutely-positioned divs** (top, bottom, left, right of the rect) each with `background: rgba(0,0,0,0.55)`. This dims everything outside the rect without needing CSS `clip-path` (broader browser support, simpler reasoning).
5. Render the tooltip card next to the rect. Placement priority: `bottom` → `top` → `right` → `left`. Pick the first that fits in the viewport with at least 16px margin.
6. Add a small triangular arrow on the tooltip side adjacent to the target.
7. Listen `window.resize` and `window.scroll` (passive, debounced 50ms via `requestAnimationFrame`) → recompute `targetRect` and re-render.
8. On step change or close, remove listeners.

### Z-index strategy

- Walkthrough overlay: `z-index: 1500` (above existing modals which sit ~1000).
- Tooltip card: `z-index: 1501`.
- The "spotlit" element does NOT need a higher z-index because the dimmer is composed of 4 surrounding divs that don't cover it; it appears bright simply because it's not dimmed.

## Anchors to add (data-tour attributes)

Modify existing elements in `App.jsx` to add `data-tour="..."`:

| Anchor name | Target element | Where in code |
|-------------|---------------|---------------|
| `view-tabs` | The container holding Mind Map / Outline / Dashboard / etc. tabs | Header view-switcher block |
| `search` | The search button (or icon) that opens `<SearchModal>` | Header right side |
| `members` | The people icon that opens `<MembersModal>` | Header right side |
| `help` | New "?" button | Header right side (added in this change) |
| `first-task` | First task node rendered in Mind Map | Set dynamically in `MindMapView` on the first node element |

For `first-task`, the `MindMapView` component sets `data-tour="first-task"` on the first task node it renders (not the project root or program nodes — those are too abstract for "click a task to open details"). "First" is defined as the first task in document order: traverse `project.programs[0].workstreams[i].tasks[j]` and pick the first non-empty match. If no tasks exist, the attribute is not rendered, and the spotlight falls back to a centered modal.

## Persistence

### Firestore schema

Extend the existing `users/{uid}` document:

```ts
// Before
interface UserDoc { currentProjectId?: string }
// After
interface UserDoc {
  currentProjectId?: string,
  tourCompletedAt?: Timestamp  // unset = never finished tour
}
```

### Firestore rules

The existing rule for `users/{uid}` already allows the authenticated user to write their own doc — no rule change required. (Verified during design that the rule is `request.auth.uid == uid` for both read and write.)

### LocalStorage backup

In addition to Firestore, write `localStorage.setItem('afmpt:tour:completed', '1')` on skip/finish. The auto-trigger guard checks both: tour shows only if **both** Firestore field is unset AND localStorage key is absent. This prevents the tour from re-showing during the brief window between sign-in and the first Firestore read on slow connections.

## Manual test plan

| Scenario | Expected |
|----------|----------|
| First-time user (clear `tourCompletedAt` + localStorage) | Tour auto-shows after ~800ms |
| Skip at step 1 | Tour ends, flag saved in Firestore + localStorage |
| Branch "Skip" | Tour ends, flag saved |
| Branch "Show me more" | Advances to step 4 |
| Click "?" button after completing | Tour replays from step 1, flag NOT cleared |
| Resize window mid-tour | Tooltip repositions correctly |
| Project has 0 tasks | Tour does NOT auto-show |
| Replay tour, navigate away from Mind Map, then click "?" | Step 3 forces switch back to Mind Map view |
| Step 5 spotlight on Members icon when user is Viewer (icon may still render) | Spotlight works; copy still informative |
| Slow network (Firestore write delays) | localStorage flag prevents re-show on quick reload |

## Out of scope

- Mobile/tablet specific layouts. AFMPT is internal desktop tool; touch ergonomics not optimized in current app.
- i18n / Vietnamese version. English-only per decision Q4.
- Dynamic tour content based on user role. All users see the same 7 steps regardless of Owner/Operator/Viewer status.
- Telemetry/analytics on tour completion rates. Add later if needed.
- Per-feature deep tours (e.g., a separate Action Items mini-tour). Single linear walkthrough only.

## Open risks / unknowns

- **Mind Map rendering performance**: if `MindMapView` lazy-renders nodes, the first task's DOM node may not be present when step 3 fires. Mitigation: query within step 3 startup; if not found, retry after 200ms; if still not found, fall back to centered modal.
- **Tab bar layout under narrow window**: spotlight rect for `view-tabs` may extend off-screen. Tooltip placement algorithm should clamp to viewport. Already covered in step 5 of positioning algorithm (16px margin).

## File-by-file change list

| File | Change |
|------|--------|
| `src/components/Walkthrough/Walkthrough.jsx` | NEW — ~200 LOC, renders overlay + tooltip |
| `src/components/Walkthrough/steps.ts` | NEW — ~80 LOC, step config array |
| `src/components/Walkthrough/useWalkthrough.ts` | NEW — ~80 LOC, state hook + Firestore I/O |
| `src/App.jsx` | Mount `<Walkthrough />`, add `data-tour=` attrs to view-tabs/search/members, add "?" Help button (~40 LOC) |
| `src/App.jsx` — `MindMapView` / `MindNode` (same file) | Add `data-tour="first-task"` to first rendered task node (~10 LOC) |
| `src/data.ts` | Add helper `getTourCompletedAt(uid)` and `markTourCompleted(uid)` (~20 LOC) |

Total: 3 new files (~360 LOC), ~70 LOC modifications across 2 existing files. No new npm dependencies.
