import type { NoteFields, NoteType } from "../types";
import { NOTE_TYPES } from "../types";
import { hasCloze } from "../cloze";
import { cleanFields } from "../notes";

/** RFC-4180 style parser (quotes, escaped quotes, embedded delimiters/newlines, CRLF, BOM). */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  let any = false;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"' && cell === "") { inQuotes = true; any = true; i++; continue; }
    if (c === delimiter) { row.push(cell); cell = ""; any = true; i++; continue; }
    if (c === "\r" || c === "\n") {
      row.push(cell); rows.push(row); row = []; cell = ""; any = false;
      i += c === "\r" && s[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += c; any = true; i++;
  }
  if (any || cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function detectDelimiter(text: string): string {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/).slice(0, 5).join("\n");
  const count = (d: string) => first.split(d).length - 1;
  const cands = ["\t", ",", ";", "|"].map((d) => ({ d, n: count(d) }));
  cands.sort((a, b) => b.n - a.n);
  return cands[0].n > 0 ? cands[0].d : ",";
}

export function toDelimited(rows: string[][], delimiter: string): string {
  const esc = (v: string) => (/["\r\n]/.test(v) || v.includes(delimiter) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map((c) => esc(c ?? "")).join(delimiter)).join("\r\n") + "\r\n";
}

export interface FlatNote { deckPath: string; type: NoteType; fields: NoteFields; tags: string[] }

const ALIASES: Record<string, string[]> = {
  deck: ["deck", "牌组", "卡组", "分组"],
  type: ["type", "notetype", "note type", "类型", "题型"],
  front: ["front", "正面", "question", "问题", "text", "文本", "题目"],
  back: ["back", "背面", "answer", "答案", "extra", "额外", "解析"],
  tags: ["tags", "tag", "标签"],
  fields_json: ["fields_json"],
};

function headerMap(row: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  row.forEach((cell, i) => {
    const v = cell.trim().toLowerCase();
    for (const [k, names] of Object.entries(ALIASES)) if (names.includes(v) && map[k] === undefined) map[k] = i;
  });
  return Object.keys(map).length ? map : null;
}

function fieldsFor(type: NoteType, front: string, back: string): NoteFields {
  switch (type) {
    case "cloze": return { text: front, extra: back };
    case "mcq": return { question: front, options: back.split(/\r?\n|\|/).map((s) => s.trim()).filter(Boolean), correct: [0], explanation: "" };
    case "image_occlusion": return { header: front, extra: back, image: "", masks: [] };
    default: return { front, back };
  }
}

export function rowsToNotes(rows: string[][], opts: { defaultDeck: string }): { notes: FlatNote[]; errors: { row: number; message: string }[] } {
  const notes: FlatNote[] = [];
  const errors: { row: number; message: string }[] = [];
  if (!rows.length) return { notes, errors };
  const hdr = headerMap(rows[0]);
  const map = hdr ?? { front: 0, back: 1, tags: 2 };
  const body = hdr ? rows.slice(1) : rows;
  body.forEach((r, idx) => {
    const rowNo = idx + (hdr ? 2 : 1);
    const get = (k: string) => (map[k] !== undefined ? (r[map[k]] ?? "") : "");
    const front = get("front"), back = get("back");
    const deckPath = get("deck").trim() || opts.defaultDeck;
    const tags = get("tags").split(/\s+/).map((t) => t.trim()).filter(Boolean);
    const rawType = get("type").trim() as NoteType;
    const json = get("fields_json").trim();
    let type: NoteType = NOTE_TYPES.includes(rawType) ? rawType : hasCloze(front) ? "cloze" : "basic";
    let fields: NoteFields | null = null;
    if (json) {
      try { fields = cleanFields(type, JSON.parse(json)); } catch { errors.push({ row: rowNo, message: "invalid fields_json" }); return; }
    } else {
      if (!front.trim() && !back.trim()) { if (r.some((c) => c.trim())) errors.push({ row: rowNo, message: "empty front" }); else errors.push({ row: rowNo, message: "empty row" }); return; }
      if (!NOTE_TYPES.includes(rawType) && hasCloze(front)) type = "cloze";
      fields = fieldsFor(type, front, back);
    }
    notes.push({ deckPath, type, fields, tags });
  });
  return { notes, errors };
}

export function notesToRows(notes: FlatNote[]): string[][] {
  const rows = [["deck", "type", "front", "back", "tags", "fields_json"]];
  for (const n of notes) {
    const f = n.fields;
    const front = f.front ?? f.text ?? f.question ?? f.header ?? "";
    const back = f.back ?? f.extra ?? (f.options ? f.options.join("\n") : "") ?? "";
    rows.push([n.deckPath, n.type, front, back, n.tags.join(" "), JSON.stringify(f)]);
  }
  return rows;
}
