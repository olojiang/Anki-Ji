/** Shared types for AI card generation (pure). */
export type CardStyle = "qa" | "cloze" | "mixed";
export const CARD_STYLES: CardStyle[] = ["qa", "cloze", "mixed"];
export type AiCard =
  | { kind: "qa"; front: string; back: string; tags: string[] }
  | { kind: "cloze"; text: string; extra: string; tags: string[] };
export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export const MAX_CARDS_PER_REQUEST = 50;
/** Max characters of source text sent in one LLM request (≈ 6–8k tokens). */
export const MAX_CHUNK_CHARS = 12000;
