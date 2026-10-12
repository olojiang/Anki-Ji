"use client";
/**
 * Client motion primitives (hooks + tiny components). Pure math lives in src/core/motion.ts,
 * tokens / keyframes / reduced-motion rules in src/app/motion.css.
 *
 *   useMotionPref / useReducedMotion   in-app "Reduce motion" setting (system | reduce | full)
 *   usePresence                        keep a node mounted for its exit animation
 *   CountUp                            number count-up (writes textContent, no re-render per frame)
 *   Collapse                           height expand/collapse (grid 0fr ↔ 1fr), inert when closed
 *   useSlidingIndicator                measure the active item → transform for a sliding indicator
 *   useFlip                            FLIP reflow for reordered lists (transform only)
 *   liftDragImage                      lifted, shadowed ghost for native drag-and-drop
 *   navigateWithTransition             route change wrapped in the View Transitions API
 *   runThemeTransition                 circular reveal from the clicked control
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { DURATION, countUpAt, loadMotionPref, resolveReducedMotion, saveMotionPref, type MotionPref } from "@/core/motion";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* ─────────── Preference store ─────────── */
type Listener = () => void;
const listeners = new Set<Listener>();
let mqBound = false;
const prefersReduce = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function applyMotionAttr(pref: MotionPref) {
  document.documentElement.setAttribute("data-motion", resolveReducedMotion(pref, prefersReduce()) ? "reduce" : "full");
  listeners.forEach((l) => l());
}

function subscribe(l: Listener) {
  listeners.add(l);
  if (!mqBound && typeof window !== "undefined") {
    mqBound = true;
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => applyMotionAttr(loadMotionPref(localStorage)));
    window.addEventListener("storage", (e) => { if (e.key === "ak-motion") applyMotionAttr(loadMotionPref(localStorage)); });
  }
  return () => { listeners.delete(l); };
}

/** Persist + apply immediately (all tabs pick it up via the storage event). */
export function setMotionPref(pref: MotionPref) {
  saveMotionPref(localStorage, pref);
  applyMotionAttr(pref);
}

export function useMotionPref(): [MotionPref, (p: MotionPref) => void] {
  const pref = useSyncExternalStore(subscribe, () => loadMotionPref(localStorage), () => "system" as MotionPref);
  return [pref, setMotionPref];
}

/** true when motion should be reduced (OS setting or in-app choice). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, isReducedMotion, () => false);
}
export const isReducedMotion = () => typeof document !== "undefined" && document.documentElement.getAttribute("data-motion") === "reduce";

/* ─────────── Presence (exit animations) ─────────── */
/** Keeps children mounted for `exitMs` after `open` turns false. state drives enter/exit classes. */
export function usePresence(open: boolean, exitMs: number = DURATION.base): { mounted: boolean; state: "open" | "closed" } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    if (!mounted) return;
    const h = setTimeout(() => setMounted(false), isReducedMotion() ? 0 : exitMs);
    return () => clearTimeout(h);
  }, [open, mounted, exitMs]);
  return { mounted: open || mounted, state: open ? "open" : "closed" };
}

