import { describe, it, expect } from "vitest";
import {
  STOCK_NOTETYPES, stockNoteType, validateNoteType, generateOrdinals, planCardChanges, renderNoteTypeCard, cloneNoteType,
  blankNoteType, addField, renameField, removeField, moveField, addTemplate, removeTemplate, valuesByName, customSortField,
  customSearchText, validateCustomNote, exportModel, noteFieldValues, noteValues, ankiCardOrd, ourCardOrd, normalizeNoteType, sanitizeValues,
  type NoteTypeDef,
} from "@/core/notetypes";
import { cardOrdinals, renderCard, sortField, searchText, validateNote } from "@/core/notes";
import { TYPE_SLOT } from "@/core/template";

let n = 0;
const ids = () => `f${++n}`;

function vocab(): NoteTypeDef {
  return {
    id: 7, name: "Vocab", kind: "standard", markdown: true, sortField: 0, css: ".card{font-size:20px}",
    fields: [{ id: "w", name: "Word" }, { id: "m", name: "Meaning" }, { id: "r", name: "Reading" }],
    templates: [
      { ord: 0, name: "Recognition", front: "{{Word}}", back: "{{FrontSide}}<hr id=answer>{{Meaning}}" },
      { ord: 1, name: "Production", front: "{{Meaning}}", back: "{{FrontSide}}<hr id=answer>{{Word}}" },
      { ord: 2, name: "Reading", front: "{{#Reading}}{{Word}}?{{/Reading}}", back: "{{Reading}}" },
    ],
  };
}

describe("stock note types", () => {
  it("exposes every built-in type as a read-only definition", () => {
    expect(STOCK_NOTETYPES.map((s) => s.stock)).toEqual(["basic", "basic_reverse", "basic_optional_reverse", "cloze", "type_in", "mcq", "image_occlusion"]);
    for (const s of STOCK_NOTETYPES) {
      expect(s.readOnly).toBe(true);
      expect(String(s.id)).toBe(`stock:${s.stock}`);
      if (s.clonable) expect(validateNoteType(s)).toEqual([]);
    }
  });
  it("stock templates generate the same cards as the built-in logic", () => {
    const br = stockNoteType("basic_reverse")!;
    expect(generateOrdinals(br, noteValues(br, "basic_reverse", { front: "a", back: "b" }))).toEqual(cardOrdinals("basic_reverse", { front: "a", back: "b" }));
    const opt = stockNoteType("basic_optional_reverse")!;
    expect(generateOrdinals(opt, noteValues(opt, "basic_optional_reverse", { front: "a", back: "b", addReverse: false }))).toEqual([0]);
    expect(generateOrdinals(opt, noteValues(opt, "basic_optional_reverse", { front: "a", back: "b", addReverse: true }))).toEqual([0, 1]);
    const cz = stockNoteType("cloze")!;
    expect(generateOrdinals(cz, noteValues(cz, "cloze", { text: "{{c1::a}} {{c3::b}}", extra: "" }))).toEqual([1, 3]);
    const ti = stockNoteType("type_in")!;
    expect(renderNoteTypeCard(ti, noteValues(ti, "type_in", { front: "Q", back: "<b>A</b>" }), 0).typeAnswer).toBe("A");
  });
  it("clones a stock type into an editable custom type with fresh field ids", () => {
    const c = cloneNoteType(stockNoteType("basic_reverse")!, "My Basic", ids);
    expect(c.readOnly).toBeFalsy();
    expect(c.stock).toBeUndefined();
    expect(c.name).toBe("My Basic");
    expect(c.fields.map((f) => f.name)).toEqual(["Front", "Back"]);
    expect(c.templates).toHaveLength(2);
    expect(validateNoteType(c)).toEqual([]);
  });
});

