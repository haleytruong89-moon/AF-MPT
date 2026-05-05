# Feature Spec: Wiki References + Sign Out

This document specifies two features to add to `src/App.jsx`:

1. **Wiki References** — per-milestone link library (Google Docs, Sheets, Figma, etc.)
2. **Sign Out** — user can sign out and see a landing page before signing back in

The implementation is fully self-contained — no new dependencies, no schema migrations needed (graceful fallback for legacy data via `task.references || []` and `signedOut || false`).

---

## How to use this doc with Claude Code

Open a Claude Code session in VS Code at the project root, then prompt:

```
Read FEATURES_SPEC.md and implement both features in src/App.jsx.
Follow the spec exactly — code snippets are ready to paste at the indicated locations.
After implementing, verify the file parses (no syntax errors) and tell me what you changed.
```

Or implement one feature at a time:

```
Read FEATURES_SPEC.md section "Feature 1: Wiki References" and implement it in src/App.jsx.
```

---

## Feature 1: Wiki References

### Intent

Each main task (leaf node) in the project hierarchy needs a **wiki section** — a list of links to related documents (typically Google Docs, Google Sheets, Figma files). PMs add these in TaskDetail panel; team members click to open the doc in a new tab.

### Schema (additive, no migration needed)

Add `references` array to each task. Code reads it as `task.references || []` so legacy tasks without the field still work.

```js
task.references: [{
  id: string,        // 'ref_<timestamp>_<random>'
  url: string,       // full URL (validated as http/https)
  title: string,     // display title (defaults to type label)
  type: string,      // 'sheet'|'doc'|'slides'|'drive'|'figma'|'notion'|'link'
  addedAt: string,   // ISO timestamp
  addedBy: string,   // author name
}]
```

### UI placement

Collapsible section in TaskDetail panel, **between** meta info (Dependencies row) and the Updates/Decisions/Actions tabs. Header always visible (`📚 References (N)`), list expands on click. Default expanded if task has ≥1 ref, collapsed if empty.

### Type detection

Auto-detected from URL pattern when user pastes URL:

| URL pattern | Type | Pill color |
|---|---|---|
| `docs.google.com/spreadsheets` | `sheet` | green |
| `docs.google.com/document` | `doc` | blue |
| `docs.google.com/presentation` | `slides` | yellow |
| `drive.google.com` | `drive` | teal |
| `figma.com` | `figma` | purple |
| `notion.so` / `notion.site` | `notion` | gray |
| anything else | `link` | gray |

### Excel round-trip

Add `References` column to export/import. Format: `URL1 | Title1; URL2 | Title2`.
- Multiple refs separated by `;`
- Each ref is `URL | Title` (title optional)
- Invalid URLs skipped silently on import
- Column aliases on import: `References`, `Refs`, `Wiki`

### Validation rules

- URL required, must start with `http://` or `https://`
- Title optional — defaults to type label (`"Sheet"`, `"Doc"`, etc.) if blank
- Empty references field never renders an empty row

### Implementation steps

#### Step 1.1: Add constants and helpers

**Location:** Right after `const HEALTH_LABEL = ...` near top of file (around line 21).

```jsx
// Reference (wiki link) types — auto-detected from URL pattern.
// Each type gets a distinctive label + color pill in the UI.
const REF_TYPE_STYLE = {
  sheet:  { label: 'Sheet',  bg: '#E2F0DE', fg: '#2D7A2D' }, // Google Sheets — green
  doc:    { label: 'Doc',    bg: '#DCE7F7', fg: '#1F4E8C' }, // Google Docs — blue
  slides: { label: 'Slides', bg: '#FBF1DC', fg: '#B7791F' }, // Google Slides — yellow
  drive:  { label: 'Drive',  bg: '#D6ECEC', fg: '#1F6F6F' }, // Google Drive folder/file — teal
  figma:  { label: 'Figma',  bg: '#EBE3F4', fg: '#5B3D8C' }, // Figma — purple
  notion: { label: 'Notion', bg: '#EDEBE4', fg: '#1A1A19' }, // Notion — neutral
  link:   { label: 'Link',   bg: '#EDEBE4', fg: '#6E6C66' }, // Generic — gray
};

// Detect reference type from a URL. Falls back to 'link' for unrecognized hosts.
function detectRefType(url) {
  if (!url) return 'link';
  const u = String(url).toLowerCase();
  if (u.includes('docs.google.com/spreadsheets')) return 'sheet';
  if (u.includes('docs.google.com/document')) return 'doc';
  if (u.includes('docs.google.com/presentation')) return 'slides';
  if (u.includes('drive.google.com')) return 'drive';
  if (u.includes('figma.com')) return 'figma';
  if (u.includes('notion.so') || u.includes('notion.site')) return 'notion';
  return 'link';
}

// Compact, human-readable URL preview.
function shortUrl(url, max = 56) {
  if (!url) return '';
  let s = String(url).replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return s;
}

// Validate URL syntactically (must be http/https).
function isValidUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
```

