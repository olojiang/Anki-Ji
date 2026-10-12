import { q } from "../db";
import { listDecks, createDeck, NotFoundError } from "../repo/decks";
import { listTags, addTags } from "../repo/tags";
import { getUser } from "../repo/users";
import { revlogForCards } from "../repo/revlog";
import { createBackup, type Backup, type DeckRecord, type NestedNote, type MediaRecord } from "@/core/io/backup";
import { importDecks, importNotes, type ImportSink } from "@/core/io/importer";
import { cardOrdinals, cleanFields, searchText, sortField } from "@/core/notes";
import { NOTE_TYPES } from "@/core/types";
import type { FilterSpec } from "../repo/mappers";
import { getNoteTypesByIds, listNoteTypes } from "../repo/notetypes";
import type { NoteTypeDef } from "@/core/notetypes";
import { userContext } from "./context";
import { dayIndex } from "@/core/time";

/** Everything the user owns, as a backup envelope (media listed by URL; the browser embeds bytes). */
export async function exportBackup(uid: number): Promise<Backup> {
  const decks = await listDecks(uid);
  const deckIds = decks.map((d) => d.id);
  const notes = await q("SELECT * FROM ak_notes WHERE user_id = $1 AND deleted_at IS NULL AND deck_id = ANY($2::int[]) ORDER BY id", [uid, deckIds]);
  const noteIds = notes.map((n) => Number(n.id));
  const cards = await q("SELECT * FROM ak_cards WHERE user_id = $1 AND note_id = ANY($2::int[]) ORDER BY id", [uid, noteIds]);
  const revlog = await revlogForCards(uid, cards.map((c) => Number(c.id)));
  const media = await q("SELECT id, url, filename, content_type, size FROM ak_media WHERE user_id = $1 ORDER BY id", [uid]);
  const user = await getUser(uid);
  return createBackup({
    settings: user?.settings as unknown as Record<string, unknown>,
    tags: await listTags(uid),
    decks: decks.map((d) => ({ id: d.id, parentId: d.parentId, name: d.name, position: d.position, config: d.config, filtered: d.filtered, filter: d.filter, createdAt: d.createdAt })),
    notes: notes.map((n) => ({ id: n.id, deckId: n.deck_id, guid: n.guid, type: n.type, fields: n.fields, tags: n.tags, position: n.position, createdAt: n.created_at, updatedAt: n.updated_at, ...(n.notetype_id != null ? { notetypeId: n.notetype_id } : {}) })),
    cards: cards.map((c) => ({
      id: c.id, noteId: c.note_id, deckId: c.deck_id, homeDeckId: c.home_deck_id, ord: c.ord, state: c.state, due: c.due, stability: c.stability, difficulty: c.difficulty,
      elapsedDays: c.elapsed_days, scheduledDays: c.scheduled_days, reps: c.reps, lapses: c.lapses, step: c.step, lastReview: c.last_review, ease: c.ease, box: c.box,
      suspended: c.suspended, buriedDay: c.buried_day, flag: c.flag, leech: c.leech, position: c.position, createdAt: c.created_at,
    })),
    revlog: revlog as unknown as Record<string, unknown>[],
    media: media.map((m) => ({ id: Number(m.id), url: String(m.url), filename: String(m.filename), contentType: String(m.content_type), size: Number(m.size) })) as MediaRecord[],
    noteTypes: (await listNoteTypes(uid)).map((t) => ({ ...t, id: Number(t.id), noteCount: undefined })),
  });
}

