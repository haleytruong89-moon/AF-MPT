# B2–B4 — Save Safety, Stale-Write Guard, Task Panel & UI Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:**
- **B2:** a failed save is visible and never silently corrupts membership.
- **B3:** a save that would overwrite someone else's newer edit is refused with a clear "reload" message.
- **B4:** the task panel can be widened or expanded; dangerous actions are owner-only or reversible; contrast and modal basics are fixed.

**Architecture:**
- All decision logic goes in a pure module, `src/persistence.js`, with unit tests.
- `src/storage-shim.ts` gets two things:
  - **Optimistic revision check.** A `rev` integer is stored on each project doc. The shim remembers the `rev` it read and compares it with the server's before each write.
  - **Abort rule.** On a non-"missing" read error, the write is aborted instead of rebuilding the ACL.
- `src/App.jsx` changes are local:
  - save status (`'ok' | 'conflict' | 'error'`)
  - a persistent save banner
  - a `beforeunload` guard
  - TaskDetail width/expand
  - small safety and a11y edits
- Not transactional: a tiny race window between read and write remains. This is the agreed "B3 = mitigation, P2 = root fix" (DESIGN §2 risk 2).

**Tech Stack:** React 18, Firebase JS SDK 11, vitest 2.1.9, GitHub Actions CI (typecheck, unit tests, rules tests).

**Spec:**
- `docs/DESIGN.md` §2 risks 2, 3, 12 and §5 rows B2/B3/B4
- `docs/reviews/2026-10-14-permissions-uiux-market-review.md` §3.2 items 1, 2, 4, 8, 9, 11, 12
- `CLAUDE.md` (Warnings)

## Global Constraints
- **Branches and PRs** (stacked, because HOD merges at end of day):
  - **PR B2+B3:** branch `fix/b2-b3-save-safety`, created from `fix/b1-owner-lock`. Base is `fix/b1-owner-lock`; retarget to `main` after PR #3 merges.
  - **PR B4:** branch `feat/b4-task-panel-safety`, created from `fix/b2-b3-save-safety`, with base `fix/b2-b3-save-safety`.
- **No Firestore rules change.** `rev` is ordinary content, already allowed for owner/operator updates. No production data writes. No merge or deploy by Claude.
- **No mass refactor of `App.jsx`.** Each change is minimal and revertible.
- **Lint** must stay at 6 errors.
- **Tests:** `npm test` (unit) and CI green on every push.
- **Never hard-delete a task** (CLAUDE.md). B4 turns "Delete task" into "Drop task".
- **UI copy is in English** (HOD decision 9).

## Review Focus
1. **A brand-new project** (doc does not exist yet; reading it returns permission-denied) must still save, not be blocked as a "read error". Pinned by unit test `classifyReadError('permission-denied') → 'missing'` and `checkRevision(undefined, undefined, false) → 'ok'`.
2. **Legacy docs without `rev`,** and docs last written by an old cached bundle (which drops `rev` because it uses `setDoc` without merge), must not lock everyone out with endless conflicts. Pinned by unit tests: missing `rev` is treated as 0; after a conflict, a reload re-reads `rev`.
3. **Network blip on the pre-write read** must abort the write and show the banner, not rebuild `memberIds`/`roles`. Pinned by `classifyReadError('unavailable') → 'fatal'`.
4. **Many edits while a save is failing** must not stack many banners or toasts: there is one banner per project and it clears on the next `ok`. Pinned by `nextSaveState` unit tests.
5. **The panel width saved in localStorage** may be absent, garbage or out of range, and must clamp to 360–900. Pinned by `clampPanelWidth` unit tests.

---

## PR B2+B3 (branch `fix/b2-b3-save-safety`)

### Task 1: Pure persistence helpers

**Files:** Create `src/persistence.js`, `tests/unit/persistence.test.js`.

