import { q } from "../db";
import { CARD_COLS, toCard, type Card } from "./mappers";
import type { SchedState } from "@/core/types";

export async function listCardsForNote(uid: number, noteId: number): Promise<Card[]> {
  return (await q(`SELECT ${CARD_COLS} FROM ak_cards c WHERE c.user_id = $1 AND c.note_id = $2 ORDER BY c.ord`, [uid, noteId])).map(toCard);
}

export async function getCard(uid: number, id: number): Promise<Card | null> {
  const rows = await q(`SELECT ${CARD_COLS} FROM ak_cards c JOIN ak_notes n ON n.id = c.note_id WHERE c.user_id = $1 AND c.id = $2 AND n.deleted_at IS NULL`, [uid, id]);
  return rows[0] ? toCard(rows[0]) : null;
}

/** Cards of live notes in the given decks (study queue input). */
export async function getCardsInDecks(uid: number, deckIds: number[]): Promise<Card[]> {
  if (!deckIds.length) return [];
  return (await q(`SELECT ${CARD_COLS} FROM ak_cards c JOIN ak_notes n ON n.id = c.note_id WHERE c.user_id = $1 AND c.deck_id = ANY($2::int[]) AND n.deleted_at IS NULL`, [uid, deckIds])).map(toCard);
}

export async function updateSched(uid: number, id: number, s: SchedState, extra: { leech?: boolean; suspended?: boolean; buriedDay?: number | null } = {}) {
  await q(
    `UPDATE ak_cards SET state = $3, due = $4, stability = $5, difficulty = $6, elapsed_days = $7, scheduled_days = $8, reps = $9, lapses = $10, step = $11,
       last_review = $12, ease = $13, box = $14, leech = COALESCE($15, leech), suspended = COALESCE($16, suspended), buried_day = CASE WHEN $17::boolean THEN $18::int ELSE buried_day END
     WHERE user_id = $1 AND id = $2`,
    [uid, id, s.state, s.due, s.stability, s.difficulty, s.elapsedDays, s.scheduledDays, s.reps, s.lapses, s.step, s.lastReview, s.ease, s.box,
      extra.leech ?? null, extra.suspended ?? null, "buriedDay" in extra, extra.buriedDay ?? null],
  );
}

export async function setSuspended(uid: number, ids: number[], on: boolean) {
  await q("UPDATE ak_cards SET suspended = $3 WHERE user_id = $1 AND id = ANY($2::int[])", [uid, ids, on]);
}
export async function setBuried(uid: number, ids: number[], day: number | null) {
  await q("UPDATE ak_cards SET buried_day = $3 WHERE user_id = $1 AND id = ANY($2::int[])", [uid, ids, day]);
}
export async function setFlag(uid: number, ids: number[], flag: number) {
  await q("UPDATE ak_cards SET flag = $3 WHERE user_id = $1 AND id = ANY($2::int[])", [uid, ids, Math.max(0, Math.min(7, Math.round(flag)))]);
}
/** Forget: back to new. */
export async function resetCards(uid: number, ids: number[]) {
  await q(`UPDATE ak_cards SET state = 'new', due = to_timestamp(0), stability = 0, difficulty = 0, elapsed_days = 0, scheduled_days = 0, reps = 0, lapses = 0, step = 0,
    last_review = NULL, ease = 0, box = 0, leech = false WHERE user_id = $1 AND id = ANY($2::int[])`, [uid, ids]);
}
export async function cardIdsForNotes(uid: number, noteIds: number[]): Promise<number[]> {
  return (await q("SELECT id FROM ak_cards WHERE user_id = $1 AND note_id = ANY($2::int[])", [uid, noteIds])).map((r) => Number(r.id));
}

/** Review-card load per study day (for the load balancer). Uses the current tz offset. */
export async function reviewLoadByDay(uid: number, offsetMinutes: number, rolloverHour: number): Promise<Map<number, number>> {
  const rows = await q(
    `SELECT floor((extract(epoch FROM due) + $2 * 60 - $3 * 3600) / 86400)::int AS day, count(*)::int AS n
     FROM ak_cards WHERE user_id = $1 AND state = 'review' AND NOT suspended GROUP BY 1`, [uid, offsetMinutes, rolloverHour]);
  return new Map(rows.map((r) => [Number(r.day), Number(r.n)]));
}
