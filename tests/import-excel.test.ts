import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseExcel } from "@/core/io/xlsx";
import { rowsToNotes } from "@/core/io/csv";

function workbook(bookType: "xlsx" | "biff8" = "xlsx") {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["单词", "释义", "标签"], ["apple", "苹果", "fruit"], ["dog", "狗", ""], [42, new Date(Date.UTC(2026, 0, 2)), ""]]), "Vocab");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Front", "Back", "Deck"], ["{{c1::Paris}} is in France", "geo", ""], ["Q", "A", "Custom::Deck"]]), "Grammar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "Empty");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType }));
}

describe("Excel import", () => {
  it("maps each sheet to a sub-deck with CSV-style (Chinese) header mapping", () => {
    const d = parseExcel(workbook(), { rootDeck: "Book" });
    expect(d.format).toBe("xlsx");
    expect(d.notes.map((n) => [n.deckPath, n.type, n.fields.front ?? n.fields.text, n.fields.back ?? n.fields.extra, n.tags])).toEqual([
      ["Book::Vocab", "basic", "apple", "苹果", ["fruit"]],
      ["Book::Vocab", "basic", "dog", "狗", []],
      ["Book::Vocab", "basic", "42", expect.stringMatching(/2026|1\/2\/26/), []],
      ["Book::Grammar", "cloze", "{{c1::Paris}} is in France", "geo", []],
      ["Custom::Deck", "basic", "Q", "A", []],
    ]);
  });
  it("can put every sheet into the root deck", () => {
    const d = parseExcel(workbook(), { rootDeck: "Book", sheetsAsDecks: false });
    expect(new Set(d.notes.map((n) => n.deckPath))).toEqual(new Set(["Book", "Custom::Deck"]));
  });
  it("a single-sheet workbook goes straight into the root deck", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["q", "a"]]), "Sheet1");
    const d = parseExcel(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), { rootDeck: "Root" });
    expect(d.notes[0]).toMatchObject({ deckPath: "Root", fields: { front: "q", back: "a" } });
  });
  it("reads legacy .xls (BIFF8) too", () => {
    expect(parseExcel(workbook("biff8"), { rootDeck: "Book" }).notes).toHaveLength(5);
  });
  it("rejects files that are not spreadsheets", () => {
    expect(() => parseExcel(new TextEncoder().encode("\u0000\u0001garbage\u0002"), { rootDeck: "x" })).toThrow("not_spreadsheet");
  });
});

describe("CSV/Excel header presets (Quizlet, Knowt, Brainscape, Noji exports)", () => {
  it("understands term/definition, question/answer, word/meaning, 术语/定义", () => {
    for (const h of [["Term", "Definition"], ["Question", "Answer"], ["Word", "Meaning"], ["术语", "定义"], ["词语", "解释"]]) {
      expect(rowsToNotes([h, ["x", "y"]], { defaultDeck: "D" }).notes).toEqual([{ deckPath: "D", type: "basic", fields: { front: "x", back: "y" }, tags: [] }]);
    }
  });
});
