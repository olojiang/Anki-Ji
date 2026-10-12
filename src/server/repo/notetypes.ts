import { q } from "../db";
import { BadRequestError, NotFoundError } from "./decks";
import {
  STOCK_NOTETYPES, cloneNoteType as cloneDef, customSearchText, customSortField, generateOrdinals, normalizeNoteType, planCardChanges,
  sanitizeValues, stockNoteType, validateNoteType, type CustomNoteType, type NoteTypeDef,
} from "@/core/notetypes";
import type { NoteType } from "@/core/types";

type Row = Record<string, unknown>;

export function toNoteType(r: Row): CustomNoteType {
  return {
    id: Number(r.id), name: String(r.name), kind: r.kind === "cloze" ? "cloze" : "standard",
    fields: (r.fields as NoteTypeDef["fields"]) ?? [], templates: (r.templates as NoteTypeDef["templates"]) ?? [],
    css: String(r.css ?? ""), sortField: Number(r.sort_field ?? 0), markdown: r.markdown !== false,
    sourceKey: r.source_key == null ? null : String(r.source_key),
    ...(r.note_count != null ? { noteCount: Number(r.note_count) } : {}),
  };
}

/** The user's custom note types (with live note counts). */
export async function listNoteTypes(uid: number): Promise<CustomNoteType[]> {
  const rows = await q(
    `SELECT t.*, (SELECT count(*)::int FROM ak_notes n WHERE n.notetype_id = t.id AND n.deleted_at IS NULL) AS note_count
     FROM ak_notetypes t WHERE t.user_id = $1 ORDER BY lower(t.name), t.id`, [uid]);
  return rows.map(toNoteType);
}

/** Stock (read-only) types with note counts, followed by the user's custom types. */
export async function listAllNoteTypes(uid: number): Promise<NoteTypeDef[]> {
  const counts = new Map((await q("SELECT type, count(*)::int AS n FROM ak_notes WHERE user_id = $1 AND deleted_at IS NULL AND type <> 'custom' GROUP BY type", [uid]))
    .map((r) => [String(r.type), Number(r.n)]));
  return [...STOCK_NOTETYPES.map((s) => ({ ...s, noteCount: counts.get(s.stock!) ?? 0 })), ...(await listNoteTypes(uid))];
}

export async function getNoteType(uid: number, id: number): Promise<CustomNoteType | null> {
  if (!Number.isInteger(id)) return null;
  const rows = await q("SELECT * FROM ak_notetypes WHERE user_id = $1 AND id = $2", [uid, id]);
  return rows[0] ? toNoteType(rows[0]) : null;
}

export async function getNoteTypesByIds(uid: number, ids: number[]): Promise<Map<number, CustomNoteType>> {
  const uniq = [...new Set(ids.filter((x) => Number.isInteger(x)))];
  if (!uniq.length) return new Map();
  const rows = await q("SELECT * FROM ak_notetypes WHERE user_id = $1 AND id = ANY($2::int[])", [uid, uniq]);
  return new Map(rows.map((r) => [Number(r.id), toNoteType(r)]));
}

/** Throw the first validation issue as a 400 (the UI validates the same rules with detail first). */
function assertValid(def: NoteTypeDef) {
  const issues = validateNoteType(def);
  if (issues.length) {
    const e = issues[0];
    throw new BadRequestError(e.code + (e.detail ? `:${e.detail}` : ""));
  }
}

async function uniqueName(uid: number, name: string, exceptId = 0): Promise<string> {
  const taken = new Set((await q("SELECT lower(name) AS n FROM ak_notetypes WHERE user_id = $1 AND id <> $2", [uid, exceptId])).map((r) => String(r.n)));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
}

