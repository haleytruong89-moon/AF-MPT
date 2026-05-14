# RAID Register — Phase 4 (My Work Integration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface RAID items in My Work so users see what RAID work needs their attention without opening the RAID tab. Adds 3 new sections to `MyWorkView` and extends the My Work badge count to include RAID urgency.

**Architecture:** Single-file React, all in `src/App.jsx`. One aggregator helper (`computeMyRaid`) next to existing `computeMyWork`. One new component (`MyRaidSection`) consumed by `MyWorkView`. Three section blocks injected into the existing `MyWorkView` render. Badge extension on App component. Navigation callback that switches to `view='raid'` and scopes the right program.

**Tech Stack:** React 18.3, Vite 5.4, single-file `src/App.jsx`. No tests — validation via `npm run lint` + `npm run build` + manual browser smoke.

**Reference files:**
- Spec: `Specs/FEATURES_SPEC_v30_raid.md` §4 (My Work view)
- Phase 1: constants + helpers
- Phase 2: full RAID Register view (consumed via navigation)

**Out of scope:** Task detail RAID signal block (Phase 3 — separate plan), Portfolio rollup + Excel export (Phase 5 — separate plan).

---

## File Structure

All changes in `src/App.jsx`. Locations (line numbers approximate, post-Phase-2):
- `computeMyRaid` helper — alongside `computeMyWork` at ~L794
- `MyRaidSection` component — between `MyWorkSection` (~L7836) and existing My Work code, OR near other RAID components
- 3 section injections in `MyWorkView` render — after "Needs attention now" section
- Badge extension + nav wiring — inside `App` component (myWorkBadge useMemo + MyWorkView prop passing)

---

### Task 1: `computeMyRaid` aggregator

**Files:**
- Modify: `src/App.jsx` — insert after `computeMyWork` ends (~around L948, search for `return out;` then the closing `}` of `computeMyWork`).

**Why:** Pure read function that flatmaps all projects/programs/raid-items and buckets them by "needs my attention" criteria. Returns the shape consumed by Task 2's `MyRaidSection`.

- [ ] **Step 1: Locate insertion point**

Search for `function computeMyWork` (~L794). Read 5-10 lines around its closing `}` (likely ~L948). Insert the new function on the line after.

- [ ] **Step 2: Insert `computeMyRaid`**

```js
// v30 RAID Phase 4 — Aggregate RAID items that need the user's attention across
// all projects/programs. Pure read; no mutation. Mirrors the shape of
// computeMyWork: returns named buckets that MyRaidSection renders directly.
function computeMyRaid(author, projects, isOwner) {
  const out = {
    pendingApproval: [],   // owner-only — items awaiting their approval
    escalating: [],        // items where owner===author AND trend==='escalating' AND status active
    overdueActions: [],    // mitigation actions where pic===author AND status!==Done AND due<today
    needsReview: [],       // items where owner===author AND daysSinceReview>7 AND status active
    dueThisWeek: [],       // mitigation actions where pic===author AND status!==Done AND due<=today+7
    owned: [],             // all active items where owner===author
  };
  if (!author) return out;
  const startOfToday = today();
  const weekFromToday = new Date(startOfToday);
  weekFromToday.setDate(weekFromToday.getDate() + 7);

  for (const proj of Object.values(projects || {})) {
    for (const pg of (proj.programs || [])) {
      for (const item of (pg.raid || [])) {
        const isActive = item.status === 'Active' || item.status === 'Mitigating';
        const isClosed = item.status === 'Closed' || item.status === 'Resolved' || item.status === 'Accepted';
        const enriched = { item, project: proj, program: pg };

        // Pending approval — owner only, items not created by the owner themselves.
        if (item.status === 'PendingApproval' && isOwner) {
          out.pendingApproval.push(enriched);
        }

        // Escalating — items I own that are trending bad.
        if (isActive && item.owner === author && item.trend === 'escalating') {
          out.escalating.push(enriched);
        }

        // Needs review — items I own that haven't been reviewed in over 7 days.
        if (isActive && item.owner === author && raidDaysSinceReview(item) > RAID_REVIEW_STALE_DAYS) {
          out.needsReview.push(enriched);
        }

        // All owned active items.
        if (item.owner === author && !isClosed && item.status !== 'Draft') {
          out.owned.push(enriched);
        }

        // Mitigation actions assigned to me — overdue + due this week.
        for (const act of (item.mitigationActions || [])) {
          if (act.pic !== author || act.status === 'Done') continue;
          const dueDate = parseDate(act.due);
          const actionEnriched = { action: act, item, project: proj, program: pg };
          if (dueDate && dueDate < startOfToday) {
            out.overdueActions.push(actionEnriched);
          } else if (dueDate && dueDate <= weekFromToday) {
            out.dueThisWeek.push(actionEnriched);
          }
        }
      }
    }
  }
  return out;
}
```

