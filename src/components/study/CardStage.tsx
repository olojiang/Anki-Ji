"use client";
/**
 * Study card motion stage.
 *  - Touch swipe follows the finger (translate + tilt), the rating label and colour tint fade in as
 *    the threshold nears; released early → spring (rubber-band) back; past threshold / fling → commit.
 *  - Exit by rating: Again slides left (red tint), Good right (teal), Easy up (blue), Hard a small
 *    settle-down nudge (amber) — no shake. The next card rises in from the stack behind.
 *  - Undo: the restored card flies back in from where it left.
 *  - Reduced motion: opacity only, no transforms (dragging still tracks the finger, without tilt).
 * Pure math lives in src/core/motion.ts (tested).
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DURATION, exitVector, rubberBand, swipeDirectionRating, swipeOutcome, swipeProgress, swipeRotation, swipeThreshold, velocityFrom } from "@/core/motion";
import { isReducedMotion, useReducedMotion } from "../motion";
import { cx } from "../ui";

/** Exit duration; the page swaps in the next card on onExitEnd (transitionend), with this as a safety net. */
export const CARD_EXIT_MS = 260;
export const cardExitMs = () => (isReducedMotion() ? 140 : CARD_EXIT_MS);
/** Promise that resolves when the stage reports its exit finished (or after a generous fallback). */
export function exitBarrier(ref: React.MutableRefObject<(() => void) | null>, fallbackMs = 1500): Promise<void> {
  return new Promise((res) => {
    const t = setTimeout(() => { ref.current = null; res(); }, fallbackMs);
    ref.current = () => { clearTimeout(t); ref.current = null; res(); };
  });
}

const TINT: Record<string, string> = {
  again: "bg-again/[0.10] ring-again/40",
  hard: "bg-hard/[0.10] ring-hard/40",
  good: "bg-good/[0.10] ring-good/40",
  easy: "bg-easy/[0.10] ring-easy/40",
};
const LABEL: Record<string, string> = {
  again: "bg-again/15 text-again ring-again/30",
  hard: "bg-hard/15 text-hard ring-hard/30",
  good: "bg-good/15 text-good ring-good/30",
  easy: "bg-easy/15 text-easy ring-easy/30",
};
const TONE_BY_RATING: Record<number, string> = { 1: "again", 2: "hard", 3: "good", 4: "easy" };

const interactive = (el: EventTarget | null) => el instanceof Element && !!el.closest("button,a,input,textarea,select,audio,video,label,iframe,summary");

