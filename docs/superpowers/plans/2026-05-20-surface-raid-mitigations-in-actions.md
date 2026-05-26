# Surface RAID mitigations in Actions + My Work — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render RAID mitigation actions in the Actions view, My Work "Action items" section, and By Project card Action block, so users see every action they own — including RAID mitigations — in the places they already look.

**Architecture:** Virtual merge at render time — no schema migration. Two new pure helpers (`getProjectMitigations`, `applyMitigationUpdate`) and one new row component (`MitigationRowInline`) that mirrors `ActionRowInline`'s expand UX. `computeMyWork` is extended to bucket mitigations into the existing `actionItems` buckets with `kind: 'mitigation'` so MyWorkView and ByProjectCard automatically pick them up.

**Tech Stack:** React 18, single big `src/App.jsx`. No new dependencies. No test framework — `npm run build` is the gate.

**Spec reference:** `docs/superpowers/specs/2026-05-20-surface-raid-mitigations-in-actions-design.md`

**Interpretation note on AC #1 ("single feed"):** The plan renders mitigations in ActionItemsView as a clearly-labeled section directly above the regular actions list (same scroll, one visual feed). True row-by-row interleaving with the existing filter/sort/email-pics pipeline would require refactoring the whole view; the section-with-header rendering preserves visibility without that risk and matches the spirit of "user sees them in the Actions tab." My Work surfaces (which have simpler list logic) DO get true interleave via `computeMyWork`.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/App.jsx` | **Modify** | Add two helpers near line 1035 (after `computeMyRaid`). Add `MitigationRowInline` component near line 8400 (after `ActionRowInline`). Extend `computeMyWork` bucketing loop. Add a mitigations section inside `ActionItemsView`. Add `kind === 'mitigation'` branch in `MyWorkView`'s actionItems map + `ByProjectCard.renderActionEntry`. |

Single-file change. No new dependencies, no schema field, no Firestore rule change.

---

### Task 1: Add `getProjectMitigations` + `applyMitigationUpdate` helpers

**Files:**
- Modify: `src/App.jsx` — insert after the `computeMyRaid` function (locate by `grep -n "^function computeMyRaid" src/App.jsx`).

- [ ] **Step 1: Find the insertion point**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "^function computeMyRaid\|^// Aggregate credits across all projects" src/App.jsx
```

Expected: two lines. The new helpers go BETWEEN them — right after `computeMyRaid`'s closing brace, before the comment `// Aggregate credits across all projects`.

- [ ] **Step 2: Insert the helpers**

```js
// v30 — Flat list of mitigation actions across all RAID items in a project.
// Pure read; no mutation. Used by Actions view to surface mitigations next
// to regular action items, and by computeMyWork to bucket mitigations into
// the My Work actionItems buckets.
//
// opts:
//   picOnly  — only mitigations assigned to this PIC (default: no filter)
//   openOnly — only mitigations whose status !== 'Done' (default: true)
function getProjectMitigations(project, { picOnly = null, openOnly = true } = {}) {
  if (!project?.programs) return [];
  const out = [];
  for (const pg of project.programs) {
    for (const item of (pg.raid || [])) {
      for (const mitigation of (item.mitigationActions || [])) {
        if (openOnly && mitigation.status === 'Done') continue;
        if (picOnly && mitigation.pic !== picOnly) continue;
        out.push({
          kind: 'mitigation',
          mitigation,
          parentItem: item,
          parentProgram: pg,
          project,
        });
      }
    }
  }
  return out;
}

// v30 — Produce a new project object with a single mitigation patched.
// Pure; caller passes the result into updateProject. The (parentProgram,
// parentItem, mitigation) triple uniquely identifies the mitigation; we
// match by id when re-assembling so reorderings inside the parent are safe.
function applyMitigationUpdate(project, parentProgram, parentItem, mitigationId, patch) {
  return {
    ...project,
    programs: (project.programs || []).map((pg) => {
      if (pg.id !== parentProgram.id) return pg;
      return {
        ...pg,
        raid: (pg.raid || []).map((it) => {
          if (it.id !== parentItem.id) return it;
          return {
            ...it,
            mitigationActions: (it.mitigationActions || []).map((m) =>
              m.id === mitigationId ? { ...m, ...patch } : m
            ),
          };
        }),
      };
    }),
  };
}
```

