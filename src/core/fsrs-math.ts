/**
 * Allocation-free FSRS-6 memory model (same formulas as ts-fsrs / fsrs-rs), used by the
 * workload simulator where ts-fsrs's object-based API would be too slow.
 * All functions take the 21-parameter weight vector `w`.
 */
import { default_w } from "ts-fsrs";

export const S_MIN = 1e-3;
export const S_MAX = 36500;
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** Upgrade 17/19-parameter (FSRS-4.5/5) vectors to FSRS-6 shape; null → defaults. */
export function fsrs6Weights(w: readonly number[] | null | undefined): number[] {
  if (!w || !w.length) return [...default_w];
  if (w.length >= 21) return w.slice(0, 21).map(Number);
  const out = [...w].map(Number);
  if (out.length === 17) out.push(0, 0); // no short-term params
  if (out.length === 19) out.push(0, 0.5); // FSRS-5 decay 0.5
  return out.length === 21 ? out : [...default_w];
}

export interface Curve { decay: number; factor: number }
export function curve(w: readonly number[]): Curve {
  const decay = -w[20];
  return { decay, factor: Math.exp(Math.log(0.9) / decay) - 1 };
}

/** Probability of recall after `t` days at stability `s`. */
export function retrievability(c: Curve, t: number, s: number): number {
  return Math.pow(1 + (c.factor * t) / s, c.decay);
}

/** Interval (days, unrounded) at which retrievability falls to `r`. */
export function intervalFor(c: Curve, s: number, r: number): number {
  return (s / c.factor) * (Math.pow(r, 1 / c.decay) - 1);
}

export const initStability = (w: readonly number[], g: number) => Math.max(w[g - 1], 0.1);
export const initDifficulty = (w: readonly number[], g: number) => w[4] - Math.exp((g - 1) * w[5]) + 1;

export function nextDifficulty(w: readonly number[], d: number, g: number): number {
  const delta = -w[6] * (g - 3);
  const next = d + (delta * (10 - d)) / 9;
  return clamp(w[7] * initDifficulty(w, 4) + (1 - w[7]) * next, 1, 10);
}

export function recallStability(w: readonly number[], d: number, s: number, r: number, g: number): number {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return clamp(s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hard * easy), S_MIN, S_MAX);
}

export function forgetStability(w: readonly number[], d: number, s: number, r: number): number {
  const f = clamp(w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]), S_MIN, S_MAX);
  const sMin = s / Math.exp(w[17] * w[18]);
  return Math.min(Math.max(sMin, S_MIN), f);
}

export function shortTermStability(w: readonly number[], s: number, g: number): number {
  let sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (g - 3 + w[18]));
  if (g >= 2) sinc = Math.max(sinc, 1);
  return clamp(s * sinc, S_MIN, S_MAX);
}
