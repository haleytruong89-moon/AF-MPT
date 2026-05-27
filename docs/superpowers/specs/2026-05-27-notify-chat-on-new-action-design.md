# Notify Google Chat on new action creation

## Context

Stage 1 (shipped) added an opt-in "📢 Notify chat" checkbox on the action **comment** form that POSTs a card to the project's Google Chat webhook (`project.googleChatWebhook`). The team now wants the same treatment when a **new action is created**, so the group sees new actions in the chat space and nobody forgets them.

"Group mail" in the request = the team's Google Chat space (the existing webhook), not literal email. Confirmed with the requester.

## Goal

Add an opt-in "📢 Notify chat" checkbox to the action **creation** form. When ticked, creating the action also POSTs a "new action" card to the project's configured Google Chat webhook. Reuses all Stage 1 infrastructure — no new schema, no backend.

## Non-goals

- Email (mailto: or SMTP) — out of scope; this is Chat only.
- Notify on action **edit** (only creation; comment-notify already covers ongoing updates).
- Auto/always-on notification — explicitly opt-in per the requester.
- DM to PIC (that's the deferred Stage 2 of the original Chat feature).
- Notify on task creation, decision creation, RAID item creation — actions only.

## Decisions (confirmed with requester)

1. **Channel**: Google Chat, reusing `project.googleChatWebhook`.
2. **Trigger**: opt-in checkbox, default off first time per project, remembers last choice via localStorage (mirrors Stage 1 comment-notify).
3. **Scope**: creation only — checkbox hidden when editing an existing action.

## Where the checkbox appears

The shared `ActionItemForm` ([App.jsx:4229](../../src/App.jsx)) is used by both creation paths:
- **Actions tab** → `ActionItemsView.saveAction()` ([App.jsx:4700](../../src/App.jsx))
- **My Work / Mindmap "New action"** → `ActionCreateModal` → `createActionFromMyWork()` ([App.jsx:12745](../../src/App.jsx))

The checkbox renders inside `ActionItemForm` **only when**:
- `initial == null` (creating, not editing), AND
- `project.googleChatWebhook` is set.

Label: `📢 Notify {project.name} chat`. Default state read from `localStorage["myWork:chatNotifyNewAction:{projectId}"]` (separate key from the comment-notify pref `myWork:chatNotify:{projectId}` — the two behaviors are independent). Default false if unset. Ticking/unticking persists immediately.

## Data flow

```
ActionItemForm (create mode, webhook present)
  └─ user fills form, optionally ticks "📢 Notify chat"
  └─ onSave(newAction, { notifyChat })           ← form passes intent up
       │
       ├─ Actions tab: ActionItemsView.saveAction(newAction, opts)
       │     └─ onProjectUpdate(... actionItems prepended ...)
       │     └─ if (!editing && opts.notifyChat && project.googleChatWebhook):
       │           postToChat(webhook, buildNewActionCard({ project, action, related, author }))
       │
       └─ Modal path: ActionCreateModal.onSave → onCreate(action, projectId, opts)
             └─ createActionFromMyWork(newAction, projectId, actingAs, opts)
                   └─ updateProject(...)
                   └─ if (opts.notifyChat && targetProj.googleChatWebhook):
                         postToChat(webhook, buildNewActionCard(...))
```

Chat delivery failure shows a toast but never blocks creation — the action is saved regardless.

## Card content — `buildNewActionCard(ctx)` (new helper in `src/chatNotify.js`)

Sibling of the existing `buildActionCard` (which is comment-focused). Variant-C styling, cardsV2 payload. Fields:

| Field | Source |
|---|---|
| Title (bold) | `action.title` |
| Status pill | literal `🆕 New` (or `action.status` if set, default "Pending") |
| Meta line | `project.name` · related-task breadcrumb (`{program} › {workstream} › {task}` if `relatedTaskId` resolves) · `due {date}` (if `dueDate`) · `@{pic}` (if set) · priority |
| Body | `🆕 New action created by {author}` + `action.description` if present |
| Footer | `{author}, {timestamp}` + `View →` deep link `?project={id}&action={id}` (reuses the Stage 1 deep-link handler that opens the action) |

Reuses `escapeChatText`, `formatDisplayTimestamp` from chatNotify.js. Accent / icon consistent with `buildActionCard`.

## localStorage pref helpers

Stage 1 has `getNotifyPref(projectId)` / `setNotifyPref(projectId, value)` hardcoded to key `myWork:chatNotify:{projectId}`. To support a second independent pref, parametrize with an optional key suffix:

```js
getNotifyPref(projectId, suffix = '')   // key: myWork:chatNotify{suffix}:{projectId}
setNotifyPref(projectId, value, suffix = '')
```

- Comment-notify keeps calling `getNotifyPref(projectId)` → suffix `''` → key `myWork:chatNotify:{projectId}` (unchanged, no migration).
- New-action-notify calls `getNotifyPref(projectId, 'NewAction')` → key `myWork:chatNotifyNewAction:{projectId}`.

## Acceptance criteria

- [ ] In a project WITH a webhook configured, opening "New action" form shows a "📢 Notify {project} chat" checkbox.
- [ ] In a project WITHOUT a webhook, the checkbox does not render.
- [ ] Editing an existing action never shows the checkbox.
- [ ] Checkbox default state respects `localStorage["myWork:chatNotifyNewAction:{projectId}"]` (off first time, remembers last choice). Toggling persists immediately.
- [ ] Creating an action with the checkbox ticked POSTs a "🆕 New action" card to the chat space within ~2s, in BOTH creation paths (Actions tab + My Work/Mindmap modal).
- [ ] Card shows title, 🆕 New status, meta line (project / related task / due / PIC / priority), "New action created by {author}" body, and a working `View →` deep link.
- [ ] Clicking `View →` opens the app, switches to that project + Actions tab, and opens that action (reusing the Stage 1 deep-link handler).
- [ ] Chat delivery failure shows a toast but the action is still created.
- [ ] The comment-notify checkbox and its pref (`myWork:chatNotify:{projectId}`) are unaffected — no regression to Stage 1.
- [ ] Unchecking the new-action checkbox and creating → no card delivered.

## Out of scope / follow-ups

- Email channel (mailto: / SMTP).
- Notify on edit, on task/decision/RAID creation.
- Always-on / per-workspace default policy.
- Configurable card template per project.
