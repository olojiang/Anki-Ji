import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  MOTION_PREFS, MOTION_STORAGE_KEY, DURATION, parseMotionPref, resolveReducedMotion, loadMotionPref, saveMotionPref, motionBootScript,
  swipeThreshold, swipeProgress, swipeDirectionRating, swipeOutcome, swipeRotation, rubberBand, velocityFrom, exitVector,
  easeOutCubic, countUpAt, staggerDelay, sheetShouldDismiss, indicatorOffset,
} from "@/core/motion";

const memStore = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };

describe("motion preference", () => {
  it("parses and defaults to following the system", () => {
    expect(MOTION_PREFS).toEqual(["system", "reduce", "full"]);
    expect(parseMotionPref("reduce")).toBe("reduce");
    expect(parseMotionPref("full")).toBe("full");
    expect(parseMotionPref(null)).toBe("system");
    expect(parseMotionPref("fast")).toBe("system");
    expect(parseMotionPref(42)).toBe("system");
  });
  it("resolves reduced motion: explicit choice beats the OS, system follows it", () => {
    expect(resolveReducedMotion("system", true)).toBe(true);
    expect(resolveReducedMotion("system", false)).toBe(false);
    expect(resolveReducedMotion("reduce", false)).toBe(true);
    expect(resolveReducedMotion("full", true)).toBe(false);
  });
  it("persists to storage and survives a reload", () => {
    const s = memStore();
    expect(loadMotionPref(s)).toBe("system");
    saveMotionPref(s, "reduce");
    expect(s.m.get(MOTION_STORAGE_KEY)).toBe("reduce");
    expect(loadMotionPref(s)).toBe("reduce");
    saveMotionPref(s, "system");
    expect(loadMotionPref(s)).toBe("system");
  });
  it("tolerates missing / throwing / corrupted storage", () => {
    expect(loadMotionPref(null)).toBe("system");
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(loadMotionPref(bad)).toBe("system");
    expect(() => saveMotionPref(bad, "full")).not.toThrow();
    const s = memStore(); s.m.set(MOTION_STORAGE_KEY, "garbage");
    expect(loadMotionPref(s)).toBe("system");
  });
  it("boot script sets data-motion before paint and is valid JS", () => {
    expect(motionBootScript).toContain(MOTION_STORAGE_KEY);
    expect(motionBootScript).toContain("data-motion");
    expect(motionBootScript).toContain("prefers-reduced-motion");
    expect(() => new Function(motionBootScript)).not.toThrow();
  });
  it("CSS tokens match the TS durations and reduced-motion is wired", () => {
    const css = readFileSync("src/app/motion.css", "utf8");
    expect(css).toContain(`--dur-fast: ${DURATION.fast}ms`);
    expect(css).toContain(`--dur-base: ${DURATION.base}ms`);
    expect(css).toContain(`--dur-slow: ${DURATION.slow}ms`);
    expect(css).toContain('[data-motion="reduce"]');
    expect(css).toContain("prefers-reduced-motion");
  });
});

