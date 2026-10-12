/**
 * FSRS workload / knowledge simulator (a compact port of the idea behind fsrs-rs `simulate`):
 * Monte-Carlo replay of the user's collection for `days` days at a given desired retention.
 * Pure + deterministic for a seed, so it is unit-testable and safe to run on the server.
 */
import { curve, fsrs6Weights, forgetStability, initDifficulty, initStability, intervalFor, nextDifficulty, recallStability, retrievability } from "./fsrs-math";

/** Card memory state relative to today (day 0). `lastDay` ≤ 0, `dueDay` may be negative (overdue). */
export interface SimCard { s: number; d: number; lastDay: number; dueDay: number }
export interface SimCosts { learn: number; pass: number; fail: number } // seconds
export interface SimInput {
  w: readonly number[] | null;
  desiredRetention: number;
  days: number;
  newLimit: number;
  reviewLimit: number;
  maxInterval: number;
  newCards: number;
  cards: SimCard[];
  costs?: SimCosts;
  firstRatingProb?: readonly number[]; // again, hard, good, easy (first review of a new card)
  reviewRatingProb?: readonly number[]; // hard, good, easy (given the card was recalled)
  seed?: number;
  /** Simulated population is scaled into [minSimCards, maxSimCards] for speed/smoothness; results are scaled back. */
  minSimCards?: number;
  maxSimCards?: number;
}
export interface SimWeek { reviews: number; minutes: number; memorized: number }
export interface SimResult {
  retention: number;
  reviewsPerDay: number[];
  newPerDay: number[];
  secondsPerDay: number[];
  weekly: SimWeek[];
  totalReviews: number;
  totalSeconds: number;
  avgReviewsPerDay: number;
  avgMinutesPerDay: number;
  memorizedEnd: number;
  /** Seconds of study per card memorized at the end — the quantity "optimal retention" minimises. */
  secondsPerMemorized: number | null;
}
export type SimSummary = Omit<SimResult, "reviewsPerDay" | "newPerDay" | "secondsPerDay">;

export const RETENTION_GRID: number[] = Array.from({ length: 28 }, (_, i) => Math.round((0.7 + i * 0.01) * 100) / 100);
export const DEFAULT_COSTS: SimCosts = { learn: 25, pass: 8, fail: 25 };
export const DEFAULT_FIRST_RATING_PROB = [0.24, 0.094, 0.495, 0.171];
export const DEFAULT_REVIEW_RATING_PROB = [0.224, 0.632, 0.144];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cumulative = (p: readonly number[]) => {
  const sum = p.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return p.map((x) => (acc += x / sum));
};
const sample = (cum: number[], u: number) => {
  for (let i = 0; i < cum.length - 1; i++) if (u < cum[i]) return i;
  return cum.length - 1;
};

