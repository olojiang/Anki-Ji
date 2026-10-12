import { describe, it, expect } from "vitest";
import {
  parseTemplate, renderTemplate, fieldIsEmpty, stripHtml, scopeCss, renameFieldInTemplate, templateFieldRefs, TYPE_SLOT,
} from "@/core/template";

const ctx = (values: Record<string, string>, extra: Partial<Parameters<typeof renderTemplate>[1]> = {}) =>
  ({ values, ord: 0, side: "front" as const, kind: "standard" as const, ...extra });

describe("template parser", () => {
  it("parses text, replacements and sections", () => {
    const { nodes, errors } = parseTemplate("A {{Front}} {{#Back}}[{{Back}}]{{/Back}}{{^Extra}}none{{/Extra}}");
    expect(errors).toEqual([]);
    expect(nodes.map((n) => n.t)).toEqual(["text", "var", "text", "sec", "sec"]);
  });
  it("reports unclosed and unexpected section tags", () => {
    expect(parseTemplate("{{#A}}x").errors[0]).toMatchObject({ code: "unclosed_section", detail: "A" });
    expect(parseTemplate("x{{/A}}").errors[0]).toMatchObject({ code: "unexpected_close", detail: "A" });
    expect(parseTemplate("{{#A}}{{#B}}{{/A}}{{/B}}").errors.length).toBeGreaterThan(0);
  });
  it("lists referenced fields with their filters", () => {
    const refs = templateFieldRefs("{{Front}} {{text:hint:Back}} {{#Extra}}{{/Extra}} {{FrontSide}} {{cloze:Text}}");
    expect(refs.map((r) => r.field)).toEqual(["Front", "Back", "Extra", "FrontSide", "Text"]);
    expect(refs[1].filters).toEqual(["text", "hint"]);
    expect(refs[2].section).toBe(true);
  });
});