/** Postgres implementation of the import port. Every write is scoped to `uid`. */
export function dbSink(uid: number, ownedDecks: Set<number>, noteTypes: Map<number, NoteTypeDef> = new Map()): ImportSink {
  const own = (id: number) => { if (!ownedDecks.has(id)) throw new NotFoundError("deck_not_found"); return id; };
  return {
    async createDeck(d: DeckRecord, parentId) {
      const created = await createDeck(uid, { name: d.name, parentId, config: d.config, filtered: d.filtered, filter: d.filter as FilterSpec | null, position: d.position, createdAt: d.createdAt });
      ownedDecks.add(created.id);
      return created.id;
    },
    async existingGuids(guids) {
      if (!guids.length) return new Set();
      const rows = await q("SELECT guid FROM ak_notes WHERE user_id = $1 AND guid = ANY($2::text[])", [uid, guids]);
      return new Set(rows.map((r) => String(r.guid)));
    },
    async insertNotes(items) {
      const payload = items.map(({ note, deckId }) => {
        const nt = note.type === "custom" && note.notetypeId != null ? noteTypes.get(note.notetypeId) ?? null : null;
        const type = NOTE_TYPES.includes(note.type) || nt ? note.type : "basic";
        const fields = cleanFields(type, note.fields, nt);
        return { deck_id: own(deckId), guid: note.guid, type, fields, tags: note.tags ?? [], position: note.position, sort_field: sortField(type, fields, nt), search_text: searchText(type, fields), created_at: note.createdAt, updated_at: note.updatedAt, notetype_id: nt ? Number(nt.id) : null };
      });
      const rows = await q(
        `INSERT INTO ak_notes (user_id, deck_id, guid, type, fields, tags, position, sort_field, search_text, created_at, updated_at, notetype_id)
         SELECT $1, x.deck_id, x.guid, x.type, x.fields, ARRAY(SELECT jsonb_array_elements_text(x.tags)), x.position, x.sort_field, x.search_text, x.created_at, x.updated_at, x.notetype_id
         FROM jsonb_to_recordset($2::jsonb) AS x(deck_id int, guid text, type text, fields jsonb, tags jsonb, position float8, sort_field text, search_text text, created_at timestamptz, updated_at timestamptz, notetype_id int)
         RETURNING id, guid`, [uid, JSON.stringify(payload)]);
      const byGuid = new Map(rows.map((r) => [String(r.guid), Number(r.id)]));
      return payload.map((p) => byGuid.get(p.guid)!);
    },
    async insertCards(items) {
      const payload = items.map(({ card: c, noteId, deckId, homeDeckId }) => ({
        note_id: noteId, deck_id: own(deckId), home_deck_id: homeDeckId != null && ownedDecks.has(homeDeckId) ? homeDeckId : null, ord: c.ord, state: c.state, due: c.due,
        stability: c.stability, difficulty: c.difficulty, elapsed_days: c.elapsedDays, scheduled_days: c.scheduledDays, reps: c.reps, lapses: c.lapses, step: c.step,
        last_review: c.lastReview, ease: c.ease, box: c.box, suspended: c.suspended, buried_day: c.buriedDay, flag: c.flag, leech: c.leech, position: c.position, created_at: c.createdAt,
      }));
      const rows = await q(
        `INSERT INTO ak_cards (user_id, note_id, deck_id, home_deck_id, ord, state, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, step, last_review, ease, box, suspended, buried_day, flag, leech, position, created_at)
         SELECT $1, x.note_id, x.deck_id, x.home_deck_id, x.ord, x.state, x.due, x.stability, x.difficulty, x.elapsed_days, x.scheduled_days, x.reps, x.lapses, x.step, x.last_review, x.ease, x.box, x.suspended, x.buried_day, x.flag, x.leech, x.position, x.created_at
         FROM jsonb_to_recordset($2::jsonb) AS x(note_id int, deck_id int, home_deck_id int, ord int, state text, due timestamptz, stability float8, difficulty float8, elapsed_days float8, scheduled_days float8, reps int, lapses int, step int, last_review timestamptz, ease float8, box int, suspended boolean, buried_day int, flag int, leech boolean, position float8, created_at timestamptz)
         WHERE EXISTS (SELECT 1 FROM ak_notes n WHERE n.id = x.note_id AND n.user_id = $1)
         ON CONFLICT (note_id, ord) DO NOTHING
         RETURNING id, note_id, ord`, [uid, JSON.stringify(payload)]);
      const key = (n: number, o: number) => `${n}#${o}`;
      const ids = new Map(rows.map((r) => [key(Number(r.note_id), Number(r.ord)), Number(r.id)]));
      return payload.map((p) => ids.get(key(p.note_id, p.ord))!);
    },
    async insertRevlog(items) {
      const ctx = await userContext(uid);
      // backups / .apkg history carry no study-day index: derive it from the review time in the user's timezone
      const dayOf = (r: { reviewedAt: string; day?: number }) => (Number.isInteger(r.day) && r.day! > 0 ? r.day! : dayIndex(new Date(r.reviewedAt), ctx.tz, ctx.rollover));
      const payload = items.filter((i) => i.cardId).map(({ rev: r, cardId, deckId }) => ({
        card_id: cardId, deck_id: deckId, rating: r.rating, state: r.state, due: r.due, stability: r.stability, difficulty: r.difficulty, elapsed_days: r.elapsedDays,
        scheduled_days: r.scheduledDays, duration_ms: r.durationMs, reviewed_at: r.reviewedAt, algorithm: r.algorithm, day: dayOf(r as unknown as { reviewedAt: string; day?: number }),
      }));
      if (!payload.length) return;
      await q(
        `INSERT INTO ak_revlog (user_id, card_id, deck_id, note_id, rating, state, due, stability, difficulty, elapsed_days, scheduled_days, duration_ms, reviewed_at, algorithm, day)
         SELECT $1, x.card_id, x.deck_id, c.note_id, x.rating, x.state, x.due, x.stability, x.difficulty, x.elapsed_days, x.scheduled_days, x.duration_ms, x.reviewed_at, x.algorithm, x.day
         FROM jsonb_to_recordset($2::jsonb) AS x(card_id int, deck_id int, rating int, state text, due timestamptz, stability float8, difficulty float8, elapsed_days float8, scheduled_days float8, duration_ms int, reviewed_at timestamptz, algorithm text, day int)
         JOIN ak_cards c ON c.id = x.card_id AND c.user_id = $1`, [uid, JSON.stringify(payload)]);
    },
    async addTags(tags) { await addTags(uid, tags); },
  };
}

