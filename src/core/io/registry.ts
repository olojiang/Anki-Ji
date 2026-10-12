/**
 * Import format registry: detection by extension + content sniffing, and one entry point that turns any
 * supported file or pasted text into the backup envelope + a preview (same pipeline for every format).
 */
import JSZip from "jszip";
import type { SqlJsStatic } from "sql.js";
import { parseBackup, type Backup } from "./backup";
import { detectDelimiter, parseDelimited, rowsToNotes } from "./csv";
import { draftToBackup, newDraft, previewImport, type DraftIssue, type ImportDraft, type ImportPreview } from "./draft";
import { parseMarkdown, parseObsidianVault } from "./markdown";
import { parseRemNote } from "./remnote";
import { parseQuizlet, type QuizletOptions } from "./quizlet";
import { parseSuperMemoText, parseSuperMemoXml } from "./supermemo";
import { parseMnemosyneXml, parseMnemosyneCards } from "./mnemosyne";
import { parseMochi } from "./mochi";
import { smartPaste } from "./smartpaste";
import { basename, stripExt } from "./text";

export type ImportFormat = "backup" | "apkg" | "csv" | "xlsx" | "markdown" | "obsidian" | "mochi" | "remnote" | "quizlet" | "supermemo" | "supermemo-xml" | "mnemosyne" | "smart";
export const PASTE_FORMATS = ["smart", "quizlet", "supermemo", "markdown", "remnote", "csv"] as const;
export type PasteFormat = (typeof PASTE_FORMATS)[number];
export const FILE_ACCEPT = ".json,.csv,.tsv,.txt,.apkg,.colpkg,.xlsx,.xls,.ods,.md,.markdown,.zip,.mochi,.xml,.cards";
/** Formats whose deck structure comes from the file itself (the "default deck" field does not apply). */
export const SELF_DECKED: ImportFormat[] = ["backup", "apkg", "mochi"];

export interface ImportOptions {
  defaultDeck: string;
  quizlet?: Omit<QuizletOptions, "deck">;
  sheetsAsDecks?: boolean;
  headingsAsDecks?: boolean;
  loadSqlJs?: () => Promise<SqlJsStatic>;
}
export interface ParsedImport { format: ImportFormat; backup: Backup; errors: DraftIssue[]; warnings: string[]; duplicates: number; preview: ImportPreview }

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOle = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
const ext = (name: string) => (/\.([^.]+)$/.exec(name.toLowerCase())?.[1] ?? "");
const decode = (b: Uint8Array) => new TextDecoder("utf-8").decode(b).replace(/^\uFEFF/, "");

export function looksLikeRemNote(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return false;
  const bullets = lines.filter((l) => /^\s*[-*]\s+/.test(l)).length;
  const cards = lines.filter((l) => /^\s*[-*]\s+.*(>>|<<|;;|<>)/.test(l)).length;
  return cards > 0 && bullets / lines.length >= 0.8;
}
const looksLikeQA = (t: string) => /^\s*(Q|问)\s*[:：]/im.test(t) && /^\s*(A|答)\s*[:：]/im.test(t);

export async function detectFormat(name: string, bytes: Uint8Array): Promise<ImportFormat> {
  const e = ext(name);
  if (isZip(bytes)) {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error("unknown_format"); }
    const names = Object.keys(zip.files).filter((n) => !n.startsWith("__MACOSX/"));
    const has = (re: RegExp) => names.some((n) => re.test(n));
    if (has(/^collection\.anki(2|21|21b)$/)) return "apkg";
    if (has(/(^|\/)data\.(edn|json)$/)) return "mochi";
    if (has(/(^|\/)cards\.xml$/)) return "mnemosyne";
    if (has(/^\[Content_Types\]\.xml$/) || has(/^xl\/workbook\.xml$/) || (has(/^mimetype$/) && has(/^content\.xml$/))) return "xlsx";
    if (has(/\.(md|markdown)$/i)) return "obsidian";
    throw new Error("unknown_format");
  }
  if (isOle(bytes)) return "xlsx";
  const text = decode(bytes.subarray(0, 1 << 20));
  const head = text.trimStart();
  if (head.startsWith("{") || e === "json") return "backup";
  if (head.startsWith("<")) {
    if (/<SuperMemoCollection[\s>]/.test(head)) return "supermemo-xml";
    if (/<(mnemosyne|openSM2sync)[\s>]/.test(head)) return "mnemosyne";
    throw new Error("unknown_format");
  }
  if (e === "md" || e === "markdown") return looksLikeRemNote(text) ? "remnote" : "markdown";
  if (looksLikeQA(text) && e !== "csv" && e !== "tsv") return "supermemo";
  if (looksLikeRemNote(text)) return "remnote";
  return "csv";
}

