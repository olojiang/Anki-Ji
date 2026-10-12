import { describe, it, expect } from "vitest";
import { streak, forecast, trueRetention, cardDistribution } from "@/core/stats";

describe("stats", () => {
  it("streak counts consecutive study days ending today or yesterday", () => {
    expect(streak([10, 11, 12], 12)).toBe(3);
    expect(streak([10, 11, 12], 13)).toBe(3); // not studied yet today
    expect(streak([10, 12], 12)).toBe(1);
    expect(streak([5], 12)).toBe(0);
    expect(streak([], 12)).toBe(0);
  });
  it("forecast puts overdue cards on today and ignores new/suspended", () => {
    const f = forecast([{ state: "review", dueDay: 8, suspended: false }, { state: "review", dueDay: 10, suspended: false }, { state: "review", dueDay: 12, suspended: false }, { state: "new", dueDay: null, suspended: false }, { state: "review", dueDay: 11, suspended: true }], 10, 5);
    expect(f).toEqual([2, 0, 1, 0, 0]);
  });
  it("true retention = passed reviews / all reviews of mature-state cards", () => {
    expect(trueRetention([{ state: "review", rating: 3 }, { state: "review", rating: 1 }, { state: "review", rating: 4 }, { state: "new", rating: 1 }])).toBeCloseTo(2 / 3);
    expect(trueRetention([])).toBeNull();
  });
  it("card distribution", () => {
    expect(cardDistribution([{ state: "new", scheduledDays: 0, suspended: false }, { state: "review", scheduledDays: 30, suspended: false }, { state: "review", scheduledDays: 3, suspended: false }, { state: "learning", scheduledDays: 0, suspended: false }, { state: "review", scheduledDays: 3, suspended: true }]))
      .toEqual({ new: 1, learning: 1, young: 1, mature: 1, suspended: 1 });
  });
});
