import { describe, it, expect } from "vitest";
import { parseCloze, clozeOrdinals, renderCloze, hasCloze } from "@/core/cloze";

describe("cloze parser", () => {
  it("finds ordinals, content and hints", () => {
    const t = "The {{c1::capital::city}} of France is {{c2::Paris}} and {{c1::Lyon}} is not.";
    expect(clozeOrdinals(t)).toEqual([1, 2]);
    const p = parseCloze(t);
    expect(p).toHaveLength(3);
    expect(p[0]).toMatchObject({ ord: 1, content: "capital", hint: "city" });
    expect(p[1]).toMatchObject({ ord: 2, content: "Paris", hint: null });
    expect(hasCloze(t)).toBe(true);
    expect(hasCloze("no cloze")).toBe(false);
  });

  it("renders front with the active cloze hidden and others shown", () => {
    const t = "A {{c1::one}} B {{c2::two::hint}}";
    expect(renderCloze(t, 1, "front")).toBe('A <span class="cloze">[...]</span> B two');
    expect(renderCloze(t, 2, "front")).toBe('A one B <span class="cloze">[hint]</span>');
    expect(renderCloze(t, 1, "back")).toBe('A <span class="cloze">one</span> B two');
  });

  it("handles nested clozes", () => {
    const t = "{{c1::Canberra was {{c2::founded}} in 1913}}";
    expect(clozeOrdinals(t)).toEqual([1, 2]);
    expect(renderCloze(t, 2, "front")).toBe('Canberra was <span class="cloze">[...]</span> in 1913');
    expect(renderCloze(t, 1, "front")).toBe('<span class="cloze">[...]</span>');
    expect(renderCloze(t, 1, "back")).toBe('<span class="cloze">Canberra was founded in 1913</span>');
  });

  it("ignores malformed markup and supports multi-digit ordinals and colons in content", () => {
    expect(clozeOrdinals("{{c::x}} {{c12::a::b::c}} {{c3:x}}")).toEqual([12]);
    expect(parseCloze("{{c12::a::b::c}}")[0]).toMatchObject({ content: "a", hint: "b::c" });
    expect(renderCloze("unclosed {{c1::abc", 1, "front")).toBe("unclosed {{c1::abc");
  });

  it("keeps multi-line content", () => {
    expect(renderCloze("{{c1::line1\nline2}}", 1, "back")).toBe('<span class="cloze">line1\nline2</span>');
  });
});
