import type { CardRecord, DeckRecord, NestedNote, NoteRecord, RevlogRecord } from "./backup";
import { orderDecks } from "./backup";

/** Storage port for imports. Implemented by the Postgres repository and by in-memory fakes in tests. */
export interface ImportSink {
  createDeck(d: DeckRecord, parentId: number | null): Promise<number>;
  existingGuids(guids: string[]): Promise<Set<string>>;
  insertNotes(items: { note: NoteRecord; deckId: number }[]): Promise<number[]>;
  insertCards(items: { card: CardRecord; noteId: number; deckId: number; homeDeckId: number | null }[]): Promise<number[]>;
  insertRevlog(items: { rev: RevlogRecord; cardId: number; deckId: number }[]): Promise<void>;
  addTags(tags: string[]): Promise<void>;
}

export interface ExistingDeck { id: number; parentId: number | null; name: string; filtered?: boolean }

/** Create decks parents-first, reusing an existing deck with the same name under the same parent. Returns oldId → newId. */
export async function importDecks(sink: ImportSink, decks: DeckRecord[], existing: ExistingDeck[] = []): Promise<Record<number, number>> {
  const map: Record<number, number> = {};
  const known = [...existing];
  for (const d of orderDecks(decks)) {
    const parentId = d.parentId != null ? map[d.parentId] ?? null : null;
    const match = !d.filtered && known.find((k) => k.parentId === parentId && !k.filtered && k.name.toLowerCase() === d.name.toLowerCase());
    if (match) { map[d.id] = match.id; continue; }
    const id = await sink.createDeck(d, parentId);
    known.push({ id, parentId, name: d.name, filtered: d.filtered });
    map[d.id] = id;
  }
  return map;
}

/** Insert notes with their cards and review history. Notes whose guid already exists are skipped. */
export async function importNotes(sink: ImportSink, notes: NestedNote[], deckMap: Record<number, number>) {
  const fallback = Object.values(deckMap)[0];
  const existing = await sink.existingGuids(notes.map((n) => n.guid).filter(Boolean));
  const fresh = notes.filter((n) => !n.guid || !existing.has(n.guid));
  const skipped = notes.length - fresh.length;
  if (!fresh.length) return { notes: 0, cards: 0, revlog: 0, skipped };
  const deckOf = (old: number | null | undefined, dflt: number) => (old != null && deckMap[old] != null ? deckMap[old] : dflt);
  const noteIds = await sink.insertNotes(fresh.map((n) => ({ note: n, deckId: deckOf(n.deckId, fallback) })));
  const cardItems: { card: CardRecord; noteId: number; deckId: number; homeDeckId: number | null; revlog: RevlogRecord[] }[] = [];
  fresh.forEach((n, i) => {
    const noteDeck = deckOf(n.deckId, fallback);
    for (const c of n.cards) {
      cardItems.push({ card: c, noteId: noteIds[i], deckId: deckOf(c.deckId, noteDeck), homeDeckId: c.homeDeckId != null ? deckMap[c.homeDeckId] ?? null : null, revlog: c.revlog });
    }
  });
  const cardIds = cardItems.length ? await sink.insertCards(cardItems.map(({ revlog: _r, ...rest }) => rest)) : [];
  const revItems = cardItems.flatMap((c, i) => c.revlog.map((rev) => ({ rev, cardId: cardIds[i], deckId: deckOf(rev.deckId, c.deckId) })));
  if (revItems.length) await sink.insertRevlog(revItems);
  return { notes: fresh.length, cards: cardItems.length, revlog: revItems.length, skipped };
}
