# RAID Register — Phase 1 (Schema + Helpers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `raid: []` to the program schema, ensure existing projects migrate on load, and add pure helpers (`riskLevel`, `daysSinceReview`) and config constants. Zero new UI. Build/lint/smoke must remain green.

**Architecture:** Single-file React app — all changes inside `src/App.jsx`. Module-level constants placed near the existing `DEFAULT_VIEW_OPTIONS` block (~L83); helpers placed in the utilities section (~L160). Schema field added to the two project literals (`parseExcelFile` + `createNewProject`); on-load migration applied inside the project hydration loop. Field is opt-in default `[]` — no destructive change to existing data.

**Tech Stack:** React 18.3, Vite 5.4, single-file `src/App.jsx`. No unit-test framework — validation is `npm run lint` + `npm run typecheck` + `npm run build` + manual browser smoke.

**Reference files:**
- Spec: `Specs/FEATURES_SPEC_v30_raid.md` §1 (data model), §9.1 (riskLevel computed), §9.5 (lastReviewedAt rules)
- Prototype: `src/CRPRaid.jsx` L16-41 (RTYPE / MATRIX / TREND constants, daysSince helper)

**Out of scope for Phase 1:** Any UI, any tab change, any RAIDCard/RAIDProgramView/MyWork integration, Portfolio rollup, Excel export changes. Those are Phases 2-5.

---

## File Structure

All changes go into one file:

