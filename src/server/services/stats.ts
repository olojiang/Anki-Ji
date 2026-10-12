import { q } from "../db";
import { listDecks } from "../repo/decks";
import { userContext } from "./context";
import { descendantIds } from "@/core/tree";
import { dayIndex } from "@/core/time";
import { streak, forecast, trueRetention, cardDistribution } from "@/core/stats";
import type { CardState } from "@/core/types";

export async function getStats(uid: number, deckId: number | null) {
  const ctx = await userContext(uid);
  const decks = await listDecks(uid);
  const ids = deckId ? descendantIds(decks, deckId) : decks.map((d) => d.id);
  const cards = await q(
    `SELECT c.state, c.due, c.scheduled_days, c.suspended FROM ak_cards c JOIN ak_notes n ON n.id = c.note_id
     WHERE c.user_id = $1 AND n.deleted_at IS NULL AND (c.deck_id = ANY($2::int[]) OR c.home_deck_id = ANY($2::int[]))`, [uid, ids]);
  const revs = await q(
    `SELECT day, rating, state, duration_ms FROM ak_revlog WHERE user_id = $1 AND deck_id = ANY($2::int[]) AND day > $3`, [uid, ids, ctx.today - 366]);
  const allDays = await q("SELECT DISTINCT day FROM ak_revlog WHERE user_id = $1 ORDER BY day", [uid]);
  const cardRows = cards.map((c) => ({
    state: c.state as CardState, scheduledDays: Number(c.scheduled_days), suspended: !!c.suspended,
    dueDay: c.state === "new" ? null : dayIndex(new Date(String(c.due instanceof Date ? c.due.toISOString() : c.due)), ctx.tz, ctx.rollover),
  }));
  const heat: Record<number, number> = {};
  const byDay: Record<number, { learn: number; review: number; relearn: number; again: number }> = {};
  let todayCount = 0, todayMs = 0, todayAgain = 0, todayNew = 0;
  for (const r of revs) {
    const d = Number(r.day);
    heat[d] = (heat[d] ?? 0) + 1;
    const b = (byDay[d] ??= { learn: 0, review: 0, relearn: 0, again: 0 });
    if (r.state === "review") b.review++; else if (r.state === "relearning") b.relearn++; else b.learn++;
    if (Number(r.rating) === 1) b.again++;
    if (d === ctx.today) { todayCount++; todayMs += Number(r.duration_ms); if (Number(r.rating) === 1) todayAgain++; if (r.state === "new") todayNew++; }
  }
  const last30 = revs.filter((r) => Number(r.day) > ctx.today - 30).map((r) => ({ state: r.state as CardState, rating: Number(r.rating) }));
  const targetRetention = deckId ? decks.find((d) => d.id === deckId)?.config.desiredRetention ?? 0.9 : decks[0]?.config.desiredRetention ?? 0.9;
  return {
    today: { reviews: todayCount, minutes: Math.round(todayMs / 60000), again: todayAgain, newCards: todayNew },
    streak: streak(allDays.map((r) => Number(r.day)), ctx.today),
    todayIndex: ctx.today,
    heatmap: heat,
    reviewsByDay: Array.from({ length: 30 }, (_, i) => ({ day: ctx.today - 29 + i, ...(byDay[ctx.today - 29 + i] ?? { learn: 0, review: 0, relearn: 0, again: 0 }) })),
    forecast: forecast(cardRows, ctx.today, 30),
    retention: { actual: trueRetention(last30), target: targetRetention, sample: last30.filter((r) => r.state === "review").length },
    distribution: cardDistribution(cardRows),
    totalCards: cardRows.length,
    totalReviews: revs.length,
  };
}