/* ─────────── CountUp ─────────── */
export function CountUp({ value, duration = 700, from = 0, format, className }: { value: number; duration?: number; from?: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(from);
  const fmt = useRef(format); fmt.current = format;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const start = last.current, end = value;
    last.current = value;
    const show = (n: number) => { el.textContent = fmt.current ? fmt.current(n) : String(n); };
    if (isReducedMotion() || start === end) { show(end); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      show(countUpAt(start, end, t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span ref={ref} className={className}>{format ? format(from) : from}</span>;
}

/* ─────────── Collapse ─────────── */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={["m-collapse", className].filter(Boolean).join(" ")} data-open={open} inert={!open}>
      <div>{children}</div>
    </div>
  );
}

/* ─────────── Sliding indicator ─────────── */
/**
 * Positions an absolutely-placed indicator over the element matching `[data-active="true"]`
 * inside `container` (offsets are relative to the container, which must be `position: relative`).
 * Re-measures on `key` change and on resize. First placement is instant (data-ready="false").
 */
export function useSlidingIndicator(container: RefObject<HTMLElement | null>, key: unknown, axis: "x" | "y" | "both" = "y") {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  const measure = useCallback(() => {
    const c = container.current; if (!c) return;
    const el = c.querySelector<HTMLElement>('[data-active="true"]');
    if (!el || !el.offsetParent) { setBox(null); return; }
    const cr = c.getBoundingClientRect(), r = el.getBoundingClientRect();
    // absolute children are placed from the padding box → subtract the container's border
    setBox({ x: r.left - cr.left - c.clientLeft + c.scrollLeft, y: r.top - cr.top - c.clientTop + c.scrollTop, w: r.width, h: r.height });
  }, [container]);
  useIsoLayoutEffect(() => { measure(); }, [measure, key]);
  useEffect(() => {
    const c = container.current; if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(c);
    return () => ro.disconnect();
  }, [container, measure]);
  useEffect(() => { if (box && !ready) { const h = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(h); } }, [box, ready]);
  const style: CSSProperties = box
    ? { transform: `translate3d(${axis === "y" ? 0 : box.x}px, ${axis === "x" ? 0 : box.y}px, 0)`, width: axis === "y" ? undefined : box.w, height: axis === "x" ? undefined : box.h, opacity: 1 }
    : { opacity: 0 };
  return { style, ready, visible: !!box };
}

/* ─────────── FLIP reorder ─────────── */
/**
 * Smoothly reflows children marked `data-flip="<id>"` inside `container` whenever `signature`
 * changes (e.g. the joined order of ids). Positions are measured relative to the container so
 * page scrolling never triggers an animation (`viewport` = measure on screen, for fixed stacks
 * like toasts that grow from the bottom). Transform-only.
 */
export function useFlip(container: RefObject<HTMLElement | null>, signature: string, viewport = false) {
  const prev = useRef<Map<string, number>>(new Map());
  useIsoLayoutEffect(() => {
    const c = container.current; if (!c) return;
    const top = viewport ? 0 : c.getBoundingClientRect().top;
    const next = new Map<string, number>();
    const els = c.querySelectorAll<HTMLElement>("[data-flip]");
    els.forEach((el) => next.set(el.dataset.flip!, el.getBoundingClientRect().top - top));
    if (prev.current.size && !isReducedMotion()) {
      els.forEach((el) => {
        const before = prev.current.get(el.dataset.flip!);
        const after = next.get(el.dataset.flip!);
        if (before == null || after == null || Math.abs(before - after) < 1) return;
        el.animate([{ transform: `translate3d(0, ${before - after}px, 0)` }, { transform: "none" }], { duration: DURATION.slow, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      });
    }
    prev.current = next;
  }, [container, signature]);
}

/* ─────────── Drag & drop lift ─────────── */
/** Use in onDragStart: replaces the flat browser ghost with a lifted, shadowed clone of `el`. */
export function liftDragImage(e: React.DragEvent, el: HTMLElement | null) {
  if (!el || isReducedMotion() || !e.dataTransfer?.setDragImage) return;
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.classList.add("m-drag-ghost");
  Object.assign(ghost.style, { position: "fixed", top: "-1000px", left: "0px", width: `${r.width}px`, pointerEvents: "none", zIndex: "9999" });
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, Math.max(0, e.clientX - r.left), Math.max(0, e.clientY - r.top));
  setTimeout(() => ghost.remove(), 0);
}

/* ─────────── View Transitions ─────────── */
type VTDoc = Document & { startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void>; ready: Promise<void> } };
let vtNavigating = false;
/** True while a navigation is running inside a view transition (the CSS fallback skips its own animation). */
export const isVTNavigating = () => vtNavigating;
export const supportsViewTransitions = () => typeof document !== "undefined" && typeof (document as VTDoc).startViewTransition === "function";

let pendingNav: (() => void) | null = null;
/** Call when the new route has rendered (Shell does this on pathname change). */
export function resolvePendingNavigation() { const p = pendingNav; pendingNav = null; p?.(); }

/**
 * Navigate inside document.startViewTransition: the old main content fades up, the new one rises
 * in, nav indicators morph. Falls back to a plain push (CSS page-in plays) when unsupported or
 * when motion is reduced. Never blocks more than 450ms waiting for the new route.
 */
export function navigateWithTransition(push: () => void) {
  const doc = document as VTDoc;
  if (!doc.startViewTransition || isReducedMotion()) { push(); return; }
  const root = document.documentElement;
  root.classList.add("vt-route");
  vtNavigating = true;
  const vt = doc.startViewTransition(() => new Promise<void>((resolve) => {
    const timer = setTimeout(() => { pendingNav = null; resolve(); }, 450);
    pendingNav = () => { clearTimeout(timer); resolve(); };
    push();
  }));
  vt.finished.finally(() => { root.classList.remove("vt-route"); vtNavigating = false; });
}

/**
 * Theme switch as a circular reveal growing from the clicked control (`origin`), cross-fading
 * the whole page. `apply` must change the theme synchronously (attribute on <html>).
 */
export function runThemeTransition(apply: () => void, origin?: { x: number; y: number } | HTMLElement | null) {
  const doc = document as VTDoc;
  if (!doc.startViewTransition || isReducedMotion()) { apply(); return; }
  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  if (origin instanceof HTMLElement) { const r = origin.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  else if (origin) { x = origin.x; y = origin.y; }
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const root = document.documentElement;
  root.classList.add("vt-theme");
  const vt = doc.startViewTransition(() => { flushSync(apply); });
  vt.ready.then(() => {
    root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, { duration: 460, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" });
  }).catch(() => {});
  vt.finished.finally(() => root.classList.remove("vt-theme"));
}
