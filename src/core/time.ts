/**
 * Time helpers for the "study day": a day that starts at `rolloverHour` (default 4am)
 * in the user's IANA timezone. Day indices are integers (days since 1970-01-01 local),
 * which makes "due today", streaks and forecasts simple integer comparisons.
 */
const DAY_MS = 86_400_000;
const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Offset of `tz` from UTC at instant `date`, in minutes (Shanghai = +480). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = formatter(tz).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

export function isValidTimeZone(tz: string): boolean {
  try { formatter(tz); return true; } catch { return false; }
}

/** Integer study-day index for an instant. */
export function dayIndex(date: Date, tz: string, rolloverHour = 4): number {
  const local = date.getTime() + tzOffsetMinutes(date, tz) * 60000;
  return Math.floor((local - rolloverHour * 3_600_000) / DAY_MS);
}

/** First instant of study day `day`. */
export function dayStart(day: number, tz: string, rolloverHour = 4): Date {
  const localMs = day * DAY_MS + rolloverHour * 3_600_000;
  let guess = localMs - tzOffsetMinutes(new Date(localMs), tz) * 60000;
  // second pass handles DST transitions
  guess = localMs - tzOffsetMinutes(new Date(guess), tz) * 60000;
  return new Date(guess);
}

/** 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). */
export function weekdayOf(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

export { DAY_MS };
