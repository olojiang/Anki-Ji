import { q } from "../db";
import type { CardState, Rating, SchedState } from "@/core/types";

export async function insertRevlog(uid: number, r: { cardId: number; deckId: number; noteId: number; rating: Rating; prevState: CardState; next: SchedState; durationMs: number; day: number; algorithm: string; snapshot: unknown; reviewedAt: Date }) {
  await q(
    `INSERT INTO ak_revlog (user_id, card_id, deck_id, note_id, rating, state, due, stability, difficulty, elapsed_days, scheduled_days, duration_ms, reviewed_at, day, algorithm, snapshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [uid, r.cardId, r.deckId, r.noteId, r.rating, r.prevState, r.next.due, r.next.stability, r.next.difficulty, r.next.elapsedDays, r.next.scheduledDays,
      Math.max(0, Math.min(3_600_000, Math.round(r.durationMs || 0))), r.reviewedAt, r.day, r.algorithm, JSON.stringify(r.snapshot)],
  );
}

/** New cards introduced / review cards answered today, per (home) deck. */
export async function studiedToday(uid: number, day: number): Promise<Map<number, { new: number; review: number }>> {
  const rows = await q(
    `SELECT deck_id, count(DISTINCT card_id) FILTER (WHERE state = 'new')::int AS n, count(DISTINCT card_id) FILTER (WHERE state = 'review')::int AS r
     FROM ak_revlog WHERE user_id = $1 AND day = $2 GROUP BY deck_id`, [uid, day]);
  return new Map(rows.map((x) => [Number(x.deck_id), { new: Number(x.n), review: Number(x.r) }]));
}

export async function notesReviewedToday(uid: number, day: number): Promise<Set<number>> {
  const rows = await q(
    "SELECT DISTINCT note_id FROM ak_revlog WHERE user_id = $1 AND day = $2 AND note_id IS NOT NULL", [uid, day]);
  return new Set(rows.map((x) => Number(x.note_id)));
}

export async function lastRevlog(uid: number) {
  const rows = await q("SELECT id, card_id, snapshot FROM ak_revlog WHERE user_id = $1 AND snapshot IS NOT NULL ORDER BY id DESC LIMIT 1", [uid]);
  return rows[0] ? { id: Number(rows[0].id), cardId: Number(rows[0].card_id), snapshot: rows[0].snapshot as Record<string, unknown> } : null;
}

export async function deleteRevlog(uid: number, id: number) {
  await q("DELETE FROM ak_revlog WHERE user_id = $1 AND id = $2", [uid, id]);
}

export async function revlogForCards(uid: number, cardIds: number[] | null) {
  const rows = await q(
    `SELECT id, card_id, deck_id, rating, state, due, stability, difficulty, elapsed_days, scheduled_days, duration_ms, reviewed_at, algorithm, day
     FROM ak_revlog WHERE user_id = $1 ${cardIds ? "AND card_id = ANY($2::int[])" : ""} ORDER BY reviewed_at`, cardIds ? [uid, cardIds] : [uid]);
  return rows.map((r) => ({
    id: Number(r.id), cardId: Number(r.card_id), deckId: Number(r.deck_id), rating: Number(r.rating), state: r.state as CardState, due: new Date(String(r.due)),
    stability: Number(r.stability), difficulty: Number(r.difficulty), elapsedDays: Number(r.elapsed_days), scheduledDays: Number(r.scheduled_days),
    durationMs: Number(r.duration_ms), reviewedAt: new Date(String(r.reviewed_at)), algorithm: String(r.algorithm), day: Number(r.day),
  }));
}
