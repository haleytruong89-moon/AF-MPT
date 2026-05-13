# Action-Desk Redesign — Phase A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move action items to My Work section #2, add inline editing (status / mark done / reassign PIC / due date / title / comments), introduce optional `action.updates[]` schema for comment history.

**Architecture:** Single-file React invariant continues — all changes in `src/App.jsx`. A new `ActionRowInline` component mirrors the existing `TaskRowInline` C+D hybrid expand pattern. Comment scanning extends to `action.updates[]`. Diff-logger in `applyActionUpdate` learns 4 new fields.

**Tech Stack:** React 18.3, Vite 5.4, lucide-react icons, inline styles via the existing `TOK` token object. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-13-action-desk-redesign.md`

**Test workflow note:** This codebase has no test runner (no jest/vitest). Verification per task is: `npm run build` (= `tsc --noEmit && vite build`) + `npx eslint src/App.jsx`. Manual smoke test in browser only at the end after all tasks land.

---

## File structure

Only one file modified:

| File | Role |
|---|---|
| `src/App.jsx` (current 10540 lines) | All Phase A changes. Will grow ~290 lines to ~10830. |

The 5 logical units inside `App.jsx` that get touched:

1. **`computeMyWork` (~L715)** — aggregation; needs `action.updates` mention scan
2. **`TaskRowInline` (~L7516)** — reference pattern; do NOT modify
3. **New `ActionRowInline`** — placed immediately after `TaskRowInline` for visual locality
4. **`MyWorkView` Mentions section render (~L7795)** — generalize `m.task` to `m.task || m.action`
5. **`MyWorkView` Action items section (~L7881)** — reorder + swap inline JSX → `<ActionRowInline>`
6. **`applyActionUpdate` (~L9037)** — extend diff-logger with 4 new cases

Anchor strings (rather than line numbers) are used in Edit operations below to survive line-shift between tasks.

---

## Task 1: Extend `computeMyWork` mention scan to action.updates

**Files:**
- Modify: `src/App.jsx` — inside `computeMyWork`, the `for (const proj of Object.values(projects || {}))` loop

**Goal:** When the user has `@hattt4` in any action comment across any project, that comment appears in My Work's Mentions section.

- [ ] **Step 1: Read current loop body to confirm anchor**

The existing action-items walk inside `computeMyWork` looks like:

```js
    for (const a of (proj.actionItems || [])) {
      if (a.pic !== author) continue;
      if (a.status === 'Done' || a.status === 'Cancelled' || a.status === 'Dropped') continue;
      const dueDate = a.dueDate ? parseDate(a.dueDate) : null;
      const enriched = { action: a, project: proj };
      if (!dueDate) {
        out.actionItems.later.push(enriched);
      } else if (dueDate <= todayEnd) {
        out.actionItems.today.push(enriched);
        if (dueDate < startOfToday) out.needsAttention.push({ kind: 'overdue_action', ...enriched });
      } else if (dueDate <= weekEnd) {
        out.actionItems.week.push(enriched);
      } else {
        out.actionItems.later.push(enriched);
      }
    }
