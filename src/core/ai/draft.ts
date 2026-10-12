/** AI cards → the shared ImportDraft, so generated cards go through the normal import preview + pipeline. */
import { newDraft, type ImportDraft } from "../io/draft";
import type { AiCard } from "./types";

const tag = (t: string) => t.trim().replace(/^#/, "").replace(/\s+/g, "_");

export function aiCardsToDraft(cards: AiCard[], opts: { deck: string; tags: string[]; reverse?: boolean }): ImportDraft {
  const d = newDraft("ai");
  const base = opts.tags.map(tag).filter(Boolean);
  for (const c of cards) {
    const tags = [...new Set([...base, ...c.tags.map(tag).filter(Boolean)])];
    const deckPath = opts.deck.trim() || "Default";
    if (c.kind === "cloze") d.notes.push({ deckPath, type: "cloze", fields: { text: c.text, extra: c.extra }, tags });
    else d.notes.push({ deckPath, type: opts.reverse ? "basic_reverse" : "basic", fields: { front: c.front, back: c.back }, tags });
  }
  return d;
}
