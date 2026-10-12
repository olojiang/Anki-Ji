import { describe, it, expect } from "vitest";
import { goalProgress, goalStreak } from "@/core/goal";
import { capDuration, LONG_ANSWER_MS, summarizeDurations, slowCards } from "@/core/response-time";

describe("daily goal", () => {
  it("measures progress in cards or minutes", () => {
    expect(goalProgress({ type: "cards", target: 40 }, { reviews: 10, ms: 0 })).toEqual({ done: 10, target: 40, ratio: 0.25, met: false });
    expect(goalProgress({ type: "minutes", target: 10 }, { reviews: 3, ms: 15 * 60000 })).toEqual({ done: 15, target: 10, ratio: 1, met: true });
    expect(goalProgress({ type: "cards", target: 0 }, { reviews: 3, ms: 0 }).met).toBe(true);
  });
  it("counts consecutive days the goal was met; today only counts once met", () => {
    const goal = { type: "cards" as const, target: 10 };
    const days = new Map([[100, { reviews: 12, ms: 0 }], [99, { reviews: 10, ms: 0 }], [98, { reviews: 3, ms: 0 }], [97, { reviews: 50, ms: 0 }]]);
    expect(goalStreak(days, 100, goal)).toBe(2);
    expect(goalStreak(days, 101, goal)).toBe(2); // today not met yet → streak still alive from yesterday
    expect(goalStreak(days, 102, goal)).toBe(0);
    days.set(101, { reviews: 4, ms: 0 });
    expect(goalStreak(days, 101, goal)).toBe(2);
  });
});

describe("response time", () => {
  it("caps idle answers when summing study time", () => {
    expect(LONG_ANSWER_MS).toBe(60000);
    expect(capDuration(5000)).toBe(5000);
    expect(capDuration(600000)).toBe(60000);
    expect(capDuration(-3)).toBe(0);
  });
  it("summarizes durations by rating and flags very long answers without affecting ratings", () => {
    const s = summarizeDurations([
      { rating: 3, durationMs: 4000 }, { rating: 3, durationMs: 6000 }, { rating: 1, durationMs: 20000 }, { rating: 4, durationMs: 2000 },
      { rating: 3, durationMs: 300000 }, { rating: 2, durationMs: 0 },
    ]);
    expect(s.count).toBe(5); // 0 ms entries (imports / unknown) are ignored
    expect(s.longCount).toBe(1);
    expect(s.medianMs).toBe(6000);
    expect(s.totalMs).toBe(4000 + 6000 + 20000 + 2000 + 60000);
    expect(s.byRating[1].medianMs).toBe(20000);
    expect(s.byRating[3].count).toBe(3);
    expect(s.histogram.reduce((a, b) => a + b, 0)).toBe(5);
  });
  it("finds cards that are consistently slow", () => {
    const rows = [
      ...[1, 2, 3].map(() => ({ cardId: 1, durationMs: 40000 })),
      ...[1, 2, 3].map(() => ({ cardId: 2, durationMs: 5000 })),
      ...[1, 2, 3].map(() => ({ cardId: 3, durationMs: 4000 })),
      { cardId: 4, durationMs: 90000 }, // single review → not "consistently" slow
    ];
    const out = slowCards(rows, 5000);
    expect(out.map((x) => x.cardId)).toEqual([1]);
    expect(out[0].medianMs).toBe(40000);
  });
});
