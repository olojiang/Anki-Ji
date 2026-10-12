import { describe, it, expect } from "vitest";
import {
  buildPattern, replaceInNote, previewReplace, noteTextFields, firstFieldOf, normalizeFirstField, findDuplicates, planMerge, bestCardsByOrd,
  STOCK_FIELDS, CONVERTIBLE_TYPES, canConvert, defaultFieldMapping, mapFieldValues, convertStockNote,
} from "@/core/batch";

describe("find & replace", () => {
  it("builds plain patterns with escaping and case options", () => {
    const p = buildPattern({ find: "a.b", replace: "" });
    expect("a.b axb A.B".match(p)).toEqual(["a.b", "A.B"]);
    const cs = buildPattern({ find: "a.b", replace: "", caseSensitive: true });
    expect("a.b A.B".match(cs)).toEqual(["a.b"]);
  });
  it("rejects empty and invalid regex", () => {
    expect(() => buildPattern({ find: "", replace: "x" })).toThrow("empty_find");
    expect(() => buildPattern({ find: "(", replace: "x", regex: true })).toThrow("invalid_regex");
  });
  it("replaces in all text fields with literal replacement for plain mode", () => {
    const r = replaceInNote("basic", { front: "colour red", back: "the colour" }, { find: "colour", replace: "$1color" });
    expect(r.fields).toEqual({ front: "$1color red", back: "the $1color" });
    expect(r.count).toBe(2);
    expect(r.changed).toEqual(["front", "back"]);
  });
  it("supports regex groups and field selection", () => {
    const r = replaceInNote("basic", { front: "2024-01-05", back: "2024-01-05" }, { find: "(\\d+)-(\\d+)-(\\d+)", replace: "$3/$2/$1", regex: true, fields: ["back"] });
    expect(r.fields).toEqual({ front: "2024-01-05", back: "05/01/2024" });
    expect(r.count).toBe(1);
  });
  it("replaces inside mcq options and leaves non-text fields alone", () => {
    const r = replaceInNote("mcq", { question: "Pick cat", options: ["cat", "dog"], correct: [0] }, { find: "cat", replace: "lion" });
    expect(r.fields).toEqual({ question: "Pick lion", options: ["lion", "dog"], correct: [0] });
    expect(r.count).toBe(2);
    expect(noteTextFields("mcq")).toEqual(["question", "options", "explanation"]);
    expect(noteTextFields("cloze")).toEqual(["text", "extra"]);
  });
  it("previews counts across notes without mutating", () => {
    const notes = [
      { id: 1, type: "basic" as const, fields: { front: "Foo foo", back: "x" } },
      { id: 2, type: "basic" as const, fields: { front: "bar", back: "y" } },
      { id: 3, type: "cloze" as const, fields: { text: "{{c1::foo}}", extra: "" } },
    ];
    const p = previewReplace(notes, { find: "foo", replace: "baz" });
    expect(p).toMatchObject({ notes: 2, matches: 3 });
    expect(p.samples[0]).toMatchObject({ noteId: 1, field: "front", before: "Foo foo", after: "baz baz" });
    expect(notes[0].fields.front).toBe("Foo foo");
    expect(previewReplace(notes, { find: "foo", replace: "baz", caseSensitive: true }).matches).toBe(2);
  });
});

