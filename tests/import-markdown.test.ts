import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { parseMarkdown, parseObsidianVault } from "@/core/io/markdown";
import { extractTags, highlightsToCloze, curlyToCloze } from "@/core/io/text";
import { draftToBackup, mediaRef } from "@/core/io/draft";

const fixture = readFileSync(new URL("./fixtures/import/obsidian.md", import.meta.url), "utf8");

describe("text helpers", () => {
  it("extracts #tags (nested with / and [[multi word]]) but not headings, numbers or url fragments", () => {
    expect(extractTags("Q #a #b/c #[[long tag]] #1 x#y http://e.com/#frag")).toEqual({ text: "Q #1 x#y http://e.com/#frag", tags: ["a", "b::c", "long_tag"] });
    expect(extractTags("# Heading").tags).toEqual([]);
  });
  it("converts ==highlights== and {{curly}} clozes, numbering after existing ones", () => {
    expect(highlightsToCloze("==a== and {{c2::b}} and ==c==")).toBe("{{c3::a}} and {{c2::b}} and {{c4::c}}");
    expect(curlyToCloze("{{x}} {{2::y}} {{c1::z}}")).toBe("{{c3::x}} {{c2::y}} {{c1::z}}");
    expect(curlyToCloze("{{x}} and {{y}}")).toBe("{{c1::x}} and {{c2::y}}");
  });
});

describe("Markdown / Obsidian Spaced Repetition syntax", () => {
  const media = (ref: string) => (/water\.png|atom model\.png/.test(ref) ? ref.split("/").pop()! : null);
  const d = parseMarkdown(fixture, { rootDeck: "obsidian", resolveMedia: media });
  const by = (front: string) => d.notes.find((n) => (n.fields.front ?? n.fields.text ?? "").startsWith(front))!;

  it("finds every card and nothing in prose", () => {
    expect(d.notes.map((n) => n.type)).toEqual(["basic", "basic_reverse", "basic", "basic_reverse", "cloze", "basic", "basic", "basic"]);
  });
  it("single-line Q::A and reversed Q:::A, with file + inline tags, SR comments removed", () => {
    expect(by("Cell")).toMatchObject({ deckPath: "obsidian::Biology", fields: { front: "Cell", back: "Basic unit of life" }, tags: ["biology", "exam::2026"] });
    expect(by("The powerhouse")).toMatchObject({ type: "basic_reverse", fields: { front: "The powerhouse", back: "Mitochondria" }, tags: ["biology", "exam::2026", "organelle"] });
  });
  it("multi-line ? / ?? cards under nested headings", () => {
    expect(by("What carries")).toMatchObject({ deckPath: "obsidian::Biology::Genetics", fields: { front: "What carries genetic info\nin most organisms?", back: "DNA\n(deoxyribonucleic acid)" } });
    expect(by("Opposite")).toMatchObject({ type: "basic_reverse", fields: { front: "Opposite of dominant", back: "Recessive" } });
  });
  it("==highlight== + {{c1::}} paragraph → one cloze note", () => {
    expect(by("The {{")).toMatchObject({ type: "cloze", fields: { text: "The {{c2::nucleus}} holds {{c1::chromosomes}}.", extra: "" } });
  });
  it("embeds: ![[x|200]] and ![](relative%20path) become media refs; remote URLs stay", () => {
    expect(by("水的化学式")).toMatchObject({ deckPath: "obsidian::化学", fields: { back: `H2O ![water.png](${mediaRef("water.png")})` } });
    expect(by("Diagram").fields.back).toBe(`![alt text](${mediaRef("atom model.png")})`);
    expect(by("Remote").fields.back).toBe("![x](https://example.com/a.png)");
  });
  it("warns about embeds it cannot resolve", () => {
    const r = parseMarkdown("Q::A ![[missing.png]]", { rootDeck: "x" });
    expect(r.notes[0].fields.back).toBe("A ![[missing.png]]");
    expect(r.warnings.join()).toContain("missing.png");
  });
  it("headings can be ignored (everything in the root deck)", () => {
    const r = parseMarkdown(fixture, { rootDeck: "obsidian", headingsAsDecks: false });
    expect(new Set(r.notes.map((n) => n.deckPath))).toEqual(new Set(["obsidian"]));
  });
});

describe("zipped Obsidian vault", () => {
  async function vault() {
    const z = new JSZip();
    z.file("Vault/Bio/Cells.md", "# Parts\nCell::Unit ![[cell.png]]\nNucleus::Core ![](../attachments/nuc.jpg)\n");
    z.file("Vault/Chem.md", "H2O::water\n");
    z.file("Vault/attachments/cell.png", new Uint8Array([1, 2, 3]));
    z.file("Vault/attachments/nuc.jpg", new Uint8Array([4, 5]));
    z.file("Vault/attachments/unused.png", new Uint8Array([9]));
    z.file("Vault/.obsidian/app.json", "{}");
    z.file("__MACOSX/Vault/._Chem.md", "junk");
    return z.generateAsync({ type: "uint8array" });
  }
  it("maps folders/files/headings to nested decks and bundles only referenced attachments", async () => {
    const d = await parseObsidianVault(await vault(), { rootDeck: "MyVault" });
    expect(d.format).toBe("obsidian");
    expect(d.notes.map((n) => [n.deckPath, n.fields.front])).toEqual([["MyVault::Bio::Cells::Parts", "Cell"], ["MyVault::Bio::Cells::Parts", "Nucleus"], ["MyVault::Chem", "H2O"]]);
    expect(d.notes[1].fields.back).toBe(`Core ![nuc.jpg](${mediaRef("nuc.jpg")})`);
    expect(d.media.map((m) => m.name).sort()).toEqual(["cell.png", "nuc.jpg"]);
    const { backup } = draftToBackup(d);
    expect(backup.media.map((m) => m.filename).sort()).toEqual(["cell.png", "nuc.jpg"]);
  });
});