- [ ] **Step 3: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean. New helpers are not imported by anything yet — that's fine.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(raid): getProjectMitigations + applyMitigationUpdate helpers"
```

---

### Task 2: Add `MitigationRowInline` component

**Files:**
- Modify: `src/App.jsx` — insert after `ActionRowInline`'s closing brace (locate via `grep -n "^function ActionRowInline\|^// v30.B — Minimal row for a sub-task" src/App.jsx`).

- [ ] **Step 1: Find insertion point**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "^function ActionRowInline\|^// v30.B — Minimal row for a sub-task" src/App.jsx
```

The two matches bracket ActionRowInline. Insert the new component between them.

- [ ] **Step 2: Insert MitigationRowInline**

Note: `priorityColor` and `raidRiskLevel` are existing helpers — verify with grep before relying on them:

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "^function priorityColor\|^const raidRiskLevel" src/App.jsx
```

Expected: both exist. Then insert:

```jsx
// v30 — Inline row for a RAID mitigation action surfaced inside Actions /
// My Work / By Project. Mirrors ActionRowInline collapsed-vs-expanded UX
// but writes back to project.programs[].raid[].mitigationActions[] via
// applyMitigationUpdate. Footer has a "→ Open RAID item" link that calls
// onNavigateRaid(projectId, programId).
function MitigationRowInline({
  entry, // { mitigation, parentItem, parentProgram, project }
  author, teamMembers, picSuggestions,
  onApplyMitigation, // (newProject) => void — typically wraps updateProject
  onNavigateRaid,    // (projectId, programId) => void
  showToast,
}) {
  const { mitigation, parentItem, parentProgram, project } = entry;
  const [expanded, setExpanded] = useState(false);
  const [titleDraft, setTitleDraft] = useState(mitigation.title || '');
  useEffect(() => { setTitleDraft(mitigation.title || ''); }, [mitigation.title]);

  // Map RAID risk level → action priority pill (visual continuity with
  // the regular ActionRowInline priority chip).
  const derivedPriority = (() => {
    const lvl = parentItem.type === 'Risk'
      ? raidRiskLevel(parentItem.likelihood, parentItem.impact)
      : parentItem.level || null;
    if (!lvl) return null;
    if (lvl === 'Critical' || lvl === 'High') return 'High';
    if (lvl === 'Medium') return 'Medium';
    return 'Low';
  })();
  const pc = derivedPriority ? priorityColor(derivedPriority) : null;

  const overdue = mitigation.due && mitigation.status !== 'Done'
    && parseDate(mitigation.due) < today();

  const writePatch = (patch) => {
    const next = applyMitigationUpdate(project, parentProgram, parentItem, mitigation.id, patch);
    onApplyMitigation(next);
  };

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== mitigation.title) writePatch({ title: trimmed });
    else if (!trimmed) setTitleDraft(mitigation.title || '');
  };

  const markDone = () => {
    writePatch({ status: 'Done', completedAt: new Date().toISOString() });
    showToast && showToast('✓ Mitigation done');
  };

  const breadcrumbText = `RAID: ${parentItem.title || '(untitled risk)'}`.slice(0, 80);

  return (
    <div style={{ border: '1px solid ' + TOK.line, borderRadius: 8, marginBottom: 6, background: TOK.surface }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 44 }}>
        <span style={{ color: TOK.subtle, fontSize: 13, lineHeight: 1 }}>▢</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {expanded ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 13, fontWeight: 500, width: '100%', padding: '4px 6px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, outline: 'none' }}
            />
          ) : (
            <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <MentionedText text={mitigation.title || '(untitled mitigation)'} teamMembers={teamMembers} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', fontSize: 11, color: TOK.muted }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
              background: TOK.overdueBg, color: TOK.overdueFg,
            }}>🛡 RAID</span>
            <span>{breadcrumbText}</span>
            {mitigation.due && (
              <span style={{ color: overdue ? TOK.overdueFg : TOK.muted, fontWeight: overdue ? 500 : 400 }}>
                · 📅 {fmtDateShort(mitigation.due)}
              </span>
            )}
          </div>
        </div>
        {pc && (
          <span style={{ fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 999, color: pc.fg, background: pc.bg }}>{derivedPriority}</span>
        )}
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <StatusQuickPill status={mitigation.status || 'Open'} onChange={(st) => writePatch({ status: st })} statuses={ACTION_STATUSES} />
        </span>
        {mitigation.status !== 'Done' && (
          <Btn size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); markDone(); }} title="Mark done">✓</Btn>
        )}
        <ChevronDown size={14} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid ' + TOK.line, background: TOK.bg, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, minWidth: 50 }}>PIC</span>
            <select
              value={mitigation.pic || ''}
              onChange={(e) => writePatch({ pic: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, minWidth: 160 }}>
              <option value="">(unassigned)</option>
              {(picSuggestions || []).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, minWidth: 50 }}>Due</span>
            <input
              type="date"
              value={mitigation.due || ''}
              onChange={(e) => writePatch({ due: e.target.value || null })}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink }}
            />
          </div>
          <div style={{ fontSize: 11, color: TOK.subtle, fontStyle: 'italic', borderTop: '1px solid ' + TOK.line, paddingTop: 8 }}>
            💬 Comments and full risk context live in the RAID detail. Use "Open RAID item" below to view or comment.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid ' + TOK.line }}>
            {mitigation.status !== 'Done' && (
              <Btn size="sm" variant="approve" onClick={markDone}>✓ Mark done</Btn>
            )}
            <Btn size="sm" variant="ghost" onClick={() => onNavigateRaid && onNavigateRaid(project.id, parentProgram.id)}>
              → Open RAID item
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
```

Notes for the engineer:
- `parseDate`, `today`, `fmtDateShort`, `MentionedText`, `StatusQuickPill`, `ACTION_STATUSES`, `Btn`, `ChevronDown`, `TOK`, `FONT_STACK` are all already in scope in App.jsx — used by ActionRowInline above.
- The `variant="approve"` Btn variant is used elsewhere (search `variant="approve"` to confirm; if not, use `variant="primary"`).

- [ ] **Step 3: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean. If `variant="approve"` doesn't exist, swap to `variant="primary"` and rebuild.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(raid): MitigationRowInline component (mirrors ActionRowInline UX)"
```

