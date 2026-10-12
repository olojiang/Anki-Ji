import { q } from "../db";
import { toNote, type Note, type Card } from "./mappers";
import type { NoteFields, NoteType } from "@/core/types";
import { NOTE_TYPES } from "@/core/types";
import { cardOrdinals, cleanFields, diffOrdinals, searchText, sortField, validateNote } from "@/core/notes";
import { positionBetween } from "@/core/tree";
import { BadRequestError, requireDeck } from "./decks";
import { addTags, normalizeTag } from "./tags";
import { listCardsForNote } from "./cards";
import { getNoteType } from "./notetypes";
import { planCardChanges, type NoteTypeDef } from "@/core/notetypes";

const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const cleanTags = (tags: string[]) => [...new Set((tags ?? []).map(normalizeTag).filter(Boolean))];

export interface NoteInput { deckId: number; type: NoteType; fields: NoteFields; tags: string[]; guid?: string; position?: number; notetypeId?: number | null }

/** The custom note type a "custom" note needs (owned by the user), or null for built-in types. */
async function requireNoteType(uid: number, type: NoteType, notetypeId: number | null | undefined): Promise<NoteTypeDef | null> {
  if (type !== "custom") return null;
  if (notetypeId == null) throw new BadRequestError("notetype_required");
  const nt = await getNoteType(uid, Number(notetypeId));
  if (!nt) throw new BadRequestError("notetype_not_found");
  return nt;
}

