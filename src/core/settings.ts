import { isValidTimeZone } from "./time";

export interface UserSettings { timezone: string; rolloverHour: number; locale: "zh" | "en"; theme: "light" | "dark" | "system" }

export function normalizeSettings(s: Partial<UserSettings> | null | undefined): UserSettings {
  const i = (s ?? {}) as Record<string, unknown>;
  const tz = typeof i.timezone === "string" && isValidTimeZone(i.timezone) ? i.timezone : "Asia/Shanghai";
  const h = Number(i.rolloverHour);
  return {
    timezone: tz,
    rolloverHour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : 4,
    locale: i.locale === "en" ? "en" : "zh",
    theme: i.theme === "dark" || i.theme === "system" ? i.theme : "light",
  };
}
