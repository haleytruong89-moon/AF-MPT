# Google Chat notification — Stage 1 (Group webhook) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let project owners configure a Google Chat webhook URL per project; when a project member posts an action-item comment with the "Notify chat" checkbox ticked, the app POSTs a Variant-C card to that space.

**Architecture:** Frontend-only (no backend). One pure helper module `src/chatNotify.js` exports `buildActionCard`, `buildTestText`, `postToChat`, `validateWebhookUrl`, plus localStorage helpers for the per-project notify-preference. ProjectSettingsModal gains a Google Chat section (owner-only). ActionRowInline gains a notify checkbox and triggers the POST after the existing comment write. App mount-time effect handles `?project=X&action=Y` deep links.

**Tech Stack:** React 18 + plain JS (no TS for the new module), `fetch` against Google Chat webhook (CORS-permissive). No new dependencies.

**Testing approach:** Repository has no Jest/Vitest setup (`package.json` has no `test` script, no `tests/` directory). Plan uses manual smoke checks at each task and the production build (`npm run build`) as the gate. Adding a test framework is YAGNI for this feature — flag for a future plan if needed.

**Spec reference:** `docs/superpowers/specs/2026-05-19-google-chat-notify-stage1-design.md`

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/chatNotify.js` | **Create** | Pure helpers — build card payloads, validate URL, POST, localStorage prefs. No React imports; trivially unit-testable when we add a framework. |
| `src/App.jsx` | **Modify** | Project Settings section, ActionRowInline checkbox + post call, deep-link handler in mount effect, prop plumbing for `showToast`. |

Two files only. The new module is ~100 LOC and isolated; App.jsx changes are local to existing components.

No schema migration (new field defaults to `undefined`, treated as "not configured"). No Firestore rules change — existing project-owner write gate on the project doc already covers writing `googleChatWebhook`.

---

### Task 1: Create `src/chatNotify.js` helper module

**Files:**
- Create: `src/chatNotify.js`

- [ ] **Step 1: Create the file with all exports**

```js
// Google Chat integration helpers — Stage 1 (group webhook).
// Pure functions. No React, no Firebase. Input shapes match what App.jsx
// passes from project + action objects.
//
// See docs/superpowers/specs/2026-05-19-google-chat-notify-stage1-design.md

export const WEBHOOK_PREFIX = 'https://chat.googleapis.com/v1/spaces/';

/** Returns true if the URL is plausibly a Google Chat incoming webhook. */
export function validateWebhookUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return trimmed.startsWith(WEBHOOK_PREFIX);
}

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

/** Build the Variant-C cardsV2 payload for an action update.
 *  @param ctx.project       { id, name, color? }
 *  @param ctx.action        { id, title, status, pic, dueDate? }
 *  @param ctx.related       { program: { name }, workstream: { name }, task: { name } } | null
 *  @param ctx.author        string — display name of the poster
 *  @param ctx.text          string — the comment text just posted
 *  @param ctx.isBlocker     boolean
 *  @param ctx.timestamp     ISO string (defaults to new Date().toISOString())
 *  @param ctx.appBaseUrl    e.g. 'https://af-mpt.vercel.app'
 *  @returns object — body to JSON.stringify and POST to the webhook
 */
