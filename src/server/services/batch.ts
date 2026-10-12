/** Batch editing services (Browse): find & replace, duplicates, change note type, undo snapshots. All queries are scoped by user id. */
import { q } from "../db";
import { toNote, type Note } from "../repo/mappers";
import { listDecks, requireDeck, NotFoundError, BadRequestError } from "../repo/decks";
import { updateNote, softDeleteNotes } from "../repo/notes";
import { addTags } from "../repo/tags";
import { searchNotes } from "./browse";
import { cardOrdinals, cleanFields, diffOrdinals, searchText, sortField, validateNote } from "@/core/notes";
import { descendantIds, deckPath } from "@/core/tree";
import {
  buildPattern, previewReplace, replaceInNote, findDuplicates, planMerge, bestCardsByOrd, canConvert, convertStockNote, STOCK_FIELDS,
  type ReplaceSpec, type DupScope, type FieldMapping, type ReplacePreview,
} from "@/core/batch";
import type { NoteType } from "@/core/types";

export interface Target { noteIds?: number[]; query?: string }
const MAX_UNDO = 10;

const CARD_COLUMNS = ["id", "user_id", "note_id", "deck_id", "home_deck_id", "ord", "state", "due", "stability", "difficulty", "elapsed_days", "scheduled_days", "reps", "lapses", "step",
  "last_review", "ease", "box", "suspended", "buried_day", "flag", "leech", "position", "created_at"];
const SCHED_COLUMNS = ["state", "due", "stability", "difficulty", "elapsed_days", "scheduled_days", "reps", "lapses", "step", "last_review", "ease", "box"];
const REVLOG_COLUMNS = ["id", "user_id", "card_id", "deck_id", "note_id", "rating", "state", "due", "stability", "difficulty", "elapsed_days", "scheduled_days", "duration_ms",
  "reviewed_at", "day", "algorithm", "snapshot"];

/* ─────────── target resolution ─────────── */
export async function resolveNoteIds(uid: number, t: Target): Promise<number[]> {
  if (Array.isArray(t.noteIds)) {
    const ids = t.noteIds.map(Number).filter(Number.isInteger);
    if (!ids.length) return [];
    return (await q("SELECT id FROM ak_notes WHERE user_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL ORDER BY id", [uid, ids])).map((r) => Number(r.id));
  }
  if (typeof t.query === "string") return [...new Set((await searchNotes(uid, t.query)).map((r) => r.noteId))].sort((a, b) => a - b);
  return [];
}
async function loadNotes(uid: number, ids: number[]): Promise<Note[]> {
  if (!ids.length) return [];
  return (await q("SELECT * FROM ak_notes WHERE user_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL ORDER BY id", [uid, ids])).map(toNote);
}

/* ─────────── undo snapshots ─────────── */
async function snapshot(uid: number, kind: string, noteIds: number[], opts: { revlogNoteIds?: number[]; summary?: Record<string, unknown> } = {}): Promise<number> {
  const notes = await q("SELECT id, type, fields, tags, sort_field, search_text, deleted_at FROM ak_notes WHERE user_id = $1 AND id = ANY($2::int[])", [uid, noteIds]);
  const cards = await q(`SELECT ${CARD_COLUMNS.join(", ")} FROM ak_cards WHERE user_id = $1 AND note_id = ANY($2::int[])`, [uid, noteIds]);
  const rl = opts.revlogNoteIds?.length
    ? await q(`SELECT ${REVLOG_COLUMNS.map((c) => `r.${c}`).join(", ")} FROM ak_revlog r JOIN ak_cards c ON c.id = r.card_id WHERE r.user_id = $1 AND c.note_id = ANY($2::int[])`, [uid, opts.revlogNoteIds])
    : [];
  const row = (await q("INSERT INTO ak_batch_undo (user_id, kind, summary, payload) VALUES ($1, $2, $3, $4) RETURNING id",
    [uid, kind, JSON.stringify(opts.summary ?? {}), JSON.stringify({ notes, cards, revlog: rl })]))[0];
  await q(`DELETE FROM ak_batch_undo WHERE user_id = $1 AND id NOT IN (SELECT id FROM ak_batch_undo WHERE user_id = $1 ORDER BY id DESC LIMIT ${MAX_UNDO})`, [uid]);
  return Number(row.id);
}

