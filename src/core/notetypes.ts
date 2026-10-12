/**
 * Note types (Anki "models"): ordered fields + card templates + CSS.
 *
 * - Custom types belong to a user (DB table ak_notetypes). Notes of a custom type have `type = "custom"`,
 *   `notetype_id` set, and their values in `fields.custom` keyed by the *stable field id* (renames and reorders
 *   never touch note data).
 * - Template `ord` is stable too: a card's ord is its template's ord (or the 1-based cloze number for cloze
 *   kinds), so reordering templates keeps scheduling, and deleting a template only removes its own cards.
 * - The built-in types keep their own render logic (core/notes.ts) and are exposed here as read-only "stock"
 *   definitions, used for display, cloning and .apkg export.
 */
import type { NoteFields, NoteType } from "./types";
import type { RenderedCard } from "./notes";
import { clozeOrdinals } from "./cloze";
import { fieldIsEmpty, parseTemplate, renameFieldInTemplate, renderTemplate, stripHtml, templateFieldRefs, SPECIAL_FIELDS, type TemplateIssue } from "./template";

export type NoteTypeKind = "standard" | "cloze";
export interface NtField { id: string; name: string; font?: string; size?: number; rtl?: boolean }
export interface NtTemplate { ord: number; name: string; front: string; back: string }
export interface NoteTypeDef {
  id: number | string; // number for custom types, "stock:<type>" for built-ins
  name: string;
  kind: NoteTypeKind;
  fields: NtField[];
  templates: NtTemplate[];
  css: string;
  sortField: number; // index into fields
  markdown: boolean; // render field values as Markdown (true for types made in Anki-ji, false for Anki imports)
  stock?: NoteType;
  readOnly?: boolean;
  clonable?: boolean;
  sourceKey?: string | null; // e.g. "anki:<model id>" for imported models (re-import reuses the type)
  noteCount?: number;
}
export type FieldValues = Record<string, string>; // field id → value
export type IdGen = () => string;

export const randomId: IdGen = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 12);

export const DEFAULT_CSS = `.card {
  font-size: 20px;
  text-align: center;
  line-height: 1.6;
}
`;

const ANS = "\n\n<hr id=answer>\n\n";
const tpl = (ord: number, name: string, front: string, back: string): NtTemplate => ({ ord, name, front, back });
const stock = (type: NoteType, name: string, kind: NoteTypeKind, fields: [string, string][], templates: NtTemplate[], clonable = true): NoteTypeDef => ({
  id: `stock:${type}`, name, kind, fields: fields.map(([id, n]) => ({ id, name: n })), templates, css: DEFAULT_CSS, sortField: 0, markdown: true,
  stock: type, readOnly: true, clonable,
});

/** Built-in types as read-only definitions (field ids match the NoteFields keys). */
export const STOCK_NOTETYPES: NoteTypeDef[] = [
  stock("basic", "Basic", "standard", [["front", "Front"], ["back", "Back"]], [tpl(0, "Card 1", "{{Front}}", `{{FrontSide}}${ANS}{{Back}}`)]),
  stock("basic_reverse", "Basic (and reversed card)", "standard", [["front", "Front"], ["back", "Back"]], [
    tpl(0, "Card 1", "{{Front}}", `{{FrontSide}}${ANS}{{Back}}`), tpl(1, "Card 2", "{{Back}}", `{{FrontSide}}${ANS}{{Front}}`)]),
  stock("basic_optional_reverse", "Basic (optional reversed card)", "standard", [["front", "Front"], ["back", "Back"], ["addReverse", "Add Reverse"]], [
    tpl(0, "Card 1", "{{Front}}", `{{FrontSide}}${ANS}{{Back}}`), tpl(1, "Card 2", "{{#Add Reverse}}{{Back}}{{/Add Reverse}}", `{{FrontSide}}${ANS}{{Front}}`)]),
  stock("cloze", "Cloze", "cloze", [["text", "Text"], ["extra", "Back Extra"]], [tpl(0, "Cloze", "{{cloze:Text}}", "{{cloze:Text}}<br>\n{{Back Extra}}")]),
  stock("type_in", "Basic (type in the answer)", "standard", [["front", "Front"], ["back", "Back"]], [tpl(0, "Card 1", "{{Front}}\n\n{{type:Back}}", `{{Front}}${ANS}{{type:Back}}`)]),
  stock("mcq", "Multiple choice", "standard", [["question", "Question"], ["options", "Options"], ["explanation", "Explanation"]], [
    tpl(0, "Card 1", "{{Question}}\n\n{{Options}}", `{{FrontSide}}${ANS}{{Explanation}}`)], false),
  stock("image_occlusion", "Image Occlusion", "standard", [["image", "Image"], ["header", "Header"], ["extra", "Back Extra"]], [
    tpl(0, "Occlusion", "{{#Header}}<div>{{Header}}</div>{{/Header}}\n{{Image}}", `{{FrontSide}}${ANS}{{Back Extra}}`)], false),
];

