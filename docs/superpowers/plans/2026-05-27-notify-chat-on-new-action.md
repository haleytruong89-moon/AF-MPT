# Notify Google Chat on new action creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in "📢 Notify chat" checkbox to the action *creation* form; ticking it POSTs a "🆕 New action" card to the project's existing Google Chat webhook.

**Architecture:** Reuse Stage 1 infrastructure (`project.googleChatWebhook`, `postToChat`, deep-link handler). Add `buildNewActionCard` to `src/chatNotify.js`, parametrize the notify-pref helpers with an optional key suffix, surface a checkbox in `ActionItemForm` (create-mode only), thread the notify intent through both creation handlers (`saveAction` in ActionItemsView, `createActionFromMyWork` in App).

**Tech Stack:** React 18, single `src/App.jsx` + `src/chatNotify.js`. No backend, no new dependency, no schema change. `npm run build` is the gate (no test framework).

**Spec reference:** `docs/superpowers/specs/2026-05-27-notify-chat-on-new-action-design.md`

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/chatNotify.js` | **Modify** | Parametrize `getNotifyPref`/`setNotifyPref` with optional suffix. Add `buildNewActionCard(ctx)`. |
| `src/App.jsx` | **Modify** | Import `buildNewActionCard`. Add notify checkbox + `notifyChat` state to `ActionItemForm` (create-mode only); pass intent via `onSave(action, { notifyChat })`. Thread through `ActionCreateModal.onSave` → `onCreate(action, projectId, opts)`. Fire `postToChat` in ALL THREE create handlers that consume `ActionItemForm.onSave`: `ActionItemsView.saveAction` (Actions tab, line ~4700), `createActionFromMyWork` (modal path, line ~12745), and `TaskDetail.saveAction` (task-linked action, line ~3210). |

Two files. No new files, no schema, no rules change.

**Note — two functions both named `saveAction`:** `TaskDetail.saveAction` (line ~3210, uses `editingAction`/`setShowActionForm`) and `ActionItemsView.saveAction` (line ~4700, uses `editing`/`setShowForm`/`onActivity`). They are distinct; Tasks 3 and 5 each show the exact distinguishing current code so the right one is edited.

---

### Task 1: Parametrize notify-pref helpers + add `buildNewActionCard`

**Files:**
- Modify: `src/chatNotify.js`

- [ ] **Step 1: Parametrize the pref key helpers**

Replace the existing `notifyPrefKey` / `getNotifyPref` / `setNotifyPref` block (currently lines ~17-38):

```js
/** localStorage key for the per-project "notify chat" checkbox preference. */
function notifyPrefKey(projectId) {
  return `myWork:chatNotify:${projectId}`;
}

/** Read the user's last notify-checkbox state for a project. Default false. */
export function getNotifyPref(projectId) {
  try {
    return localStorage.getItem(notifyPrefKey(projectId)) === 'true';
  } catch {
    return false;
  }
}

/** Persist the user's notify-checkbox state for a project. */
export function setNotifyPref(projectId, value) {
  try {
    localStorage.setItem(notifyPrefKey(projectId), value ? 'true' : 'false');
  } catch {
    /* ignore quota / disabled storage */
  }
}
```

with the parametrized version (backward compatible — suffix defaults to '' so the existing comment-notify key is unchanged):

```js
/** localStorage key for a per-project "notify chat" checkbox preference.
 *  suffix distinguishes independent checkboxes (e.g. 'NewAction'); empty
 *  suffix is the original comment-notify key (unchanged for back-compat). */
function notifyPrefKey(projectId, suffix = '') {
  return `myWork:chatNotify${suffix}:${projectId}`;
}

/** Read the user's last notify-checkbox state for a project. Default false. */
export function getNotifyPref(projectId, suffix = '') {
  try {
    return localStorage.getItem(notifyPrefKey(projectId, suffix)) === 'true';
  } catch {
    return false;
  }
}

/** Persist the user's notify-checkbox state for a project. */
export function setNotifyPref(projectId, value, suffix = '') {
  try {
    localStorage.setItem(notifyPrefKey(projectId, suffix), value ? 'true' : 'false');
  } catch {
    /* ignore quota / disabled storage */
  }
}
```

- [ ] **Step 2: Add `buildNewActionCard` after `buildActionCard`**

Locate `buildActionCard`'s closing brace:

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "^export function buildActionCard\|^export function buildTestText" src/chatNotify.js
```

