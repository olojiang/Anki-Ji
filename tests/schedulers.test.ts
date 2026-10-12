import { describe, it, expect } from "vitest";
import { fsrs, generatorParameters, createEmptyCard, Rating as FR, default_w } from "ts-fsrs";
import { createScheduler, newCardState } from "@/core/scheduler";
import { defaultDeckConfig, normalizeConfig } from "@/core/config";
import type { DeckConfig, Rating, SchedState } from "@/core/types";

const t0 = new Date("2026-10-12T02:00:00Z");
const mins = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60000);
const cfg = (over: Partial<DeckConfig> = {}) => normalizeConfig({ ...defaultDeckConfig(), fuzz: false, loadBalance: false, ...over });

describe("config", () => {
  it("normalizes and clamps user supplied values", () => {
    const c = normalizeConfig({ desiredRetention: 2, newPerDay: -5, learningSteps: [1, "x" as unknown as number, 10] });
    expect(c.desiredRetention).toBeLessThanOrEqual(0.99);
    expect(c.newPerDay).toBe(0);
    expect(c.learningSteps).toEqual([1, 10]);
    expect(c.algorithm).toBe("fsrs");
  });
});

describe("FSRS-6 scheduler (ts-fsrs adapter)", () => {
  it("matches the official ts-fsrs implementation step for step", () => {
    const c = cfg();
    const s = createScheduler(c);
    const ref = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: c.maxInterval, enable_fuzz: false, enable_short_term: true, learning_steps: ["1m", "10m"], relearning_steps: ["10m"] }));
    let ours: SchedState = newCardState();
    let theirs = createEmptyCard(t0);
    let now = t0;
    const ratings: Rating[] = [3, 3, 3, 1, 3, 4, 2, 3];
    for (const r of ratings) {
      ours = s.next(ours, r, now);
      theirs = ref.next(theirs, now, r as unknown as FR.Again).card;
      expect(ours.stability).toBeCloseTo(theirs.stability, 6);
      expect(ours.difficulty).toBeCloseTo(theirs.difficulty, 6);
      expect(ours.due.getTime()).toBe(theirs.due.getTime());
      expect(ours.reps).toBe(theirs.reps);
      expect(ours.lapses).toBe(theirs.lapses);
      now = new Date(Math.max(ours.due.getTime(), now.getTime() + 60000));
    }
  });

  it("uses the published FSRS-6 default initial stabilities", () => {
    const s = createScheduler(cfg({ learningSteps: [] }));
    const p = s.preview(newCardState(), t0);
    expect(p[1].stability).toBeCloseTo(default_w[0], 4);
    expect(p[2].stability).toBeCloseTo(default_w[1], 4);
    expect(p[3].stability).toBeCloseTo(default_w[2], 4);
    expect(p[4].stability).toBeCloseTo(default_w[3], 4);
    expect(default_w.length).toBe(21); // FSRS-6 has 21 parameters
  });

  it("follows learning steps for new cards", () => {
    const s = createScheduler(cfg({ learningSteps: [1, 10] }));
    const p = s.preview(newCardState(), t0);
    expect(mins(t0, p[1].due)).toBe(1);
    expect(mins(t0, p[3].due)).toBe(10);
    expect(p[3].state).toBe("learning");
    expect(p[4].state).toBe("review");
    expect(p[4].scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it("retrievability is about the desired retention when a review falls due", () => {
    const s = createScheduler(cfg({ learningSteps: [], desiredRetention: 0.9 }));
    const card = s.next(newCardState(), 3, t0);
    const r = s.retrievability(card, card.due)!;
    expect(r).toBeGreaterThan(0.85);
    expect(r).toBeLessThan(0.95);
    expect(s.retrievability(newCardState(), t0)).toBeNull();
  });

  it("higher desired retention gives shorter intervals", () => {
    const lo = createScheduler(cfg({ learningSteps: [], desiredRetention: 0.8 })).next(newCardState(), 3, t0);
    const hi = createScheduler(cfg({ learningSteps: [], desiredRetention: 0.95 })).next(newCardState(), 3, t0);
    expect(hi.scheduledDays).toBeLessThan(lo.scheduledDays);
  });

  it("accepts optimized weights", () => {
    const w = [...default_w]; w[2] = 10;
    const card = createScheduler(cfg({ learningSteps: [], fsrsWeights: w })).next(newCardState(), 3, t0);
    expect(card.stability).toBeCloseTo(10, 4);
  });

  it("caps intervals at maxInterval", () => {
    const s = createScheduler(cfg({ learningSteps: [], maxInterval: 3 }));
    let c = s.next(newCardState(), 4, t0);
    for (let i = 0; i < 5; i++) c = s.next(c, 4, c.due);
    expect(c.scheduledDays).toBeLessThanOrEqual(3);
  });
});

describe("SM-2 scheduler (Anki legacy)", () => {
  const s = createScheduler(cfg({ algorithm: "sm2", learningSteps: [1, 10], relearningSteps: [10] }));
  const review = (ivl: number, ease = 2.5): SchedState => ({ ...newCardState(), state: "review", scheduledDays: ivl, ease, reps: 5, due: t0, lastReview: new Date(t0.getTime() - ivl * 86400000) });

  it("walks learning steps and graduates", () => {
    let c = s.next(newCardState(), 3, t0);
    expect(c.state).toBe("learning");
    expect(mins(t0, c.due)).toBe(10);
    c = s.next(c, 3, c.due);
    expect(c.state).toBe("review");
    expect(c.scheduledDays).toBe(1);
    expect(c.ease).toBe(2.5);
  });

  it("again resets to the first step, easy graduates immediately", () => {
    expect(mins(t0, s.next(newCardState(), 1, t0).due)).toBe(1);
    const e = s.next(newCardState(), 4, t0);
    expect(e.state).toBe("review");
    expect(e.scheduledDays).toBe(4);
  });

  it("review intervals follow ease factor", () => {
    expect(s.next(review(10), 3, t0).scheduledDays).toBe(25);
    expect(s.next(review(10), 2, t0).scheduledDays).toBe(12);
    expect(s.next(review(10), 4, t0).scheduledDays).toBe(33);
    expect(s.next(review(10), 2, t0).ease).toBeCloseTo(2.35);
    expect(s.next(review(10), 4, t0).ease).toBeCloseTo(2.65);
  });

  it("lapses go to relearning and reduce ease, never below 1.3", () => {
    const l = s.next(review(10), 1, t0);
    expect(l.state).toBe("relearning");
    expect(l.lapses).toBe(1);
    expect(l.ease).toBeCloseTo(2.3);
    expect(mins(t0, l.due)).toBe(10);
    const back = s.next(l, 3, l.due);
    expect(back.state).toBe("review");
    expect(back.scheduledDays).toBe(1);
    expect(s.next(review(10, 1.3), 1, t0).ease).toBe(1.3);
  });

  it("hard interval is always at least one day longer", () => {
    expect(s.next(review(1), 2, t0).scheduledDays).toBeGreaterThanOrEqual(2);
  });
});

describe("Leitner scheduler", () => {
  const s = createScheduler(cfg({ algorithm: "leitner", leitnerIntervals: [1, 2, 4, 8, 16] }));
  it("moves cards up and down boxes", () => {
    let c = s.next(newCardState(), 3, t0);
    expect(c.box).toBe(1); expect(c.scheduledDays).toBe(1);
    c = s.next(c, 3, c.due);
    expect(c.box).toBe(2); expect(c.scheduledDays).toBe(2);
    c = s.next(c, 4, c.due);
    expect(c.box).toBe(4); expect(c.scheduledDays).toBe(8);
    c = s.next(c, 2, c.due);
    expect(c.box).toBe(4);
    c = s.next(c, 4, c.due); c = s.next(c, 4, c.due);
    expect(c.box).toBe(5); expect(c.scheduledDays).toBe(16);
    c = s.next(c, 1, c.due);
    expect(c.box).toBe(1); expect(c.lapses).toBe(1);
  });
});

describe("preview", () => {
  it("returns an outcome for every rating without mutating the card", () => {
    for (const algorithm of ["fsrs", "sm2", "leitner"] as const) {
      const s = createScheduler(cfg({ algorithm }));
      const card = newCardState();
      const p = s.preview(card, t0);
      expect(Object.keys(p).sort()).toEqual(["1", "2", "3", "4"]);
      expect(card.reps).toBe(0);
      expect(p[4].due.getTime()).toBeGreaterThanOrEqual(p[3].due.getTime());
    }
  });
});
