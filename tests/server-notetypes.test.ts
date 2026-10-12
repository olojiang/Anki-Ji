import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import * as decks from "@/server/repo/decks";
import * as notes from "@/server/repo/notes";
import * as cards from "@/server/repo/cards";
import * as nts from "@/server/repo/notetypes";
import { getStudyState } from "@/server/services/study";
import { searchNotes } from "@/server/services/browse";
import { exportBackup, importBackupDecks, importBackupNotes } from "@/server/services/backup";
import { nestNotes } from "@/core/io/backup";
import { q } from "@/server/db";
import type { NoteTypeDef } from "@/core/notetypes";

const def = (over: Partial<NoteTypeDef> = {}): Partial<NoteTypeDef> => ({
  name: "Vocab", kind: "standard", css: ".card{font-size:22px}",
  fields: [{ id: "w", name: "Word" }, { id: "m", name: "Meaning" }, { id: "r", name: "Reading" }],
  templates: [
    { ord: 0, name: "Recognition", front: "{{Word}}", back: "{{FrontSide}}<hr id=answer>{{Meaning}}" },
    { ord: 1, name: "Production", front: "{{Meaning}}", back: "{{FrontSide}}<hr id=answer>{{Word}}" },
  ],
  ...over,
});

describe("note types on Postgres (PGlite)", () => {
  let a: number, b: number, deck: number;
  beforeAll(async () => {
    await usePglite();
    a = (await users.createUser("nt-a@test.dev", "h", "A")).id;
    b = (await users.createUser("nt-b@test.dev", "h", "B")).id;
    deck = (await decks.createDeck(a, { name: "JP" })).id;
  });

  it("creates, lists (with stock types) and isolates note types per user", async () => {
    const t = await nts.createNoteType(a, def());
    expect(t.id).toBeGreaterThan(0);
    expect(t.fields.map((f) => f.id)).toEqual(["w", "m", "r"]);
    const list = await nts.listNoteTypes(a);
    expect(list.some((x) => x.id === t.id && x.noteCount === 0)).toBe(true);
    expect(await nts.listNoteTypes(b)).toEqual([]);
    expect(await nts.getNoteType(b, t.id)).toBeNull();
    const all = await nts.listAllNoteTypes(a);
    expect(all.filter((x) => x.readOnly).length).toBe(7);
  });

  it("rejects invalid definitions", async () => {
    await expect(nts.createNoteType(a, def({ templates: [{ ord: 0, name: "X", front: "{{Nope}}", back: "" }] }))).rejects.toThrow(/unknown_field/);
    await expect(nts.createNoteType(a, def({ name: "" }))).rejects.toThrow(/empty_name/);
  });

  it("clones stock and custom types", async () => {
    const c = await nts.cloneNoteType(a, "stock:basic_reverse", "My reverse");
    expect(c.templates).toHaveLength(2);
    expect(c.name).toBe("My reverse");
    const c2 = await nts.cloneNoteType(a, c.id, "");
    expect(c2.name).toMatch(/My reverse/);
    expect(c2.id).not.toBe(c.id);
    await expect(nts.cloneNoteType(a, "stock:mcq", "x")).rejects.toThrow(/not_clonable/);
  });

  it("creates custom notes with one card per non-empty template, renders them in study + browse", async () => {
    const t = (await nts.listNoteTypes(a)).find((x) => x.name === "Vocab")!;
    const n = await notes.createNote(a, { deckId: deck, type: "custom", notetypeId: t.id, fields: { custom: { w: "犬", m: "dog", r: "", junk: "x" } as Record<string, string> }, tags: ["jp"] });
    expect(n.notetypeId).toBe(t.id);
    expect(n.fields.custom).toEqual({ w: "犬", m: "dog", r: "" });
    expect((await cards.listCardsForNote(a, n.id)).map((c) => c.ord)).toEqual([0, 1]);
    const n2 = await notes.createNote(a, { deckId: deck, type: "custom", notetypeId: t.id, fields: { custom: { w: "猫", m: "", r: "" } }, tags: [] });
    expect((await cards.listCardsForNote(a, n2.id)).map((c) => c.ord)).toEqual([0]);
    await expect(notes.createNote(a, { deckId: deck, type: "custom", notetypeId: t.id, fields: { custom: {} }, tags: [] })).rejects.toThrow(/no_cards/);
    await expect(notes.createNote(a, { deckId: deck, type: "custom", fields: { custom: { w: "x" } }, tags: [] })).rejects.toThrow(/notetype/);
    await expect(notes.createNote(b, { deckId: (await decks.createDeck(b, { name: "B" })).id, type: "custom", notetypeId: t.id, fields: { custom: { w: "x" } }, tags: [] })).rejects.toThrow(/notetype/);

    const got = await notes.getNote(a, n.id);
    expect(got?.noteType?.name).toBe("Vocab");

    const st = await getStudyState(a, deck);
    expect(st?.card?.kind).toBe("html");
    expect(st?.card?.css).toContain("font-size:22px");
    expect(st?.card?.custom?.noteType.id).toBe(t.id);

    const rows = await searchNotes(a, "dog");
    expect(rows.length).toBe(2);
    expect(rows[0].noteTypeName).toBe("Vocab");
    expect((await searchNotes(a, "note:vocab")).length).toBe(3);
    expect(rows.find((r) => r.ord === 0)?.sortField).toBe("犬");
  });

  it("editing a note regenerates cards but keeps studied ones", async () => {
    const t = (await nts.listNoteTypes(a)).find((x) => x.name === "Vocab")!;
    const n = await notes.createNote(a, { deckId: deck, type: "custom", notetypeId: t.id, fields: { custom: { w: "山", m: "mountain" } }, tags: [] });
    const [c0, c1] = await cards.listCardsForNote(a, n.id);
    await q("UPDATE ak_cards SET state = 'review', reps = 3 WHERE id = $1", [c1.id]);
    await notes.updateNote(a, n.id, { fields: { custom: { w: "", m: "mountain" } } });
    // card 0 (new, front now empty) removed, studied card 1 kept
    expect((await cards.listCardsForNote(a, n.id)).map((c) => c.id)).toEqual([c1.id]);
    await notes.updateNote(a, n.id, { fields: { custom: { w: "山", m: "" } } });
    const after = await cards.listCardsForNote(a, n.id);
    expect(after.map((c) => c.ord)).toEqual([0, 1]);
    expect(after.find((c) => c.ord === 1)?.reps).toBe(3);
    expect(after.find((c) => c.ord === 0)?.id).not.toBe(c0.id);
  });

  it("updating a note type adds/removes template cards, renames fields, drops deleted field data, recomputes sort fields", async () => {
    const t = await nts.createNoteType(a, def({ name: "Vocab2" }));
    const n = await notes.createNote(a, { deckId: deck, type: "custom", notetypeId: t.id, fields: { custom: { w: "水", m: "water", r: "みず" } }, tags: [] });
    const before = await cards.listCardsForNote(a, n.id);
    await q("UPDATE ak_cards SET state = 'review', reps = 4 WHERE id = $1", [before[0].id]);

    // add a Reading template, rename Word→Term, make Meaning the sort field
    const next = {
      ...t, sortField: 1,
      fields: [{ id: "w", name: "Term" }, { id: "m", name: "Meaning" }, { id: "r", name: "Reading" }],
      templates: [
        { ord: 0, name: "Recognition", front: "{{Term}}", back: "{{FrontSide}}<hr id=answer>{{Meaning}}" },
        { ord: 1, name: "Production", front: "{{Meaning}}", back: "{{FrontSide}}<hr id=answer>{{Term}}" },
        { ord: 2, name: "Reading", front: "{{#Reading}}{{Term}}{{/Reading}}", back: "{{Reading}}" },
      ],
    };
    const r1 = await nts.updateNoteType(a, t.id, next);
    expect(r1.added).toBe(1);
    let cs = await cards.listCardsForNote(a, n.id);
    expect(cs.map((c) => c.ord)).toEqual([0, 1, 2]);
    expect(cs[0].id).toBe(before[0].id);
    expect(cs[0].reps).toBe(4); // scheduling preserved
    expect((await notes.getNote(a, n.id))?.sortField).toBe("water");

    // delete templates 0 (studied) + 2 and the Reading field
    const r2 = await nts.updateNoteType(a, t.id, {
      ...next,
      fields: [{ id: "w", name: "Term" }, { id: "m", name: "Meaning" }],
      templates: [next.templates[1]],
    });
    expect(r2.removed).toBe(2); // templates 0 (studied) and 2
    cs = await cards.listCardsForNote(a, n.id);
    expect(cs.map((c) => c.ord)).toEqual([1]);
    expect((await notes.getNote(a, n.id))?.fields.custom).toEqual({ w: "水", m: "water" });
  });

  it("refuses to change a type's kind or delete a type that has notes; deletes unused types", async () => {
    const t = (await nts.listNoteTypes(a)).find((x) => x.name === "Vocab")!;
    await expect(nts.updateNoteType(a, t.id, { ...t, kind: "cloze" })).rejects.toThrow(/kind/);
    await expect(nts.deleteNoteType(a, t.id)).rejects.toThrow(/notetype_in_use/);
    const u = await nts.createNoteType(a, def({ name: "Unused" }));
    await nts.deleteNoteType(a, u.id);
    expect(await nts.getNoteType(a, u.id)).toBeNull();
  });

  it("supports custom cloze types", async () => {
    const t = await nts.cloneNoteType(a, "stock:cloze", "My cloze");
    const [text, extra] = t.fields.map((f) => f.id);
    const n = await notes.createNote(a, { deckId: deck, type: "custom", notetypeId: t.id, fields: { custom: { [text]: "{{c1::a}} {{c2::b}}", [extra]: "" } }, tags: [] });
    expect((await cards.listCardsForNote(a, n.id)).map((c) => c.ord)).toEqual([1, 2]);
    await expect(notes.createNote(a, { deckId: deck, type: "custom", notetypeId: t.id, fields: { custom: { [text]: "none" } }, tags: [] })).rejects.toThrow(/cloze_required/);
  });

  it("round-trips custom note types through the JSON backup", async () => {
    const backup = await exportBackup(a);
    expect(backup.noteTypes?.length).toBeGreaterThanOrEqual(3);
    const custom = backup.notes.find((x) => x.type === "custom")!;
    expect(custom.notetypeId).toBeTruthy();

    const c = (await users.createUser("nt-c@test.dev", "h", "C")).id;
    const ntMap = await nts.importNoteTypes(c, backup.noteTypes ?? []);
    const deckMap = await importBackupDecks(c, backup.decks);
    const res = await importBackupNotes(c, nestNotes(backup), deckMap, ntMap);
    expect(res.notes).toBe(backup.notes.length);
    const mine = await nts.listNoteTypes(c);
    expect(mine.map((x) => x.name).sort()).toEqual((backup.noteTypes ?? []).map((x) => x.name).sort());
    const rows = await searchNotes(c, "dog");
    expect(rows.length).toBe(2);
    // re-importing the same types reuses them (same source key)
    const again = await nts.importNoteTypes(c, backup.noteTypes ?? []);
    expect(Object.values(again).sort()).toEqual(Object.values(ntMap).sort());
    expect((await nts.listNoteTypes(c)).length).toBe(mine.length);
  });

  it("imports custom notes whose note type is missing as basic notes", async () => {
    const d = (await users.createUser("nt-d@test.dev", "h", "D")).id;
    const deckMap = await importBackupDecks(d, [{ id: 1, parentId: null, name: "X", position: 1, config: {}, filtered: false, filter: null, createdAt: new Date().toISOString() }]);
    const now = new Date().toISOString();
    const res = await importBackupNotes(d, nestNotes({
      notes: [{ id: 1, deckId: 1, guid: "orphan-1", type: "custom", notetypeId: 999, fields: { custom: { a: "front", b: "back" } }, tags: [], position: 1, createdAt: now, updatedAt: now }],
      cards: [], revlog: [],
    }), deckMap, {});
    expect(res.notes).toBe(1);
    const rows = await searchNotes(d, "");
    expect(rows[0].type).toBe("basic");
  });

  it("deleting an account removes its note types and custom notes (FK cascade)", async () => {
    const e = (await users.createUser("nt-e@test.dev", "h", "E")).id;
    const d = (await decks.createDeck(e, { name: "E" })).id;
    const t = await nts.createNoteType(e, def());
    await notes.createNote(e, { deckId: d, type: "custom", notetypeId: t.id, fields: { custom: { w: "x", m: "y" } }, tags: [] });
    await users.deleteUser(e);
    expect(await q("SELECT 1 FROM ak_notetypes WHERE user_id = $1", [e])).toEqual([]);
    expect(await q("SELECT 1 FROM ak_notes WHERE user_id = $1", [e])).toEqual([]);
  });
});