**Produces:**
- `classifyReadError(code: string|undefined): 'missing'|'fatal'`
- `checkRevision(serverRev: number|undefined, knownRev: number|undefined, exists: boolean): 'ok'|'conflict'`
- `nextRev(serverRev: number|undefined): number`
- `nextSaveState(prev: Record<string,{status,name}>, pid: string, status: 'ok'|'conflict'|'error', name: string)`
- `hasUnsavedWork(pendingCount: number, saveState: object): boolean`

- [ ] Step 1: Write `tests/unit/persistence.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { classifyReadError, checkRevision, nextRev, nextSaveState, hasUnsavedWork } from '../../src/persistence.js';

describe('classifyReadError', () => {
  it('treats permission-denied and not-found as a missing doc (create path)', () => {
    expect(classifyReadError('permission-denied')).toBe('missing');
    expect(classifyReadError('not-found')).toBe('missing');
  });
  it('treats every other failure as fatal (abort the write)', () => {
    expect(classifyReadError('unavailable')).toBe('fatal');
    expect(classifyReadError('deadline-exceeded')).toBe('fatal');
    expect(classifyReadError(undefined)).toBe('fatal');
  });
});

describe('checkRevision', () => {
  it('ok when the doc does not exist yet', () => {
    expect(checkRevision(undefined, undefined, false)).toBe('ok');
  });
  it('ok when server rev equals the rev we loaded (missing rev = 0)', () => {
    expect(checkRevision(5, 5, true)).toBe('ok');
    expect(checkRevision(undefined, 0, true)).toBe('ok');
    expect(checkRevision(undefined, undefined, true)).toBe('ok');
  });
  it('conflict when the server moved on since we loaded', () => {
    expect(checkRevision(6, 5, true)).toBe('conflict');
    expect(checkRevision(undefined, 5, true)).toBe('conflict'); // old bundle dropped rev
  });
});

describe('nextRev', () => {
  it('increments, treating missing as 0', () => {
    expect(nextRev(undefined)).toBe(1);
    expect(nextRev(4)).toBe(5);
  });
});

describe('nextSaveState', () => {
  it('records one entry per project and clears it on ok', () => {
    let s = {};
    s = nextSaveState(s, 'p1', 'error', 'CRP');
    s = nextSaveState(s, 'p1', 'error', 'CRP');
    expect(s).toEqual({ p1: { status: 'error', name: 'CRP' } });
    s = nextSaveState(s, 'p2', 'conflict', 'MA');
    expect(Object.keys(s)).toEqual(['p1', 'p2']);
    s = nextSaveState(s, 'p1', 'ok', 'CRP');
    expect(s).toEqual({ p2: { status: 'conflict', name: 'MA' } });
  });
  it('returns the same object when nothing changes (no re-render)', () => {
    const s = {};
    expect(nextSaveState(s, 'p1', 'ok', 'CRP')).toBe(s);
  });
  it('conflict is sticky: a later error does not downgrade it', () => {
    let s = nextSaveState({}, 'p1', 'conflict', 'CRP');
    s = nextSaveState(s, 'p1', 'error', 'CRP');
    expect(s.p1.status).toBe('conflict');
  });
});

describe('hasUnsavedWork', () => {
  it('true while saves are pending or any project failed', () => {
    expect(hasUnsavedWork(0, {})).toBe(false);
    expect(hasUnsavedWork(1, {})).toBe(true);
    expect(hasUnsavedWork(0, { p1: { status: 'error', name: 'X' } })).toBe(true);
  });
});
```

- [ ] Step 2: Run `npm test`. Expected: FAIL, because `src/persistence.js` cannot be resolved.

- [ ] Step 3: Create `src/persistence.js`:

