import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import initSqlJs from "sql.js";
import { detectFormat, parseImportFile, parseImportText, PASTE_FORMATS, FILE_ACCEPT } from "@/core/io/registry";
import { createBackup } from "@/core/io/backup";
import { notesToRows, toDelimited } from "@/core/io/csv";
import { importDecks, importNotes } from "@/core/io/importer";
import { nestNotes } from "@/core/io/backup";
import { cardOrdinals } from "@/core/notes";
import { mediaNeededFor } from "@/core/io/draft";
import { memorySink } from "./helpers/memsink";

const fx = (n: string) => readFileSync(new URL(`./fixtures/import/${n}`, import.meta.url));
const enc = (s: string) => new TextEncoder().encode(s);
const zip = async (files: Record<string, string | Uint8Array>) => { const z = new JSZip(); for (const [k, v] of Object.entries(files)) z.file(k, v); return z.generateAsync({ type: "uint8array" }); };
const xlsx = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["front", "back"], ["a", "b"]]), "S"); return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })); };

const samples: Record<string, () => Promise<{ name: string; bytes: Uint8Array }>> = {};
beforeAll(async () => {
  samples.backup = async () => ({ name: "b.json", bytes: enc(JSON.stringify(createBackup({ decks: [{ id: 1, name: "D" }], notes: [{ id: 1, deckId: 1, guid: "g", type: "basic", fields: { front: "f", back: "b" } }], cards: [], revlog: [] }))) });
  samples.csv = async () => ({ name: "n.csv", bytes: enc("front,back\nq,a\n") });
  samples.tsv = async () => ({ name: "n.txt", bytes: enc("q\ta\nq2\ta2\n") });
  samples.supermemo = async () => ({ name: "sm.txt", bytes: fx("supermemo.txt") });
  samples.remnote = async () => ({ name: "rem.md", bytes: fx("remnote.md") });
  samples.markdown = async () => ({ name: "notes.md", bytes: fx("obsidian.md") });
  samples.smxml = async () => ({ name: "c.xml", bytes: fx("supermemo.xml") });
  samples.mnemo1 = async () => ({ name: "m.xml", bytes: fx("mnemosyne1.xml") });
  samples.mnemo2 = async () => ({ name: "m.cards", bytes: await zip({ "cards.xml": fx("mnemosyne-cards.xml"), "pics/sun.png": new Uint8Array([1]) }) });
  samples.mochi = async () => ({ name: "export.zip", bytes: await zip({ "data.edn": fx("mochi-data.edn"), "dog.jpg": new Uint8Array([1, 2]) }) });
  samples.vault = async () => ({ name: "vault.zip", bytes: await zip({ "V/a.md": "Q::A ![[x.png]]", "V/x.png": new Uint8Array([3]) }) });
  samples.xlsx = async () => ({ name: "book.xlsx", bytes: xlsx() });
});

describe("format detection (extension + content sniffing)", () => {
  it.each([
    ["backup", "backup"], ["csv", "csv"], ["tsv", "csv"], ["supermemo", "supermemo"], ["remnote", "remnote"], ["markdown", "markdown"],
    ["smxml", "supermemo-xml"], ["mnemo1", "mnemosyne"], ["mnemo2", "mnemosyne"], ["mochi", "mochi"], ["vault", "obsidian"], ["xlsx", "xlsx"],
  ])("%s → %s", async (k, fmt) => {
    const { name, bytes } = await samples[k]();
    expect(await detectFormat(name, bytes)).toBe(fmt);
  });
  it("sniffs content even with a misleading extension", async () => {
    expect(await detectFormat("data.bin", fx("supermemo.xml"))).toBe("supermemo-xml");
    expect(await detectFormat("whatever.zip", (await samples.mochi()).bytes)).toBe("mochi");
    expect(await detectFormat("sheet.dat", xlsx())).toBe("xlsx");
  });
  it("recognises .apkg packages and rejects unknown zips", async () => {
    expect(await detectFormat("x.apkg", await zip({ "collection.anki2": new Uint8Array([0]) }))).toBe("apkg");
    await expect(detectFormat("x.zip", await zip({ "a.bin": new Uint8Array([1]) }))).rejects.toThrow("unknown_format");
  });
  it("advertises every extension in the file picker", () => {
    for (const ext of [".xlsx", ".xls", ".md", ".zip", ".mochi", ".xml", ".cards", ".apkg", ".csv"]) expect(FILE_ACCEPT).toContain(ext);
  });
});

describe("every format goes through the same pipeline and dedupes on re-import", () => {
  it.each(["csv", "tsv", "supermemo", "remnote", "markdown", "smxml", "mnemo1", "mnemo2", "mochi", "vault", "xlsx", "backup"])("%s", async (k) => {
    const { name, bytes } = await samples[k]();
    const SQL = await initSqlJs();
    const parsed = await parseImportFile(name, bytes, { defaultDeck: "Imp", loadSqlJs: async () => SQL });
    expect(parsed.backup.notes.length).toBeGreaterThan(0);
    expect(parsed.preview.notes).toBe(parsed.backup.notes.length);
    const { sink, db } = memorySink();
    const run = async () => {
      const p = await parseImportFile(name, bytes, { defaultDeck: "Imp", loadSqlJs: async () => SQL });
      const deckMap = await importDecks(sink, p.backup.decks, db.decks.map((d) => ({ id: d.id as number, parentId: (d.parentId as number) ?? null, name: d.name as string })));
      const notes = nestNotes(p.backup).map((n) => (n.cards.length ? n : { ...n, cards: cardOrdinals(n.type, n.fields).map((ord) => ({ ord, revlog: [] })) }));
      return { res: await importNotes(sink, notes as never, deckMap), p };
    };
    const first = await run();
    expect(first.res.skipped).toBe(0);
    const second = await run();
    expect(second.res.notes).toBe(0);
    expect(second.res.skipped).toBe(parsed.backup.notes.length);
    // media of already-imported notes is not uploaded again
    expect(mediaNeededFor(second.p.backup, new Set(db.notes.map((n) => n.guid as string)))).toEqual([]);
  });
  it("CSV export → import keeps guids stable (round trip)", async () => {
    const p = await parseImportFile("n.md", fx("obsidian.md"), { defaultDeck: "Imp" });
    const flat = p.backup.notes.map((n) => ({ deckPath: "Imp", type: n.type, fields: n.fields, tags: n.tags }));
    const again = await parseImportFile("x.csv", enc(toDelimited(notesToRows(flat), ",")), { defaultDeck: "Imp" });
    expect(again.backup.notes.map((n) => n.guid).sort()).toEqual(p.backup.notes.map((n) => n.guid).sort());
  });
});

describe("paste formats", () => {
  it("lists the paste presets", () => {
    expect(PASTE_FORMATS).toEqual(["smart", "quizlet", "supermemo", "markdown", "remnote", "csv"]);
  });
  it("parses pasted text with a preview", () => {
    const q = parseImportText("quizlet", "a\t1\nb\t2", { defaultDeck: "Q", quizlet: { termSep: "tab", rowSep: "newline" } });
    expect(q.preview).toMatchObject({ format: "quizlet", notes: 2, cards: 2, decks: ["Q"] });
    const s = parseImportText("smart", "猫：cat\nrandom", { defaultDeck: "P" });
    expect(s.preview.notes).toBe(1);
    expect(s.preview.warnings).toHaveLength(1);
    expect(parseImportText("csv", "front;back\nx;y", { defaultDeck: "C" }).preview.notes).toBe(1);
  });
});
