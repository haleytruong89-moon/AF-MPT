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
