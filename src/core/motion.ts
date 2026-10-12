/**
 * Motion system — pure logic (no DOM), unit-tested in tests/motion.test.ts.
 *
 *  - Preference: "system" (follow prefers-reduced-motion, default) | "reduce" | "full".
 *    Stored per device in localStorage[ak-motion]; resolved to html[data-motion="reduce"|"full"]
 *    by motionBootScript before first paint (no flash of animation for reduce users).
 *  - Durations mirror the CSS tokens in src/app/motion.css (keep in sync; a test checks it).
 *  - Swipe / sheet / count-up math used by the study screen and primitives.
 */

export const MOTION_PREFS = ["system", "reduce", "full"] as const;
export type MotionPref = (typeof MOTION_PREFS)[number];
export const MOTION_STORAGE_KEY = "ak-motion";

/** Duration tokens (ms). fast = presses/hover, base = enter/exit, slow = card / page / emphasis. */
export const DURATION = { fast: 120, base: 200, slow: 320 } as const;
/** Easing tokens (cubic-bezier) — same values as the CSS custom properties. */
export const EASE = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  emphasized: "cubic-bezier(0.16, 1, 0.3, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
  spring: "cubic-bezier(0.34, 1.36, 0.64, 1)",
} as const;

export function parseMotionPref(v: unknown): MotionPref {
  return typeof v === "string" && (MOTION_PREFS as readonly string[]).includes(v) ? (v as MotionPref) : "system";
}

/** true → reduce all motion to opacity (or none). */
export function resolveReducedMotion(pref: MotionPref, systemReduces: boolean): boolean {
  return pref === "reduce" || (pref === "system" && systemReduces);
}

export interface KVStore { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function loadMotionPref(store: KVStore | null | undefined): MotionPref {
  try { return parseMotionPref(store?.getItem(MOTION_STORAGE_KEY)); } catch { return "system"; }
}

export function saveMotionPref(store: KVStore | null | undefined, pref: MotionPref): void {
  try { store?.setItem(MOTION_STORAGE_KEY, parseMotionPref(pref)); } catch { /* private mode etc. */ }
}

/** Inline boot script: resolves the preference to html[data-motion] before paint. */
export const motionBootScript = `try{var p=localStorage.getItem('${MOTION_STORAGE_KEY}');if(p!=='reduce'&&p!=='full')p='system';var r=p==='reduce'||(p==='system'&&matchMedia('(prefers-reduced-motion: reduce)').matches);document.documentElement.setAttribute('data-motion',r?'reduce':'full')}catch(e){}`;

/* ─────────── Swipe (study card) ─────────── */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Distance (px) a card must travel to commit a rating: 25% of the card width, clamped to 72..140. */
export function swipeThreshold(width: number): number {
  return clamp(width * 0.25, 72, 140);
}

/** 0..1 — drives the rating label + tint as the threshold nears. */
export function swipeProgress(dx: number, threshold: number): number {
  return threshold <= 0 ? 1 : Math.min(1, Math.abs(dx) / threshold);
}

/** Right → Good (3), left → Again (1). */
export function swipeDirectionRating(dx: number): 1 | 3 | null {
  return dx > 0 ? 3 : dx < 0 ? 1 : null;
}

/**
 * Decide what a released swipe does. Commits when past the threshold (unless flung back toward
 * the centre), or on an intentional fling (≥ minDx in the same direction, ≥ flingVelocity px/ms).
 * null → rubber-band back to rest.
 */
export function swipeOutcome({ dx, vx, threshold, minDx = 36, flingVelocity = 0.5 }: { dx: number; vx: number; threshold: number; minDx?: number; flingVelocity?: number }): 1 | 3 | null {
  const dir = Math.sign(dx);
  if (!dir) return null;
  const towardCentre = Math.sign(vx) === -dir && Math.abs(vx) >= flingVelocity;
  if (Math.abs(dx) >= threshold) return towardCentre ? null : swipeDirectionRating(dx);
  if (Math.abs(dx) >= minDx && Math.sign(vx) === dir && Math.abs(vx) >= flingVelocity) return swipeDirectionRating(dx);
  return null;
}

/** Card tilt while dragging: ±12° max, 6° at half the card width. */
export function swipeRotation(dx: number, width: number, max = 12): number {
  if (!width) return 0;
  return clamp((dx / width) * max, -max, max);
}

/** iOS-style rubber band: follows at first, asymptotically approaches `limit`. */
export function rubberBand(offset: number, limit: number, c = 0.55): number {
  if (!offset || limit <= 0) return 0;
  const x = Math.abs(offset);
  return Math.sign(offset) * (1 - 1 / ((x * c) / limit + 1)) * limit;
}

/** Release velocity (px/ms) over the last `windowMs` of pointer samples. */
export function velocityFrom(samples: { x: number; t: number }[], windowMs = 100): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const recent = samples.filter((s) => last.t - s.t <= windowMs);
  const first = recent.length >= 2 ? recent[0] : samples[samples.length - 2];
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

export type RatingTone = "again" | "hard" | "good" | "easy";
/**
 * Where the card goes when rated. x / y are fractions of the travel distance (UI multiplies by
 * viewport size), r = degrees. Again: left · Hard: small settle-down nudge (no shake) ·
 * Good: right · Easy: up.
 */
export function exitVector(rating: number): { x: number; y: number; r: number; scale: number; tone: RatingTone } {
  switch (rating) {
    case 1: return { x: -1, y: 0.04, r: -8, scale: 0.98, tone: "again" };
    case 2: return { x: -0.04, y: 0.06, r: 0, scale: 0.94, tone: "hard" };
    case 4: return { x: 0, y: -1, r: 0, scale: 0.98, tone: "easy" };
    default: return { x: 1, y: 0.04, r: 8, scale: 0.98, tone: "good" };
  }
}

/* ─────────── Misc ─────────── */

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/** Integer value of a count-up animation at progress t (0..1). */
export function countUpAt(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * easeOutCubic(t));
}

/** Stagger delay for list item i (ms), capped so long lists still settle quickly. */
export function staggerDelay(i: number, step = 30, maxItems = 10): number {
  return Math.min(Math.max(0, i), maxItems) * step;
}

/** Mobile bottom sheet: dismiss when dragged down 25% of its height (≥ 120px cap) or flicked down. */
export function sheetShouldDismiss(dy: number, vy: number, height: number): boolean {
  if (dy <= 0) return false;
  if (vy >= 0.5 && dy > 24) return true;
  return dy >= Math.min(120, height * 0.25);
}

/** translateX (% of the indicator's own width) for an equal-column tab bar; null = no active tab. */
export function indicatorOffset(index: number, count: number): number | null {
  return index < 0 || index >= count ? null : index * 100;
}
