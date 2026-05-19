# Google Chat notification on action update — Stage 1 (Group webhook)

## Context

When a project member posts an update on an action item, the team in the project's Google Chat space should see it without polling the app. Stage 1 covers the group-chat path only — DM-to-PIC is deferred to Stage 2 because it needs a Google Chat App + service account + Workspace admin involvement.

Stage 1 is a frontend-only change: each project stores one Google Chat **incoming webhook URL**; when a user posts an update on an action and ticks the notify checkbox, the browser POSTs a card message directly to that URL. Google Chat's incoming webhook endpoints accept cross-origin POST, so no backend is needed.

## Goal

Add an opt-in "Notify project chat" checkbox to the action-item update form. When ticked, the app posts a card-format message into the project's configured Google Chat space, containing enough information for a reader to act without opening the app — plus a deep link back to the action.

## Non-goals (Stage 1)

- DM to PIC (Stage 2 — needs service account + Vercel API route)
- Auto-trigger on status change, mark-done, subtask change (would spam; user must explicitly tick the checkbox)
- Bidirectional sync (Chat → app, e.g. mark done from chat)
- Buttons on the chat card (would need Chat App / interaction handler)
- Notifications for task updates, RAID changes, decisions (action items only this stage)
- Per-PIC webhook personalisation (one webhook per project, posts to one space)

## User stories

1. **As workspace owner**, I paste the project's Google Chat space webhook URL into Project Settings once. From then on, anyone in the project can choose to push updates to that space.
2. **As project member posting an update**, I tick "📢 Notify [Project name] chat" on the update form. The app sends a Chat card with full context to the configured space.
3. **As reader in Google Chat space**, I see a card with project name, action title, PIC, status, due date, who posted, the update text, and a clickable link that opens the action in the app.

## Schema

Add one optional field to `Project`:

```
project.googleChatWebhook: string | null
```

- Format: full Google Chat incoming webhook URL (`https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...`)
- Default: `null` (notifications disabled for that project until configured)
- Stored under existing `workspaces/main/projects/{projectId}` document. No migration needed — absence is treated as null.

## Firestore rules

- Read: any project member (matches existing project read rule — no change).
- Write: workspace owner OR project owner only. Add to existing role-gated write rules for the project document.

Webhook URLs are secrets in the sense that anyone holding the URL can post to the space. Restricting write to owners + relying on @smartosc.com domain gate keeps the abuse surface small. Read-access by all project members is intentional so the browser can fetch it before posting.

## UI surfaces

### 1. Project Settings — Google Chat section

New section under existing Project Settings modal, visible to all members, **editable only by workspace owner or project owner**:

```
🗨 Google Chat integration
┌────────────────────────────────────────────────────────────┐
│ Webhook URL                                                 │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ https://chat.googleapis.com/v1/spaces/...              │ │
│ └────────────────────────────────────────────────────────┘ │
│ Test → [Send test message]      Status: ✓ Configured       │
│                                                             │
│ ℹ️ How to get this:                                         │
│   1. Open the project's Google Chat space                   │
│   2. Space settings → Apps & integrations → + Add webhook  │
│   3. Copy the URL and paste above                           │
└────────────────────────────────────────────────────────────┘
```

Behavior:
- Owner pastes URL → save on blur (debounced like other Project Settings fields).
- "Send test message" button (owners only) posts a one-off card: "✅ Test message from [Project name] — Google Chat integration working." Surfaces any 4xx/5xx as inline error.
- Non-owners see the field disabled with a "🔒 Workspace owner only" hint.
- Empty/cleared URL → notify checkbox in action form is hidden entirely (no broken state).

### 2. Action item update form — notify checkbox

Below the update textarea, above the existing blocker checkbox, add:

```
☐ 📢 Notify [Project name] chat
```

- Only rendered when `project.googleChatWebhook` is set.
- Default state for first time per project = unchecked. Subsequent loads read `localStorage["myWork:chatNotify:{projectId}"]` — checkbox starts ticked if the user ticked it last time on this project. Unchecking on any post writes `false` to that key.
- On "Post update":
  1. Apply the existing update mutation (write to action.updates[]).
  2. If checkbox ticked AND webhook URL present: `fetch(webhookUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(card) })`.
  3. Show a toast: "Update posted · 📢 Sent to chat" or "Update posted · ⚠️ Chat notify failed" (do NOT block the update on chat failure).

## Message structure

**Chosen layout — Variant C (minimal, notification-style, left accent bar, most compact):**

```
┌─ Sender row (handled by Google Chat) ────────────────────┐
│ M  AF MTP Tracker  App  8 May 2026, 10:42 AM             │
│                                                            │
│ ┃ Submit to BRA portal + obtain receipt          [Open] │  ← title bold + status pill right
│ ┃ CRP › LLCs › HIO · Overdue · @hattt4                  │  ← meta line
│ ┃ ─────────────────────────────────────                  │
│ ┃ @An Nguyen confirmed both docs ready. Submitting       │  ← body (update text, @mention preserved)
│ ┃ now will update once receipt obtained.                 │
│ ┃ ─────────────────────────────────────                  │
│ ┃ hattt4, 8 May 2026, 10:42 AM             View →       │  ← footer: author + timestamp + deep link
└────────────────────────────────────────────────────────────┘
```

Left accent bar (`┃`) colored with `project.color` (default `#0C447C`).

**Content fields, in this order:**