```

Note: this scans only actions where `a.pic === author`. The new mention scan must run for ALL actions in the project (a teammate who mentions me on someone else's action item must still notify me).

- [ ] **Step 2: Add the mention loop directly before the existing action-items walk**

Use `Edit` to replace the existing block with the extended version below. The new lines are a single `for` loop inserted ABOVE the existing PIC-filter loop. This keeps the PIC-filter behavior intact and runs the mention scan independently:

`old_string`:
```js
    for (const a of (proj.actionItems || [])) {
      if (a.pic !== author) continue;
      if (a.status === 'Done' || a.status === 'Cancelled' || a.status === 'Dropped') continue;
      const dueDate = a.dueDate ? parseDate(a.dueDate) : null;
      const enriched = { action: a, project: proj };
```

`new_string`:
```js
    // v30.A — Scan action comments for @<author> across ALL action items
    // (not just ones assigned to author). Mirrors task.updates scan above.
    for (const a of (proj.actionItems || [])) {
      for (const upd of (a.updates || [])) {
        const tokens = ((upd.text || '').match(/@([A-Za-zÀ-ỹ0-9._-]+)/g) || []).map((m) => m.slice(1).toLowerCase());
        if (!tokens.includes(authorLc)) continue;
        const item = {
          ts: upd.timestamp, postAuthor: upd.author, text: upd.text || '',
          action: a, project: proj,
        };
        out.allMentions.push(item);
        if (upd.timestamp && new Date(upd.timestamp) > lastSeen) out.unreadMentions.push(item);
      }
    }

    for (const a of (proj.actionItems || [])) {
      if (a.pic !== author) continue;
      if (a.status === 'Done' || a.status === 'Cancelled' || a.status === 'Dropped') continue;
      const dueDate = a.dueDate ? parseDate(a.dueDate) : null;
      const enriched = { action: a, project: proj };
```

- [ ] **Step 3: Verify build passes**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected output (last line): `✓ built in <N>s`. No TypeScript errors.

- [ ] **Step 4: Verify lint clean for new code**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors`. Warning count unchanged from baseline (24 pre-existing warnings).

- [ ] **Step 5: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): scan action.updates for mentions across all projects

Phase A step 1/5. computeMyWork() now collects @author mentions from
every action item's comment history, alongside the existing task
update scan. Item shape uses { action, project } instead of { task,
project, program, workstream } — MyWorkView mention renderer learns
to handle either shape in step 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `applyActionUpdate` diff-logger with 4 new fields

**Files:**
- Modify: `src/App.jsx` — inside `applyActionUpdate` (currently at ~L9037)

**Goal:** When My Work UI patches title / pic / dueDate / priority / updates, the project's activity log gets a descriptive entry.

- [ ] **Step 1: Replace the current `applyActionUpdate` body with the extended diff-logger**

`old_string`:
```js
  const applyActionUpdate = useCallback((updatedAction, projectId, source = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const oldAction = (targetProj.actionItems || []).find((a) => a.id === updatedAction.id);
    const updated = cloneDeep(targetProj);
    updated.actionItems = (updated.actionItems || []).map((a) => a.id === updatedAction.id ? { ...a, ...updatedAction } : a);
    updateProject(updated);

    const tag = source ? ` (from ${source})` : '';
    if (oldAction && oldAction.status !== updatedAction.status) {
      if (updatedAction.status === 'Done') {
        logActivityForProject(projectId, { type: 'action_complete', description: `Marked action done: "${updatedAction.title}"${tag}` });
      } else {
        logActivityForProject(projectId, { type: 'action_status_change', description: `Action "${updatedAction.title}": ${oldAction.status || 'Pending'} → ${updatedAction.status}${tag}` });
      }
    }
  }, [projects, updateProject, logActivityForProject]);
```

`new_string`:
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

    if (oldAction.status !== updatedAction.status) {
      if (updatedAction.status === 'Done') {
        log({ type: 'action_complete', description: `Marked action done: "${updatedAction.title}"${tag}` });
      } else {
        log({ type: 'action_status_change', description: `Action "${updatedAction.title}": ${oldAction.status || 'Pending'} → ${updatedAction.status}${tag}` });
      }
    }
    if (oldAction.title !== updatedAction.title) {
      log({ type: 'action_rename', description: `Renamed action "${oldAction.title}" → "${updatedAction.title}"${tag}` });
    }
    if (oldAction.pic !== updatedAction.pic) {
      log({ type: 'action_reassign', description: `Reassigned action "${updatedAction.title}": ${oldAction.pic || '—'} → ${updatedAction.pic || '—'}${tag}` });
    }
    if (oldAction.dueDate !== updatedAction.dueDate) {
      log({ type: 'action_due_change', description: `Changed action "${updatedAction.title}" due date: ${oldAction.dueDate ? fmtDateShort(oldAction.dueDate) : '—'} → ${updatedAction.dueDate ? fmtDateShort(updatedAction.dueDate) : '—'}${tag}` });
    }
    if (oldAction.priority !== updatedAction.priority) {
      log({ type: 'action_priority_change', description: `Changed action "${updatedAction.title}" priority: ${oldAction.priority || '—'} → ${updatedAction.priority || '—'}${tag}` });
    }
    if ((oldAction.updates?.length || 0) < (updatedAction.updates?.length || 0)) {
      const newest = (updatedAction.updates || [])[0];
      log({ type: 'action_comment', description: `Posted comment on action "${updatedAction.title}"${newest?.isBlocker ? ' 🚨 Blocker' : ''}${tag}` });
    }
  }, [projects, updateProject, logActivityForProject]);