- [ ] **Step 3: Verify lint + build**

```
npm run lint
npm run build
```

Expected: +1 unused-vars warning (consumed in Task 3). Build green. 4 pre-existing errors unchanged.

- [ ] **Step 4: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): computeMyRaid aggregator (phase 4)"
```

---

### Task 2: `MyRaidSection` component

**Files:**
- Modify: `src/App.jsx` — insert just before `function MyWorkView` (~L9515, after `RaidRegisterView` ends).

**Why:** Renders the 3 new My Work sections — "RAID items needing my attention" (with 4 sub-groups), "Mitigation actions due this week", "All RAID items I own". Each click navigates to the RAID tab with that program scoped.

- [ ] **Step 1: Insert `MyRaidSection`**

```js
// v30 RAID Phase 4 — Renders the 3 RAID-related sections inside MyWorkView.
// onNavigateRaid(projectId, programId) switches the view to RAID with that
// program selected.
function MyRaidSection({ myRaid, currentUser, teamMembers, onNavigateRaid }) {
  const attentionCount =
    myRaid.pendingApproval.length +
    myRaid.escalating.length +
    myRaid.overdueActions.length +
    myRaid.needsReview.length;

  const MiniItemCard = ({ enriched, badge }) => {
    const tcfg = RAID_TYPES[enriched.item.type] || RAID_TYPES.Risk;
    const tr = enriched.item.trend ? RAID_TREND_CONFIG[enriched.item.trend] : null;
    return (
      <div
        onClick={() => onNavigateRaid(enriched.project.id, enriched.program.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          border: '1px solid ' + TOK.line, borderRadius: 7, marginBottom: 5,
          background: TOK.surface, cursor: 'pointer', fontFamily: FONT_STACK,
        }}>
        <span style={{ fontSize: 14 }}>{tcfg.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: TOK.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <MentionedText text={enriched.item.title} teamMembers={teamMembers} />
          </div>
          <div style={{ fontSize: 10.5, color: TOK.muted, marginTop: 1 }}>
            {enriched.project.name} › {enriched.program.name} · @{enriched.item.owner || '—'}
          </div>
        </div>
        {badge}
        {tr && <span style={{ fontSize: 12 }} title={tr.label}>{tr.icon}</span>}
        <ChevronRight size={13} style={{ color: TOK.subtle }} />
      </div>
    );
  };

  const MiniActionCard = ({ enriched, overdue }) => (
    <div
      onClick={() => onNavigateRaid(enriched.project.id, enriched.program.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        border: '1px solid ' + (overdue ? '#F5C8C8' : TOK.line), borderRadius: 7,
        marginBottom: 5, background: overdue ? '#FCEBEB' : TOK.surface,
        cursor: 'pointer', fontFamily: FONT_STACK,
      }}>
      <span style={{ color: TOK.subtle, fontSize: 12 }}>☐</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: overdue ? '#7B1D1D' : TOK.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {enriched.action.name}
        </div>
        <div style={{ fontSize: 10.5, color: overdue ? '#A32D2D' : TOK.muted, marginTop: 1 }}>
          In: {enriched.item.title.slice(0, 50)}{enriched.item.title.length > 50 ? '…' : ''} · {enriched.program.name}
          {enriched.action.due && <> · {overdue ? 'was due' : 'due'} {fmtDateShort(enriched.action.due)}</>}
        </div>
      </div>
      <ChevronRight size={13} style={{ color: TOK.subtle }} />
    </div>
  );

  return (
    <>
      {/* Attention section (only render if any sub-group is non-empty) */}
      {attentionCount > 0 && (
        <MyWorkSection
          icon="⚠"
          title="RAID items needing my attention"
          count={attentionCount}
          defaultOpen={true}>
          {myRaid.pendingApproval.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#B7791F', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                ⏳ Pending your approval ({myRaid.pendingApproval.length})
              </div>
              {myRaid.pendingApproval.map((e, i) => (
                <MiniItemCard
                  key={`pa-${i}`}
                  enriched={e}
                  badge={<span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: '#B7791F', background: '#FAEEDA' }}>Approve</span>}
                />
              ))}
            </div>
          )}
          {myRaid.escalating.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#A32D2D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                🔴 Escalating risks I own ({myRaid.escalating.length})
              </div>
              {myRaid.escalating.map((e, i) => (
                <MiniItemCard
                  key={`es-${i}`}
                  enriched={e}
                  badge={e.item.type === 'Risk' ? <RiskLevelBadge likelihood={e.item.likelihood} impact={e.item.impact} /> : null}
                />
              ))}
            </div>
          )}
          {myRaid.overdueActions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#A32D2D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                ⚠ Overdue mitigation actions ({myRaid.overdueActions.length})
              </div>
              {myRaid.overdueActions.map((e, i) => (
                <MiniActionCard key={`oa-${i}`} enriched={e} overdue={true} />
              ))}
            </div>
          )}
          {myRaid.needsReview.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#B7791F', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                ⏰ Risks not reviewed in &gt;7 days ({myRaid.needsReview.length})
              </div>
              {myRaid.needsReview.map((e, i) => (
                <MiniItemCard
                  key={`nr-${i}`}
                  enriched={e}
                  badge={<span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: '#B7791F', background: '#FAEEDA' }}>Review</span>}
                />
              ))}
            </div>
          )}
        </MyWorkSection>
      )}

      {/* Mitigation actions due this week */}
      {myRaid.dueThisWeek.length > 0 && (
        <MyWorkSection
          icon="📅"
          title="Mitigation actions due this week"
          count={myRaid.dueThisWeek.length}
          defaultOpen={true}>
          {myRaid.dueThisWeek.map((e, i) => (
            <MiniActionCard key={`dw-${i}`} enriched={e} overdue={false} />
          ))}
        </MyWorkSection>
      )}

      {/* All RAID items I own — collapsed by default */}
      {myRaid.owned.length > 0 && (
        <MyWorkSection
          icon="📋"
          title="All RAID items I own"
          count={myRaid.owned.length}
          defaultOpen={false}>
          {myRaid.owned.map((e, i) => (
            <MiniItemCard
              key={`ow-${i}`}
              enriched={e}
              badge={e.item.type === 'Risk' ? <RiskLevelBadge likelihood={e.item.likelihood} impact={e.item.impact} /> : <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: TOK.muted, background: TOK.bg }}>{e.item.status}</span>}
            />
          ))}
        </MyWorkSection>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify lint + build**

