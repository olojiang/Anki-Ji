/**
 * Anki note-type ("model") definitions shared by the .apkg exporter and the AnkiConnect API.
 *
 * A note type is described by {fields, templates, css, kind}. Stock Anki-ji types map to the
 * classic Anki stock models; custom note types (feat/notetypes) plug in through `registerModel`
 * or by passing extra definitions to the exporter — nothing here depends on the stock list.
 */
import type { NoteFields, NoteType } from "../types";

export interface AnkiTemplate { name: string; qfmt: string; afmt: string }

export interface ModelDefinition {
  /** Stable Anki model id (fixed so repeated imports into Anki reuse the same note type). */
  id: number;
  name: string;
  kind: "standard" | "cloze";
  fields: string[];
  templates: AnkiTemplate[];
  css: string;
}

/** How one of our notes becomes one or more Anki notes of a model. */
export interface AnkiNotePart {
  /** Appended to the note guid when a note is split (e.g. one Anki note per occlusion mask). */
  guidSuffix: string;
  fields: string[];
  /** Our card ordinal → Anki template ordinal for the cards that belong to this part. */
  cards: { ord: number; ankiOrd: number }[];
}

/** Conversion helpers handed to exporters: Markdown → Anki HTML, and media URL → packaged filename. */
export interface ExportContext { html(md: string): string; media(url: string): string }
export const IDENTITY_CONTEXT: ExportContext = { html: (s) => s, media: (u) => u };

export interface NoteTypeExporter {
  model: ModelDefinition;
  /** Our note → Anki note parts, with field values already converted to Anki HTML via `ctx`. */
  toAnki(fields: NoteFields, ords: number[], ctx: ExportContext): AnkiNotePart[];
}

export interface NoteTypeImporter {
  model: ModelDefinition;
  noteType: NoteType | string;
  /** Anki field values by name → our fields (values are HTML). */
  fromAnki(values: Record<string, string>): NoteFields;
}

export const ANKI_CSS = `.card {
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
.cloze { font-weight: bold; color: #0a7d6b; }
.nightMode .cloze { color: #5fd3bc; }
.ak-src { font-size: 12px; opacity: .6; }
.ak-opts { display: inline-block; text-align: left; }
.ak-io { position: relative; display: inline-block; }
.ak-io img { max-width: 100%; display: block; }
.ak-io .ak-mask { position: absolute; background: #f5a524; border: 1px solid #b06f00; border-radius: 3px; }
.ak-io .ak-mask.on { background: #e5484d; }
.ak-io .ak-mask.reveal { background: transparent; border: 2px solid #e5484d; }
`;

const tpl = (name: string, qfmt: string, afmt: string): AnkiTemplate => ({ name, qfmt, afmt });
const FB = "{{FrontSide}}\n\n<hr id=answer>\n\n";

export const MODEL_BASIC: ModelDefinition = {
  id: 1760000000001, name: "Basic", kind: "standard", fields: ["Front", "Back"], css: ANKI_CSS,
  templates: [tpl("Card 1", "{{Front}}", FB + "{{Back}}")],
};
export const MODEL_BASIC_REVERSE: ModelDefinition = {
  id: 1760000000002, name: "Basic (and reversed card)", kind: "standard", fields: ["Front", "Back"], css: ANKI_CSS,
  templates: [tpl("Card 1", "{{Front}}", FB + "{{Back}}"), tpl("Card 2", "{{Back}}", FB + "{{Front}}")],
};
export const MODEL_BASIC_OPTIONAL_REVERSE: ModelDefinition = {
  id: 1760000000003, name: "Basic (optional reversed card)", kind: "standard", fields: ["Front", "Back", "Add Reverse"], css: ANKI_CSS,
  templates: [tpl("Card 1", "{{Front}}", FB + "{{Back}}"), tpl("Card 2", "{{#Add Reverse}}{{Back}}{{/Add Reverse}}", FB + "{{Front}}")],
};
export const MODEL_CLOZE: ModelDefinition = {
  id: 1760000000004, name: "Cloze", kind: "cloze", fields: ["Text", "Back Extra"], css: ANKI_CSS,
  templates: [tpl("Cloze", "{{cloze:Text}}", "{{cloze:Text}}<br>\n{{Back Extra}}")],
};
export const MODEL_TYPE_IN: ModelDefinition = {
  id: 1760000000005, name: "Basic (type in the answer)", kind: "standard", fields: ["Front", "Back"], css: ANKI_CSS,
  templates: [tpl("Card 1", "{{Front}}\n\n{{type:Back}}", "{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}")],
};

const s = (v?: string) => v ?? "";