describe("note type validation", () => {
  it("accepts a valid custom type", () => expect(validateNoteType(vocab())).toEqual([]));
  it("rejects empty / duplicate / reserved / malformed field names", () => {
    const t = vocab();
    expect(validateNoteType({ ...t, name: " " }).map((e) => e.code)).toContain("empty_name");
    expect(validateNoteType({ ...t, fields: [...t.fields, { id: "x", name: "word" }] }).map((e) => e.code)).toContain("duplicate_name");
    expect(validateNoteType({ ...t, fields: [...t.fields, { id: "x", name: "Tags" }] }).map((e) => e.code)).toContain("reserved_name");
    expect(validateNoteType({ ...t, fields: [...t.fields, { id: "x", name: "a:b" }] }).map((e) => e.code)).toContain("bad_name");
    expect(validateNoteType({ ...t, fields: [...t.fields, { id: "x", name: "#x" }] }).map((e) => e.code)).toContain("bad_name");
    expect(validateNoteType({ ...t, fields: [] }).map((e) => e.code)).toContain("no_fields");
  });
  it("rejects templates with unknown fields, no field on the front, or broken sections", () => {
    const t = vocab();
    const bad = (front: string, back = "") => validateNoteType({ ...t, templates: [{ ord: 0, name: "C", front, back }] }).map((e) => e.code);
    expect(bad("{{Nope}}")).toContain("unknown_field");
    expect(bad("static text")).toContain("no_field");
    expect(bad("{{#Word}}x")).toContain("unclosed_section");
    expect(bad("{{Word}}", "{{Missing}}")).toContain("unknown_field");
    expect(bad("{{Word}}", "{{FrontSide}} {{Tags}} {{text:Meaning}}")).toEqual([]);
    expect(validateNoteType({ ...t, templates: [] }).map((e) => e.code)).toContain("no_templates");
    expect(validateNoteType({ ...t, templates: [t.templates[0], { ...t.templates[1], name: "recognition" }] }).map((e) => e.code)).toContain("duplicate_name");
  });
  it("cloze types need exactly one template with a cloze filter", () => {
    const cz = cloneNoteType(stockNoteType("cloze")!, "C2", ids);
    expect(validateNoteType(cz)).toEqual([]);
    expect(validateNoteType({ ...cz, templates: [{ ...cz.templates[0], front: "{{Text}}" }] }).map((e) => e.code)).toContain("no_cloze");
    expect(validateNoteType({ ...cz, templates: [cz.templates[0], { ...cz.templates[0], ord: 1, name: "x" }] }).map((e) => e.code)).toContain("cloze_one_template");
  });
});

describe("card generation", () => {
  it("creates one card per template whose front is non-empty", () => {
    const t = vocab();
    expect(generateOrdinals(t, { w: "犬", m: "dog", r: "" })).toEqual([0, 1]);
    expect(generateOrdinals(t, { w: "犬", m: "dog", r: "いぬ" })).toEqual([0, 1, 2]);
    expect(generateOrdinals(t, { w: "犬", m: "", r: "" })).toEqual([0]);
    expect(generateOrdinals(t, { w: "", m: "", r: "" })).toEqual([]);
    expect(generateOrdinals(t, { w: "<br>", m: "&nbsp;", r: "" })).toEqual([]);
  });
  it("uses stable template ords, not positions", () => {
    const t = vocab();
    const reordered = { ...t, templates: [t.templates[2], t.templates[0]] };
    expect(generateOrdinals(reordered, { w: "a", m: "b", r: "c" })).toEqual([0, 2]);
  });
  it("cloze types create a card per cloze number in fields used by {{cloze:}}", () => {
    const cz = cloneNoteType(stockNoteType("cloze")!, "C2", ids);
    const text = cz.fields[0].id, extra = cz.fields[1].id;
    expect(generateOrdinals(cz, { [text]: "{{c2::a}} {{c1::b}} {{c2::c}}", [extra]: "{{c9::ignored}}" })).toEqual([1, 2]);
    expect(generateOrdinals(cz, { [text]: "none", [extra]: "" })).toEqual([]);
  });
  it("plans card changes and preserves scheduled cards", () => {
    const existing = [{ ord: 0, reps: 3, state: "review" as const }, { ord: 1, reps: 0, state: "new" as const }, { ord: 2, reps: 5, state: "review" as const }];
    // ord 1 front became empty and it was never studied → removed; ord 2 front empty but studied → kept; ord 3 new
    expect(planCardChanges(existing, [0, 3], [0, 1, 2, 3])).toEqual({ add: [3], remove: [1] });
    // template 2 deleted → its card goes even if studied
    expect(planCardChanges(existing, [0, 1], [0, 1])).toEqual({ add: [], remove: [2] });
    // cloze (no template list): studied cards survive a removed cloze
    expect(planCardChanges(existing, [0], null)).toEqual({ add: [], remove: [1] });
  });
});

