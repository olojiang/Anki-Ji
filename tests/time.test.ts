import { describe, it, expect } from "vitest";
import { tzOffsetMinutes, dayIndex, dayStart, weekdayOf, addMinutes } from "@/core/time";

describe("time / day rollover", () => {
  it("computes timezone offsets", () => {
    expect(tzOffsetMinutes(new Date("2026-10-12T00:00:00Z"), "Asia/Shanghai")).toBe(480);
    expect(tzOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "America/New_York")).toBe(-300);
    expect(tzOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "America/New_York")).toBe(-240);
    expect(tzOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "UTC")).toBe(0);
  });

  it("rolls the day over at 4am local time by default", () => {
    // 2026-10-12 03:59 Shanghai = 2026-10-11T19:59Z -> still the 11th's study day
    const before = dayIndex(new Date("2026-10-11T19:59:00Z"), "Asia/Shanghai", 4);
    const after = dayIndex(new Date("2026-10-11T20:00:00Z"), "Asia/Shanghai", 4);
    expect(after - before).toBe(1);
    // midnight does not roll over
    const lateNight = dayIndex(new Date("2026-10-11T16:30:00Z"), "Asia/Shanghai", 4); // 00:30 local on 12th
    expect(lateNight).toBe(before);
  });

  it("dayStart is the inverse of dayIndex", () => {
    for (const tz of ["Asia/Shanghai", "America/New_York", "Europe/London", "UTC"]) {
      const d = dayIndex(new Date("2026-03-08T15:00:00Z"), tz, 4);
      const s = dayStart(d, tz, 4);
      expect(dayIndex(s, tz, 4)).toBe(d);
      expect(dayIndex(new Date(s.getTime() - 1000), tz, 4)).toBe(d - 1);
    }
  });

  it("dayStart in Shanghai is 04:00 local", () => {
    const d = dayIndex(new Date("2026-10-12T05:00:00Z"), "Asia/Shanghai", 4);
    expect(dayStart(d, "Asia/Shanghai", 4).toISOString()).toBe("2026-10-11T20:00:00.000Z");
  });

  it("weekday of a day index (0=Sunday)", () => {
    const d = dayIndex(new Date("2026-10-12T05:00:00Z"), "UTC", 0); // Monday
    expect(weekdayOf(d)).toBe(1);
  });

  it("addMinutes", () => {
    expect(addMinutes(new Date("2026-01-01T00:00:00Z"), 90).toISOString()).toBe("2026-01-01T01:30:00.000Z");
  });
});
