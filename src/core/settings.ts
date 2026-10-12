import { isValidTimeZone } from "./time";

/** Theme ids (visual only). "system" follows the OS light/dark preference. */
export const THEME_IDS = ["light", "dark", "gold", "orange", "redblack", "ink", "paper", "system"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface UserSettings { timezone: string; rolloverHour: number; locale: "zh" | "en"; theme: ThemeId }

export function normalizeSettings(s: Partial<UserSettings> | null | undefined): UserSettings {
  const i = (s ?? {}) as Record<string, unknown>;
  const tz = typeof i.timezone === "string" && isValidTimeZone(i.timezone) ? i.timezone : "Asia/Shanghai";
  const h = Number(i.rolloverHour);
  return {
    timezone: tz,
    rolloverHour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : 4,
    locale: i.locale === "en" ? "en" : "zh",
    theme: (THEME_IDS as readonly string[]).includes(i.theme as string) ? (i.theme as ThemeId) : "light",
  };
}
