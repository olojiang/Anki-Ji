import { describe, it, expect } from "vitest";
import { cardOrdinals, renderCard, sortField, diffOrdinals, validateNote, searchText } from "@/core/notes";

describe("note types → cards", () => {
  it("basic types", () => {
    expect(cardOrdinals("basic", { front: "a", back: "b" })).toEqual([0]);
    expect(cardOrdinals("basic_reverse", { front: "a", back: "b" })).toEqual([0, 1]);
    expect(cardOrdinals("basic_optional_reverse", { front: "a", back: "b" })).toEqual([0]);
    expect(cardOrdinals("basic_optional_reverse", { front: "a", back: "b", addReverse: true })).toEqual([0, 1]);
    expect(cardOrdinals("type_in", { front: "a", back: "b" })).toEqual([0]);
    expect(cardOrdinals("mcq", { question: "q", options: ["x", "y"], correct: [1] })).toEqual([0]);
  });
  it("cloze makes one card per ordinal", () => {
    expect(cardOrdinals("cloze", { text: "{{c1::a}} {{c3::b}}" })).toEqual([1, 3]);
    expect(cardOrdinals("cloze", { text: "none" })).toEqual([]);
  });
  it("image occlusion makes one card per mask", () => {
    const masks = [{ x: 1, y: 1, w: 5, h: 5 }, { x: 10, y: 10, w: 5, h: 5 }];
    expect(cardOrdinals("image_occlusion", { image: "u", masks })).toEqual([0, 1]);
  });
  it("renders front/back for each type", () => {
    expect(renderCard("basic_reverse", { front: "F", back: "B" }, 1)).toMatchObject({ front: "B", back: "F", kind: "plain" });
    const c = renderCard("cloze", { text: "x {{c1::y}}", extra: "E" }, 1);
    expect(c.front).toContain("[...]");
    expect(c.back).toContain("E");
    const t = renderCard("type_in", { front: "Q", back: "ans" }, 0);
    expect(t).toMatchObject({ kind: "type", typeAnswer: "ans" });
    const m = renderCard("mcq", { question: "Q", options: ["a", "b"], correct: [1], explanation: "because" }, 0);
    expect(m).toMatchObject({ kind: "mcq", options: ["a", "b"], correct: [1] });
    const o = renderCard("image_occlusion", { image: "img.png", masks: [{ x: 0, y: 0, w: 1, h: 1 }, { x: 2, y: 2, w: 1, h: 1 }] }, 1);
    expect(o.kind).toBe("occlusion");
    expect(o.occlusion?.active).toBe(1);
  });
  it("sort field / search text strip markup", () => {
    expect(sortField("cloze", { text: "**Bold** {{c1::x::h}}" })).toBe("Bold x");
    expect(sortField("basic", { front: "<b>Hi</b> ![img](u.png)", back: "z" })).toBe("Hi");
    expect(searchText("basic", { front: "a", back: "b" })).toContain("b");
  });
  it("diffOrdinals tells which cards to add and remove after an edit", () => {
    expect(diffOrdinals([1, 2], [2, 3])).toEqual({ add: [3], remove: [1] });
  });
  it("validates required fields", () => {
    expect(validateNote("basic", { front: "", back: "x" })).toBe("front_required");
    expect(validateNote("cloze", { text: "no cloze" })).toBe("cloze_required");
    expect(validateNote("mcq", { question: "q", options: ["a"], correct: [0] })).toBe("options_required");
    expect(validateNote("mcq", { question: "q", options: ["a", "b"], correct: [] })).toBe("correct_required");
    expect(validateNote("image_occlusion", { image: "", masks: [] })).toBe("image_required");
    expect(validateNote("basic", { front: "a", back: "b" })).toBeNull();
  });
});