- **Modify:** `src/App.jsx`
  - Add constants block after `DEFAULT_VIEW_OPTIONS` (~L91): `RAID_TYPES`, `RAID_STATUSES`, `RAID_TREND_CONFIG`, `RAID_RISK_MATRIX`, `RAID_REVIEW_STALE_DAYS`
  - Add helpers in utilities section (~L169, after `isOverdue`): `raidRiskLevel(l, i)`, `raidDaysSinceReview(item)`, `ensureProjectRaid(project)`
  - Add `raid: []` to the project literal in `parseExcelFile` ([App.jsx:1164-1173](src/App.jsx#L1164-L1173))
  - Add `raid: []` to the project literal in `createNewProject` ([App.jsx:10202-10212](src/App.jsx#L10202-L10212))
  - Wrap loaded projects with `ensureProjectRaid()` in the hydration loop at [App.jsx:9658-9663](src/App.jsx#L9658-L9663)

---

### Task 1: Add RAID config constants block

**Files:**
- Modify: `src/App.jsx` — insert new constants after the `DEFAULT_VIEW_OPTIONS` block

- [ ] **Step 1: Locate the insertion point**

Open `src/App.jsx` and confirm the `DEFAULT_VIEW_OPTIONS` array ends at line 92 (closing `];`). The next non-blank line should be a `//` comment "Reference (wiki link) types …" or similar. Insert the new block on the blank line between these two.

- [ ] **Step 2: Insert the constants block**

Insert this block immediately after the closing `];` of `DEFAULT_VIEW_OPTIONS`:

```js
// v30 RAID Register — type config. Icons stay text-emoji (consistent with the
// rest of the file which uses unicode glyphs for risk/issue/dependency markers
// — see e.g. the overdue badge "⚠" usage already in TOK styling).
const RAID_TYPES = {
  Risk:       { icon: '⚠',  label: 'Risk',       fg: '#A32D2D', bg: '#FCEBEB' },
  Assumption: { icon: '💡', label: 'Assumption', fg: '#0C447C', bg: '#E6F1FB' },
  Issue:      { icon: '🔥', label: 'Issue',      fg: '#B7791F', bg: '#FAEEDA' },
  Dependency: { icon: '🔗', label: 'Dependency', fg: '#4B2D8C', bg: '#EEEDFE' },
};

// All valid RAIDItem.status values. Status flow:
//   Draft → PendingApproval → Active → (Mitigating | Resolved | Accepted) → Closed
// Visibility: Draft = creator only; PendingApproval = creator + owner; Active+ = everyone.
const RAID_STATUSES = ['Draft', 'PendingApproval', 'Active', 'Mitigating', 'Resolved', 'Accepted', 'Closed'];

// Trend config — used by RAID review history. `stable` is the default for newly created items.
const RAID_TREND_CONFIG = {
  improving:  { icon: '🟢', label: 'Improving',  fg: '#356512', bg: '#E6EFD6' },
  stable:     { icon: '🟡', label: 'Stable',     fg: '#B7791F', bg: '#FAEEDA' },
  escalating: { icon: '🔴', label: 'Escalating', fg: '#A32D2D', bg: '#FCEBEB' },
};

// Risk level matrix — riskLevel is COMPUTED from likelihood × impact, never stored.
// Spec §1d / §9.1.
const RAID_RISK_MATRIX = {
  'High:High':     'Critical',
  'High:Medium':   'High',
  'High:Low':      'High',
  'Medium:High':   'High',
  'Medium:Medium': 'Medium',
  'Medium:Low':    'Low',
  'Low:High':      'Medium',
  'Low:Medium':    'Low',
  'Low:Low':       'Low',
};

// Threshold (in days) for "Needs review" badge on Active/Mitigating items. Spec §9.7.
const RAID_REVIEW_STALE_DAYS = 7;
```

- [ ] **Step 3: Verify lint + build still pass**

Run:
```bash
npm run lint
npm run build
```
Expected: lint shows 24 baseline warnings, 0 errors. Build completes (a Babel >500KB deopt warning is cosmetic and was already there).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(raid): add RAID type/status/trend/matrix constants"
```

---

### Task 2: Add pure helpers

**Files:**
- Modify: `src/App.jsx` — insert helpers after `isOverdue` (~L169) in the utilities section

- [ ] **Step 1: Locate the insertion point**

Find the line containing `const isOverdue = (t) => {` (~L169). The next non-blank line is a comment block `// ─── Activity Dashboard / Briefing date helpers ───`. Insert the new helpers between these.

- [ ] **Step 2: Insert the helpers**

Insert this block on the line after `isOverdue` ends and before the `// ─── Activity Dashboard / Briefing date helpers ───` comment:

```js
// ─── v30 RAID helpers (pure, no side effects) ───
// riskLevel is COMPUTED every render — never persisted. Spec §9.1.
const raidRiskLevel = (likelihood, impact) =>
  RAID_RISK_MATRIX[`${likelihood}:${impact}`] ?? 'Medium';

// Days since the most recent review note. Falls back to createdAt when an item
// has no history yet. Returns 0 if neither field is set (defensive — should not happen).
const raidDaysSinceReview = (item) => {
  const ts = item?.lastReviewedAt || item?.createdAt;
  if (!ts) return 0;
  const ms = Date.now() - new Date(ts).getTime();
  return Math.floor(ms / 86400000);
};

// On-load migration — ensures every program has a `raid` array. Idempotent.
// Mutates and returns the project for convenience in the load loop.
function ensureProjectRaid(project) {
  if (!project || !Array.isArray(project.programs)) return project;
  for (const pg of project.programs) {
    if (!Array.isArray(pg.raid)) pg.raid = [];
  }
  return project;
}
```

- [ ] **Step 3: Verify lint + build still pass**

Run:
```bash
npm run lint
npm run build
```
Expected: same baseline (24 warnings, 0 errors, build succeeds). The new helpers are pure functions — no behavior change yet.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(raid): add raidRiskLevel, raidDaysSinceReview, ensureProjectRaid helpers"
```

---

### Task 3: Default `raid: []` in new-project literals

**Files:**
- Modify: `src/App.jsx:1168` — `parseExcelFile` program loop creates programs with `{ id, name, workstreams: [] }` — add `raid: []` there
- Modify: `src/App.jsx:10207` — `createNewProject` project literal (programs is empty at create time — no per-program change needed)

- [ ] **Step 1: Add `raid: []` to the program literal inside `parseExcelFile`**

Find this line at [App.jsx:1181](src/App.jsx#L1181):

```js
    if (!pg) { pg = { id: uid('p'), name: pn, workstreams: [] }; project.programs.push(pg); progMap.set(pn, pg); }
```

Replace with:

```js
    if (!pg) { pg = { id: uid('p'), name: pn, workstreams: [], raid: [] }; project.programs.push(pg); progMap.set(pn, pg); }
```

- [ ] **Step 2: `createNewProject` — no change needed**

`createNewProject` ([App.jsx:10202-10212](src/App.jsx#L10202-L10212)) creates a project with `programs: []` and no programs at that moment, so there is nothing to default for individual programs. Programs are added later (e.g. via `addProgram` flow) — confirm that flow already adds `workstreams: []` to new programs and apply the same `raid: []` default there.

Find every place in `App.jsx` that creates a new program with `workstreams: []`:

```bash
git grep -n "workstreams: \[\]" src/App.jsx
```

For each match, ensure the object literal also includes `raid: []`. Expected matches (likely 2-3 spots: `parseExcelFile`, an `addProgram` callback inside the App component, possibly an import normaliser). Update each one identically.

- [ ] **Step 3: Verify build + manual smoke**

Run:
```bash
npm run lint
npm run build
```

Expected: same baseline.

Manual smoke (DEV server):
```bash
npm run dev
```

Open http://localhost:5173. Confirm the seeded CRP project still loads. Open browser devtools console and run:
```js
JSON.parse(localStorage.getItem('proj_crp') || 'null')?.programs?.map(p => ({ name: p.name, raid: p.raid }))
```
(Replace key with the actual project key — check `K.project()` format if needed; it's `proj:<id>`.) Expected: each program object has a `raid` array (may be empty after migration in Task 4; for now it may be `undefined` since we have not yet wired the load-time migration — that comes next).

Skip this devtools check if the storage key is awkward to reach; the build + lint check is sufficient gate for this task.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(raid): default raid:[] on every new program literal"
```

---

### Task 4: On-load migration via `ensureProjectRaid`

**Files:**
- Modify: `src/App.jsx:9658-9663` — project hydration loop in the workspace init `useEffect`

- [ ] **Step 1: Wrap the load with the migration helper**

Find this block at [App.jsx:9658-9663](src/App.jsx#L9658-L9663):

```js
      const ps = {};
      for (const pid of m.projectIds) {
        const p = await loadProject(pid);
        if (p) ps[pid] = p;
      }
      setProjects(ps);
```

Replace with:

```js
      const ps = {};
      for (const pid of m.projectIds) {
        const p = await loadProject(pid);
        if (p) ps[pid] = ensureProjectRaid(p);
      }
      setProjects(ps);
```

`ensureProjectRaid` is idempotent — running it on a project that already has `raid: []` is a no-op. Running it on legacy data adds the field. Pure mutation on the freshly-parsed object is safe (no other reference exists yet at this point in the load).

- [ ] **Step 2: Migration on first-write — confirm `saveProject` does not strip**

`saveProject` is just `JSON.stringify` at [App.jsx:1091](src/App.jsx#L1091). Once `ensureProjectRaid` has added `raid: []` to each program, the next debounced save (any user mutation) will persist the field. No additional code needed.

- [ ] **Step 3: Manual smoke — load existing data, confirm migration**

```bash
npm run dev
```

Open browser. Confirm seeded CRP project loads without errors. Open devtools console:
```js
// After app boots, inspect the in-memory projects state by triggering any UI action,
// or just check that no console errors appear from missing-raid access.
```

Trigger an existing flow (e.g. open a project, switch view to Outline, click a task) — no errors should appear. The `raid` field is now present on every program in memory even though no UI reads it yet.

- [ ] **Step 4: Verify lint + build**

```bash
npm run lint
npm run build
```

Expected: 24 baseline warnings, 0 errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(raid): migrate existing projects via ensureProjectRaid on load"
```

---

### Task 5: Defensive seed-data check

**Files:**
- Modify (optional): `src/App.jsx:19` — the inline `SEED_CRP` constant

- [ ] **Step 1: Decide on touching seed data**

The `SEED_CRP` constant ([App.jsx:19](src/App.jsx#L19)) is a frozen import seed used only when a brand-new workspace boots with no meta. Because `ensureProjectRaid` runs on hydration of any project (including the freshly seeded one — see the save→load→migrate sequence in the workspace init `useEffect`), the seed itself does **not** need to be modified.

Confirm this by inspecting the boot path: [App.jsx:9648-9663](src/App.jsx#L9648-L9663):

```js
const seeded = cloneDeep(SEED_CRP);
seeded.createdAt = new Date().toISOString();
await saveProject(seeded);                  // persists seed without raid
// ... later ...
const p = await loadProject(pid);
if (p) ps[pid] = ensureProjectRaid(p);      // raid added here on load
```

The seed is saved without `raid`, immediately reloaded, and migrated. Result: in-memory state always has `raid` after boot.

**Decision:** Leave `SEED_CRP` untouched. The migration handles it.

- [ ] **Step 2: (Skip if Step 1 confirmed)** No edit needed.

- [ ] **Step 3: Commit checkpoint (optional)**

If you have no pending changes from this task, skip the commit. Otherwise:
```bash
git status
```
Should show "nothing to commit, working tree clean" relative to Task 4's commit.

---

### Task 6: End-to-end smoke + Phase 1 acceptance

**Files:** none modified — verification only.

- [ ] **Step 1: Full validation**

Run all checks:
```bash
npm run lint
npm run typecheck
npm run build
```

Expected:
- lint: 24 baseline warnings, 0 errors
- typecheck: clean (this codebase is mostly JS with light JSDoc; `tsc --noEmit` passes existing code)
- build: succeeds with the existing 500KB Babel-deopt warning (cosmetic, pre-existing)

- [ ] **Step 2: Manual browser smoke**

```bash
npm run dev
```

Open http://localhost:5173 and check:
1. Seeded CRP project loads, no console errors.
2. Switch between views: My Work, Mind map, Outline, Gantt, Dashboard, Decisions, Actions, Aggregation, Activity — none should error.
3. (Owner-only) Team, Portfolio, Credits tabs still render.
4. Open a task in Outline — TaskDetail panel opens without error.
5. Create a new project via `+ New project` button — confirm it appears in the dropdown. (Verifies `createNewProject` is intact.)
6. Open devtools console — no red errors related to `raid`.

- [ ] **Step 3: Smoke test the `raid` field is present in state**

In devtools console (after the app loads), inspect React state via the React DevTools extension OR add a one-shot `console.log(projects)` in the App component (then remove before commit). Confirm every program object has a `raid: []` array.

Alternatively, less invasive: check stored value after one user mutation triggers a save:
```js
// After clicking any task to fire a state change + debounced save:
const raw = await window.storage.get('proj:proj_crp', true);
JSON.parse(raw.value).programs.map(p => ({ name: p.name, hasRaid: Array.isArray(p.raid) }))
```
Every entry should show `hasRaid: true`.

- [ ] **Step 4: Tag Phase 1 complete**

```bash
git tag v30-raid-phase-1
```

Do **not** push the tag yet — wait for user sign-off on smoke.

- [ ] **Step 5: Report**

Phase 1 is complete when:
- All 5 prior commits are on the branch
- Build green, lint baseline unchanged
- Manual smoke shows no regressions
- `raid: []` field is present on every program in loaded state
- No new UI exists yet — RAID tab is **not** added in this phase

Report to user: "Phase 1 done. Build/lint/smoke green. `raid: []` field migrated on load and added to new project / parseExcel paths. Ready to review or move to Phase 2 (core RAID Register view)."

---

## Self-Review Notes

- **Spec coverage:** Phase 1 covers spec §1a (`program.raid = []`), §1c (migration), §1d (computed `riskLevel`, `daysSinceReview`). Cosmetic constants (§2 RAID_TYPES / RAID_TREND / matrix) are pre-loaded so Phase 2 components can consume them without further schema work. Spec §9.1 (riskLevel never stored), §9.5 (lastReviewedAt update rule — encoded as a comment for future-Phase-2 reference), §9.7 (7-day stale threshold) are encoded as constants/helpers ready for use.
- **Placeholders:** None — every step has exact code.
- **Type consistency:** Helper names use the `raid*` prefix consistently (`raidRiskLevel`, `raidDaysSinceReview`, `ensureProjectRaid`). Constant names use `RAID_*` prefix consistently. Status string values match spec §1b exactly.
- **No premature abstraction:** Migration is a single function, not a framework. No "migrationRegistry" or version-pinning — YAGNI.
- **Frequent commits:** 4 commits across 6 tasks (Task 5 may skip, Task 6 is verification-only).
- **No new UI:** Confirmed — RAID tab, view, components are all Phase 2+.