```js
// B2/B3 persistence decisions (pure). Used by storage-shim.ts and App.jsx.

// A project doc that does not exist yet reads as permission-denied under our
// rules (isMember(null) is false), so both codes mean "create path".
export function classifyReadError(code) {
  return code === 'permission-denied' || code === 'not-found' ? 'missing' : 'fatal';
}

const asRev = (r) => (typeof r === 'number' && Number.isFinite(r) ? r : 0);

// Optimistic concurrency: refuse the write when the server's rev differs from
// the rev this client loaded. A missing rev counts as 0 (legacy docs).
export function checkRevision(serverRev, knownRev, exists) {
  if (!exists) return 'ok';
  return asRev(serverRev) === asRev(knownRev) ? 'ok' : 'conflict';
}

export function nextRev(serverRev) {
  return asRev(serverRev) + 1;
}

// One banner entry per project. 'ok' clears it; 'conflict' is sticky until reload.
export function nextSaveState(prev, pid, status, name) {
  const cur = prev[pid];
  if (status === 'ok') {
    if (!cur) return prev;
    const { [pid]: _drop, ...rest } = prev;
    return rest;
  }
  if (cur && cur.status === 'conflict') return prev;
  if (cur && cur.status === status && cur.name === name) return prev;
  return { ...prev, [pid]: { status, name } };
}

export function hasUnsavedWork(pendingCount, saveState) {
  return pendingCount > 0 || Object.keys(saveState || {}).length > 0;
}
```

- [ ] Step 4: Run `npm test`. Expected: PASS (all unit tests).
- [ ] Step 5: Commit `feat(save): pure persistence helpers (read-error class, revision check, save state)`.

### Task 2: Storage shim — abort on fatal read, revision check

**Files:** Modify `src/storage-shim.ts`: imports, the project read (~176-205) and the project write (~270-310).

**Consumes:** `classifyReadError`, `checkRevision`, `nextRev` (Task 1).

**Produces:** `window.storage.set('project:<id>', …, true)` returns:
- `{ key, value, shared: true }` on success
- `{ key, value, shared: true, error: 'conflict' }` on a stale write
- `null` on any other failure

- [ ] Step 1: Add the import after `import { metaForWrite } from './ownership';`:

```ts
import { classifyReadError, checkRevision, nextRev } from './persistence';
```

and a module-level map next to the other constants (after `const ACTIVITY_CAP = 500;`):

```ts
// B3: rev of each project as last read/written by this client.
const knownRev = new Map<string, number>();
```

- [ ] Step 2: Project read. In the destructure, add `rev` to the stripped fields and record it:

```ts
        const { memberIds, roles, deletedAt, createdBy, createdAt, updatedAt, rev, ...rest } =
          data as Record<string, unknown>;
        knownRev.set(pid, typeof rev === 'number' ? rev : 0);
```

(Keep the existing `void …` lines and add `void rev;` only if TypeScript complains. `rev` is used, so it should not.)

- [ ] Step 3: Project write. Replace the existing-doc read block

```ts
        let ex: Record<string, unknown> | null = null;
        try {
          const existing = await getDoc(PROJECT_REF(pid));
          if (existing.exists()) {
            ex = existing.data() as Record<string, unknown>;
          }
        } catch {
          ex = null;
        }
```

with

```ts
        let ex: Record<string, unknown> | null = null;
        try {
          const existing = await getDoc(PROJECT_REF(pid));
          if (existing.exists()) {
            ex = existing.data() as Record<string, unknown>;
          }
        } catch (e) {
          // B2: only "doc does not exist" may fall through to the create path.
          // Any other read failure (network, quota…) aborts — never rebuild the ACL.
          if (classifyReadError((e as { code?: string })?.code) === 'fatal') {
            console.warn('[storage] project pre-read failed; write aborted:', pid, e);
            return null;
          }
          ex = null;
        }
        // B3: refuse to overwrite a newer server version.
        if (checkRevision(ex?.rev as number | undefined, knownRev.get(pid), ex !== null) === 'conflict') {
          console.warn('[storage] project changed on server since load; write refused:', pid);
          return { key, value, shared: true, error: 'conflict' };
        }
        const newRev = nextRev(ex?.rev as number | undefined);
```

Then, in the `setDoc(PROJECT_REF(pid), {...})` payload, add `rev: newRev,` after `deletedAt,`. Right after `await setDoc(...)`, before `return`, add:

```ts
        knownRev.set(pid, newRev);
```

Also remove `rev` from the incoming body so the app's copy can't override it. Change `const { id: _id, ...body } = incoming;` to:

