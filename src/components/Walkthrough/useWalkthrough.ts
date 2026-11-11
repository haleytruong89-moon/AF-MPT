// Walkthrough state machine + persistence.
// - Auto-triggers tour for first-time users (Firestore flag + localStorage both unset), whatever the task count.
// - close() (backdrop click) just hides it; skip()/finish() mark the tour completed (Firestore + localStorage).
// - start() always resets to step 0; does NOT clear the flag (replay).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { STEPS } from './steps';
import { shouldCheckAutoStart, isFirstVisit, dismissMarksSeen } from './tourRules';

const USER_REF = (uid: string) => doc(db, 'users', uid);
const LS_KEY = 'afmpt:tour:completed';
const AUTO_TRIGGER_DELAY_MS = 800;

export interface UseWalkthroughArgs {
  uid: string | null | undefined;
  /** Whether the parent app finished bootstrapping (meta + project loaded). */
  ready: boolean;
}

export interface WalkthroughApi {
  active: boolean;
  stepIndex: number;
  start: () => void;
  next: () => void;
  skip: () => void;
  /** Close without marking the tour as seen (backdrop click). */
  close: () => void;
  finish: () => void;
}

export function useWalkthrough({
  uid,
  ready,
}: UseWalkthroughArgs): WalkthroughApi {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // Auto-trigger fires exactly once per mount. start() (replay) does NOT reset
  // this ref — replay is manual-only via the "?" button.
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
    if (dismissMarksSeen('skip')) void markCompleted();
  }, [markCompleted]);

  const close = useCallback(() => {
    setActive(false);
    if (dismissMarksSeen('backdrop')) void markCompleted();
  }, [markCompleted]);

  const finish = useCallback(() => {
    setActive(false);
    void markCompleted();
  }, [markCompleted]);

  // Auto-trigger for first-time users
  useEffect(() => {
    if (autoTriggerRanRef.current) return;
    let localSeen = false;
    // Quick localStorage gate — avoids racing the Firestore read
    try {
      localSeen = localStorage.getItem(LS_KEY) === '1';
    } catch {
      // ignore
    }
    if (ready && uid && localSeen) autoTriggerRanRef.current = true;
    if (!shouldCheckAutoStart({ ready, uid, localSeen })) return;

    autoTriggerRanRef.current = true;

    let cancelled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        const snap = await getDoc(USER_REF(uid as string));
        const data = snap.exists() ? snap.data() : null;
        if (isFirstVisit(data)) {
          if (cancelled) return;
          timeoutHandle = setTimeout(() => {
            if (!cancelled) start();
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
  }, [ready, uid, start]);

  return {
    active,
    stepIndex,
    start,
    next,
    skip,
    close,
    finish,
  };
}
