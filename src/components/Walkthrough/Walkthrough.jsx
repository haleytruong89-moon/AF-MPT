// Walkthrough UI: spotlight overlay (4-div dimmer + tooltip with arrow)
// for steps that target a specific element, centered modal for conceptual steps.
// State + persistence is in useWalkthrough.ts; copy is in steps.ts.

import {
  useEffect,
  useImperativeHandle,
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
const TOOLTIP_W = 280;
const TOOLTIP_H = 140;

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
  { uid, ready },
  ref
) {
  const api = useWalkthrough({ uid, ready });
  const { active, stepIndex, start, next, skip, close, finish } = api;
  const step = STEPS[stepIndex];

  // Expose start() to parent so the "?" button can replay
  useImperativeHandle(ref, () => ({ start }), [start]);

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
            setResolvedTarget(null);
            setTargetRect(null);
            // Optional steps vanish when their target is not on screen;
            // others fall back to a centered modal with fallbackNote.
            if (step.skipIfMissing) {
              if (stepIndex >= STEPS.length - 1) finish(); else next();
            }
          }
        }, FALLBACK_RETRY_MS);
      }
    };
    tryResolve();
    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [active, step, stepIndex, next, finish]);

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
  const isModal = step.type === 'modal' || useFallbackModal;
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
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="walkthrough-modal-title"
            style={{
              background: '#fff', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw',
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
              fontFamily: '"Geist","Inter",ui-sans-serif,system-ui,sans-serif',
              color: '#111',
            }}
          >
            <ProgressBar current={stepIndex + 1} total={totalSteps} />
            <div id="walkthrough-modal-title" style={{ fontSize: 17, fontWeight: 600, marginTop: 12, marginBottom: 8 }}>{step.title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: '#333' }}>{step.body}</div>
            {useFallbackModal && step.fallbackNote && (
              <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 10 }}>
                {step.fallbackNote}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              {renderModalButtons(step, { stepIndex, totalSteps, next, skip, finish })}
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
          onNext={next}
          onSkip={skip}
          onClose={close}
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

function renderModalButtons(step, { stepIndex, totalSteps, next, skip, finish }) {
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

function SpotlightOverlay({ rect, placement, tip, step, progressLabel, onNext, onSkip, onClose }) {
  // Four div dimmers around the target rect (no clip-path needed)
  const dimmer = { background: DIM, position: 'fixed', pointerEvents: 'auto' };
  return (
    <>
      <div style={{ ...dimmer, top: 0, left: 0, right: 0, height: rect.top }} onClick={onClose} />
      <div style={{ ...dimmer, top: rect.bottom, left: 0, right: 0, bottom: 0 }} onClick={onClose} />
      <div style={{ ...dimmer, top: rect.top, left: 0, width: rect.left, height: rect.height }} onClick={onClose} />
      <div style={{ ...dimmer, top: rect.top, left: rect.right, right: 0, height: rect.height }} onClick={onClose} />
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
        role="dialog"
        aria-labelledby="walkthrough-tooltip-title"
        style={{
          position: 'fixed', top: tip.top, left: tip.left,
          width: TOOLTIP_W, padding: 14, background: '#fff', borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)', zIndex: TOOLTIP_Z,
          pointerEvents: 'auto',
          fontFamily: '"Geist","Inter",ui-sans-serif,system-ui,sans-serif',
          color: '#111',
        }}
      >
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{progressLabel}</div>
        <div id="walkthrough-tooltip-title" style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{step.title}</div>
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
