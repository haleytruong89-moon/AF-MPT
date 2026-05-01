# Walkthrough for new users — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 7-step walkthrough that auto-shows for first-time users (with manual replay via "?" button), per [spec](../specs/2026-04-29-walkthrough-design.md).

**Architecture:** Three new files in `src/components/Walkthrough/` — `steps.ts` (config), `useWalkthrough.ts` (state + persistence), `Walkthrough.jsx` (UI). Mounted as a sibling of existing modals at the App.jsx root. Persistence via Firestore `users/{uid}.tourCompletedAt` field with localStorage backup.

**Tech Stack:** React 18 (function components + hooks), TypeScript (`.ts` for hook + steps; `.jsx` for component since App.jsx is JSX), Firebase Firestore (existing client SDK at `src/firebase.ts`), `lucide-react` icons (already in deps).

**Testing approach:** This codebase has no test runner. Verification per task = TypeScript typecheck (`npm run typecheck`) + ESLint (`npm run lint`) + manual browser test. Each task ends with a concrete browser-based check.

---

## File structure

| File | Status | Responsibility |
|------|--------|---------------|
| `src/components/Walkthrough/steps.ts` | NEW | Step config array + TypeScript types |
| `src/components/Walkthrough/useWalkthrough.ts` | NEW | State machine, auto-trigger, Firestore + localStorage persistence |
| `src/components/Walkthrough/Walkthrough.jsx` | NEW | UI: backdrop, spotlight (4-div dimmer), centered modal, tooltip with arrow, target rect tracking |
| `src/App.jsx` | MODIFY | Mount `<Walkthrough />`, add `data-tour="..."` to existing search/members/view-tabs buttons, add new "?" Help button, mark first task in MindNode |
| `.gitignore` | MODIFY | Add `.superpowers/` (brainstorming companion artifacts) |

No new npm dependencies. Total LOC delta: ~400 lines.

---

## Task 1: Repo hygiene + scaffold directory

**Files:**
- Modify: `.gitignore`
- Create: `src/components/Walkthrough/` (directory)

- [ ] **Step 1: Add `.superpowers/` to `.gitignore`**

Read current `.gitignore` then append the new line.

```bash
# In afmpt-tracker/.gitignore — append after line 23 (last existing entry):
echo "" >> .gitignore
echo "# Superpowers brainstorming/visual companion artifacts" >> .gitignore
echo ".superpowers/" >> .gitignore
```

- [ ] **Step 2: Create the Walkthrough directory**

```bash
mkdir -p src/components/Walkthrough
```

- [ ] **Step 3: Verify**

```bash
ls -la src/components/Walkthrough
git status --short
```
Expected: directory exists (empty); `.gitignore` shows as modified; `.superpowers/` no longer in untracked list.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore superpowers brainstorm artifacts; scaffold Walkthrough dir"
```

---

## Task 2: Step config (steps.ts)

**Files:**
- Create: `src/components/Walkthrough/steps.ts`

- [ ] **Step 1: Write `steps.ts`**

Create the file with the exact content below:

```typescript
// Walkthrough step config. Edit copy here; logic lives in useWalkthrough.ts
// and rendering in Walkthrough.jsx.

export type StepBase = {
  id: string;
  title: string;
  body: string;
};

export type ModalStep = StepBase & {
  type: 'modal';
  primaryCta: string;
  secondaryCta?: string; // e.g., "Skip tour" on step 1
};

export type SpotlightStep = StepBase & {
  type: 'spotlight';
  target: string; // matches data-tour="..." attribute
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
  requireView?: 'mindmap'; // force-switch view before showing
  fallbackNote?: string; // shown when target element not found
  primaryCta: string;
};

export type BranchStep = StepBase & {
  type: 'branch';
  continueLabel: string;
  skipLabel: string;
};

export type Step = ModalStep | SpotlightStep | BranchStep;

