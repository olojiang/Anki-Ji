/**
 * Glue between custom note types (core/notetypes) and the Anki interop layer (core/interop/models):
 * .apkg exporters keyed `custom:<id>`, and per-user AnkiConnect importers. Pure; no global registry, so one
 * user's note types are never visible to another (registerModel stays for process-wide stock additions).
 */
import type { NoteFields, NoteType } from "../types";
import { customNoteTypeExporter, noteFieldValues, type NoteTypeDef } from "../notetypes";
import type { ModelDefinition, NoteTypeExporter, NoteTypeImporter } from "./models";

export const customKey = (id: number | string) => `custom:${id}`;

/** Exporter lookup key for a note: custom notes by their note type id, built-in notes by type. */
export function exporterKeyFor(n: { type: NoteType | string; notetypeId?: number | null }): string {
  return n.type === "custom" && n.notetypeId != null ? customKey(n.notetypeId) : String(n.type);
}

export function customExporter(nt: NoteTypeDef): NoteTypeExporter {
  const e = customNoteTypeExporter(nt);
  return { model: e.model as ModelDefinition, toAnki: e.toAnki };
}

/** Exporters for every custom note type in a backup (missing / stock entries are ignored). */
export function customExportersFor(noteTypes: NoteTypeDef[] | undefined | null): Record<string, NoteTypeExporter> {
  const out: Record<string, NoteTypeExporter> = {};
  for (const nt of noteTypes ?? []) if (!nt.stock && nt.id != null && nt.fields?.length) out[customKey(nt.id)] = customExporter(nt);
  return out;
}

export type CustomImporter = NoteTypeImporter & { noteType: "custom"; notetypeId: number; def: NoteTypeDef };

/** AnkiConnect model for a user's custom note type: Anki field names ↔ our stable field ids. */
export function customImporter(nt: NoteTypeDef & { id: number }): CustomImporter {
  const model = customExporter(nt).model;
  return {
    model, noteType: "custom", notetypeId: nt.id, def: nt,
    fromAnki(values: Record<string, string>): NoteFields {
      return { custom: Object.fromEntries(nt.fields.map((f) => [f.id, String(values[f.name] ?? "")])) };
    },
  };
}

/** Field values of a custom note as Anki sees them (notesInfo / cardsInfo / updateNoteFields). */
export function customModelFields(nt: NoteTypeDef, f: NoteFields): { model: ModelDefinition; values: string[] } {
  return { model: customExporter(nt).model, values: noteFieldValues(nt, "custom", f) };
}
