import { describe, it, expect } from "vitest";
import { fuzzRange, pickInterval } from "@/core/balance";
import { isLeech } from "@/core/leech";
import { finalizeOutcome } from "@/core/answer";
import { defaultDeckConfig, normalizeConfig } from "@/core/config";
import { newCardState } from "@/core/scheduler";
import { dayIndex, dayStart } from "@/core/time";

describe("fuzz range", () => {
  it("does not fuzz short intervals", () => {
    expect(fuzzRange(1, 36500)).toEqual({ min: 1, max: 1 });
    expect(fuzzRange(2, 36500)).toEqual({ min: 2, max: 2 });
  });
  it("widens with the interval (Anki/FSRS ranges)", () => {
    const r = fuzzRange(30, 36500);
    expect(r.min).toBeLessThan(30); expect(r.max).toBeGreaterThan(30);
    const big = fuzzRange(200, 36500);
    expect(big.max - big.min).toBeGreaterThan(r.max - r.min);
    expect(fuzzRange(100, 101).max).toBeLessThanOrEqual(101);
  });
});

describe("load balancing", () => {
  const easy = [1, 1, 1, 1, 1, 1, 1];
  it("picks the least loaded day in the fuzz range", () => {
    const load = (d: number) => (d === 9 ? 0 : 50);
    expect(pickInterval({ interval: 10, maxInterval: 36500, today: 0, loadOn: load, easyDays: easy, balance: true, fuzz: true, rng: () => 0.5 })).toBe(9);
  });
  it("prefers the original interval when loads tie", () => {
    expect(pickInterval({ interval: 10, maxInterval: 36500, today: 0, loadOn: () => 5, easyDays: easy, balance: true, fuzz: true, rng: () => 0.5 })).toBe(10);
  });
  it("avoids easy days (weight 0) when possible", () => {
    // today = day index 3 (Sunday); interval 10 -> day 13 (Wednesday). make every Wednesday an easy day.
    const ed = [1, 1, 1, 0, 1, 1, 1];
    const got = pickInterval({ interval: 10, maxInterval: 36500, today: 3, loadOn: () => 0, easyDays: ed, balance: true, fuzz: true, rng: () => 0.5 });
    expect(got).not.toBe(10);
    expect(Math.abs(got - 10)).toBeLessThanOrEqual(2);
  });
  it("random fuzz without balancing stays inside the range", () => {
    for (const x of [0, 0.3, 0.999]) {
      const v = pickInterval({ interval: 40, maxInterval: 36500, today: 0, loadOn: () => 0, easyDays: easy, balance: false, fuzz: true, rng: () => x });
      const r = fuzzRange(40, 36500);
      expect(v).toBeGreaterThanOrEqual(r.min); expect(v).toBeLessThanOrEqual(r.max);
    }
  });
  it("leaves the interval alone when both are off", () => {
    expect(pickInterval({ interval: 40, maxInterval: 36500, today: 0, loadOn: () => 0, easyDays: easy, balance: false, fuzz: false })).toBe(40);
  });
});

describe("leech detection (Anki rule)", () => {
  it("flags at the threshold and every half-threshold after", () => {
    expect(isLeech(7, 8)).toBe(false);
    expect(isLeech(8, 8)).toBe(true);
    expect(isLeech(10, 8)).toBe(false);
    expect(isLeech(12, 8)).toBe(true);
    expect(isLeech(16, 8)).toBe(true);
    expect(isLeech(3, 0)).toBe(false);
  });
});

describe("finalizeOutcome", () => {
  const tz = "Asia/Shanghai";
  const now = new Date("2026-10-12T02:00:00Z");
  const today = dayIndex(now, tz, 4);
  it("snaps review cards to the start of their due study day and applies balancing", () => {
    const cfg = normalizeConfig({ ...defaultDeckConfig(), loadBalance: true, fuzz: true });
    const out = { ...newCardState(), state: "review" as const, scheduledDays: 10, due: new Date(now.getTime() + 10 * 86400000) };
    const f = finalizeOutcome(out, { cfg, now, tz, rollover: 4, loadOn: (d) => (d === today + 9 ? 0 : 99), rng: () => 0.5 });
    expect(f.scheduledDays).toBe(9);
    expect(f.due.getTime()).toBe(dayStart(today + 9, tz, 4).getTime());
  });
  it("keeps exact due times for (re)learning steps", () => {
    const cfg = normalizeConfig(defaultDeckConfig());
    const due = new Date(now.getTime() + 600000);
    const out = { ...newCardState(), state: "learning" as const, due };
    expect(finalizeOutcome(out, { cfg, now, tz, rollover: 4, loadOn: () => 0 }).due).toEqual(due);
  });
});
