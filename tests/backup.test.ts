import { describe, it, expect } from "vitest";
import { createBackup, parseBackup, orderDecks, nestNotes, rewriteMediaInFields, normalizeForCompare, type Backup } from "@/core/io/backup";
import { importDecks, importNotes, type ImportSink } from "@/core/io/importer";

function sample(): Backup {
  return createBackup({
    exportedAt: "2026-10-12T00:00:00.000Z",
    settings: { timezone: "Asia/Shanghai", rolloverHour: 4 },
    tags: ["geo", "geo::europe"],
    decks: [
      { id: 10, parentId: null, name: "Root", position: 1, config: { newPerDay: 5 }, filtered: false, filter: null, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: 12, parentId: 11, name: "Grandchild", position: 1, config: {}, filtered: false, filter: null, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: 11, parentId: 10, name: "Child", position: 1, config: {}, filtered: false, filter: null, createdAt: "2026-01-01T00:00:00.000Z" },
    ],
    notes: [
      { id: 100, deckId: 12, guid: "g1", type: "cloze", fields: { text: "{{c1::a}} {{c2::b}} ![x](https://blob/x.png)" }, tags: ["geo"], position: 1, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
      { id: 101, deckId: 10, guid: "g2", type: "basic", fields: { front: "f", back: "b" }, tags: [], position: 2, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
    ],
    cards: [
      { id: 1000, noteId: 100, deckId: 12, homeDeckId: null, ord: 1, state: "review", due: "2026-10-20T20:00:00.000Z", stability: 12.5, difficulty: 4.2, elapsedDays: 3, scheduledDays: 8, reps: 4, lapses: 1, step: 0, lastReview: "2026-10-12T01:00:00.000Z", ease: 0, box: 0, suspended: false, buriedDay: null, flag: 2, leech: false, position: 1, createdAt: "2026-01-02T00:00:00.000Z" },
      { id: 1001, noteId: 100, deckId: 12, homeDeckId: null, ord: 2, state: "new", due: "1970-01-01T00:00:00.000Z", stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, step: 0, lastReview: null, ease: 0, box: 0, suspended: true, buriedDay: null, flag: 0, leech: false, position: 1, createdAt: "2026-01-02T00:00:00.000Z" },
      { id: 1002, noteId: 101, deckId: 10, homeDeckId: null, ord: 0, state: "new", due: "1970-01-01T00:00:00.000Z", stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, step: 0, lastReview: null, ease: 0, box: 0, suspended: false, buriedDay: null, flag: 0, leech: false, position: 2, createdAt: "2026-01-02T00:00:00.000Z" },
    ],
    revlog: [
      { id: 5, cardId: 1000, deckId: 12, rating: 3, state: "new", due: "2026-10-12T01:00:00.000Z", stability: 12.5, difficulty: 4.2, elapsedDays: 0, scheduledDays: 8, durationMs: 4000, reviewedAt: "2026-10-12T01:00:00.000Z", algorithm: "fsrs" },
    ],
    media: [{ id: 1, url: "https://blob/x.png", filename: "x.png", contentType: "image/png", size: 3, data: "AAEC" }],
  });
}

/** In-memory implementation of the same sink interface the DB repository implements. */
function memorySink() {
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

describe("JSON backup", () => {
  it("has a versioned envelope and validates input", () => {
    const b = sample();
    expect(b.format).toBe("anki-ji-backup");
    expect(b.version).toBe(1);
    expect(parseBackup(JSON.stringify(b)).notes).toHaveLength(2);
    expect(() => parseBackup('{"format":"other"}')).toThrow();
    expect(() => parseBackup("not json")).toThrow();
  });
  it("orders decks parents-first", () => {
    expect(orderDecks(sample().decks).map((d) => d.id)).toEqual([10, 11, 12]);
  });
  it("nests cards and revlog under notes", () => {
    const n = nestNotes(sample());
    expect(n[0].cards).toHaveLength(2);
    expect(n[0].cards[0].revlog).toHaveLength(1);
  });
  it("rewrites media urls inside any field", () => {
    const f = rewriteMediaInFields({ text: "![x](https://blob/x.png)", options: ["<img src=\"https://blob/x.png\">"] }, { "https://blob/x.png": "https://new/y.png" });
    expect(f.text).toBe("![x](https://new/y.png)");
    expect(f.options![0]).toContain("https://new/y.png");
  });
  it("export → import → export round-trips (ids remapped, content identical)", async () => {
    const original = parseBackup(JSON.stringify(sample()));
    const { db, sink } = memorySink();
    const deckMap = await importDecks(sink, original.decks);
    const res = await importNotes(sink, nestNotes(original), deckMap);
    await sink.addTags(original.tags);
    expect(res).toEqual({ notes: 2, cards: 3, revlog: 1, skipped: 0 });
    const again = createBackup({
      exportedAt: original.exportedAt, settings: original.settings, tags: [...db.tags], media: original.media,
      decks: db.decks as never, notes: db.notes as never, cards: db.cards as never, revlog: db.revlog as never,
    });
    expect(normalizeForCompare(again)).toEqual(normalizeForCompare(original));
    // importing the same notes again is idempotent (matched by guid)
    const second = await importNotes(sink, nestNotes(original), deckMap);
    expect(second.skipped).toBe(2);
    expect(db.notes).toHaveLength(2);
  });
});
