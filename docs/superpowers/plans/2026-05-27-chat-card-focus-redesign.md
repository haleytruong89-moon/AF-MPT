# Chat card focus redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the new-action Google Chat card so PIC, due date, and priority are prominent icon-led rows, with the breadcrumb/created-by context demoted below a divider.

**Architecture:** Pure rewrite of `buildNewActionCard`'s internal cardsV2 widget array in `src/chatNotify.js`. Signature, callers, deep link, and escaping helpers unchanged — only the widget structure changes.

**Tech Stack:** Plain JS, Google Chat cardsV2 payload. `npm run build` is the gate (no test framework).

**Spec reference:** `docs/superpowers/specs/2026-05-27-chat-card-focus-redesign-design.md` (Part #1 only; Part #2 real-ping is deferred/blocked on IT, NOT in this plan).

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/chatNotify.js` | **Modify** | Rewrite the body of `buildNewActionCard` (lines ~123-186): build an icon-led widget array (title / PIC / Due / Priority / description / divider / breadcrumb / created-by+View). Remove the old `metaLine` / `body` / `dueLabel` locals. |

One function, one file. No signature change → the three call sites (Actions tab, My Work modal, TaskDetail) are untouched and keep working.

---

### Task 1: Rewrite `buildNewActionCard` with the focus layout

**Files:**
- Modify: `src/chatNotify.js` — `buildNewActionCard` (locate via `grep -n "export function buildNewActionCard" src/chatNotify.js`).

- [ ] **Step 1: Read the current function to confirm boundaries**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "export function buildNewActionCard\|export function buildTestText" src/chatNotify.js
```

The current `buildNewActionCard` spans from its `export function` line to the closing `}` just before `buildTestText`. You will replace the ENTIRE function body (keep the JSDoc comment above it as-is or update it; the signature line stays identical).

- [ ] **Step 2: Replace the whole function with the redesigned version**

Replace the entire `export function buildNewActionCard(ctx) { ... }` (NOT the JSDoc above it) with:

```js
export function buildNewActionCard(ctx) {
  const {
    project, action, related, author,
    timestamp = new Date().toISOString(),
    appBaseUrl = 'https://af-mpt.vercel.app',
  } = ctx;

  const breadcrumb = related
    ? `${project.name} › ${related.program?.name || '—'} › ${related.workstream?.name || '—'} › ${related.task?.name || '—'}`
    : `${project.name} › Action item`;

  // Due row — overdue-aware. Google Chat can't color card text, so the
  // ⚠ glyph + the word "Overdue" carries the urgency signal.
  let dueText = null;
  if (action.dueDate) {
    const due = new Date(action.dueDate);
    if (!isNaN(due.getTime())) {
      const label = due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const now = new Date();
      const isPast = due < new Date(now.getFullYear(), now.getMonth(), now.getDate());
      dueText = (isPast && action.status !== 'Done') ? `⚠ Overdue — was due ${label}` : `Due ${label}`;
    }
  }

  // Priority row — colored dot emoji is the indicator (no startIcon).
  const PRIORITY_DOT = { High: '🔴', Medium: '🟡', Low: '🟢' };
  const priorityText = action.priority
    ? `${PRIORITY_DOT[action.priority] || '⚪'} ${action.priority} priority`
    : null;

  const deepLink = `${appBaseUrl}/?project=${encodeURIComponent(project.id)}&action=${encodeURIComponent(action.id)}`;
  const createdBy = `Created by ${author} · ${formatDisplayTimestamp(timestamp)}`;

  // Build widgets in priority-of-attention order. Omit rows for absent fields.
  const widgets = [
    {
      decoratedText: {
        topLabel: '🆕 NEW ACTION',
        text: `<b>${escapeChatText(action.title || '(untitled action)')}</b>`,
        wrapText: true,
        startIcon: { knownIcon: 'DESCRIPTION' },
      },
    },
  ];
  if (action.pic) {
    widgets.push({
      decoratedText: {
        startIcon: { knownIcon: 'PERSON' },
        text: escapeChatText(action.pic),
      },
    });
  }
  if (dueText) {
    widgets.push({
      decoratedText: {
        startIcon: { knownIcon: 'CLOCK' },
        text: escapeChatText(dueText),
      },
    });
  }
  if (priorityText) {
    widgets.push({ decoratedText: { text: escapeChatText(priorityText) } });
  }
  if (action.description) {
    widgets.push({ textParagraph: { text: escapeChatText(action.description) } });
  }
  widgets.push({ divider: {} });
  widgets.push({ textParagraph: { text: escapeChatText(breadcrumb) } });
  widgets.push({
    decoratedText: {
      text: escapeChatText(createdBy),
      button: {
        text: 'View',
        onClick: { openLink: { url: deepLink } },
      },
    },
  });

  return {
    cardsV2: [
      {
        cardId: `new-action-${action.id}-${Date.now()}`,
        card: {
          sections: [{ widgets }],
        },
      },
    ],
  };
}
```

Key points the engineer must preserve:
- Signature and destructure unchanged (still `ctx` with the same fields).
- Returns ONLY `cardsV2` — no root-level `text` key (avoids the double-render bug).
- `escapeChatText` and `formatDisplayTimestamp` are the existing internal helpers lower in the file — still used.
- The old `metaLine`, `body`, `dueLabel` locals are gone (fully replaced) — confirm no dangling references remain.

- [ ] **Step 3: Confirm no dangling references to removed locals**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && awk '/export function buildNewActionCard/,/^}/' src/chatNotify.js | grep -n "metaLine\|bodyLines\|\bbody\b\|dueLabel" || echo "clean — no stale references"
```

Expected: `clean — no stale references`.

- [ ] **Step 4: Build**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: `✓ built` with only the pre-existing chunk-size warning.

- [ ] **Step 5: Sanity-check the produced payload shape in the browser console**

Start dev server (`npm run dev`) if not running, then in the browser console:

```js
const m = await import('/src/chatNotify.js');
const card = m.buildNewActionCard({
  project: { id: 'p1', name: 'AF Lean Structure' },
  action: { id: 'a1', title: 'Close gap roadmap cho Hương', status: 'Pending', pic: 'Hằng Nguyễn Thị Thúy', dueDate: '2026-05-30', priority: 'Medium' },
  related: { program: { name: 'Team Development' }, workstream: { name: 'Overseas Tower' }, task: { name: 'Close GAP Road Map | AR senior' } },
  author: 'Hà Trương Thị Thu',
});
const w = card.cardsV2[0].card.sections[0].widgets;
console.log('widget count:', w.length);  // expect 7: title, PIC, Due, Priority, divider, breadcrumb, created-by
console.log(JSON.stringify(w, null, 2));
// Verify: no root-level text key
console.log('has root text?', 'text' in card);  // expect false
```

Expected: 7 widgets in the order title → PIC → Due → Priority → divider → breadcrumb → created-by; `has root text? false`. Test an action with no `pic`/`dueDate`/`priority` → those rows omitted (fewer widgets).

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/chatNotify.js && git commit -m "feat(chat): focus-redesign new-action card — icon-led PIC/Due/Priority rows"
```

---

### Task 2: Push + verify Vercel deploy + production smoke

- [ ] **Step 1: Final build clean**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean.

- [ ] **Step 2: Push**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git push origin main
```

- [ ] **Step 3: Wait for deploy Ready**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && until npx vercel ls --yes 2>&1 | sed -n '6p' | grep -E "Ready|Error|Failed" >/dev/null; do sleep 10; done; npx vercel ls --yes 2>&1 | sed -n '5,7p'
```

Expected: newest deploy `● Ready` in <30s.

- [ ] **Step 4: Production smoke**

Open https://af-mpt.vercel.app, on a project WITH a Chat webhook:
1. Create a new action with PIC + due date + priority, tick "📢 Notify chat", Create.
2. In the chat space, confirm the card now leads with `🆕 NEW ACTION` + bold title, then icon rows for PIC (👤/PERSON), Due (🕐/CLOCK, ⚠ Overdue if past), Priority (🔴/🟡/🟢), then a divider, then the small breadcrumb + "Created by … · timestamp" with a `View` button.
3. Create an action with NO due date and NO priority → confirm those rows are omitted (no "Due undefined"/empty priority).
4. Click `View` → app opens that project + Actions tab + the action.

---

## Out of scope

- Part #2 real-ping to PIC (Stage 2 Chat App + service account) — deferred, blocked on IT. Separate spec/plan when the service account is available.
- Redesigning the comment card (`buildActionCard`) — the spec marks this optional; NOT included here to keep the change focused. Follow-up if the team wants visual parity.
- RAID / decision notification cards.

## Known risks

- `knownIcon` values: `PERSON`, `CLOCK`, `DESCRIPTION` are standard Google Chat built-in icons. If Chat rejects an unknown icon name the whole card 400s — the Task 1 Step 5 console check + Task 2 production smoke catch this before it matters. If any icon name is rejected, drop the `startIcon` for that row (the emoji/text still carries meaning).
- Google Chat card text cannot be colored, so the priority signal relies on the dot emoji and the due/overdue signal on the ⚠ glyph — intentional, documented in the spec.
