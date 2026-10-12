import { q } from "../db";
import { getDeck, BadRequestError, NotFoundError } from "../repo/decks";
import { searchNotes } from "./browse";

/** Fill a filtered deck from its search (cards remember their home deck). */
export async function rebuildFiltered(uid: number, deckId: number) {
  const deck = await getDeck(uid, deckId);
  if (!deck || deck.deletedAt) throw new NotFoundError("deck_not_found");
  if (!deck.filtered || !deck.filter) throw new BadRequestError("not_filtered");
  await emptyFiltered(uid, deckId);
  const rows = (await searchNotes(uid, deck.filter.query || "", { sort: "due" }))
    .filter((r) => !r.suspended && !r.buried && r.homeDeckId == null && r.deckId !== deckId);
  const order = deck.filter.order;
  if (order === "random") rows.sort(() => Math.random() - 0.5);
  else if (order === "added") rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (order === "retrievability") rows.sort((a, b) => (a.retrievability ?? 2) - (b.retrievability ?? 2));
  const ids = rows.slice(0, Math.max(1, Math.min(9999, deck.filter.limit || 100))).map((r) => r.cardId);
  if (ids.length) await q("UPDATE ak_cards SET home_deck_id = deck_id, deck_id = $3 WHERE user_id = $1 AND id = ANY($2::int[]) AND home_deck_id IS NULL", [uid, ids, deckId]);
  return ids.length;
}

export async function emptyFiltered(uid: number, deckId: number) {
  await q("UPDATE ak_cards SET deck_id = home_deck_id, home_deck_id = NULL WHERE user_id = $1 AND deck_id = $2 AND home_deck_id IS NOT NULL", [uid, deckId]);
}