/** Stock exporters: our NoteType → Anki model. MCQ / image occlusion are rendered into Basic notes. */
export const STOCK_EXPORTERS: Partial<Record<NoteType, NoteTypeExporter>> = {
  basic: { model: MODEL_BASIC, toAnki: (f, _o, c) => [{ guidSuffix: "", fields: [c.html(s(f.front)), c.html(s(f.back))], cards: [{ ord: 0, ankiOrd: 0 }] }] },
  basic_reverse: { model: MODEL_BASIC_REVERSE, toAnki: (f, ords, c) => [{ guidSuffix: "", fields: [c.html(s(f.front)), c.html(s(f.back))], cards: ords.filter((o) => o === 0 || o === 1).map((o) => ({ ord: o, ankiOrd: o })) }] },
  basic_optional_reverse: {
    model: MODEL_BASIC_OPTIONAL_REVERSE,
    toAnki: (f, ords, c) => [{ guidSuffix: "", fields: [c.html(s(f.front)), c.html(s(f.back)), f.addReverse ? "y" : ""], cards: ords.filter((o) => o === 0 || (o === 1 && f.addReverse)).map((o) => ({ ord: o, ankiOrd: o })) }],
  },
  cloze: { model: MODEL_CLOZE, toAnki: (f, ords, c) => [{ guidSuffix: "", fields: [c.html(s(f.text)), c.html(s(f.extra))], cards: ords.filter((o) => o >= 1).map((o) => ({ ord: o, ankiOrd: o - 1 })) }] },
  type_in: { model: MODEL_TYPE_IN, toAnki: (f, _o, c) => [{ guidSuffix: "", fields: [c.html(s(f.front)), c.html(s(f.back))], cards: [{ ord: 0, ankiOrd: 0 }] }] },
};

/** Models that external tools (AnkiConnect clients) can add notes with. */
export const STOCK_IMPORTERS: NoteTypeImporter[] = [
  { model: MODEL_BASIC, noteType: "basic", fromAnki: (v) => ({ front: s(v.Front), back: s(v.Back) }) },
  { model: MODEL_BASIC_REVERSE, noteType: "basic_reverse", fromAnki: (v) => ({ front: s(v.Front), back: s(v.Back) }) },
  { model: MODEL_BASIC_OPTIONAL_REVERSE, noteType: "basic_optional_reverse", fromAnki: (v) => ({ front: s(v.Front), back: s(v.Back), addReverse: !!s(v["Add Reverse"]).trim() }) },
  { model: MODEL_CLOZE, noteType: "cloze", fromAnki: (v) => ({ text: s(v.Text), extra: s(v["Back Extra"]) }) },
  { model: MODEL_TYPE_IN, noteType: "type_in", fromAnki: (v) => ({ front: s(v.Front), back: s(v.Back) }) },
];

const extraImporters: NoteTypeImporter[] = [];
/** Hook for custom note types (feat/notetypes): make them visible to AnkiConnect clients. */
export function registerModel(imp: NoteTypeImporter) {
  const i = extraImporters.findIndex((x) => x.model.name === imp.model.name);
  if (i >= 0) extraImporters[i] = imp; else extraImporters.push(imp);
}
export function allImporters(): NoteTypeImporter[] { return [...STOCK_IMPORTERS, ...extraImporters]; }
export function importerByName(name: string): NoteTypeImporter | undefined {
  const n = String(name ?? "").trim().toLowerCase();
  return allImporters().find((x) => x.model.name.toLowerCase() === n);
}
export function importerByNoteType(type: string): NoteTypeImporter | undefined {
  return allImporters().find((x) => x.noteType === type);
}

/** Field values of one of our notes as Anki sees them (used by notesInfo). */
export function noteToModelFields(type: string, f: NoteFields): { model: ModelDefinition; values: string[] } {
  const exp = STOCK_EXPORTERS[type as NoteType];
  if (exp) return { model: exp.model, values: exp.toAnki(f, [0, 1], IDENTITY_CONTEXT)[0].fields };
  const imp = importerByNoteType(type);
  if (imp) return { model: imp.model, values: imp.model.fields.map((n) => String((f as Record<string, unknown>)[n] ?? "")) };
  return { model: MODEL_BASIC, values: [s(f.front ?? f.question ?? f.header ?? f.text), s(f.back ?? f.explanation ?? f.extra)] };
}

/** Generic adapter for a custom note type definition: fields are read from `note.fields[fieldName]`. */
export function exporterFromDefinition(model: ModelDefinition): NoteTypeExporter {
  return {
    model,
    toAnki(f, ords, ctx) {
      const rec = f as Record<string, unknown>;
      const values = model.fields.map((n) => ctx.html(typeof rec[n] === "string" ? (rec[n] as string) : ""));
      const cards = model.kind === "cloze" ? ords.filter((o) => o >= 1).map((o) => ({ ord: o, ankiOrd: o - 1 })) : ords.filter((o) => o < model.templates.length).map((o) => ({ ord: o, ankiOrd: o }));
      return [{ guidSuffix: "", fields: values, cards }];
    },
  };
}
