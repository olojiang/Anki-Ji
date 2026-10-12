import { q } from "../db";
import { listDecks } from "../repo/decks";
import { userContext } from "./context";
import { descendantIds } from "@/core/tree";
import { summarizeDurations, slowCards, LONG_ANSWER_MS } from "@/core/response-time";

/** Answer-time statistics over the last year (informational; never affects scheduling). */
export async function timingStats(uid: number, deckId: number | null) {
  const ctx = await userContext(uid);
  const decks = await listDecks(uid);
  const ids = deckId ? descendantIds(decks, deckId) : decks.map((d) => d.id);
  const rows = await q("SELECT card_id, rating, duration_ms, day FROM ak_revlog WHERE user_id = $1 AND deck_id = ANY($2::int[]) AND day > $3", [uid, ids, ctx.today - 365]);
  const all = rows.map((r) => ({ cardId: Number(r.card_id), rating: Number(r.rating), durationMs: Number(r.duration_ms), day: Number(r.day) }));
  const summary = summarizeDurations(all);
  const recent = summarizeDurations(all.filter((r) => r.day > ctx.today - 30));
  const slow = slowCards(all, summary.medianMs);
  let fronts = new Map<number, { noteId: number; front: string }>();
  if (slow.length) {
    const nr = await q("SELECT c.id, c.note_id, n.sort_field FROM ak_cards c JOIN ak_notes n ON n.id = c.note_id WHERE c.user_id = $1 AND c.id = ANY($2::int[]) AND n.deleted_at IS NULL", [uid, slow.map((s) => s.cardId)]);
    fronts = new Map(nr.map((r) => [Number(r.id), { noteId: Number(r.note_id), front: String(r.sort_field ?? "").slice(0, 120) }]));
  }
  return {
    longAnswerMs: LONG_ANSWER_MS,
    summary,
    last30: { count: recent.count, medianMs: recent.medianMs, totalMs: recent.totalMs },
    slow: slow.filter((s) => fronts.has(s.cardId)).map((s) => ({ ...s, ...fronts.get(s.cardId)! })),
  };
}