---

### Task 3: Extend `computeMyWork` to bucket mitigations into `actionItems`

**Files:**
- Modify: `src/App.jsx:813-` — inside `computeMyWork`, after the existing action-items + subtasks bucketing loop, before the `return out` line.

- [ ] **Step 1: Find the right place to insert**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "out.allMentions.sort\|out.unreadMentions.sort\|function computeMyWork" src/App.jsx
```

The bucketing loop ends; sorts run, then `return out`. Insert the mitigation bucketing BEFORE the sort calls (so mitigations also get sorted into the buckets if any sort is applied later — checking the existing code, only `tasksOwned.*` and mentions are sorted; actionItems buckets are NOT sorted, so insertion order matters).

- [ ] **Step 2: Add the mitigation bucketing loop**

Inside the outer `for (const proj of Object.values(projects || {}))` loop in `computeMyWork`, AFTER the existing actionItems / subtasks bucketing block, add:

```js
    // v30 — Mitigation actions assigned to the viewer, bucketed by
    // mitigation.due into the same today/week/later structure as
    // regular action items so MyWorkView and ByProjectCard pick them
    // up alongside meeting-born actions.
    for (const pg of (proj.programs || [])) {
      for (const item of (pg.raid || [])) {
        for (const mitigation of (item.mitigationActions || [])) {
          if (mitigation.pic !== author) continue;
          if (mitigation.status === 'Done') continue;
          const due = mitigation.due ? parseDate(mitigation.due) : null;
          const enriched = {
            kind: 'mitigation',
            mitigation,
            parentItem: item,
            parentProgram: pg,
            project: proj,
          };
          if (!due) {
            out.actionItems.later.push(enriched);
          } else if (due <= todayEnd) {
            out.actionItems.today.push(enriched);
            if (due < startOfToday) {
              out.needsAttention.push({ kind: 'overdue_mitigation', mitigation, parentItem: item, parentProgram: pg, project: proj });
            }
          } else if (due <= weekEnd) {
            out.actionItems.week.push(enriched);
          } else {
            out.actionItems.later.push(enriched);
          }
        }
      }
    }
```

The `todayEnd`, `startOfToday`, `weekEnd` variables are already defined at the top of `computeMyWork` — verify with grep:

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "const startOfToday\|const todayEnd\|const weekEnd" src/App.jsx | head -5
```

If their names differ (e.g. `weekFromToday` is used in `computeMyRaid` instead of `weekEnd`), use the existing variable names — don't introduce new ones.

