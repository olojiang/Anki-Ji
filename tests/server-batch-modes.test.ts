import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import * as decks from "@/server/repo/decks";
import * as notes from "@/server/repo/notes";
import { q } from "@/server/db";
import { answer } from "@/server/services/study";
import { findReplace, findDuplicateGroups, mergeDuplicates, deleteDuplicates, changeNoteType, undoBatch } from "@/server/services/batch";
import { getModeItems, getModeRecords, saveModeRecord } from "@/server/services/modes";

const front = async (id: number) => (await notes.getNote(u, id))!.fields.front;
let u: number, other: number, deck: number, sub: number, otherDeck: number;
const ids: number[] = [];

describe("batch editing on real Postgres", () => {
  beforeAll(async () => {
    await usePglite();
    u = (await users.createUser("batch@test.dev", "h", "B")).id;
    other = (await users.createUser("other@test.dev", "h", "O")).id;
    deck = (await decks.createDeck(u, { name: "Lang" })).id;
    sub = (await decks.createDeck(u, { name: "Sub", parentId: deck })).id;
    otherDeck = (await decks.createDeck(other, { name: "Theirs" })).id;
    const data: [number, string, string, string[]][] = [
      [deck, "colour", "a colour word", ["x"]], [deck, "Colour", "dup", ["y"]], [sub, "honour", "an honour", []], [sub, "plain", "nothing", []],
    ];
    for (const [d, f, b, t] of data) ids.push((await notes.createNote(u, { deckId: d, type: "basic", fields: { front: f, back: b }, tags: t })).id);
    await notes.createNote(other, { deckId: otherDeck, type: "basic", fields: { front: "colour", back: "theirs" }, tags: [] });
  });

  it("previews then applies find & replace on selected notes, and undoes it", async () => {
    const spec = { find: "our", replace: "or" };
    const pv = await findReplace(u, { noteIds: ids }, spec, true);
    expect(pv).toMatchObject({ notes: 3, matches: 5 });
    expect(await front(ids[0])).toBe("colour");
    const r = await findReplace(u, { noteIds: ids }, spec, false);
    expect(r).toMatchObject({ changed: 3, matches: 5 });
    expect(await front(ids[0])).toBe("color");
    expect((await notes.getNote(u, ids[0]))!.fields.back).toBe("a color word");
    // search text is kept in sync
    expect((await q("SELECT search_text FROM ak_notes WHERE id = $1", [ids[2]]))[0].search_text).toContain("honor");
    await undoBatch(u, r.undoId!);
    expect(await front(ids[0])).toBe("colour");
    expect(await front(ids[2])).toBe("honour");
  });

  it("find & replace over search results respects fields, regex and case", async () => {
    const r = await findReplace(u, { query: "deck:Lang::Sub" }, { find: "^(h)", replace: "H", regex: true, caseSensitive: true, fields: ["front"] }, false);
    expect(r.changed).toBe(1);
    expect(await front(ids[2])).toBe("Honour");
    expect(await front(ids[0])).toBe("colour");
    await undoBatch(u, r.undoId!);
    expect(await front(ids[2])).toBe("honour");
  });

  it("never touches another user's notes (isolation)", async () => {
    const theirs = (await q("SELECT id FROM ak_notes WHERE user_id = $1", [other]))[0].id as number;
    const r = await findReplace(u, { noteIds: [theirs] }, { find: "colour", replace: "X" }, false);
    expect(r.changed).toBe(0);
    expect((await notes.getNote(other, theirs))!.fields.front).toBe("colour");
    const r2 = await findReplace(other, { noteIds: [theirs] }, { find: "colour", replace: "Y" }, false);
    await expect(undoBatch(u, r2.undoId!)).rejects.toThrow("undo_not_found");
  });

  it("rejects invalid regex", async () => {
    await expect(findReplace(u, { noteIds: ids }, { find: "(", replace: "", regex: true }, true)).rejects.toThrow("invalid_regex");
  });

  it("finds duplicate groups by scope", async () => {
    const coll = await findDuplicateGroups(u, { scope: "collection" });
    expect(coll).toHaveLength(1);
    expect(coll[0].notes.map((n) => n.id).sort()).toEqual([ids[0], ids[1]].sort());
    expect(coll[0].notes[0]).toHaveProperty("deckPath");
    const inSub = await findDuplicateGroups(u, { scope: "deck", deckId: sub });
    expect(inSub).toHaveLength(0);
  });

  it("merges duplicates: keeps one, merges tags, can adopt the more advanced scheduling, undoable", async () => {
    // review the card of the note we are going to delete so its scheduling is more advanced
    const delCard = (await q("SELECT id FROM ak_cards WHERE note_id = $1", [ids[1]]))[0].id as number;
    await answer(u, delCard, 3, 1000);
    await answer(u, delCard, 3, 1000);
    const revBefore = (await q("SELECT count(*)::int AS n FROM ak_revlog WHERE user_id = $1", [u]))[0].n;
    const r = await mergeDuplicates(u, [{ keepId: ids[0], removeIds: [ids[1]], scheduling: "best" }]);
    const kept = await notes.getNote(u, ids[0]);
    expect(kept!.tags.sort()).toEqual(["x", "y"]);
    expect(kept!.cards[0].reps).toBe(2);
    expect((await notes.getNote(u, ids[1]))!.deletedAt).not.toBeNull();
    // revlog untouched by merge (FSRS history is not rewritten)
    expect((await q("SELECT count(*)::int AS n FROM ak_revlog WHERE user_id = $1", [u]))[0].n).toBe(revBefore);
    await undoBatch(u, r.undoId);
    const back = await notes.getNote(u, ids[0]);
    expect(back!.tags).toEqual(["x"]);
    expect(back!.cards[0].reps).toBe(0);
    expect((await notes.getNote(u, ids[1]))!.deletedAt).toBeNull();
  });

  it("merge with scheduling=keep leaves the kept card alone; rejects foreign ids", async () => {
    const r = await mergeDuplicates(u, [{ keepId: ids[0], removeIds: [ids[1]], scheduling: "keep" }]);
    expect((await notes.getNote(u, ids[0]))!.cards[0].reps).toBe(0);
    await undoBatch(u, r.undoId);
    const theirs = (await q("SELECT id FROM ak_notes WHERE user_id = $1", [other]))[0].id as number;
    await expect(mergeDuplicates(u, [{ keepId: ids[0], removeIds: [theirs], scheduling: "keep" }])).rejects.toThrow("note_not_found");
  });

  it("deletes duplicates (soft, undoable)", async () => {
    const r = await deleteDuplicates(u, [ids[1]]);
    expect((await notes.getNote(u, ids[1]))!.deletedAt).not.toBeNull();
    await undoBatch(u, r.undoId);
    expect((await notes.getNote(u, ids[1]))!.deletedAt).toBeNull();
  });

  it("changes note type with field mapping, keeping card scheduling where ordinals survive", async () => {
    const card = (await q("SELECT id FROM ak_cards WHERE note_id = $1 AND ord = 0", [ids[3]]))[0].id as number;
    await answer(u, card, 3, 500);
    const pv = await changeNoteType(u, { noteIds: [ids[3]], targetType: "basic_reverse", mapping: { front: "back", back: "front" }, preview: true });
    expect(pv).toMatchObject({ convertible: 1, cardsAdded: 1, cardsRemoved: 0 });
    const r = await changeNoteType(u, { noteIds: [ids[3]], targetType: "basic_reverse", mapping: { front: "back", back: "front" } });
    expect(r.changed).toBe(1);
    const n = await notes.getNote(u, ids[3]);
    expect(n!.type).toBe("basic_reverse");
    expect(n!.fields).toEqual({ front: "nothing", back: "plain" });
    expect(n!.cards.map((c) => c.ord)).toEqual([0, 1]);
    expect(n!.cards[0].reps).toBe(1);
    // back to basic removes the reverse card
    const pv2 = await changeNoteType(u, { noteIds: [ids[3]], targetType: "basic", mapping: { front: "front", back: "back" }, preview: true });
    expect(pv2).toMatchObject({ cardsRemoved: 1, cardsAdded: 0 });
    // undo restores type, fields and the original card with its scheduling + review history
    await undoBatch(u, r.undoId!);
    const m = await notes.getNote(u, ids[3]);
    expect(m!.type).toBe("basic");
    expect(m!.fields).toEqual({ front: "plain", back: "nothing" });
    expect(m!.cards.map((c) => c.ord)).toEqual([0]);
    expect(m!.cards[0].id).toBe(card);
    expect(m!.cards[0].reps).toBe(1);
  });

  it("change type to cloze skips notes that would be invalid and reports them; mixed source types rejected", async () => {
    const r = await changeNoteType(u, { noteIds: [ids[3]], targetType: "cloze", mapping: { text: "front", extra: "back" } });
    expect(r.changed).toBe(0);
    expect(r.skipped).toEqual([{ id: ids[3], error: "cloze_required" }]);
    const t = await notes.createNote(u, { deckId: deck, type: "type_in", fields: { front: "t", back: "u" }, tags: [] });
    await expect(changeNoteType(u, { noteIds: [ids[3], t.id], targetType: "basic", mapping: {} })).rejects.toThrow("mixed_types");
    await expect(changeNoteType(u, { noteIds: [ids[3]], targetType: "mcq", mapping: {} })).rejects.toThrow("unsupported_conversion");
  });
});