export const STEPS: Step[] = [
  {
    id: 'welcome',
    type: 'modal',
    title: 'Welcome to AFMPT!',
    body: 'This tracker organizes your work as: Project → Programs → Workstreams → Tasks. Let’s take a quick 1-minute tour.',
    primaryCta: 'Start tour',
    secondaryCta: 'Skip tour',
  },
  {
    id: 'view-tabs',
    type: 'spotlight',
    target: 'view-tabs',
    placement: 'bottom',
    title: 'Switching views',
    body: 'AFMPT has multiple views of the same project. Mind Map is the visual canvas, Outline edits the tree, Dashboard shows stats. Try clicking between them later.',
    primaryCta: 'Next',
  },
  {
    id: 'first-task',
    type: 'spotlight',
    target: 'first-task',
    requireView: 'mindmap',
    placement: 'auto',
    title: 'Click a task to open details',
    body: 'Inside, you can log check-ins, change status, set dates, and @mention teammates — they’ll see it in the activity feed.',
    fallbackNote: 'This step is about clicking a task — try it once you’ve added one.',
    primaryCta: 'Next',
  },
  {
    id: 'branch',
    type: 'branch',
    title: 'You’ve got the basics!',
    body: 'Want to see the advanced features (search, members, action items)?',
    continueLabel: 'Show me more',
    skipLabel: 'Skip — I’ll explore',
  },
  {
    id: 'search',
    type: 'spotlight',
    target: 'search',
    placement: 'bottom',
    title: 'Quick search',
    body: 'Press Ctrl+K (Cmd+K on Mac) anywhere to jump to any task or project instantly.',
    primaryCta: 'Next',
  },
  {
    id: 'members',
    type: 'spotlight',
    target: 'members',
    placement: 'bottom',
    title: 'Members & roles',
    body: 'Each project has roles: Owner (manages membership), Operator (edits content), Viewer (read-only). Click the people icon to manage.',
    fallbackNote: 'You’ll see this when you’re a member with permissions.',
    primaryCta: 'Next',
  },
  {
    id: 'specialty-tabs',
    type: 'spotlight',
    target: 'view-tabs',
    placement: 'bottom',
    title: 'Beyond tasks',
    body: 'Use the Decisions, Actions, and Aggregation tabs for decision logs, action items with PIC, and cross-project rollups. The ▶ Meeting button (right of tabs) launches a presentation mode for stand-ups with auto-generated minutes.',
    primaryCta: 'Next',
  },
  {
    id: 'closing',
    type: 'modal',
    title: 'You’re all set!',
    body: 'Click the ? icon in the header anytime to replay this tour. Happy tracking!',
    primaryCta: 'Got it',
  },
];