describe("template rendering", () => {
  it("substitutes fields (trimmed tag names, names with spaces)", () => {
    expect(renderTemplate("<b>{{ Front }}</b> / {{Back Extra}}", ctx({ Front: "犬", "Back Extra": "dog" })).html).toBe("<b>犬</b> / dog");
  });
  it("renders positive and negative conditionals", () => {
    const t = "{{#Hint}}H:{{Hint}}{{/Hint}}{{^Hint}}no hint{{/Hint}}";
    expect(renderTemplate(t, ctx({ Hint: "x" })).html).toBe("H:x");
    expect(renderTemplate(t, ctx({ Hint: "" })).html).toBe("no hint");
    expect(renderTemplate(t, ctx({ Hint: " <br> <div></div>&nbsp;" })).html).toBe("no hint");
  });
  it("treats an image-only field as non-empty", () => {
    expect(fieldIsEmpty('<img src="a.png">')).toBe(false);
    expect(fieldIsEmpty("<br/>  ")).toBe(true);
  });
  it("supports nested sections", () => {
    const t = "{{#A}}a{{#B}}b{{/B}}{{^B}}!b{{/B}}{{/A}}";
    expect(renderTemplate(t, ctx({ A: "1", B: "1" })).html).toBe("ab");
    expect(renderTemplate(t, ctx({ A: "1", B: "" })).html).toBe("a!b");
    expect(renderTemplate(t, ctx({ A: "", B: "1" })).html).toBe("");
  });
  it("renders {{FrontSide}} on the back without the type-answer slot", () => {
    const front = renderTemplate("{{Front}} {{type:Back}}", ctx({ Front: "Q", Back: "A" }));
    expect(front.html).toContain(TYPE_SLOT);
    expect(front.typeAnswer).toBe("A");
    const back = renderTemplate("{{FrontSide}}<hr id=answer>{{Back}}", ctx({ Front: "Q", Back: "A" }, { side: "back", frontSide: front.html }));
    expect(back.html).toBe("Q <hr id=answer>A");
    expect(back.typeAnswer).toBeNull();
  });
  it("{{type:Field}} strips html for the expected answer", () => {
    const r = renderTemplate("{{type:Back}}", ctx({ Back: "<b>dog</b>&nbsp;s" }));
    expect(r.typeAnswer).toBe("dog s");
  });
  it("{{cloze:Field}} hides the active deletion on the front and reveals it on the back", () => {
    const v = { Text: "{{c1::Paris}} is in {{c2::France::country}}" };
    const f1 = renderTemplate("{{cloze:Text}}", ctx(v, { kind: "cloze", ord: 1 })).html;
    expect(f1).toContain('<span class="cloze">[...]</span>');
    expect(f1).toContain("France");
    const f2 = renderTemplate("{{cloze:Text}}", ctx(v, { kind: "cloze", ord: 2 })).html;
    expect(f2).toContain("[country]");
    const b2 = renderTemplate("{{cloze:Text}}", ctx(v, { kind: "cloze", ord: 2, side: "back" })).html;
    expect(b2).toContain('<span class="cloze">France</span>');
  });
  it("{{type:cloze:Text}} expects the active cloze answers", () => {
    const r = renderTemplate("{{cloze:Text}}{{type:cloze:Text}}", ctx({ Text: "{{c1::a}} {{c2::b}} {{c1::c}}" }, { kind: "cloze", ord: 1 }));
    expect(r.typeAnswer).toBe("a, c");
  });
  it("{{cloze-only:Text}} shows only the active answers", () => {
    expect(renderTemplate("{{cloze-only:Text}}", ctx({ Text: "{{c1::a}} {{c2::b}}" }, { kind: "cloze", ord: 2 })).html).toBe("b");
  });
  it("{{hint:Field}} becomes a collapsible element, empty when blank", () => {
    expect(renderTemplate("{{hint:H}}", ctx({ H: "tip" })).html).toBe('<details class="ak-hint"><summary>Hint</summary>tip</details>');
    expect(renderTemplate("{{hint:H}}", ctx({ H: "" })).html).toBe("");
  });
  it("{{text:Field}} strips HTML", () => {
    expect(renderTemplate("{{text:F}}", ctx({ F: "<b>a</b><br>b &amp; c" })).html).toBe("a b &amp; c");
  });
  it("chains filters right-to-left", () => {
    expect(renderTemplate("{{hint:text:F}}", ctx({ F: "<i>x</i>" })).html).toBe('<details class="ak-hint"><summary>Hint</summary>x</details>');
  });
  it("passes {{tts}} through as a data element", () => {
    const h = renderTemplate("{{tts en_US voices=Apple:Front}}", ctx({ Front: "<b>hello</b> & bye" })).html;
    expect(h).toBe('<span class="ak-tts" data-tts-lang="en_US" data-tts-options="voices=Apple">hello &amp; bye</span>');
  });
  it("supports furigana / kana / kanji", () => {
    expect(renderTemplate("{{furigana:R}}", ctx({ R: "日本[にほん]語" })).html).toBe("<ruby><rb>日本</rb><rt>にほん</rt></ruby>語");
    expect(renderTemplate("{{kana:R}}", ctx({ R: "日本[にほん]" })).html).toBe("にほん");
    expect(renderTemplate("{{kanji:R}}", ctx({ R: "日本[にほん]" })).html).toBe("日本");
  });
  it("renders special fields", () => {
    const r = renderTemplate("{{Tags}}|{{Type}}|{{Deck}}|{{Subdeck}}|{{Card}}", ctx({}, { specials: { Tags: "a b", Type: "Vocab", Deck: "JP::N5", Subdeck: "N5", Card: "Recognition" } }));
    expect(r.html).toBe("a b|Vocab|JP::N5|N5|Recognition");
  });
  it("marks unknown fields instead of throwing", () => {
    expect(renderTemplate("{{Nope}}", ctx({})).html).toContain("{unknown field Nope}");
  });
  it("applies the field formatter to plain substitutions only", () => {
    const fmt = (s: string) => `<md>${s}</md>`;
    const r = renderTemplate("{{F}}|{{text:F}}|{{type:F}}", ctx({ F: "x" }, { formatField: fmt }));
    expect(r.html).toBe(`<md>x</md>|x|${TYPE_SLOT}`);
  });
});

