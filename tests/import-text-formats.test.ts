import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseRemNote } from "@/core/io/remnote";
import { parseQuizlet } from "@/core/io/quizlet";
import { parseSuperMemoText } from "@/core/io/supermemo";
import { smartPaste } from "@/core/io/smartpaste";
import { draftToBackup, previewImport } from "@/core/io/draft";

const fx = (n: string) => readFileSync(new URL(`./fixtures/import/${n}`, import.meta.url), "utf8");
const sides = (d: { notes: { type: string; deckPath: string; fields: Record<string, unknown> }[] }) =>
  d.notes.map((n) => [n.deckPath, n.type, n.fields.front ?? n.fields.text, n.fields.back ?? n.fields.extra]);

describe("RemNote export", () => {
  const d = parseRemNote(fx("remnote.md"), { rootDeck: "remnote" });
  it("parses >>, ::, <<, ;;, <>, >>> multi-line and {{cloze}}, with indentation → decks", () => {
    expect(sides(d)).toEqual([
      ["remnote::Biology", "basic", "Cell", "Basic unit of life"],
      ["remnote::Biology", "basic_reverse", "Mitochondria", "Powerhouse of the cell"],
      ["remnote::Biology", "basic", "Question side", "Answer side"],
      ["remnote::Biology", "basic", "Photosynthesis stages", "- Light reactions\n- Calvin cycle"],
      ["remnote::Biology", "cloze", "The {{c1::nucleus}} holds {{c2::DNA}}", ""],
      ["remnote::Biology::Genetics", "basic", "Gene", "Unit of heredity"],
      ["remnote::Biology::Genetics", "basic_reverse", "Allele", "Variant of a gene"],
      ["remnote::Biology::plain note without card", "basic", "child note", "still a card here"],
      ["remnote", "basic", "Top level card", "yes"],
    ]);
    expect(d.notes[1].tags).toEqual(["organelle"]);
  });
  it("re-import is deduped by content guid", () => {
    const a = draftToBackup(parseRemNote(fx("remnote.md"), { rootDeck: "x" })).backup.notes.map((n) => n.guid);
    const b = draftToBackup(parseRemNote(fx("remnote.md"), { rootDeck: "y" })).backup.notes.map((n) => n.guid);
    expect(a).toEqual(b);
  });
});

describe("Quizlet preset", () => {
  it("tab + newline (Quizlet default export)", () => {
    const d = parseQuizlet("apple\t苹果\ndog\t狗\n\n", { termSep: "tab", rowSep: "newline", deck: "Quizlet" });
    expect(sides(d)).toEqual([["Quizlet", "basic", "apple", "苹果"], ["Quizlet", "basic", "dog", "狗"]]);
  });
  it("comma + semicolon, splitting only at the first term separator", () => {
    const d = parseQuizlet("a,1;b,2,3;", { termSep: "comma", rowSep: "semicolon", deck: "Q" });
    expect(sides(d).map((r) => [r[2], r[3]])).toEqual([["a", "1"], ["b", "2,3"]]);
  });
  it("custom separators, and reports rows without a separator", () => {
    const d = parseQuizlet("a - 1 ||b - 2||broken", { termSep: " - ", rowSep: "||", deck: "Q" });
    expect(d.notes).toHaveLength(2);
    expect(d.errors).toEqual([{ row: 3, message: "no_separator" }]);
  });
});

describe("SuperMemo Q&A text", () => {
  it("reads Q:/A: blocks (also 问：/答：) with multi-line sides", () => {
    const d = parseSuperMemoText(fx("supermemo.txt"), { deck: "SM" });
    expect(sides(d)).toEqual([
      ["SM", "basic", "What is 2+2?", "4"],
      ["SM", "basic", "Capital of\nFrance?", "Paris\nIt is big."],
      ["SM", "basic", "中国首都？", "北京"],
    ]);
  });
});

describe("smart paste", () => {
  const d = smartPaste(fx("smart.txt"), { deck: "Paste" });
  it("splits free-form notes into cards by rule, headings → decks", () => {
    expect(d.notes.map((n) => [n.rule, n.fields.front ?? n.fields.text, n.fields.back ?? n.fields.extra])).toEqual([
      ["qa", "什么是细胞？", "生命的基本单位"],
      ["qa", "What is DNA?", "Deoxyribonucleic acid"],
      ["qa", "Capital of France?", "Paris"],
      ["colon", "光合作用", "植物利用光能合成有机物"],
      ["dash", "mitochondria", "powerhouse of the cell"],
      ["dash", "ATP", "energy currency"],
      ["equals", "水", "H2O"],
      ["double_colon", "Osmosis", "diffusion of water"],
      ["cloze", "The {{c1::nucleus}} contains DNA", ""],
      ["cloze", "细胞核内有{{c1::染色体}}", ""],
      ["colon", "bullet term", "bullet definition"],
      ["numbered", "Why is the sky blue?", "Rayleigh scattering\nof sunlight"],
    ]);
    expect(new Set(d.notes.map((n) => n.deckPath))).toEqual(new Set(["Paste::生物"]));
  });
  it("reports lines it could not split, for the preview", () => {
    expect(d.warnings).toEqual(["unmatched line 15: just a random line"]);
    const { backup, duplicates } = draftToBackup(d);
    const p = previewImport(backup, { duplicates, warnings: d.warnings, format: "smart" });
    expect(p.notes).toBe(12);
    expect(p.cards).toBe(12);
  });
  it("does not treat URLs or times as colon pairs", () => {
    expect(smartPaste("see https://example.com/x\nmeet at 10:30", { deck: "P" }).notes).toEqual([]);
  });
});