```

- [ ] **Step 2: Verify build passes**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`.

- [ ] **Step 3: Verify lint clean**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors`.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): extend applyActionUpdate diff-logger for inline edits

Phase A step 2/5. applyActionUpdate now emits activity entries for 5
fields: status (existing), title, pic, dueDate, priority, and the
length of updates[] (comment posted). Each entry routes to the host
project's activity log via logActivityForProject and gets an optional
"(from <source>)" suffix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Generalize Mentions section renderer (`m.task` → `m.task || m.action`)

**Files:**
- Modify: `src/App.jsx` — inside `MyWorkView`, the Mentions section render block

**Goal:** Mention items emitted by Task 1's action.updates scan have `action` instead of `task`. The renderer must read either.

- [ ] **Step 1: Replace the mention card body to handle both shapes**

`old_string`:
```js
        {myWork.allMentions.slice(0, 12).map((m, i) => {
          const unread = m.ts && new Date(m.ts) > new Date(lastSeenAt || 0);
          return (
            <div key={`m-${i}`} style={{
              padding: '8px 12px', marginBottom: 6, borderRadius: 6,
              background: unread ? TOK.mentionBg : TOK.bg,
              border: '1px solid ' + (unread ? TOK.mention + '30' : TOK.line),
            }}>
              <div style={{ fontSize: 11, color: TOK.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                {unread && <span style={{ fontSize: 9, fontWeight: 600, color: TOK.mention, background: '#fff', padding: '1px 5px', borderRadius: 4 }}>UNREAD</span>}
                <span style={{ color: TOK.ink, fontWeight: 500 }}>{m.postAuthor || '—'}</span>
                <span>· {myWorkTimeAgo(m.ts)} ·</span>
                <span>in "{m.task.name}"</span>
              </div>
              <div style={{ fontSize: 13, color: TOK.ink, marginTop: 4, lineHeight: 1.4 }}>
                <MentionedText text={m.text} teamMembers={teamMembers} />
              </div>
              <div style={{ marginTop: 6 }}>
                <Btn size="sm" variant="ghost" onClick={() => onTaskClick(m.task.id, m.project.id)}>→ Open task</Btn>
              </div>
            </div>
          );
        })}
```

`new_string`:
```js
        {myWork.allMentions.slice(0, 12).map((m, i) => {
          const unread = m.ts && new Date(m.ts) > new Date(lastSeenAt || 0);
          const isAction = !!m.action;
          const name = isAction ? m.action.title : m.task.name;
          const kindLabel = isAction ? 'action' : 'task';
          const handleOpen = isAction
            ? () => onActionClick && onActionClick(m.project.id)
            : () => onTaskClick(m.task.id, m.project.id);
          return (
            <div key={`m-${i}`} style={{
              padding: '8px 12px', marginBottom: 6, borderRadius: 6,
              background: unread ? TOK.mentionBg : TOK.bg,
              border: '1px solid ' + (unread ? TOK.mention + '30' : TOK.line),
            }}>
              <div style={{ fontSize: 11, color: TOK.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                {unread && <span style={{ fontSize: 9, fontWeight: 600, color: TOK.mention, background: '#fff', padding: '1px 5px', borderRadius: 4 }}>UNREAD</span>}
                <span style={{ color: TOK.ink, fontWeight: 500 }}>{m.postAuthor || '—'}</span>
                <span>· {myWorkTimeAgo(m.ts)} ·</span>
                <span>in {kindLabel} "{name || '(untitled)'}"</span>
              </div>
              <div style={{ fontSize: 13, color: TOK.ink, marginTop: 4, lineHeight: 1.4 }}>
                <MentionedText text={m.text} teamMembers={teamMembers} />
              </div>
              <div style={{ marginTop: 6 }}>
                <Btn size="sm" variant="ghost" onClick={handleOpen}>→ Open {kindLabel}</Btn>
              </div>
            </div>
          );
        })}
```

- [ ] **Step 2: Verify build passes**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`.

- [ ] **Step 3: Verify lint clean**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors`.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): mention renderer handles task and action shapes

Phase A step 3/5. Mention card detects whether the source is a task
or an action via m.action presence, renders the right name, and the
"→ Open" button routes to onTaskClick or onActionClick accordingly.
Falls back gracefully if onActionClick is not provided.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create `ActionRowInline` component

**Files:**
- Modify: `src/App.jsx` — insert new component immediately after `TaskRowInline` ends (current ~L7572)

**Goal:** Self-contained row component with collapsed/expanded states, inline-editable fields, and comment thread.

- [ ] **Step 1: Verify insertion anchor is unchanged after prior tasks**

The end of `TaskRowInline` and start of `MyWorkSubTabs` is the insertion point:

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && grep -n "^function MyWorkSubTabs\|^function TaskRowInline" src/App.jsx
```

Expected: `TaskRowInline` start and `MyWorkSubTabs` start ~50-60 lines apart. Use the closing `}` of `TaskRowInline` followed by `function MyWorkSubTabs` as the unique anchor.

- [ ] **Step 2: Insert ActionRowInline component**

`old_string` (anchor — last lines of TaskRowInline + start of MyWorkSubTabs):
```js
      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid ' + TOK.line, background: TOK.bg }}>
          <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 6 }}>Quick update</div>
          <MentionTextarea
            value={draft}
            onChange={setDraft}
            rows={2}
            placeholder={`Type @ to mention. Posted as ${author || '…'}.`}
            teamMembers={teamMembers}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={isBlocker} onChange={(e) => setIsBlocker(e.target.checked)} /> This is a blocker
          </label>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <Btn size="sm" variant="primary" disabled={!draft.trim()} onClick={() => {
              onAddUpdate(draft.trim(), isBlocker);
              setDraft(''); setIsBlocker(false); setExpanded(false);
            }}>Post update</Btn>
            <Btn size="sm" onClick={onRequestExtension}><Calendar size={11} /> Request extension</Btn>
            <Btn size="sm" variant="ghost" onClick={onOpenDetails}>→ Open full details</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function MyWorkSubTabs({ value, onChange, tabs }) {
```

`new_string`:
```js
      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid ' + TOK.line, background: TOK.bg }}>
          <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 6 }}>Quick update</div>
          <MentionTextarea
            value={draft}
            onChange={setDraft}
            rows={2}
            placeholder={`Type @ to mention. Posted as ${author || '…'}.`}
            teamMembers={teamMembers}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={isBlocker} onChange={(e) => setIsBlocker(e.target.checked)} /> This is a blocker
          </label>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <Btn size="sm" variant="primary" disabled={!draft.trim()} onClick={() => {
              onAddUpdate(draft.trim(), isBlocker);
              setDraft(''); setIsBlocker(false); setExpanded(false);
            }}>Post update</Btn>
            <Btn size="sm" onClick={onRequestExtension}><Calendar size={11} /> Request extension</Btn>
            <Btn size="sm" variant="ghost" onClick={onOpenDetails}>→ Open full details</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// v30.A — Row for an action item in My Work. C+D hybrid expand pattern,
// mirrors TaskRowInline. Collapsed shows title + breadcrumb + due +
// priority + status. Expanded reveals inline-editable title, PIC, due,
// priority, plus comment thread with @mention support.
function ActionRowInline({ action, project, related, author, teamMembers, picSuggestions, onChange, onAddComment, onOpenDetails, onMarkDone }) {
  const [expanded, setExpanded] = useState(false);
  const [titleDraft, setTitleDraft] = useState(action.title || '');
  const [commentDraft, setCommentDraft] = useState('');
  const [isBlocker, setIsBlocker] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);

  // Keep local title in sync when external action.title changes
  useEffect(() => { setTitleDraft(action.title || ''); }, [action.title]);

  const overdue = action.dueDate && action.status !== 'Done' && action.status !== 'Cancelled' && parseDate(action.dueDate) < today();
  const pc = priorityColor(action.priority);
  const updates = action.updates || [];
  const visibleComments = showAllComments ? updates : updates.slice(0, 3);

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== action.title) onChange({ title: trimmed });
    else if (!trimmed) setTitleDraft(action.title || '');
  };

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
              <MentionedText text={action.title || '(untitled action)'} teamMembers={teamMembers} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', fontSize: 11, color: TOK.muted }}>
            <span>{project.name}</span>
            {related && <span>· {related.program.name} › {related.workstream.name} › {related.task.name}</span>}
            {action.dueDate && <span style={{ color: overdue ? TOK.overdueFg : TOK.muted, fontWeight: overdue ? 500 : 400 }}>· 📅 {fmtDateShort(action.dueDate)}</span>}
            {updates.length > 0 && <span>· 💬 {updates.length}</span>}
          </div>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 999, color: pc.fg, background: pc.bg }}>{action.priority}</span>
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <StatusQuickPill status={action.status} onChange={(st) => onChange({ status: st })} />
        </span>
        {action.status !== 'Done' && onMarkDone && (
          <Btn size="sm" variant="primary" onClick={(e) => { e.stopPropagation && e.stopPropagation(); onMarkDone(); }} title="Mark done">✓</Btn>
        )}
        <ChevronDown size={14} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid ' + TOK.line, background: TOK.bg, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, minWidth: 50 }}>PIC</span>
            <select
              value={action.pic || ''}
              onChange={(e) => onChange({ pic: e.target.value })}
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
              value={action.dueDate || ''}
              onChange={(e) => onChange({ dueDate: e.target.value || null })}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink }}
            />
            <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginLeft: 16 }}>Priority</span>
            <select
              value={action.priority || 'Medium'}
              onChange={(e) => onChange({ priority: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink }}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{ borderTop: '1px solid ' + TOK.line, paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 6 }}>💬 Comments ({updates.length})</div>
            {visibleComments.map((u) => (
              <div key={u.id} style={{ fontSize: 12, color: TOK.ink, padding: '6px 0', borderBottom: '1px dashed ' + TOK.line, display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: TOK.muted, marginBottom: 2 }}>
                    <span style={{ color: TOK.ink, fontWeight: 500 }}>{u.author}</span> · {myWorkTimeAgo(u.timestamp)}
                    {u.isBlocker && <span style={{ marginLeft: 6, color: TOK.blocker, fontWeight: 500 }}>🚨 Blocker</span>}
                  </div>
                  <MentionedText text={u.text} teamMembers={teamMembers} />
                </div>
              </div>
            ))}
            {updates.length > 3 && !showAllComments && (
              <button onClick={() => setShowAllComments(true)} style={{ background: 'none', border: 'none', color: TOK.accent, fontSize: 11.5, cursor: 'pointer', padding: '4px 0', fontFamily: FONT_STACK }}>
                Show all ({updates.length})
              </button>
            )}
            <div style={{ marginTop: 8 }}>
              <MentionTextarea
                value={commentDraft}
                onChange={setCommentDraft}
                rows={2}
                placeholder={`Type @ to mention. Posted as ${author || '…'}.`}
                teamMembers={teamMembers}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={isBlocker} onChange={(e) => setIsBlocker(e.target.checked)} /> Mark as blocker
              </label>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={() => {
                  onAddComment(commentDraft.trim(), isBlocker);
                  setCommentDraft(''); setIsBlocker(false);
                }}>Post comment</Btn>
                {onOpenDetails && <Btn size="sm" variant="ghost" onClick={onOpenDetails}>→ Open in Actions tab</Btn>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MyWorkSubTabs({ value, onChange, tabs }) {
```

- [ ] **Step 3: Verify build passes (component defined but not yet used — should still compile)**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`. The component is defined but unreferenced — vite/tsc won't complain.

- [ ] **Step 4: Verify lint**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -10
```

Expected: `0 errors`. ESLint may flag `ActionRowInline` as unused-vars — that's expected for this step and will resolve in Task 5 when MyWorkView references it. If a NEW error appears (not warning), fix before committing.

- [ ] **Step 5: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): add ActionRowInline component

Phase A step 4/5. Mirrors TaskRowInline's C+D hybrid expand pattern.
Collapsed: title + breadcrumb + due + priority pill + status pill
+ optional mark-done shortcut. Expanded: inline title input (commits
on blur/Enter), PIC dropdown over picSuggestions, due date picker,
priority dropdown, comment thread with @mention support (last 3 +
"show all"), new comment textarea with blocker checkbox. Component
not yet referenced; MyWorkView wires it in step 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Reorder section + swap inline JSX → `<ActionRowInline>` + derive picSuggestions

**Files:**
- Modify: `src/App.jsx` — `MyWorkView`, the Action items section JSX block + replace inline action item rendering

**Goal:** Action items section moves from #5 to #2 (right after Needs attention). Each row uses `<ActionRowInline>` instead of the inline div.

- [ ] **Step 1: Compute `picSuggestions` inside MyWorkView**

Add a `useMemo` near the top of `MyWorkView` (right after the existing `myWork = useMemo(...)`) that flattens `teamMembers` into name strings, deduped.

`old_string`:
```js
  const myWork = useMemo(
    () => computeMyWork(author, projects, isOwner, lastSeenAt),
    [projects, author, isOwner, lastSeenAt]
  );
  const [ownedTab, setOwnedTab] = useState('today');
  const [actionsTab, setActionsTab] = useState('today');
```

`new_string`:
```js
  const myWork = useMemo(
    () => computeMyWork(author, projects, isOwner, lastSeenAt),
    [projects, author, isOwner, lastSeenAt]
  );
  const picSuggestions = useMemo(() => {
    const set = new Set();
    for (const m of (teamMembers || [])) if (m?.name) set.add(m.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [teamMembers]);
  const [ownedTab, setOwnedTab] = useState('today');
  const [actionsTab, setActionsTab] = useState('today');
```

- [ ] **Step 2: Move the Action items section block above the Mentions block (= make it section #2)**

The current order is:
1. Needs attention
2. Mentions
3. Tasks I own
4. Tasks I contribute
5. **Action items** ← move this
6. Decisions
7. Credit

Target order:
1. Needs attention
2. **Action items** ← here
3. Mentions
4. Tasks I own
5. Tasks I contribute
6. Decisions
7. Credit

Use the `Edit` tool to find the comment marker `{/* 💬 Mentions */}` (currently above the Mentions `<MyWorkSection>`) and replace from that point through end of the Action items section with the same blocks reordered + the inline action item render swapped to `<ActionRowInline>`.

`old_string` (the entire span from `{/* 💬 Mentions */}` through end of action items section's closing `</MyWorkSection>`):
```js
      {/* 💬 Mentions */}
      <MyWorkSection
        icon="💬" title="Mentions"
```

This anchor is too short. Use a more specific multi-line anchor that includes the full Mentions section opening through the action items section's closing tag. Read the file around line 7791-7920 to get the exact span before performing the edit.

For agentic execution: read the file in that range first, then construct the multi-line `old_string` covering the existing two sections (Mentions then Action items) and use a `new_string` that has them swapped + action items using `<ActionRowInline>` instead of the inline JSX. The swap is mechanical: take the entire `<MyWorkSection icon="✅" ...>...</MyWorkSection>` block and place it BEFORE the `<MyWorkSection icon="💬" ...>...</MyWorkSection>` block.

The new Action items section body uses `<ActionRowInline>`. Here is the EXACT body to render for each action (replace the inline `div` map):

```js
        {myWork.actionItems[actionsTab].length === 0 ? (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>No action items in this bucket.</div>
        ) : myWork.actionItems[actionsTab].map((e, i) => {
          const a = e.action;
          const related = a.relatedTaskId ? findTaskInProject(e.project, a.relatedTaskId) : null;
          return (
            <ActionRowInline
              key={`a-${actionsTab}-${a.id || i}`}
              action={a}
              project={e.project}
              related={related}
              author={author}
              teamMembers={teamMembers}
              picSuggestions={picSuggestions}
              onChange={(patch) => onActionUpdate({ ...a, ...patch }, e.project.id)}
              onAddComment={(text, blocker) => onActionUpdate({
                ...a,
                updates: [
                  { id: uid('aupd'), timestamp: new Date().toISOString(), author, text, isBlocker: !!blocker },
                  ...(a.updates || []),
                ],
              }, e.project.id)}
              onMarkDone={() => handleActionDone(a, e.project)}
              onOpenDetails={onActionClick ? () => onActionClick(e.project.id) : null}
            />
          );
        })}
```

The new section #2 wrapper stays the same; only its body changes:

```js
      {/* ✅ Action items assigned to me */}
      <MyWorkSection
        icon="✅" title="Action items assigned to me"
        count={counts.actions}
        defaultOpen={myWork.actionItems.today.length > 0}
        headerRight={
          <MyWorkSubTabs value={actionsTab} onChange={setActionsTab} tabs={[
            { id: 'today', label: 'Today', count: myWork.actionItems.today.length },
            { id: 'week', label: 'Week', count: myWork.actionItems.week.length },
            { id: 'later', label: 'Later', count: myWork.actionItems.later.length },
          ]} />
        }>
        {/* body: see above */}
      </MyWorkSection>
```

**Recommended execution approach for step 2:**

a. Read lines 7791-7925 of `src/App.jsx` to capture the exact current text of both sections.
b. Construct `old_string` = the entire current 💬 Mentions section JSX + the entire current ✅ Action items section JSX (in current order, current contents).
c. Construct `new_string` = the ✅ Action items section JSX (with the new `<ActionRowInline>` body) FIRST, then the 💬 Mentions section JSX (unchanged) SECOND.
d. Apply the Edit.

This swap + body replacement is one atomic Edit operation to avoid the risk of two non-unique anchors.

- [ ] **Step 3: Verify build passes**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run build
```

Expected: `✓ built in <N>s`.

- [ ] **Step 4: Verify lint**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npx eslint src/App.jsx 2>&1 | tail -5
```

Expected: `0 errors`. The previously "unused" `ActionRowInline` should now be referenced. If a new warning appears for `pc` or `sc` (locals of the OLD inline render, now removed), that's expected and resolved.

- [ ] **Step 5: Commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git add src/App.jsx && git commit -m "$(cat <<'EOF'
feat(my-work): reorder Action items to section #2; render via ActionRowInline

Phase A step 5/5. My Work section order becomes Needs attention →
Action items → Mentions → Tasks owned → Contributing → Decisions →
Credit, reflecting that team workflow centers on actions. Each
action item now renders through ActionRowInline — fully workable
inline (status, mark done, reassign PIC, due, priority, title,
comments) without leaving My Work. The legacy inline JSX is gone.

picSuggestions derived from teamMembers powers the PIC dropdown.
Posting a comment uses uid('aupd') for the new schema action.updates[].

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Manual smoke test

**Files:** None modified. This task verifies the implementation against the spec's testing checklist.

- [ ] **Step 1: Start dev server**

If not already running:

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && npm run dev
```

Open `http://localhost:5173/` in browser.

- [ ] **Step 2: Walk the 16-step testing checklist from the spec**

Open `docs/superpowers/specs/2026-05-13-action-desk-redesign.md` and follow the "Testing checklist" section. For each item:

| # | What to verify | Pass criteria |
|---:|---|---|
| 1 | Section order | Needs attention → Action items → Mentions → Tasks owned → Contributing → Decisions → Credit |
| 2 | Status change inline | Activity log entry includes "(from My Work)" |
| 3 | Mark done shortcut | Action disappears from row, activity entry logged |
| 4 | Reassign PIC | Row vanishes from current PIC view; appears in new PIC's My Work |
| 5 | Due date edit | Activity entry "Changed action 'X' due date: A → B" |
| 6 | Title edit | Activity entry "Renamed action" only after blur/Enter |
| 7 | Post comment | Appears in list; activity "Posted comment on action" |
| 8 | Blocker comment | Activity log + render include 🚨 marker |
| 9 | Mention in comment | New mention in target user's Mentions section with `[UNREAD]` badge |
| 10 | Open in Actions tab | Navigates to project + Actions view |
| 11 | Tasks unchanged | Outline edits do NOT have "(from My Work)" suffix |
| 12 | ActionItemsView unchanged | Posting comment from My Work invisible in Actions tab |
| 13 | No subaction UI | No hierarchy / sub-PIC buttons visible |
| 14 | Action with no related task | Renders cleanly, no breadcrumb |
| 15 | Action with no comments | "Comments (0)" header, textarea visible, no "Show all" |
| 16 | Action no due date | Falls into Later bucket, no 📅 pill |

- [ ] **Step 3: If a smoke test fails, file a follow-up note in the spec**

Add a `## Smoke test results` section at the bottom of `docs/superpowers/specs/2026-05-13-action-desk-redesign.md` describing what failed. Do NOT attempt fixes inside this task — Phase A is feature-complete; revisions happen in a separate session.

- [ ] **Step 4: If all 16 pass, tag the commit**

```bash
cd c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker && git tag -a v30-phase-a -m "v30 Phase A: action-desk redesign (reorder + inline edit + comments)"
```

---

## Self-review pass

Coverage check:

| Spec requirement | Task |
|---|---|
| `action.updates[]` optional schema | Task 1 (read), Task 2 (diff log), Task 4 (write via onAddComment), Task 5 (wire to applyActionUpdate) |
| Move Action items to #2 | Task 5 |
| Inline status / mark done | Task 4 (StatusQuickPill + ✓ button), Task 5 (wire to applyActionUpdate via onChange) |
| Inline reassign PIC | Task 4 (PIC dropdown), Task 5 (picSuggestions, onChange) |
| Inline due date | Task 4 (date input), Task 5 (onChange) |
| Inline title (commit on blur/Enter) | Task 4 (titleDraft + commitTitle) |
| Comment thread + new comment | Task 4 (render last 3 + show all + textarea) |
| Mention scan extends to action.updates | Task 1 |
| Diff logger for title / pic / due / priority / comment count | Task 2 |
| Mentions section handles task or action shape | Task 3 |
| ActionItemsView untouched | All tasks — no edits to L3989 ActionItemRow or L4297 ActionItemsView |
| No sub-action UI | All tasks — nothing added |

Placeholder scan: searched for "TBD", "TODO", "implement later", "appropriate", "as needed", "similar to". None present in code blocks. The spec self-review section uses these as labels for what NOT to write — fine.

Type consistency:
- `picSuggestions` is `string[]` (used in Task 4 `<select>` and Task 5 useMemo). Consistent.
- `onChange` accepts a partial action `{ field: value }` patch. Task 5 wraps it via `{ ...a, ...patch }` before calling `onActionUpdate`. Consistent.
- `onAddComment(text, blocker)` signature matches between Task 4 (caller) and Task 5 (provider). Consistent.
- `onMarkDone()` is no-arg. Task 5 provides it. Consistent.
- `onOpenDetails` is no-arg; Task 5 passes `() => onActionClick(projectId)` or null. Task 4 guards `{onOpenDetails && ...}`. Consistent.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-action-desk-phase-a.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Each commit becomes a checkpoint.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Either approach: stop after Task 5's commit. Task 6 (smoke test) is user-driven in the browser, not agent-executed.
