# Chat notification card — focus redesign (+ real-ping deferred to Stage 2)

## Context

The new-action Google Chat card (`buildNewActionCard` in `src/chatNotify.js`) currently renders flat: a long breadcrumb on the first meta line, with due / PIC / priority buried in a single `·`-joined string. The team wants the card to lead with the information that drives action — PIC, due date, priority — and they want the PIC to actually receive a notification (be pinged), not just see their name as plain text.

Two parts, handled differently (confirmed with requester):
- **Part #1 — card focus redesign.** Implement now. Pure layout change, no dependency.
- **Part #2 — real ping to the PIC.** Deferred. Requires a Google Chat App + service account (Stage 2), which needs Google Workspace admin setup. Documented here so the direction is captured; NOT in this implementation.

## Why plain `@name` doesn't ping (the constraint behind Part #2)

Google Chat **incoming webhooks** only trigger a user notification when the message text contains `<users/{NUMERIC_USER_ID}>`. Plain `@Name` or `@email` text is just display text — no ping. Webhooks cannot resolve email → user ID. The app stores only `{ name, email }` per member, not the numeric Chat user ID. So real per-PIC ping over a webhook is impossible without either (a) manually collecting each member's numeric ID (high friction, mostly-empty in practice) or (b) the full Chat API with a service account that resolves email → ID server-side. The team chose (b) = Stage 2, deferred until IT provides the service account.

---

## Part #1 — Card focus redesign (THIS implementation)

### Goal

Restructure `buildNewActionCard`'s cardsV2 payload so PIC, due date, and priority are visually prominent (icon-led rows), and the breadcrumb/created-by context is demoted to small muted text at the bottom.

### New card structure

```
🆕 NEW ACTION
Close gap roadmap cho Hương                         ← title, bold, large (decoratedText topLabel + bold text)

👤  Hằng Nguyễn Thị Thúy                            ← PIC row: PERSON icon + name
📅  Due 30 May 2026                                 ← Due row: CLOCK icon + date (⚠ red "Overdue — was due …" if past)
🔴  Medium priority                                 ← Priority row: colored dot emoji + level
─────────────────────────────
AF Lean Structure › Team Development › Overseas …    ← breadcrumb, small muted textParagraph
Created by Hà Trương Thị Thu · 27 May 2026, 08:33
                                          [View →]
```

### Widget-by-widget (cardsV2)

1. `decoratedText`: `topLabel: '🆕 NEW ACTION'`, `text: <b>{title}</b>`, `wrapText: true`, `startIcon: { knownIcon: 'DESCRIPTION' }`.
2. `decoratedText` (PIC) — only if `action.pic`: `startIcon: { knownIcon: 'PERSON' }`, `text: {pic}`. (Plain name — real ping is Stage 2.)
3. `decoratedText` (Due) — only if `action.dueDate`: `startIcon: { knownIcon: 'CLOCK' }`, `text: 'Due {date}'`; if past today and not done, `text: '⚠ Overdue — was due {date}'` (Chat can't color text, so the ⚠ + word "Overdue" carries the signal).
4. `decoratedText` (Priority) — only if `action.priority`: `text: '{dot} {priority} priority'` where dot = 🔴 High / 🟡 Medium / 🟢 Low. No startIcon (the emoji dot is the indicator).
5. `divider`.
6. `textParagraph` (breadcrumb): `{project} › {program} › {workstream} › {task}` (or `{project} › Action item` if no related task), wrapped, this is the small muted context line.
7. `textParagraph` (created-by): `Created by {author} · {timestamp}`.
8. `decoratedText` (footer/action): `text: ''` with a `button: { text: 'View', onClick: { openLink: { url: deepLink } } }` — OR keep the View button on the created-by widget. Implementer's choice; the View deep link must remain `?project={id}&action={id}`.

Returns ONLY `cardsV2` (no root `text` — avoids double-render, per the Stage-1 lesson).

### Priority → dot mapping

```
High   → 🔴
Medium → 🟡
Low    → 🟢
(none) → row omitted
```

### What stays the same

- `buildNewActionCard`'s signature and all three calling sites (Actions tab, My Work modal, TaskDetail) — unchanged. This is purely the card's internal widget structure.
- Deep link, escaping (`escapeChatText`), timestamp formatting (`formatDisplayTimestamp`) — reused.

### Optional consistency note (in scope, low cost)

`buildActionCard` (the *comment* notification card) shares the flat-meta style. For visual consistency in the same space, its meta line MAY get the same icon-led PIC/due treatment — but its body stays the comment text (that's its purpose). The implementer should apply the same PIC/due/priority decoratedText rows to `buildActionCard` only if it's a clean, small change; otherwise leave it and note as follow-up. The new-action card is the required deliverable.

### Acceptance criteria (Part #1)

- [ ] New-action card shows PIC, Due, Priority as separate icon-led rows near the top (above the breadcrumb).
- [ ] Priority row shows a colored dot emoji matching the level (🔴/🟡/🟢).
- [ ] Overdue due date shows ⚠ + "Overdue" wording.
- [ ] Breadcrumb + created-by are below a divider, visually secondary.
- [ ] Rows for PIC / Due / Priority are omitted when the field is absent (no empty "Due undefined" rows).
- [ ] `View →` deep link still works (`?project=&action=`).
- [ ] Card returns only `cardsV2` (no root `text`).
- [ ] All three create paths still deliver the card unchanged (no signature change).

---

## Part #2 — Real ping to the PIC (DEFERRED — Stage 2, blocked on IT)

**Not implemented in this plan.** Captured for direction.

### Approach (Option C — Chat App + service account)

- Google Workspace admin creates a Chat App, enables the Chat API, downloads a service-account JSON.
- Service-account JSON stored in a Vercel env var (e.g. `GOOGLE_CHAT_SERVICE_ACCOUNT_JSON`).
- New Vercel API route (e.g. `api/notify-chat.ts`) that:
  - Verifies the caller's Firebase ID token (only @smartosc.com).
  - Resolves the PIC's email → Google Chat user ID (Chat API / People API).
  - Posts the card to the space with a real `<users/{id}>` mention, OR DMs the PIC directly.
- The new-action + comment flows POST to this route (when configured) instead of / in addition to the raw webhook, so the PIC gets a true ping.

### Prerequisite

A service account from IT. Until then, the card uses plain `@name` / icon-led PIC row (visual only, no ping) — which Part #1 already covers.

### When ready

Write a dedicated Stage-2 spec + plan. This section is a pointer, not an implementation.

---

## Out of scope

- Manual per-member Google Chat user ID collection (Option A — rejected: high friction, mostly-empty in practice).
- `@all` ping (Option B — rejected as default: spams the space).
- Email channel.
- Redesigning RAID / decision notifications.
