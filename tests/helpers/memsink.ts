import type { ImportSink } from "@/core/io/importer";

/** In-memory implementation of the import port (same contract as the Postgres sink). */
export function memorySink() {
  const db = { decks: [] as Record<string, unknown>[], notes: [] as Record<string, unknown>[], cards: [] as Record<string, unknown>[], revlog: [] as Record<string, unknown>[], tags: new Set<string>() };
  let id = 5000;
  const sink: ImportSink = {
    async createDeck(d, parentId) { const nid = id++; db.decks.push({ ...d, id: nid, parentId }); return nid; },
    async existingGuids(guids) { return new Set(db.notes.map((n) => n.guid as string).filter((g) => guids.includes(g))); },
    async insertNotes(items) { return items.map(({ note, deckId }) => { const nid = id++; db.notes.push({ ...note, id: nid, deckId }); return nid; }); },
    async insertCards(items) { return items.map(({ card, noteId, deckId, homeDeckId }) => { const nid = id++; db.cards.push({ ...card, id: nid, noteId, deckId, homeDeckId }); return nid; }); },
    async insertRevlog(items) { for (const { rev, cardId, deckId } of items) db.revlog.push({ ...rev, id: id++, cardId, deckId }); },
    async addTags(tags) { tags.forEach((t) => db.tags.add(t)); },
  };
  return { db, sink };
}
