import { describe, it, expect } from "vitest";
import { lastReminderAt, shouldSendReminder, reminderPayload, normalizePrefs } from "@/core/reminders";

const tz = "Asia/Shanghai"; // UTC+8
const base = { enabled: true, hour: 20, tz, lastSentAt: null as Date | null, dueCount: 5, quietIfNothingDue: true, subscriptions: 1 };

describe("reminder schedule", () => {
  it("finds the most recent local reminder hour", () => {
    // 2026-10-12 13:00 UTC = 21:00 Shanghai → today 20:00 local = 12:00 UTC
    expect(lastReminderAt(new Date("2026-10-12T13:00:00Z"), tz, 20).toISOString()).toBe("2026-10-12T12:00:00.000Z");
    // 2026-10-12 11:00 UTC = 19:00 Shanghai → yesterday's 20:00 local
    expect(lastReminderAt(new Date("2026-10-12T11:00:00Z"), tz, 20).toISOString()).toBe("2026-10-11T12:00:00.000Z");
  });
  it("handles DST zones", () => {
    // New York, 2026-11-01 is DST end; 09:00 local on Nov 2 is 14:00 UTC
    expect(lastReminderAt(new Date("2026-11-02T15:00:00Z"), "America/New_York", 9).toISOString()).toBe("2026-11-02T14:00:00.000Z");
    expect(lastReminderAt(new Date("2026-10-30T15:00:00Z"), "America/New_York", 9).toISOString()).toBe("2026-10-30T13:00:00.000Z");
  });
});

describe("who gets a reminder", () => {
  const now = new Date("2026-10-12T13:00:00Z"); // 21:00 local
  it("sends once the hour has passed and nothing was sent since", () => {
    expect(shouldSendReminder({ ...base, now })).toBe(true);
    expect(shouldSendReminder({ ...base, now, lastSentAt: new Date("2026-10-12T12:05:00Z") })).toBe(false);
    expect(shouldSendReminder({ ...base, now, lastSentAt: new Date("2026-10-11T12:05:00Z") })).toBe(true);
  });
  it("a once-daily cron still reaches users whose hour is later than the cron time (sent next run, never twice)", () => {
    const cron = new Date("2026-10-12T04:00:00Z"); // 12:00 local, before the 20:00 reminder hour
    expect(shouldSendReminder({ ...base, now: cron, lastSentAt: new Date("2026-10-10T04:00:00Z") })).toBe(true); // yesterday's 20:00 not yet covered
    expect(shouldSendReminder({ ...base, now: cron, lastSentAt: new Date("2026-10-11T12:30:00Z") })).toBe(false);
  });
  it("stays quiet when disabled, unsubscribed, or nothing is due (if asked)", () => {
    expect(shouldSendReminder({ ...base, now, enabled: false })).toBe(false);
    expect(shouldSendReminder({ ...base, now, subscriptions: 0 })).toBe(false);
    expect(shouldSendReminder({ ...base, now, dueCount: 0 })).toBe(false);
    expect(shouldSendReminder({ ...base, now, dueCount: 0, quietIfNothingDue: false })).toBe(true);
  });
  it("builds a localized payload", () => {
    expect(reminderPayload("en", 12).body).toContain("12");
    expect(reminderPayload("zh", 3).title).toMatch(/Anki-ji/);
    expect(reminderPayload("en", 0).body).not.toContain("0 cards");
    expect(reminderPayload("en", 5).url).toBe("/");
  });
  it("normalizes stored preferences", () => {
    expect(normalizePrefs({})).toEqual({ autoOptimize: true, goalType: "cards", goalTarget: 30, reminderEnabled: false, reminderHour: 20, reminderQuiet: true });
    expect(normalizePrefs({ goalType: "minutes", goalTarget: 9999, reminderHour: 25, autoOptimize: false }).goalTarget).toBe(1000);
    expect(normalizePrefs({ reminderHour: 25 }).reminderHour).toBe(20);
    expect(normalizePrefs({ goalType: "bogus" }).goalType).toBe("cards");
  });
});