async function insert(uid: number, def: NoteTypeDef): Promise<CustomNoteType> {
  const rows = await q(
    `INSERT INTO ak_notetypes (user_id, name, kind, fields, templates, css, sort_field, markdown, source_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [uid, def.name, def.kind, JSON.stringify(def.fields), JSON.stringify(def.templates), def.css, def.sortField, def.markdown, def.sourceKey ?? null]);
  return { ...toNoteType(rows[0]), noteCount: 0 };
}

export async function createNoteType(uid: number, input: Partial<NoteTypeDef>): Promise<CustomNoteType> {
  const def = normalizeNoteType({ ...(input as Record<string, unknown>), id: 0 });
  assertValid(def);
  def.name = await uniqueName(uid, def.name);
  return insert(uid, def);
}

/** Clone a stock type ("stock:basic") or one of the user's own types. */
export async function cloneNoteType(uid: number, source: number | string, name: string): Promise<CustomNoteType> {
  let src: NoteTypeDef | null | undefined;
  if (typeof source === "string" && source.startsWith("stock:")) src = stockNoteType(source.slice(6) as NoteType);
  else src = await getNoteType(uid, Number(source));
  if (!src) throw new NotFoundError("notetype_not_found");
  if (src.readOnly && !src.clonable) throw new BadRequestError("notetype_not_clonable");
  const def = cloneDef(src, (name ?? "").trim() || `${src.name} copy`);
  assertValid(def);
  def.name = await uniqueName(uid, def.name);
  return insert(uid, def);
}

export async function renameNoteType(uid: number, id: number, name: string) {
  const cur = await getNoteType(uid, id);
  if (!cur) throw new NotFoundError("notetype_not_found");
  if (!name.trim()) throw new BadRequestError("empty_name");
  await q("UPDATE ak_notetypes SET name = $3, updated_at = now() WHERE user_id = $1 AND id = $2", [uid, id, await uniqueName(uid, name.trim().slice(0, 200), id)]);
}

/**
 * Save a new definition and bring every note of the type in line: drop values of deleted fields, recompute
 * sort/search text, add cards for templates that now render, remove cards of deleted templates and unstudied
 * cards that no longer render. Scheduling of every surviving card is untouched.
 */
export async function updateNoteType(uid: number, id: number, input: Partial<NoteTypeDef>): Promise<{ noteType: CustomNoteType; added: number; removed: number; notes: number }> {
  const cur = await getNoteType(uid, id);
  if (!cur) throw new NotFoundError("notetype_not_found");
  const next = normalizeNoteType({ ...(input as Record<string, unknown>), id });
  if (next.kind !== cur.kind) throw new BadRequestError("notetype_kind_change_unsupported");
  next.sourceKey = cur.sourceKey ?? null;
  assertValid(next);
  next.name = await uniqueName(uid, next.name, id);
  await q("UPDATE ak_notetypes SET name = $3, fields = $4, templates = $5, css = $6, sort_field = $7, markdown = $8, updated_at = now() WHERE user_id = $1 AND id = $2",
    [uid, id, next.name, JSON.stringify(next.fields), JSON.stringify(next.templates), next.css, next.sortField, next.markdown]);
  const res = await syncNotesOfType(uid, next);
  return { noteType: { ...next, id, noteCount: cur.noteCount }, ...res };
}

async function syncNotesOfType(uid: number, nt: NoteTypeDef) {
  const notes = await q("SELECT id, deck_id, position, fields FROM ak_notes WHERE user_id = $1 AND notetype_id = $2", [uid, nt.id]);
  if (!notes.length) return { added: 0, removed: 0, notes: 0 };
  const cards = await q("SELECT note_id, ord, reps, state FROM ak_cards WHERE user_id = $1 AND note_id = ANY($2::int[])", [uid, notes.map((n) => Number(n.id))]);
  const byNote = new Map<number, { ord: number; reps: number; state: string }[]>();
  for (const c of cards) (byNote.get(Number(c.note_id)) ?? byNote.set(Number(c.note_id), []).get(Number(c.note_id))!).push({ ord: Number(c.ord), reps: Number(c.reps), state: String(c.state) });
  const templateOrds = nt.kind === "cloze" ? null : nt.templates.map((t) => t.ord);
  const updates: { id: number; fields: unknown; sort_field: string; search_text: string }[] = [];
  const adds: { note_id: number; deck_id: number; ord: number; position: number }[] = [];
  const removes: { note_id: number; ord: number }[] = [];
  for (const n of notes) {
    const nid = Number(n.id);
    const values = sanitizeValues(nt, ((n.fields as { custom?: Record<string, unknown> })?.custom) ?? {});
    updates.push({ id: nid, fields: { custom: values }, sort_field: customSortField(nt, values), search_text: customSearchText(values) });
    const plan = planCardChanges(byNote.get(nid) ?? [], generateOrdinals(nt, values), templateOrds);
    for (const ord of plan.add) adds.push({ note_id: nid, deck_id: Number(n.deck_id), ord, position: Number(n.position) });
    for (const ord of plan.remove) removes.push({ note_id: nid, ord });
  }
  await q(`UPDATE ak_notes n SET fields = x.fields, sort_field = x.sort_field, search_text = x.search_text
           FROM jsonb_to_recordset($2::jsonb) AS x(id int, fields jsonb, sort_field text, search_text text) WHERE n.user_id = $1 AND n.id = x.id`, [uid, JSON.stringify(updates)]);
  if (removes.length) {
    await q(`DELETE FROM ak_cards c USING jsonb_to_recordset($2::jsonb) AS x(note_id int, ord int) WHERE c.user_id = $1 AND c.note_id = x.note_id AND c.ord = x.ord`, [uid, JSON.stringify(removes)]);
  }
  if (adds.length) {
    await q(`INSERT INTO ak_cards (user_id, note_id, deck_id, ord, position)
             SELECT $1, x.note_id, x.deck_id, x.ord, x.position FROM jsonb_to_recordset($2::jsonb) AS x(note_id int, deck_id int, ord int, position float8)
             ON CONFLICT (note_id, ord) DO NOTHING`, [uid, JSON.stringify(adds)]);
  }
  return { added: adds.length, removed: removes.length, notes: notes.length };
}

/** Delete a type that no live note uses (its trashed notes are purged with it). */
export async function deleteNoteType(uid: number, id: number) {
  const cur = await getNoteType(uid, id);
  if (!cur) throw new NotFoundError("notetype_not_found");
  const live = Number((await q("SELECT count(*)::int AS n FROM ak_notes WHERE user_id = $1 AND notetype_id = $2 AND deleted_at IS NULL", [uid, id]))[0].n);
  if (live > 0) throw new BadRequestError("notetype_in_use");
  await q("DELETE FROM ak_notes WHERE user_id = $1 AND notetype_id = $2", [uid, id]);
  await q("DELETE FROM ak_notetypes WHERE user_id = $1 AND id = $2", [uid, id]);
}

/**
 * Create (or reuse) note types for an import. Returns source id → the user's note type id.
 * A type is reused when it has the same source key (e.g. the same Anki model) or exactly the same field ids.
 * Imported templates are not rejected for validation issues (Anki add-on syntax etc.) — only structure is required.
 */
export async function importNoteTypes(uid: number, records: Partial<NoteTypeDef>[]): Promise<Record<number, number>> {
  const map: Record<number, number> = {};
  if (!records?.length) return map;
  const existing = await listNoteTypes(uid);
  for (const rec of records.slice(0, 200)) {
    const srcId = Number(rec.id);
    if (!Number.isFinite(srcId)) continue;
    const def = normalizeNoteType({ ...(rec as Record<string, unknown>), id: 0 });
    if (!def.fields.length || !def.templates.length) continue;
    if (!def.name) def.name = "Imported";
    const key = def.sourceKey || `fields:${def.kind}:${def.fields.map((f) => f.id).join(",")}`;
    const sig = (t: NoteTypeDef) => `${t.kind}:${t.fields.map((f) => f.id).join(",")}`;
    const match = existing.find((t) => (t.sourceKey && t.sourceKey === key) || sig(t) === sig(def));
    if (match) { map[srcId] = Number(match.id); continue; }
    def.sourceKey = key;
    def.name = await uniqueName(uid, def.name);
    const created = await insert(uid, def);
    existing.push(created);
    map[srcId] = Number(created.id);
  }
  return map;
}