describe("swipe math", () => {
  it("threshold scales with width but is clamped", () => {
    expect(swipeThreshold(390)).toBeCloseTo(390 * 0.25, 5);
    expect(swipeThreshold(200)).toBe(72);
    expect(swipeThreshold(2000)).toBe(140);
  });
  it("progress ramps 0..1 and saturates", () => {
    expect(swipeProgress(0, 100)).toBe(0);
    expect(swipeProgress(50, 100)).toBe(0.5);
    expect(swipeProgress(-50, 100)).toBe(0.5);
    expect(swipeProgress(300, 100)).toBe(1);
  });
  it("direction maps right → Good(3), left → Again(1)", () => {
    expect(swipeDirectionRating(10)).toBe(3);
    expect(swipeDirectionRating(-10)).toBe(1);
    expect(swipeDirectionRating(0)).toBeNull();
  });
  it("commits past threshold, or on a fast fling in the same direction", () => {
    expect(swipeOutcome({ dx: 120, vx: 0, threshold: 100 })).toBe(3);
    expect(swipeOutcome({ dx: -101, vx: 0, threshold: 100 })).toBe(1);
    expect(swipeOutcome({ dx: 60, vx: 0.1, threshold: 100 })).toBeNull(); // released early → rubber-band back
    expect(swipeOutcome({ dx: 60, vx: 0.9, threshold: 100 })).toBe(3); // fling
    expect(swipeOutcome({ dx: -50, vx: -0.8, threshold: 100 })).toBe(1);
    expect(swipeOutcome({ dx: 60, vx: -0.9, threshold: 100 })).toBeNull(); // flung back toward centre
    expect(swipeOutcome({ dx: 20, vx: 2, threshold: 100 })).toBeNull(); // too short to be intentional
    expect(swipeOutcome({ dx: 120, vx: -1.2, threshold: 100 })).toBeNull(); // past threshold but flung back
  });
  it("rotation is proportional and clamped", () => {
    expect(swipeRotation(0, 400)).toBe(0);
    expect(swipeRotation(200, 400)).toBeCloseTo(6, 5);
    expect(swipeRotation(-200, 400)).toBeCloseTo(-6, 5);
    expect(swipeRotation(5000, 400)).toBe(12);
  });
  it("rubber band resists and never exceeds the limit", () => {
    expect(rubberBand(0, 100)).toBe(0);
    const a = rubberBand(50, 100), b = rubberBand(200, 100), c = rubberBand(10000, 100);
    expect(a).toBeGreaterThan(0); expect(a).toBeLessThan(50);
    expect(b).toBeGreaterThan(a); expect(c).toBeLessThan(100);
    expect(rubberBand(-50, 100)).toBeCloseTo(-a, 8);
  });
  it("velocity uses the recent window of samples (px/ms)", () => {
    expect(velocityFrom([])).toBe(0);
    expect(velocityFrom([{ x: 0, t: 0 }])).toBe(0);
    expect(velocityFrom([{ x: 0, t: 0 }, { x: 100, t: 100 }])).toBeCloseTo(1, 5);
    // old samples outside the 100ms window are ignored
    expect(velocityFrom([{ x: 0, t: 0 }, { x: 0, t: 400 }, { x: 50, t: 450 }, { x: 100, t: 500 }])).toBeCloseTo(1, 5);
  });
  it("exit vectors encode direction + tint per rating", () => {
    expect(exitVector(1)).toMatchObject({ tone: "again" });
    expect(exitVector(1).x).toBeLessThan(0);
    expect(exitVector(3).x).toBeGreaterThan(0);
    expect(exitVector(4).y).toBeLessThan(0);
    expect(Math.abs(exitVector(4).x)).toBe(0);
    const h = exitVector(2); // small nudge, not a fling, no shake
    expect(h.tone).toBe("hard");
    expect(Math.abs(h.x)).toBeLessThan(0.2); expect(Math.abs(h.y)).toBeLessThan(0.2);
  });
});

describe("misc motion helpers", () => {
  it("easeOutCubic and count-up", () => {
    expect(easeOutCubic(0)).toBe(0); expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(countUpAt(0, 100, 0)).toBe(0);
    expect(countUpAt(0, 100, 1)).toBe(100);
    expect(countUpAt(0, 100, 2)).toBe(100);
    expect(countUpAt(10, 0, 1)).toBe(0);
    expect(Number.isInteger(countUpAt(0, 7, 0.33))).toBe(true);
  });
  it("stagger delay is capped so long lists don't drag", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3, 30)).toBe(90);
    expect(staggerDelay(100, 30, 10)).toBe(300);
  });
  it("sheet drag-to-dismiss by distance or flick", () => {
    expect(sheetShouldDismiss(30, 0.1, 600)).toBe(false);
    expect(sheetShouldDismiss(200, 0.1, 600)).toBe(true);
    expect(sheetShouldDismiss(40, 0.8, 600)).toBe(true);
    expect(sheetShouldDismiss(40, -0.8, 600)).toBe(false);
  });
  it("indicator offset for an equal-width tab bar", () => {
    expect(indicatorOffset(0, 5)).toBe(0);
    expect(indicatorOffset(2, 5)).toBe(200);
    expect(indicatorOffset(-1, 5)).toBeNull();
  });
});
