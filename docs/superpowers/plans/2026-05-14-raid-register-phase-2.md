# RAID Register — Phase 2 (Core View) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core RAID Register: a new "RAID" tab + view that lets users create, view, expand, approve, status-transition, add review notes, and add mitigation actions for RAID items at program level.

**Architecture:** Single-file React, all in `src/App.jsx`. Eight components/wiring tasks, ordered so each builds on the previous: `applyRaidUpdate` helper → `RiskMatrix` → `MitigationActionRow` → `TrendHistoryBlock` → `AddRAIDForm` → `RAIDCard` → `RaidRegisterView` → tab/router wiring. Phase 1 constants (`RAID_TYPES`, `RAID_STATUSES`, `RAID_TREND_CONFIG`, `RAID_RISK_MATRIX`, `RAID_REVIEW_STALE_DAYS`) and helpers (`raidRiskLevel`, `raidDaysSinceReview`, `ensureProjectRaid`) are already in place.

**Tech Stack:** React 18.3, Vite 5.4, single-file `src/App.jsx` (~11,709 lines after Phase 1), inline styles via existing `TOK` token object, lucide-react icons, no test framework — validation via `npm run lint` + `npm run build` + manual browser smoke.

**Reference files:**
- Spec: `Specs/FEATURES_SPEC_v30_raid.md` §2 (RAID Register view), §2a (Trend & Review History), §2b (Add form), §2c (Approval), §2d (Mitigation action add), §6 (Navigation tab), §9 (careful-of's)
- Prototype: `src/CRPRaid.jsx` — has working `RiskMatrix` (L198), `MitigationActionRow` (L220), `TrendHistory` (L268), `AddRAIDForm` (L339), `RAIDCard` (L403), `RAIDProgramView` (L509). Use as visual + logic reference; do NOT copy verbatim — adapt to `src/App.jsx` conventions (TOK tokens, lucide-react icons instead of emoji-only buttons, FONT_STACK, hooks-before-return).
- Reference patterns in `src/App.jsx`:
  - `Modal` ([App.jsx:1433](src/App.jsx#L1433)) — for `AddRAIDForm`
  - `ActionRowInline` ([App.jsx:8008](src/App.jsx#L8008)) — pattern for collapsed/expanded card + comment thread; `MitigationActionRow` is a simplified variant
  - `applyActionUpdate` ([App.jsx:10023](src/App.jsx#L10023)) — exact shape `applyRaidUpdate` will mirror
  - `approveDeadlineRequest` ([App.jsx:2900](src/App.jsx#L2900)) — owner-only approval pattern
  - Tab strip IIFE ([App.jsx:10451-10485](src/App.jsx#L10451-L10485)) — where the `raid` tab goes
  - View router branches ([App.jsx:10550+](src/App.jsx#L10550)) — where the view case branches

**Out of scope for Phase 2:** Task detail "program RAID signal" block (Phase 3), My Work integration (Phase 4), Portfolio rollup + Excel export sheet (Phase 5).

---

## File Structure

All changes in `src/App.jsx`. No new files. Components placed in their natural neighborhood:
- `applyRaidUpdate` — alongside other `apply*Update` callbacks (~L10092, just before/after `applyActionUpdate`)
- New components — in the components region (~L7000-9000 of the file, before the `App` main component). Order: smaller helpers first (`RiskMatrix`, `MitigationActionRow`), then forms (`TrendHistoryBlock`, `AddRAIDForm`), then composite (`RAIDCard`), then top-level (`RaidRegisterView`). Each can be placed near the end of the component-definitions region, just before `function MyWorkView` (~L8360) or wherever makes sense at insertion time.
- Tab strip / view router — exact line ranges given in Task 8.

---

### Task 1: `applyRaidUpdate` cross-project / cross-program helper

**Files:**
- Modify: `src/App.jsx` — insert new `applyRaidUpdate` useCallback inside the `App` component, alongside `applyActionUpdate` (~L10023) and `applyDecisionUpdate` (~L10097). Insert AFTER `applyDecisionUpdate` ends.

**Why:** RAID items live at `program.raid[item]`, two levels deeper than tasks/actions/decisions. Every mutation (create, status change, trend update, approval, mitigation action add/done, history append) goes through this single helper which:
1. Looks up project + program by id
2. Replaces or inserts the item by id
3. Calls `updateProject(updated)`
4. Computes activity log entries with `source` suffix and `actingAs` prefix (mirror pattern of `applyActionUpdate`)

- [ ] **Step 1: Locate insertion point**

Find the closing `}, [...]);` of `applyDecisionUpdate` (~L10117 ish — search for `applyDecisionUpdate = useCallback`). Insert the new `applyRaidUpdate` block on the line after that closing brace.

- [ ] **Step 2: Insert `applyRaidUpdate`**

```js
  // v30 RAID Phase 2 — Apply a RAID item update to any project/program.
  // updatedItem must include `id`. If `programId` does not contain an item
  // with that id, the item is treated as new and appended to that program's
  // raid array. Otherwise the existing item is shallow-merged.
  // Diff-logger emits typed raid_* activity entries with the standard
  // `(from <source>)` suffix and `acting as <name>: ` prefix conventions.
  const applyRaidUpdate = useCallback((updatedItem, projectId, programId, source = '', actingAs = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const program = (targetProj.programs || []).find((p) => p.id === programId);
    if (!program) return;
    const oldItem = (program.raid || []).find((r) => r.id === updatedItem.id);

    const updated = cloneDeep(targetProj);
    updated.programs = updated.programs.map((p) => {
      if (p.id !== programId) return p;
      const existing = (p.raid || []).some((r) => r.id === updatedItem.id);
      if (existing) {
        return { ...p, raid: (p.raid || []).map((r) => r.id === updatedItem.id ? { ...r, ...updatedItem } : r) };
      }
      return { ...p, raid: [...(p.raid || []), updatedItem] };
    });
    updateProject(updated);

    const tag = source ? ` (from ${source})` : '';
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    const log = (entry) => logActivityForProject(projectId, {
      ...entry,
      description: actingPrefix + entry.description,
    });

    // New item — single "create" entry; skip diff comparison.
    if (!oldItem) {
      log({
        type: 'raid_create',
        description: `Created ${updatedItem.type || 'RAID item'} "${updatedItem.title || '(untitled)'}" in ${program.name}${tag}`,
      });
      return;
    }

    // Status transitions — emit specific events for the important ones.
    if (oldItem.status !== updatedItem.status) {
      if (updatedItem.status === 'Active' && oldItem.status === 'PendingApproval') {
        log({ type: 'raid_approve', description: `Approved ${updatedItem.type} "${updatedItem.title}"${tag}` });
      } else if (updatedItem.status === 'Draft' && oldItem.status === 'PendingApproval') {
        log({ type: 'raid_reject', description: `Rejected ${updatedItem.type} "${updatedItem.title}" — returned to Draft${tag}` });
      } else if (updatedItem.status === 'Closed' || updatedItem.status === 'Resolved' || updatedItem.status === 'Accepted') {
        log({ type: 'raid_close', description: `${updatedItem.type} "${updatedItem.title}": ${oldItem.status} → ${updatedItem.status}${tag}` });
      } else {
        log({ type: 'raid_status_change', description: `${updatedItem.type} "${updatedItem.title}": ${oldItem.status} → ${updatedItem.status}${tag}` });
      }
    }

    // Trend change — emitted when explicit review note is added (length of history grew).
    if ((oldItem.history?.length || 0) < (updatedItem.history?.length || 0)) {
      const newest = updatedItem.history[updatedItem.history.length - 1];
      const trendLabel = (RAID_TREND_CONFIG[newest?.trend]?.label) || newest?.trend || '—';
      log({
        type: 'raid_review',
        description: `Added review note (${trendLabel}) on ${updatedItem.type} "${updatedItem.title}"${tag}`,
      });
    }

    // Mitigation action diffs — additions, completions, deletions.
    const oldActs = oldItem.mitigationActions || [];
    const newActs = updatedItem.mitigationActions || [];
    const oldActMap = new Map(oldActs.map((a) => [a.id, a]));
    const newActMap = new Map(newActs.map((a) => [a.id, a]));
    for (const [id, act] of newActMap.entries()) {
      if (oldActMap.has(id)) continue;
      log({ type: 'raid_action_add', description: `Added mitigation "${act.name}" → ${act.pic || '—'} on "${updatedItem.title}"${tag}` });
    }
    for (const [id, act] of oldActMap.entries()) {
      if (newActMap.has(id)) continue;
      log({ type: 'raid_action_remove', description: `Removed mitigation "${act.name}" from "${updatedItem.title}"${tag}` });
    }
    for (const [id, act] of newActMap.entries()) {
      const prev = oldActMap.get(id);
      if (!prev) continue;
      if (prev.status !== act.status && act.status === 'Done') {
        log({ type: 'raid_action_done', description: `Mitigation done: "${act.name}" on "${updatedItem.title}" (${act.pic || '—'})${tag}` });
      }
    }
  }, [projects, updateProject, logActivityForProject]);
```

- [ ] **Step 3: Verify lint + build**

```
npm run lint
npm run build
```

Expected: 1 new `no-unused-vars` warning (callback has no consumers yet — will be consumed by `RaidRegisterView` in Task 7). 4 pre-existing errors unchanged. Build success.

- [ ] **Step 4: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): applyRaidUpdate cross-project helper with diff-logger"
```

---

### Task 2: `RiskMatrix` selector + readonly badge

**Files:**
- Modify: `src/App.jsx` — insert two new top-level components in the component-definitions region (somewhere reasonable, e.g. just before `function MyWorkView` at ~L8360).

**Why:** Risk-type RAID items have a 3×3 likelihood × impact matrix used in `AddRAIDForm` (selector mode) and `RAIDCard` expanded view (readonly mode showing computed level).

- [ ] **Step 1: Locate insertion point**

Find `function MyWorkView` (the start of the existing My Work view component). Insert the two new components on the lines BEFORE it.

- [ ] **Step 2: Insert `RiskMatrixSelector`**

```js
// v30 RAID Phase 2 — Interactive 3×3 likelihood × impact selector.
// Used by AddRAIDForm. Renders 9 cells; each cell is clickable and shows
// the computed risk level (Critical / High / Medium / Low).
function RiskMatrixSelector({ likelihood, impact, onChange }) {
  const levels = ['High', 'Medium', 'Low'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(3, 1fr)', gap: 4, fontFamily: FONT_STACK }}>
      {/* Header row */}
      <div />
      {levels.map((i) => (
        <div key={i} style={{ fontSize: 10, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', textAlign: 'center', padding: 4 }}>
          Imp: {i}
        </div>
      ))}
      {/* Rows */}
      {levels.map((l) => (
        <React.Fragment key={l}>
          <div style={{ fontSize: 10, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', alignSelf: 'center', textAlign: 'right', paddingRight: 4 }}>
            Lik: {l}
          </div>
          {levels.map((i) => {
            const lvl = raidRiskLevel(l, i);
            const selected = l === likelihood && i === impact;
            const cellBg = lvl === 'Critical' ? '#FCEBEB' : lvl === 'High' ? '#FFF0EE' : lvl === 'Medium' ? '#FAEEDA' : '#E6EFD6';
            const cellFg = lvl === 'Critical' ? '#7B1D1D' : lvl === 'High' ? '#A32D2D' : lvl === 'Medium' ? '#B7791F' : '#356512';
            return (
              <button
                key={l + i}
                type="button"
                onClick={() => onChange(l, i)}
                style={{
                  background: cellBg,
                  color: cellFg,
                  fontFamily: FONT_STACK,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '10px 6px',
                  border: selected ? '2px solid ' + TOK.ink : '1px solid ' + TOK.line,
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
                title={`Likelihood ${l} × Impact ${i} = ${lvl}`}>
                {lvl}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

// v30 RAID Phase 2 — Readonly badge for an already-set likelihood × impact pair.
// Used in RAIDCard expanded view.
function RiskLevelBadge({ likelihood, impact }) {
  const lvl = raidRiskLevel(likelihood, impact);
  const bg = lvl === 'Critical' ? '#FCEBEB' : lvl === 'High' ? '#FFF0EE' : lvl === 'Medium' ? '#FAEEDA' : '#E6EFD6';
  const fg = lvl === 'Critical' ? '#7B1D1D' : lvl === 'High' ? '#A32D2D' : lvl === 'Medium' ? '#B7791F' : '#356512';
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: bg, color: fg, fontFamily: FONT_STACK }}>
      {lvl} risk
    </span>
  );
}
```

- [ ] **Step 3: Verify lint + build**

```
npm run lint
npm run build
```

Expected: 2 new `no-unused-vars` warnings (consumed in Tasks 5 + 6). Build success.

- [ ] **Step 4: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): RiskMatrixSelector + RiskLevelBadge components"
```

---

### Task 3: `MitigationActionRow` component

**Files:**
- Modify: `src/App.jsx` — insert new component just after `RiskLevelBadge` (before `MyWorkView`).

**Why:** Each RAID item has its own list of mitigation actions. Each row shows the action name, pic, due date, status, optional comment thread, and a ✓ Done button visible to the assignee.

**Pattern reference:** `ActionRowInline` at [App.jsx:8008](src/App.jsx#L8008) — but simpler: no priority, no sub-tasks, no inline title rename, no per-row reassign UI. Only show the comment thread when expanded.

- [ ] **Step 1: Insert `MitigationActionRow`**

```js
// v30 RAID Phase 2 — One mitigation/resolution action row inside a RAIDCard.
// Simpler than ActionRowInline: no priority, no sub-tasks, no inline rename.
// Comments use the same shape as task/action updates: { id, author, text, ts }.
// onUpdate receives a partial diff to merge into the action.
function MitigationActionRow({ action, currentUser, teamMembers, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const overdue = action.due && action.status !== 'Done' && parseDate(action.due) < today();
  const comments = action.comments || [];
  const canMarkDone = action.pic === currentUser && action.status !== 'Done';

  const statusColor = {
    Open: { fg: TOK.muted, bg: TOK.bg },
    Blocked: { fg: '#A32D2D', bg: '#FCEBEB' },
    Done: { fg: '#356512', bg: '#E6EFD6' },
  }[action.status || 'Open'];

  const postComment = () => {
    const trimmed = commentDraft.trim();
    if (!trimmed) return;
    const newComment = { id: uid('c'), author: currentUser, text: trimmed, ts: new Date().toISOString() };
    onUpdate({ comments: [...comments, newComment] });
    setCommentDraft('');
  };

  return (
    <div style={{ border: '1px solid ' + TOK.line, borderRadius: 7, marginBottom: 6, background: TOK.surface, fontFamily: FONT_STACK }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 36 }}>
        <span style={{ color: TOK.subtle, fontSize: 12 }}>{action.status === 'Done' ? '☑' : '☐'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: action.status === 'Done' ? TOK.muted : TOK.ink, fontWeight: 500, textDecoration: action.status === 'Done' ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {action.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: 10.5, color: TOK.muted }}>
            <span>@{action.pic || '—'}</span>
            {action.due && (
              <span style={{ color: overdue ? TOK.overdueFg : TOK.muted, fontWeight: overdue ? 500 : 400 }}>
                · 📅 {fmtDateShort(action.due)} {overdue ? '(overdue)' : ''}
              </span>
            )}
            {comments.length > 0 && <span>· 💬 {comments.length}</span>}
          </div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: statusColor.fg, background: statusColor.bg }}>
          {action.status || 'Open'}
        </span>
        {canMarkDone && (
          <Btn size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); onUpdate({ status: 'Done' }); }} title="Mark done">✓</Btn>
        )}
        <ChevronDown size={13} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid ' + TOK.line, background: TOK.bg }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, fontSize: 11, color: TOK.muted, flexWrap: 'wrap' }}>
            <span>Status</span>
            <select
              value={action.status || 'Open'}
              onChange={(e) => onUpdate({ status: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 11.5, padding: '3px 6px', border: '1px solid ' + TOK.lineStrong, borderRadius: 5, background: TOK.surface, color: TOK.ink }}>
              {['Open', 'Done', 'Blocked'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {onRemove && (
              <button onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: TOK.muted, cursor: 'pointer', fontSize: 11 }} title="Remove this mitigation action">
                <Trash2 size={12} /> Remove
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 6 }}>💬 Comments ({comments.length})</div>
          {comments.map((c) => (
            <div key={c.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px dashed ' + TOK.line }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, marginBottom: 2 }}>
                <span style={{ color: TOK.ink, fontWeight: 500 }}>{c.author}</span> · {myWorkTimeAgo(c.ts)}
              </div>
              <MentionedText text={c.text} teamMembers={teamMembers} />
            </div>
          ))}
          <div style={{ marginTop: 8 }}>
            <MentionTextarea
              value={commentDraft}
              onChange={setCommentDraft}
              rows={2}
              placeholder={`Comment as ${currentUser || '…'}. Type @ to mention.`}
              teamMembers={teamMembers}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <Btn size="sm" variant="primary" onClick={postComment} disabled={!commentDraft.trim()}>Post comment</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify lint + build**

```
npm run lint
npm run build
```

Expected: 1 new unused-vars warning (consumed in Task 6). Build success.

- [ ] **Step 3: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): MitigationActionRow component"
```

---

### Task 4: `TrendHistoryBlock` component

**Files:**
- Modify: `src/App.jsx` — insert after `MitigationActionRow`.

**Why:** Each RAID item has a `history[]` of review notes. The block shows the latest entry + a "Show all (N)" toggle + an inline "Add review note" form with a trend toggle and a textarea. Spec §2a.

- [ ] **Step 1: Insert `TrendHistoryBlock`**

```js
// v30 RAID Phase 2 — Review history + inline "add review note" form for a RAID item.
// Shows the latest entry + Show all (N) toggle. Add form has a 3-way trend toggle
// and a textarea. On save, calls onAddReview(trend, note) which the parent translates
// into a full item update (append history + bump lastReviewedAt + sync trend).
function TrendHistoryBlock({ item, currentUser, teamMembers, onAddReview }) {
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftTrend, setDraftTrend] = useState(item.trend || 'stable');
  const [draftNote, setDraftNote] = useState('');

  const history = item.history || [];
  const visible = showAll ? history.slice().reverse() : history.slice(-1).reverse();
  const lastReviewedDays = raidDaysSinceReview(item);

  const submit = () => {
    const trimmed = draftNote.trim();
    if (!trimmed) return;
    onAddReview(draftTrend, trimmed);
    setDraftNote('');
    setDraftTrend(item.trend || 'stable');
    setAdding(false);
  };

  return (
    <div style={{ marginTop: 10, fontFamily: FONT_STACK }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Review History
        </span>
        <span style={{ fontSize: 10.5, color: lastReviewedDays > RAID_REVIEW_STALE_DAYS ? TOK.overdueFg : TOK.subtle, marginLeft: 'auto' }}>
          Last reviewed: {lastReviewedDays === 0 ? 'today' : `${lastReviewedDays}d ago`}
        </span>
      </div>

      {history.length === 0 && (
        <div style={{ fontSize: 11.5, color: TOK.subtle, fontStyle: 'italic' }}>No review notes yet.</div>
      )}
      {visible.map((h) => {
        const tc = RAID_TREND_CONFIG[h.trend] || RAID_TREND_CONFIG.stable;
        return (
          <div key={h.id} style={{ padding: '6px 0', borderBottom: '1px dashed ' + TOK.line, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12 }}>{tc.icon}</span>
              <span style={{ color: TOK.ink, fontWeight: 500, fontSize: 11 }}>{h.author}</span>
              <span style={{ color: TOK.muted, fontSize: 10.5 }}>· {fmtDateShort(h.ts)}</span>
            </div>
            <MentionedText text={h.note} teamMembers={teamMembers} />
          </div>
        );
      })}
      {history.length > 1 && !showAll && (
        <button onClick={() => setShowAll(true)} style={{ background: 'none', border: 'none', color: TOK.accent, fontSize: 11.5, cursor: 'pointer', padding: '4px 0', fontFamily: FONT_STACK }}>
          Show all ({history.length})
        </button>
      )}
      {showAll && history.length > 1 && (
        <button onClick={() => setShowAll(false)} style={{ background: 'none', border: 'none', color: TOK.muted, fontSize: 11.5, cursor: 'pointer', padding: '4px 0', fontFamily: FONT_STACK }}>
          Show less
        </button>
      )}

      {!adding && (
        <Btn size="sm" onClick={() => setAdding(true)} style={{ marginTop: 8 }}><Plus size={11} /> Add review note</Btn>
      )}
      {adding && (
        <div style={{ marginTop: 10, padding: 10, background: TOK.bg, borderRadius: 7, border: '1px solid ' + TOK.line }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {Object.entries(RAID_TREND_CONFIG).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setDraftTrend(k)}
                style={{
                  fontFamily: FONT_STACK,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: draftTrend === k ? '2px solid ' + TOK.ink : '1px solid ' + TOK.lineStrong,
                  background: draftTrend === k ? v.bg : TOK.surface,
                  color: draftTrend === k ? v.fg : TOK.muted,
                  cursor: 'pointer',
                }}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <MentionTextarea
            value={draftNote}
            onChange={setDraftNote}
            rows={2}
            placeholder={`What's the current status? Posted as ${currentUser || '…'}. Type @ to mention.`}
            teamMembers={teamMembers}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
            <Btn size="sm" variant="ghost" onClick={() => { setAdding(false); setDraftNote(''); }}>Cancel</Btn>
            <Btn size="sm" variant="primary" onClick={submit} disabled={!draftNote.trim()}>Save review</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify lint + build**

```
npm run lint
npm run build
```

Expected: 1 new unused-vars warning. Build success.

- [ ] **Step 3: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): TrendHistoryBlock with inline add-review form"
```

---

### Task 5: `AddRAIDForm` (modal)

**Files:**
- Modify: `src/App.jsx` — insert after `TrendHistoryBlock`.

**Why:** Creation form covering all 4 RAID types with type-specific fields. Spec §2b. Item starts at `status: 'PendingApproval'` with an initial history entry. (Risk's `escalateToBoD` defaulted from `impact === 'High'` then overridable.)

**Pattern reference:** Use existing `Modal` component (App.jsx:1433) as the wrapper. Use `RiskMatrixSelector` (Task 2) for Risk type.

- [ ] **Step 1: Insert `AddRAIDForm`**

```js
// v30 RAID Phase 2 — Create-RAID modal. Tabs across 4 types; type-specific fields
// below. On save, builds a complete RAIDItem with id, status='PendingApproval',
// createdAt/By, initial history entry, and escalateToBoD default for Risk.
function AddRAIDForm({ onSave, onCancel, currentUser, teamMembers, picSuggestions }) {
  const [type, setType] = useState('Risk');
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState(currentUser || '');
  const [likelihood, setLikelihood] = useState('Medium');
  const [impact, setImpact] = useState('Medium');
  const [mitigationPlan, setMitigationPlan] = useState('');
  const [escalateToBoD, setEscalateToBoD] = useState(false);
  const [validationDeadline, setValidationDeadline] = useState('');
  const [validationOwner, setValidationOwner] = useState('');
  const [severity, setSeverity] = useState('Medium');
  const [dependsOn, setDependsOn] = useState('');
  const [blockedUntil, setBlockedUntil] = useState('');
  const [initialNote, setInitialNote] = useState('');

  // Risk: when impact changes, default escalateToBoD to (impact === 'High') — but allow override.
  // Track whether user has manually toggled; if so, do not re-apply default.
  const [bodTouched, setBodTouched] = useState(false);
  useEffect(() => {
    if (type === 'Risk' && !bodTouched) setEscalateToBoD(impact === 'High');
  }, [type, impact, bodTouched]);

  const canSave = title.trim().length > 0 && owner.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const id = uid('raid');
    const initial = {
      id,
      type,
      title: title.trim(),
      owner: owner.trim(),
      status: 'PendingApproval',
      createdBy: currentUser,
      createdAt: now,
      approvedBy: null,
      approvedAt: null,
      trend: 'stable',
      lastReviewedAt: now,
      history: [{
        id: uid('h'),
        ts: now,
        author: currentUser,
        note: initialNote.trim() || `${type} created.`,
        trend: 'stable',
      }],
      mitigationActions: [],
    };
    if (type === 'Risk') {
      initial.likelihood = likelihood;
      initial.impact = impact;
      initial.mitigationPlan = mitigationPlan.trim() || null;
      initial.escalateToBoD = escalateToBoD;
    } else if (type === 'Assumption') {
      initial.validationDeadline = validationDeadline || null;
      initial.validationOwner = validationOwner.trim() || null;
      initial.validated = false;
    } else if (type === 'Issue') {
      initial.severity = severity;
      initial.raisedAt = now;
    } else if (type === 'Dependency') {
      initial.dependsOn = dependsOn.trim() || null;
      initial.blockedUntil = blockedUntil || null;
    }
    onSave(initial);
  };

  return (
    <Modal title="Add RAID item" onClose={onCancel} width={560}>
      <div style={{ fontFamily: FONT_STACK }}>
        {/* Type tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: TOK.bg, padding: 3, borderRadius: 8 }}>
          {Object.entries(RAID_TYPES).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              style={{
                flex: 1,
                fontFamily: FONT_STACK,
                fontSize: 12,
                fontWeight: 500,
                padding: '7px 10px',
                borderRadius: 6,
                border: 'none',
                background: type === k ? TOK.surface : 'transparent',
                color: type === k ? v.fg : TOK.muted,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                boxShadow: type === k ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}>
              <span>{v.icon}</span> {v.label}
            </button>
          ))}
        </div>

        {/* Common fields */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`What is the ${type.toLowerCase()}?`}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Owner</div>
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, background: TOK.surface, color: TOK.ink }}>
            <option value="">(select)</option>
            {(picSuggestions || []).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Type-specific */}
        {type === 'Risk' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Likelihood × Impact</div>
              <RiskMatrixSelector likelihood={likelihood} impact={impact} onChange={(l, i) => { setLikelihood(l); setImpact(i); }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Mitigation plan (optional)</div>
              <textarea
                value={mitigationPlan}
                onChange={(e) => setMitigationPlan(e.target.value)}
                rows={2}
                placeholder="What's the mitigation strategy?"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: TOK.ink, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={escalateToBoD}
                onChange={(e) => { setBodTouched(true); setEscalateToBoD(e.target.checked); }}
              />
              <span>⬆ Escalate to BoD <span style={{ color: TOK.muted, fontSize: 11 }}>(auto-set for High impact; you can override)</span></span>
            </label>
          </>
        )}

        {type === 'Assumption' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Validation deadline</div>
              <input
                type="date"
                value={validationDeadline}
                onChange={(e) => setValidationDeadline(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Validation owner</div>
              <select
                value={validationOwner}
                onChange={(e) => setValidationOwner(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, background: TOK.surface, color: TOK.ink }}>
                <option value="">(select)</option>
                {(picSuggestions || []).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </>
        )}

        {type === 'Issue' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Severity</div>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, background: TOK.surface, color: TOK.ink }}>
              {['High', 'Medium', 'Low'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {type === 'Dependency' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Depends on</div>
              <input
                value={dependsOn}
                onChange={(e) => setDependsOn(e.target.value)}
                placeholder="What must happen first?"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Blocked until</div>
              <input
                type="date"
                value={blockedUntil}
                onChange={(e) => setBlockedUntil(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box' }}
              />
            </div>
          </>
        )}

        {/* Initial review note */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Initial review note (optional)</div>
          <MentionTextarea
            value={initialNote}
            onChange={setInitialNote}
            rows={2}
            placeholder="Context, why now, what's known so far. Type @ to mention."
            teamMembers={teamMembers}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Btn size="sm" variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn size="sm" variant="primary" onClick={handleSave} disabled={!canSave}>Submit for approval</Btn>
        </div>
        <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 10, textAlign: 'right' }}>
          New items start as <strong>PendingApproval</strong>. Workspace owner must approve before everyone can see.
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Verify lint + build**

```
npm run lint
npm run build
```

Expected: 1 new unused-vars warning. Build success.

- [ ] **Step 3: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): AddRAIDForm modal with 4 type tabs"
```

---

### Task 6: `RAIDCard` (collapsed + expanded)

**Files:**
- Modify: `src/App.jsx` — insert after `AddRAIDForm`.

**Why:** The card is the workhorse: shows the item in collapsed (one-line summary) and expanded (full metadata, approval banner, trend history, mitigation actions, status transitions) modes. Spec §2 RAIDCard section.

- [ ] **Step 1: Insert `RAIDCard`**

```js
// v30 RAID Phase 2 — Card for one RAID item. Collapsed: one-line summary.
// Expanded: type-specific metadata, approval banner (if PendingApproval & isOwner),
// trend history, mitigation actions, status transitions.
// All mutations route through onUpdate(partial) which the parent translates into an
// applyRaidUpdate call.
function RAIDCard({ item, isOwner, currentUser, teamMembers, picSuggestions, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [actionDraftName, setActionDraftName] = useState('');
  const [actionDraftPic, setActionDraftPic] = useState('');
  const [actionDraftDue, setActionDraftDue] = useState('');

  const tcfg = RAID_TYPES[item.type] || RAID_TYPES.Risk;
  const trendCfg = item.trend ? RAID_TREND_CONFIG[item.trend] : null;
  const isRisk = item.type === 'Risk';
  const level = isRisk ? raidRiskLevel(item.likelihood, item.impact) : null;
  const daysSince = raidDaysSinceReview(item);
  const isStale = daysSince > RAID_REVIEW_STALE_DAYS && (item.status === 'Active' || item.status === 'Mitigating');
  const openMitigations = (item.mitigationActions || []).filter((a) => a.status !== 'Done').length;

  const handleAddReview = (trend, note) => {
    const newHist = {
      id: uid('h'),
      ts: new Date().toISOString(),
      author: currentUser,
      note,
      trend,
    };
    onUpdate({
      ...item,
      trend,
      lastReviewedAt: newHist.ts,
      history: [...(item.history || []), newHist],
    });
  };

  const handleMitigationUpdate = (actionId, diff) => {
    const updated = (item.mitigationActions || []).map((a) => a.id === actionId ? { ...a, ...diff } : a);
    onUpdate({ ...item, mitigationActions: updated });
  };

  const handleMitigationRemove = (actionId) => {
    const updated = (item.mitigationActions || []).filter((a) => a.id !== actionId);
    onUpdate({ ...item, mitigationActions: updated });
  };

  const handleMitigationAdd = () => {
    const name = actionDraftName.trim();
    if (!name) return;
    const newAct = {
      id: uid('ma'),
      name,
      pic: actionDraftPic || null,
      due: actionDraftDue || null,
      status: 'Open',
      comments: [],
    };
    onUpdate({ ...item, mitigationActions: [...(item.mitigationActions || []), newAct] });
    setActionDraftName(''); setActionDraftPic(''); setActionDraftDue('');
    setAddingAction(false);
  };

  const setStatus = (newStatus) => onUpdate({ ...item, status: newStatus });

  const approve = () => onUpdate({
    ...item,
    status: 'Active',
    approvedBy: currentUser,
    approvedAt: new Date().toISOString(),
  });

  const reject = () => onUpdate({
    ...item,
    status: 'Draft',
    approvedBy: null,
    approvedAt: null,
  });

  // Status colors
  const statusColor = {
    Draft: { fg: TOK.muted, bg: TOK.bg },
    PendingApproval: { fg: '#B7791F', bg: '#FAEEDA' },
    Active: { fg: '#356512', bg: '#E6EFD6' },
    Mitigating: { fg: '#0C447C', bg: '#E6F1FB' },
    Resolved: { fg: TOK.muted, bg: TOK.bg },
    Accepted: { fg: TOK.muted, bg: TOK.bg },
    Closed: { fg: TOK.muted, bg: TOK.bg },
  }[item.status] || { fg: TOK.muted, bg: TOK.bg };

  return (
    <div style={{ border: '1px solid ' + TOK.line, borderRadius: 9, marginBottom: 8, background: TOK.surface, fontFamily: FONT_STACK }}>
      {/* Collapsed header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <span style={{ fontSize: 16 }}>{tcfg.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 11, color: TOK.muted, flexWrap: 'wrap' }}>
            <span style={{ color: tcfg.fg, fontWeight: 500 }}>{tcfg.label}</span>
            <span>· @{item.owner || '—'}</span>
            {openMitigations > 0 && <span>· {openMitigations} open action{openMitigations === 1 ? '' : 's'}</span>}
            {item.escalateToBoD && <span style={{ color: '#A32D2D', fontWeight: 500 }}>· ⬆ BoD</span>}
            {isStale && <span style={{ color: TOK.overdueFg, fontWeight: 500 }}>· ⏰ Needs review</span>}
          </div>
        </div>
        {isRisk && level && <RiskLevelBadge likelihood={item.likelihood} impact={item.impact} />}
        <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: statusColor.bg, color: statusColor.fg }}>
          {item.status}
        </span>
        {trendCfg && <span style={{ fontSize: 12 }} title={trendCfg.label}>{trendCfg.icon}</span>}
        <ChevronDown size={14} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>

      {expanded && (
        <div style={{ padding: '12px 14px 14px', borderTop: '1px solid ' + TOK.line, background: TOK.bg }}>
          {/* Approval banner */}
          {item.status === 'PendingApproval' && isOwner && item.createdBy !== currentUser && (
            <div style={{ padding: '10px 12px', background: '#FAEEDA', border: '1px solid #F0D490', borderRadius: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14 }}>⏳</span>
              <div style={{ flex: 1, fontSize: 12, color: '#7A5D00' }}>
                <strong>Pending your approval</strong>
                <div style={{ fontSize: 11, marginTop: 2 }}>Submitted by {item.createdBy} · {fmtDateShort(item.createdAt)}</div>
              </div>
              <Btn size="sm" variant="primary" onClick={approve}>✓ Approve</Btn>
              <Btn size="sm" onClick={reject}>✕ Reject</Btn>
            </div>
          )}

          {/* Type-specific metadata */}
          {isRisk && (
            <div style={{ marginBottom: 10, fontSize: 12, color: TOK.ink }}>
              <strong>Risk matrix:</strong> Likelihood <em>{item.likelihood}</em> × Impact <em>{item.impact}</em> = <strong>{level}</strong>
              {item.mitigationPlan && <div style={{ marginTop: 4, color: TOK.muted, fontSize: 11.5 }}>Plan: {item.mitigationPlan}</div>}
            </div>
          )}
          {item.type === 'Assumption' && (
            <div style={{ marginBottom: 10, fontSize: 12, color: TOK.ink }}>
              <strong>Validation:</strong> {item.validated ? '✓ Validated' : 'Pending'} · deadline {item.validationDeadline ? fmtDateShort(item.validationDeadline) : '—'} · owner @{item.validationOwner || '—'}
            </div>
          )}
          {item.type === 'Issue' && (
            <div style={{ marginBottom: 10, fontSize: 12, color: TOK.ink }}>
              <strong>Severity:</strong> {item.severity || '—'} · raised {item.raisedAt ? fmtDateShort(item.raisedAt) : '—'}
            </div>
          )}
          {item.type === 'Dependency' && (
            <div style={{ marginBottom: 10, fontSize: 12, color: TOK.ink }}>
              <strong>Depends on:</strong> {item.dependsOn || '—'} · blocked until {item.blockedUntil ? fmtDateShort(item.blockedUntil) : '—'}
            </div>
          )}

          {/* Trend & review history */}
          <TrendHistoryBlock item={item} currentUser={currentUser} teamMembers={teamMembers} onAddReview={handleAddReview} />

          {/* Mitigation actions */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Mitigation actions ({(item.mitigationActions || []).length})
            </div>
            {(item.mitigationActions || []).map((a) => (
              <MitigationActionRow
                key={a.id}
                action={a}
                currentUser={currentUser}
                teamMembers={teamMembers}
                onUpdate={(diff) => handleMitigationUpdate(a.id, diff)}
                onRemove={() => handleMitigationRemove(a.id)}
              />
            ))}
            {!addingAction && (
              <Btn size="sm" onClick={() => setAddingAction(true)} style={{ marginTop: 4 }}><Plus size={11} /> Add action</Btn>
            )}
            {addingAction && (
              <div style={{ marginTop: 8, padding: 10, background: TOK.surface, borderRadius: 7, border: '1px solid ' + TOK.line }}>
                <input
                  value={actionDraftName}
                  onChange={(e) => setActionDraftName(e.target.value)}
                  placeholder="What needs to be done?"
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box', marginBottom: 6 }}
                />
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <select
                    value={actionDraftPic}
                    onChange={(e) => setActionDraftPic(e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, fontFamily: FONT_STACK, fontSize: 12, background: TOK.surface, color: TOK.ink }}>
                    <option value="">(owner unassigned)</option>
                    {(picSuggestions || []).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <input
                    type="date"
                    value={actionDraftDue}
                    onChange={(e) => setActionDraftDue(e.target.value)}
                    style={{ padding: '6px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, fontFamily: FONT_STACK, fontSize: 12, background: TOK.surface, color: TOK.ink }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <Btn size="sm" variant="ghost" onClick={() => { setAddingAction(false); setActionDraftName(''); setActionDraftPic(''); setActionDraftDue(''); }}>Cancel</Btn>
                  <Btn size="sm" variant="primary" onClick={handleMitigationAdd} disabled={!actionDraftName.trim()}>Add action</Btn>
                </div>
              </div>
            )}
          </div>

          {/* Status transitions */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid ' + TOK.line, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500 }}>Change status:</span>
            {(item.status === 'Active' || item.status === 'Mitigating') && (
              <>
                {isRisk && item.status === 'Active' && <Btn size="sm" onClick={() => setStatus('Mitigating')}>→ Mitigating</Btn>}
                {item.type === 'Issue' && <Btn size="sm" onClick={() => setStatus('Resolved')}>→ Resolved</Btn>}
                {isRisk && <Btn size="sm" onClick={() => setStatus('Accepted')}>→ Accepted</Btn>}
                <Btn size="sm" onClick={() => setStatus('Closed')}>→ Closed</Btn>
              </>
            )}
            {item.status === 'Resolved' || item.status === 'Accepted' ? (
              <Btn size="sm" onClick={() => setStatus('Closed')}>→ Closed</Btn>
            ) : null}
            {onDelete && (item.createdBy === currentUser || isOwner) && (
              <button
                onClick={onDelete}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: TOK.muted, cursor: 'pointer', fontSize: 11, fontFamily: FONT_STACK }}
                title="Delete this RAID item">
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify lint + build**

```
npm run lint
npm run build
```

Expected: previously-unused warnings (RiskLevelBadge, MitigationActionRow, TrendHistoryBlock) DROP because RAIDCard now consumes them. RAIDCard itself adds 1 unused-vars warning (consumer is Task 7). Net: ~-2 warnings.

- [ ] **Step 3: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): RAIDCard with approval banner + status transitions"
```

---

### Task 7: `RaidRegisterView` (top-level view)

**Files:**
- Modify: `src/App.jsx` — insert after `RAIDCard`.

**Why:** The top-level view rendered when `view === 'raid'`. Has program sidebar (with risk-level dots + ⏳/⏰ badges), filter tabs (All / Risk / Assumption / Issue / Dependency), status toggle (Active / Closed / All), summary strip, card list, and "+ Add" button that opens `AddRAIDForm`.

**Cross-project mode:** When `currentProjectId` is null (all-projects mode), the sidebar shows `Project › Program` and aggregates across all projects. When a project is selected, only that project's programs.

- [ ] **Step 1: Insert `RaidRegisterView`**

```js
// v30 RAID Phase 2 — Top-level RAID Register view. Two-panel layout: program
// sidebar on the left, item list + filters + summary on the right. Supports
// single-project and all-projects modes.
function RaidRegisterView({ projects, currentProjectId, author, isOwner, teamMembers, scopeProgramId, onApplyRaidUpdate, onRaidNavigate, dialogs }) {
  // Hooks before any early return.
  const [selectedProgramKey, setSelectedProgramKey] = useState(null);
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('Active'); // Active | Closed | All
  const [showAddForm, setShowAddForm] = useState(false);

  // Build a flat list of {projectId, programId, project, program} entries.
  const allProgramEntries = useMemo(() => {
    const entries = [];
    const sourceProjects = currentProjectId ? [projects[currentProjectId]].filter(Boolean) : Object.values(projects || {});
    for (const proj of sourceProjects) {
      for (const pg of (proj.programs || [])) {
        if (scopeProgramId && pg.id !== scopeProgramId) continue;
        entries.push({
          key: `${proj.id}::${pg.id}`,
          projectId: proj.id,
          programId: pg.id,
          project: proj,
          program: pg,
        });
      }
    }
    return entries;
  }, [projects, currentProjectId, scopeProgramId]);

  // Auto-select first program if none selected, or if selection no longer exists.
  useEffect(() => {
    if (allProgramEntries.length === 0) return;
    if (!selectedProgramKey || !allProgramEntries.find((e) => e.key === selectedProgramKey)) {
      setSelectedProgramKey(allProgramEntries[0].key);
    }
  }, [allProgramEntries, selectedProgramKey]);

  const selectedEntry = allProgramEntries.find((e) => e.key === selectedProgramKey);
  const picSuggestions = useMemo(() => {
    if (!selectedEntry) return [];
    const names = new Set();
    (selectedEntry.project.teamMembers || []).forEach((m) => m.name && names.add(m.name));
    (selectedEntry.project.contributorRegistry || []).forEach((r) => r.name && names.add(r.name));
    return Array.from(names).sort();
  }, [selectedEntry]);

  // Visibility filter — Draft visible only to creator; PendingApproval visible to creator + owner.
  const visibleItems = useMemo(() => {
    if (!selectedEntry) return [];
    return (selectedEntry.program.raid || []).filter((item) => {
      if (item.status === 'Draft' && item.createdBy !== author) return false;
      if (item.status === 'PendingApproval' && item.createdBy !== author && !isOwner) return false;
      return true;
    });
  }, [selectedEntry, author, isOwner]);

  // Apply type + status filters.
  const filteredItems = useMemo(() => {
    return visibleItems.filter((item) => {
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;
      const closed = item.status === 'Closed' || item.status === 'Resolved' || item.status === 'Accepted';
      if (statusFilter === 'Active' && closed) return false;
      if (statusFilter === 'Closed' && !closed) return false;
      return true;
    }).sort((a, b) => {
      // Sort PendingApproval first, then by computed level desc, then by createdAt desc.
      if (a.status === 'PendingApproval' && b.status !== 'PendingApproval') return -1;
      if (b.status === 'PendingApproval' && a.status !== 'PendingApproval') return 1;
      const levelOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const al = a.type === 'Risk' ? levelOrder[raidRiskLevel(a.likelihood, a.impact)] : 4;
      const bl = b.type === 'Risk' ? levelOrder[raidRiskLevel(b.likelihood, b.impact)] : 4;
      if (al !== bl) return al - bl;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [visibleItems, typeFilter, statusFilter]);

  // Summary strip counts.
  const summary = useMemo(() => {
    const items = visibleItems.filter((i) => i.status !== 'Closed' && i.status !== 'Resolved' && i.status !== 'Accepted');
    const risks = items.filter((i) => i.type === 'Risk');
    const counts = {
      Critical: risks.filter((r) => raidRiskLevel(r.likelihood, r.impact) === 'Critical').length,
      High: risks.filter((r) => raidRiskLevel(r.likelihood, r.impact) === 'High').length,
      Issue: items.filter((i) => i.type === 'Issue').length,
      Assumption: items.filter((i) => i.type === 'Assumption' && !i.validated).length,
      stale: items.filter((i) => raidDaysSinceReview(i) > RAID_REVIEW_STALE_DAYS && (i.status === 'Active' || i.status === 'Mitigating')).length,
    };
    return counts;
  }, [visibleItems]);

  // Type tab counts (over visible items, ignoring status filter so the counts don't jump).
  const typeCounts = useMemo(() => ({
    All: visibleItems.length,
    Risk: visibleItems.filter((i) => i.type === 'Risk').length,
    Assumption: visibleItems.filter((i) => i.type === 'Assumption').length,
    Issue: visibleItems.filter((i) => i.type === 'Issue').length,
    Dependency: visibleItems.filter((i) => i.type === 'Dependency').length,
  }), [visibleItems]);

  const handleSave = (newItem) => {
    if (!selectedEntry) return;
    onApplyRaidUpdate(newItem, selectedEntry.projectId, selectedEntry.programId, 'raid');
    setShowAddForm(false);
  };

  const handleUpdate = (updatedItem) => {
    if (!selectedEntry) return;
    onApplyRaidUpdate(updatedItem, selectedEntry.projectId, selectedEntry.programId, 'raid');
  };

  const handleDelete = async (item) => {
    if (!selectedEntry) return;
    const ok = await dialogs.confirm({ title: 'Delete RAID item?', message: `Delete "${item.title}"? This cannot be undone.`, okLabel: 'Delete' });
    if (!ok) return;
    // Apply as a special "filter out" — re-fetch project, mutate, save.
    // Simpler path: encode delete by replacing the program raid with array sans this item.
    const proj = projects[selectedEntry.projectId];
    const updated = cloneDeep(proj);
    updated.programs = updated.programs.map((p) => p.id === selectedEntry.programId ? { ...p, raid: (p.raid || []).filter((r) => r.id !== item.id) } : p);
    // Reuse applyRaidUpdate? No — it's append/merge by id. We need a direct mutation. Tell parent via a separate callback. For Phase 2, we'll route through onApplyRaidUpdate with a synthetic "deleted" marker? No — clean delete is better. Use onRaidNavigate's parent callback for project replace.
    // SIMPLER: keep delete inside this view and call dialogs.confirm + onApplyRaidUpdate is not enough.
    // For Phase 2, lift onDelete to parent: pass an onDeleteRaid callback.
    // To avoid scope creep here, we accept a separate prop: onRaidDelete(itemId, projectId, programId).
    if (onRaidNavigate?.deleteHandler) {
      onRaidNavigate.deleteHandler(item.id, selectedEntry.projectId, selectedEntry.programId);
    }
  };

  if (allProgramEntries.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: TOK.muted, padding: 40, textAlign: 'center', fontFamily: FONT_STACK }}>
        <div style={{ fontSize: 32 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No programs to show</div>
        <div style={{ fontSize: 12, color: TOK.subtle, maxWidth: 400 }}>Create a program first, then come back to log Risks, Assumptions, Issues, or Dependencies.</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', fontFamily: FONT_STACK }}>
      {/* Program sidebar */}
      <div style={{ width: 200, borderRight: '1px solid ' + TOK.line, background: TOK.bg, overflowY: 'auto', padding: '12px 8px' }}>
        <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 8px 8px' }}>
          Programs ({allProgramEntries.length})
        </div>
        {allProgramEntries.map((e) => {
          const active = (e.program.raid || []).filter((r) => r.status === 'Active' || r.status === 'Mitigating');
          const risks = active.filter((r) => r.type === 'Risk');
          const highestLevel = risks.length === 0 ? null : risks.reduce((acc, r) => {
            const lvl = raidRiskLevel(r.likelihood, r.impact);
            const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
            if (acc === null) return lvl;
            return order[lvl] < order[acc] ? lvl : acc;
          }, null);
          const dotColor = highestLevel === 'Critical' ? '#A32D2D' : highestLevel === 'High' ? '#A32D2D' : highestLevel === 'Medium' ? '#B7791F' : highestLevel === 'Low' ? '#356512' : 'transparent';
          const hasPending = (e.program.raid || []).some((r) => r.status === 'PendingApproval');
          const hasStale = active.some((r) => raidDaysSinceReview(r) > RAID_REVIEW_STALE_DAYS);
          const selected = selectedProgramKey === e.key;
          return (
            <button
              key={e.key}
              onClick={() => setSelectedProgramKey(e.key)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                marginBottom: 2,
                background: selected ? TOK.surface : 'transparent',
                color: TOK.ink,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: FONT_STACK,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentProjectId ? e.program.name : `${e.project.name} › ${e.program.name}`}
              </span>
              {hasPending && <span title="Pending approval">⏳</span>}
              {hasStale && <span title="Needs review" style={{ fontSize: 11 }}>⏰</span>}
            </button>
          );
        })}
      </div>

      {/* Main panel */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px' }}>
        {selectedEntry && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TOK.ink }}>
                {selectedEntry.program.name}
              </h2>
              <span style={{ fontSize: 12, color: TOK.muted }}>· RAID Register</span>
              <div style={{ flex: 1 }} />
              <Btn size="sm" variant="primary" onClick={() => setShowAddForm(true)}><Plus size={12} /> Add</Btn>
            </div>

            {/* Summary strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8, marginBottom: 12, fontSize: 12, color: TOK.ink, flexWrap: 'wrap' }}>
              {summary.Critical > 0 && <span><strong style={{ color: '#7B1D1D' }}>{summary.Critical}</strong> Critical</span>}
              {summary.High > 0 && <span><strong style={{ color: '#A32D2D' }}>{summary.High}</strong> High</span>}
              {summary.Issue > 0 && <span>🔥 <strong>{summary.Issue}</strong> open</span>}
              {summary.Assumption > 0 && <span>💡 <strong>{summary.Assumption}</strong> unvalidated</span>}
              {summary.stale > 0 && <span style={{ color: TOK.overdueFg }}>⏰ <strong>{summary.stale}</strong> needs review</span>}
              {summary.Critical + summary.High + summary.Issue + summary.Assumption + summary.stale === 0 && (
                <span style={{ color: TOK.subtle, fontStyle: 'italic' }}>No active items.</span>
              )}
            </div>

            {/* Type filter tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, background: TOK.bg, padding: 3, borderRadius: 8, fontSize: 12 }}>
              {['All', 'Risk', 'Assumption', 'Issue', 'Dependency'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  style={{
                    flex: 1,
                    fontFamily: FONT_STACK,
                    fontSize: 12,
                    fontWeight: 500,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: typeFilter === t ? TOK.surface : 'transparent',
                    color: typeFilter === t ? TOK.ink : TOK.muted,
                    cursor: 'pointer',
                    boxShadow: typeFilter === t ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}>
                  {t === 'All' ? 'All' : RAID_TYPES[t]?.icon} {t === 'All' ? '' : t} ({typeCounts[t]})
                </button>
              ))}
            </div>

            {/* Status toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center', fontSize: 11.5, color: TOK.muted }}>
              <span style={{ fontWeight: 500 }}>Status:</span>
              {['Active', 'Closed', 'All'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    fontFamily: FONT_STACK,
                    fontSize: 11.5,
                    fontWeight: 500,
                    padding: '3px 9px',
                    borderRadius: 999,
                    border: '1px solid ' + (statusFilter === s ? TOK.ink : TOK.line),
                    background: statusFilter === s ? TOK.ink : TOK.surface,
                    color: statusFilter === s ? '#fff' : TOK.muted,
                    cursor: 'pointer',
                  }}>
                  {s}
                </button>
              ))}
            </div>

            {/* Card list */}
            {filteredItems.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: TOK.subtle, fontStyle: 'italic' }}>
                No items match the current filters.
              </div>
            ) : (
              filteredItems.map((item) => (
                <RAIDCard
                  key={item.id}
                  item={item}
                  isOwner={isOwner}
                  currentUser={author}
                  teamMembers={teamMembers}
                  picSuggestions={picSuggestions}
                  onUpdate={handleUpdate}
                  onDelete={() => handleDelete(item)}
                />
              ))
            )}

            {showAddForm && (
              <AddRAIDForm
                onSave={handleSave}
                onCancel={() => setShowAddForm(false)}
                currentUser={author}
                teamMembers={teamMembers}
                picSuggestions={picSuggestions}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

**Note on delete handling:** The current `applyRaidUpdate` only handles append/merge, not delete. We handle delete inline by reaching back to the parent through a separate callback. For Phase 2, the simplest approach is to delete via a direct project-update in the parent — see Task 8 for how `RaidRegisterView` is wired up.

- [ ] **Step 2: Verify lint + build**

```
npm run lint
npm run build
```

Expected: previously-unused warnings for `RAIDCard` and `AddRAIDForm` drop because RaidRegisterView consumes them. RaidRegisterView itself gets 1 unused-vars warning (Task 8 wires it). Net: ~-1 warning.

- [ ] **Step 3: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): RaidRegisterView with sidebar + filters + summary strip"
```

---

### Task 8: Wire 'raid' tab + view branch + delete handler

**Files:**
- Modify: `src/App.jsx` — tab strip IIFE at [L10451-10485](src/App.jsx#L10451-L10485), view router around [L10550+](src/App.jsx#L10550). Also add a small `onRaidDelete` callback in App.

**Why:** Bring all the components together. Adds the RAID tab to the strip (after Aggregation, before owner-only Portfolio), wires the view branch in the router, hides the tab during impersonation, and exposes the delete handler that `RaidRegisterView` needs.

- [ ] **Step 1: Add `raidPendingBadge` useMemo inside App**

Find the existing `myWorkBadge` useMemo at ~L9787 (search for `const myWorkBadge = useMemo`). Insert a new useMemo on the line after it ends:

```js
  // v30 RAID Phase 2 — Owner-only pending approval count for the RAID tab badge.
  const raidPendingBadge = useMemo(() => {
    if (!isOwner) return 0;
    let n = 0;
    for (const proj of Object.values(projects || {})) {
      for (const pg of (proj.programs || [])) {
        for (const r of (pg.raid || [])) {
          if (r.status === 'PendingApproval') n++;
        }
      }
    }
    return n;
  }, [projects, isOwner]);
```

- [ ] **Step 2: Add `deleteRaidItem` callback inside App**

Find the existing `applyRaidUpdate` (added in Task 1). Insert this on the line after it ends:

```js
  // v30 RAID Phase 2 — Delete a RAID item. Distinct from applyRaidUpdate because
  // delete is not a merge. Logs a typed raid_delete event.
  const deleteRaidItem = useCallback((itemId, projectId, programId, source = '', actingAs = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const program = (targetProj.programs || []).find((p) => p.id === programId);
    const oldItem = (program?.raid || []).find((r) => r.id === itemId);
    if (!oldItem) return;
    const updated = cloneDeep(targetProj);
    updated.programs = updated.programs.map((p) =>
      p.id !== programId ? p : { ...p, raid: (p.raid || []).filter((r) => r.id !== itemId) }
    );
    updateProject(updated);
    const tag = source ? ` (from ${source})` : '';
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    logActivityForProject(projectId, {
      type: 'raid_delete',
      description: `${actingPrefix}Deleted ${oldItem.type} "${oldItem.title}"${tag}`,
    });
  }, [projects, updateProject, logActivityForProject]);
```

- [ ] **Step 3: Add the RAID tab to the tab strip**

Find the `allTabs` array literal inside the IIFE at ~L10453 (search for `id: 'aggregation'`). Insert the new tab item between `aggregation` and `activity` (place RAID just after Aggregation per spec §6 — "after Aggregation, before Portfolio"):

Find:
```js
                { id: 'aggregation', label: 'Aggregation', icon: <Activity size={12} /> },
                { id: 'activity', label: 'Activity', icon: <Activity size={12} /> },
```

Replace with:
```js
                { id: 'aggregation', label: 'Aggregation', icon: <Activity size={12} /> },
                { id: 'raid', label: 'RAID', icon: <AlertTriangle size={12} /> },
                { id: 'activity', label: 'Activity', icon: <Activity size={12} /> },
```

- [ ] **Step 4: Render the RAID tab badge (owner-only pending count)**

Find the existing badge render block in the tab strip — the one that renders `myWorkBadge` for `'my-work'`. It looks like:

```js
                }} title={v.ownerOnly ? 'Workspace owner only' : undefined}>{v.icon}{v.label}{v.id === 'my-work' && myWorkBadge > 0 && (
                  <span style={{
                    marginLeft: 2, padding: '0 6px', borderRadius: 999,
                    background: TOK.overdueFg, color: '#fff', fontSize: 10, fontWeight: 500,
                    lineHeight: '14px', minWidth: 16, textAlign: 'center',
                  }}>{myWorkBadge}</span>
                )}{v.count > 0 && <span style={{ fontSize: 10, color: TOK.muted, fontWeight: 400 }}>·{v.count}</span>}</button>
```

Add a similar conditional for `raid`:

Replace the long line above with:
```js
                }} title={v.ownerOnly ? 'Workspace owner only' : undefined}>{v.icon}{v.label}{v.id === 'my-work' && myWorkBadge > 0 && (
                  <span style={{
                    marginLeft: 2, padding: '0 6px', borderRadius: 999,
                    background: TOK.overdueFg, color: '#fff', fontSize: 10, fontWeight: 500,
                    lineHeight: '14px', minWidth: 16, textAlign: 'center',
                  }}>{myWorkBadge}</span>
                )}{v.id === 'raid' && raidPendingBadge > 0 && (
                  <span style={{
                    marginLeft: 2, padding: '0 6px', borderRadius: 999,
                    background: '#B7791F', color: '#fff', fontSize: 10, fontWeight: 500,
                    lineHeight: '14px', minWidth: 16, textAlign: 'center',
                  }} title={`${raidPendingBadge} pending approval${raidPendingBadge === 1 ? '' : 's'}`}>{raidPendingBadge}</span>
                )}{v.count > 0 && <span style={{ fontSize: 10, color: TOK.muted, fontWeight: 400 }}>·{v.count}</span>}</button>
```

- [ ] **Step 5: Add the view router branch**

Find the existing view branches in the router (~L10550+). Find a good neighbor — e.g. the `view === 'aggregation'` line:

```js
              {view === 'aggregation' && <AggregationView ... />}
```

Insert immediately after it (or in the appropriate slot near other top-level views):

```js
              {view === 'raid' && (
                <RaidRegisterView
                  projects={projects}
                  currentProjectId={isAllProjectsMode ? null : currentId}
                  author={effectiveAuthor}
                  isOwner={isOwner && !impersonatingAs}
                  teamMembers={teamMembers}
                  scopeProgramId={scopeProgramId}
                  onApplyRaidUpdate={(item, projectId, programId, source) =>
                    applyRaidUpdate(item, projectId, programId, source || 'raid', impersonatingAs || '')
                  }
                  onRaidNavigate={{
                    deleteHandler: (itemId, projectId, programId) =>
                      deleteRaidItem(itemId, projectId, programId, 'raid', impersonatingAs || ''),
                  }}
                  dialogs={dialogs}
                />
              )}
```

(The `onRaidNavigate.deleteHandler` shape matches how `RaidRegisterView.handleDelete` calls it — see Task 7.)

- [ ] **Step 6: Hide RAID tab during impersonation**

The existing impersonation filter at L10468 is:
```js
              const visibleTabs = impersonatingAs ? allTabs.filter((t) => t.id === 'my-work') : allTabs;
```

This already filters to ONLY my-work during impersonation, so RAID will be hidden automatically. No change needed for impersonation gating.

- [ ] **Step 7: Verify lint + build**

```
npm run lint
npm run build
```

Expected: previously-unused warnings for `applyRaidUpdate` and `RaidRegisterView` DROP because both are now consumed. Net: ~-2 warnings from this task. Final Phase 2 net should be near or slightly below pre-Phase-2 baseline.

- [ ] **Step 8: Commit**

```
git add src/App.jsx
git commit -m "feat(raid): wire RAID tab + view branch + delete handler"
```

- [ ] **Step 9: Manual smoke**

Cannot be done by the implementer — user-driven. The implementer should report that Task 8 is complete and the RAID tab should appear in the tab strip.

---

### Phase 2 acceptance criteria (verified at end)

After all 8 tasks complete:
1. New "RAID" tab appears in the tab strip (between Aggregation and Activity).
2. Clicking the tab opens `RaidRegisterView`.
3. Owner sees a badge with count of pending-approval items (amber/yellow color).
4. Non-owner sees no badge.
5. Tab disappears during impersonation (auto-handled by existing impersonation filter).
6. `RaidRegisterView` shows program sidebar, filters, summary strip.
7. "+ Add" button opens `AddRAIDForm` modal with 4 type tabs.
8. Saved item appears in the list with `PendingApproval` status.
9. Owner can expand the pending item → sees approval banner → clicks Approve → status becomes Active.
10. Owner can also reject → status returns to Draft (visible only to creator).
11. Expanding an Active item: shows trend history (empty or with creator's initial note), mitigation actions list, status transition buttons.
12. "Add review note" form: pick trend, type note, save → history grows + lastReviewedAt updates + card trend badge updates.
13. "Add action" form: type name, pick owner, pick due → action appears in list.
14. Assignee can click ✓ Done on their own mitigation action.
15. Each mitigation action expandable → comment thread + post comment.
16. Status transition buttons work (Active → Mitigating, → Resolved, → Accepted, → Closed depending on type).
17. Delete handler removes the item with confirmation dialog.
18. Activity log shows `raid_create`, `raid_approve`, `raid_review`, `raid_action_add`, `raid_action_done`, etc. events.
19. Impersonating owner adds entries with `acting as <name>: ` prefix while `activity.author` stays the real user.
20. All other existing views (My Work, Outline, Gantt, etc.) work unchanged.
21. Build green, lint baseline net negative or near zero.

---

## Self-Review Notes

**Spec coverage:**
- Spec §2 (RAID Register view): ✅ sidebar + filters + summary + card list — Task 7
- Spec §2a (Trend & Review History): ✅ Task 4
- Spec §2b (Add form): ✅ Task 5
- Spec §2c (Approval workflow): ✅ banner in Task 6, owner check via `isOwner` prop
- Spec §2d (Mitigation action add form): ✅ inline form inside RAIDCard, Task 6
- Spec §6 (Navigation tab): ✅ Task 8
- Spec §9.1 (riskLevel computed): ✅ `raidRiskLevel` (Phase 1) used everywhere, never stored
- Spec §9.2 (visibility rules): ✅ `visibleItems` filter in RaidRegisterView
- Spec §9.3 (escalateToBoD auto+overridable): ✅ `bodTouched` flag in AddRAIDForm
- Spec §9.4 (mitigation actions separate): ✅ live inside `item.mitigationActions[]`
- Spec §9.5 (lastReviewedAt only on review save): ✅ only `handleAddReview` in RAIDCard updates it
- Spec §9.6 (history append-only): ✅ all `handleAddReview` does is `[...history, newEntry]`
- Spec §9.7 (Needs review badge 7d): ✅ uses `RAID_REVIEW_STALE_DAYS` (Phase 1)
- Spec §9.8 (tab badge owner-only): ✅ `raidPendingBadge` returns 0 if !isOwner
- Spec §9.9 (program lookup): ✅ RaidRegisterView walks programs to build entries

**Placeholders:** None — every code step has a complete code block.

**Type consistency:** Function names (`applyRaidUpdate`, `RAIDCard`, `RaidRegisterView`, `MitigationActionRow`, `TrendHistoryBlock`, `AddRAIDForm`, `RiskMatrixSelector`, `RiskLevelBadge`) consistent across tasks. Prop names (`onUpdate`, `onApplyRaidUpdate`, `onDelete`, `onRaidNavigate`, `currentUser`, `isOwner`, `teamMembers`, `picSuggestions`) consistent.

**No premature abstraction:** Delete is handled by a separate `deleteRaidItem` callback rather than overloading `applyRaidUpdate` — same pattern as the rest of the codebase.

**Frequent commits:** 8 commits across 8 tasks. Each task can be reviewed/reverted independently.

**File growth:** Estimated +800 to +1000 lines on src/App.jsx. Still within single-file convention; if the file becomes painful to navigate in Phase 3+, that's a future refactor concern, not a Phase 2 blocker.

---

## Execution

When all 8 tasks pass spec + quality review:
1. User runs manual browser smoke (the 21 acceptance criteria above).
2. On pass, tag `v30-raid-phase-2`.
3. Move to Phase 3 (task detail RAID signal block).
