import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import * as decks from "@/server/repo/decks";
import * as notes from "@/server/repo/notes";
import * as tags from "@/server/repo/tags";
import { q } from "@/server/db";
import { searchNotes } from "@/server/services/browse";
import { rebuildFiltered, emptyFiltered } from "@/server/services/filtered";
import { getStudyState, answer } from "@/server/services/study";
import { optimizeDeck } from "@/server/services/optimizer";
import { getStats } from "@/server/services/stats";

describe("server features", () => {
  let u: number;
  let root: number, child: number;
  beforeAll(async () => {
    await usePglite();
    u = (await users.createUser("f@test.dev", "h", "F")).id;
    root = (await decks.createDeck(u, { name: "Root" })).id;
    child = (await decks.createDeck(u, { name: "Child", parentId: root })).id;
    for (let i = 0; i < 5; i++) await notes.createNote(u, { deckId: child, type: "basic", fields: { front: `Front ${i}`, back: `Back ${i}` }, tags: i % 2 ? ["odd::x"] : ["even"] });
  });

  it("moves decks but rejects cycles", async () => {
    await expect(decks.moveDeck(u, root, child, 0)).rejects.toThrow();
    const other = await decks.createDeck(u, { name: "Other" });
    await decks.moveDeck(u, other.id, root, 0);
    expect((await decks.getDeck(u, other.id))!.parentId).toBe(root);
    await decks.moveDeck(u, other.id, null, 0);
    expect((await decks.getDeck(u, other.id))!.parentId).toBeNull();
  });

  it("searches with deck/tag syntax and sorts manually", async () => {
    expect((await searchNotes(u, "deck:Root")).length).toBe(5);
    expect((await searchNotes(u, "tag:odd")).length).toBe(2);
    expect((await searchNotes(u, "front 3")).length).toBe(1);
    const all = await searchNotes(u, "deck:Root::Child", { sort: "manual" });
    await notes.moveNoteToIndex(u, all[4].noteId, 0);
    const after = await searchNotes(u, "deck:Root::Child", { sort: "manual" });
    expect(after[0].noteId).toBe(all[4].noteId);
  });

  it("renames and deletes hierarchical tags", async () => {
    await tags.renameTag(u, "odd", "impar");
    expect(await tags.listTags(u)).toContain("impar::x");
    expect((await searchNotes(u, "tag:impar")).length).toBe(2);
    await tags.deleteTag(u, "impar");
    expect((await searchNotes(u, "tag:impar")).length).toBe(0);
    await tags.addTags(u, ["empty::tag"]);
    expect(await tags.listTags(u)).toContain("empty::tag");
  });

  it("filtered decks pull cards and return them", async () => {
    const f = await decks.createDeck(u, { name: "Cram", filtered: true, filter: { query: "tag:even", limit: 10, order: "due" } });
    expect(await rebuildFiltered(u, f.id)).toBe(3);
    const st = await getStudyState(u, f.id);
    expect(st!.counts.new).toBe(3);
    await emptyFiltered(u, f.id);
    expect((await searchNotes(u, "deck:Cram")).length).toBe(0);
  });

  it("trash: soft delete, restore and purge decks", async () => {
    const t = await decks.createDeck(u, { name: "Trashy" });
    await notes.createNote(u, { deckId: t.id, type: "basic", fields: { front: "zzz", back: "y" }, tags: [] });
    await decks.softDeleteDeck(u, t.id);
    expect((await searchNotes(u, "zzz")).length).toBe(0);
    expect((await decks.listDecks(u, { deleted: true })).map((d) => d.id)).toContain(t.id);
    await decks.restoreDeck(u, t.id);
    expect((await searchNotes(u, "zzz")).length).toBe(1);
    await decks.softDeleteDeck(u, t.id);
    await decks.purgeDeck(u, t.id);
    expect(await decks.getDeck(u, t.id)).toBeNull();
  });

  it("leech: suspends after repeated lapses", async () => {
    const d = await decks.createDeck(u, { name: "Leechy", config: { leechThreshold: 1, learningSteps: [], relearningSteps: [] } });
    const n = await notes.createNote(u, { deckId: d.id, type: "basic", fields: { front: "hard", back: "x" }, tags: [] });
    const card = (await notes.getNote(u, n.id))!.cards[0];
    await answer(u, card.id, 4, 1000); // graduate to review
    const r = await answer(u, card.id, 1, 1000); // lapse 1 => leech at threshold 1
    expect(r.leech).toBe(true);
    const after = (await notes.getNote(u, n.id))!;
    expect(after.cards[0].suspended).toBe(true);
    expect(after.tags).toContain("leech");
  });

  it("optimizer refuses with too little data, then trains FSRS weights from the review log", async () => {
    const small = await optimizeDeck(u, root);
    expect(small.ok).toBe(false);
    // synthesize a review history: every card reviewed 5 times over growing intervals
    for (let i = 0; i < 10; i++) await notes.createNote(u, { deckId: child, type: "basic", fields: { front: `opt ${i}`, back: "x" }, tags: [] });
    const day0 = Date.UTC(2026, 0, 1);
    await q("DELETE FROM ak_revlog WHERE user_id = $1", [u]);
    const realCards = (await q("SELECT id FROM ak_cards WHERE user_id = $1 ORDER BY id", [u])).map((r) => Number(r.id));
    const rows: string[] = [];
    realCards.forEach((cid, idx) => {
      [0, 1, 4, 12, 30].forEach((dd, i) => {
        const rating = i === 0 ? 3 : (cid + i) % 5 === 0 ? 1 : 3;
        rows.push(`(${u}, ${cid}, ${root}, ${rating}, '${i === 0 ? "new" : "review"}', now(), to_timestamp(${(day0 + idx * 3600000 + dd * 86400000) / 1000}))`);
      });
    });
    await q(`INSERT INTO ak_revlog (user_id, card_id, deck_id, rating, state, due, reviewed_at) VALUES ${rows.join(",")}`);
    const res = await optimizeDeck(u, root);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.weights.length).toBe(21);
      expect((await decks.getDeck(u, child))!.config.fsrsWeights).toEqual(res.weights);
    }
  });

  it("stats summarise the deck", async () => {
    const s = await getStats(u, null);
    expect(s.totalCards).toBeGreaterThan(0);
    expect(s.forecast).toHaveLength(30);
    expect(s.reviewsByDay).toHaveLength(30);
  });
});