```ts
        const { id: _id, rev: _rev, ...body } = incoming;
        void _rev;
```

- [ ] Step 4: `npm run typecheck`. Expected: clean. Commit `fix(save): abort project write on read failure; refuse stale writes via rev (B2/B3)`.

### Task 3: App — save status, banner, unload guard

**Files:** Modify `src/App.jsx`:
- `saveProject` (~1462)
- App state near `toast` (~12327)
- `persistProject` (~12584)
- render near `<Toast` (~13552)
- import

**Consumes:** `nextSaveState`, `hasUnsavedWork` (Task 1); shim result shape (Task 2).

- [ ] Step 1: Import, after the `./ownership` import:

```js
import { nextSaveState, hasUnsavedWork } from './persistence';
```

- [ ] Step 2: Replace `async function saveProject(p) { return ssetShared(K.project(p.id), JSON.stringify(p)); }` with:

```js
// Returns 'ok' | 'conflict' | 'error' (B2/B3). Callers that ignore it keep working.
async function saveProject(p) {
  try {
    const r = await window.storage.set(K.project(p.id), JSON.stringify(p), true);
    if (!r) return 'error';
    return r.error === 'conflict' ? 'conflict' : 'ok';
  } catch { return 'error'; }
}
```

- [ ] Step 3: State. After `const saveTimers = useRef({});` add:

```js
  // B2/B3: per-project save failures shown in a persistent banner.
  const [saveState, setSaveState] = useState({});
  const pendingSaves = useRef(0);
```

- [ ] Step 4: Replace `persistProject` with:

```js
  // Debounced save of a project. Failures surface in the save banner (B2/B3).
  const persistProject = useCallback((p) => {
    if (!p) return;
    if (!saveTimers.current[p.id]) pendingSaves.current += 1;
    clearTimeout(saveTimers.current[p.id]);
    saveTimers.current[p.id] = setTimeout(async () => {
      delete saveTimers.current[p.id];
      const status = await saveProject(p);
      pendingSaves.current = Math.max(0, pendingSaves.current - 1);
      setSaveState((prev) => nextSaveState(prev, p.id, status, p.name || 'project'));
    }, 400);
  }, []);
```

- [ ] Step 5: Unload guard. Add after `persistProject`:

```js
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hasUnsavedWork(pendingSaves.current, saveState)) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveState]);
```

- [ ] Step 6: Banner component. Add near `function Toast`:

```jsx
// B2/B3: persistent banner for failed or refused project saves.
function SaveBanner({ saveState }) {
  const entries = Object.entries(saveState || {});
  if (entries.length === 0) return null;
  const conflict = entries.some(([, v]) => v.status === 'conflict');
  const names = entries.map(([, v]) => `“${v.name}”`).join(', ');
  return (
    <div role="alert" style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 120, maxWidth: 'calc(100% - 40px)', background: TOK.blockerBg || '#FDECEC', color: TOK.blocker || '#B42318', border: '1px solid currentColor', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontFamily: FONT_STACK, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
      <span>
        {conflict
          ? <>Your latest changes to {names} were <b>not saved</b> — someone else changed it since you opened it. Reload to get the latest version, then redo your edit.</>
          : <>Couldn’t save changes to {names}. Your recent edits exist only on this screen — check your connection or permissions, then reload.</>}
      </span>
      <button onClick={() => window.location.reload()} style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid currentColor', background: TOK.surface, color: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>Reload</button>
    </div>
  );
}
```

- [ ] Step 7: Render it right before `<Toast toast={toast} onClose={() => setToast(null)} />`:

```jsx
        <SaveBanner saveState={saveState} />
```

- [ ] Step 8: Verify:
  - `npm run typecheck`, `npm run build`, `npm test`
  - lint error count = 6
  - `grep -n "TOK.blockerBg\|TOK.blocker\b" src/App.jsx | head -3` confirms both tokens exist. If `blockerBg` is missing, the literal fallback is used; that needs no ruling.
