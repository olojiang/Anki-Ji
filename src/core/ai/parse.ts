/** Parse / repair / validate the model's JSON answer into AiCards. */
import { z } from "zod";
import { hasCloze } from "../cloze";
import type { AiCard, CardStyle } from "./types";

const str = z.union([z.string(), z.number()]).transform((v) => String(v)).optional();
const RawCard = z.object({
  type: z.string().optional(), kind: z.string().optional(),
  front: str, back: str, question: str, answer: str, q: str, a: str,
  text: str, cloze: str, extra: str, note: str,
  tags: z.union([z.array(z.union([z.string(), z.number()])), z.string()]).optional(),
}).passthrough();
type RawCard = z.infer<typeof RawCard>;

/** Strip fences/prose, normalise quotes, remove trailing commas. Returns a JSON string (not guaranteed valid). */
export function repairJson(raw: string): string {
  let s = raw.replace(/^\uFEFF/, "").trim();
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)(?:```|$)/.exec(s);
  if (fence && fence[1].trim()) s = fence[1].trim();
  const start = s.search(/[[{]/);
  if (start > 0) s = s.slice(start);
  // smart quotes used as JSON delimiters
  s = s.replace(/[“”]/g, '"');
  // trailing commas outside strings
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { out += c; if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === ",") { let j = i + 1; while (j < s.length && /\s/.test(s[j])) j++; if (s[j] === "}" || s[j] === "]") continue; }
    out += c;
  }
  // drop trailing prose after the last closing bracket of a balanced value
  const end = balancedEnd(out);
  return end > 0 ? out.slice(0, end) : out;
}

/** Index after the first complete top-level value, or -1 if unbalanced. */
function balancedEnd(s: string): number {
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

/** Close a truncated JSON value at the last complete object. */
function closeTruncated(s: string): string | null {
  for (let cut = s.lastIndexOf("}"), tries = 0; cut > 0 && tries < 200; cut = s.lastIndexOf("}", cut - 1), tries++) {
    const head = s.slice(0, cut + 1);
    const stack: string[] = [];
    let inStr = false, esc = false;
    for (const c of head) {
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
      else if (c === "}" || c === "]") stack.pop();
    }
    if (inStr) continue;
    const candidate = head + stack.reverse().join("");
    try { JSON.parse(candidate); return candidate; } catch { /* keep cutting */ }
  }
  return null;
}

function tryParse(raw: string): { value: unknown; truncated: boolean } | null {
  const fixed = repairJson(raw);
  try { return { value: JSON.parse(fixed), truncated: false }; } catch { /* repair below */ }
  const closed = closeTruncated(fixed);
  if (closed) { try { return { value: JSON.parse(closed), truncated: true }; } catch { /* give up */ } }
  return null;
}

const clean = (s?: string) => (s ?? "").replace(/\r\n/g, "\n").trim();
const tagList = (t: RawCard["tags"]) => (Array.isArray(t) ? t.map(String) : typeof t === "string" ? t.split(/[,\s]+/) : [])
  .map((x) => x.trim().replace(/^#/, "").replace(/\s+/g, "_")).filter(Boolean).slice(0, 10);

function toCard(r: RawCard, style: CardStyle, warn: (m: string) => void, i: number): AiCard | null {
  const type = (r.type ?? r.kind ?? "").toLowerCase();
  const tags = tagList(r.tags);
  const front = clean(r.front ?? r.question ?? r.q);
  const back = clean(r.back ?? r.answer ?? r.a);
  const text = clean(r.text ?? r.cloze);
  const extra = clean(r.extra ?? r.note);
  const wantsCloze = type === "cloze" || (!type && !!text && !front);
  if (wantsCloze) {
    if (text && hasCloze(text)) return { kind: "cloze", text, extra, tags };
    if (front && back) return { kind: "qa", front, back, tags };
    if (front && hasCloze(front)) return { kind: "cloze", text: front, extra: back, tags };
    warn(`#${i + 1}: cloze card without {{c1::…}} deletion skipped`);
    return null;
  }
  if (front && hasCloze(front) && !back && style !== "qa") return { kind: "cloze", text: front, extra, tags };
  if (!front) { warn(`#${i + 1}: card without a question skipped`); return null; }
  if (!back) { warn(`#${i + 1}: card without an answer skipped`); return null; }
  return { kind: "qa", front, back, tags };
}

export function parseAiResponse(raw: string, style: CardStyle): { cards: AiCard[]; warnings: string[] } {
  const parsed = tryParse(raw);
  if (!parsed) throw new Error("ai_bad_json");
  const v = parsed.value as Record<string, unknown> | unknown[];
  const list = Array.isArray(v) ? v
    : Array.isArray((v as Record<string, unknown>)?.cards) ? (v as Record<string, unknown>).cards as unknown[]
    : Array.isArray((v as Record<string, unknown>)?.flashcards) ? (v as Record<string, unknown>).flashcards as unknown[]
    : v && typeof v === "object" && ("front" in v || "text" in v || "question" in v) ? [v] : null;
  if (!list) throw new Error("ai_bad_json");
  const warnings: string[] = [];
  if (parsed.truncated) warnings.push("The model's response was truncated; only complete cards were kept.");
  const cards: AiCard[] = [];
  const seen = new Set<string>();
  list.forEach((item, i) => {
    const r = RawCard.safeParse(item);
    if (!r.success) { warnings.push(`#${i + 1}: invalid card skipped`); return; }
    const c = toCard(r.data, style, (m) => warnings.push(m), i);
    if (!c) return;
    const key = (c.kind === "qa" ? c.front : c.text).toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return;
    seen.add(key);
    cards.push(c);
  });
  if (!cards.length) throw new Error(list.length ? "ai_bad_json" : "ai_no_cards");
  return { cards, warnings };
}
