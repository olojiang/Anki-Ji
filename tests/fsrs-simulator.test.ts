import { describe, it, expect } from "vitest";
import { FSRSAlgorithm, generatorParameters, default_w } from "ts-fsrs";
import * as m from "@/core/fsrs-math";
import { simulate, sweepRetention, RETENTION_GRID, type SimInput } from "@/core/simulator";

const w = [...default_w];
const alg = new FSRSAlgorithm(generatorParameters({ w, enable_short_term: true }));

describe("FSRS-6 math port", () => {
  it("matches ts-fsrs for init, difficulty, stability and the forgetting curve", () => {
    for (const g of [1, 2, 3, 4] as const) {
      expect(m.initStability(w, g)).toBeCloseTo(alg.init_stability(g), 6);
      expect(m.initDifficulty(w, g)).toBeCloseTo(alg.init_difficulty(g), 6);
    }
    const c = m.curve(w);
    for (const [d, s, t] of [[5, 3, 2], [2.5, 40, 31], [8.7, 0.8, 1], [1, 300, 400]]) {
      const r = m.retrievability(c, t, s);
      expect(r).toBeCloseTo(alg.forgetting_curve(t, s), 6);
      for (const g of [2, 3, 4] as const) {
        expect(m.nextDifficulty(w, d, g)).toBeCloseTo(alg.next_difficulty(d, g), 6);
        expect(m.recallStability(w, d, s, r, g)).toBeCloseTo(alg.next_recall_stability(d, s, r, g), 4);
        expect(m.shortTermStability(w, s, g)).toBeCloseTo(alg.next_short_term_stability(s, g), 4);
      }
      expect(m.forgetStability(w, d, s, r)).toBeCloseTo(alg.next_state({ difficulty: d, stability: s }, t, 1).stability, 4);
    }
  });
  it("interval for retention 0.9 equals stability, and shrinks as retention rises", () => {
    const c = m.curve(w);
    expect(m.intervalFor(c, 10, 0.9)).toBeCloseTo(10, 6);
    expect(m.intervalFor(c, 10, 0.95)).toBeLessThan(10);
    expect(m.intervalFor(c, 10, 0.8)).toBeGreaterThan(10);
    expect(m.retrievability(c, m.intervalFor(c, 17, 0.83), 17)).toBeCloseTo(0.83, 6);
  });
  it("upgrades older weight vectors to 21 parameters", () => {
    expect(m.fsrs6Weights(null)).toHaveLength(21);
    expect(m.fsrs6Weights(w.slice(0, 19))[20]).toBe(0.5);
    expect(m.fsrs6Weights(w.slice(0, 17)).slice(17)).toEqual([0, 0, 0, 0.5]);
  });
});

const base: Omit<SimInput, "desiredRetention"> = { w, days: 365, newLimit: 20, reviewLimit: 9999, maxInterval: 36500, newCards: 2000, cards: [], seed: 7 };

describe("workload simulator", () => {
  it("is deterministic for a seed and does nothing with an empty collection", () => {
    const a = simulate({ ...base, desiredRetention: 0.9 });
    const b = simulate({ ...base, desiredRetention: 0.9 });
    expect(a.totalReviews).toBe(b.totalReviews);
    const empty = simulate({ ...base, newCards: 0, desiredRetention: 0.9 });
    expect(empty.totalReviews).toBe(0);
    expect(empty.memorizedEnd).toBe(0);
  });
  it("respects the new-card limit and the size of the new-card pool", () => {
    const r = simulate({ ...base, newCards: 300, desiredRetention: 0.9 });
    expect(Math.max(...r.newPerDay)).toBeLessThanOrEqual(20 + 1e-9);
    expect(r.newPerDay.reduce((a, b) => a + b, 0)).toBeCloseTo(300, 6);
    expect(r.newPerDay[15]).toBe(0);
  });
  it("respects the review limit", () => {
    const r = simulate({ ...base, newLimit: 50, reviewLimit: 60, desiredRetention: 0.95 });
    expect(Math.max(...r.reviewsPerDay)).toBeLessThanOrEqual(60 + 1e-9);
  });
  it("reviews an existing card for the first time on its due day", () => {
    const r = simulate({ ...base, newCards: 0, cards: [{ s: 30, d: 5, lastDay: -20, dueDay: 10 }], desiredRetention: 0.9 });
    expect(r.reviewsPerDay.slice(0, 10).every((x) => x === 0)).toBe(true);
    expect(r.reviewsPerDay[10]).toBeGreaterThan(0);
    expect(r.memorizedEnd).toBeGreaterThan(0.5);
  });
  it("higher desired retention costs more reviews and keeps more knowledge", () => {
    const lo = simulate({ ...base, desiredRetention: 0.75 });
    const hi = simulate({ ...base, desiredRetention: 0.95 });
    expect(hi.totalReviews).toBeGreaterThan(lo.totalReviews * 1.3);
    expect(hi.memorizedEnd).toBeGreaterThan(lo.memorizedEnd);
  });
  it("sweeps 0.70–0.97 and recommends the retention with the least study time per memorized card", () => {
    const sw = sweepRetention(base);
    expect(sw.points.map((p) => p.retention)).toEqual(RETENTION_GRID);
    expect(RETENTION_GRID[0]).toBe(0.7);
    expect(RETENTION_GRID[RETENTION_GRID.length - 1]).toBe(0.97);
    expect(sw.optimal).not.toBeNull();
    expect(sw.optimal!).toBeGreaterThanOrEqual(0.7);
    expect(sw.optimal!).toBeLessThan(0.9); // high retention is far costlier per memorized card
    const at = (r: number) => sw.points.find((x) => x.retention === r)!.secondsPerMemorized!;
    expect(at(sw.optimal!)).toBeLessThan(at(0.95));
    const p = sw.points;
    // workload grows with retention (allowing tiny Monte-Carlo wiggle)
    for (let i = 3; i < p.length; i++) expect(p[i].avgReviewsPerDay).toBeGreaterThan(p[i - 3].avgReviewsPerDay);
    expect(p[0].weekly.length).toBeGreaterThan(50);
  });
  it("returns no recommendation when there is nothing to learn", () => {
    expect(sweepRetention({ ...base, newCards: 0 }).optimal).toBeNull();
  });
  it("is fast enough to sweep a large collection on request", () => {
    const cards = Array.from({ length: 20000 }, (_, i) => ({ s: 1 + (i % 200), d: 3 + (i % 6), lastDay: -(i % 30), dueDay: (i % 60) - 5 }));
    const c0 = process.cpuUsage(); // CPU time, not wall clock: robust on a busy CI box
    const sw = sweepRetention({ ...base, cards, newCards: 5000 });
    const c = process.cpuUsage(c0);
    expect((c.user + c.system) / 1000).toBeLessThan(4000); // ~0.8 s on an idle machine
    expect(sw.points[0].memorizedEnd).toBeGreaterThan(1000); // scaled back to the real collection size
  });
});