- [ ] Step 9: Commit `feat(save): persistent save banner, conflict message, unload guard (B2/B3)`. Push the branch and open PR `fix(save): visible save failures + stale-write guard (B2/B3)` with base `fix/b1-owner-lock`. Watch CI until green.

---

## PR B4 (branch `feat/b4-task-panel-safety`, from `fix/b2-b3-save-safety`)

### Task 4: UI pure helpers

**Files:** Create `src/uiPrefs.js`, `tests/unit/uiPrefs.test.js`.

**Produces:**
- `clampPanelWidth(raw): number`. Range 360–900; default 400.
- `autoRows(text, min=3, max=14): number`.

- [ ] Step 1: Write the tests:

```js
import { describe, it, expect } from 'vitest';
import { clampPanelWidth, autoRows } from '../../src/uiPrefs.js';

describe('clampPanelWidth', () => {
  it('defaults to 400 for missing or garbage values', () => {
    expect(clampPanelWidth(undefined)).toBe(400);
    expect(clampPanelWidth('abc')).toBe(400);
    expect(clampPanelWidth(null)).toBe(400);
  });
  it('clamps to 360..900 and rounds', () => {
    expect(clampPanelWidth(100)).toBe(360);
    expect(clampPanelWidth('2000')).toBe(900);
    expect(clampPanelWidth(512.6)).toBe(513);
  });
});

describe('autoRows', () => {
  it('grows with lines and long text, within bounds', () => {
    expect(autoRows('')).toBe(3);
    expect(autoRows('a\nb\nc\nd\ne')).toBe(5);
    expect(autoRows('x'.repeat(60 * 8))).toBe(8);
    expect(autoRows('\n'.repeat(40))).toBe(14);
  });
});
```

- [ ] Step 2: Run `npm test`. Expected: FAIL (module missing).
- [ ] Step 3: Create `src/uiPrefs.js`:

```js
// B4 UI helpers (pure).
export const PANEL_MIN = 360;
export const PANEL_MAX = 900;
export const PANEL_DEFAULT = 400;

export function clampPanelWidth(raw) {
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  if (!Number.isFinite(n)) return PANEL_DEFAULT;
  return Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, n)));
}

// Rows for an auto-growing textarea: one per line, wrapping at ~60 chars.
export function autoRows(text, min = 3, max = 14) {
  const lines = String(text || '').split('\n')
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 60)), 0);
  return Math.min(max, Math.max(min, lines));
}
```

- [ ] Step 4: Run `npm test`. Expected: PASS. Commit `feat(ui): pure helpers for panel width and auto-growing textarea`.

### Task 5: Resizable / expandable task panel + auto-growing update box

**Files:** Modify `src/App.jsx`:
- `TaskDetail` root `<div>` and header (~3320-3330)
- `UpdateForm` `rows={3}` (~2163)
- import

**Consumes:** `clampPanelWidth`, `autoRows`, `PANEL_MIN`, `PANEL_MAX` (Task 4).

- [ ] Step 1: Import: `import { clampPanelWidth, autoRows } from './uiPrefs';`
- [ ] Step 2: In `TaskDetail`, with the other hooks before any early return, add:

```js
  // B4: resizable width (persisted per browser) and expanded overlay mode.
  const [panelWidth, setPanelWidth] = useState(() => {
    try { return clampPanelWidth(localStorage.getItem('afmpt.taskPanelWidth')); } catch { return clampPanelWidth(null); }
  });
  const [expanded, setExpanded] = useState(false);
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX; const startW = panelWidth;
    const onMove = (ev) => setPanelWidth(clampPanelWidth(startW + (startX - ev.clientX)));
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      const w = clampPanelWidth(startW + (startX - ev.clientX));
      try { localStorage.setItem('afmpt.taskPanelWidth', String(w)); } catch { /* ignore */ }
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };
```

- [ ] Step 3: Replace the root `<div style={{ width: 400, background: TOK.surface, borderLeft: …, height: '100%', fontFamily: FONT_STACK }}>` with:

```jsx
    <div style={expanded
      ? { position: 'absolute', inset: 24, zIndex: 60, background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', fontFamily: FONT_STACK }
      : { width: panelWidth, position: 'relative', background: TOK.surface, borderLeft: '1px solid ' + TOK.line, display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT_STACK }}>
      {!expanded && (
        <div onMouseDown={startResize} title="Drag to resize" aria-label="Resize task panel"
          style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 2 }} />
      )}
```

- [ ] Step 4: Header buttons. Replace the close-only button

```jsx
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2 }}>
          <X size={16} />
        </button>
```

with

```jsx
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => setExpanded((v) => !v)} title={expanded ? 'Back to side panel' : 'Expand'} aria-label={expanded ? 'Back to side panel' : 'Expand task panel'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, fontSize: 14, lineHeight: 1 }}>
            {expanded ? '⤡' : '⤢'}
          </button>
          <button onClick={onClose} aria-label="Close task panel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2 }}>
            <X size={16} />
          </button>
        </div>
```

- [ ] Step 5: In `UpdateForm`, change `rows={3}` to `rows={autoRows(text)}`.
- [ ] Step 6: Verify:
  - `npm run typecheck`, `npm run build`, `npm test`, lint = 6
  - `grep -n "width: 400, background: TOK.surface" src/App.jsx` returns nothing
- [ ] Step 7: Commit `feat(task-panel): resizable, expandable task panel; auto-growing update box (B4)`.

### Task 6: Safety — owner-only destructive tools, Drop instead of delete, Undo for done

**Files:** Modify `src/App.jsx`:
- `Toast` (~1899) and `showToast` (~12578)
- `onTaskDelete` (~12994) and the TaskDetail delete button (~3348)
- Restore button (~13348) and project menu Delete (~13569)
- MyWorkView `handleStatusChange` (~10988)

Modify `src/components/GanttView.tsx` (`isOverdue` ~707).

- [ ] Step 1: Toast with an action. Replace `function Toast` with:

```jsx
function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div role="status" style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: TOK.ink, color: TOK.surface, padding: '10px 16px', borderRadius: 8, fontSize: 13, zIndex: 100, fontFamily: FONT_STACK, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
      <span>{toast.message}</span>
      {toast.action && (
        <button onClick={() => { toast.action.onClick(); onClose(); }} style={{ background: 'none', border: '1px solid ' + TOK.surface, borderRadius: 6, color: TOK.surface, cursor: 'pointer', padding: '2px 8px', fontFamily: FONT_STACK, fontSize: 12 }}>{toast.action.label}</button>
      )}
      <button onClick={onClose} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: TOK.surface, cursor: 'pointer', opacity: 0.7 }}><X size={14} /></button>
    </div>
  );
}
```

and `showToast` with:

```js
  const showToast = (message, action) => {
    const id = uid('t');
    setToast({ message, id, action });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), action ? 6000 : 3500);
  };
```

- [ ] Step 2: Undo on completion in My Work. Replace MyWorkView's `handleStatusChange` with:

```js
  const handleStatusChange = (task, project, newStatus) => {
    const prevStatus = task.status || 'Planned';
    onTaskUpdate({ ...task, status: newStatus }, project.id);
    if (newStatus === 'Completed' && prevStatus !== 'Completed' && showToast) {
      showToast(`Marked “${task.name}” done`, { label: 'Undo', onClick: () => onTaskUpdate({ ...task, status: prevStatus }, project.id) });
    }
  };
```

- [ ] Step 3: Drop instead of delete. Replace `onTaskDelete` with:

```js
  // CLAUDE.md: never hard-delete a task — mark it Dropped (reversible, keeps history and credit trail).
  const onTaskDelete = async (task) => {
    if (!project) return;
    const ok = await dialogs.confirm({ title: 'Drop task?', message: `Mark task "${task.name}" as Dropped? It stays in the plan (greyed out) and can be reopened by changing its status.`, okLabel: 'Drop task' });
    if (!ok) return;
    applyTaskUpdate({ ...task, status: 'Dropped' }, project.id);
    setSelectedTaskId(null);
  };
```