/** Which of these note guids the user already has (used to skip duplicates and their media before uploading). */
export async function existingNoteGuids(uid: number, guids: string[]): Promise<string[]> {
  if (!guids.length) return [];
  const rows = await q("SELECT guid FROM ak_notes WHERE user_id = $1 AND guid = ANY($2::text[])", [uid, guids]);
  return rows.map((r) => String(r.guid));
}

export async function importBackupDecks(uid: number, decks: DeckRecord[]) {
  const existing = await listDecks(uid);
  const sink = dbSink(uid, new Set(existing.map((d) => d.id)));
  return importDecks(sink, decks, existing.map((d) => ({ id: d.id, parentId: d.parentId, name: d.name, filtered: d.filtered })));
}

/**
 * Custom notes: map their source note type id through `noteTypeMap` (from importNoteTypes); a custom note whose
 * type is unknown becomes a Basic note (first field → front, the rest → back) so nothing is lost.
 */
function resolveCustomNotes(notes: NestedNote[], noteTypeMap: Record<number, number>, owned: Map<number, NoteTypeDef>): NestedNote[] {
  return notes.map((n) => {
    if (n.type !== "custom") return n;
    const mapped = n.notetypeId != null ? noteTypeMap[n.notetypeId] : undefined;
    if (mapped != null && owned.has(mapped)) return { ...n, notetypeId: mapped };
    const v = Object.values(n.fields?.custom ?? {}).filter((x) => typeof x === "string");
    return { ...n, type: "basic" as const, notetypeId: null, fields: { front: v[0] ?? "", back: v.slice(1).filter((x) => x.trim()).join("\n\n") }, cards: n.cards.filter((c) => c.ord === 0) };
  });
}

export async function importBackupNotes(uid: number, notes: NestedNote[], deckMap: Record<number, number>, noteTypeMap: Record<number, number> = {}) {
  const owned = new Set((await listDecks(uid)).map((d) => d.id));
  for (const v of Object.values(deckMap)) if (!owned.has(Number(v))) throw new NotFoundError("deck_not_found");
  const nts = await getNoteTypesByIds(uid, Object.values(noteTypeMap).map(Number));
  notes = resolveCustomNotes(notes, noteTypeMap, nts);
  const sink = dbSink(uid, owned, nts);
  // make sure note card sets are complete even for hand-written backups
  const fixed = notes.map((n) => {
    if (n.cards.length) return n;
    const nt = n.type === "custom" && n.notetypeId != null ? nts.get(n.notetypeId) ?? null : null;
    const type = NOTE_TYPES.includes(n.type) || nt ? n.type : "basic";
    return { ...n, cards: cardOrdinals(type, n.fields, nt).map((ord) => ({ id: 0, noteId: n.id, deckId: n.deckId, homeDeckId: null, ord, state: "new" as const, due: new Date(0).toISOString(), stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, step: 0, lastReview: null, ease: 0, box: 0, suspended: false, buriedDay: null, flag: 0, leech: false, position: n.position, createdAt: n.createdAt, revlog: [] })) };
  });
  const res = await importNotes(sink, fixed, deckMap);
  await sink.addTags([...new Set(notes.flatMap((n) => n.tags ?? []))]);
  return res;
}