describe("rendering custom cards", () => {
  it("renders front/back with FrontSide, scoped kind=html", () => {
    const r = renderNoteTypeCard(vocab(), { w: "犬", m: "dog", r: "いぬ" }, 0, { tags: ["jp"], deck: "Lang::JP" });
    expect(r.kind).toBe("html");
    expect(r.front).toBe("犬");
    expect(r.back).toBe("犬<hr id=answer>dog");
    expect(r.css).toBe(".card{font-size:20px}");
    expect(r.custom?.noteType.name).toBe("Vocab");
  });
  it("renders the template for the right ord and handles specials", () => {
    const t = { ...vocab(), templates: [{ ord: 4, name: "Info", front: "{{Word}} {{Card}} {{Type}} {{Tags}} {{Subdeck}}", back: "{{Deck}}" }] };
    const r = renderNoteTypeCard(t, { w: "a" }, 4, { tags: ["x", "y"], deck: "A::B" });
    expect(r.front).toBe("a Info Vocab x y B");
    expect(r.back).toBe("A::B");
  });
  it("exposes type answers and keeps the slot in the html", () => {
    const t = { ...vocab(), templates: [{ ord: 0, name: "T", front: "{{Word}} {{type:Meaning}}", back: "{{FrontSide}}<hr>{{type:Meaning}}" }] };
    const r = renderNoteTypeCard(t, { w: "犬", m: "dog" }, 0);
    expect(r.kind).toBe("html");
    expect(r.typeAnswer).toBe("dog");
    expect(r.front).toContain(TYPE_SLOT);
    expect(r.back).toBe(`犬 <hr>${TYPE_SLOT}`);
  });
  it("renders cloze types", () => {
    const cz = cloneNoteType(stockNoteType("cloze")!, "C2", ids);
    const r = renderNoteTypeCard(cz, { [cz.fields[0].id]: "{{c1::Paris}} / {{c2::Rome}}", [cz.fields[1].id]: "capitals" }, 2);
    expect(r.front).toContain("Paris");
    expect(r.front).toContain("[...]");
    expect(r.back).toContain('<span class="cloze">Rome</span>');
    expect(r.back).toContain("capitals");
  });
  it("routes custom notes through the core notes API (renderCard/cardOrdinals/sortField/searchText/validateNote)", () => {
    const t = vocab();
    const f = { custom: { w: "犬", m: "<b>dog</b>", r: "" } };
    expect(cardOrdinals("custom", f, t)).toEqual([0, 1]);
    expect(renderCard("custom", f, 1, t).front).toBe("<b>dog</b>");
    expect(sortField("custom", f, t)).toBe("犬");
    expect(searchText("custom", f)).toContain("dog");
    expect(validateNote("custom", f, t)).toBeNull();
    expect(validateNote("custom", { custom: {} }, t)).toBe("no_cards");
    expect(validateNote("custom", f)).toBe("notetype_required");
    expect(cardOrdinals("custom", f)).toEqual([]);
  });
});

describe("editing helpers", () => {
  it("adds, renames (updating templates), reorders and removes fields", () => {
    let t = vocab();
    t = addField(t, "Example", () => "e");
    expect(t.fields.map((f) => f.name)).toEqual(["Word", "Meaning", "Reading", "Example"]);
    t = renameField(t, "w", "Term");
    expect(t.fields[0].name).toBe("Term");
    expect(t.templates[0].front).toBe("{{Term}}");
    expect(t.templates[1].back).toContain("{{Term}}");
    t = moveField(t, "e", -3);
    expect(t.fields.map((f) => f.id)).toEqual(["e", "w", "m", "r"]);
    expect(t.sortField).toBe(1); // sort field follows the field it pointed at
    t = removeField(t, "r");
    expect(t.fields.map((f) => f.id)).toEqual(["e", "w", "m"]);
    expect(t.templates[2].front).not.toContain("Reading");
  });
  it("adds templates with a fresh stable ord and removes them", () => {
    let t = vocab();
    t = addTemplate(t, "Card 4");
    expect(t.templates.map((x) => x.ord)).toEqual([0, 1, 2, 3]);
    t = removeTemplate(t, 1);
    expect(t.templates.map((x) => x.ord)).toEqual([0, 2, 3]);
    t = addTemplate(t, "Card 5");
    expect(t.templates.map((x) => x.ord)).toEqual([0, 2, 3, 4]);
  });
  it("blankNoteType builds valid standard and cloze types", () => {
    expect(validateNoteType(blankNoteType("A", "standard", ids))).toEqual([]);
    expect(validateNoteType(blankNoteType("B", "cloze", ids))).toEqual([]);
  });
  it("normalizes untrusted input", () => {
    const t = normalizeNoteType({ name: "  X ", kind: "weird", fields: [{ name: "A" }, { id: "b", name: "B", rtl: "yes" }], templates: [{ name: "C", front: "{{A}}" }, { name: "D", front: "{{B}}", ord: 0 }], css: 5 } as never, ids);
    expect(t.name).toBe("X");
    expect(t.kind).toBe("standard");
    expect(t.fields[0].id).toBeTruthy();
    expect(t.fields[1].rtl).toBe(true);
    expect(new Set(t.templates.map((x) => x.ord)).size).toBe(2);
    expect(t.css).toBe("");
  });
  it("sanitizes note values to the type's field ids", () => {
    expect(sanitizeValues(vocab(), { w: "a", zzz: "b", m: 5 } as never)).toEqual({ w: "a", m: "", r: "" });
  });
});

