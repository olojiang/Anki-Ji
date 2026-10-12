/**
 * Batch editing for Browse: find & replace, duplicate detection/merge, note type change.
 * Pure functions; the server layer persists the results.
 */
import type { NoteFields, NoteType } from "./types";
import { stripMarkup } from "./notes";

/* ─────────── find & replace ─────────── */
export interface ReplaceSpec { find: string; replace: string; regex?: boolean; caseSensitive?: boolean; fields?: string[] | "all" }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Global RegExp for a spec. Throws `empty_find` / `invalid_regex`. */
export function buildPattern(spec: Pick<ReplaceSpec, "find" | "regex" | "caseSensitive"> & Partial<ReplaceSpec>): RegExp {
  if (!spec.find) throw new Error("empty_find");
  const flags = `g${spec.caseSensitive ? "" : "i"}`;
  const src = spec.regex ? spec.find : escapeRe(spec.find);
  // Prefer unicode mode (\p{…}, astral chars); fall back for patterns only valid in legacy mode (e.g. "\-").
  try { return new RegExp(src, flags + "u"); } catch { /* try legacy */ }
  try { return new RegExp(src, flags); } catch { throw new Error("invalid_regex"); }
}

/** Text fields of each stock note type that find & replace may edit (in display order). */
const TEXT_FIELDS: Record<NoteType, string[]> = {
  basic: ["front", "back"], basic_reverse: ["front", "back"], basic_optional_reverse: ["front", "back"], type_in: ["front", "back"],
  cloze: ["text", "extra"], mcq: ["question", "options", "explanation"], image_occlusion: ["header", "extra"],
  custom: [], // custom note fields live in fields.custom (keyed by field id), handled separately
};
export const ALL_TEXT_FIELDS = ["front", "back", "text", "extra", "question", "options", "explanation", "header", "custom"];
export const noteTextFields = (type: NoteType): string[] => TEXT_FIELDS[type] ?? ["front", "back"];

function replaceString(s: string, re: RegExp, spec: ReplaceSpec): { out: string; n: number } {
  let n = 0;
  re.lastIndex = 0;
  const out = spec.regex
    ? s.replace(re, (...args) => { n++; const end = args.findIndex((a, i) => i > 0 && typeof a === "number"); const groups = args.slice(1, end) as (string | undefined)[]; return expand(spec.replace, args[0] as string, groups); })
    : s.replace(re, () => { n++; return spec.replace; });
  return { out, n };
}
/** `$&`, `$1`..`$99`, `$$` expansion for regex replacements. */
function expand(tpl: string, match: string, groups: (string | undefined)[]): string {
  return tpl.replace(/\$(\$|&|\d{1,2})/g, (_, k: string) => (k === "$" ? "$" : k === "&" ? match : groups[Number(k) - 1] ?? ""));
}

/** Custom note types keep values in `fields.custom` keyed by field id; spec fields address them as "custom" (all) or "custom:<id>". */
function replaceInCustom(fields: NoteFields, spec: ReplaceSpec, re: RegExp): { fields: NoteFields; count: number; changed: string[] } {
  const want = (id: string) => spec.fields === undefined || spec.fields === "all" || spec.fields.includes("custom") || spec.fields.includes(`custom:${id}`);
  const custom: Record<string, string> = { ...(fields.custom ?? {}) };
  let count = 0;
  const changed: string[] = [];
  for (const [id, v] of Object.entries(custom)) {
    if (!want(id) || typeof v !== "string" || !v) continue;
    const r = replaceString(v, re, spec);
    if (r.n) { custom[id] = r.out; count += r.n; changed.push(`custom:${id}`); }
  }
  return { fields: { ...fields, custom }, count, changed };
}

export function replaceInNote(type: NoteType, fields: NoteFields, spec: ReplaceSpec, re = buildPattern(spec)): { fields: NoteFields; count: number; changed: string[] } {
  if (type === "custom") return replaceInCustom(fields, spec, re);
  const allowed = noteTextFields(type).filter((f) => spec.fields === undefined || spec.fields === "all" || spec.fields.includes(f));
  const out: Record<string, unknown> = { ...fields };
  let count = 0;
  const changed: string[] = [];
  for (const f of allowed) {
    const v = out[f];
    if (f === "options" && Array.isArray(v)) {
      let n = 0;
      const next = v.map((x) => { const r = replaceString(String(x ?? ""), re, spec); n += r.n; return r.out; });
      if (n) { out[f] = next; count += n; changed.push(f); }
    } else if (typeof v === "string" && v) {
      const r = replaceString(v, re, spec);
      if (r.n) { out[f] = r.out; count += r.n; changed.push(f); }
    }
  }
  return { fields: out as NoteFields, count, changed };
}

export interface ReplacePreview { notes: number; matches: number; samples: { noteId: number; field: string; before: string; after: string }[] }
export function previewReplace(notes: { id: number; type: NoteType; fields: NoteFields }[], spec: ReplaceSpec, sampleLimit = 8): ReplacePreview {
  const re = buildPattern(spec);
  const p: ReplacePreview = { notes: 0, matches: 0, samples: [] };
  for (const n of notes) {
    const r = replaceInNote(n.type, n.fields, spec, re);
    if (!r.count) continue;
    p.notes++; p.matches += r.count;
    for (const f of r.changed) {
      if (p.samples.length >= sampleLimit) break;
      const get = (x: NoteFields) => (f.startsWith("custom:") ? x.custom?.[f.slice(7)] : x[f as keyof NoteFields]);
      const before = get(n.fields), after = get(r.fields);
      p.samples.push({ noteId: n.id, field: f, before: Array.isArray(before) ? before.join(" | ") : String(before ?? ""), after: Array.isArray(after) ? after.join(" | ") : String(after ?? "") });
    }
  }
  return p;
}

