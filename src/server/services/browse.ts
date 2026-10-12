import { q } from "../db";
import { listDecks } from "../repo/decks";
import { userContext } from "./context";
import { parseSearch, matches, type SearchItem } from "@/core/search";
import { deckPath } from "@/core/tree";
import { dayIndex } from "@/core/time";
import { createScheduler } from "@/core/scheduler";
import type { CardState, NoteType } from "@/core/types";

export interface BrowseRow {
  cardId: number; noteId: number; deckId: number; homeDeckId: number | null; deckPath: string; type: NoteType; ord: number; sortField: string; tags: string[];
  state: CardState; due: string; dueDay: number | null; interval: number; suspended: boolean; buried: boolean; flag: number; leech: boolean;
  reps: number; lapses: number; createdAt: string; position: number; stability: number; difficulty: number; retrievability: number | null;
}

export type BrowseSort = "manual" | "created" | "due" | "sortField" | "interval" | "lapses" | "difficulty";

/** Evaluate an Anki-style search against all of a user's live cards. */
export async function searchNotes(uid: number, query: string, opts: { sort?: BrowseSort; limit?: number } = {}): Promise<BrowseRow[]> {
  const ctx = await userContext(uid);
  const decks = await listDecks(uid);
  const live = new Set(decks.map((d) => d.id));
  const cfgById = new Map(decks.map((d) => [d.id, d.config]));
  const rows = await q(
    `SELECT c.id, c.note_id, c.deck_id, c.home_deck_id, c.ord, c.state, c.due, c.scheduled_days, c.suspended, c.buried_day, c.flag, c.leech, c.reps, c.lapses,
            c.stability, c.difficulty, c.last_review, c.elapsed_days, c.step, c.ease, c.box, n.position, n.created_at, n.type, n.sort_field, n.search_text, n.tags
     FROM ak_cards c JOIN ak_notes n ON n.id = c.note_id WHERE c.user_id = $1 AND n.deleted_at IS NULL`, [uid]);
  const ast = parseSearch(query);
  const paths = new Map<number, string>();
  const pathOf = (id: number) => { if (!paths.has(id)) paths.set(id, deckPath(decks, id)); return paths.get(id)!; };
  const out: BrowseRow[] = [];
  for (const r of rows) {
    const deckId = Number(r.deck_id);
    if (!live.has(deckId)) continue;
    const home = r.home_deck_id == null ? null : Number(r.home_deck_id);
    const state = r.state as CardState;
    const due = new Date(String(r.due instanceof Date ? r.due.toISOString() : r.due));
    const dueDay = state === "new" ? null : dayIndex(due, ctx.tz, ctx.rollover);
    const created = new Date(String(r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at));
    const type = r.type as NoteType;
    const ord = Number(r.ord);
    const item: SearchItem = {
      text: `${r.search_text ?? ""}`, deckPath: pathOf(home ?? deckId), tags: (r.tags as string[]) ?? [], noteType: type, state, dueDay,
      suspended: !!r.suspended, buried: r.buried_day != null && Number(r.buried_day) >= ctx.today, flag: Number(r.flag), leech: !!r.leech,
      createdDay: dayIndex(created, ctx.tz, ctx.rollover), interval: Number(r.scheduled_days), lapses: Number(r.lapses), reps: Number(r.reps),
      ord: type === "cloze" ? ord - 1 : ord,
    };
    if (!matches(ast, item, { today: ctx.today }) && !(home != null && matches(ast, { ...item, deckPath: pathOf(deckId) }, { today: ctx.today }))) continue;
    const sched = {
      state, due, stability: Number(r.stability), difficulty: Number(r.difficulty), elapsedDays: Number(r.elapsed_days), scheduledDays: Number(r.scheduled_days),
      reps: Number(r.reps), lapses: Number(r.lapses), step: Number(r.step), lastReview: r.last_review ? new Date(String(r.last_review instanceof Date ? r.last_review.toISOString() : r.last_review)) : null,
      ease: Number(r.ease), box: Number(r.box),
    };
    const cfg = cfgById.get(home ?? deckId);
    out.push({
      cardId: Number(r.id), noteId: Number(r.note_id), deckId, homeDeckId: home, deckPath: pathOf(deckId), type, ord, sortField: String(r.sort_field ?? ""),
      tags: item.tags, state, due: due.toISOString(), dueDay, interval: item.interval, suspended: item.suspended, buried: item.buried, flag: item.flag, leech: item.leech,
      reps: item.reps, lapses: item.lapses, createdAt: created.toISOString(), position: Number(r.position), stability: sched.stability, difficulty: sched.difficulty,
      retrievability: cfg ? createScheduler(cfg).retrievability(sched, ctx.now) : null,
    });
  }
  const sort = opts.sort ?? "manual";
  const cmp: Record<BrowseSort, (a: BrowseRow, b: BrowseRow) => number> = {
    manual: (a, b) => a.deckPath.localeCompare(b.deckPath) || a.position - b.position || a.ord - b.ord,
    created: (a, b) => b.createdAt.localeCompare(a.createdAt) || a.ord - b.ord,
    due: (a, b) => (a.dueDay ?? 1e9) - (b.dueDay ?? 1e9) || a.position - b.position,
    sortField: (a, b) => a.sortField.localeCompare(b.sortField),
    interval: (a, b) => b.interval - a.interval,
    lapses: (a, b) => b.lapses - a.lapses,
    difficulty: (a, b) => b.difficulty - a.difficulty,
  };
  out.sort(cmp[sort] ?? cmp.manual);
  return opts.limit ? out.slice(0, opts.limit) : out;
}