export function simulate(input: SimInput): SimResult {
  const days = Math.max(1, Math.floor(input.days));
  const w = fsrs6Weights(input.w);
  const c = curve(w);
  const dr = input.desiredRetention;
  const costs = input.costs ?? DEFAULT_COSTS;
  const first = cumulative(input.firstRatingProb ?? DEFAULT_FIRST_RATING_PROB);
  const revp = cumulative(input.reviewRatingProb ?? DEFAULT_REVIEW_RATING_PROB);
  const maxIvl = Math.max(1, input.maxInterval);
  const rng = mulberry32(input.seed ?? 42);

  const realNew = Math.max(0, Math.min(input.newCards, input.newLimit * days));
  const pop = input.cards.length + realNew;
  const reviewsPerDay = new Array<number>(days).fill(0);
  const newPerDay = new Array<number>(days).fill(0);
  const secondsPerDay = new Array<number>(days).fill(0);
  if (pop === 0) {
    return { retention: dr, reviewsPerDay, newPerDay, secondsPerDay, weekly: Array.from({ length: Math.ceil(days / 7) }, () => ({ reviews: 0, minutes: 0, memorized: 0 })), totalReviews: 0, totalSeconds: 0, avgReviewsPerDay: 0, avgMinutesPerDay: 0, memorizedEnd: 0, secondsPerMemorized: null };
  }
  const minSim = input.minSimCards ?? 1500;
  const maxSim = input.maxSimCards ?? 4000;
  // f = simulated cards per real card
  const f = pop < minSim ? Math.ceil(minSim / pop) : pop > maxSim ? maxSim / pop : 1;

  const existing: SimCard[] = [];
  if (f >= 1) {
    for (const card of input.cards) for (let k = 0; k < f; k++) existing.push(card);
  } else {
    input.cards.forEach((card, i) => { if (Math.floor((i + 1) * f) > Math.floor(i * f)) existing.push(card); });
  }
  const newPool = input.newCards * f;
  const newLimit = input.newLimit * f;
  const reviewLimit = input.reviewLimit * f;
  const cap = existing.length + Math.ceil(Math.min(newPool, newLimit * days)) + 2;
  const S = new Float64Array(cap), D = new Float64Array(cap), L = new Int32Array(cap);
  let n = 0;
  const buckets: number[][] = Array.from({ length: days }, () => []);
  for (const e of existing) {
    S[n] = Math.max(e.s, 0.01); D[n] = Math.min(10, Math.max(1, e.d || 5)); L[n] = Math.min(0, Math.round(e.lastDay));
    const due = Math.max(0, Math.round(e.dueDay));
    if (due < days) buckets[due].push(n);
    n++;
  }

  const schedule = (i: number, t: number) => {
    const ivl = Math.min(maxIvl, Math.max(1, Math.round(intervalFor(c, S[i], dr))));
    const due = t + ivl;
    if (due < days) buckets[due].push(i);
  };

  const weekly: SimWeek[] = [];
  let wkReviews = 0, wkSeconds = 0, wkDays = 0;
  let revCarry = 0, newCarry = 0, newLeft = newPool;
  for (let t = 0; t < days; t++) {
    revCarry += reviewLimit;
    const allowed = Math.floor(revCarry + 1e-9);
    revCarry -= allowed;
    const bucket = buckets[t];
    let done = 0, secs = 0;
    for (let k = 0; k < bucket.length; k++) {
      const i = bucket[k];
      if (done >= allowed) { if (t + 1 < days) buckets[t + 1].push(i); continue; }
      done++;
      const r = retrievability(c, t - L[i], S[i]);
      if (rng() < r) {
        const g = 2 + sample(revp, rng());
        S[i] = recallStability(w, D[i], S[i], r, g);
        D[i] = nextDifficulty(w, D[i], g);
        secs += costs.pass;
      } else {
        S[i] = forgetStability(w, D[i], S[i], r);
        D[i] = nextDifficulty(w, D[i], 1);
        secs += costs.fail;
      }
      L[i] = t;
      schedule(i, t);
    }
    buckets[t] = [];
    newCarry += newLimit;
    let add = Math.min(Math.floor(newCarry + 1e-9), Math.floor(newLeft + 1e-9));
    newCarry -= Math.floor(newCarry + 1e-9);
    add = Math.max(0, add);
    newLeft -= add;
    for (let k = 0; k < add; k++) {
      const g = 1 + sample(first, rng());
      S[n] = initStability(w, g); D[n] = Math.min(10, Math.max(1, initDifficulty(w, g))); L[n] = t;
      schedule(n, t);
      n++;
    }
    secs += add * costs.learn;
    reviewsPerDay[t] = done / f; newPerDay[t] = add / f; secondsPerDay[t] = secs / f;
    wkReviews += done; wkSeconds += secs; wkDays++;
    if (wkDays === 7 || t === days - 1) {
      let mem = 0;
      for (let i = 0; i < n; i++) mem += retrievability(c, t - L[i], S[i]);
      weekly.push({ reviews: wkReviews / wkDays / f, minutes: wkSeconds / wkDays / 60 / f, memorized: mem / f });
      wkReviews = 0; wkSeconds = 0; wkDays = 0;
    }
  }
  const totalReviews = reviewsPerDay.reduce((a, b) => a + b, 0);
  const totalSeconds = secondsPerDay.reduce((a, b) => a + b, 0);
  const memorizedEnd = weekly[weekly.length - 1].memorized;
  return {
    retention: dr, reviewsPerDay, newPerDay, secondsPerDay, weekly, totalReviews, totalSeconds,
    avgReviewsPerDay: totalReviews / days, avgMinutesPerDay: totalSeconds / days / 60, memorizedEnd,
    secondsPerMemorized: memorizedEnd > 1e-6 ? totalSeconds / memorizedEnd : null,
  };
}

/**
 * Run the simulator over the retention grid. The recommended "optimal retention" minimises
 * study time per memorized card (lightly smoothed to damp Monte-Carlo noise).
 */
export function sweepRetention(input: Omit<SimInput, "desiredRetention">, grid: number[] = RETENTION_GRID): { points: SimSummary[]; optimal: number | null } {
  const points: SimSummary[] = grid.map((r) => {
    const { reviewsPerDay: _a, newPerDay: _b, secondsPerDay: _c, ...rest } = simulate({ ...input, desiredRetention: r });
    void _a; void _b; void _c;
    return rest;
  });
  const cost = points.map((p) => p.secondsPerMemorized);
  if (cost.some((x) => x == null)) return { points, optimal: null };
  const v = cost as number[];
  const smooth = v.map((x, i) => (i === 0 || i === v.length - 1 ? x : (v[i - 1] + 2 * x + v[i + 1]) / 4));
  let best = 0;
  for (let i = 1; i < smooth.length; i++) if (smooth[i] < smooth[best]) best = i;
  return { points, optimal: grid[best] };
}
