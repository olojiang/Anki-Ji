/** Pure gating rules for automatic FSRS parameter re-training. */
export interface AutoOptOptions { minReviews: number; minDays: number }
export const AUTO_OPT_DEFAULTS: AutoOptOptions = { minReviews: 400, minDays: 7 };

export interface AutoOptState {
  enabled: boolean;
  algorithm: string;
  /** Reviews logged for the deck tree since the last optimization attempt (all reviews if never optimized). */
  reviewsSinceLast: number;
  /** When parameters were last (re)trained or reverted for this deck; null = never. */
  lastAt: Date | null;
  now: Date;
}

export function shouldAutoOptimize(s: AutoOptState, o: AutoOptOptions = AUTO_OPT_DEFAULTS): { run: boolean; reason: string } {
  if (!s.enabled) return { run: false, reason: "disabled" };
  if (s.algorithm !== "fsrs") return { run: false, reason: "not_fsrs" };
  if (s.lastAt && s.now.getTime() - s.lastAt.getTime() < o.minDays * 86_400_000) return { run: false, reason: "too_soon" };
  if (s.reviewsSinceLast < o.minReviews) return { run: false, reason: "too_few_reviews" };
  return { run: true, reason: "ok" };
}

export interface Metrics { logLoss: number; rmse: number }

/** Adopt candidate parameters only if they fit the review log better: lower log-loss and RMSE not worse. */
export function shouldAdopt(current: Metrics | null, candidate: Metrics): boolean {
  if (!Number.isFinite(candidate.logLoss) || !Number.isFinite(candidate.rmse)) return false;
  if (!current || !Number.isFinite(current.logLoss) || !Number.isFinite(current.rmse)) return true;
  return candidate.logLoss < current.logLoss - 1e-9 && candidate.rmse <= current.rmse + 1e-9;
}