export const stockNoteType = (type: NoteType): NoteTypeDef | undefined => STOCK_NOTETYPES.find((s) => s.stock === type);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Values (by field id) of any note: custom notes read `fields.custom`, built-in notes are mapped onto their stock fields. */
export function noteValues(nt: NoteTypeDef, type: NoteType, f: NoteFields): FieldValues {
  if (type === "custom" || !nt.stock) return sanitizeValues(nt, f.custom ?? {});
  const s = (v?: string) => v ?? "";
  switch (nt.stock) {
    case "basic_optional_reverse": return { front: s(f.front), back: s(f.back), addReverse: f.addReverse ? "y" : "" };
    case "cloze": return { text: s(f.text), extra: s(f.extra) };
    case "mcq": return {
      question: s(f.question), explanation: s(f.explanation),
      options: (f.options ?? []).length ? `<ol type="A">${(f.options ?? []).map((o, i) => `<li${(f.correct ?? []).includes(i) ? ' class="correct"' : ""}>${o}</li>`).join("")}</ol>` : "",
    };
    case "image_occlusion": return { image: f.image ? `<img src="${esc(f.image)}">` : "", header: s(f.header), extra: s(f.extra) };
    default: return { front: s(f.front), back: s(f.back) };
  }
}

/** Ordered field values (Anki `flds` order) — what an .apkg exporter writes. */
export function noteFieldValues(nt: NoteTypeDef, type: NoteType, f: NoteFields): string[] {
  const v = noteValues(nt, type, f);
  return nt.fields.map((x) => v[x.id] ?? "");
}

export function valuesByName(nt: NoteTypeDef, values: FieldValues): Record<string, string> {
  return Object.fromEntries(nt.fields.map((f) => [f.name, values[f.id] ?? ""]));
}

export function sanitizeValues(nt: NoteTypeDef, values: Record<string, unknown>): FieldValues {
  return Object.fromEntries(nt.fields.map((f) => [f.id, typeof values?.[f.id] === "string" ? (values[f.id] as string) : ""]));
}

// ───────────────────────────── validation ─────────────────────────────

