import type { NoteFields, NoteType, OcclusionMask } from "./types";
import { clozeOrdinals, renderCloze, stripCloze } from "./cloze";

export interface RenderedCard {
  kind: "plain" | "type" | "mcq" | "occlusion";
  front: string; // markdown
  back: string; // markdown (answer part)
  showFrontOnBack: boolean;
  typeAnswer?: string;
  options?: string[];
  correct?: number[];
  occlusion?: { image: string; masks: OcclusionMask[]; active: number; mode: "hideOne" | "hideAll" };
}

/** Which card ordinals a note produces. Cloze ordinals are 1-based like Anki; all others 0-based. */
export function cardOrdinals(type: NoteType, f: NoteFields): number[] {
  switch (type) {
    case "basic_reverse": return [0, 1];
    case "basic_optional_reverse": return f.addReverse ? [0, 1] : [0];
    case "cloze": return clozeOrdinals(f.text ?? "");
    case "image_occlusion": return (f.masks ?? []).map((_, i) => i);
    default: return [0];
  }
}

export function renderCard(type: NoteType, f: NoteFields, ord: number): RenderedCard {
  const extra = (s?: string) => (s && s.trim() ? `\n\n${s}` : "");
  switch (type) {
    case "basic_reverse":
    case "basic_optional_reverse":
      return ord === 1
        ? { kind: "plain", front: f.back ?? "", back: f.front ?? "", showFrontOnBack: true }
        : { kind: "plain", front: f.front ?? "", back: f.back ?? "", showFrontOnBack: true };
    case "cloze":
      return { kind: "plain", front: renderCloze(f.text ?? "", ord, "front"), back: renderCloze(f.text ?? "", ord, "back") + extra(f.extra), showFrontOnBack: false };
    case "type_in":
      return { kind: "type", front: f.front ?? "", back: f.back ?? "", showFrontOnBack: true, typeAnswer: stripMarkup(f.back ?? "") };
    case "mcq":
      return { kind: "mcq", front: f.question ?? "", back: f.explanation ?? "", showFrontOnBack: true, options: f.options ?? [], correct: f.correct ?? [] };
    case "image_occlusion":
      return {
        kind: "occlusion", front: f.header ?? "", back: f.extra ?? "", showFrontOnBack: false,
        occlusion: { image: f.image ?? "", masks: f.masks ?? [], active: ord, mode: f.occlusionMode ?? "hideOne" },
      };
    default:
      return { kind: "plain", front: f.front ?? "", back: f.back ?? "", showFrontOnBack: true };
  }
}

/** Remove markdown/HTML so text can be sorted, searched and compared. */
export function stripMarkup(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[sound:[^\]]*\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/(\*\*|__|`|~~)/g, "")
    .replace(/(^|\s)[*_](\S)/g, "$1$2").replace(/(\S)[*_](\s|$)/g, "$1$2")
    .replace(/^#+\s*/gm, "")
    .replace(/\$\$?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sortField(type: NoteType, f: NoteFields): string {
  switch (type) {
    case "cloze": return stripMarkup(stripCloze(f.text ?? ""));
    case "mcq": return stripMarkup(f.question ?? "");
    case "image_occlusion": return stripMarkup(f.header ?? "") || "Image occlusion";
    default: return stripMarkup(f.front ?? "");
  }
}

/** All searchable text of a note. */
export function searchText(type: NoteType, f: NoteFields): string {
  const parts = [f.front, f.back, f.text ? stripCloze(f.text) : "", f.extra, f.question, ...(f.options ?? []), f.explanation, f.header, ...(f.masks ?? []).map((m) => m.label ?? "")];
  return stripMarkup(parts.filter(Boolean).join(" \n "));
}

export function diffOrdinals(existing: number[], wanted: number[]): { add: number[]; remove: number[] } {
  return { add: wanted.filter((o) => !existing.includes(o)), remove: existing.filter((o) => !wanted.includes(o)) };
}

/** Returns an error code (translated by the UI) or null when valid. */
export function validateNote(type: NoteType, f: NoteFields): string | null {
  const blank = (s?: string) => !s || !s.trim();
  switch (type) {
    case "cloze": return blank(f.text) ? "text_required" : clozeOrdinals(f.text!).length ? null : "cloze_required";
    case "mcq": {
      if (blank(f.question)) return "question_required";
      const opts = (f.options ?? []).filter((o) => !blank(o));
      if (opts.length < 2) return "options_required";
      if (!(f.correct ?? []).some((i) => i >= 0 && i < (f.options ?? []).length)) return "correct_required";
      return null;
    }
    case "image_occlusion":
      if (blank(f.image)) return "image_required";
      return (f.masks ?? []).length ? null : "masks_required";
    default:
      return blank(f.front) ? "front_required" : null;
  }
}

/** Keep only the fields relevant to a type (defensive copy for persistence). */
export function cleanFields(type: NoteType, f: NoteFields): NoteFields {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  switch (type) {
    case "cloze": return { text: s(f.text), extra: s(f.extra) };
    case "mcq": return { question: s(f.question), options: (f.options ?? []).map(s), correct: (f.correct ?? []).filter((n) => Number.isInteger(n)), explanation: s(f.explanation) };
    case "image_occlusion": return {
      image: s(f.image), header: s(f.header), extra: s(f.extra), occlusionMode: f.occlusionMode === "hideAll" ? "hideAll" : "hideOne",
      masks: (f.masks ?? []).map((m) => ({ x: +m.x || 0, y: +m.y || 0, w: +m.w || 0, h: +m.h || 0, ...(m.label ? { label: String(m.label) } : {}) })),
    };
    case "basic_optional_reverse": return { front: s(f.front), back: s(f.back), addReverse: !!f.addReverse };
    default: return { front: s(f.front), back: s(f.back) };
  }
}
