import { get_fuzz_range } from "ts-fsrs";
import { weekdayOf } from "./time";

/** Fuzz range shared by every algorithm (same ranges as Anki / FSRS). */
export function fuzzRange(interval: number, maxInterval: number, elapsedDays = 0): { min: number; max: number } {
  if (interval < 2.5) return { min: interval, max: interval };
  const r = get_fuzz_range(interval, elapsedDays, maxInterval);
  return { min: r.min_ivl, max: r.max_ivl };
}

export interface PickOptions {
  interval: number;
  maxInterval: number;
  today: number; // study-day index
  loadOn: (day: number) => number; // number of reviews already due on that day
  easyDays: number[]; // weight per weekday
  balance: boolean;
  fuzz: boolean;
  rng?: () => number;
  elapsedDays?: number;
}

/**
 * Load balancer + Easy Days: inside the fuzz range pick the day with the lowest
 * (load+1)/weight. Ties go to the day closest to the ideal interval.
 */
export function pickInterval(o: PickOptions): number {
  if (!o.fuzz && !o.balance) return o.interval;
  const { min, max } = fuzzRange(o.interval, o.maxInterval, o.elapsedDays ?? 0);
  if (min === max) return min;
  if (!o.balance) return min + Math.floor((o.rng ?? Math.random)() * (max - min + 1)) % (max - min + 1);
  let best = o.interval, bestScore = Infinity;
  for (let d = min; d <= max; d++) {
    const day = o.today + d;
    const w = Math.max(o.easyDays[weekdayOf(day)] ?? 1, 0.01);
    const score = (o.loadOn(day) + 1) / w;
    const closer = Math.abs(d - o.interval) < Math.abs(best - o.interval);
    if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && closer)) { best = d; bestScore = score; }
  }
  return best;
}