describe("study modes on real Postgres (no SRS side effects)", () => {
  it("loads items for a deck subtree, a search, or note ids — only the user's own", async () => {
    const all = await getModeItems(u, { deckId: deck });
    expect(all.items.length).toBeGreaterThanOrEqual(4);
    expect(all.key).toBe(`deck:${deck}`);
    const s = await getModeItems(u, { query: "deck:Lang::Sub" });
    expect(s.items.map((i) => i.noteId).sort()).toEqual([ids[2], ids[3]].sort());
    const theirs = (await q("SELECT id FROM ak_notes WHERE user_id = $1", [other]))[0].id as number;
    expect((await getModeItems(u, { noteIds: [theirs, ids[0]] })).items.map((i) => i.noteId)).toEqual([ids[0]]);
    await expect(getModeItems(u, { deckId: otherDeck })).rejects.toThrow();
  });

  it("records best match time separately from revlog and cards", async () => {
    const rev = (await q("SELECT count(*)::int AS n FROM ak_revlog"))[0].n;
    const cardsBefore = JSON.stringify(await q("SELECT id, reps, due, state FROM ak_cards ORDER BY id"));
    const k = `deck:${deck}`;
    expect((await saveModeRecord(u, { key: k, mode: "match", ms: 9000 })).best).toBe(true);
    expect((await saveModeRecord(u, { key: k, mode: "match", ms: 12000 })).best).toBe(false);
    expect((await saveModeRecord(u, { key: k, mode: "match", ms: 8000 })).best).toBe(true);
    await saveModeRecord(u, { key: k, mode: "test", score: 80 });
    await saveModeRecord(other, { key: k, mode: "match", ms: 1000 });
    const rec = await getModeRecords(u, k);
    expect(rec.match).toMatchObject({ bestMs: 8000, plays: 3 });
    expect(rec.test).toMatchObject({ bestScore: 80, plays: 1 });
    expect((await q("SELECT count(*)::int AS n FROM ak_revlog"))[0].n).toBe(rev);
    expect(JSON.stringify(await q("SELECT id, reps, due, state FROM ak_cards ORDER BY id"))).toBe(cardsBefore);
  });
});
