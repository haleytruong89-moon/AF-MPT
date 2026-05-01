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
  // Auto-trigger fires exactly once per mount. start() (replay) does NOT reset
  // this ref — replay is manual-only via the "?" button.
  const autoTriggerRanRef = useRef(false);
  // Latest project ref so the delayed auto-trigger re-checks tasks at fire time
  // (the user may switch projects during the 800ms delay).
  const currentProjectRef = useRef(currentProject);
  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

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
    // Replay: reset to step 0 and show. Does NOT reset autoTriggerRanRef
    // (we don't want auto-trigger to re-fire on next render) and does NOT
    // clear the persistence flag.
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
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        const snap = await getDoc(USER_REF(uid));
        const data = snap.exists() ? snap.data() : null;
        if (!data || data.tourCompletedAt == null) {
          if (cancelled) return;
          timeoutHandle = setTimeout(() => {
            // Re-check project state at fire time: user may have switched
            // projects during the 800ms delay to one with no tasks.
            if (!cancelled && projectHasTasks(currentProjectRef.current)) start();
          }, AUTO_TRIGGER_DELAY_MS);
        }
      } catch (err) {
        console.warn('Walkthrough: failed to read tourCompletedAt', err);
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
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