export function CardStage({ enterKey, enterFrom, exitRating, swipeEnabled, labels, onCommit, onExitEnd, onClick, children, className }: {
  enterKey: number;
  /** rating whose exit to reverse (undo); null → enter from the stack */
  enterFrom: number | null;
  /** when set, the card plays its exit for this rating */
  exitRating: number | null;
  swipeEnabled: boolean;
  labels: Record<number, string>;
  onCommit: (rating: 1 | 3) => void;
  /** fired when the exit transition has finished (opacity transitionend on the stage) */
  onExitEnd?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const g = useRef<{ x0: number; y0: number; lock: "h" | "v" | null; samples: { x: number; t: number }[]; width: number; id: number } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number; active: boolean }>({ dx: 0, dy: 0, active: false });
  const lastKey = useRef(enterKey);
  const keyChanged = lastKey.current !== enterKey;
  useEffect(() => { lastKey.current = enterKey; setDrag({ dx: 0, dy: 0, active: false }); }, [enterKey]);

  const width = ref.current?.offsetWidth || 360;
  const threshold = swipeThreshold(width);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!swipeEnabled || exitRating != null || e.pointerType === "mouse" || interactive(e.target)) return;
    g.current = { x0: e.clientX, y0: e.clientY, lock: null, samples: [{ x: e.clientX, t: e.timeStamp }], width: ref.current?.offsetWidth || 360, id: e.pointerId };
  }, [swipeEnabled, exitRating]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = g.current; if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (!s.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.lock = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (s.lock === "v") { g.current = null; return; }
      try { ref.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    s.samples.push({ x: e.clientX, t: e.timeStamp }); if (s.samples.length > 10) s.samples.shift();
    setDrag({ dx, dy: rubberBand(dy, 40), active: true });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const s = g.current; g.current = null;
    if (!s || s.lock !== "h") return;
    const rating = e.type === "pointercancel" ? null : swipeOutcome({ dx: drag.dx, vx: velocityFrom(s.samples), threshold: swipeThreshold(s.width) });
    if (rating) { setDrag((d) => ({ ...d, active: false })); onCommit(rating); }
    else setDrag({ dx: 0, dy: 0, active: false }); // rubber-band back (spring transition)
  }, [drag.dx, onCommit]);

  /* ── outer transform: drag / exit / rest ── */
  const exiting = exitRating != null;
  const ex = exiting ? exitVector(exitRating) : null;
  const W = typeof window !== "undefined" ? window.innerWidth : 1200;
  const H = typeof window !== "undefined" ? window.innerHeight : 800;
  let style: CSSProperties;
  if (keyChanged) {
    style = { transition: "none" };
  } else if (ex) {
    const travelX = ex.x === 0 ? 0 : Math.abs(ex.x) >= 1 ? Math.sign(ex.x) * Math.max(W * 0.9, 520) + drag.dx * 0.2 : ex.x * width;
    const travelY = Math.abs(ex.y) >= 1 ? Math.sign(ex.y) * Math.max(H * 0.6, 420) : ex.y * width + drag.dy;
    const rot = ex.r + (drag.dx ? swipeRotation(drag.dx, width) : 0);
    style = reduced
      ? { opacity: 0, transition: `opacity ${cardExitMs()}ms linear` }
      : { transform: `translate3d(${travelX}px, ${travelY}px, 0) rotate(${rot}deg) scale(${ex.scale})`, opacity: 0, transition: `transform ${CARD_EXIT_MS}ms var(--ease-exit), opacity ${CARD_EXIT_MS}ms cubic-bezier(0.4, 0, 1, 1)` };
  } else if (drag.active || drag.dx || drag.dy) {
    style = {
      transform: `translate3d(${drag.dx}px, ${reduced ? 0 : drag.dy}px, 0) rotate(${reduced ? 0 : swipeRotation(drag.dx, width)}deg)`,
      transition: drag.active ? "none" : `transform var(--dur-slow) var(--ease-spring)`,
    };
  } else {
    style = { transform: "translate3d(0,0,0)", transition: `transform var(--dur-slow) var(--ease-spring)` };
  }

  /* ── tint + label ── */
  const dirRating = ex ? exitRating! : swipeDirectionRating(drag.dx);
  const tone = dirRating ? TONE_BY_RATING[dirRating] : null;
  const progress = ex ? 1 : swipeProgress(drag.dx, threshold);
  const committed = !ex && progress >= 1;

  /* ── enter (new card from the stack, or back from where it left on undo) ── */
  const back = enterFrom != null ? exitVector(enterFrom) : null;
  const enterStyle = back ? ({
    "--from-x": `${Math.abs(back.x) >= 1 ? Math.sign(back.x) * Math.min(W * 0.6, 480) : back.x * 360}px`,
    "--from-y": `${Math.abs(back.y) >= 1 ? Math.sign(back.y) * Math.min(H * 0.4, 320) : back.y * 360}px`,
    "--from-r": `${back.r}deg`,
  } as CSSProperties) : undefined;

  return (
    <div ref={ref} className={cx("relative flex flex-1 flex-col will-change-transform", reduced && "m-fade-ok", className)} style={{ ...style, touchAction: swipeEnabled ? "pan-y" : "auto" }}
      onTransitionEnd={(e) => { if (exiting && e.target === e.currentTarget && e.propertyName === "opacity") onExitEnd?.(); }}
      onClick={onClick} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div key={enterKey} className={cx("relative flex flex-1 flex-col", back ? "m-card-return" : "m-card-enter")} style={enterStyle}>
        {children}
        {tone && (progress > 0) && (
          <div aria-hidden className={cx("pointer-events-none absolute inset-0 z-10 rounded-3xl ring-2 ring-inset", TINT[tone])}
            style={{ opacity: Math.min(1, progress * 0.9), transition: drag.active ? "none" : `opacity ${DURATION.base}ms linear` }} />
        )}
        {tone && dirRating && labels[dirRating] && progress > 0.05 && (
          <div aria-live="polite" className={cx("pointer-events-none absolute left-1/2 top-6 z-20 rounded-full px-3.5 py-1 text-[13px] font-semibold shadow-md ring-1 ring-inset backdrop-blur", LABEL[tone], committed && "ring-2")}
            style={{ opacity: progress, transform: `translate3d(-50%, 0, 0) scale(${0.9 + 0.1 * progress})`, transition: drag.active ? "none" : `opacity ${DURATION.fast}ms linear` }}>
            {labels[dirRating]}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Two-phase 3D flip for "show answer": the front turns edge-on (fast, ease-in), the answer side
 * turns in (emphasized). Phases advance on animationend (spread `onAnimationEnd` on the flipping
 * element), with timeouts as a safety net. Reduced motion → instant reveal (the answer fades).
 */
export function useFlipReveal() {
  const [phase, setPhase] = useState<null | "out" | "in">(null);
  const commitRef = useRef<(() => void) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const arm = (fn: () => void, ms: number) => { clearTimeout(timer.current); timer.current = window.setTimeout(fn, ms); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const toIn = useCallback(() => { commitRef.current?.(); commitRef.current = null; setPhase("in"); arm(() => setPhase(null), 3000); }, []);
  const reveal = useCallback((commit: () => void, flip = true) => {
    if (!flip || isReducedMotion()) { commit(); return; }
    commitRef.current = commit;
    setPhase("out");
    arm(toIn, DURATION.fast * 10);
  }, [toIn]);
  const reset = useCallback(() => { clearTimeout(timer.current); commitRef.current = null; setPhase(null); }, []);
  const onAnimationEnd = useCallback((e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.animationName === "m-flip-out") toIn();
    else if (e.animationName === "m-flip-in") { clearTimeout(timer.current); setPhase(null); }
  }, [toIn]);
  return { phase, reveal, reset, onAnimationEnd, flipClass: phase === "out" ? "m-flip-out" : phase === "in" ? "m-flip-in" : "" };
}