```
npm run lint
npm run build
```

Expected: +1 unused-vars warning. Build green.

- [ ] **Step 3: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): MyRaidSection component (phase 4)"
```

---

### Task 3: Wire `MyRaidSection` into `MyWorkView`

**Files:**
- Modify: `src/App.jsx` — inside `MyWorkView` body. Insert `myRaid` useMemo + render the section after "Needs attention now".

- [ ] **Step 1: Add `onNavigateRaid` prop + `myRaid` useMemo**

Find the `MyWorkView` function signature (~L9515). Currently it destructures many props. Add `onNavigateRaid` to the prop list.

Find:
```js
function MyWorkView({
  // ... existing props ...
  onMarkSeen, showToast,
}) {
```

Change to:
```js
function MyWorkView({
  // ... existing props ...
  onMarkSeen, showToast,
  onNavigateRaid,
}) {
```

Then immediately after the existing `myWork` useMemo (~L9523):

```js
  const myWork = useMemo(
    () => computeMyWork(author, projects, isOwner, lastSeenAt),
    [projects, author, isOwner, lastSeenAt]
  );
```

Insert the new useMemo on the line after:

```js
  const myRaid = useMemo(
    () => computeMyRaid(author, projects, isOwner),
    [projects, author, isOwner]
  );
```

- [ ] **Step 2: Render `MyRaidSection` after "Needs attention now"**

Find the existing "Needs attention now" MyWorkSection block (~L9638-9748). It ends with a closing `</MyWorkSection>`. Insert the `MyRaidSection` render immediately after that closing tag.

Search for the line ending `🔴 Needs attention now` section's closing — typically the line before the next MyWorkSection (e.g. "Owned tasks" or similar). The block to insert:

```jsx

      {/* v30 RAID Phase 4 — RAID needs-attention + due-this-week + owned */}
      <MyRaidSection
        myRaid={myRaid}
        currentUser={author}
        teamMembers={teamMembers}
        onNavigateRaid={onNavigateRaid || (() => {})}
      />
```

- [ ] **Step 3: Verify lint + build**

```
npm run lint
npm run build
```

Expected: previously-unused warnings for `computeMyRaid` and `MyRaidSection` drop. Build green.

- [ ] **Step 4: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): wire MyRaidSection into MyWorkView (phase 4)"
```

---

### Task 4: Extend `myWorkBadge` + wire `onNavigateRaid` in App

**Files:**
- Modify: `src/App.jsx` — `myWorkBadge` useMemo inside App component, and the `<MyWorkView ...>` props inside the view router.

**Why:** Final integration: the My Work tab badge should include RAID attention counts, and the navigation callback that lets RAID rows jump to the RAID tab needs wiring.

- [ ] **Step 1: Extend `myWorkBadge` to include RAID counts**

Find the existing `myWorkBadge` useMemo (~L9787 — search `const myWorkBadge = useMemo`). Read 10 lines of context. Current shape:

```js
  const myWorkBadge = useMemo(() => {
    if (!author) return 0;
    const w = computeMyWork(author, projects, isOwner, userPrefs?.lastSeenMyWorkAt);
    const hasVisited = !!userPrefs?.lastSeenMyWorkAt;
    return w.needsAttention.length + (hasVisited ? w.unreadMentions.length : 0);
  }, [projects, author, isOwner, userPrefs]);
```

Replace with:

```js
  const myWorkBadge = useMemo(() => {
    if (!author) return 0;
    const w = computeMyWork(author, projects, isOwner, userPrefs?.lastSeenMyWorkAt);
    const r = computeMyRaid(author, projects, isOwner);
    const hasVisited = !!userPrefs?.lastSeenMyWorkAt;
    const raidAttention = r.pendingApproval.length + r.escalating.length + r.overdueActions.length + r.needsReview.length;
    return w.needsAttention.length + raidAttention + (hasVisited ? w.unreadMentions.length : 0);
  }, [projects, author, isOwner, userPrefs]);
```

- [ ] **Step 2: Wire `onNavigateRaid` in the `<MyWorkView />` call**

Find the `<MyWorkView ...>` render block (~L11833). Add the `onNavigateRaid` prop alongside other navigation callbacks (e.g. next to `onActionClick`). Insert:

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

- [ ] **Step 3: Verify lint + build**

```
npm run lint
npm run build
```

Expected: build green. Lint baseline unchanged.

- [ ] **Step 4: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): extend myWorkBadge + wire onNavigateRaid (phase 4 final)"
```

---

## Phase 4 acceptance criteria (verified manually)

1. Open My Work view.
2. If user has RAID items needing attention (any of: pending approval as owner, escalating-trend items they own, overdue mitigation actions assigned to them, items not reviewed in >7d), the new "⚠ RAID items needing my attention" section appears between "Needs attention now" and other existing sections.
3. Sub-groups render: ⏳ Pending approval (owner-only), 🔴 Escalating I own, ⚠ Overdue actions, ⏰ Needs review.
4. If any mitigation actions are due this week (≤7d), "📅 Mitigation actions due this week" section appears with mini cards.
5. "📋 All RAID items I own" section appears (collapsed by default) listing all active items the user owns.
6. Clicking any RAID row navigates to the RAID tab with the project switched.
7. My Work tab badge count increases by the RAID attention count when RAID items need attention.
8. After visiting My Work and seeing the items, the user can act on them by clicking through to RAID.
9. When user has NO RAID items in any bucket, no RAID sections appear (graceful empty state).
10. Build green, lint baseline unchanged (or net negative after consumers wire up).

---

## Self-Review Notes

**Spec coverage:**
- Spec §4 "RAID items needing my attention" — 4 sub-groups: ✅ Task 2
- Spec §4 "Mitigation actions due this week" — ✅ Task 2
- Spec §4 "All RAID items I own" — ✅ Task 2 (collapsed by default)
- Click-through navigation to RAID tab — ✅ Task 4
- Badge count includes RAID urgency — ✅ Task 4

**No placeholders:** Every step has code.

**Type consistency:** `computeMyRaid` returns `{ pendingApproval, escalating, overdueActions, needsReview, dueThisWeek, owned }`; `MyRaidSection` consumes exactly those keys.

**No premature abstraction:** RAID mini-cards are inline sub-components inside `MyRaidSection`, not separate exports.

**Frequent commits:** 4 commits across 4 tasks.

**No new UI tab:** RAID tab already exists from Phase 2 — Phase 4 only adds sections inside the existing My Work tab.