export async function createNote(uid: number, input: NoteInput): Promise<Note> {
  if (!NOTE_TYPES.includes(input.type) && input.type !== "custom") throw new BadRequestError("invalid_type");
  await requireDeck(uid, input.deckId);
  const nt = await requireNoteType(uid, input.type, input.notetypeId);
  const fields = cleanFields(input.type, input.fields ?? {}, nt);
  const err = validateNote(input.type, fields, nt);
  if (err) throw new BadRequestError(err);
  const tags = cleanTags(input.tags);
  const pos = input.position ?? Number((await q("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM ak_notes WHERE user_id = $1 AND deck_id = $2", [uid, input.deckId]))[0].p);
  const rows = await q(
    `INSERT INTO ak_notes (user_id, deck_id, guid, type, fields, tags, position, sort_field, search_text, notetype_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [uid, input.deckId, input.guid ?? uuid(), input.type, JSON.stringify(fields), tags, pos, sortField(input.type, fields, nt), searchText(input.type, fields), nt ? nt.id : null],
  );
  const note = toNote(rows[0]);
  const ords = cardOrdinals(input.type, fields, nt);
  if (ords.length) {
    await q("INSERT INTO ak_cards (user_id, note_id, deck_id, ord, position) SELECT $1, $2, $3, unnest($4::int[]), $5", [uid, note.id, input.deckId, ords, pos]);
  }
  await addTags(uid, tags);
  return note;
}

export async function getNote(uid: number, id: number): Promise<(Note & { cards: Card[]; noteType?: NoteTypeDef | null }) | null> {
  const rows = await q("SELECT * FROM ak_notes WHERE user_id = $1 AND id = $2", [uid, id]);
  if (!rows[0]) return null;
  const note = toNote(rows[0]);
  const noteType = note.type === "custom" && note.notetypeId != null ? await getNoteType(uid, note.notetypeId) : undefined;
  return { ...note, ...(noteType !== undefined ? { noteType } : {}), cards: await listCardsForNote(uid, id) };
}

export async function updateNote(uid: number, id: number, patch: { fields?: NoteFields; tags?: string[]; deckId?: number; type?: NoteType }): Promise<boolean> {
  const cur = await getNote(uid, id);
  if (!cur) return false;
  // switching between built-in and custom types is not supported (fields have different shapes)
  const type = cur.type !== "custom" && patch.type && NOTE_TYPES.includes(patch.type) ? patch.type : cur.type;
  const nt = type === "custom" ? cur.noteType ?? null : null;
  if (type === "custom" && !nt) throw new BadRequestError("notetype_not_found");
  const fields = cleanFields(type, patch.fields ? { ...cur.fields, ...patch.fields } : cur.fields, nt);
  const err = validateNote(type, fields, nt);
  if (err) throw new BadRequestError(err);
  const tags = patch.tags ? cleanTags(patch.tags) : cur.tags;
  await q("UPDATE ak_notes SET type = $3, fields = $4, tags = $5, sort_field = $6, search_text = $7, updated_at = now() WHERE user_id = $1 AND id = $2",
    [uid, id, type, JSON.stringify(fields), tags, sortField(type, fields, nt), searchText(type, fields)]);
  const d = nt
    ? planCardChanges(cur.cards, cardOrdinals(type, fields, nt), nt.kind === "cloze" ? null : nt.templates.map((t) => t.ord))
    : diffOrdinals(cur.cards.map((c) => c.ord), cardOrdinals(type, fields));
  if (d.remove.length) await q("DELETE FROM ak_cards WHERE user_id = $1 AND note_id = $2 AND ord = ANY($3::int[])", [uid, id, d.remove]);
  if (d.add.length) await q("INSERT INTO ak_cards (user_id, note_id, deck_id, ord, position) SELECT $1, $2, $3, unnest($4::int[]), $5", [uid, id, cur.deckId, d.add, cur.position]);
  if (patch.deckId && patch.deckId !== cur.deckId) await moveNotes(uid, [id], patch.deckId);
  await addTags(uid, tags);
  return true;
}

export async function moveNotes(uid: number, ids: number[], deckId: number) {
  await requireDeck(uid, deckId);
  await q("UPDATE ak_notes SET deck_id = $3, updated_at = now() WHERE user_id = $1 AND id = ANY($2::int[])", [uid, ids, deckId]);
  await q("UPDATE ak_cards SET deck_id = $3 WHERE user_id = $1 AND note_id = ANY($2::int[]) AND home_deck_id IS NULL", [uid, ids, deckId]);
  await q("UPDATE ak_cards SET home_deck_id = $3 WHERE user_id = $1 AND note_id = ANY($2::int[]) AND home_deck_id IS NOT NULL", [uid, ids, deckId]);
}

export async function softDeleteNotes(uid: number, ids: number[]) {
  await q("UPDATE ak_cards SET deck_id = home_deck_id, home_deck_id = NULL WHERE user_id = $1 AND note_id = ANY($2::int[]) AND home_deck_id IS NOT NULL", [uid, ids]);
  await q("UPDATE ak_notes SET deleted_at = now() WHERE user_id = $1 AND id = ANY($2::int[])", [uid, ids]);
}
export async function restoreNotes(uid: number, ids: number[]) {
  await q("UPDATE ak_notes SET deleted_at = NULL WHERE user_id = $1 AND id = ANY($2::int[])", [uid, ids]);
}
export async function purgeNotes(uid: number, ids: number[]) {
  await q("DELETE FROM ak_notes WHERE user_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NOT NULL", [uid, ids]);
}
export async function listDeletedNotes(uid: number): Promise<Note[]> {
  return (await q("SELECT * FROM ak_notes WHERE user_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500", [uid])).map(toNote);
}

export async function bulkTags(uid: number, ids: number[], add: string[], remove: string[]) {
  const a = cleanTags(add), r = cleanTags(remove);
  await q(`UPDATE ak_notes SET tags = ARRAY(SELECT DISTINCT x FROM unnest(tags || $3::text[]) x WHERE NOT (x = ANY($4::text[]))), updated_at = now()
           WHERE user_id = $1 AND id = ANY($2::int[])`, [uid, ids, a, r]);
  await addTags(uid, a);
}

/** Manual ordering inside a deck: put note `id` at `index` among its deck's notes. Also orders its new cards. */
export async function moveNoteToIndex(uid: number, id: number, index: number) {
  const cur = await getNote(uid, id);
  if (!cur) return;
  const sibs = (await q("SELECT id, position FROM ak_notes WHERE user_id = $1 AND deck_id = $2 AND deleted_at IS NULL AND id <> $3 ORDER BY position, id", [uid, cur.deckId, id]))
    .map((r) => ({ id: Number(r.id), position: Number(r.position) }));
  const i = Math.max(0, Math.min(index, sibs.length));
  const before = sibs[i - 1]?.position ?? null;
  const after = sibs[i]?.position ?? null;
  if (before != null && after != null && after - before < 1e-9) {
    // renumber the deck
    const ordered = [...sibs.slice(0, i).map((s) => s.id), id, ...sibs.slice(i).map((s) => s.id)];
    await q("UPDATE ak_notes n SET position = o.pos FROM unnest($2::int[]) WITH ORDINALITY AS o(id, pos) WHERE n.user_id = $1 AND n.id = o.id", [uid, ordered]);
    await q("UPDATE ak_cards c SET position = n.position FROM ak_notes n WHERE c.note_id = n.id AND c.user_id = $1 AND n.deck_id = $2", [uid, cur.deckId]);
    return;
  }
  const pos = positionBetween(before, after);
  await q("UPDATE ak_notes SET position = $3 WHERE user_id = $1 AND id = $2", [uid, id, pos]);
  await q("UPDATE ak_cards SET position = $3 WHERE user_id = $1 AND note_id = $2", [uid, id, pos]);
}
