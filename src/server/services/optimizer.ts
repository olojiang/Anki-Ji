import { listDecks, updateDeck, NotFoundError } from "../repo/decks";
import { q } from "../db";
import { userContext } from "./context";
import { descendantIds } from "@/core/tree";
import { revlogToTrainingItems } from "@/core/optimizer";
import type { CardState } from "@/core/types";

export const MIN_TRAINING_ITEMS = 32;

/** Train FSRS-6 parameters from the user's own review log using the official fsrs-rs binding. */
export async function optimizeDeck(uid: number, deckId: number) {
  const decks = await listDecks(uid);
  if (!decks.some((d) => d.id === deckId)) throw new NotFoundError("deck_not_found");
  const ids = descendantIds(decks, deckId);
  const ctx = await userContext(uid);
  const rows = await q("SELECT card_id, rating, state, reviewed_at FROM ak_revlog WHERE user_id = $1 AND deck_id = ANY($2::int[]) ORDER BY reviewed_at", [uid, ids]);
  const items = revlogToTrainingItems(rows.map((r) => ({ cardId: Number(r.card_id), rating: Number(r.rating), state: r.state as CardState, reviewedAt: new Date(String(r.reviewed_at instanceof Date ? r.reviewed_at.toISOString() : r.reviewed_at)) })), ctx.tz, ctx.rollover);
  if (items.length < MIN_TRAINING_ITEMS) return { ok: false as const, reason: "not_enough_reviews", items: items.length, needed: MIN_TRAINING_ITEMS };
  let binding: typeof import("@open-spaced-repetition/binding");
  try {
    binding = await import("@open-spaced-repetition/binding");
  } catch (e) {
    return { ok: false as const, reason: "optimizer_unavailable", detail: String(e).slice(0, 200), items: items.length };
  }
  const train = items.map((it) => new binding.FSRSBindingItem(it.map((r) => new binding.FSRSBindingReview(r.rating, r.deltaT))));
  const weights = await binding.computeParameters(train, { enableShortTerm: true, timeout: 20000 });
  if (!Array.isArray(weights) || weights.length < 19) return { ok: false as const, reason: "optimizer_failed", items: items.length };
  const rounded = weights.map((w) => Math.round(w * 10000) / 10000);
  for (const id of ids) await updateDeck(uid, id, { config: { fsrsWeights: rounded } });
  return { ok: true as const, weights: rounded, items: items.length, decks: ids.length };
}