/* ─────────── duplicates ─────────── */
/** First field used for duplicate detection. Custom notes use their note type's sort field (`sortField`, stored on the note) when given. */
export function firstFieldOf(type: NoteType, f: NoteFields, sortField?: string | null): string {
  switch (type) {
    case "custom": return sortField ?? Object.values(f.custom ?? {})[0] ?? "";
    case "cloze": return f.text ?? "";
    case "mcq": return f.question ?? "";
    case "image_occlusion": return f.header ?? "";
    default: return f.front ?? "";
  }
}
export const normalizeFirstField = (s: string) => stripMarkup(String(s ?? "").normalize("NFKC")).toLowerCase().replace(/\s+/g, " ").trim();

export type DupScope = "deck" | "type" | "collection";
export function findDuplicates<T extends { id: number; deckId: number; type: NoteType; fields: NoteFields; notetypeId?: number | null; sortField?: string }>(notes: T[], scope: DupScope): { key: string; ids: number[] }[] {
  const m = new Map<string, { key: string; ids: number[] }>();
  for (const n of [...notes].sort((a, b) => a.id - b.id)) {
    const key = normalizeFirstField(firstFieldOf(n.type, n.fields, n.type === "custom" ? n.sortField : undefined));
    if (!key) continue;
    const typeKey = n.type === "custom" ? `custom:${n.notetypeId ?? ""}` : n.type;
    const k = scope === "deck" ? `${n.deckId}\u0000${key}` : scope === "type" ? `${typeKey}\u0000${key}` : key;
    (m.get(k) ?? m.set(k, { key, ids: [] }).get(k)!).ids.push(n.id);
  }
  return [...m.values()].filter((g) => g.ids.length > 1).sort((a, b) => a.ids[0] - b.ids[0]);
}

export function planMerge(group: { id: number; tags: string[] }[], keepId: number): { keepId: number; removeIds: number[]; tags: string[] } {
  const keep = group.find((g) => g.id === keepId);
  if (!keep) throw new Error("keep_not_in_group");
  const tags = [...new Set([...keep.tags, ...group.filter((g) => g !== keep).flatMap((g) => g.tags)])];
  return { keepId, removeIds: group.filter((g) => g !== keep).map((g) => g.id), tags };
}

/** For each card ordinal, the card with the most reviews (ties: latest review). Used to adopt the most advanced scheduling on merge. */
export function bestCardsByOrd(cards: { id: number; noteId: number; ord: number; reps: number; lastReview: string | Date | null }[]): Map<number, number> {
  const t = (d: string | Date | null) => (d ? new Date(d).getTime() : 0);
  const best = new Map<number, (typeof cards)[number]>();
  for (const c of cards) {
    const b = best.get(c.ord);
    if (!b || c.reps > b.reps || (c.reps === b.reps && t(c.lastReview) > t(b.lastReview))) best.set(c.ord, c);
  }
  return new Map([...best].map(([ord, c]) => [ord, c.id]));
}

/* ─────────── change note type ─────────── */
/** Stock types whose content is plain named text fields, so a field mapping is meaningful. */
export const STOCK_FIELDS: Partial<Record<NoteType, string[]>> = {
  basic: ["front", "back"], basic_reverse: ["front", "back"], basic_optional_reverse: ["front", "back"], type_in: ["front", "back"], cloze: ["text", "extra"],
};
export const CONVERTIBLE_TYPES = Object.keys(STOCK_FIELDS) as NoteType[];
export const canConvert = (from: NoteType, to: NoteType) => from !== to && CONVERTIBLE_TYPES.includes(from) && CONVERTIBLE_TYPES.includes(to);

export type FieldMapping = Record<string, string | null>; // target field → source field (or null = empty)

/** Same-name first, then remaining fields by position. Works for any field lists (custom note types too). */
export function defaultFieldMapping(source: string[], target: string[]): FieldMapping {
  const out: FieldMapping = {};
  const used = new Set<string>();
  for (const t of target) if (source.includes(t)) { out[t] = t; used.add(t); }
  const free = source.filter((s) => !used.has(s));
  for (const t of target) if (!(t in out)) out[t] = free.shift() ?? null;
  return Object.fromEntries(target.map((t) => [t, out[t]]));
}

/** Apply a mapping. Generic over field lists so custom note types (feat/notetypes) can reuse it. Throws `invalid_mapping`. */
export function mapFieldValues(source: string[], target: string[], mapping: FieldMapping, values: Record<string, unknown>): Record<string, string> {
  for (const [t, s] of Object.entries(mapping)) if (!target.includes(t) || (s != null && !source.includes(s))) throw new Error("invalid_mapping");
  return Object.fromEntries(target.map((t) => {
    const s = mapping[t];
    const v = s == null ? "" : values[s];
    return [t, typeof v === "string" ? v : v == null ? "" : String(v)];
  }));
}

/** Convert the fields of a stock note. Throws `unsupported_conversion` / `invalid_mapping`. */
export function convertStockNote(from: NoteType, to: NoteType, fields: NoteFields, mapping: FieldMapping): NoteFields {
  if (!canConvert(from, to)) throw new Error("unsupported_conversion");
  const out = mapFieldValues(STOCK_FIELDS[from]!, STOCK_FIELDS[to]!, mapping, fields as Record<string, unknown>) as NoteFields;
  if (to === "basic_optional_reverse") out.addReverse = from === "basic_reverse" || (from === "basic_optional_reverse" && !!fields.addReverse);
  return out;
}
