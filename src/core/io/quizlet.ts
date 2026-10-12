/** Quizlet "export" text (also Knowt / Brainscape / Noji copy-paste): configurable term and row separators. */
import { newDraft, type ImportDraft } from "./draft";

export type TermSep = "tab" | "comma" | string;
export type RowSep = "newline" | "semicolon" | string;
export interface QuizletOptions { termSep: TermSep; rowSep: RowSep; deck: string }

const sepOf = (s: string, named: Record<string, string>) => named[s] ?? s.replace(/\\t/g, "\t").replace(/\\n/g, "\n");

export function parseQuizlet(text: string, opts: QuizletOptions): ImportDraft {
  const draft = newDraft("quizlet");
  const term = sepOf(opts.termSep, { tab: "\t", comma: "," });
  const row = sepOf(opts.rowSep, { newline: "\n", semicolon: ";" });
  const body = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  body.split(row).forEach((r, i) => {
    if (!r.trim()) return;
    const at = term ? r.indexOf(term) : -1;
    if (at < 0) { draft.errors.push({ row: i + 1, message: "no_separator" }); return; }
    const front = r.slice(0, at).trim(), back = r.slice(at + term.length).trim();
    if (!front) { draft.errors.push({ row: i + 1, message: "empty front" }); return; }
    draft.notes.push({ deckPath: opts.deck || "Default", type: "basic", fields: { front, back }, tags: [] });
  });
  return draft;
}