Insert BETWEEN them (after `buildActionCard` ends, before `buildTestText`):

```js
/** Build a "new action created" cardsV2 payload. Sibling of buildActionCard
 *  (which is comment-focused). Variant-C styling.
 *  @param ctx.project    { id, name, color? }
 *  @param ctx.action     { id, title, status, pic, dueDate?, priority?, description? }
 *  @param ctx.related    { program: { name }, workstream: { name }, task: { name } } | null
 *  @param ctx.author     string — who created the action
 *  @param ctx.timestamp  ISO string (defaults to now)
 *  @param ctx.appBaseUrl defaults to https://af-mpt.vercel.app
 */
export function buildNewActionCard(ctx) {
  const {
    project, action, related, author,
    timestamp = new Date().toISOString(),
    appBaseUrl = 'https://af-mpt.vercel.app',
  } = ctx;

  const breadcrumb = related
    ? `${project.name} › ${related.program?.name || '—'} › ${related.workstream?.name || '—'} › ${related.task?.name || '—'}`
    : `${project.name} › Action item`;
  const dueLabel = action.dueDate
    ? `due ${new Date(action.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : null;
  const metaLine = [
    breadcrumb,
    dueLabel,
    action.pic ? `@${action.pic}` : null,
    action.priority ? `${action.priority} priority` : null,
  ].filter(Boolean).join(' · ');

  const bodyLines = [`🆕 New action created by ${author}`];
  if (action.description) bodyLines.push(action.description);
  const body = bodyLines.join('\n');

  const deepLink = `${appBaseUrl}/?project=${encodeURIComponent(project.id)}&action=${encodeURIComponent(action.id)}`;
  const footer = `${author}, ${formatDisplayTimestamp(timestamp)}`;

  return {
    cardsV2: [
      {
        cardId: `new-action-${action.id}-${Date.now()}`,
        card: {
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    topLabel: '🆕 New action',
                    text: `<b>${escapeChatText(action.title || '(untitled action)')}</b>`,
                    wrapText: true,
                    startIcon: { knownIcon: 'DESCRIPTION' },
                  },
                },
                { textParagraph: { text: escapeChatText(metaLine) } },
                { divider: {} },
                { textParagraph: { text: escapeChatText(body) } },
                { divider: {} },
                {
                  decoratedText: {
                    text: escapeChatText(footer),
                    button: {
                      text: 'View',
                      onClick: { openLink: { url: deepLink } },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}
```

Note: `escapeChatText` and `formatDisplayTimestamp` are internal functions already defined at the bottom of chatNotify.js — `buildNewActionCard` is declared above them but that's fine (function declarations hoist).

- [ ] **Step 3: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean. (Callers of `getNotifyPref(projectId)` still work — suffix defaults to ''.)

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/chatNotify.js && git commit -m "feat(chat): buildNewActionCard + suffix param on notify-pref helpers"
```

---

### Task 2: Add notify checkbox to ActionItemForm (create-mode only)

**Files:**
- Modify: `src/App.jsx` — `ActionItemForm` (starts at line ~4229) + its chatNotify import line.

- [ ] **Step 1: Extend the chatNotify import in App.jsx**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "from './chatNotify'" src/App.jsx
```

The existing import currently brings in (from prior work): `validateWebhookUrl, buildTestText, postToChat, WEBHOOK_PREFIX, buildActionCard, getNotifyPref, setNotifyPref`. Add `buildNewActionCard`:

```js
import { validateWebhookUrl, buildTestText, postToChat, WEBHOOK_PREFIX, buildActionCard, getNotifyPref, setNotifyPref, buildNewActionCard } from './chatNotify';
```

(Match the actual existing import line — append `buildNewActionCard` to whatever is already imported.)

- [ ] **Step 2: Add `notifyChat` state to ActionItemForm**

In `ActionItemForm` (line ~4229), after the existing `useState` declarations (e.g. after `const [status, setStatus] = useState(...)` at line ~4236), add:

```js
  // v30 — Notify-chat-on-create. Only meaningful when creating (not editing)
  // and the project has a Chat webhook configured. Default state remembers
  // the user's last choice per project via the 'NewAction' pref suffix.
  const isCreate = !initial;
  const chatWebhook = project?.googleChatWebhook || null;
  const showNotify = isCreate && !!chatWebhook;
  const [notifyChat, setNotifyChat] = useState(() => showNotify ? getNotifyPref(project.id, 'NewAction') : false);
```

- [ ] **Step 3: Pass notify intent through `submit()`**

Change the `submit` function (line ~4252) to pass a second arg:

```js
  const submit = () => {
    onSave({
      id: initial?.id || uid('act'),
      timestamp: initial?.timestamp || new Date().toISOString(),
      title: title.trim(),
      description: description.trim(),
      pic: pic.trim(),
      dueDate: dueDate || null,
      priority,
      relatedTaskId: relatedTaskId || null,
      status,
      openProjectWpId: initial?.openProjectWpId || null,
      author: initial?.author || author,
    }, { notifyChat: showNotify && notifyChat });
  };
```

- [ ] **Step 4: Render the checkbox above the Cancel/Create button row**

Find the footer button row (line ~4377):

```jsx
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" disabled={!canSave} onClick={submit}>{initial ? 'Save' : 'Create action'}</Btn>
      </div>
```

Insert the checkbox block IMMEDIATELY BEFORE that `<div>`:

```jsx
      {showNotify && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: TOK.muted, marginTop: 14, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={notifyChat}
            onChange={(e) => {
              setNotifyChat(e.target.checked);
              setNotifyPref(project.id, e.target.checked, 'NewAction');
            }}
          /> 📢 Notify {project.name} chat
        </label>
      )}
```

- [ ] **Step 5: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean. The `onSave` second arg is currently ignored by both callers — wired in Tasks 3 & 4.

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(actions): notify-chat checkbox on action create form"
```

---

### Task 3: Fire chat post from Actions-tab create (`saveAction`)

**Files:**
- Modify: `src/App.jsx` — `ActionItemsView.saveAction` (line ~4700) + ensure `onNavigateRaid`/webhook reachable. (Note: ActionItemsView already has `project`, `author`, `teamMembers`, `showToast` in scope from prior tasks.)

- [ ] **Step 1: Read the current saveAction**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "const saveAction = (a) =>" src/App.jsx
```

Current:

```js
  const saveAction = (a) => {
    const next = editing ? actions.map((x) => x.id === a.id ? a : x) : [a, ...actions];
    onProjectUpdate({ ...project, actionItems: next });
    onActivity({ type: editing ? 'action_edit' : 'action_create', description: `${editing ? 'Updated' : 'Created'} action: "${a.title}" → ${a.pic}` });
    setShowForm(false);
    setEditing(null);
  };
```

- [ ] **Step 2: Accept the opts arg and fire the chat post on create**

Replace with:

```js
  const saveAction = (a, opts = {}) => {
    const wasEditing = !!editing;
    const next = editing ? actions.map((x) => x.id === a.id ? a : x) : [a, ...actions];
    onProjectUpdate({ ...project, actionItems: next });
    onActivity({ type: editing ? 'action_edit' : 'action_create', description: `${editing ? 'Updated' : 'Created'} action: "${a.title}" → ${a.pic}` });
    setShowForm(false);
    setEditing(null);
    // v30 — notify chat on create (opt-in). Never blocks the create.
    if (!wasEditing && opts.notifyChat && project.googleChatWebhook) {
      const related = a.relatedTaskId ? findTaskInProject(project, a.relatedTaskId) : null;
      postToChat(project.googleChatWebhook, buildNewActionCard({
        project, action: a, related, author,
      })).then((res) => {
        if (showToast) showToast(res.ok
          ? 'Action created · 📢 Sent to chat'
          : `Action created. Chat notify failed: ${res.status} ${res.statusText}`);
      });
    }
  };
```

`findTaskInProject`, `postToChat`, `buildNewActionCard`, `author`, `showToast`, `project` are all already in scope in ActionItemsView (verify `author` and `showToast` are in the function signature — they are, used by the email-pics flow).

- [ ] **Step 3: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(actions): post new-action card from Actions-tab create"
```

---

### Task 4: Thread notify through ActionCreateModal → createActionFromMyWork

**Files:**
- Modify: `src/App.jsx` — `ActionCreateModal` (line ~4496) + `createActionFromMyWork` (line ~12745) + the `<ActionCreateModal onCreate={...}>` call site (line ~13394).

- [ ] **Step 1: Forward opts from ActionCreateModal's onSave to onCreate**

In `ActionCreateModal` (line ~4496), the form's onSave currently is:

```jsx
          onSave={(newAction) => {
            const finalAction = { ...newAction, pic: newAction.pic || effectivePic || '' };
            onCreate(finalAction, projectId);
            onClose();
          }}
```

Change to forward the second arg:

```jsx
          onSave={(newAction, opts) => {
            const finalAction = { ...newAction, pic: newAction.pic || effectivePic || '' };
            onCreate(finalAction, projectId, opts);
            onClose();
          }}
```

- [ ] **Step 2: Read the call site of ActionCreateModal**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "onCreate={(newAction, projectId) => createActionFromMyWork" src/App.jsx
```

Current (line ~13394):

```jsx
            onCreate={(newAction, projectId) => createActionFromMyWork(newAction, projectId, impersonatingAs || '')}
```

Change to forward opts:

```jsx
            onCreate={(newAction, projectId, opts) => createActionFromMyWork(newAction, projectId, impersonatingAs || '', opts)}
```

- [ ] **Step 3: Fire the chat post in createActionFromMyWork**

Current (line ~12745):

```js
  const createActionFromMyWork = useCallback((newAction, projectId, actingAs = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const updated = cloneDeep(targetProj);
    updated.actionItems = [newAction, ...(updated.actionItems || [])];
    updateProject(updated);
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    logActivityForProject(projectId, {
      type: 'action_create',
      description: `${actingPrefix}Created action: "${newAction.title}" → ${newAction.pic || '—'} (from My Work)`,
    });
    showToast(`Action created in ${targetProj.name}`);
  }, [projects, updateProject, logActivityForProject]);
```

Replace with (adds `opts` param + chat post):

```js
  const createActionFromMyWork = useCallback((newAction, projectId, actingAs = '', opts = {}) => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const updated = cloneDeep(targetProj);
    updated.actionItems = [newAction, ...(updated.actionItems || [])];
    updateProject(updated);
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    logActivityForProject(projectId, {
      type: 'action_create',
      description: `${actingPrefix}Created action: "${newAction.title}" → ${newAction.pic || '—'} (from My Work)`,
    });
    // v30 — notify chat on create (opt-in). Never blocks the create.
    if (opts.notifyChat && targetProj.googleChatWebhook) {
      const related = newAction.relatedTaskId ? findTaskInProject(targetProj, newAction.relatedTaskId) : null;
      postToChat(targetProj.googleChatWebhook, buildNewActionCard({
        project: targetProj, action: newAction, related, author,
      })).then((res) => {
        showToast(res.ok
          ? `Action created in ${targetProj.name} · 📢 Sent to chat`
          : `Action created. Chat notify failed: ${res.status} ${res.statusText}`);
      });
    } else {
      showToast(`Action created in ${targetProj.name}`);
    }
  }, [projects, updateProject, logActivityForProject]);
```

Verify `author` is in scope where `createActionFromMyWork` is defined (it's an App-level useCallback; `author` is App state — confirm via grep `const \[author` / `const author =`). If `author` is not directly in scope, use the App-level author variable name actually present (e.g. `effectiveAuthor` is used at the ActionCreateModal call site — check which is correct). Use whichever resolves; the card's `author` should be the creating user's display name.

- [ ] **Step 4: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean. If "author is not defined", substitute the App-scope author variable (grep `effectiveAuthor` / `author` near the other useCallback handlers to find the right one).

- [ ] **Step 5: Manual smoke check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run dev
```

1. Open a project WITH a Chat webhook configured (Project Settings → Google Chat integration).
2. **Actions tab** → click "+ New action" / open the create form → the "📢 Notify {project} chat" checkbox is visible. Tick it, fill title + PIC, Create.
   - Toast: "Action created · 📢 Sent to chat".
   - Chat space receives a "🆕 New action" card with title, meta, "New action created by …" body, View link.
3. **My Work** → "New action" button → ActionCreateModal → same checkbox present → tick → create → card delivered.
4. Open the **edit** form on an existing action → checkbox does NOT appear.
5. Open a project WITHOUT a webhook → checkbox does NOT appear in create form.
6. Tick the checkbox, create, then open the create form again → checkbox remembered as ticked (localStorage `myWork:chatNotifyNewAction:{projectId}`).
7. Click "View" in the chat card → app opens that project + Actions tab + that action.
8. Post a comment on an action (Stage 1 flow) → confirm the comment-notify checkbox + its separate pref still work (no regression).

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(my-work): post new-action card from ActionCreateModal path"
```

---

### Task 5: Wire chat post from TaskDetail's action-create path

**Files:**
- Modify: `src/App.jsx` — `TaskDetail.saveAction` (line ~3210).

**Why:** `TaskDetail` renders `ActionItemForm` (line ~3605) for creating an action linked to the open task. With the checkbox added in Task 2, it appears here too — but `TaskDetail.saveAction` (a SEPARATE function from the ActionItemsView one) currently ignores the `opts` arg, so ticking the box would silently do nothing. Wire it for consistency.

`TaskDetail` has `project`, `author`, `onProjectUpdate` in scope, but NOT `showToast`. Fire-and-forget the post (log failure to console) rather than plumbing `showToast` through TaskDetail — keeping the change minimal for this secondary path.

- [ ] **Step 1: Read the current TaskDetail.saveAction**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && sed -n '3210,3216p' src/App.jsx
```

Current:

```js
  const saveAction = (a) => {
    const list = project.actionItems || [];
    const next = editingAction ? list.map((x) => x.id === a.id ? a : x) : [a, ...list];
    onProjectUpdate({ ...project, actionItems: next });
    setShowActionForm(false); setEditingAction(null);
  };
```

- [ ] **Step 2: Accept opts + fire post on create**

Replace with:

```js
  const saveAction = (a, opts = {}) => {
    const wasEditing = !!editingAction;
    const list = project.actionItems || [];
    const next = editingAction ? list.map((x) => x.id === a.id ? a : x) : [a, ...list];
    onProjectUpdate({ ...project, actionItems: next });
    setShowActionForm(false); setEditingAction(null);
    // v30 — notify chat on create (opt-in). Fire-and-forget; never blocks.
    if (!wasEditing && opts.notifyChat && project.googleChatWebhook) {
      const related = a.relatedTaskId ? findTaskInProject(project, a.relatedTaskId) : null;
      postToChat(project.googleChatWebhook, buildNewActionCard({
        project, action: a, related, author,
      })).then((res) => {
        if (!res.ok) console.error('New-action chat notify failed:', res.status, res.statusText);
      });
    }
  };
```

`findTaskInProject`, `postToChat`, `buildNewActionCard`, `project`, `author` are all in scope in TaskDetail. (`author` is a TaskDetail prop — verify in the signature `function TaskDetail({ ..., author, ... })`.)

- [ ] **Step 3: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean.

- [ ] **Step 4: Manual smoke check**

In the dev server: open a task → expand the linked-actions panel → "Add action" → confirm the "📢 Notify chat" checkbox appears (when project has a webhook) → tick → create → card delivered to chat. Editing an existing linked action shows no checkbox.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(task-detail): post new-action card from task-linked action create"
```

---

### Task 6: Push + verify Vercel deploy + production smoke

- [ ] **Step 1: Final build clean**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: `✓ built` with no TS errors, only the pre-existing chunk-size warning.

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

Open https://af-mpt.vercel.app, repeat the Task 4 Step 5 smoke flow against the live deploy (a project with a real webhook).

---

## Non-goals (out of scope)

- Email channel (mailto: / SMTP).
- Notify on action edit, task creation, decision creation, RAID creation.
- Always-on / per-workspace default policy.
- Configurable card template.

## Known risks

- `author` scope in `createActionFromMyWork`: the card needs the creator's display name. Task 4 Step 3 flags verifying the correct App-scope variable (`author` vs `effectiveAuthor`). The build will fail loudly if wrong.
- Card duplication: `buildNewActionCard` returns only `cardsV2` (no root `text`) — learned from the Stage 1 review where a stray root `text` caused double-render. Do NOT add a `text` key.
- The `onSave(action, opts)` second arg is additive; the edit-mode path passes `notifyChat: false` implicitly (checkbox hidden, `showNotify` false) so editing never notifies.
