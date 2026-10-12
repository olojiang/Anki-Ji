import type { CardState, DeckConfig, NoteFields, NoteType, SchedState } from "@/core/types";
import { normalizeConfig } from "@/core/config";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v));
const date = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));
const dateOrNull = (v: unknown) => (v == null ? null : date(v));

export interface Deck { id: number; parentId: number | null; name: string; position: number; config: DeckConfig; filtered: boolean; filter: FilterSpec | null; deletedAt: Date | null; createdAt: Date }
export interface FilterSpec { query: string; limit: number; order: "due" | "random" | "added" | "retrievability" }
export interface Note { id: number; deckId: number; guid: string; type: NoteType; fields: NoteFields; tags: string[]; position: number; sortField: string; deletedAt: Date | null; createdAt: Date; updatedAt: Date }
export interface Card extends SchedState { id: number; noteId: number; deckId: number; homeDeckId: number | null; ord: number; suspended: boolean; buriedDay: number | null; flag: number; leech: boolean; position: number; createdAt: Date }

export function toDeck(r: Row): Deck {
  return {
    id: num(r.id), parentId: r.parent_id == null ? null : num(r.parent_id), name: String(r.name), position: num(r.position),
    config: normalizeConfig((r.config ?? {}) as Partial<DeckConfig>), filtered: !!r.filtered, filter: (r.filter as FilterSpec) ?? null,
    deletedAt: dateOrNull(r.deleted_at), createdAt: date(r.created_at),
  };
}

export function toNote(r: Row): Note {
  return {
    id: num(r.id), deckId: num(r.deck_id), guid: String(r.guid), type: r.type as NoteType, fields: (r.fields ?? {}) as NoteFields,
    tags: (r.tags as string[]) ?? [], position: num(r.position), sortField: String(r.sort_field ?? ""), deletedAt: dateOrNull(r.deleted_at),
    createdAt: date(r.created_at), updatedAt: date(r.updated_at),
  };
}

export function toCard(r: Row): Card {
  return {
    id: num(r.id), noteId: num(r.note_id), deckId: num(r.deck_id), homeDeckId: r.home_deck_id == null ? null : num(r.home_deck_id), ord: num(r.ord),
    state: r.state as CardState, due: date(r.due), stability: num(r.stability), difficulty: num(r.difficulty), elapsedDays: num(r.elapsed_days),
    scheduledDays: num(r.scheduled_days), reps: num(r.reps), lapses: num(r.lapses), step: num(r.step), lastReview: dateOrNull(r.last_review),
    ease: num(r.ease), box: num(r.box), suspended: !!r.suspended, buriedDay: r.buried_day == null ? null : num(r.buried_day), flag: num(r.flag),
    leech: !!r.leech, position: num(r.position), createdAt: date(r.created_at),
  };
}

export const CARD_COLS = "c.id, c.note_id, c.deck_id, c.home_deck_id, c.ord, c.state, c.due, c.stability, c.difficulty, c.elapsed_days, c.scheduled_days, c.reps, c.lapses, c.step, c.last_review, c.ease, c.box, c.suspended, c.buried_day, c.flag, c.leech, c.position, c.created_at";

export function schedSnapshot(c: Card) {
  return {
    state: c.state, due: c.due.toISOString(), stability: c.stability, difficulty: c.difficulty, elapsedDays: c.elapsedDays, scheduledDays: c.scheduledDays,
    reps: c.reps, lapses: c.lapses, step: c.step, lastReview: c.lastReview?.toISOString() ?? null, ease: c.ease, box: c.box,
    suspended: c.suspended, buriedDay: c.buriedDay, leech: c.leech,
  };
}