Before writing this, confirm `applyTaskUpdate`'s signature: `grep -n "const applyTaskUpdate" src/App.jsx` and read its first lines. If it is not `(task, projectId, source?)`, use the same call shape that `handleStatusChange`'s `onTaskUpdate` uses, and ledger a ruling. Then in TaskDetail change the button `title="Delete task"` to `title="Drop task"`.

- [ ] Step 4: Owner-only destructive tools.
  - Wrap the Restore button (`title="Restore from JSON backup"`) in `{isOwner && ( … )}`.
  - In the project menu, gate the Delete project entry: use `...(isOwner ? [ { label: …Delete project… } ] : [])` inside the items array, keeping the existing object unchanged.
- [ ] Step 5: Gantt. In `GanttView.tsx` `isOverdue`, change `if (!t || t.status === 'Completed') return false;` to `if (!t || t.status === 'Completed' || t.status === 'Dropped') return false;`, matching `App.jsx` `isOverdue`.
- [ ] Step 6: Verify:
  - `npm run typecheck`, `npm run build`, `npm test`, lint = 6
  - `grep -n "ws.tasks = ws.tasks.filter((t) => t.id !== task.id)" src/App.jsx` returns nothing
- [ ] Step 7: Commit `fix(safety): owner-only restore/delete project, drop instead of delete task, undo done, gantt overdue (B4)`.

### Task 7: Contrast tokens + modal keyboard basics

**Files:** Modify `src/App.jsx`: `TOK` (~179, ~192) and `Modal` (~1739).

- [ ] Step 1: Token values. Change only these hex values:
  - `subtle: '#95938C'` → `subtle: '#706E68'`
  - `healthAmber: '#B7791F'` → `healthAmber: '#8A5A12'`
- [ ] Step 2: Write and run a contrast check:
  - Create `tests/unit/contrast.test.js` with a WCAG luminance function. Assert `#706E68` on `#FFFFFF` ≥ 4.5 and on `#F7F5EF` ≥ 4.5, and `#8A5A12` on `#FBF1DC` ≥ 4.5.
  - Run `npm test`: PASS.
  - Then temporarily change one literal to the old `#95938C` and confirm FAIL. Revert.

```js
import { describe, it, expect } from 'vitest';
const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Keep in sync with TOK in src/App.jsx (B4 contrast fix).
describe('B4 token contrast (WCAG AA 4.5:1)', () => {
  it('subtle text on surface and bg', () => {
    expect(ratio('#706E68', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#706E68', '#F7F5EF')).toBeGreaterThanOrEqual(4.5);
  });
  it('amber text on amber bg', () => {
    expect(ratio('#8A5A12', '#FBF1DC')).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] Step 3: Modal basics. In `Modal`, add an Esc handler and dialog semantics.
  - Before `return`:

```js
  useEffect(() => {
    if (hideClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hideClose, onClose]);
```

  - On the inner panel `<div onClick={(e) => e.stopPropagation()} …>` add `role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}`.
  - On the close `<button>` add `aria-label="Close"`.
- [ ] Step 4: Verify: `npm run typecheck`, `npm run build`, `npm test`, lint = 6. Commit `fix(a11y): AA contrast for subtle/amber tokens; modal Esc + dialog semantics (B4)`.
- [ ] Step 5: Push and open PR `feat(ui): task panel resize/expand + safety + a11y basics (B4)` with base `fix/b2-b3-save-safety`. Watch CI until green.

---

## HOD checks after merge (collected for the end-of-day list)
- **B2:** with a teammate account that has the `member` (read-only) role, edit a task. A red banner must appear ("Couldn’t save…").
- **B3:** open the same project in two browser tabs. Edit in tab A, then edit in tab B. Tab B shows the "not saved — someone else changed it" banner, and Reload brings in A's change.
- **B4:**
  - Drag the left edge of the task panel, use ⤢ to expand, and confirm the update box grows with text.
  - "Drop task" leaves the task greyed out as Dropped.
  - ✓ in My Work shows Undo.
  - Restore and Delete project are hidden for non-owners.
