import type { CardState } from "./types";

export function streak(studyDays: number[], today: number): number {
  const set = new Set(studyDays);
  let d = set.has(today) ? today : today - 1;
  let n = 0;
  while (set.has(d)) { n++; d--; }
  return n;
}

export function forecast(cards: { state: CardState; dueDay: number | null; suspended: boolean }[], today: number, days = 30): number[] {
  const out = new Array(days).fill(0);
  for (const c of cards) {
    if (c.suspended || c.state === "new" || c.dueDay == null) continue;
    const i = Math.max(0, c.dueDay - today);
    if (i < days) out[i]++;
  }
  return out;
}

export function trueRetention(reviews: { state: CardState; rating: number }[]): number | null {
  const r = reviews.filter((x) => x.state === "review");
  if (!r.length) return null;
  return r.filter((x) => x.rating > 1).length / r.length;
}

export function cardDistribution(cards: { state: CardState; scheduledDays: number; suspended: boolean }[]) {
  const out = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };
  for (const c of cards) {
    if (c.suspended) out.suspended++;
    else if (c.state === "new") out.new++;
    else if (c.state === "learning" || c.state === "relearning") out.learning++;
    else if (c.scheduledDays >= 21) out.mature++;
    else out.young++;
  }
  return out;
}
