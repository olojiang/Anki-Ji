import { authed, body } from "@/server/http";
import { listDecks, createDeck } from "@/server/repo/decks";
import { deckCounts } from "@/server/services/study";
import { rebuildFiltered } from "@/server/services/filtered";
import type { FilterSpec } from "@/server/repo/mappers";

export const GET = authed(async (_req, { uid }) => {
  const [decks, counts] = await Promise.all([listDecks(uid), deckCounts(uid)]);
  return { decks, counts };
});

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ name: string; parentId?: number | null; filtered?: boolean; filter?: FilterSpec }>(req);
  const filter = b.filtered ? { query: String(b.filter?.query ?? ""), limit: Number(b.filter?.limit ?? 100), order: b.filter?.order ?? "due" } as FilterSpec : null;
  const deck = await createDeck(uid, { name: b.name, parentId: b.filtered ? null : b.parentId ?? null, filtered: !!b.filtered, filter });
  if (deck.filtered) await rebuildFiltered(uid, deck.id);
  return { deck };
});
