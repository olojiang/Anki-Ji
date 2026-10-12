import type { DeckConfig, NoteFields, NoteType, CardState } from "@/core/types";
export interface DeckDTO { id: number; parentId: number | null; name: string; position: number; config: DeckConfig; filtered: boolean; filter: { query: string; limit: number; order: string } | null; deletedAt: string | null; createdAt: string }
export type Counts = Record<number, { new: number; learning: number; review: number; total: number }>;
export interface BrowseRowDTO {
  cardId: number; noteId: number; deckId: number; homeDeckId: number | null; deckPath: string; type: NoteType; ord: number; sortField: string; tags: string[];
  state: CardState; due: string; dueDay: number | null; interval: number; suspended: boolean; buried: boolean; flag: number; leech: boolean;
  reps: number; lapses: number; createdAt: string; position: number; stability: number; difficulty: number; retrievability: number | null;
}
export interface NoteDTO { id: number; deckId: number; guid: string; type: NoteType; fields: NoteFields; tags: string[]; position: number; cards: { id: number; ord: number; state: CardState; due: string; stability: number; difficulty: number; reps: number; lapses: number; suspended: boolean; flag: number; scheduledDays: number }[] }