| Field | Source | Notes |
|---|---|---|
| Accent bar color | `project.color` or `#0C447C` | Visual project identity |
| Title (bold) | `action.title` | |
| Status pill (right) | `action.status` | Open / In Progress / Blocked / Done |
| Meta line | `project.name › program.name › workstream.name` (if action is task-linked) OR `project.name › Action item` (if standalone) · `due {date}` or `Overdue` · `@{pic}` | |
| Body | The update text that triggered the notify (the comment just posted) | Preserve `@mention` syntax — Google Chat parses it client-side if recipients are in the space |
| Blocker tag | `🚩 Blocker` chip if `update.isBlocker === true` | Appended to meta line |
| Footer | `{author}, {timestamp}` left + `View →` link right | |

**Format:** Google Chat card v2 (`cardsV2` payload), with `decoratedText` widgets for the meta line and body. If the space rejects cards (rare), fall back to plain-text rendering of the same fields concatenated.

## Confirmed decisions (resolved from earlier open scope)

1. **Card layout — Variant C (minimal, accent bar).** Locked. See "Message structure" above.

2. **Persist "notify" checkbox state — Yes, per-user localStorage.** Key: `myWork:chatNotify:{projectId}`. Default for first time per project = unchecked. Saves friction for users who always want to notify; allows opt-out per post by unchecking.

3. **Deep link routing — Yes, add `?project={id}&action={id}` handler.** On app load, App.jsx reads these query params; if both present and the user has access to the project, switch the current project, open the Actions tab, and select that action. URL params are consumed (cleared from address bar via `history.replaceState`) once the navigation completes so a refresh doesn't re-trigger.

4. **Test message wording:** `"✅ Test message from [Project name] — Google Chat integration working. Sent by [author] at [timestamp]."` Plain text (no card), to make it visually distinct from real notifications.

5. **Failure UX — Toast error, keep checkbox enabled.** On `fetch` 4xx/5xx, show toast: `"Update posted. Chat notify failed: {status} {statusText} — owner can re-check the webhook URL in Project Settings."` Checkbox stays enabled for retry on the next post. The update itself is NOT rolled back — it's saved locally regardless of chat delivery outcome.

## Data flow

```
[User clicks Post update with checkbox ticked]
    │
    ▼
ActionRowInline.onAddComment(text, isBlocker)
    │
    ├─→ existing flow: write update to action.updates[] via onActionUpdate
    │
    └─→ if (project.googleChatWebhook && notifyChecked):
            buildChatCard({ project, action, author, text, isBlocker })
            fetch(webhook, { method:'POST', body: JSON.stringify(card) })
                ├─ ok → showToast('Update posted · 📢 Sent to chat')
                └─ !ok → showToast('Update posted · ⚠ Chat notify failed: <status>')
                          (does NOT undo the update write)
```

## Security & risk

- **Webhook URL leak**: any project member can read the URL from Firestore — they could post to the space directly. Acceptable for @smartosc.com members. Mitigation if needed later: move sending to a backend route (Stage 2 territory).
- **CORS**: Google Chat incoming webhooks accept POST with `Content-Type: application/json` from any origin. No preflight workaround needed.
- **Rate limit**: Google Chat webhooks allow ~60 messages per minute per webhook. We post one per "Post update" click — well under.
- **Bad URL injection**: if owner pastes a non-Chat URL (e.g. attacker bait), we'd POST card JSON to that endpoint. Mitigation: client-side URL prefix check (must start with `https://chat.googleapis.com/v1/spaces/`).
- **Cancellation**: action updates that fail to send to chat still persist locally. User can re-click the action and trigger again manually if they want.

## Stage 2 forward note (NOT in this spec — for context only)

Stage 2 adds DM-to-PIC. Needs:
- Vercel API route `api/notify-pic.ts` (or Firebase Function)
- Service account JSON in Vercel env var
- Google Chat App published to org
- Per-PIC one-time bot setup
- Firebase ID token verification on the backend route
- The Stage 1 update form gets a second checkbox "📬 DM PIC" that calls the backend

Stage 2 is OUT OF SCOPE for this spec. Mentioned only so the Stage 1 design doesn't paint into a corner — the schema (`project.googleChatWebhook` separate field) and the UI (checkbox grouping leaves room for a sibling) already accommodate adding the DM checkbox alongside.

## Acceptance criteria

- [ ] Workspace owner / project owner can paste a webhook URL in Project Settings and save it.
- [ ] Non-owner sees the URL field but cannot edit it.
- [ ] "Send test message" button posts the plain-text test wording (with project name + author + timestamp) and shows success/error.
- [ ] When a project has a webhook URL set, action update form shows "📢 Notify [Project] chat" checkbox.
- [ ] Checkbox default state respects `localStorage["myWork:chatNotify:{projectId}"]` — ticked if last time was ticked, unchecked first time per project.
- [ ] When checkbox is ticked and user posts an update, a Variant-C card is delivered to the space within 2 seconds.
- [ ] Card content includes accent bar (`project.color`), action title, status pill, meta line (`project › program › workstream · due/overdue · @PIC`), update body, blocker tag (if `isBlocker`), footer (author + timestamp + `View →` deep link).
- [ ] Clicking `View →` opens the app with `?project=X&action=Y` → app switches to that project, opens Actions tab, selects the action, then clears the query params.
- [ ] If webhook delivery fails (4xx/5xx), the update still saves locally, the toast shows `"Update posted. Chat notify failed: {status} {statusText} — owner can re-check the webhook URL in Project Settings."`, and the checkbox stays enabled for retry on the next post.
- [ ] If the webhook URL is cleared, the checkbox disappears from update forms — no broken state.
- [ ] URL validation rejects non-`https://chat.googleapis.com/` strings on save with an inline error.
