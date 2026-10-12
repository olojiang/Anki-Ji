import type { DeckConfig } from "./types";

export function defaultDeckConfig(): DeckConfig {
  return {
    algorithm: "fsrs",
    newPerDay: 20,
    reviewsPerDay: 200,
    learningSteps: [1, 10],
    relearningSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    easyBonus: 1.3,
    hardInterval: 1.2,
    intervalModifier: 1,
    lapseNewInterval: 0,
    desiredRetention: 0.9,
    maxInterval: 36500,
    fsrsWeights: null,
    enableShortTerm: true,
    leitnerIntervals: [1, 2, 4, 8, 16, 32, 64],
    fuzz: true,
    loadBalance: true,
    easyDays: [1, 1, 1, 1, 1, 1, 1],
    buryNew: true,
    buryReview: true,
    leechThreshold: 8,
    leechAction: "suspend",
    newOrder: "manual",
    reviewOrder: "due",
    newReviewMix: "mix",
    learnAheadMinutes: 20,
  };
}

const num = (v: unknown, d: number, min: number, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const int = (v: unknown, d: number, min: number, max: number) => Math.round(num(v, d, min, max));
const steps = (v: unknown, d: number[]) =>
  Array.isArray(v) ? v.map(Number).filter((x) => Number.isFinite(x) && x > 0).map((x) => Math.min(x, 60 * 24 * 30)) : d;
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

/** Merge user input over defaults, dropping anything invalid. Single source of truth for config validation. */
export function normalizeConfig(input: Partial<DeckConfig> | null | undefined): DeckConfig {
  const d = defaultDeckConfig();
  const i = (input ?? {}) as Record<string, unknown>;
  const weights = Array.isArray(i.fsrsWeights) && (i.fsrsWeights.length === 21 || i.fsrsWeights.length === 19 || i.fsrsWeights.length === 17)
    && i.fsrsWeights.every((x) => Number.isFinite(Number(x))) ? (i.fsrsWeights as unknown[]).map(Number) : null;
  const easyDays = Array.isArray(i.easyDays) && i.easyDays.length === 7 ? i.easyDays.map((x) => num(x, 1, 0, 1)) : d.easyDays;
  const leitner = steps(i.leitnerIntervals, d.leitnerIntervals).map((x) => Math.max(1, Math.round(x)));
  return {
    algorithm: pick(i.algorithm, ["fsrs", "sm2", "leitner"] as const, d.algorithm),
    newPerDay: int(i.newPerDay, d.newPerDay, 0, 9999),
    reviewsPerDay: int(i.reviewsPerDay, d.reviewsPerDay, 0, 99999),
    learningSteps: steps(i.learningSteps, d.learningSteps),
    relearningSteps: steps(i.relearningSteps, d.relearningSteps),
    graduatingInterval: int(i.graduatingInterval, d.graduatingInterval, 1, 365),
    easyInterval: int(i.easyInterval, d.easyInterval, 1, 365),
    startingEase: num(i.startingEase, d.startingEase, 1.3, 5),
    easyBonus: num(i.easyBonus, d.easyBonus, 1, 5),
    hardInterval: num(i.hardInterval, d.hardInterval, 0.5, 2),
    intervalModifier: num(i.intervalModifier, d.intervalModifier, 0.1, 5),
    lapseNewInterval: num(i.lapseNewInterval, d.lapseNewInterval, 0, 1),
    desiredRetention: num(i.desiredRetention, d.desiredRetention, 0.7, 0.99),
    maxInterval: int(i.maxInterval, d.maxInterval, 1, 36500),
    fsrsWeights: weights,
    enableShortTerm: bool(i.enableShortTerm, d.enableShortTerm),
    leitnerIntervals: leitner.length ? leitner : d.leitnerIntervals,
    fuzz: bool(i.fuzz, d.fuzz),
    loadBalance: bool(i.loadBalance, d.loadBalance),
    easyDays,
    buryNew: bool(i.buryNew, d.buryNew),
    buryReview: bool(i.buryReview, d.buryReview),
    leechThreshold: int(i.leechThreshold, d.leechThreshold, 0, 99),
    leechAction: pick(i.leechAction, ["suspend", "tag"] as const, d.leechAction),
    newOrder: pick(i.newOrder, ["manual", "created", "random"] as const, d.newOrder),
    reviewOrder: pick(i.reviewOrder, ["due", "retrievability", "random"] as const, d.reviewOrder),
    newReviewMix: pick(i.newReviewMix, ["mix", "newFirst", "reviewFirst"] as const, d.newReviewMix),
    learnAheadMinutes: int(i.learnAheadMinutes, d.learnAheadMinutes, 0, 240),
  };
}
