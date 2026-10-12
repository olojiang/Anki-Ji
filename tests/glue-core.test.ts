/** Cross-feature glue (pure): custom note types in .apkg export, AnkiConnect models, batch editing and TTS. */
import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";
import JSZip from "jszip";
import { exportApkg } from "@/core/io/apkg-export";
import { createBackup, type Backup } from "@/core/io/backup";
import { customExportersFor, customImporter, customModelFields, exporterKeyFor } from "@/core/interop/custom";
import { replaceInNote, previewReplace, findDuplicates, firstFieldOf, canConvert } from "@/core/batch";
import { itemsFromNotes } from "@/core/modes";
import { localStudyView, type OfflinePack } from "@/core/offline";
import { defaultDeckConfig, normalizeConfig } from "@/core/config";
import { schedToJSON } from "@/core/sync";
import { newCardState } from "@/core/scheduler";
import { resolveTtsOptions, ttsScopeValid, ttsTypeKey, templateTtsSegments } from "@/core/tts";
import type { NoteTypeDef } from "@/core/notetypes";
import type { NoteFields, NoteType } from "@/core/types";

let SQL: SqlJsStatic;
beforeAll(async () => { SQL = await initSqlJs(); });
const rows = (db: Database, sql: string) => { const r = db.exec(sql); return r.length ? r[0].values.map((v) => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : []; };

const VOCAB: NoteTypeDef & { id: number } = {
  id: 7, name: "Vocab", kind: "standard", css: ".card{color:red}", sortField: 0, markdown: true,
  fields: [{ id: "w", name: "Word" }, { id: "m", name: "Meaning" }, { id: "r", name: "Reading" }],
  templates: [
    { ord: 0, name: "Recognition", front: "{{Word}}", back: "{{FrontSide}}<hr id=answer>{{Meaning}}" },
    { ord: 1, name: "Production", front: "{{Meaning}}", back: "{{FrontSide}}<hr id=answer>{{Word}}" },
  ],
};

function backup(): Backup {
  const created = "2026-09-01T00:00:00.000Z";
  const card = (id: number, noteId: number, ord: number) => ({
    id, noteId, deckId: 1, homeDeckId: null, ord, state: "new" as const, due: created, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0,
    reps: 0, lapses: 0, step: 0, lastReview: null, ease: 0, box: 0, suspended: false, buriedDay: null, flag: 0, leech: false, position: id, createdAt: created,
  });
  return createBackup({
    exportedAt: created, settings: { timezone: "UTC", rolloverHour: 4 }, tags: [],
    decks: [{ id: 1, parentId: null, name: "JP", position: 1, config: {}, filtered: false, filter: null, createdAt: created }],
    notes: [
      { id: 10, deckId: 1, guid: "g10", type: "custom", notetypeId: 7, fields: { custom: { w: "犬", m: "**dog**", r: "いぬ" } }, tags: [], position: 1, createdAt: created, updatedAt: created },
      { id: 11, deckId: 1, guid: "g11", type: "basic", fields: { front: "a", back: "b" }, tags: [], position: 2, createdAt: created, updatedAt: created },
    ],
    cards: [card(100, 10, 0), card(101, 10, 1), card(102, 11, 0)],
    revlog: [], media: [], noteTypes: [VOCAB],
  } as never);
}

describe(".apkg export of custom note types", () => {
  it("keys custom exporters by note type id", () => {
    expect(exporterKeyFor({ type: "custom", notetypeId: 7 })).toBe("custom:7");
    expect(exporterKeyFor({ type: "basic", notetypeId: null })).toBe("basic");
    expect(Object.keys(customExportersFor([VOCAB]))).toEqual(["custom:7"]);
  });
  it("exports custom notes with their own model, fields and templates (no exporters passed)", async () => {
    const { bytes, stats } = await exportApkg({ backup: backup(), includeScheduling: false, SQL });
    expect(stats.notes).toBe(2);
    expect(stats.cards).toBe(3);
    const zip = await JSZip.loadAsync(bytes);
    const db = new SQL.Database(await zip.file("collection.anki2")!.async("uint8array"));
    const models = JSON.parse(String(rows(db, "SELECT models FROM col")[0].models)) as Record<string, { name: string; flds: { name: string }[]; tmpls: { name: string; qfmt: string }[]; css: string }>;
    const vocab = Object.values(models).find((m) => m.name === "Vocab")!;
    expect(vocab.flds.map((f) => f.name)).toEqual(["Word", "Meaning", "Reading"]);
    expect(vocab.tmpls.map((t) => t.name)).toEqual(["Recognition", "Production"]);
    expect(vocab.css).toContain("color:red");
    const notes = rows(db, "SELECT id, mid, flds FROM notes ORDER BY id");
    const custom = notes.find((n) => String(n.flds).startsWith("犬"))!;
    expect(String(custom.flds).split("\x1f")).toEqual(["犬", "<strong>dog</strong>", "いぬ"]);
    const ords = rows(db, `SELECT ord FROM cards WHERE nid = ${custom.id} ORDER BY ord`).map((r) => Number(r.ord));
    expect(ords).toEqual([0, 1]);
  });
});

describe("AnkiConnect adapter for custom note types", () => {
  it("maps Anki field names to field ids and back", () => {
    const imp = customImporter(VOCAB);
    expect(imp.model.name).toBe("Vocab");
    expect(imp.model.fields).toEqual(["Word", "Meaning", "Reading"]);
    expect(imp.noteType).toBe("custom");
    expect(imp.notetypeId).toBe(7);
    expect(imp.fromAnki({ Word: "猫", Meaning: "cat" })).toEqual({ custom: { w: "猫", m: "cat", r: "" } });
    const mf = customModelFields(VOCAB, { custom: { w: "猫", m: "cat" } });
    expect(mf.model.name).toBe("Vocab");
    expect(mf.values).toEqual(["猫", "cat", ""]);
  });
});

describe("batch editing with custom fields", () => {
  const note = { id: 1, type: "custom" as const, fields: { custom: { w: "colour", m: "the colour red", r: "" } } };
  it("find & replace edits custom field values", () => {
    const r = replaceInNote(note.type, note.fields, { find: "colour", replace: "color" });
    expect(r.count).toBe(2);
    expect(r.fields.custom).toEqual({ w: "color", m: "the color red", r: "" });
    expect(r.changed).toEqual(["custom:w", "custom:m"]);
    expect(replaceInNote(note.type, note.fields, { find: "colour", replace: "x", fields: ["custom:m"] }).fields.custom).toEqual({ w: "colour", m: "the x red", r: "" });
    expect(replaceInNote(note.type, note.fields, { find: "colour", replace: "x", fields: ["front"] }).count).toBe(0);
    const pv = previewReplace([note], { find: "colour", replace: "color" });
    expect(pv.samples[0]).toMatchObject({ field: "custom:w", before: "colour", after: "color" });
  });
  it("duplicates use the custom sort field and separate note types in type scope", () => {
    expect(firstFieldOf("custom", { custom: { w: "Dog", m: "x" } })).toBe("Dog");
    expect(firstFieldOf("custom", { custom: { w: "Dog", m: "x" } }, "x")).toBe("x");
    const notes: { id: number; deckId: number; type: NoteType; notetypeId: number | null; sortField: string; fields: NoteFields }[] = [
      { id: 1, deckId: 1, type: "custom" as const, notetypeId: 7, sortField: "dog", fields: { custom: { m: "a", w: "dog" } } },
      { id: 2, deckId: 1, type: "custom" as const, notetypeId: 7, sortField: "Dog", fields: { custom: { w: "Dog" } } },
      { id: 3, deckId: 1, type: "custom" as const, notetypeId: 8, sortField: "dog", fields: { custom: { w: "dog" } } },
      { id: 4, deckId: 1, type: "basic" as const, notetypeId: null, sortField: "dog", fields: { front: "dog" } },
    ];
    expect(findDuplicates(notes, "collection").map((g) => g.ids)).toEqual([[1, 2, 3, 4]]);
    expect(findDuplicates(notes, "type").map((g) => g.ids)).toEqual([[1, 2]]);
  });
  it("never converts into or out of custom types", () => {
    expect(canConvert("custom", "basic")).toBe(false);
    expect(canConvert("basic", "custom")).toBe(false);
  });
});

describe("TTS scopes + {{tts}} for custom note types", () => {
  it("keys custom note types by id", () => {
    expect(ttsTypeKey("basic")).toBe("type:basic");
    expect(ttsTypeKey("custom", 12)).toBe("type:nt-12");
    expect(ttsScopeValid("type:nt-12")).toBe(true);
    const o = resolveTtsOptions({ default: { rate: 1 }, "type:nt-12": { rate: 1.5, frontLang: "ja-JP" } }, { decks: [], noteType: "nt-12" });
    expect(o.rate).toBe(1.5);
    expect(o.frontLang).toBe("ja-JP");
  });
  it("turns a template {{tts}} element into speech segments", () => {
    expect(templateTtsSegments("犬", "ja_JP")).toEqual([{ text: "犬", lang: "ja-JP" }]);
    expect(templateTtsSegments("hello", undefined)).toEqual([{ text: "hello", lang: "en-US" }]);
    expect(templateTtsSegments("  ", "en_US")).toEqual([]);
  });
});

describe("study modes with custom notes", () => {
  it("uses the first two non-empty custom fields as prompt / answer", () => {
    const items = itemsFromNotes([{ id: 5, type: "custom", fields: { custom: { w: "犬", r: "", m: "dog" } } }] as never);
    expect(items.map((i) => [i.promptText, i.answerText])).toEqual([["犬", "dog"]]);
    expect(itemsFromNotes([{ id: 5, type: "custom", fields: { custom: { w: "犬", r: "", m: "dog" } } }] as never, { direction: "reverse" }).map((i) => i.promptText)).toEqual(["dog"]);
    // jsonb reorders keys: fieldOrder (from the note type) wins
    expect(itemsFromNotes([{ id: 6, type: "custom", fieldOrder: ["w", "m"], fields: { custom: { m: "dog", w: "犬" } } }]).map((i) => [i.promptText, i.answerText])).toEqual([["犬", "dog"]]);
  });
});

describe("offline packs with custom notes", () => {
  it("renders custom notes offline with their note type templates", () => {
    const now = new Date("2026-10-12T04:00:00.000Z");
    const pack: OfflinePack = {
      v: 1, uid: 1, deckId: 1, deckName: "JP", filtered: false, generatedAt: now.toISOString(), tz: "UTC", rollover: 4, day: 0,
      decks: [{ id: 1, parentId: null, name: "JP", position: 0, config: normalizeConfig(defaultDeckConfig()), filtered: false }],
      cards: [{ id: 1, noteId: 1, deckId: 1, homeDeckId: null, ord: 1, suspended: false, buriedDay: null, flag: 0, leech: false, position: 1, createdAt: new Date(0).toISOString(), ...schedToJSON(newCardState()) }],
      notes: [{ id: 1, type: "custom", notetypeId: 7, fields: { custom: { w: "犬", m: "dog", r: "" } }, tags: [] }],
      noteTypes: [VOCAB],
      studied: [], notesReviewedToday: [], load: [], media: [],
    };
    const v = localStudyView(pack, now);
    expect(v.card?.kind).toBe("html");
    expect(v.card?.front).toContain("dog"); // Production template: {{Meaning}}
    expect(v.card?.custom?.noteType.id).toBe(7);
  });
});
