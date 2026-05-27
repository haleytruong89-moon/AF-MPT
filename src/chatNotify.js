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
  };
}

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