const BAD_FIELD_NAME = /[:{}"]|^[#^/]/;

export function validateNoteType(nt: NoteTypeDef): TemplateIssue[] {
  const out: TemplateIssue[] = [];
  if (!nt.name?.trim()) out.push({ code: "empty_name" });
  if (!nt.fields.length) out.push({ code: "no_fields" });
  const seen = new Set<string>();
  for (const f of nt.fields) {
    const n = f.name.trim();
    if (!n) { out.push({ code: "empty_name", detail: "field" }); continue; }
    if (BAD_FIELD_NAME.test(n)) out.push({ code: "bad_name", detail: n });
    if ((SPECIAL_FIELDS as readonly string[]).includes(n)) out.push({ code: "reserved_name", detail: n });
    if (seen.has(n.toLowerCase())) out.push({ code: "duplicate_name", detail: n });
    seen.add(n.toLowerCase());
  }
  if (!nt.templates.length) out.push({ code: "no_templates" });
  if (nt.kind === "cloze" && nt.templates.length > 1) out.push({ code: "cloze_one_template" });
  const names = new Set<string>();
  const known = new Set([...nt.fields.map((f) => f.name.trim()), ...SPECIAL_FIELDS]);
  for (const t of nt.templates) {
    if (!t.name.trim()) out.push({ code: "empty_name", template: t.name, detail: "template" });
    if (names.has(t.name.trim().toLowerCase())) out.push({ code: "duplicate_name", template: t.name, detail: t.name });
    names.add(t.name.trim().toLowerCase());
    for (const side of ["front", "back"] as const) {
      const src = t[side];
      for (const e of parseTemplate(src).errors) out.push({ ...e, template: t.name, side });
      const refs = templateFieldRefs(src);
      for (const r of refs) if (!known.has(r.field) || (side === "front" && r.field === "FrontSide")) out.push({ code: "unknown_field", detail: r.field, template: t.name, side });
      if (side === "front") {
        const fieldRefs = refs.filter((r) => !(SPECIAL_FIELDS as readonly string[]).includes(r.field));
        if (nt.kind === "cloze") { if (!fieldRefs.some((r) => r.filters.includes("cloze"))) out.push({ code: "no_cloze", template: t.name, side }); }
        else if (!fieldRefs.length) out.push({ code: "no_field", template: t.name, side });
      }
    }
  }
  return out;
}

/** Note-level validation: returns an error code or null. */
export function validateCustomNote(nt: NoteTypeDef, values: FieldValues): string | null {
  return generateOrdinals(nt, values).length ? null : nt.kind === "cloze" ? "cloze_required" : "no_cards";
}

// ───────────────────────────── card generation ─────────────────────────────

const specialsFor = (nt: NoteTypeDef, t: NtTemplate | undefined, ctx: CardContext = {}) => {
  const deck = ctx.deck ?? "";
  return { Tags: (ctx.tags ?? []).join(" "), Type: nt.name, Deck: deck, Subdeck: deck.split("::").pop() ?? "", Card: t?.name ?? "" };
};

function frontIsEmpty(nt: NoteTypeDef, t: NtTemplate, values: FieldValues): boolean {
  // Anki semantics: a field holding only whitespace / <br> / empty divs counts as empty
  const byName = Object.fromEntries(Object.entries(valuesByName(nt, values)).map(([k, v]) => [k, fieldIsEmpty(v) ? "" : v]));
  const empty = Object.fromEntries(nt.fields.map((f) => [f.name, ""]));
  const base = { ord: t.ord, side: "front" as const, kind: nt.kind, specials: specialsFor(nt, t) };
  return renderTemplate(t.front, { ...base, values: byName }).html === renderTemplate(t.front, { ...base, values: empty }).html;
}

/** Which card ords a note of this type should have. */
export function generateOrdinals(nt: NoteTypeDef, values: FieldValues): number[] {
  if (nt.kind === "cloze") {
    const t = nt.templates[0];
    if (!t) return [];
    const byName = valuesByName(nt, values);
    const clozeFields = new Set(templateFieldRefs(t.front).filter((r) => r.filters.includes("cloze")).map((r) => r.field));
    const ords = new Set<number>();
    for (const f of clozeFields) for (const o of clozeOrdinals(byName[f] ?? "")) ords.add(o);
    return [...ords].sort((a, b) => a - b);
  }
  return nt.templates.filter((t) => !frontIsEmpty(nt, t, values)).map((t) => t.ord).sort((a, b) => a - b);
}

/**
 * Decide which cards to add and remove. Cards whose template is gone are removed; cards that are no longer
 * generated (empty front / removed cloze) are removed only while they are still new and unreviewed, so
 * scheduling is never thrown away by an edit.
 */
export function planCardChanges(existing: { ord: number; reps: number; state: string }[], wanted: number[], templateOrds: number[] | null): { add: number[]; remove: number[] } {
  const have = new Set(existing.map((c) => c.ord));
  return {
    add: wanted.filter((o) => !have.has(o)),
    remove: existing.filter((c) => !wanted.includes(c.ord) && ((templateOrds && !templateOrds.includes(c.ord)) || (c.reps === 0 && c.state === "new"))).map((c) => c.ord),
  };
}

// ───────────────────────────── rendering ─────────────────────────────

export interface CardContext { tags?: string[]; deck?: string; formatField?: (raw: string) => string; hintLabel?: string }
export interface CustomRenderPayload { noteType: NoteTypeDef; values: FieldValues; ord: number; tags: string[]; deck: string }

export function templateForOrd(nt: NoteTypeDef, ord: number): NtTemplate | undefined {
  return nt.kind === "cloze" ? nt.templates[0] : nt.templates.find((t) => t.ord === ord) ?? nt.templates[0];
}

/** Render one card of a note type. Output HTML is unsanitised (CardView sanitises + scopes the CSS). */
export function renderNoteTypeCard(nt: NoteTypeDef, values: FieldValues, ord: number, ctx: CardContext = {}): RenderedCard {
  const t = templateForOrd(nt, ord);
  const base = { values: valuesByName(nt, values), ord, kind: nt.kind, specials: specialsFor(nt, t, ctx), formatField: ctx.formatField, hintLabel: ctx.hintLabel };
  const front = renderTemplate(t?.front ?? "", { ...base, side: "front" });
  const back = renderTemplate(t?.back ?? "", { ...base, side: "back", frontSide: front.html });
  const typeAnswer = front.typeAnswer ?? back.typeAnswer;
  return {
    kind: "html", front: front.html, back: back.html, showFrontOnBack: false, css: nt.css,
    ...(typeAnswer != null ? { typeAnswer } : {}),
    custom: { noteType: nt, values, ord, tags: ctx.tags ?? [], deck: ctx.deck ?? "" },
  };
}

export function customSortField(nt: NoteTypeDef, values: FieldValues): string {
  const f = nt.fields[Math.min(Math.max(0, nt.sortField), nt.fields.length - 1)] ?? nt.fields[0];
  return f ? stripHtml(values[f.id] ?? "").slice(0, 500) : "";
}
export function customSearchText(values: FieldValues): string {
  return stripHtml(Object.values(values ?? {}).filter((v) => typeof v === "string" && v).join(" \n "));
}

// ───────────────────────────── editing helpers (pure) ─────────────────────────────

const nextOrd = (nt: NoteTypeDef) => (nt.templates.length ? Math.max(...nt.templates.map((t) => t.ord)) + 1 : 0);
const uniqueName = (taken: string[], base: string) => {
  const low = new Set(taken.map((x) => x.toLowerCase()));
  if (!low.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!low.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
};

export function blankNoteType(name: string, kind: NoteTypeKind, idGen: IdGen = randomId): NoteTypeDef {
  const base = stockNoteType(kind === "cloze" ? "cloze" : "basic")!;
  return { ...cloneNoteType(base, name, idGen), kind };
}

export function cloneNoteType(src: NoteTypeDef, name: string, idGen: IdGen = randomId): NoteTypeDef {
  return {
    id: 0, name, kind: src.kind, css: src.css, sortField: src.sortField, markdown: src.markdown,
    fields: src.fields.map((f) => ({ ...f, id: idGen() })),
    templates: src.templates.map((t) => ({ ...t })),
    sourceKey: null,
  };
}

export function addField(nt: NoteTypeDef, name: string, idGen: IdGen = randomId): NoteTypeDef {
  return { ...nt, fields: [...nt.fields, { id: idGen(), name: uniqueName(nt.fields.map((f) => f.name), name.trim() || "Field") }] };
}

export function renameField(nt: NoteTypeDef, id: string, name: string): NoteTypeDef {
  const old = nt.fields.find((f) => f.id === id);
  if (!old) return nt;
  const to = name.trim();
  return {
    ...nt,
    fields: nt.fields.map((f) => (f.id === id ? { ...f, name: to } : f)),
    templates: old.name && to && old.name !== to ? nt.templates.map((t) => ({ ...t, front: renameFieldInTemplate(t.front, old.name, to), back: renameFieldInTemplate(t.back, old.name, to) })) : nt.templates,
  };
}

/** Delete a field and every template tag that referenced it (section contents are kept). */
export function removeField(nt: NoteTypeDef, id: string): NoteTypeDef {
  const idx = nt.fields.findIndex((f) => f.id === id);
  if (idx < 0) return nt;
  const name = nt.fields[idx].name;
  const strip = (src: string) => src.replace(/\{\{([\s\S]*?)\}\}/g, (whole, inner: string) => {
    const t = inner.trim();
    const body = /^[#^/]/.test(t) ? t.slice(1).trim() : t;
    return body.split(":").pop()!.trim() === name ? "" : whole;
  });
  const sortName = nt.fields[nt.sortField]?.id;
  const fields = nt.fields.filter((f) => f.id !== id);
  return {
    ...nt, fields,
    sortField: Math.max(0, fields.findIndex((f) => f.id === sortName)),
    templates: nt.templates.map((t) => ({ ...t, front: strip(t.front), back: strip(t.back) })),
  };
}

export function moveField(nt: NoteTypeDef, id: string, delta: number): NoteTypeDef {
  const i = nt.fields.findIndex((f) => f.id === id);
  if (i < 0) return nt;
  const j = Math.max(0, Math.min(nt.fields.length - 1, i + delta));
  const sortId = nt.fields[nt.sortField]?.id;
  const fields = [...nt.fields];
  const [x] = fields.splice(i, 1);
  fields.splice(j, 0, x);
  return { ...nt, fields, sortField: Math.max(0, fields.findIndex((f) => f.id === sortId)) };
}

export function addTemplate(nt: NoteTypeDef, name: string): NoteTypeDef {
  const first = nt.fields[0]?.name ?? "Front";
  const second = nt.fields[1]?.name ?? first;
  return { ...nt, templates: [...nt.templates, tpl(nextOrd(nt), uniqueName(nt.templates.map((t) => t.name), name.trim() || "Card"), `{{${second}}}`, `{{FrontSide}}${ANS}{{${first}}}`)] };
}

export function removeTemplate(nt: NoteTypeDef, ord: number): NoteTypeDef {
  return { ...nt, templates: nt.templates.filter((t) => t.ord !== ord) };
}

export function moveTemplate(nt: NoteTypeDef, ord: number, delta: number): NoteTypeDef {
  const i = nt.templates.findIndex((t) => t.ord === ord);
  if (i < 0) return nt;
  const j = Math.max(0, Math.min(nt.templates.length - 1, i + delta));
  const templates = [...nt.templates];
  const [x] = templates.splice(i, 1);
  templates.splice(j, 0, x);
  return { ...nt, templates };
}

/** Coerce untrusted JSON (API bodies, imports) into a well-formed definition (validity is checked separately). */
export function normalizeNoteType(input: Partial<NoteTypeDef> & Record<string, unknown>, idGen: IdGen = randomId): NoteTypeDef {
  const str = (v: unknown, max = 100_000) => (typeof v === "string" ? v : "").slice(0, max);
  const usedIds = new Set<string>();
  const fields: NtField[] = (Array.isArray(input.fields) ? input.fields : []).slice(0, 100).map((raw) => {
    const f = (raw ?? {}) as Record<string, unknown>;
    let id = typeof f.id === "string" && /^[\w-]{1,40}$/.test(f.id) && !usedIds.has(f.id) ? f.id : "";
    while (!id || usedIds.has(id)) id = idGen();
    usedIds.add(id);
    const out: NtField = { id, name: str(f.name, 100).trim() };
    if (typeof f.font === "string" && f.font) out.font = f.font.slice(0, 100);
    if (Number.isFinite(Number(f.size)) && Number(f.size) > 0) out.size = Math.min(200, Math.round(Number(f.size)));
    if (f.rtl) out.rtl = true;
    return out;
  });
  const rawT = (Array.isArray(input.templates) ? input.templates : []).slice(0, 50).map((raw) => (raw ?? {}) as Record<string, unknown>);
  const usedOrds = new Set<number>();
  const ords = rawT.map((t) => { const o = Number(t.ord); if (Number.isInteger(o) && o >= 0 && o < 10_000 && !usedOrds.has(o)) { usedOrds.add(o); return o; } return -1; });
  let next = usedOrds.size ? Math.max(...usedOrds) + 1 : 0;
  const templates: NtTemplate[] = rawT.map((t, i) => ({ ord: ords[i] >= 0 ? ords[i] : next++, name: str(t.name, 100).trim(), front: str(t.front), back: str(t.back) }));
  const sortField = Number.isInteger(Number(input.sortField)) ? Math.max(0, Math.min(fields.length - 1, Number(input.sortField))) : 0;
  return {
    id: typeof input.id === "number" ? input.id : 0,
    name: str(input.name, 200).trim(),
    kind: input.kind === "cloze" ? "cloze" : "standard",
    fields, templates, css: str(input.css, 200_000), sortField: Math.max(0, sortField),
    markdown: input.markdown === undefined ? true : !!input.markdown,
    sourceKey: typeof input.sourceKey === "string" ? input.sourceKey.slice(0, 200) : null,
  };
}

// ───────────────────────────── export helpers (.apkg) ─────────────────────────────

export interface AnkiModelExport {
  name: string; type: 0 | 1; sortf: number; css: string;
  fields: { name: string; ord: number; font: string; size: number; rtl: boolean }[];
  templates: { name: string; ord: number; qfmt: string; afmt: string }[];
}

/** A note type as an Anki model (fields/templates in Anki ordinal order). Works for stock and custom types. */
export function exportModel(nt: NoteTypeDef): AnkiModelExport {
  return {
    name: nt.name, type: nt.kind === "cloze" ? 1 : 0, sortf: nt.sortField, css: nt.css,
    fields: nt.fields.map((f, i) => ({ name: f.name, ord: i, font: f.font ?? "Arial", size: f.size ?? 20, rtl: !!f.rtl })),
    templates: nt.templates.map((t, i) => ({ name: t.name, ord: i, qfmt: t.front, afmt: t.back })),
  };
}

/** Our card ord → Anki card ord (template index, or 0-based cloze index). */
export function ankiCardOrd(nt: NoteTypeDef, ord: number): number {
  if (nt.kind === "cloze") return Math.max(0, ord - 1);
  const i = nt.templates.findIndex((t) => t.ord === ord);
  return i < 0 ? 0 : i;
}
/** Anki card ord → our card ord. */
export function ourCardOrd(nt: NoteTypeDef, ankiOrd: number): number {
  return nt.kind === "cloze" ? ankiOrd + 1 : nt.templates[ankiOrd]?.ord ?? ankiOrd;
}

export { fieldIsEmpty };