describe("duplicates", () => {
  it("normalizes the first field (trim, case, html)", () => {
    expect(normalizeFirstField("  <b>Hello</b>&nbsp;World ")).toBe("hello world");
    expect(firstFieldOf("basic", { front: "F", back: "B" })).toBe("F");
    expect(firstFieldOf("cloze", { text: "T" })).toBe("T");
    expect(firstFieldOf("mcq", { question: "Q" })).toBe("Q");
  });
  const notes = [
    { id: 1, deckId: 10, type: "basic" as const, fields: { front: "Apple", back: "a" } },
    { id: 2, deckId: 10, type: "basic" as const, fields: { front: " <i>apple</i> ", back: "b" } },
    { id: 3, deckId: 11, type: "basic" as const, fields: { front: "APPLE", back: "c" } },
    { id: 4, deckId: 11, type: "type_in" as const, fields: { front: "apple", back: "d" } },
    { id: 5, deckId: 10, type: "basic" as const, fields: { front: "pear", back: "e" } },
    { id: 6, deckId: 10, type: "basic" as const, fields: { front: "  ", back: "e" } },
    { id: 7, deckId: 10, type: "basic" as const, fields: { front: "", back: "f" } },
  ];
  it("groups by scope", () => {
    expect(findDuplicates(notes, "collection")).toEqual([{ key: "apple", ids: [1, 2, 3, 4] }]);
    expect(findDuplicates(notes, "type").map((g) => g.ids)).toEqual([[1, 2, 3]]);
    expect(findDuplicates(notes, "deck").map((g) => g.ids)).toEqual([[1, 2], [3, 4]]);
  });
  it("plans a merge: keep one, union tags, remove the rest", () => {
    const plan = planMerge([{ id: 1, tags: ["a", "b"] }, { id: 2, tags: ["b", "c"] }, { id: 3, tags: [] }], 2);
    expect(plan).toEqual({ keepId: 2, removeIds: [1, 3], tags: ["b", "c", "a"] });
    expect(() => planMerge([{ id: 1, tags: [] }], 9)).toThrow("keep_not_in_group");
  });
  it("picks the most advanced card per ordinal", () => {
    const best = bestCardsByOrd([
      { id: 100, noteId: 1, ord: 0, reps: 2, lastReview: "2026-01-01T00:00:00Z" },
      { id: 200, noteId: 2, ord: 0, reps: 5, lastReview: "2026-01-02T00:00:00Z" },
      { id: 201, noteId: 2, ord: 1, reps: 0, lastReview: null },
      { id: 300, noteId: 3, ord: 0, reps: 5, lastReview: "2026-02-01T00:00:00Z" },
    ]);
    expect(best.get(0)).toBe(300);
    expect(best.get(1)).toBe(201);
  });
});

describe("change note type", () => {
  it("exposes stock field lists and convertible types", () => {
    expect(STOCK_FIELDS.basic).toEqual(["front", "back"]);
    expect(STOCK_FIELDS.cloze).toEqual(["text", "extra"]);
    expect(CONVERTIBLE_TYPES).toEqual(expect.arrayContaining(["basic", "basic_reverse", "basic_optional_reverse", "type_in", "cloze"]));
    expect(canConvert("basic", "type_in")).toBe(true);
    expect(canConvert("basic", "basic")).toBe(false);
    expect(canConvert("mcq", "basic")).toBe(false);
  });
  it("default mapping matches by name, then by position", () => {
    expect(defaultFieldMapping(["front", "back"], ["front", "back"])).toEqual({ front: "front", back: "back" });
    expect(defaultFieldMapping(["front", "back"], ["text", "extra"])).toEqual({ text: "front", extra: "back" });
    expect(defaultFieldMapping(["text", "extra"], ["front", "back", "hint"])).toEqual({ front: "text", back: "extra", hint: null });
    expect(defaultFieldMapping(["Word", "Meaning", "Example"], ["Meaning", "Word"])).toEqual({ Meaning: "Meaning", Word: "Word" });
  });
  it("maps values via any source/target field lists (extensible to custom types)", () => {
    const out = mapFieldValues(["Word", "Meaning", "Example"], ["Front", "Back"], { Front: "Meaning", Back: "Word" }, { Word: "犬", Meaning: "dog", Example: "x" });
    expect(out).toEqual({ Front: "dog", Back: "犬" });
    expect(mapFieldValues(["a"], ["x", "y"], { x: "a", y: null }, { a: "1" })).toEqual({ x: "1", y: "" });
    expect(() => mapFieldValues(["a"], ["x"], { x: "nope" }, { a: "1" })).toThrow("invalid_mapping");
    expect(() => mapFieldValues(["a"], ["x"], { z: "a" }, { a: "1" })).toThrow("invalid_mapping");
  });
  it("converts stock notes and keeps the reverse card when going to optional reverse", () => {
    expect(convertStockNote("basic", "type_in", { front: "a", back: "b" }, { front: "front", back: "back" })).toEqual({ front: "a", back: "b" });
    expect(convertStockNote("basic_reverse", "basic_optional_reverse", { front: "a", back: "b" }, { front: "front", back: "back" }))
      .toEqual({ front: "a", back: "b", addReverse: true });
    expect(convertStockNote("basic", "basic_optional_reverse", { front: "a", back: "b" }, { front: "front", back: "back" }))
      .toEqual({ front: "a", back: "b", addReverse: false });
    expect(convertStockNote("basic", "cloze", { front: "{{c1::x}}", back: "y" }, { text: "front", extra: "back" })).toEqual({ text: "{{c1::x}}", extra: "y" });
    expect(() => convertStockNote("mcq", "basic", { question: "q" }, {})).toThrow("unsupported_conversion");
  });
});
