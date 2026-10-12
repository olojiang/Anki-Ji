/** Cross-feature glue on Postgres (PGlite): AnkiConnect + batch editing/undo with custom note types. */
import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import * as decks from "@/server/repo/decks";
import * as notes from "@/server/repo/notes";
import * as cards from "@/server/repo/cards";
import * as nts from "@/server/repo/notetypes";
import { createToken } from "@/server/repo/tokens";
import { handleAnkiConnect } from "@/server/services/ankiconnect";
import { findReplace, findDuplicateGroups, undoBatch } from "@/server/services/batch";
import { q } from "@/server/db";
import { createShare, cloneShare, getPublicShare } from "@/server/services/share";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";

describe("glue: custom note types × AnkiConnect / batch", () => {
  let a: number, b: number, keyA: string, keyB: string, deck: number, ntId: number;
  const call = async (key: string, action: string, params: Record<string, unknown> = {}) =>
    handleAnkiConnect({ action, version: 6, params, key }, null) as Promise<{ result: unknown; error: string | null }>;

  beforeAll(async () => {
    await usePglite();
    a = (await users.createUser("glue-a@test.dev", "h", "A")).id;
    b = (await users.createUser("glue-b@test.dev", "h", "B")).id;
    keyA = (await createToken(a, "t")).token;
    keyB = (await createToken(b, "t")).token;
    deck = (await decks.createDeck(a, { name: "JP" })).id;
    await decks.createDeck(b, { name: "JP" });
    ntId = (await nts.createNoteType(a, {
      name: "Vocab", kind: "standard", css: "",
      fields: [{ id: "w", name: "Word" }, { id: "m", name: "Meaning" }],
      templates: [{ ord: 0, name: "R", front: "{{Word}}", back: "{{Meaning}}" }, { ord: 1, name: "P", front: "{{Meaning}}", back: "{{Word}}" }],
    })).id;
  }, 120_000);

  it("AnkiConnect lists the user's custom types and adds notes with them (isolated per user)", async () => {
    const names = (await call(keyA, "modelNames")).result as string[];
    expect(names).toContain("Basic");
    expect(names).toContain("Vocab");
    expect((await call(keyB, "modelNames")).result as string[]).not.toContain("Vocab");
    expect((await call(keyA, "modelFieldNames", { modelName: "Vocab" })).result).toEqual(["Word", "Meaning"]);

    const r = await call(keyA, "addNote", { note: { deckName: "JP", modelName: "Vocab", fields: { Word: "犬", Meaning: "dog" }, tags: ["yomi"] } });
    expect(r.error).toBeNull();
    const nid = Number(r.result);
    const n = await notes.getNote(a, nid);
    expect(n?.type).toBe("custom");
    expect(n?.notetypeId).toBe(ntId);
    expect(n?.fields.custom).toEqual({ w: "犬", m: "dog" });
    expect((await cards.listCardsForNote(a, nid)).map((c) => c.ord)).toEqual([0, 1]);

    const dup = await call(keyA, "addNote", { note: { deckName: "JP", modelName: "Vocab", fields: { Word: "犬", Meaning: "dog" } } });
    expect(dup.error).toMatch(/duplicate/);
    expect((await call(keyB, "addNote", { note: { deckName: "JP", modelName: "Vocab", fields: { Word: "x" } } })).error).toMatch(/model was not found/);

    const info = ((await call(keyA, "notesInfo", { notes: [nid] })).result as { modelName: string; fields: Record<string, { value: string }> }[])[0];
    expect(info.modelName).toBe("Vocab");
    expect(info.fields.Word.value).toBe("犬");
    expect(info.fields.Meaning.value).toBe("dog");

    expect((await call(keyA, "updateNoteFields", { note: { id: nid, fields: { Meaning: "hound" } } })).error).toBeNull();
    expect((await notes.getNote(a, nid))?.fields.custom).toEqual({ w: "犬", m: "hound" });
    const ci = ((await call(keyA, "cardsInfo", { cards: (await cards.listCardsForNote(a, nid)).map((c) => c.id) })).result as { modelName: string; question: string }[]);
    expect(ci[0].modelName).toBe("Vocab");
    expect(ci[0].question).toContain("犬");
  });

  it("find & replace edits custom notes; undo restores fields and notetype_id", async () => {
    const n = await notes.createNote(a, { deckId: deck, type: "custom", notetypeId: ntId, fields: { custom: { w: "colour", m: "a colour" } }, tags: [] });
    const pv = await findReplace(a, { noteIds: [n.id] }, { find: "colour", replace: "color" }, true);
    expect(pv.matches).toBe(2);
    const res = await findReplace(a, { noteIds: [n.id] }, { find: "colour", replace: "color" }, false);
    expect(res.changed).toBe(1);
    const after = await notes.getNote(a, n.id);
    expect(after?.fields.custom).toEqual({ w: "color", m: "a color" });
    expect((await q("SELECT sort_field FROM ak_notes WHERE id = $1", [n.id]))[0].sort_field).toBe("color");
    await q("UPDATE ak_notes SET notetype_id = NULL WHERE id = $1", [n.id]); // simulate drift
    await undoBatch(a, res.undoId!);
    const back = await notes.getNote(a, n.id);
    expect(back?.fields.custom).toEqual({ w: "colour", m: "a colour" });
    expect(back?.notetypeId).toBe(ntId);
  });

  it("finds duplicate custom notes by their sort field", async () => {
    await notes.createNote(a, { deckId: deck, type: "custom", notetypeId: ntId, fields: { custom: { w: "Apple", m: "1" } }, tags: [] });
    await notes.createNote(a, { deckId: deck, type: "custom", notetypeId: ntId, fields: { custom: { w: "apple", m: "2" } }, tags: [] });
    const groups = await findDuplicateGroups(a, { scope: "type", deckId: deck });
    expect(groups.some((g) => g.key === "apple" && g.notes.length === 2)).toBe(true);
  });

  it("cloning a shared deck brings custom note types along (cards + templates intact)", async () => {
    const shareDeck = (await decks.createDeck(a, { name: "Shared" })).id;
    await notes.createNote(a, { deckId: shareDeck, type: "custom", notetypeId: ntId, fields: { custom: { w: "鳥", m: "bird" } }, tags: ["x"] });
    const sh = await createShare(a, shareDeck, {});
    const pub = await getPublicShare(sh.slug, { countView: false });
    expect(pub?.samples[0].fields.front ?? "").toContain("鳥");
    const res = await cloneShare(b, sh.slug, { limits: { maxNotes: 100, perHour: 100 } });
    expect(res.added).toBe(1);
    expect(res.cards).toBe(2);
    const bTypes = await nts.listNoteTypes(b);
    expect(bTypes.map((t) => t.name)).toContain("Vocab");
    const row = (await q("SELECT id, type, notetype_id, fields, sort_field FROM ak_notes WHERE user_id = $1 AND deck_id = $2", [b, res.rootDeckId]))[0];
    expect(row.type).toBe("custom");
    expect(Number(row.notetype_id)).toBe(bTypes.find((t) => t.name === "Vocab")!.id);
    expect((row.fields as { custom: Record<string, string> }).custom).toEqual({ w: "鳥", m: "bird" });
    expect(row.sort_field).toBe("鳥");
  });
});