describe("values and search", () => {
  it("maps values by name and computes sort / search text", () => {
    const t = { ...vocab(), sortField: 1 };
    const v = { w: "犬", m: "<b>dog</b>", r: "いぬ" };
    expect(valuesByName(t, v)).toEqual({ Word: "犬", Meaning: "<b>dog</b>", Reading: "いぬ" });
    expect(customSortField(t, v)).toBe("dog");
    expect(customSearchText(v)).toBe("犬 dog いぬ");
    expect(validateCustomNote(t, v)).toBeNull();
  });
});

describe("export helpers (for .apkg export)", () => {
  it("describes a custom type as an Anki model with ordered fields and templates", () => {
    const t = { ...vocab(), templates: [vocab().templates[2], vocab().templates[0]] };
    const m = exportModel(t);
    expect(m).toMatchObject({ name: "Vocab", type: 0, sortf: 0, css: ".card{font-size:20px}" });
    expect(m.fields.map((f) => f.name)).toEqual(["Word", "Meaning", "Reading"]);
    expect(m.templates.map((x) => [x.ord, x.name])).toEqual([[0, "Reading"], [1, "Recognition"]]);
    expect(ankiCardOrd(t, 0)).toBe(1); // our template ord 0 is Anki template #1
    expect(ankiCardOrd(t, 2)).toBe(0);
    expect(ourCardOrd(t, 1)).toBe(0);
    expect(noteFieldValues(t, "custom", { custom: { w: "a", m: "b" } })).toEqual(["a", "b", ""]);
  });
  it("describes stock types and their notes' field values", () => {
    const cz = stockNoteType("cloze")!;
    const m = exportModel(cz);
    expect(m.type).toBe(1);
    expect(m.fields.map((f) => f.name)).toEqual(["Text", "Back Extra"]);
    expect(noteFieldValues(cz, "cloze", { text: "{{c1::x}}", extra: "e" })).toEqual(["{{c1::x}}", "e"]);
    expect(ankiCardOrd(cz, 1)).toBe(0); // cloze c1 → Anki ord 0
    expect(ourCardOrd(cz, 0)).toBe(1);
    const mcq = stockNoteType("mcq")!;
    expect(noteFieldValues(mcq, "mcq", { question: "Q", options: ["a", "b"], correct: [1], explanation: "E" })[0]).toBe("Q");
  });
});

describe("interop exporter adapter", () => {
  it("produces a model + Anki note parts for a custom type", async () => {
    const { customNoteTypeExporter } = await import("@/core/notetypes");
    const t = { ...vocab(), templates: [vocab().templates[1], vocab().templates[0]] };
    const ex = customNoteTypeExporter(t);
    expect(ex.model).toMatchObject({ id: 1_770_000_000_007, name: "Vocab", kind: "standard", fields: ["Word", "Meaning", "Reading"] });
    expect(ex.model.templates.map((x) => x.name)).toEqual(["Production", "Recognition"]);
    const parts = ex.toAnki({ custom: { w: "**犬**", m: "dog", r: "" } }, [0, 1], { html: (s) => s.replace(/\*\*(.+)\*\*/, "<b>$1</b>"), media: (u) => u });
    expect(parts).toEqual([{ guidSuffix: "", fields: ["<b>犬</b>", "dog", ""], cards: [{ ord: 0, ankiOrd: 1 }, { ord: 1, ankiOrd: 0 }] }]);
    const raw = customNoteTypeExporter({ ...t, markdown: false, sourceKey: "anki:123" });
    expect(raw.model.id).toBe(123);
    expect(raw.toAnki({ custom: { w: '<img src="https://x/y.png">' } }, [0], { html: (s) => s, media: () => "y.png" })[0].fields[0]).toBe('<img src="y.png">');
  });
});
