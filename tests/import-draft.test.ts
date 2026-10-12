import { describe, it, expect } from "vitest";
import { draftToBackup, noteGuid, mediaRef, previewImport, newDraft, mediaNeededFor, type ImportDraft } from "@/core/io/draft";
import { flatToBackup } from "@/core/io/csv";
import { importDecks, importNotes } from "@/core/io/importer";
import { nestNotes } from "@/core/io/backup";
import { cardOrdinals } from "@/core/notes";
import { memorySink } from "./helpers/memsink";

const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

function sampleDraft(): ImportDraft {
  const d = newDraft("markdown");
  d.notes.push(
    { deckPath: "Bio::Cell", type: "basic", fields: { front: "Cell?", back: `Unit ![c](${mediaRef("cell.png")})` }, tags: ["bio"] },
    { deckPath: "bio::cell", type: "basic_reverse", fields: { front: "犬", back: "dog" }, tags: [] },
    { deckPath: "Bio", type: "cloze", fields: { text: "{{c1::DNA}} in {{c2::nucleus}}", extra: "" }, tags: ["bio", "dna"] },
    { deckPath: "Other", type: "basic", fields: { back: `Unit ![c](${mediaRef("cell.png")})`, front: "Cell?" }, tags: [] }, // duplicate content
  );
  d.media.push({ name: "cell.png", data: png }, { name: "unused.png", data: png });
  return d;
}

describe("ImportDraft → backup (shared normalized pipeline)", () => {
  it("derives stable content guids independent of field order and deck", () => {
    const a = noteGuid({ deckPath: "A", type: "basic", fields: { front: "q", back: "a" }, tags: [] });
    const b = noteGuid({ deckPath: "B", type: "basic", fields: { back: "a", front: "q" }, tags: ["x"] });
    const c = noteGuid({ deckPath: "A", type: "basic", fields: { front: "q", back: "A" }, tags: [] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^imp-[0-9a-z]+$/);
  });
  it("keeps an explicit guid when the source provides one", () => {
    expect(noteGuid({ deckPath: "A", type: "basic", fields: { front: "q" }, tags: [], guid: "mochi-abc" })).toBe("mochi-abc");
  });
  it("builds a case-insensitive deck tree, drops duplicate notes and unreferenced media", () => {
    const { backup, duplicates } = draftToBackup(sampleDraft(), "2026-10-12T00:00:00.000Z");
    expect(backup.decks.map((d) => d.name)).toEqual(["Bio", "Cell"]); // the duplicate's deck is never created
    expect(backup.notes).toHaveLength(3);
    expect(duplicates).toBe(1);
    expect(backup.notes[0].deckId).toBe(backup.notes[1].deckId);
    expect(backup.media).toHaveLength(1);
    expect(backup.media[0]).toMatchObject({ url: mediaRef("cell.png"), filename: "cell.png", contentType: "image/png", size: png.length });
    expect(backup.media[0].data).toBeTruthy();
    expect(backup.tags).toEqual(["bio", "dna"]);
  });
  it("is idempotent: importing the same draft twice skips everything the second time", async () => {
    const { sink, db } = memorySink();
    for (let i = 0; i < 2; i++) {
      const { backup } = draftToBackup(sampleDraft());
      const deckMap = await importDecks(sink, backup.decks, db.decks.map((d) => ({ id: d.id as number, parentId: (d.parentId as number) ?? null, name: d.name as string })));
      const notes = nestNotes(backup).map((n) => ({ ...n, cards: cardOrdinals(n.type, n.fields).map((ord) => ({ ord, revlog: [] })) }));
      const res = await importNotes(sink, notes as never, deckMap);
      expect(res.skipped).toBe(i === 0 ? 0 : 3);
    }
    expect(db.notes).toHaveLength(3);
    expect(db.decks).toHaveLength(2);
  });
  it("CSV import now also gets deterministic guids (re-import dedupes)", () => {
    const rows = [{ deckPath: "A", type: "basic" as const, fields: { front: "1", back: "2" }, tags: [] }];
    expect(flatToBackup(rows).notes[0].guid).toBe(flatToBackup(rows).notes[0].guid);
  });
  it("lists which media only existing notes need, so re-imports do not re-upload", () => {
    const { backup } = draftToBackup(sampleDraft());
    const cellNote = backup.notes.find((n) => n.fields.front === "Cell?")!;
    expect(mediaNeededFor(backup, new Set([cellNote.guid])).map((m) => m.filename)).toEqual([]);
    expect(mediaNeededFor(backup, new Set()).map((m) => m.filename)).toEqual(["cell.png"]);
  });
});

describe("import preview", () => {
  it("counts notes, cards, decks, media and shows sample cards as plain text", () => {
    const { backup, duplicates } = draftToBackup(sampleDraft());
    const p = previewImport(backup, { duplicates, errors: [], warnings: ["w"], format: "markdown" });
    expect(p).toMatchObject({ format: "markdown", notes: 3, cards: 1 + 2 + 2, media: 1, duplicates: 1, warnings: ["w"] });
    expect(p.decks).toEqual(["Bio", "Bio::Cell"]);
    expect(p.samples[0]).toEqual({ deck: "Bio::Cell", type: "basic", front: "Cell?", back: "Unit", tags: ["bio"] });
    expect(p.samples[2].front).toBe("[DNA] in [nucleus]");
    expect(p.existing).toBe(0);
  });
  it("marks notes that already exist", () => {
    const { backup } = draftToBackup(sampleDraft());
    const p = previewImport(backup, { existingGuids: new Set([backup.notes[0].guid]) });
    expect(p.existing).toBe(1);
  });
});
