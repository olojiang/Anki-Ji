/**
 * Answer-time analytics. durationMs is informational only — it never changes ratings or scheduling.
 * Answers longer than LONG_ANSWER_MS are treated as idle/distracted: capped when summing study time
 * (like Anki's "maximum answer seconds") and flagged.
 */
export const LONG_ANSWER_MS = 60_000;
export const HIST_EDGES_MS = [5_000, 10_000, 20_000, 40_000, 60_000]; // buckets: <5s, 5–10, 10–20, 20–40, 40–60, >60

export const capDuration = (ms: number) => Math.max(0, Math.min(LONG_ANSWER_MS, Math.round(ms || 0)));

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export interface TimingSummary {
  count: number; totalMs: number; meanMs: number; medianMs: number; longCount: number;
  byRating: Record<1 | 2 | 3 | 4, { count: number; medianMs: number }>;
  histogram: number[];
}

export function summarizeDurations(rows: { rating: number; durationMs: number }[]): TimingSummary {
  const valid = rows.filter((r) => r.durationMs > 0);
  const capped = valid.map((r) => capDuration(r.durationMs));
  const totalMs = capped.reduce((a, b) => a + b, 0);
  const byRating = {} as TimingSummary["byRating"];
  for (const g of [1, 2, 3, 4] as const) {
    const xs = valid.filter((r) => r.rating === g).map((r) => r.durationMs);
    byRating[g] = { count: xs.length, medianMs: median(xs) };
  }
  const histogram = new Array(HIST_EDGES_MS.length + 1).fill(0);
  for (const r of valid) {
    let i = HIST_EDGES_MS.findIndex((e) => r.durationMs < e);
    if (i < 0) i = HIST_EDGES_MS.length;
    histogram[i]++;
  }
  return {
    count: valid.length, totalMs, meanMs: valid.length ? Math.round(totalMs / valid.length) : 0,
    medianMs: median(valid.map((r) => r.durationMs)), longCount: valid.filter((r) => r.durationMs > LONG_ANSWER_MS).length,
    byRating, histogram,
  };
}

/** Cards whose median answer time (≥2 timed reviews) is ≥15 s and ≥2.5× the collection median. */
export function slowCards(rows: { cardId: number; durationMs: number }[], collectionMedianMs: number, limit = 10) {
  const by = new Map<number, number[]>();
  for (const r of rows) if (r.durationMs > 0) (by.get(r.cardId) ?? by.set(r.cardId, []).get(r.cardId)!).push(r.durationMs);
  const threshold = Math.max(15_000, 2.5 * collectionMedianMs);
  return [...by.entries()]
    .filter(([, xs]) => xs.length >= 2)
    .map(([cardId, xs]) => ({ cardId, reviews: xs.length, medianMs: median(xs) }))
    .filter((x) => x.medianMs >= threshold)
    .sort((a, b) => b.medianMs - a.medianMs)
    .slice(0, limit);
}