#### Step 1.2: Update Excel import column aliases

**Location:** In the `COL` constant (around line 250). Add `references` alias:

```jsx
// Find this:
deliverables: ['Key Deliverables', 'Deliverables', 'deliverables'],
dependencies: ['Dependencies', 'Depends on', 'dependencies'],

// Add after dependencies:
references: ['References', 'Refs', 'Wiki', 'references'],
```

#### Step 1.3: Add Excel parser helper

**Location:** Right after the `COL` constant + `pickCol` helper.

```jsx
// Parse References cell from Excel: `URL1 | Title1; URL2 | Title2` → array.
// Tolerant of missing titles. Invalid URLs skipped silently.
function parseReferencesCell(raw, author) {
  if (!raw) return [];
  const out = [];
  for (const part of String(raw).split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [urlPart, ...titleParts] = trimmed.split('|');
    const url = (urlPart || '').trim();
    const title = titleParts.join('|').trim();
    if (!isValidUrl(url)) continue;
    out.push({
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${out.length}`,
      url,
      title: title || REF_TYPE_STYLE[detectRefType(url)].label,
      type: detectRefType(url),
      addedAt: new Date().toISOString(),
      addedBy: author || 'Import',
    });
  }
  return out;
}
```

#### Step 1.4: Update Excel import to parse References column

**Location:** In the function that builds tasks from Excel rows (search for `pickCol(r, COL.deliverables)`). Add this line right after dependencies:

```jsx
// Find:
deliverables: pickCol(r, COL.deliverables),
dependencies: pickCol(r, COL.dependencies),
checkIns: [],

// Insert references line:
deliverables: pickCol(r, COL.deliverables),
dependencies: pickCol(r, COL.dependencies),
references: parseReferencesCell(pickCol(r, COL.references), 'Import'),
checkIns: [],
```

#### Step 1.5: Update Excel export to include References column

**Location:** In `projectToExcelBlob()` function, find the row object and add `References` field after `Dependencies`:

```jsx
// Find this row inside projectToExcelBlob:
'Dependencies': t.dependencies || '',
'Latest check-in': ...

// Insert References between them:
'Dependencies': t.dependencies || '',
'References': (t.references || []).map((r) => `${r.url} | ${r.title || ''}`).join('; '),
'Latest check-in': ...
```

#### Step 1.6: Add ReferencesSection component (and sub-components)

**Location:** Just before `function TaskDetail(...)` (around line 975). Add this entire block:

```jsx
/* ═════════ REFERENCES SECTION (wiki links per task) ═════════ */

// Type pill — small colored badge ("Sheet", "Doc", etc.)
function RefTypePill({ type }) {
  const s = REF_TYPE_STYLE[type] || REF_TYPE_STYLE.link;
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 999,
      fontSize: 10.5, fontWeight: 500, background: s.bg, color: s.fg,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{s.label}</span>
  );
}