describe("stripHtml", () => {
  it("removes tags and decodes basic entities", () => {
    expect(stripHtml("<div>a&nbsp;<b>b</b></div><br>c &lt;d&gt;")).toBe("a b c <d>");
  });
});

describe("renameFieldInTemplate", () => {
  it("renames plain, filtered and section references", () => {
    const t = "{{Front}} {{#Front}}x{{/Front}} {{^ Front }}y{{/ Front }} {{text:Front}} {{Frontal}}";
    expect(renameFieldInTemplate(t, "Front", "Word")).toBe("{{Word}} {{#Word}}x{{/Word}} {{^Word}}y{{/Word}} {{text:Word}} {{Frontal}}");
  });
});

describe("scopeCss", () => {
  const S = ".ak-s";
  it("maps .card / body / html to the scope element", () => {
    expect(scopeCss(".card { font-size: 20px; }", S)).toBe(".ak-s{font-size: 20px;}");
    expect(scopeCss("body, html{margin:0}", S)).toBe(".ak-s,.ak-s{margin:0}");
  });
  it("prefixes descendant selectors", () => {
    expect(scopeCss(".front b, #x > i { color: red }", S)).toBe(".ak-s .front b,.ak-s #x > i{color: red}");
    expect(scopeCss(".card .x{a:b}", S)).toBe(".ak-s .x{a:b}");
    expect(scopeCss(".card > .x{a:b}", S)).toBe(".ak-s > .x{a:b}");
  });
  it("maps night-mode selectors to a scope modifier", () => {
    expect(scopeCss(".nightMode .card{color:white}", S)).toBe(".ak-s.ak-night{color:white}");
    expect(scopeCss(".night_mode .x{color:white}", S)).toBe(".ak-s.ak-night .x{color:white}");
    expect(scopeCss(".card.nightMode{color:white}", S)).toBe(".ak-s.ak-night{color:white}");
  });
  it("scopes inside @media and keeps @keyframes / @font-face", () => {
    const out = scopeCss("@media (max-width: 600px) { .card { font-size: 14px } .x{y:z} } @keyframes k { from { opacity: 0 } to { opacity: 1 } }", S);
    expect(out).toContain("@media (max-width: 600px){.ak-s{font-size: 14px}.ak-s .x{y:z}}");
    expect(out).toContain("@keyframes k { from { opacity: 0 } to { opacity: 1 } }");
  });
  it("drops @import and dangerous declarations, ignores comments and strings", () => {
    const out = scopeCss('@import url("http://evil/x.css"); /* .card{} */ .a{background:url(javascript:alert(1)); color: red; behavior: url(x.htc); content: "}{"}', S);
    expect(out).not.toContain("@import");
    expect(out).not.toContain("javascript");
    expect(out).not.toContain("behavior");
    expect(out).toContain(".ak-s .a{");
    expect(out).toContain("color: red");
    expect(out).toContain('content: "}{"');
  });
  it("optionally neutralises Anki's default black-on-white so app themes show through", () => {
    const css = ".card { font-family: arial; color: black; background-color: white; }";
    const out = scopeCss(css, S, { adaptColors: true });
    expect(out).toContain("font-family: arial");
    expect(out).not.toContain("black");
    expect(out).not.toContain("white");
    expect(scopeCss(css, S)).toContain("black");
  });
  it("survives garbage", () => {
    expect(() => scopeCss("}}}{{{ .a { b", S)).not.toThrow();
  });
});