export const BRANCH_STEP_INDEX = STEPS.findIndex((s) => s.type === 'branch');
export const FIRST_ADVANCED_STEP_INDEX = BRANCH_STEP_INDEX + 1;
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```
Expected: PASS (zero errors). The file is purely types + a const array; no React/Firestore yet.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```
Expected: PASS or only pre-existing warnings (no new errors introduced by `steps.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/components/Walkthrough/steps.ts
git commit -m "feat(walkthrough): step config + types"
```

---

## Task 3: Persistence hook (useWalkthrough.ts)

**Files:**
- Create: `src/components/Walkthrough/useWalkthrough.ts`
- Read for context: `src/data.ts:40-41` (USER_REF), `src/firebase.ts`, `src/auth.tsx`

- [ ] **Step 1: Read context files**

Read these so the hook uses the same Firestore patterns:
- `src/data.ts` lines 1-50 (imports + USER_REF helper)
- `src/data.ts` lines 384-391 (`setCurrentProjectId` shows the doc-write pattern)

The same `users/{uid}` doc is used; we just write a different field.

- [ ] **Step 2: Write `useWalkthrough.ts`**

Create the file:

```typescript
// Walkthrough state machine + persistence.
// - Auto-triggers tour for first-time users (when Firestore flag + localStorage are both unset).
// - skip()/finish() mark the tour completed (Firestore + localStorage).
// - start() always resets to step 0; does NOT clear the flag (replay).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { STEPS, FIRST_ADVANCED_STEP_INDEX } from './steps';

const USER_REF = (uid: string) => doc(db, 'users', uid);
const LS_KEY = 'afmpt:tour:completed';
const AUTO_TRIGGER_DELAY_MS = 800;

type AnyProject = {
  programs?: { workstreams?: { tasks?: unknown[] }[] }[];
};

function projectHasTasks(project: AnyProject | null | undefined): boolean {
  if (!project) return false;
  for (const pg of project.programs || []) {
    for (const ws of pg.workstreams || []) {
      if ((ws.tasks || []).length > 0) return true;
    }
  }
  return false;
}

export interface UseWalkthroughArgs {
  uid: string | null | undefined;
  /** Whether the parent app finished bootstrapping (meta + project loaded). */
  ready: boolean;
  /** Current project — used to gate auto-trigger by project-has-tasks. */
  currentProject: AnyProject | null | undefined;
}

export interface WalkthroughApi {
  active: boolean;
  stepIndex: number;
  start: () => void;
  next: () => void;
  skip: () => void;
  finish: () => void;
  branchContinue: () => void;
  branchSkip: () => void;
}

export function useWalkthrough({
  uid,
  ready,
  currentProject,
}: UseWalkthroughArgs): WalkthroughApi {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const autoTriggerRanRef = useRef(false);

  const markCompleted = useCallback(async () => {
    try {
      localStorage.setItem(LS_KEY, '1');
    } catch {
      // localStorage may be disabled; safe to ignore
    }
    if (!uid) return;
    try {
      await setDoc(
        USER_REF(uid),
        { tourCompletedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.warn('Walkthrough: failed to write tourCompletedAt', err);
    }
  }, [uid]);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStepIndex((i) => (i < STEPS.length - 1 ? i + 1 : i));
  }, []);

  const skip = useCallback(() => {
    setActive(false);
    void markCompleted();
  }, [markCompleted]);

  const finish = useCallback(() => {
    setActive(false);
    void markCompleted();
  }, [markCompleted]);

  const branchContinue = useCallback(() => {
    setStepIndex(FIRST_ADVANCED_STEP_INDEX);
  }, []);

  const branchSkip = useCallback(() => {
    setActive(false);
    void markCompleted();
  }, [markCompleted]);

  // Auto-trigger for first-time users
  useEffect(() => {
    if (autoTriggerRanRef.current) return;
    if (!ready || !uid) return;
    if (!projectHasTasks(currentProject)) return;

    // Quick localStorage gate — avoids racing the Firestore read
    try {
      if (localStorage.getItem(LS_KEY) === '1') {
        autoTriggerRanRef.current = true;
        return;
      }
    } catch {
      // ignore
    }

    autoTriggerRanRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(USER_REF(uid));
        const data = snap.exists() ? snap.data() : null;
        if (!data || data.tourCompletedAt == null) {
          if (cancelled) return;
          setTimeout(() => {
            if (!cancelled) start();
          }, AUTO_TRIGGER_DELAY_MS);
        }
      } catch (err) {
        console.warn('Walkthrough: failed to read tourCompletedAt', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, uid, currentProject, start]);

  return {
    active,
    stepIndex,
    start,
    next,
    skip,
    finish,
    branchContinue,
    branchSkip,
  };
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```
Expected: PASS. Resolves imports from `'../../firebase'` and `'./steps'`.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```
Expected: PASS or only pre-existing warnings. (Note: `eslint` may not check `.ts` files — `tsc --noEmit` is the authoritative check.)

- [ ] **Step 5: Commit**

```bash
git add src/components/Walkthrough/useWalkthrough.ts
git commit -m "feat(walkthrough): state machine + Firestore/localStorage persistence"
```

---

## Task 4: UI component (Walkthrough.jsx)

**Files:**
- Create: `src/components/Walkthrough/Walkthrough.jsx`

- [ ] **Step 1: Write `Walkthrough.jsx`**

Create the file:

```jsx
// Walkthrough UI: spotlight overlay (4-div dimmer + tooltip with arrow)
// for steps that target a specific element, centered modal for conceptual steps.
// State + persistence is in useWalkthrough.ts; copy is in steps.ts.

import React, {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from 'react';
import { useWalkthrough } from './useWalkthrough';
import { STEPS } from './steps';

const OVERLAY_Z = 1500;
const TOOLTIP_Z = 1501;
const DIM = 'rgba(0,0,0,0.55)';
const VIEWPORT_MARGIN = 16;
const FALLBACK_RETRY_MS = 200;

function getRect(target) {
  if (!target) return null;
  try {
    return target.getBoundingClientRect();
  } catch {
    return null;
  }
}

function pickPlacement(rect, preferred) {
  // Try preferred → bottom → top → right → left, returning the first that
  // leaves at least 240×120 px of viewport space along that edge.
  const TOOLTIP_W = 280;
  const TOOLTIP_H = 140;
  const tries = preferred && preferred !== 'auto'
    ? [preferred, 'bottom', 'top', 'right', 'left']
    : ['bottom', 'top', 'right', 'left'];
  const seen = new Set();
  for (const p of tries) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (p === 'bottom' && window.innerHeight - rect.bottom > TOOLTIP_H + VIEWPORT_MARGIN) return 'bottom';
    if (p === 'top' && rect.top > TOOLTIP_H + VIEWPORT_MARGIN) return 'top';
    if (p === 'right' && window.innerWidth - rect.right > TOOLTIP_W + VIEWPORT_MARGIN) return 'right';
    if (p === 'left' && rect.left > TOOLTIP_W + VIEWPORT_MARGIN) return 'left';
  }
  return 'bottom';
}

function tooltipPosition(rect, placement) {
  const TOOLTIP_W = 280;
  const TOOLTIP_H = 140;
  const GAP = 12;
  let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
  let top = rect.bottom + GAP;
  if (placement === 'top') {
    top = rect.top - TOOLTIP_H - GAP;
  } else if (placement === 'right') {
    left = rect.right + GAP;
    top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
  } else if (placement === 'left') {
    left = rect.left - TOOLTIP_W - GAP;
    top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
  }
  // Clamp to viewport with 16px margin
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - TOOLTIP_W - VIEWPORT_MARGIN));
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - TOOLTIP_H - VIEWPORT_MARGIN));
  return { left, top };
}