function finish(format: ImportFormat, d: ImportDraft): ParsedImport {
  const { backup, duplicates } = draftToBackup(d);
  return { format, backup, errors: d.errors, warnings: d.warnings, duplicates, preview: previewImport(backup, { format, duplicates, errors: d.errors, warnings: d.warnings }) };
}

function csvDraft(text: string, delim: string, deck: string): ImportDraft {
  const d = newDraft("csv");
  const { notes, errors } = rowsToNotes(parseDelimited(text, delim), { defaultDeck: deck });
  d.notes.push(...notes); d.errors.push(...errors);
  return d;
}

export function parseImportText(format: PasteFormat | "csv" | "remnote" | "supermemo", text: string, opts: ImportOptions & { delimiter?: string }): ParsedImport {
  const deck = opts.defaultDeck || "Default";
  switch (format) {
    case "smart": return finish("smart", smartPaste(text, { deck }));
    case "quizlet": return finish("quizlet", parseQuizlet(text, { termSep: opts.quizlet?.termSep ?? "tab", rowSep: opts.quizlet?.rowSep ?? "newline", deck }));
    case "supermemo": return finish("supermemo", parseSuperMemoText(text, { deck }));
    case "markdown": return finish("markdown", parseMarkdown(text, { rootDeck: deck, headingsAsDecks: opts.headingsAsDecks }));
    case "remnote": return finish("remnote", parseRemNote(text, { rootDeck: deck }));
    default: return finish("csv", csvDraft(text, opts.delimiter ?? detectDelimiter(text), deck));
  }
}

export async function parseImportFile(name: string, bytes: Uint8Array, opts: ImportOptions): Promise<ParsedImport> {
  const format = await detectFormat(name, bytes);
  const deck = opts.defaultDeck || stripExt(basename(name)) || "Default";
  const whole = (b: Backup): ParsedImport => ({ format, backup: b, errors: [], warnings: [], duplicates: 0, preview: previewImport(b, { format }) });
  switch (format) {
    case "backup": return whole(parseBackup(decode(bytes)));
    case "apkg": {
      if (!opts.loadSqlJs) throw new Error("sqljs_required");
      const [{ readApkg, apkgToBackup }, SQL] = await Promise.all([import("./apkg"), opts.loadSqlJs()]);
      return whole(apkgToBackup(await readApkg(bytes, SQL)));
    }
    case "xlsx": { const { parseExcel } = await import("./xlsx"); return finish(format, parseExcel(bytes, { rootDeck: deck, sheetsAsDecks: opts.sheetsAsDecks })); }
    case "obsidian": return finish(format, await parseObsidianVault(bytes, { rootDeck: deck, headingsAsDecks: opts.headingsAsDecks }));
    case "mochi": return finish(format, await parseMochi(bytes));
    case "mnemosyne": return finish(format, isZip(bytes) ? await parseMnemosyneCards(bytes, { rootDeck: deck }) : parseMnemosyneXml(decode(bytes), { rootDeck: deck }));
    case "supermemo-xml": return finish(format, parseSuperMemoXml(decode(bytes), { rootDeck: deck }));
    case "markdown": return finish(format, parseMarkdown(decode(bytes), { rootDeck: deck, headingsAsDecks: opts.headingsAsDecks }));
    case "remnote": return finish(format, parseRemNote(decode(bytes), { rootDeck: deck }));
    case "supermemo": return finish(format, parseSuperMemoText(decode(bytes), { deck }));
    default: {
      const text = decode(bytes);
      const e = ext(name);
      const delim = e === "tsv" ? "\t" : e === "csv" ? (detectDelimiter(text) === ";" ? ";" : ",") : detectDelimiter(text);
      return finish("csv", csvDraft(text, delim, deck));
    }
  }
}
