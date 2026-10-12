/** Excel (.xlsx / .xls / .ods) via SheetJS: every sheet is read like a CSV (same header mapping, incl. Chinese headers). */
import * as XLSX from "xlsx";
import { newDraft, type ImportDraft } from "./draft";
import { rowsToNotes } from "./csv";

export interface ExcelOptions { rootDeck: string; sheetsAsDecks?: boolean }

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOle = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
export const isSpreadsheetBytes = (b: Uint8Array) => isZip(b) || isOle(b);

export function parseExcel(bytes: Uint8Array, opts: ExcelOptions): ImportDraft {
  if (!isSpreadsheetBytes(bytes)) throw new Error("not_spreadsheet");
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(bytes, { type: "array", cellDates: true, dense: true }); } catch { throw new Error("not_spreadsheet"); }
  const draft = newDraft("xlsx");
  const sheets = wb.SheetNames.map((name) => ({ name, rows: (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "", blankrows: false }) as unknown[][]).map((r) => r.map((c) => (c == null ? "" : String(c)))) }))
    .filter((s) => s.rows.some((r) => r.some((c) => c.trim())));
  const sub = (opts.sheetsAsDecks ?? true) && sheets.length > 1;
  for (const s of sheets) {
    const deck = [opts.rootDeck, sub ? s.name.replace(/::/g, ":") : ""].filter(Boolean).join("::") || "Default";
    const { notes, errors } = rowsToNotes(s.rows, { defaultDeck: deck });
    draft.notes.push(...notes);
    draft.errors.push(...errors.map((e) => ({ ...e, message: `${s.name}: ${e.message}` })));
  }
  return draft;
}