const Walkthrough = forwardRef(function Walkthrough(
  { uid, ready, currentProject, currentView, setView },
  ref
) {
  const api = useWalkthrough({ uid, ready, currentProject });
  const { active, stepIndex, start, next, skip, finish, branchContinue, branchSkip } = api;
  const step = STEPS[stepIndex];

  // Expose start() to parent so the "?" button can replay
  useImperativeHandle(ref, () => ({ start }), [start]);

  // For requireView: switch view before showing
  useEffect(() => {
    if (!active || !step) return;
    if (step.type === 'spotlight' && step.requireView && currentView !== step.requireView) {
      setView(step.requireView);
    }
  }, [active, step, currentView, setView]);

  // Resolve target rect for spotlight
  const [targetRect, setTargetRect] = useState(null);
  const [resolvedTarget, setResolvedTarget] = useState(null);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    if (!active || !step || step.type !== 'spotlight') {
      setTargetRect(null);
      setResolvedTarget(null);
      return;
    }
    let cancelled = false;
    const tryResolve = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        setResolvedTarget(el);
        setTargetRect(getRect(el));
      } else {
        // Retry once after 200ms (mind map nodes may render late)
        retryTimerRef.current = setTimeout(() => {
          if (cancelled) return;
          const el2 = document.querySelector(`[data-tour="${step.target}"]`);
          if (el2) {
            setResolvedTarget(el2);
            setTargetRect(getRect(el2));
          } else {
            // Fall back to centered modal mode
            setResolvedTarget(null);
            setTargetRect(null);
          }
        }, FALLBACK_RETRY_MS);
      }
    };
    tryResolve();
    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [active, step]);

  // Reposition on resize/scroll
  useEffect(() => {
    if (!resolvedTarget) return;
    let raf = 0;
    const recompute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setTargetRect(getRect(resolvedTarget));
      });
    };
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [resolvedTarget]);

  if (!active || !step) return null;

  const isSpotlight = step.type === 'spotlight';
  const useFallbackModal = isSpotlight && targetRect == null;
  const isModal = step.type === 'modal' || step.type === 'branch' || useFallbackModal;
  const placement = isSpotlight && targetRect ? pickPlacement(targetRect, step.placement) : null;
  const tip = isSpotlight && targetRect && placement ? tooltipPosition(targetRect, placement) : null;
  const totalSteps = STEPS.length;
  const progressLabel = `${stepIndex + 1} / ${totalSteps}`;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: OVERLAY_Z, pointerEvents: 'none' }}>
      {isModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: DIM,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw',
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
              fontFamily: '"Geist","Inter",ui-sans-serif,system-ui,sans-serif',
              color: '#111',
            }}
          >
            <ProgressBar current={stepIndex + 1} total={totalSteps} />
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 12, marginBottom: 8 }}>{step.title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: '#333' }}>{step.body}</div>
            {useFallbackModal && step.fallbackNote && (
              <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 10 }}>
                {step.fallbackNote}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              {renderModalButtons(step, { stepIndex, totalSteps, next, skip, finish, branchContinue, branchSkip })}
            </div>
          </div>
        </div>
      )}

      {isSpotlight && targetRect && !useFallbackModal && (
        <SpotlightOverlay
          rect={targetRect}
          placement={placement}
          tip={tip}
          step={step}
          progressLabel={progressLabel}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
          onNext={next}
          onSkip={skip}
        />
      )}
    </div>
  );
});

export default Walkthrough;

function ProgressBar({ current, total }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 3, flex: 1, borderRadius: 999,
            background: i < current ? '#000' : '#ddd',
          }}
        />
      ))}
    </div>
  );
}

function renderModalButtons(step, { stepIndex, totalSteps, next, skip, finish, branchContinue, branchSkip }) {
  if (step.type === 'modal') {
    const isLast = stepIndex === totalSteps - 1;
    const onPrimary = isLast ? finish : next;
    return (
      <>
        {step.secondaryCta && (
          <button onClick={skip} style={btnStyle('secondary')}>{step.secondaryCta}</button>
        )}
        <button onClick={onPrimary} style={btnStyle('primary')}>{step.primaryCta} {!isLast && '→'}</button>
      </>
    );
  }
  if (step.type === 'branch') {
    return (
      <>
        <button onClick={branchSkip} style={btnStyle('secondary')}>{step.skipLabel}</button>
        <button onClick={branchContinue} style={btnStyle('primary')}>{step.continueLabel} →</button>
      </>
    );
  }
  // spotlight in fallback mode
  return <button onClick={next} style={btnStyle('primary')}>{step.primaryCta} →</button>;
}

function btnStyle(variant) {
  const base = {
    fontFamily: 'inherit', fontSize: 13, fontWeight: 500, padding: '8px 14px',
    borderRadius: 6, border: 'none', cursor: 'pointer',
  };
  if (variant === 'primary') return { ...base, background: '#000', color: '#fff' };
  return { ...base, background: 'transparent', color: '#666' };
}

