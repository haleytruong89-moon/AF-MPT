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
- Default: unchecked. Optional: persist last choice in localStorage so power users don't re-tick every time. **Decision deferred — needs user confirmation.**
- On "Post update":
  1. Apply the existing update mutation (write to action.updates[]).
  2. If checkbox ticked AND webhook URL present: `fetch(webhookUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(card) })`.
  3. Show a toast: "Update posted · 📢 Sent to chat" or "Update posted · ⚠️ Chat notify failed" (do NOT block the update on chat failure).

## Message structure

**The exact card JSON structure is deferred — to be confirmed with user before implementation.** The placeholder design has full context; user will sign off on the actual layout.

Content elements that MUST appear in the final card (decided):
- Project name + colored accent (match `project.color`)
- Action title
- PIC name (mentioned by display name, plain text — Google Chat auto-parses @mention if the user is in the space)
- Status pill (Open / In Progress / Blocked / Done)
- Due date (with overdue indicator if past today)
- Posted by (author display name + timestamp)
- Update text (the comment the user just typed)
- Blocker flag if `isBlocker === true`
- Deep link "View in app" → `https://af-mpt.vercel.app/?project={id}&action={id}` (route may need a small handler in App.jsx to focus that action on load — see "Open scope" below)

Format will be **Google Chat card v2** (`cardsV2` in the payload) because it lets us style and group fields; falls back to plain text if the space rejects cards.

## Open scope to confirm before writing the plan

These are flagged so the implementation plan can be exact:

1. **Card layout** — exact field order, color usage, button placement. I'll mock 2-3 variants and you pick.
2. **Persist "notify" checkbox state** — remember last choice per user, or always default to unchecked?
3. **Deep link routing** — does the app need a new query-param handler (`?project=&action=`) that auto-opens the action detail, or is "click takes user to home, they navigate themselves" OK for Stage 1?
4. **Test message wording** — what should the "Send test" payload look like? (Important: this gets posted to a real space, so wording matters.)
5. **Failure UX** — if `fetch` returns 4xx/5xx (bad URL, revoked webhook, space deleted), do we just toast and continue, or also disable the checkbox for the rest of the session?

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

- [ ] Workspace owner can paste a webhook URL in Project Settings and save it.
- [ ] Non-owner sees the URL field but cannot edit it.
- [ ] "Send test message" button posts to the space and shows success/error.
- [ ] When a project has a webhook URL set, action update form shows "📢 Notify [Project] chat" checkbox.
- [ ] When that checkbox is ticked and user posts an update, a card is delivered to the space within 2 seconds.
- [ ] If webhook delivery fails (revoked, 404, etc.), the update still saves locally and the user sees an error toast.
- [ ] If the webhook URL is cleared, the checkbox disappears from update forms — no broken state.
- [ ] URL validation rejects non-`https://chat.googleapis.com/` strings on save with an inline error.
- [ ] Card content includes: project name, action title, PIC, status, due, author, timestamp, update text, blocker flag (if set), link to action.