export function buildActionCard(ctx) {
  const {
    project, action, related, author, text,
    isBlocker = false,
    timestamp = new Date().toISOString(),
    appBaseUrl = 'https://af-mpt.vercel.app',
  } = ctx;

  const color = project.color || '#0C447C';
  const dueLabel = formatDueLabel(action);
  const breadcrumb = related
    ? `${project.name} › ${related.program?.name || '—'} › ${related.workstream?.name || '—'}`
    : `${project.name} › Action item`;
  const metaLine = [
    breadcrumb,
    dueLabel,
    action.pic ? `@${action.pic}` : null,
    isBlocker ? '🚩 Blocker' : null,
  ].filter(Boolean).join(' · ');

  const deepLink = `${appBaseUrl}/?project=${encodeURIComponent(project.id)}&action=${encodeURIComponent(action.id)}`;
  const footer = `${author}, ${formatDisplayTimestamp(timestamp)}`;

  return {
    cardsV2: [
      {
        cardId: `action-${action.id}-${Date.now()}`,
        card: {
          header: undefined,
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    topLabel: action.status || 'Open',
                    text: `<b>${escapeChatText(action.title || '(untitled action)')}</b>`,
                    wrapText: true,
                    startIcon: { knownIcon: 'DESCRIPTION' },
                  },
                },
                { textParagraph: { text: escapeChatText(metaLine) } },
                { divider: {} },
                { textParagraph: { text: escapeChatText(text) } },
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
    // Used only by the plain-text fallback; Google Chat ignores it for cards.
    text: `${action.title || '(untitled action)'} — ${text}\n${deepLink}`,
    // Accent color hint (Google Chat may or may not render; harmless if ignored).
    cardHeaderAccent: color,
  };
}

/** Plain-text payload for the "Send test message" button.
 *  Spec §4: ✅ Test message from [Project name] — Google Chat integration working. Sent by [author] at [timestamp].
 */
export function buildTestText({ projectName, author, timestamp = new Date().toISOString() }) {
  return {
    text: `✅ Test message from ${projectName} — Google Chat integration working. Sent by ${author} at ${formatDisplayTimestamp(timestamp)}.`,
  };
}

/** POST a payload to the webhook URL.
 *  @returns { ok: boolean, status: number, statusText: string, errorText?: string }
 */
export async function postToChat(url, payload) {
  if (!validateWebhookUrl(url)) {
    return { ok: false, status: 0, statusText: 'Invalid webhook URL', errorText: 'URL must start with ' + WEBHOOK_PREFIX };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let errorText = '';
      try { errorText = await res.text(); } catch { /* ignore */ }
      return { ok: false, status: res.status, statusText: res.statusText, errorText };
    }
    return { ok: true, status: res.status, statusText: res.statusText };
  } catch (e) {
    return { ok: false, status: 0, statusText: 'Network error', errorText: String(e && e.message || e) };
  }
}

// ─── Internal helpers ───

function formatDueLabel(action) {
  if (!action.dueDate) return null;
  const due = new Date(action.dueDate);
  if (isNaN(due.getTime())) return null;
  const now = new Date();
  const isPast = due < new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const label = due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return isPast && action.status !== 'Done' ? `Overdue — was due ${label}` : `due ${label}`;
}

function formatDisplayTimestamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Google Chat textParagraph accepts a subset of HTML-ish formatting. Escape
// angle brackets and ampersands to avoid breaking the card on user content.
function escapeChatText(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 2: Verify the file parses and is importable**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: `✓ built in N.NNs` with no TS errors. The new module is not imported yet — Vite will still tree-shake it cleanly.

- [ ] **Step 3: Smoke check the helpers in Node REPL or browser console**

In dev server's browser console (after starting `npm run dev`):

```js
const m = await import('/src/chatNotify.js');
m.validateWebhookUrl('https://chat.googleapis.com/v1/spaces/AAA/messages?key=x&token=y');
// → true
m.validateWebhookUrl('http://evil.example.com');
// → false
m.buildTestText({ projectName: 'CRP', author: 'hattt4' });
// → { text: '✅ Test message from CRP — Google Chat integration working. Sent by hattt4 at <date>.' }
const card = m.buildActionCard({
  project: { id: 'p1', name: 'CRP', color: '#0C447C' },
  action: { id: 'a1', title: 'Submit to BRA', status: 'Open', pic: 'hattt4', dueDate: '2026-04-30' },
  related: { program: { name: 'LLCs' }, workstream: { name: 'HIO' } },
  author: 'hattt4',
  text: '@An Nguyen confirmed both docs ready.',
  isBlocker: false,
});
console.log(JSON.stringify(card, null, 2));
// Inspect: cardsV2[0].card.sections[0].widgets has 5 entries (decoratedText, textParagraph, divider, textParagraph, decoratedText with button)
```

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/chatNotify.js && git commit -m "feat(chat): add Google Chat webhook helpers (Stage 1)"
```

---

### Task 2: Project Settings — Google Chat integration section

**Files:**
- Modify: `src/App.jsx` — inside `ProjectSettingsModal` (locate by `function ProjectSettingsModal`); also add import for new helpers.

- [ ] **Step 1: Add the import at the top of App.jsx (with the other imports)**

Find the existing imports block (around line 11-15). After the existing `./auth` and `./data` imports, add:

```js
import { validateWebhookUrl, buildTestText, postToChat, WEBHOOK_PREFIX } from './chatNotify';
```

- [ ] **Step 2: Locate ProjectSettingsModal**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "function ProjectSettingsModal" src/App.jsx
```

Note the line number. The component takes `{ project, directory, onClose, onSave, dialogs, isOwner }`. We will add a new state for the webhook URL and render the new section.

- [ ] **Step 3: Add state for the webhook URL in ProjectSettingsModal**

In the state-declaration block at the top of ProjectSettingsModal (next to existing `useState` calls like `members`, `newName`, etc.), add:

```js
const [chatWebhook, setChatWebhook] = useState(project.googleChatWebhook || '');
const [chatWebhookError, setChatWebhookError] = useState('');
const [chatTestStatus, setChatTestStatus] = useState(null); // { kind: 'ok'|'err', message: string }
```

- [ ] **Step 4: Pass `author` to ProjectSettingsModal**

The test message needs to identify who sent it. ProjectSettingsModal doesn't currently receive `author`. Find its render in App.jsx (`<ProjectSettingsModal`) and add `author={author}` to the prop list. Then change the component signature from:

```js
function ProjectSettingsModal({ project, directory, onClose, onSave, dialogs, isOwner = false }) {
```

to:

```js
function ProjectSettingsModal({ project, directory, onClose, onSave, dialogs, isOwner = false, author }) {
```

- [ ] **Step 5: Add an effect that persists webhook URL changes**

Add this function inside the component (after the state declarations from Step 3):

```js
const commitChatWebhook = () => {
  const trimmed = chatWebhook.trim();
  if (trimmed && !validateWebhookUrl(trimmed)) {
    setChatWebhookError(`URL must start with ${WEBHOOK_PREFIX}`);
    return;
  }
  setChatWebhookError('');
  // Persist null when empty so absence of integration is clean
  onSave({ ...project, googleChatWebhook: trimmed || null });
};

const sendChatTest = async () => {
  const trimmed = chatWebhook.trim();
  if (!validateWebhookUrl(trimmed)) {
    setChatTestStatus({ kind: 'err', message: 'Save a valid webhook URL first.' });
    return;
  }
  setChatTestStatus({ kind: 'ok', message: 'Sending…' });
  const result = await postToChat(trimmed, buildTestText({
    projectName: project.name,
    author: author || '(workspace owner)',
  }));
  if (result.ok) {
    setChatTestStatus({ kind: 'ok', message: 'Test message delivered ✓' });
  } else {
    setChatTestStatus({ kind: 'err', message: `Failed: ${result.status} ${result.statusText}` });
  }
};
```

- [ ] **Step 6: Add the rendered section inside the modal's body**

Locate the existing sections in the modal render (Project name, Team members, Contributor registry, etc.). Add a new section either right after Team members or as the last block before the modal footer. Insert this JSX:

```jsx
{/* ─── 🗨 Google Chat integration ─── */}
<div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid ' + TOK.line }}>
  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🗨 Google Chat integration</div>
  <div style={{ fontSize: 11, color: TOK.muted, marginBottom: 10, lineHeight: 1.5 }}>
    Paste the project's Google Chat space webhook URL. Action update notifications post to that space when "📢 Notify chat" is ticked.
  </div>
  <input
    type="text"
    value={chatWebhook}
    onChange={(e) => { setChatWebhook(e.target.value); setChatWebhookError(''); setChatTestStatus(null); }}
    onBlur={commitChatWebhook}
    disabled={!isOwner}
    placeholder={WEBHOOK_PREFIX + '...'}
    style={{
      fontFamily: FONT_STACK, fontSize: 12, width: '100%',
      padding: '7px 10px', border: '1px solid ' + (chatWebhookError ? TOK.overdueFg : TOK.lineStrong),
      borderRadius: 6, background: isOwner ? TOK.surface : TOK.bg, color: TOK.ink, outline: 'none',
    }}
  />
  {chatWebhookError && (
    <div style={{ fontSize: 11, color: TOK.overdueFg, marginTop: 4 }}>{chatWebhookError}</div>
  )}
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
    {isOwner && (
      <Btn size="sm" onClick={sendChatTest} disabled={!chatWebhook.trim()}>
        Send test message
      </Btn>
    )}
    {chatTestStatus && (
      <span style={{ fontSize: 11, color: chatTestStatus.kind === 'ok' ? TOK.doneFg : TOK.overdueFg }}>
        {chatTestStatus.message}
      </span>
    )}
    {!isOwner && (
      <span style={{ fontSize: 11, color: TOK.subtle, fontStyle: 'italic' }}>
        🔒 Workspace owner only
      </span>
    )}
  </div>
  <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 10, lineHeight: 1.5 }}>
    How to get this: open the project's Google Chat space → Space settings → Apps &amp; integrations → + Add webhook → Copy URL and paste above.
  </div>
</div>
```

- [ ] **Step 7: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean build.

- [ ] **Step 8: Manual smoke check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run dev
```

1. Sign in as workspace owner. Open Project Settings on any project.
2. Scroll to "🗨 Google Chat integration".
3. Paste a fake URL like `http://evil.com` → blur → inline red error shows "URL must start with https://chat.googleapis.com/v1/spaces/".
4. Clear field → blur → no error, field is empty (saves null).
5. Paste a real webhook URL (test one — confirm with user before this step if you don't have a sacrificial space) → blur → no error, saves.
6. Click "Send test message" → the configured space should receive the plain-text test message within 2 seconds. Inline shows "Test message delivered ✓".
7. Sign in as non-owner, open Project Settings → URL field is disabled, "🔒 Workspace owner only" shown.

- [ ] **Step 9: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(chat): project settings — Google Chat webhook URL + test"
```

---

### Task 3: ActionRowInline — notify checkbox + post-to-chat on comment

**Files:**
- Modify: `src/App.jsx` — inside `function ActionRowInline` (locate by name).

- [ ] **Step 1: Extend props**

Find the signature:

```js
function ActionRowInline({ action, project, related, author, teamMembers, picSuggestions, onChange, onAddComment, onOpenDetails, onMarkDone, onSubtasksChange }) {
```

Change to:

```js
function ActionRowInline({ action, project, related, author, teamMembers, picSuggestions, onChange, onAddComment, onOpenDetails, onMarkDone, onSubtasksChange, showToast }) {
```

(Adding `showToast` only — `project` and `related` are already in the signature.)

- [ ] **Step 2: Add the import inside ActionRowInline (uses the helpers from chatNotify)**

The imports at the top of App.jsx already include `buildActionCard`, `getNotifyPref`, `setNotifyPref`, `postToChat`. If not yet imported, extend the existing chatNotify import line from Task 2:

```js
import { validateWebhookUrl, buildTestText, postToChat, WEBHOOK_PREFIX, buildActionCard, getNotifyPref, setNotifyPref } from './chatNotify';
```

- [ ] **Step 3: Add state for the notify checkbox in ActionRowInline**

Next to the existing `useState` declarations at the top of the component (`commentDraft`, `isBlocker`, etc.), add:

```js
const webhook = project?.googleChatWebhook || null;
const [notifyChat, setNotifyChat] = useState(() => webhook ? getNotifyPref(project.id) : false);
```

(Initial state respects the per-project localStorage pref when a webhook is configured.)

- [ ] **Step 4: Wire the checkbox into the Post-comment UI**

Find the existing "Mark as blocker" label/checkbox (around `<input type="checkbox" checked={isBlocker}`). Right BELOW it, add a second checkbox — but only when a webhook is configured:

```jsx
{webhook && (
  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 6, marginLeft: 14, cursor: 'pointer' }}>
    <input
      type="checkbox"
      checked={notifyChat}
      onChange={(e) => {
        setNotifyChat(e.target.checked);
        setNotifyPref(project.id, e.target.checked);
      }}
    /> 📢 Notify {project.name} chat
  </label>
)}
```

- [ ] **Step 5: Update the Post-comment click handler to also post to chat**

Locate the existing Post-comment button (search `Post comment` inside ActionRowInline). Replace the inline `onClick` body:

```jsx
<Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={() => {
  onAddComment(commentDraft.trim(), isBlocker);
  setCommentDraft(''); setIsBlocker(false);
}}>Post comment</Btn>
```

with:

```jsx
<Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={async () => {
  const text = commentDraft.trim();
  const wantsNotify = notifyChat && !!webhook;
  // Apply the existing comment write first — chat failure must never block this.
  onAddComment(text, isBlocker);
  setCommentDraft(''); setIsBlocker(false);
  if (!wantsNotify) return;
  const result = await postToChat(webhook, buildActionCard({
    project,
    action,
    related,
    author,
    text,
    isBlocker,
    timestamp: new Date().toISOString(),
  }));
  if (result.ok) {
    showToast && showToast('Comment posted · 📢 Sent to chat');
  } else {
    showToast && showToast(`Comment posted. Chat notify failed: ${result.status} ${result.statusText} — owner can re-check the webhook URL in Project Settings.`);
  }
}}>Post comment</Btn>
```

- [ ] **Step 6: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean build. (showToast may be undefined where the caller doesn't pass it — the `showToast &&` guard handles that.)

- [ ] **Step 7: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(chat): notify checkbox + post-to-chat in ActionRowInline"
```

---

### Task 4: Pass `showToast` through to ActionRowInline at all call sites

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Find all ActionRowInline render sites**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "<ActionRowInline" src/App.jsx
```

Expected: exactly 2 JSX hits — one inside `ByProjectCard` (key prefix `p-${project.id}-a-`), one inside `MyWorkView` (key prefix `a-${actionsTab}-`).

- [ ] **Step 2: Add `showToast` to each `<ActionRowInline ... />` JSX block**

For each match, add `showToast={showToast}` as a new prop. Example, in `ByProjectCard` (the render around the "p-${project.id}-a-${a.id}" key):

```jsx
<ActionRowInline
  key={`p-${project.id}-a-${a.id || i}`}
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
  onOpenDetails={onActionClick ? () => onActionClick(e.project.id, a.id) : null}
  onSubtasksChange={(newSubtasks) => onActionUpdate({ ...a, subtasks: newSubtasks }, e.project.id)}
  showToast={showToast}
/>
```

In the MyWorkView "Action items assigned to me" section, do the same — add `showToast={showToast}` to the existing JSX.

- [ ] **Step 3: If `ByProjectCard` doesn't currently receive `showToast` as a prop, plumb it through**

ByProjectCard's signature lives near the top of its function definition. It already accepts `showToast` from `ByProjectView` (see prior work). If not, add `showToast` to the destructured props and pass to ActionRowInline.

- [ ] **Step 4: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean build.

- [ ] **Step 5: Manual smoke check — full chat post flow**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run dev
```

1. Sign in. Open My Work → By Project view → expand a project that has a webhook configured.
2. Open an action item → expand → see "📢 Notify [Project] chat" checkbox below "Mark as blocker".
3. Tick it → type a comment with `@SomeUser` mention → click "Post comment".
4. Toast: "Comment posted · 📢 Sent to chat".
5. Open the Google Chat space → see the Variant-C card: accent bar, title, status pill, breadcrumb meta, comment body, footer with author and "View" link.
6. Click "View" — the link opens `https://af-mpt.vercel.app/?project=...&action=...` — (next task wires the auto-open; for now confirm the URL is correctly formed in the card.)
7. Refresh My Work → re-expand the action — checkbox state remembered (persisted in localStorage).
8. Untick the checkbox, post another comment → no chat card delivered.
9. Sabotage the webhook URL (Project Settings → edit URL to a garbage `https://chat.googleapis.com/v1/spaces/XXX/messages?key=bad&token=bad` and save) → post comment with notify checked → toast: "Comment posted. Chat notify failed: 404 Not Found — owner can re-check the webhook URL in Project Settings." Comment is still saved in app.

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(chat): wire showToast to ActionRowInline at all call sites"
```

---

### Task 5: Deep link handler — `?project=X&action=Y` opens the action on app mount

**Files:**
- Modify: `src/App.jsx` — inside the top-level `App()` component's mount-time effect.

- [ ] **Step 1: Locate the mount effect**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && grep -n "Load on mount\|useEffect(() => {\s*$" src/App.jsx | head -10
```

Find the comment `// Load on mount` (around line 7895). It's a `useEffect(() => { (async () => { ... })(); }, []);` block that calls `loadMeta`, sets meta, loads projects, etc.

- [ ] **Step 2: At the end of that mount effect, parse the URL and apply deep-link state**

INSIDE the existing async IIFE inside the mount effect, right after `setLoading(false);`, add:

```js
// Stage 1 deep link — Google Chat "View" → ?project=X&action=Y. Switch to
// the project and Actions tab if the user has access. Clear the params so a
// refresh doesn't re-trigger.
try {
  const params = new URLSearchParams(window.location.search);
  const dpProj = params.get('project');
  const dpAct = params.get('action');
  if (dpProj && dpAct && ps[dpProj]) {
    setCurrentId(dpProj);
    setView('actions');
    // Note: scrolling to / expanding the specific action is a follow-up.
    // Stage 1 only switches view + project so the user lands in the right place.
    window.history.replaceState({}, '', window.location.pathname);
  }
} catch {
  /* ignore — defensive guard for any URL parse oddity */
}
```

(Inside the closure, `ps` is the projects map already built earlier in this effect.)

- [ ] **Step 3: Build check**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: clean build.

- [ ] **Step 4: Manual smoke check**

1. Trigger a chat notification via the flow from Task 4 step 5.
2. In the chat card, click "View".
3. App loads. Current project switches to the right one. View tab switches to "Actions".
4. URL bar shows the plain `/` path (query params cleared).
5. Refresh the page — stays in the same project + view (no re-trigger from stale params).
6. Manually visit `https://af-mpt.vercel.app/?project=DOES_NOT_EXIST&action=xxx` — app loads normally with whatever the user's default project is. No crash, no error toast (silent ignore).

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git add src/App.jsx && git commit -m "feat(chat): deep-link handler — ?project=X&action=Y opens the action"
```

---

### Task 6: Push, verify Vercel deploy, end-to-end production smoke

- [ ] **Step 1: Final local build clean**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && npm run build
```

Expected: `✓ built` with no TS errors, no warnings other than the existing chunk-size warning.

- [ ] **Step 2: Push to trigger Vercel deploy**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git push origin main
```

- [ ] **Step 3: Wait for deploy to reach Ready**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && until npx vercel ls --yes 2>&1 | sed -n '6p' | grep -E "Ready|Error|Failed" >/dev/null; do sleep 10; done; npx vercel ls --yes 2>&1 | sed -n '5,7p'
```

Expected: most recent deploy reaches `● Ready` within ~30s.

- [ ] **Step 4: Production smoke**

Open https://af-mpt.vercel.app, sign in as workspace owner.

1. Open Project Settings on a project. Paste a fresh webhook URL. Save. Click "Send test message" — confirm the test message lands in the space.
2. Open an action in that project. Tick the notify checkbox. Post a comment with an @mention. Confirm:
   - Comment saved (visible in the action row).
   - Card delivered to chat (Variant-C layout, accent bar matches project color, status pill, breadcrumb, body, footer with View link).
3. Click "View" in chat — browser opens app, lands on Actions tab of the right project, URL cleaned.
4. Sign out → sign in as non-owner. Open Project Settings — webhook field is read-only, "🔒 Workspace owner only" shown. Open an action — notify checkbox is still shown (members can use the webhook the owner configured).
5. Test failure path: have owner change the webhook URL to a syntactically valid but wrong path (e.g. swap one character of the token). Post a comment with notify ticked — toast shows "Chat notify failed: 4xx ..." and the comment is still saved.

- [ ] **Step 5: Final clean-up — confirm there are no leftover commits or unpushed local changes**

```bash
cd "c:/Users/hattt4/projects/afmpt-tracker/afmpt-tracker" && git status && git log --oneline -8
```

Expected: clean working tree; 5–6 commits from this plan on top of `00ba499` (the spec resolution commit).

---

## Non-goals (Stage 2 — explicitly NOT in this plan)

- DM-to-PIC via Chat App + service account (Stage 2)
- Auto-trigger on status change, mark-done, subtask change (would spam)
- Bidirectional sync (Chat → app)
- Interactive buttons on the card (Mark done, Reply) — needs a Chat App backend
- Notifications for task updates, RAID changes, decisions (this stage = action items only)
- Auto-scroll / auto-expand of the specific action after deep-link load (Stage 1 only switches project + view; row-level focus is a follow-up if users complain)

## Known risks

- **Webhook URL is a secret-ish**: anyone with project read access can extract it and post arbitrarily to the space. Acceptable for @smartosc.com only. Move to backend route if abuse occurs.
- **Card delivery delay**: Google Chat may rate-limit ~60 messages/min/webhook. We post one per click — well below.
- **`@mention` parsing**: Google Chat parses `@Name` on the receiver side. If the PIC's display name in the app differs from their Chat display name, mention won't resolve into a notification; falls back to plain text. Future tightening could map app display name → Google user ID via a small client-side directory.
- **Test message wording** is hardcoded in Vietnamese-agnostic English. If the team wants the test text localized, add a follow-up task.