function SpotlightOverlay({ rect, placement, tip, step, progressLabel, stepIndex, totalSteps, onNext, onSkip }) {
  // Four div dimmers around the target rect (no clip-path needed)
  const dimmer = { background: DIM, position: 'fixed', pointerEvents: 'auto' };
  return (
    <>
      <div style={{ ...dimmer, top: 0, left: 0, right: 0, height: rect.top }} onClick={onSkip} />
      <div style={{ ...dimmer, top: rect.bottom, left: 0, right: 0, bottom: 0 }} onClick={onSkip} />
      <div style={{ ...dimmer, top: rect.top, left: 0, width: rect.left, height: rect.height }} onClick={onSkip} />
      <div style={{ ...dimmer, top: rect.top, left: rect.right, right: 0, height: rect.height }} onClick={onSkip} />
      {/* Outline ring around the target */}
      <div
        style={{
          position: 'fixed',
          top: rect.top - 4, left: rect.left - 4,
          width: rect.width + 8, height: rect.height + 8,
          border: '2px solid #fbbf24', borderRadius: 6,
          pointerEvents: 'none', zIndex: TOOLTIP_Z,
        }}
      />
      {/* Tooltip card */}
      <div
        style={{
          position: 'fixed', top: tip.top, left: tip.left,
          width: 280, padding: 14, background: '#fff', borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)', zIndex: TOOLTIP_Z,
          pointerEvents: 'auto',
          fontFamily: '"Geist","Inter",ui-sans-serif,system-ui,sans-serif',
          color: '#111',
        }}
      >
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{progressLabel}</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#333' }}>{step.body}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button onClick={onSkip} style={btnStyle('secondary')}>Skip</button>
          <button onClick={onNext} style={btnStyle('primary')}>{step.primaryCta} →</button>
        </div>
        <Arrow placement={placement} />
      </div>
    </>
  );
}