- [ ] **Step 3: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(my-work): bucket RAID mitigations into actionItems.{today,week,later}"
```

---

### Task 4: Wire `MitigationRowInline` into MyWorkView + ByProjectCard render branches

**Files:**
- Modify: `src/App.jsx` — `MyWorkView`'s "Action items assigned to me" map (search for `myWork.actionItems[actionsTab].map((e, i)`); `ByProjectCard.renderActionEntry` (search for `const renderActionEntry =`).

- [ ] **Step 1: Find the MyWorkView actionItems render block**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "myWork.actionItems\[actionsTab\].map\|if (e.kind === 'subtask')" src/App.jsx
```

Expected: the map callback in MyWorkView and at least one `if (e.kind === 'subtask')` branch.

- [ ] **Step 2: Add mitigation branch in MyWorkView's actionItems map**

The current code looks like:

```jsx
}) : myWork.actionItems[actionsTab].map((e, i) => {
  if (e.kind === 'subtask') {
    const sub = e.subtask;
    const parent = e.parentAction;
    return (
      <SubtaskMyWorkRow ... />
    );
  }
  const a = e.action;
  // ... renders ActionRowInline
}
```

ADD a new branch BEFORE the existing `if (e.kind === 'subtask')` check:

```jsx
  if (e.kind === 'mitigation') {
    return (
      <MitigationRowInline
        key={`mit-${actionsTab}-${e.mitigation.id || i}`}
        entry={e}
        author={author}
        teamMembers={teamMembers}
        picSuggestions={picSuggestions}
        onApplyMitigation={(nextProject) => onProjectUpdate(nextProject)}
        onNavigateRaid={onNavigateRaid}
        showToast={showToast}
      />
    );
  }
```

Verify the surrounding MyWorkView signature already has `onProjectUpdate` and `onNavigateRaid` as props — search:

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "function MyWorkView" src/App.jsx
```

Look at the destructured params. If `onProjectUpdate` isn't there, the engineer needs to add it AND pass it from the App-level render of MyWorkView. (Likely it IS already there since this is how MyRaidSection mutates RAID items — verify before changing.)

- [ ] **Step 3: Find ByProjectCard.renderActionEntry**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "const renderActionEntry" src/App.jsx
```

It currently branches on `e.kind === 'subtask'` vs treating as a regular action.

- [ ] **Step 4: Plumb `onProjectUpdate` through ByProjectView → ByProjectCard**

`MitigationRowInline.onApplyMitigation` expects a full-project replacement (because `applyMitigationUpdate` returns a new project object). The existing `onActionUpdate` in ByProjectCard's prop chain expects an action diff — not the right shape. Thread `onProjectUpdate` separately.

Steps:
1. Grep for ByProjectView and ByProjectCard signatures:
   ```bash
   cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "^function ByProjectView\|^function ByProjectCard" src/App.jsx
   ```
2. If `onProjectUpdate` is NOT in ByProjectView's destructured props, add it. Then in the JSX where ByProjectView renders `<ByProjectCard ... />`, pass `onProjectUpdate={onProjectUpdate}`.
3. If `onProjectUpdate` is NOT in ByProjectCard's destructured props, add it.
4. Verify MyWorkView's render of ByProjectView passes `onProjectUpdate`. (MyWorkView already receives `onProjectUpdate` as a prop from App — check.)

- [ ] **Step 5: Add mitigation branch in renderActionEntry**

Locate the function body:

```jsx
const renderActionEntry = (e, i) => {
  if (e.kind === 'subtask') {
    // ... SubtaskMyWorkRow
  }
  const a = e.action;
  // ... ActionRowInline
};
```

Add BEFORE the subtask branch:

```jsx
  if (e.kind === 'mitigation') {
    return (
      <MitigationRowInline
        key={`p-${project.id}-mit-${e.mitigation.id || i}`}
        entry={e}
        author={author}
        teamMembers={teamMembers}
        picSuggestions={picSuggestions}
        onApplyMitigation={(nextProject) => onProjectUpdate(nextProject)}
        onNavigateRaid={onNavigateRaid}
        showToast={showToast}
      />
    );
  }
```

- [ ] **Step 6: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(my-work): render MitigationRowInline for kind=mitigation entries"
```

---

### Task 5: Add mitigations section to ActionItemsView

**Files:**
- Modify: `src/App.jsx` — inside `ActionItemsView` (locate by `grep -n "^function ActionItemsView" src/App.jsx`).

- [ ] **Step 1: Locate ActionItemsView and its render**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "^function ActionItemsView" src/App.jsx
```

Read 100 lines starting at the function definition to understand the render structure (filter row → list).

- [ ] **Step 2: Compute mitigations in ActionItemsView**

Near the top of the function (alongside other `useMemo` / state), add:

```js
const mitigations = useMemo(
  () => getProjectMitigations(project, { openOnly: true }),
  [project]
);
```

- [ ] **Step 3: Plumb `onProjectUpdate` and `onNavigateRaid` props if not present**

Check the current signature:

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "function ActionItemsView" src/App.jsx
```

If `onProjectUpdate` is not in the signature, add it. If `onNavigateRaid` is not in the signature, add it. Update the JSX call site of `<ActionItemsView ... />` to pass both — the same handlers MyWorkView uses are already defined at App scope; pass them through.

- [ ] **Step 4: Render the mitigations section above the regular actions list**

Find the JSX return where the main filter row is rendered. RIGHT AFTER the filter row and BEFORE the regular `.map()` that renders `<ActionItemForm>` / list rows, insert:

```jsx
{mitigations.length > 0 && (
  <div style={{
    background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8,
    padding: 12, marginBottom: 14,
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
      fontSize: 12, fontWeight: 600, color: TOK.ink,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
        background: TOK.overdueBg, color: TOK.overdueFg,
      }}>🛡 RAID</span>
      Mitigations ({mitigations.length})
      <span style={{ fontSize: 11, fontWeight: 400, color: TOK.muted, marginLeft: 4 }}>
        — surfaced from RAID register so they're visible alongside actions
      </span>
    </div>
    {mitigations.map((entry, i) => (
      <MitigationRowInline
        key={`actions-mit-${entry.mitigation.id || i}`}
        entry={entry}
        author={author}
        teamMembers={teamMembers}
        picSuggestions={(teamMembers || []).map((m) => m.name).sort()}
        onApplyMitigation={(nextProject) => onProjectUpdate(nextProject)}
        onNavigateRaid={onNavigateRaid}
        showToast={showToast}
      />
    ))}
  </div>
)}
```

- [ ] **Step 5: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean. If `onProjectUpdate` was not previously plumbed, the build will fail with a clear "X is not defined" — add the prop to the signature and the call site.

- [ ] **Step 6: Manual smoke check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run dev
```

1. Open a project that has at least one RAID item with a mitigation action assigned to the current user.
2. Switch to Actions view. Confirm the 🛡 RAID mitigations section appears above the regular actions list with the right count.
3. Click a mitigation row → expand → edit PIC → blur → switch to RAID view → confirm the change persisted on the parent RAID item.
4. Click "Mark done" → row's status pill shows Done.
5. Click "→ Open RAID item" → app switches to RAID view scoped to the right program.
6. Switch to My Work → "Action items assigned to me" tab → confirm the same mitigation shows up in today/week/later according to its `due` date.
7. Switch to My Work By Project mode → expand the project → confirm the mitigation appears in that project's Action block.

- [ ] **Step 7: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(actions): surface RAID mitigations section above actions list"
```

---

### Task 6: Push + verify Vercel deploy + production smoke

- [ ] **Step 1: Confirm clean build one more time**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: `✓ built` with no TS errors and only the pre-existing chunk-size warning.

- [ ] **Step 2: Push**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git push origin main
```

- [ ] **Step 3: Wait for Vercel deploy to reach Ready**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && until npx vercel ls --yes 2>&1 | sed -n '6p' | grep -E "Ready|Error|Failed" >/dev/null; do sleep 10; done; npx vercel ls --yes 2>&1 | sed -n '5,7p'
```

Expected: most recent deploy reaches `● Ready` in <30s.

- [ ] **Step 4: Production smoke**

Open https://af-mpt.vercel.app, sign in, repeat the smoke flow from Task 5 Step 6 against the live deploy.

---

## Non-goals (Stage-2 follow-ups)

- True row-by-row interleaving of mitigations with regular actions in ActionItemsView (current plan renders mitigations as a labelled section above). If the user wants them sorted into one combined feed, that's a separate refactor of the view's filter/sort pipeline.
- Comment threading parity on mitigations (mitigation.updates[] schema, MentionedText feed). Footer "Open RAID item" link covers the comment use case for now.
- Cross-project mitigation aggregation in ActionItemsView (the view is single-project today).
- Mitigation-level subtasks.
- Item-level focus when navigating from "→ Open RAID item" (the link currently scopes to the program; scrolling to the specific item is a UX nicety to add if users complain).

## Known risks

- `onProjectUpdate` plumbing across ActionItemsView / ByProjectView / ByProjectCard / MyWorkView may already be inconsistent. Task 4 and 5 each include a "verify plumbing" step — engineer should grep before assuming a prop is present.
- The "approve" button variant for the green ✓ in the expanded mitigation row may not exist — fall back to `variant="primary"` if so.
- Switching mitigation status from a list view doesn't refresh open RAID detail panes (if any) until the user navigates — minor UX glitch, acceptable for v1.
