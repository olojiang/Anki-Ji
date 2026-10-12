import { describe, it, expect } from "vitest";
import { parseDelimited, toDelimited, detectDelimiter, rowsToNotes, notesToRows } from "@/core/io/csv";

describe("delimited text", () => {
  it("parses quotes, embedded delimiters/newlines, escaped quotes, CRLF and BOM", () => {
    const text = '\uFEFFa,"b,c","line1\nline2"\r\n"he said ""hi""",x,\r\n';
    expect(parseDelimited(text, ",")).toEqual([["a", "b,c", "line1\nline2"], ['he said "hi"', "x", ""]]);
  });
  it("detects tab, comma and semicolon", () => {
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a,b\n1,2")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
  });
  it("round-trips through toDelimited", () => {
    const rows = [["x", 'q"uote', "comma,here"], ["multi\nline", "", "tab\there"]];
    for (const d of [",", "\t"]) expect(parseDelimited(toDelimited(rows, d), d)).toEqual(rows);
  });
});

describe("rows ↔ notes", () => {
  it("imports a plain two-column file as basic notes into the default deck", () => {
    const { notes, errors } = rowsToNotes([["apple", "苹果"], ["dog", "狗"]], { defaultDeck: "Default" });
    expect(errors).toEqual([]);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ deckPath: "Default", type: "basic", fields: { front: "apple", back: "苹果" }, tags: [] });
  });
  it("understands headers in English and Chinese, tags and cloze auto-detection", () => {
    const rows = [["牌组", "正面", "背面", "标签"], ["Lang::EN", "{{c1::Paris}} is in France", "geo", "geo europe::fr"], ["Lang::EN", "Q", "A", ""]];
    const { notes } = rowsToNotes(rows, { defaultDeck: "Default" });
    expect(notes[0]).toMatchObject({ deckPath: "Lang::EN", type: "cloze", fields: { text: "{{c1::Paris}} is in France", extra: "geo" }, tags: ["geo", "europe::fr"] });
    expect(notes[1].type).toBe("basic");
  });
  it("reports rows without content", () => {
    const { notes, errors } = rowsToNotes([["front", "back"], ["", ""], ["a", "b"]], { defaultDeck: "D" });
    expect(notes).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
  it("export → import is lossless via the fields_json column", () => {
    const notes = [
      { deckPath: "A::B", type: "mcq" as const, fields: { question: "2+2?", options: ["3", "4"], correct: [1], explanation: "math" }, tags: ["math"] },
      { deckPath: "A", type: "basic_reverse" as const, fields: { front: "f, with comma", back: "b\nnew line" }, tags: [] },
    ];
    const rows = notesToRows(notes);
    expect(rows[0]).toEqual(["deck", "type", "front", "back", "tags", "fields_json"]);
    const back = rowsToNotes(parseDelimited(toDelimited(rows, ","), ","), { defaultDeck: "X" });
    expect(back.notes).toEqual(notes);
  });
});

import { flatToBackup } from "@/core/io/csv";
import { compareTyped } from "@/core/typed";
describe("flat notes → backup (shared import pipeline)", () => {
  it("creates the deck tree and one note per row with unique guids", () => {
    const b = flatToBackup([
      { deckPath: "A::B", type: "basic", fields: { front: "1", back: "2" }, tags: [] },
      { deckPath: "a::b", type: "basic", fields: { front: "3", back: "4" }, tags: ["t"] },
      { deckPath: "C", type: "cloze", fields: { text: "{{c1::x}}" }, tags: [] },
    ]);
    expect(b.decks.map((d) => d.name)).toEqual(["A", "B", "C"]);
    expect(b.notes[0].deckId).toBe(b.notes[1].deckId);
    expect(new Set(b.notes.map((n) => n.guid)).size).toBe(3);
    expect(b.cards).toEqual([]);
  });
});
describe("typed answer comparison", () => {
  it("marks matching, missing and wrong characters", () => {
    expect(compareTyped("hello", "hello")).toEqual({ correct: true, segments: [{ text: "hello", kind: "ok" }] });
    const r = compareTyped("helo", "hello");
    expect(r.correct).toBe(false);
    expect(r.segments.map((s) => s.kind)).toContain("missing");
    expect(compareTyped(" Hello ", "hello").correct).toBe(true); // trims, case-insensitive
    expect(compareTyped("hxllo", "hello").segments.some((s) => s.kind === "wrong")).toBe(true);
  });
});