function Arrow({ placement }) {
  const SIZE = 8;
  const base = {
    position: 'absolute', width: SIZE * 2, height: SIZE * 2, background: '#fff',
    transform: 'rotate(45deg)',
  };
  if (placement === 'bottom') return <div style={{ ...base, top: -SIZE, left: '50%', marginLeft: -SIZE }} />;
  if (placement === 'top') return <div style={{ ...base, bottom: -SIZE, left: '50%', marginLeft: -SIZE }} />;
  if (placement === 'right') return <div style={{ ...base, left: -SIZE, top: '50%', marginTop: -SIZE }} />;
  if (placement === 'left') return <div style={{ ...base, right: -SIZE, top: '50%', marginTop: -SIZE }} />;
  return null;
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```
Expected: PASS. (`.jsx` files don't typecheck — but the imports from `useWalkthrough.ts` and `steps.ts` will be checked.)

- [ ] **Step 3: Run lint**

```bash
npm run lint
```
Expected: PASS or only pre-existing warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/Walkthrough/Walkthrough.jsx
git commit -m "feat(walkthrough): UI component with spotlight + modal rendering"
```

---

## Task 5: Wire data-tour anchors on existing header buttons

**Files:**
- Modify: `src/App.jsx` lines 4348-4349 (search + members buttons), line 4375 (view tabs container)

- [ ] **Step 1: Read context lines around the changes**

Read [src/App.jsx:4334-4400](../../../src/App.jsx#L4334-L4400) to see the header structure before editing.

> **Pre-decided:** `Btn` (at App.jsx:353-373) only accepts `{ children, onClick, variant, size, disabled, title, style }` — no prop spread. So we **must** wrap with `<span data-tour="...">`. This is locked in below; do not try to pass `data-tour` directly to `Btn`.

- [ ] **Step 2: Wrap search button with `<span data-tour="search">`**

Find this exact line (currently line 4348):

```jsx
            <Btn size="sm" variant="ghost" onClick={() => setShowSearch(true)} title="Search across projects (Ctrl/Cmd+K)"><Search size={12} /></Btn>
```

Replace with:

```jsx
            <span data-tour="search" style={{ display: 'inline-flex' }}><Btn size="sm" variant="ghost" onClick={() => setShowSearch(true)} title="Search across projects (Ctrl/Cmd+K)"><Search size={12} /></Btn></span>
```

(`display: 'inline-flex'` ensures the span's bounding rect matches the button's, so the spotlight rect is tight.)

- [ ] **Step 3: Wrap members button with `<span data-tour="members">`**

Find this exact line (currently 4349):

```jsx
            <Btn size="sm" variant="ghost" onClick={() => setShowMembers(true)} title="Manage members & related parties" disabled={!project}><UserCircle size={12} /></Btn>
```

Replace with:

```jsx
            <span data-tour="members" style={{ display: 'inline-flex' }}><Btn size="sm" variant="ghost" onClick={() => setShowMembers(true)} title="Manage members & related parties" disabled={!project}><UserCircle size={12} /></Btn></span>
```

- [ ] **Step 4: Add `data-tour="view-tabs"` to the view tabs container**

Find the container `div` at line 4375 (currently):

```jsx
          <div style={{ display: 'flex', gap: 2, padding: 2, background: TOK.bg, borderRadius: 8, flexWrap: 'wrap' }}>
```

Add `data-tour="view-tabs"`:

```jsx
          <div data-tour="view-tabs" style={{ display: 'flex', gap: 2, padding: 2, background: TOK.bg, borderRadius: 8, flexWrap: 'wrap' }}>
```

- [ ] **Step 5: Run typecheck + lint**

```bash
npm run typecheck && npm run lint
```
Expected: PASS or only pre-existing warnings.

- [ ] **Step 6: Manual verify**

```bash
npm run dev
```
Open `http://localhost:5173`, sign in, and use the browser devtools "Inspect" tool. Confirm:
- The search button has `data-tour="search"` (or its wrapper does)
- The members button has `data-tour="members"`
- The view tabs container has `data-tour="view-tabs"`

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat(walkthrough): add data-tour anchors to header buttons & view tabs"
```

---

## Task 6: Mark first task in MindNode (data-tour="first-task")

**Files:**
- Modify: `src/App.jsx` lines 3506 (MindMapView nodes.map), 3520-3551 (MindNode signature + outer `<g>`)

- [ ] **Step 1: Add `isFirstTask` prop pass-through in `MindMapView`**

Find this line (currently 3506):

```jsx
            {nodes.map((n) => <MindNode key={n.id} n={n} onToggle={toggle} onTaskClick={onTaskClick} selectedTaskId={selectedTaskId} onOpenMenu={openMenu} />)}
```

Replace with:

```jsx
            {(() => {
              const firstTaskIdx = nodes.findIndex((x) => x.kind === 'task');
              return nodes.map((n, idx) => (
                <MindNode
                  key={n.id}
                  n={n}
                  isFirstTask={idx === firstTaskIdx}
                  onToggle={toggle}
                  onTaskClick={onTaskClick}
                  selectedTaskId={selectedTaskId}
                  onOpenMenu={openMenu}
                />
              ));
            })()}
```

- [ ] **Step 2: Update `MindNode` to use `isFirstTask`**

Find this line (currently 3520):

```jsx
function MindNode({ n, onToggle, onTaskClick, selectedTaskId, onOpenMenu }) {
```

Replace with:

```jsx
function MindNode({ n, isFirstTask, onToggle, onTaskClick, selectedTaskId, onOpenMenu }) {
```

Find this line (currently 3551):

```jsx
    <g data-mindnode="true" transform={`translate(${n.x},${n.y})`} opacity={opacity}>
```

Replace with:

```jsx
    <g data-mindnode="true" data-tour={isFirstTask ? 'first-task' : undefined} transform={`translate(${n.x},${n.y})`} opacity={opacity}>
```

- [ ] **Step 3: Run typecheck + lint**

```bash
npm run typecheck && npm run lint
```
Expected: PASS or only pre-existing warnings.

- [ ] **Step 4: Manual verify**

```bash
npm run dev
```
Sign in, ensure you're on Mind Map view of the seed CRP project. Use devtools to inspect the SVG. Confirm exactly **one** `<g>` element has `data-tour="first-task"` and it corresponds to the first task in `programs[0].workstreams[0].tasks[0]` ("Resolution for dissolutions & Submit to BRA"). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(walkthrough): mark first mind-map task with data-tour anchor"
```

---

## Task 7: Mount Walkthrough + add Help button in App.jsx

**Files:**
- Modify: `src/App.jsx` (imports, lucide imports, body of App, header buttons)

- [ ] **Step 1: Add `HelpCircle` to lucide-react imports**

Find this block (lines 2-9):

```jsx
import {
  Plus, Edit2, Trash2, X, Upload, Download, ChevronRight, ChevronDown,
  Save, Map as MapIcon, List as ListIcon, Calendar, FileSpreadsheet,
  Clock, AlertTriangle, CheckCircle2, Circle, PlayCircle,
  MessageSquare, Search, MoreHorizontal, FolderPlus, FileDown,
  FileUp, Activity, Home, ArrowRightLeft, Info, RefreshCw, UserCircle,
  Move, FileText, History, Grip, BarChart3
} from 'lucide-react';
```

Replace `BarChart3` with `BarChart3, HelpCircle`:

```jsx
import {
  Plus, Edit2, Trash2, X, Upload, Download, ChevronRight, ChevronDown,
  Save, Map as MapIcon, List as ListIcon, Calendar, FileSpreadsheet,
  Clock, AlertTriangle, CheckCircle2, Circle, PlayCircle,
  MessageSquare, Search, MoreHorizontal, FolderPlus, FileDown,
  FileUp, Activity, Home, ArrowRightLeft, Info, RefreshCw, UserCircle,
  Move, FileText, History, Grip, BarChart3, HelpCircle
} from 'lucide-react';
```

- [ ] **Step 2: Import Walkthrough**

Find this block (around line 11):

```jsx
import { SearchModal, useSearchHotkey } from './components/SearchModal';
import { GanttView } from './components/GanttView';
import { MembersModal } from './components/MembersModal';
import { useAuth } from './auth';
```

Add the Walkthrough import:

```jsx
import { SearchModal, useSearchHotkey } from './components/SearchModal';
import { GanttView } from './components/GanttView';
import { MembersModal } from './components/MembersModal';
import Walkthrough from './components/Walkthrough/Walkthrough';
import { useAuth } from './auth';
```

- [ ] **Step 3: Add a ref for the Walkthrough component inside `App`**

Find this line (currently around 4071):

```jsx
  const fileInputRef = useRef(null);
```

Add a walkthrough ref right after:

```jsx
  const fileInputRef = useRef(null);
  const walkthroughRef = useRef(null);
```

- [ ] **Step 4: Add the "?" Help button in the header (next to Members)**

After Task 5 these lines now look like:

```jsx
            <span data-tour="search" style={{ display: 'inline-flex' }}><Btn size="sm" variant="ghost" onClick={() => setShowSearch(true)} title="Search across projects (Ctrl/Cmd+K)"><Search size={12} /></Btn></span>
            <span data-tour="members" style={{ display: 'inline-flex' }}><Btn size="sm" variant="ghost" onClick={() => setShowMembers(true)} title="Manage members & related parties" disabled={!project}><UserCircle size={12} /></Btn></span>
```

Add the Help button immediately after Members (also wrapped with a `<span data-tour="help">`):

```jsx
            <span data-tour="search" style={{ display: 'inline-flex' }}><Btn size="sm" variant="ghost" onClick={() => setShowSearch(true)} title="Search across projects (Ctrl/Cmd+K)"><Search size={12} /></Btn></span>
            <span data-tour="members" style={{ display: 'inline-flex' }}><Btn size="sm" variant="ghost" onClick={() => setShowMembers(true)} title="Manage members & related parties" disabled={!project}><UserCircle size={12} /></Btn></span>
            <span data-tour="help" style={{ display: 'inline-flex' }}><Btn size="sm" variant="ghost" onClick={() => walkthroughRef.current?.start()} title="Show walkthrough"><HelpCircle size={12} /></Btn></span>
```

- [ ] **Step 5: Mount `<Walkthrough>` near `<Toast>` and `<DialogHost>`**

Find this block (currently around lines 4430-4431):

```jsx
        <Toast toast={toast} onClose={() => setToast(null)} />
        <DialogHost dialog={dialog} close={closeDialog} />
```

Add the Walkthrough mount right after:

```jsx
        <Toast toast={toast} onClose={() => setToast(null)} />
        <DialogHost dialog={dialog} close={closeDialog} />
        <Walkthrough
          ref={walkthroughRef}
          uid={authUser?.uid || null}
          ready={!loading && !!meta && !!currentId}
          currentProject={project}
          currentView={view}
          setView={setView}
        />
```

- [ ] **Step 6: Run typecheck + lint + build**

```bash
npm run typecheck && npm run lint && npm run build
```
Expected: all PASS. The build verifies that JSX/TSX integrate cleanly.

- [ ] **Step 7: Manual verify (the full walkthrough)**

```bash
npm run dev
```

Open `http://localhost:5173`, sign in with a `@smartosc.com` account that has `tourCompletedAt` unset on `users/{uid}`. (For a fresh test, run this in the browser devtools console first to clear any prior completion: `localStorage.removeItem('afmpt:tour:completed')`. To clear the Firestore flag, delete the `tourCompletedAt` field from the `users/{your-uid}` doc in the Firebase console.)

Verify, in order:
- Within ~1 sec after sign-in, the welcome modal appears with "Welcome to AFMPT!"
- Click "Start tour" → step 2 spotlight on the view tabs (orange ring around tabs container, dimmed background, tooltip below)
- Click "Next" → step 3 spotlight on the first task in Mind Map. If you were not on Mind Map, the view auto-switches.
- Click "Next" → branch modal appears with "Show me more" / "Skip" buttons
- Click "Show me more" → step 4 spotlight on search button
- Click "Next" → step 5 spotlight on members button
- Click "Next" → step 6 spotlight on view tabs ("Beyond tasks" copy)
- Click "Next" → step 7 closing modal "You're all set!"
- Click "Got it" → tour ends; localStorage `afmpt:tour:completed = '1'`; Firestore `users/{uid}.tourCompletedAt` is set
- Reload the page → tour does NOT re-show
- Click the new "?" button in the header → tour starts again from step 1
- Resize the window mid-tour → tooltip and dimmer reposition correctly

Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat(walkthrough): mount component and add Help button"
```

---

## Task 8: Edge case verification

**Files:**
- None modified — verification only.

- [ ] **Step 1: Verify "no tasks" guard**

Create a fresh project (use the "New project" button in the header). Confirm it has zero tasks. Then in the Firestore console, clear `users/{your-uid}.tourCompletedAt` AND in browser devtools console run `localStorage.removeItem('afmpt:tour:completed')`. Reload.

Expected: tour does **NOT** auto-show (guard #5 from spec — `projectHasTasks` is false). The "?" button still works manually but step 3 falls back to a centered modal with the `fallbackNote`.

- [ ] **Step 2: Verify offline persistence**

In devtools, set the Network tab to "Offline" before signing in. Reload. Sign in (Firebase Auth may use cache). Walk through the tour and click "Got it" on the closing modal.

Expected: localStorage flag `afmpt:tour:completed=1` is set even though Firestore write fails. Reload (still offline) — tour does not re-show. Go back online; the next click of any walkthrough action will retry the Firestore write (or a future sign-in will).

- [ ] **Step 3: Verify "Skip" behavior at step 1**

Clear flags (Firestore + localStorage) and reload. When the welcome modal appears, click "Skip tour".

Expected: tour ends immediately, both persistence stores updated.

- [ ] **Step 4: Verify branch "Skip — I'll explore"**

Clear flags and reload. Walk through to the branch modal. Click "Skip — I'll explore".

Expected: tour ends, both persistence stores updated.

- [ ] **Step 5: Verify replay does NOT clear the flag**

After completing the tour, click "?" to replay. Walk to step 3. Open Firestore console. The `tourCompletedAt` should still hold its original timestamp (NOT updated). Click "Skip" mid-tour during replay.

Expected: `tourCompletedAt` still holds the *original* timestamp (since Firestore `serverTimestamp()` could update it on skip — verify the field changed but a fresh user is no longer prompted, and check what timestamp is recorded). Tour does not re-auto-show after replay-skip either (which is the user's intent: they don't want to be re-prompted).

> Note: skip during replay overwrites `tourCompletedAt` with a new timestamp. That's acceptable — the field is "completed" either way and the auto-trigger guard only checks for null/undefined. Document this as expected behavior.

- [ ] **Step 6: Commit**

(No code changes in this task — but if any verification reveals a bug, add a fix step here, run typecheck+lint+build, and commit.)

```bash
# If no fixes were needed, skip the commit. Otherwise:
git add <files>
git commit -m "fix(walkthrough): <bug>"
```

---

## Self-Review

After writing this plan, I checked it against the spec:

**Spec coverage:**
- ✅ Decisions 1-8: scope (Tasks 2 step config), trigger (Task 3 hook + Task 7 button), style (Task 4 component), language (Task 2 copy), step content (Task 2 copy), step 3 task pick (Task 6), code structure (file structure section), no new deps (file structure section).
- ✅ Architecture: 3 files in `src/components/Walkthrough/` — created in Tasks 2/3/4.
- ✅ Auto-trigger guards 1-5: Task 3 implements all five (uid present, ready, currentProject present, projectHasTasks check, Firestore + localStorage check).
- ✅ Spotlight positioning algorithm: Task 4 step 1 implements 4-div dimmer, viewport-aware placement, getBoundingClientRect, resize/scroll listeners.
- ✅ Anchors: Task 5 (search/members/view-tabs), Task 6 (first-task), Task 7 (help).
- ✅ Persistence: Task 3 hook writes to Firestore + localStorage; rules pre-checked (no rule changes needed per spec).
- ✅ Manual test plan: Task 7 step 7 + Task 8 cover all spec test scenarios.
- ✅ Out-of-scope items (mobile, i18n, role-based content, telemetry) correctly excluded.

**Placeholder scan:** No "TBD"/"TODO"/"add error handling" found. Each step has concrete code or commands.

**Type consistency:** `WalkthroughApi.start/next/skip/finish/branchContinue/branchSkip` (Task 3) match the calls in `Walkthrough.jsx` (Task 4). `STEPS` and `BRANCH_STEP_INDEX`/`FIRST_ADVANCED_STEP_INDEX` exports (Task 2) match imports in Tasks 3 and 4. `useImperativeHandle` exposes `start` (Task 4); `walkthroughRef.current?.start()` calls it (Task 7). `data-tour` strings ("search", "members", "view-tabs", "first-task", "help") match `STEPS[].target` values from Task 2.

**Btn pass-through resolved:** verified `Btn` (App.jsx:353-373) does **not** spread arbitrary props. Plan locks in the `<span data-tour="..." style={{ display: 'inline-flex' }}>` wrapper for all three header anchors (search/members/help) — no implementer judgment required.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-04-29-walkthrough.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task with two-stage review between tasks. Faster iteration; isolated context per task.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`. Batch execution with checkpoints.

Which approach?