// Single reference row: type pill, title (clickable, opens in new tab), URL preview.
function ReferenceRow({ reference, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ReferenceForm
        initial={reference}
        onSave={(updated) => { onEdit({ ...reference, ...updated }); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '8px 4px',
        borderTop: '1px solid ' + TOK.line,
      }}
    >
      <div style={{ paddingTop: 2 }}><RefTypePill type={reference.type} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <a
          href={reference.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 13, fontWeight: 500, color: TOK.ink, textDecoration: 'none',
            display: 'block',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          title={reference.url}
        >
          {reference.title || '(untitled)'}
        </a>
        <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 1, wordBreak: 'break-all' }}>
          {shortUrl(reference.url)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, opacity: hover ? 1 : 0, transition: 'opacity .12s' }}>
        <button onClick={() => setEditing(true)} title="Edit"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 4 }}>
          <Edit2 size={13} />
        </button>
        <button onClick={() => onDelete(reference.id)} title="Delete"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 4 }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// Inline form for adding/editing a reference. Type pill updates live as user types URL.
function ReferenceForm({ initial, onSave, onCancel }) {
  const [url, setUrl] = useState(initial?.url || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [error, setError] = useState('');
  const detectedType = detectRefType(url);

  const handleSave = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) { setError('URL is required'); return; }
    if (!isValidUrl(trimmedUrl)) { setError('URL must start with http:// or https://'); return; }
    const finalTitle = title.trim() || REF_TYPE_STYLE[detectedType].label;
    onSave({ url: trimmedUrl, title: finalTitle, type: detectedType });
  };

  return (
    <div style={{
      borderTop: '1px solid ' + TOK.line,
      padding: '10px 4px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: TOK.muted, width: 40, flexShrink: 0 }}>URL</span>
        <Input value={url} onChange={(v) => { setUrl(v); setError(''); }}
          placeholder="https://docs.google.com/..." autoFocus />
        {url && <RefTypePill type={detectedType} />}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: TOK.muted, width: 40, flexShrink: 0 }}>Title</span>
        <Input value={title} onChange={setTitle} placeholder={`(default: ${REF_TYPE_STYLE[detectedType].label})`} />
      </div>
      {error && <div style={{ fontSize: 11, color: '#a32d2d', paddingLeft: 48 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn size="sm" onClick={onCancel}>Cancel</Btn>
        <Btn size="sm" variant="primary" onClick={handleSave}>{initial ? 'Save' : 'Add'}</Btn>
      </div>
    </div>
  );
}

// Collapsible section showing all references for a task. Lives between meta info and tabs in TaskDetail.
function ReferencesSection({ task, onUpdate, author }) {
  const refs = task.references || [];
  const [expanded, setExpanded] = useState(refs.length > 0);
  const [adding, setAdding] = useState(false);

  const addRef = (data) => {
    const newRef = {
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...data,
      addedAt: new Date().toISOString(),
      addedBy: author,
    };
    onUpdate({ ...task, references: [...refs, newRef] });
    setAdding(false);
  };

  const editRef = (updated) => {
    onUpdate({
      ...task,
      references: refs.map((r) => r.id === updated.id ? { ...updated, type: detectRefType(updated.url) } : r),
    });
  };

  const deleteRef = (id) => {
    onUpdate({ ...task, references: refs.filter((r) => r.id !== id) });
  };

  return (
    <div style={{ marginTop: 16, marginBottom: 12 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px 0', color: TOK.ink, textAlign: 'left',
          fontFamily: FONT_STACK,
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ fontSize: 12, fontWeight: 500, color: TOK.muted, letterSpacing: 0.3, textTransform: 'uppercase' }}>
          📚 References
        </span>
        <span style={{ fontSize: 11, color: TOK.subtle, fontWeight: 500 }}>
          {refs.length === 0 ? '(none)' : `(${refs.length})`}
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 4 }}>
          {refs.length === 0 && !adding && (
            <div style={{ fontSize: 12, color: TOK.subtle, padding: '8px 4px', fontStyle: 'italic' }}>
              No references yet. Add Google Docs, Sheets, or any link related to this milestone.
            </div>
          )}
          {refs.map((r) => (
            <ReferenceRow key={r.id} reference={r} onEdit={editRef} onDelete={deleteRef} />
          ))}
          {adding ? (
            <ReferenceForm onSave={addRef} onCancel={() => setAdding(false)} />
          ) : (
            <button
              onClick={() => setAdding(true)}
              style={{
                marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: '1px dashed ' + TOK.lineStrong, borderRadius: 6,
                padding: '6px 12px', cursor: 'pointer', color: TOK.muted,
                fontFamily: FONT_STACK, fontSize: 12, width: '100%', justifyContent: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = TOK.bg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <Plus size={12} /> Add reference
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

#### Step 1.7: Mount ReferencesSection inside TaskDetail

**Location:** Inside `TaskDetail` component, find the closing `</div>` of the meta-info block (after Dependencies row) and the start of "Meeting Hub" tabs section:

```jsx
// Find this exact pattern:
            <Row k="Deliverables" v={task.deliverables || '—'} multiline />
            <Row k="Dependencies" v={task.dependencies || '—'} multiline />
          </div>
        )}

        {/* ─── Meeting Hub: Updates / Decisions / Actions tabs ─── */}
        <div style={{ marginTop: 20, borderTop: '1px solid ' + TOK.line, paddingTop: 14 }}>

// Insert ReferencesSection between them:
            <Row k="Deliverables" v={task.deliverables || '—'} multiline />
            <Row k="Dependencies" v={task.dependencies || '—'} multiline />
          </div>
        )}

        {/* ─── References (wiki links): collapsible section between meta info and tabs ─── */}
        <ReferencesSection task={task} onUpdate={onUpdate} author={author} />

        {/* ─── Meeting Hub: Updates / Decisions / Actions tabs ─── */}
        <div style={{ marginTop: 20, borderTop: '1px solid ' + TOK.line, paddingTop: 14 }}>
```

---

## Feature 2: Sign Out

### Intent

User can sign out of the app via a menu on their identity pill (top-right). After sign-out, a "Signed out" landing page appears with a Sign in button — no immediate force re-login. Local user identity (name + email) is cleared from `localStorage`; shared project data is intentionally preserved.

### State changes (in App component)

Add three new state values:

```jsx
const [userMenuOpen, setUserMenuOpen] = useState(false);
const [signedOut, setSignedOut] = useState(false);
const [showNameDialog, setShowNameDialog] = useState(false);
```

### Render gate logic

| `loading` | `author` | `signedOut` | `showNameDialog` | Renders |
|---|---|---|---|---|
| true | — | — | — | "Loading workspace…" |
| false | null | false | — | NameDialog (first-time) |
| false | null | true | false | SignedOutLanding |
| false | null | true | true | NameDialog with Back button |
| false | set | — | — | Main app |

### Implementation steps

#### Step 2.1: Add `sdeleteLocal` helper

**Location:** Near other storage helpers (search for `sdeleteShared`).

```jsx
// Find:
async function sdeleteShared(k) { try { await window.storage.delete(k, true); return true; } catch { return false; } }

// Add right after:
async function sdeleteLocal(k) { try { await window.storage.delete(k, false); return true; } catch { return false; } }
```

#### Step 2.2: Add `hideClose` prop to Modal

**Location:** Find `function Modal({...})`. Replace its signature and JSX:

```jsx
function Modal({ title, children, onClose, width = 480, zHigh = false, hideClose = false }) {
  // hideClose=true: no X button, no backdrop-click-to-close (for unskippable flows like sign-in).
  const handleBackdropClick = hideClose ? undefined : onClose;
  return (
    <div onClick={handleBackdropClick} style={{ position: 'absolute', inset: 0, background: 'rgba(15,15,14,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: zHigh ? 80 : 50, fontFamily: FONT_STACK }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width, maxWidth: 'calc(100% - 40px)', maxHeight: 'calc(100% - 60px)', background: TOK.surface, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid ' + TOK.line, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{title}</h3>
          {!hideClose && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 4 }}><X size={18} /></button>
          )}
        </div>
        <div style={{ padding: 18, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}
```

#### Step 2.3: Update NameDialog — add `onCancel` prop, use `hideClose`

**Location:** Replace the entire `NameDialog` function:

```jsx
function NameDialog({ onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const validEmail = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = name.trim() && validEmail;
  return (
    <Modal title="Welcome — tell us about you" onClose={() => {}} width={440} hideClose>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: TOK.muted, lineHeight: 1.55 }}>
        Your name attaches to your changes and check-ins. Your email lets the app pre-fill action-item emails to you. Both are stored locally on this device only.
      </p>
      <FieldLabel>Your name</FieldLabel>
      <Input value={name} onChange={setName} placeholder="e.g., Thao Nguyen" autoFocus />
      <div style={{ height: 12 }} />
      <FieldLabel>Your email (optional, recommended)</FieldLabel>
      <Input value={email} onChange={setEmail} placeholder="e.g., thao@smartosc.com" type="email" />
      {!validEmail && <div style={{ marginTop: 6, fontSize: 11, color: TOK.overdueFg }}>Invalid email format</div>}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {onCancel && <Btn onClick={onCancel}>Back</Btn>}
        <Btn variant="primary" disabled={!canSubmit} onClick={() => onSubmit(name.trim(), email.trim() || null)}>Continue</Btn>
      </div>
    </Modal>
  );
}
```

#### Step 2.4: Add SignedOutLanding component

**Location:** Right after the updated `NameDialog`.

```jsx
/* ═════════ SIGNED OUT LANDING ═════════ */
// Calm landing page after deliberate sign-out — distinct from first-time visit.
function SignedOutLanding({ onSignIn }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT_STACK, background: TOK.bg, padding: 20,
    }}>
      <div style={{
        maxWidth: 440, width: '100%', textAlign: 'center',
        padding: '40px 32px',
        background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          width: 56, height: 56, margin: '0 auto 16px',
          background: TOK.bg, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: TOK.accent,
        }}>
          <UserCircle size={32} />
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 500, color: TOK.ink }}>You're signed out</h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: TOK.muted, lineHeight: 1.6 }}>
          Your projects and team data are still safe on the workspace.
          Sign in again to continue working.
        </p>
        <Btn variant="primary" onClick={onSignIn}>Sign in</Btn>
      </div>
    </div>
  );
}
```

#### Step 2.5: Add new state in App component

**Location:** Inside `App()` function, where state hooks are declared (search for `const [author, setAuthor]`).

```jsx
// Find:
const [author, setAuthor] = useState(null);
const [authorEmail, setAuthorEmail] = useState(null);

// Add right after:
const [signedOut, setSignedOut] = useState(false);
const [showNameDialog, setShowNameDialog] = useState(false);
const [userMenuOpen, setUserMenuOpen] = useState(false);
```

#### Step 2.6: Update onNameSubmit to clear sign-out flags

**Location:** Find `const onNameSubmit = async (n, e) => {`. Replace:

```jsx
const onNameSubmit = async (n, e) => {
  setAuthor(n);
  setAuthorEmail(e);
  setSignedOut(false);
  setShowNameDialog(false);
  await ssetLocal(K.userLocal, JSON.stringify({ name: n, email: e }));
};
```

#### Step 2.7: Add signOut handler

**Location:** Right after `onNameSubmit`.

```jsx
// Sign out: clear local identity. Shared project data is preserved (it belongs
// to the team, not this device). Routes to SignedOutLanding so user can choose
// when to sign back in instead of being forced into the name dialog.
const signOut = async () => {
  const ok = await dialogs.confirm({
    title: 'Sign out?',
    message: `You will be signed out as "${author}". Project data is shared with the team and will not be affected — only your name and email on this device will be cleared.`,
    okLabel: 'Sign out',
  });
  if (!ok) return;
  setUserMenuOpen(false);
  await sdeleteLocal(K.userLocal);
  setAuthor(null);
  setAuthorEmail(null);
  setSignedOut(true);
  setShowNameDialog(false);
  showToast('Signed out');
};
```

#### Step 2.8: Update render gate

**Location:** Find `if (!author) return <NameDialog onSubmit={onNameSubmit} />;`. Replace:

```jsx
// Auth gate. Three branches:
//   1) author present → main app (continues below)
//   2) no author + signedOut + !showNameDialog → calm landing page
//   3) no author + (!signedOut OR showNameDialog) → NameDialog
if (!author) {
  if (signedOut && !showNameDialog) {
    return <SignedOutLanding onSignIn={() => setShowNameDialog(true)} />;
  }
  return (
    <NameDialog
      onSubmit={onNameSubmit}
      onCancel={signedOut ? () => setShowNameDialog(false) : undefined}
    />
  );
}
```

#### Step 2.9: Replace user pill with clickable button

**Location:** In the App's top bar JSX, find the `<div>` rendering `<UserCircle size={13} /> {author}`:

```jsx
// Find (current static pill):
<div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: TOK.bg, borderRadius: 999, fontSize: 11, color: TOK.muted }}>
  <UserCircle size={13} /> {author}
</div>

// Replace with clickable button:
<button
  onClick={() => setUserMenuOpen(!userMenuOpen)}
  title="Account menu"
  style={{
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', background: userMenuOpen ? TOK.surface : TOK.bg,
    border: '1px solid ' + (userMenuOpen ? TOK.lineStrong : 'transparent'),
    borderRadius: 999, fontSize: 11, color: TOK.muted,
    cursor: 'pointer', fontFamily: FONT_STACK,
  }}
  onMouseEnter={(e) => { if (!userMenuOpen) e.currentTarget.style.background = TOK.surface; }}
  onMouseLeave={(e) => { if (!userMenuOpen) e.currentTarget.style.background = TOK.bg; }}
>
  <UserCircle size={13} /> {author}
  <ChevronDown size={11} style={{ opacity: 0.7 }} />
</button>
```

#### Step 2.10: Render the user menu popover

**Location:** Right before the outer `</div>` that closes the App layout (search for `{meetingMode && (`, then add the popover after the `MeetingMode` block but before `</div></>`):

```jsx
// Find the spot after MeetingMode:
{meetingMode && (
  <MeetingMode
    projects={projects}
    onExit={() => setMeetingMode(false)}
  />
)}

// Insert user menu popover right after MeetingMode block, before </div></>:
{userMenuOpen && (
  <>
    {/* Click-outside backdrop */}
    <div onMouseDown={() => setUserMenuOpen(false)}
      style={{ position: 'absolute', inset: 0, zIndex: 199, background: 'transparent' }} />
    <div style={{
      position: 'absolute', top: 50, right: 16, zIndex: 200,
      background: TOK.surface, border: '1px solid ' + TOK.lineStrong, borderRadius: 8,
      boxShadow: '0 8px 20px rgba(0,0,0,0.15)', fontFamily: FONT_STACK,
      minWidth: 240, overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid ' + TOK.line }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: TOK.ink }}>{author}</div>
        {authorEmail && <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2 }}>{authorEmail}</div>}
      </div>
      <button
        onClick={signOut}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '10px 14px', fontSize: 13,
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontFamily: FONT_STACK, color: TOK.overdueFg, textAlign: 'left',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <ArrowRightLeft size={13} /> Sign out
      </button>
    </div>
  </>
)}
```

---

## Verification checklist

After implementing, verify:

### Wiki References
- [ ] Open any main task → see "📚 References (none)" collapsed header below Dependencies
- [ ] Click header → expands; "+ Add reference" button visible
- [ ] Click "+ Add reference" → form appears
- [ ] Paste a Google Sheets URL → green "Sheet" pill shows next to URL field
- [ ] Submit with empty title → defaults to "Sheet"
- [ ] Click reference title → opens in new tab
- [ ] Hover row → Edit and Delete icons appear
- [ ] Click Edit → row swaps to form, can update URL/title
- [ ] Refresh page → references persist
- [ ] Export Excel → `References` column has format `URL | Title; URL | Title`
- [ ] Import that Excel back → references restored

### Sign Out
- [ ] Top-right user pill is clickable, has chevron
- [ ] Click → dropdown shows name + email + "Sign out" button (red)
- [ ] Click outside dropdown → closes
- [ ] Click "Sign out" → confirm dialog
- [ ] Cancel confirm → still signed in
- [ ] Confirm → "Signed out" landing page shows
- [ ] Click "Sign in" → NameDialog appears with "Back" button
- [ ] Click "Back" → returns to landing
- [ ] Sign in again → main app, projects still there
- [ ] First-time user (clear localStorage) → NameDialog with NO "Back" button
- [ ] NameDialog has no X close button (cannot accidentally dismiss)

### Verify file parses

```bash
npm run build
```

Should complete without syntax errors. The bundle size will grow ~6KB.
