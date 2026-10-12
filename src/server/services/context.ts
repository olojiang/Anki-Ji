import { getUser } from "../repo/users";
import { dayIndex, tzOffsetMinutes } from "@/core/time";
import { normalizeSettings } from "@/core/settings";

export async function userContext(uid: number, now = new Date()) {
  const u = await getUser(uid);
  const settings = normalizeSettings(u?.settings);
  return { settings, now, tz: settings.timezone, rollover: settings.rolloverHour, today: dayIndex(now, settings.timezone, settings.rolloverHour), offset: tzOffsetMinutes(now, settings.timezone) };
}
