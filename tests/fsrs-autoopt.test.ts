import { describe, it, expect } from "vitest";
import { shouldAutoOptimize, shouldAdopt, AUTO_OPT_DEFAULTS } from "@/core/autoopt";

const now = new Date("2026-10-12T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

describe("auto-optimize gating", () => {
  it("defaults to 400 new reviews and 7 days", () => {
    expect(AUTO_OPT_DEFAULTS).toEqual({ minReviews: 400, minDays: 7 });
  });
  it("needs the setting on and an FSRS deck", () => {
    expect(shouldAutoOptimize({ enabled: false, algorithm: "fsrs", reviewsSinceLast: 5000, lastAt: null, now }).run).toBe(false);
    expect(shouldAutoOptimize({ enabled: true, algorithm: "sm2", reviewsSinceLast: 5000, lastAt: null, now }).reason).toBe("not_fsrs");
  });
  it("first optimization only needs enough reviews", () => {
    expect(shouldAutoOptimize({ enabled: true, algorithm: "fsrs", reviewsSinceLast: 399, lastAt: null, now })).toEqual({ run: false, reason: "too_few_reviews" });
    expect(shouldAutoOptimize({ enabled: true, algorithm: "fsrs", reviewsSinceLast: 400, lastAt: null, now }).run).toBe(true);
  });
  it("later optimizations need both ≥N new reviews and ≥7 days since the last attempt", () => {
    expect(shouldAutoOptimize({ enabled: true, algorithm: "fsrs", reviewsSinceLast: 1000, lastAt: daysAgo(6.9), now })).toEqual({ run: false, reason: "too_soon" });
    expect(shouldAutoOptimize({ enabled: true, algorithm: "fsrs", reviewsSinceLast: 399, lastAt: daysAgo(30), now }).reason).toBe("too_few_reviews");
    expect(shouldAutoOptimize({ enabled: true, algorithm: "fsrs", reviewsSinceLast: 400, lastAt: daysAgo(7), now }).run).toBe(true);
  });
  it("honours custom thresholds", () => {
    expect(shouldAutoOptimize({ enabled: true, algorithm: "fsrs", reviewsSinceLast: 100, lastAt: daysAgo(2), now }, { minReviews: 100, minDays: 1 }).run).toBe(true);
  });
});

describe("adopting new parameters", () => {
  it("adopts only when log-loss improves and RMSE does not get worse", () => {
    expect(shouldAdopt({ logLoss: 0.40, rmse: 0.05 }, { logLoss: 0.38, rmse: 0.04 })).toBe(true);
    expect(shouldAdopt({ logLoss: 0.40, rmse: 0.05 }, { logLoss: 0.38, rmse: 0.06 })).toBe(false);
    expect(shouldAdopt({ logLoss: 0.40, rmse: 0.05 }, { logLoss: 0.41, rmse: 0.03 })).toBe(false);
    expect(shouldAdopt({ logLoss: 0.40, rmse: 0.05 }, { logLoss: 0.40, rmse: 0.05 })).toBe(false);
  });
  it("adopts when the current parameters cannot be evaluated", () => {
    expect(shouldAdopt(null, { logLoss: 0.5, rmse: 0.1 })).toBe(true);
    expect(shouldAdopt({ logLoss: 0.4, rmse: 0.05 }, { logLoss: NaN, rmse: 0.01 })).toBe(false);
  });
});