/** Restore notes, cards (incl. deleted ones, with scheduling) and removed review history from a snapshot. One-shot. */
export async function undoBatch(uid: number, id: number): Promise<{ restored: number; kind: string }> {
  const row = (await q("SELECT kind, payload FROM ak_batch_undo WHERE user_id = $1 AND id = $2", [uid, id]))[0];
  if (!row) throw new NotFoundError("undo_not_found");
  const payload = (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as { notes: { id: number }[]; cards: { id: number }[]; revlog: unknown[] };
  const noteIds = payload.notes.map((n) => Number(n.id));
  await q(`UPDATE ak_notes n SET type = s.type, fields = s.fields, tags = s.tags, sort_field = s.sort_field, search_text = s.search_text, deleted_at = s.deleted_at, updated_at = now()
           FROM jsonb_populate_recordset(NULL::ak_notes, $2::jsonb) s WHERE n.user_id = $1 AND n.id = s.id`, [uid, JSON.stringify(payload.notes)]);
  await q("DELETE FROM ak_cards WHERE user_id = $1 AND note_id = ANY($2::int[]) AND NOT (id = ANY($3::int[]))", [uid, noteIds, payload.cards.map((c) => Number(c.id))]);
  if (payload.cards.length) {
    const cols = CARD_COLUMNS.join(", ");
    const upd = CARD_COLUMNS.filter((c) => !["id", "user_id", "note_id"].includes(c)).map((c) => `${c} = EXCLUDED.${c}`).join(", ");
    await q(`INSERT INTO ak_cards (${cols}) SELECT ${cols} FROM jsonb_populate_recordset(NULL::ak_cards, $2::jsonb) s WHERE s.user_id = $1 AND s.note_id = ANY($3::int[])
             ON CONFLICT (id) DO UPDATE SET ${upd} WHERE ak_cards.user_id = $1`, [uid, JSON.stringify(payload.cards), noteIds]);
  }
  if (payload.revlog?.length) {
    const cols = REVLOG_COLUMNS.join(", ");
    await q(`INSERT INTO ak_revlog (${cols}) SELECT ${cols} FROM jsonb_populate_recordset(NULL::ak_revlog, $2::jsonb) s
             WHERE s.user_id = $1 AND EXISTS (SELECT 1 FROM ak_cards c WHERE c.id = s.card_id AND c.user_id = $1) ON CONFLICT (id) DO NOTHING`, [uid, JSON.stringify(payload.revlog)]);
  }
  await q("DELETE FROM ak_batch_undo WHERE user_id = $1 AND id = $2", [uid, id]);
  return { restored: noteIds.length, kind: String(row.kind) };
}

export async function listUndo(uid: number) {
  return (await q("SELECT id, kind, summary, created_at FROM ak_batch_undo WHERE user_id = $1 ORDER BY id DESC", [uid]))
    .map((r) => ({ id: Number(r.id), kind: String(r.kind), summary: r.summary, createdAt: new Date(String(r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at)).toISOString() }));
}

/* ─────────── find & replace ─────────── */
export type ReplaceResult = ReplacePreview & { changed?: number; skipped?: { id: number; error: string }[]; undoId?: number | null };

export async function findReplace(uid: number, target: Target, spec: ReplaceSpec, preview: boolean): Promise<ReplaceResult> {
  const re = buildPattern(spec);
  const notes = await loadNotes(uid, await resolveNoteIds(uid, target));
  const pv = previewReplace(notes, spec);
  if (preview) return pv;
  const skipped: { id: number; error: string }[] = [];
  const bulk: { id: number; fields: unknown; sort_field: string; search_text: string }[] = [];
  const individually: { id: number; fields: Note["fields"] }[] = [];
  let matches = 0;
  for (const n of notes) {
    const r = replaceInNote(n.type, n.fields, spec, re);
    if (!r.count) continue;
    const fields = cleanFields(n.type, r.fields);
    const err = validateNote(n.type, fields);
    if (err) { skipped.push({ id: n.id, error: err }); continue; }
    matches += r.count;
    const ordsBefore = cardOrdinals(n.type, n.fields), ordsAfter = cardOrdinals(n.type, fields);
    const d = diffOrdinals(ordsBefore, ordsAfter);
    if (d.add.length || d.remove.length) individually.push({ id: n.id, fields });
    else bulk.push({ id: n.id, fields, sort_field: sortField(n.type, fields), search_text: searchText(n.type, fields) });
  }
  const changedIds = [...bulk.map((b) => b.id), ...individually.map((b) => b.id)];
  if (!changedIds.length) return { ...pv, changed: 0, matches: 0, skipped, undoId: null };
  const undoId = await snapshot(uid, "replace", changedIds, { revlogNoteIds: individually.map((b) => b.id), summary: { find: spec.find, replace: spec.replace, notes: changedIds.length } });
  if (bulk.length) {
    await q(`UPDATE ak_notes n SET fields = s.fields, sort_field = s.sort_field, search_text = s.search_text, updated_at = now()
             FROM jsonb_to_recordset($2::jsonb) AS s(id int, fields jsonb, sort_field text, search_text text) WHERE n.user_id = $1 AND n.id = s.id`, [uid, JSON.stringify(bulk)]);
  }
  for (const b of individually) await updateNote(uid, b.id, { fields: b.fields });
  return { ...pv, changed: changedIds.length, matches, skipped, undoId };
}

/* ─────────── duplicates ─────────── */
export interface DupNote {
  id: number; deckId: number; deckPath: string; type: NoteType; sortField: string; fields: Note["fields"]; tags: string[]; createdAt: string;
  cards: { id: number; ord: number; state: string; reps: number; lapses: number; due: string; interval: number }[];
}
export async function findDuplicateGroups(uid: number, opts: { scope: DupScope; deckId?: number; query?: string; type?: NoteType }): Promise<{ key: string; notes: DupNote[] }[]> {
  const decks = await listDecks(uid);
  const live = decks.map((d) => d.id);
  let rows;
  if (opts.query) rows = await loadNotes(uid, await resolveNoteIds(uid, { query: opts.query }));
  else {
    let deckIds = live;
    if (opts.deckId != null) { await requireDeck(uid, opts.deckId, { allowFiltered: true }); deckIds = descendantIds(decks, opts.deckId); }
    rows = (await q("SELECT * FROM ak_notes WHERE user_id = $1 AND deleted_at IS NULL AND deck_id = ANY($2::int[]) ORDER BY id", [uid, deckIds])).map(toNote);
  }
  if (opts.type) rows = rows.filter((n) => n.type === opts.type);
  const groups = findDuplicates(rows, opts.scope).slice(0, 500);
  const ids = groups.flatMap((g) => g.ids);
  const byId = new Map(rows.map((n) => [n.id, n]));
  const cards = ids.length ? await q("SELECT id, note_id, ord, state, reps, lapses, due, scheduled_days FROM ak_cards WHERE user_id = $1 AND note_id = ANY($2::int[]) ORDER BY ord", [uid, ids]) : [];
  const cardsBy = new Map<number, DupNote["cards"]>();
  for (const c of cards) {
    const list = cardsBy.get(Number(c.note_id)) ?? [];
    list.push({ id: Number(c.id), ord: Number(c.ord), state: String(c.state), reps: Number(c.reps), lapses: Number(c.lapses), due: new Date(String(c.due instanceof Date ? c.due.toISOString() : c.due)).toISOString(), interval: Number(c.scheduled_days) });
    cardsBy.set(Number(c.note_id), list);
  }
  return groups.map((g) => ({
    key: g.key,
    notes: g.ids.map((id) => {
      const n = byId.get(id)!;
      return { id, deckId: n.deckId, deckPath: deckPath(decks, n.deckId), type: n.type, sortField: n.sortField, fields: n.fields, tags: n.tags, createdAt: n.createdAt.toISOString(), cards: cardsBy.get(id) ?? [] };
    }),
  }));
}

export interface MergeGroup { keepId: number; removeIds: number[]; scheduling?: "keep" | "best" }
export async function mergeDuplicates(uid: number, groups: MergeGroup[]): Promise<{ merged: number; removed: number; undoId: number }> {
  const all = [...new Set(groups.flatMap((g) => [Number(g.keepId), ...(g.removeIds ?? []).map(Number)]))];
  if (!groups.length || !all.length) throw new BadRequestError("nothing_to_merge");
  const notes = await loadNotes(uid, all);
  if (notes.length !== all.length) throw new NotFoundError("note_not_found");
  const byId = new Map(notes.map((n) => [n.id, n]));
  const undoId = await snapshot(uid, "merge", all, { summary: { groups: groups.length } });
  let removed = 0;
  for (const g of groups) {
    const ids = [Number(g.keepId), ...(g.removeIds ?? []).map(Number)];
    const plan = planMerge(ids.map((id) => ({ id, tags: byId.get(id)!.tags })), Number(g.keepId));
    await q("UPDATE ak_notes SET tags = $3, updated_at = now() WHERE user_id = $1 AND id = $2", [uid, plan.keepId, plan.tags]);
    await addTags(uid, plan.tags);
    if (g.scheduling === "best") {
      const keepType = byId.get(plan.keepId)!.type;
      const sameType = ids.filter((id) => byId.get(id)!.type === keepType);
      const cards = (await q("SELECT id, note_id, ord, reps, last_review FROM ak_cards WHERE user_id = $1 AND note_id = ANY($2::int[])", [uid, sameType]))
        .map((c) => ({ id: Number(c.id), noteId: Number(c.note_id), ord: Number(c.ord), reps: Number(c.reps), lastReview: (c.last_review as string | Date | null) ?? null }));
      const best = bestCardsByOrd(cards);
      for (const kc of cards.filter((c) => c.noteId === plan.keepId)) {
        const src = best.get(kc.ord);
        if (src == null || src === kc.id) continue;
        await q(`UPDATE ak_cards k SET ${SCHED_COLUMNS.map((c) => `${c} = s.${c}`).join(", ")} FROM ak_cards s
                 WHERE k.user_id = $1 AND s.user_id = $1 AND k.id = $2 AND s.id = $3`, [uid, kc.id, src]);
      }
    }
    if (plan.removeIds.length) { await softDeleteNotes(uid, plan.removeIds); removed += plan.removeIds.length; }
  }
  return { merged: groups.length, removed, undoId };
}

export async function deleteDuplicates(uid: number, noteIds: number[]): Promise<{ deleted: number; undoId: number }> {
  const ids = await resolveNoteIds(uid, { noteIds });
  if (!ids.length) throw new NotFoundError("note_not_found");
  const undoId = await snapshot(uid, "delete", ids, { summary: { notes: ids.length } });
  await softDeleteNotes(uid, ids);
  return { deleted: ids.length, undoId };
}

/* ─────────── change note type ─────────── */
export interface ChangeTypeInput { noteIds: number[]; targetType: NoteType; mapping: FieldMapping; preview?: boolean }
export interface ChangeTypeResult {
  sourceType: NoteType | null; sourceFields: string[]; targetFields: string[]; convertible: number; cardsAdded: number; cardsRemoved: number;
  skipped: { id: number; error: string }[]; changed?: number; undoId?: number | null;
}
export async function changeNoteType(uid: number, input: ChangeTypeInput): Promise<ChangeTypeResult> {
  const notes = await loadNotes(uid, await resolveNoteIds(uid, { noteIds: input.noteIds }));
  const types = [...new Set(notes.map((n) => n.type))];
  if (types.length > 1) throw new BadRequestError("mixed_types");
  const from = types[0] ?? null;
  if (from && !canConvert(from, input.targetType)) throw new BadRequestError("unsupported_conversion");
  if (!from && !STOCK_FIELDS[input.targetType]) throw new BadRequestError("unsupported_conversion");
  const res: ChangeTypeResult = {
    sourceType: from, sourceFields: from ? STOCK_FIELDS[from] ?? [] : [], targetFields: STOCK_FIELDS[input.targetType] ?? [],
    convertible: 0, cardsAdded: 0, cardsRemoved: 0, skipped: [],
  };
  if (!from) return res;
  const ords = new Map<number, number[]>();
  for (const c of await q("SELECT note_id, ord FROM ak_cards WHERE user_id = $1 AND note_id = ANY($2::int[])", [uid, notes.map((n) => n.id)])) {
    ords.set(Number(c.note_id), [...(ords.get(Number(c.note_id)) ?? []), Number(c.ord)]);
  }
  const plan: { id: number; fields: Note["fields"] }[] = [];
  for (const n of notes) {
    const fields = cleanFields(input.targetType, convertStockNote(from, input.targetType, n.fields, input.mapping ?? {}));
    const err = validateNote(input.targetType, fields);
    if (err) { res.skipped.push({ id: n.id, error: err }); continue; }
    const d = diffOrdinals(ords.get(n.id) ?? [], cardOrdinals(input.targetType, fields));
    res.cardsAdded += d.add.length; res.cardsRemoved += d.remove.length;
    plan.push({ id: n.id, fields });
  }
  res.convertible = plan.length;
  if (input.preview) return res;
  if (!plan.length) return { ...res, changed: 0, undoId: null };
  const undoId = await snapshot(uid, "change_type", plan.map((p) => p.id), { revlogNoteIds: res.cardsRemoved ? plan.map((p) => p.id) : [], summary: { from, to: input.targetType, notes: plan.length } });
  for (const p of plan) await updateNote(uid, p.id, { type: input.targetType, fields: p.fields });
  return { ...res, changed: plan.length, undoId };
}
