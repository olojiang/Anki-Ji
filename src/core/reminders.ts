/** Pure logic for study reminders + the per-user study preferences that live beside them. */
import { dayIndex, dayStart } from "./time";

export interface StudyPrefs {
  autoOptimize: boolean;
  goalType: "cards" | "minutes";
  goalTarget: number;
  reminderEnabled: boolean;
  reminderHour: number; // 0–23, user's timezone
  reminderQuiet: boolean; // skip when nothing is due
}

export function normalizePrefs(p: Partial<Record<keyof StudyPrefs, unknown>> | null | undefined): StudyPrefs {
  const i = p ?? {};
  const target = Number(i.goalTarget);
  const hour = Number(i.reminderHour);
  return {
    autoOptimize: typeof i.autoOptimize === "boolean" ? i.autoOptimize : true,
    goalType: i.goalType === "minutes" ? "minutes" : "cards",
    goalTarget: Number.isFinite(target) && i.goalTarget !== null && i.goalTarget !== "" ? Math.min(1000, Math.max(0, Math.round(target))) : 30,
    reminderEnabled: typeof i.reminderEnabled === "boolean" ? i.reminderEnabled : false,
    reminderHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 20,
    reminderQuiet: typeof i.reminderQuiet === "boolean" ? i.reminderQuiet : true,
  };
}

/** Most recent instant ≤ now at which the local clock in `tz` read `hour`:00. */
export function lastReminderAt(now: Date, tz: string, hour: number): Date {
  // A "day" that starts at `hour` — reuse the study-day helpers with rollover = reminder hour.
  return dayStart(dayIndex(now, tz, hour), tz, hour);
}

export interface ReminderCheck {
  enabled: boolean; hour: number; tz: string; lastSentAt: Date | null; now: Date;
  dueCount: number; quietIfNothingDue: boolean; subscriptions: number;
}

/**
 * Hourly-but-works-daily: send if the most recent reminder moment has passed and nothing was sent since.
 * With a once-daily cron, users whose hour is later than the cron time get yesterday's reminder on the next run.
 */
export function shouldSendReminder(c: ReminderCheck): boolean {
  if (!c.enabled || c.subscriptions <= 0) return false;
  if (c.quietIfNothingDue && c.dueCount <= 0) return false;
  const moment = lastReminderAt(c.now, c.tz, c.hour);
  return !c.lastSentAt || c.lastSentAt.getTime() < moment.getTime();
}

export function reminderPayload(locale: "zh" | "en", due: number) {
  const zh = locale !== "en";
  return {
    title: zh ? "Anki-ji · 该复习了" : "Anki-ji · Time to review",
    body: due > 0 ? (zh ? `今天有 ${due} 张卡片待复习` : `${due} cards are due today`) : (zh ? "保持每日学习习惯，来复习一会儿吧" : "Keep your streak going — a few minutes today"),
    url: "/",
    tag: "anki-ji-daily",
  };
}
