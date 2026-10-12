/**
 * AnkiConnect-compatible API (protocol version 6) on top of Anki-ji, authenticated with personal API tokens.
 * Lets Yomitan and other AnkiConnect clients add and query notes. Every query is scoped to the token's user.
 */
import { q } from "../db";
import { listDecks, ensureDeckPath } from "../repo/decks";
import { createNote, getNote, updateNote, bulkTags, softDeleteNotes } from "../repo/notes";
import { listTags } from "../repo/tags";
import { setSuspended } from "../repo/cards";
import { userForToken } from "../repo/tokens";
import { storeMedia, MAX_MEDIA_BYTES } from "../media";
import { searchNotes } from "./browse";
import { deckPath, descendantIds } from "@/core/tree";
import { cleanFields, renderCard, sortField, validateNote } from "@/core/notes";
import { convertAnkiField, ANKI_MEDIA_PREFIX } from "@/core/io/apkg";
import { mimeFromName } from "@/core/io/base64";
import { allImporters, importerByNoteType, noteToModelFields, type NoteTypeImporter } from "@/core/interop/models";
import { translateAnkiQuery } from "@/core/interop/query";
import { customImporter, customModelFields, type CustomImporter } from "@/core/interop/custom";
import { listNoteTypes } from "../repo/notetypes";
import type { NoteTypeDef } from "@/core/notetypes";
import { NOTE_TYPES, type NoteFields, type NoteType } from "@/core/types";

export const ANKICONNECT_VERSION = 6;
const MAX_BATCH = 1000;

class AcError extends Error {}
const fail = (msg: string): never => { throw new AcError(msg); };

type Params = Record<string, unknown>;
interface AcNote {
  deckName?: string; modelName?: string; fields?: Record<string, string>; tags?: string[] | string;
  options?: { allowDuplicate?: boolean; duplicateScope?: string; duplicateScopeOptions?: { deckName?: string | null; checkChildren?: boolean; checkAllModels?: boolean } };
  audio?: AcMedia[] | AcMedia; picture?: AcMedia[] | AcMedia; video?: AcMedia[] | AcMedia;
}
interface AcMedia { url?: string; data?: string; path?: string; filename?: string; fields?: string[] | string; skipHash?: string }

const arr = <T>(v: T[] | T | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const idList = (v: unknown): number[] => (Array.isArray(v) ? v : v == null ? [] : [v]).map(Number).filter(Number.isSafeInteger);
const tagList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : String(v ?? "").split(/\s+/)).map((t) => t.trim()).filter(Boolean);

/* ---------------- media ---------------- */

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|\[?fe80:|metadata\.google)/i;

async function mediaBytes(m: AcMedia): Promise<{ bytes: ArrayBuffer; type: string }> {
  if (m.path) fail("media from a local path is not supported; send data or url");
  if (typeof m.data === "string" && m.data) {
    const buf = Buffer.from(m.data.replace(/^data:[^,]*,/, ""), "base64");
    if (buf.byteLength > MAX_MEDIA_BYTES) fail("media file is too large");
    return { bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, type: mimeFromName(m.filename ?? "") };
  }
  if (typeof m.url === "string" && m.url) {
    let u: URL;
    try { u = new URL(m.url); } catch { return fail("invalid media url"); }
    if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) fail("media url must be a public http(s) address");
    const res = await fetch(u, { signal: AbortSignal.timeout(10_000), redirect: "follow" }).catch(() => fail("could not download media url"));
    if (!res.ok) fail(`could not download media url (${res.status})`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_MEDIA_BYTES) fail("media file is too large");
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_MEDIA_BYTES) fail("media file is too large");
    return { bytes, type: res.headers.get("content-type")?.split(";")[0] || mimeFromName(m.filename ?? u.pathname) };
  }
  return fail("media requires data or url");
}

async function storeMediaFile(uid: number, m: AcMedia): Promise<string> {
  const filename = String(m.filename ?? "").replace(/[\\/]/g, "_").trim();
  if (!filename) fail("media filename is required");
  const { bytes, type } = await mediaBytes(m);
  await storeMedia(uid, { name: filename, type: type || mimeFromName(filename), bytes });
  return filename;
}

/** Anki HTML → our field text: [sound:x] / <img src=x> references to stored media become their URLs. */
async function resolveField(uid: number, html: string): Promise<string> {
  const conv = convertAnkiField(String(html ?? ""));
  const names = [...new Set([...conv.matchAll(new RegExp(`${ANKI_MEDIA_PREFIX}([^"')\\s]+)`, "g"))].map((m) => m[1]))];
  if (!names.length) return conv;
  const rows = await q("SELECT DISTINCT ON (filename) filename, url FROM ak_media WHERE user_id = $1 AND filename = ANY($2::text[]) ORDER BY filename, id DESC", [uid, names]);
  const map = new Map(rows.map((r) => [String(r.filename), String(r.url)]));
  return conv.replace(new RegExp(`${ANKI_MEDIA_PREFIX}([^"')\\s]+)`, "g"), (_m, n) => map.get(n) ?? n);
}

/* ---------------- models (stock + the user's custom note types) ---------------- */

interface Catalog {
  list(): NoteTypeImporter[];
  byName(name: string): NoteTypeImporter | undefined;
  /** Importer for an existing note (custom notes by their note type id). */
  forNote(type: string, notetypeId: number | null | undefined): NoteTypeImporter | undefined;
  noteType(notetypeId: number | null | undefined): NoteTypeDef | null;
}
const isCustom = (imp: NoteTypeImporter): imp is CustomImporter => imp.noteType === "custom" && "notetypeId" in imp;

/** Per-request model catalog: custom importers are built from this user's note types only (never a global registry). */
async function catalog(uid: number): Promise<Catalog> {
  const custom = (await listNoteTypes(uid)).map((nt) => customImporter(nt));
  const stockNames = new Set(allImporters().map((m) => m.model.name.toLowerCase()));
  const own = custom.filter((c) => !stockNames.has(c.model.name.toLowerCase())); // stock names win on a clash
  const all = [...allImporters(), ...own];
  return {
    list: () => all,
    byName: (name) => { const n = String(name ?? "").trim().toLowerCase(); return all.find((x) => x.model.name.toLowerCase() === n); },
    forNote: (type, id) => (type === "custom" ? custom.find((c) => c.notetypeId === Number(id)) : importerByNoteType(type)),
    noteType: (id) => custom.find((c) => c.notetypeId === Number(id))?.def ?? null,
  };
}

/* ---------------- notes ---------------- */

const modelToTypeFor = (cat: Catalog) => (name: string) => {
  const imp = cat.byName(name);
  if (imp) return isCustom(imp) ? imp.model.name.toLowerCase() : String(imp.noteType);
  return NOTE_TYPES.includes(name.toLowerCase() as NoteType) ? name.toLowerCase() : undefined;
};

function matchFieldName(model: NoteTypeImporter["model"], given: string): string | undefined {
  return model.fields.find((f) => f.toLowerCase() === String(given).trim().toLowerCase());
}

interface Prepared { deckId: number; imp: NoteTypeImporter; type: NoteType; fields: NoteFields; tags: string[]; notetypeId: number | null }

async function prepareNote(uid: number, note: AcNote, opts: { store: boolean }, cat?: Catalog): Promise<Prepared> {
  if (!note || typeof note !== "object") fail("note is required");
  cat ??= await catalog(uid);
  const imp = cat.byName(String(note.modelName ?? "")) ?? fail(`model was not found: ${note.modelName}`);
  const nt = isCustom(imp) ? imp.def : null;
  const decks = (await listDecks(uid)).filter((d) => !d.filtered);
  const want = String(note.deckName ?? "").trim().toLowerCase();
  const deck = decks.find((d) => deckPath(decks, d.id).toLowerCase() === want) ?? fail(`deck was not found: ${note.deckName}`);
  const values: Record<string, string> = Object.fromEntries(imp.model.fields.map((f) => [f, ""]));
  for (const [k, v] of Object.entries(note.fields ?? {})) { const name = matchFieldName(imp.model, k); if (name) values[name] = String(v ?? ""); }
  // media attachments (Yomitan style): store, then reference from the requested fields
  const after: { field: string; md: string }[] = [];
  for (const [kind, list] of [["audio", note.audio], ["picture", note.picture], ["video", note.video]] as const) {
    for (const m of arr(list)) {
      const targets = arr(m.fields).map((f) => matchFieldName(imp.model, String(f))).filter(Boolean) as string[];
      if (!opts.store) continue;
      const name = await storeMediaFile(uid, m);
      for (const t of targets) {
        if (kind === "picture") values[t] += `<img src="${name}">`;
        else if (kind === "audio") values[t] += `[sound:${name}]`;
        else after.push({ field: t, md: name });
      }
    }
  }
  const resolved: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) resolved[k] = opts.store ? await resolveField(uid, v) : convertAnkiField(v);
  for (const a of after) {
    const r = await q("SELECT url FROM ak_media WHERE user_id = $1 AND filename = $2 ORDER BY id DESC LIMIT 1", [uid, a.md]);
    if (r[0]) resolved[a.field] += `\n\n![video](${String(r[0].url)})`;
  }
  const type = imp.noteType as NoteType;
  const fields = cleanFields(type, imp.fromAnki(resolved), nt);
  const first = values[imp.model.fields[0]] ?? "";
  if (!first.replace(/<[^>]*>|&nbsp;/g, "").trim() && !/<img/i.test(first)) fail("cannot create note because it is empty");
  const err = validateNote(type, fields, nt);
  if (err === "cloze_required") fail("cannot create note: cloze deletion missing (use {{c1::...}})");
  if (err) fail(`cannot create note because it is empty (${err})`);
  if (!note.options?.allowDuplicate) {
    const sf = sortField(type, fields, nt);
    const scope = note.options?.duplicateScope === "deck";
    let deckIds: number[] | null = null;
    if (scope) {
      const sd = note.options?.duplicateScopeOptions?.deckName;
      const sdeck = sd ? decks.find((d) => deckPath(decks, d.id).toLowerCase() === sd.toLowerCase()) : deck;
      deckIds = sdeck ? (note.options?.duplicateScopeOptions?.checkChildren ? descendantIds(decks, sdeck.id) : [sdeck.id]) : [];
    }
    const allModels = !!note.options?.duplicateScopeOptions?.checkAllModels;
    const dup = await q(
      `SELECT 1 FROM ak_notes WHERE user_id = $1 AND deleted_at IS NULL AND sort_field = $2 ${allModels ? "" : "AND type = $3"} ${deckIds ? `AND deck_id = ANY($${allModels ? 3 : 4}::int[])` : ""}
       ${!allModels && nt ? `AND notetype_id = ${Number(nt.id)}` : ""} LIMIT 1`,
      [uid, sf, ...(allModels ? [] : [type]), ...(deckIds ? [deckIds] : [])]);
    if (dup.length) fail("cannot create note because it is a duplicate");
  }
  return { deckId: deck.id, imp, type, fields, tags: tagList(note.tags), notetypeId: nt ? Number(nt.id) : null };
}

async function addNote(uid: number, note: AcNote, cat?: Catalog): Promise<number> {
  cat ??= await catalog(uid);
  await prepareNote(uid, note, { store: false }, cat); // validate before storing any media
  const p = await prepareNote(uid, note, { store: true }, cat);
  return (await createNote(uid, { deckId: p.deckId, type: p.type, fields: p.fields, tags: p.tags, ...(p.notetypeId != null ? { notetypeId: p.notetypeId } : {}) })).id;
}

async function ownedNotes(uid: number, ids: number[]) {
  if (!ids.length) return [];
  return q("SELECT * FROM ak_notes WHERE user_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL", [uid, ids]);
}

async function findCardRows(uid: number, query: string) {
  const t = translateAnkiQuery(query, modelToTypeFor(await catalog(uid)));
  let rows = await searchNotes(uid, t.query, { sort: "created" });
  if (t.nids) { const s = new Set(t.nids); rows = rows.filter((r) => s.has(r.noteId)); }
  if (t.cids) { const s = new Set(t.cids); rows = rows.filter((r) => s.has(r.cardId)); }
  return rows.sort((a, b) => a.noteId - b.noteId || a.ord - b.ord);
}

const secs = (v: unknown) => Math.floor(new Date(String(v instanceof Date ? v.toISOString() : v)).getTime() / 1000);

function fieldsObject(type: string, f: NoteFields, nt?: NoteTypeDef | null) {
  const { model, values } = type === "custom" && nt ? customModelFields(nt, f) : noteToModelFields(type, f);
  return { model, fields: Object.fromEntries(model.fields.map((name, order) => [name, { value: values[order] ?? "", order }])) };
}

async function notesInfo(uid: number, params: Params) {
  const ids = params.query != null ? [...new Set((await findCardRows(uid, String(params.query))).map((r) => r.noteId))] : idList(params.notes);
  const rows = await ownedNotes(uid, ids);
  const cat = await catalog(uid);
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const cards = rows.length ? await q("SELECT id, note_id FROM ak_cards WHERE user_id = $1 AND note_id = ANY($2::int[]) ORDER BY ord", [uid, rows.map((r) => Number(r.id))]) : [];
  return ids.map((id) => {
    const r = byId.get(id);
    if (!r) return {};
    const { model, fields } = fieldsObject(String(r.type), r.fields as NoteFields, cat.noteType(r.notetype_id as number | null));
    return { noteId: id, profile: "Anki-ji", modelName: model.name, tags: r.tags ?? [], fields, mod: secs(r.updated_at), cards: cards.filter((c) => Number(c.note_id) === id).map((c) => Number(c.id)) };
  });
}

async function cardsInfo(uid: number, ids: number[]) {
  if (!ids.length) return [];
  const rows = await q(
    `SELECT c.*, n.type AS note_type, n.notetype_id AS note_notetype_id, n.fields AS note_fields, n.updated_at AS note_mod FROM ak_cards c JOIN ak_notes n ON n.id = c.note_id
     WHERE c.user_id = $1 AND c.id = ANY($2::int[]) AND n.deleted_at IS NULL`, [uid, ids]);
  const decks = await listDecks(uid);
  const cat = await catalog(uid);
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return ids.map((id) => {
    const c = byId.get(id);
    if (!c) return {};
    const type = String(c.note_type);
    const f = c.note_fields as NoteFields;
    const nt = type === "custom" ? cat.noteType(c.note_notetype_id as number | null) : null;
    const { model, fields } = fieldsObject(type, f, nt);
    const ord = Number(c.ord);
    const rc = renderCard(type as NoteType, f, ord, nt);
    const state = String(c.state);
    const ctype = state === "new" ? 0 : state === "learning" ? 1 : state === "review" ? 2 : 3;
    const queue = c.suspended ? -1 : ctype === 3 ? 1 : ctype;
    const dueMs = new Date(String(c.due instanceof Date ? c.due.toISOString() : c.due)).getTime();
    return {
      cardId: id, note: Number(c.note_id), deckName: deckPath(decks, Number(c.home_deck_id ?? c.deck_id)), modelName: model.name, fieldOrder: 0, fields,
      question: rc.front, answer: rc.back, css: model.css, ord: type === "cloze" || nt?.kind === "cloze" ? ord - 1 : nt ? Math.max(0, nt.templates.findIndex((x) => x.ord === ord)) : ord, type: ctype, queue,
      due: ctype === 0 ? Math.round(Number(c.position)) : ctype === 2 ? Math.floor(dueMs / 86_400_000) : Math.floor(dueMs / 1000),
      interval: Math.round(Number(c.scheduled_days)), factor: Math.round(Number(c.ease) * 1000), reps: Number(c.reps), lapses: Number(c.lapses), left: 0,
      mod: secs(c.note_mod), flags: Number(c.flag),
    };
  });
}

async function updateNoteFields(uid: number, note: { id?: unknown; fields?: Record<string, string>; tags?: unknown } & AcNote) {
  const id = Number(note?.id);
  const cur = Number.isSafeInteger(id) ? await getNote(uid, id) : null;
  if (!cur || cur.deletedAt) return fail(`note was not found: ${note?.id}`);
  if (note.fields && Object.keys(note.fields).length) {
    const cat = await catalog(uid);
    const imp = cat.forNote(cur.type, cur.notetypeId) ?? fail(`note type ${cur.type} cannot be edited through AnkiConnect`);
    const { values } = isCustom(imp) ? customModelFields(imp.def, cur.fields) : noteToModelFields(cur.type, cur.fields);
    const merged: Record<string, string> = Object.fromEntries(imp.model.fields.map((n, i) => [n, values[i] ?? ""]));
    for (const [k, v] of Object.entries(note.fields)) { const name = matchFieldName(imp.model, k); if (name) merged[name] = await resolveField(uid, String(v ?? "")); }
    for (const [kind, list] of [["audio", note.audio], ["picture", note.picture]] as const) {
      for (const m of arr(list)) {
        const name = await storeMediaFile(uid, m);
        for (const t of arr(m.fields).map((f) => matchFieldName(imp.model, String(f))).filter(Boolean) as string[]) merged[t] += await resolveField(uid, kind === "picture" ? `<img src="${name}">` : `[sound:${name}]`);
      }
    }
    await updateNote(uid, id, { fields: imp.fromAnki(merged) });
  }
  if (note.tags !== undefined) await updateNote(uid, id, { tags: tagList(note.tags) });
  return null;
}

/* ---------------- dispatch ---------------- */

async function dispatch(uid: number, action: string, params: Params): Promise<unknown> {
  switch (action) {
    case "version": return ANKICONNECT_VERSION;
    case "requestPermission": return { permission: "granted", requireApikey: true, version: ANKICONNECT_VERSION };
    case "getProfiles": return ["Anki-ji"];
    case "loadProfile": return true;
    case "sync": return null;
    case "deckNames": case "deckNamesAndIds": {
      const decks = (await listDecks(uid)).filter((d) => !d.filtered);
      const pairs = decks.map((d) => [deckPath(decks, d.id), d.id] as const).sort((a, b) => a[0].localeCompare(b[0]));
      return action === "deckNames" ? pairs.map((p) => p[0]) : Object.fromEntries(pairs);
    }
    case "createDeck": {
      const name = String(params.deck ?? "").trim();
      if (!name) fail("deck name is required");
      return ensureDeckPath(uid, name);
    }
    case "modelNames": return (await catalog(uid)).list().map((m) => m.model.name);
    case "modelNamesAndIds": return Object.fromEntries((await catalog(uid)).list().map((m) => [m.model.name, m.model.id]));
    case "modelFieldNames": return ((await catalog(uid)).byName(String(params.modelName ?? "")) ?? fail(`model was not found: ${params.modelName}`)).model.fields;
    case "modelFieldsOnTemplates": {
      const m = ((await catalog(uid)).byName(String(params.modelName ?? "")) ?? fail(`model was not found: ${params.modelName}`)).model;
      return Object.fromEntries(m.templates.map((t) => [t.name, [t.qfmt, t.afmt].map((s) => m.fields.filter((f) => s.includes(`{{${f}}}`) || s.includes(`:${f}}}`)))]));
    }
    case "modelTemplates": {
      const m = ((await catalog(uid)).byName(String(params.modelName ?? "")) ?? fail(`model was not found: ${params.modelName}`)).model;
      return Object.fromEntries(m.templates.map((t) => [t.name, { Front: t.qfmt, Back: t.afmt }]));
    }
    case "modelStyling": return { css: ((await catalog(uid)).byName(String(params.modelName ?? "")) ?? fail(`model was not found: ${params.modelName}`)).model.css };
    case "addNote": return addNote(uid, params.note as AcNote);
    case "addNotes": {
      const list = arr(params.notes as AcNote[]).slice(0, MAX_BATCH);
      const cat = await catalog(uid);
      const out: (number | null)[] = [];
      for (const n of list) { try { out.push(await addNote(uid, n, cat)); } catch { out.push(null); } }
      return out;
    }
    case "canAddNotes": case "canAddNotesWithErrorDetail": {
      const out: { canAdd: boolean; error?: string }[] = [];
      const cat = await catalog(uid);
      for (const n of arr(params.notes as AcNote[]).slice(0, MAX_BATCH)) {
        try { await prepareNote(uid, n, { store: false }, cat); out.push({ canAdd: true }); } catch (e) { out.push({ canAdd: false, error: (e as Error).message }); }
      }
      return action === "canAddNotes" ? out.map((o) => o.canAdd) : out;
    }
    case "findNotes": return [...new Set((await findCardRows(uid, String(params.query ?? ""))).map((r) => r.noteId))];
    case "findCards": case "guiBrowse": return (await findCardRows(uid, String(params.query ?? ""))).map((r) => r.cardId);
    case "notesInfo": return notesInfo(uid, params);
    case "cardsInfo": return cardsInfo(uid, idList(params.cards));
    case "cardsToNotes": {
      const ids = idList(params.cards);
      if (!ids.length) return [];
      return [...new Set((await q("SELECT DISTINCT note_id FROM ak_cards WHERE user_id = $1 AND id = ANY($2::int[]) ORDER BY note_id", [uid, ids])).map((r) => Number(r.note_id)))];
    }
    case "updateNoteFields": case "updateNote": return updateNoteFields(uid, (params.note ?? {}) as never);
    case "updateNoteTags": return updateNoteFields(uid, { id: params.note, tags: params.tags as string[] | string });
    case "getNoteTags": { const n = await getNote(uid, Number(params.note)); return n && !n.deletedAt ? n.tags : fail(`note was not found: ${params.note}`); }
    case "addTags": case "removeTags": {
      const ids = (await ownedNotes(uid, idList(params.notes))).map((r) => Number(r.id));
      const tags = tagList(params.tags);
      if (ids.length && tags.length) await bulkTags(uid, ids, action === "addTags" ? tags : [], action === "removeTags" ? tags : []);
      return null;
    }
    case "getTags": return listTags(uid);
    case "deleteNotes": {
      const ids = (await ownedNotes(uid, idList(params.notes))).map((r) => Number(r.id));
      if (ids.length) await softDeleteNotes(uid, ids);
      return null;
    }
    case "suspend": case "unsuspend": {
      const ids = idList(params.cards);
      if (ids.length) await setSuspended(uid, ids, action === "suspend");
      return true;
    }
    case "areSuspended": case "suspended": {
      const ids = action === "suspended" ? idList([params.card]) : idList(params.cards);
      const rows = ids.length ? await q("SELECT id, suspended FROM ak_cards WHERE user_id = $1 AND id = ANY($2::int[])", [uid, ids]) : [];
      const m = new Map(rows.map((r) => [Number(r.id), !!r.suspended]));
      const out = ids.map((id) => (m.has(id) ? m.get(id)! : null));
      return action === "suspended" ? out[0] ?? fail("card was not found") : out;
    }
    case "storeMediaFile": return storeMediaFile(uid, params as AcMedia);
    case "retrieveMediaFile": {
      const r = await q("SELECT url FROM ak_media WHERE user_id = $1 AND filename = $2 ORDER BY id DESC LIMIT 1", [uid, String(params.filename ?? "")]);
      if (!r[0]) return false;
      const url = String(r[0].url);
      if (url.startsWith("data:")) return url.split(",")[1] ?? false;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
      return res?.ok ? Buffer.from(await res.arrayBuffer()).toString("base64") : false;
    }
    case "getMediaFilesNames": {
      const rows = await q("SELECT DISTINCT filename FROM ak_media WHERE user_id = $1 ORDER BY filename", [uid]);
      const pat = new RegExp(`^${String(params.pattern ?? "*").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
      return rows.map((r) => String(r.filename)).filter((f) => pat.test(f));
    }
    case "guiAddCards": case "guiBrowseNote": case "guiSelectNote": case "guiSelectedNotes": case "guiCurrentCard": case "guiDeckOverview": case "guiDeckBrowser": case "guiCheckDatabase":
      return action === "guiSelectedNotes" ? [] : null; // no desktop GUI — accepted as no-ops
    case "multi": {
      const actions = arr(params.actions as { action?: string; params?: Params; version?: number }[]).slice(0, MAX_BATCH);
      const out: unknown[] = [];
      for (const a of actions) out.push(await runOne(uid, a?.action, a?.params ?? {}, Number(a?.version ?? 4)));
      return out;
    }
    default: return fail("unsupported action");
  }
}

function format(version: number, result: unknown, error: string | null) {
  if (version <= 4 && !error) return result;
  return { result: error ? null : result, error };
}

async function runOne(uid: number, action: unknown, params: Params, version: number) {
  try {
    if (typeof action !== "string" || !action) fail("unsupported action");
    return format(version, await dispatch(uid, action as string, params && typeof params === "object" ? params : {}), null);
  } catch (e) {
    return format(version, null, errorMessage(e));
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof AcError) return e.message;
  const m = e instanceof Error ? e.message : String(e);
  const map: Record<string, string> = { deck_not_found: "deck was not found", deck_is_filtered: "cannot add notes to a filtered deck", file_too_large: "media file is too large", invalid_type: "model was not found" };
  if (map[m]) return map[m];
  if (/^[a-z_]+$/.test(m)) return m.replace(/_/g, " ");
  console.error("ankiconnect", e);
  return "internal error";
}

/** Entry point: one AnkiConnect request body → response body. `bearer` comes from the Authorization header. */
export async function handleAnkiConnect(raw: unknown, bearer: string | null): Promise<unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { result: null, error: "invalid request: expected a JSON object with an action" };
  const body = raw as { action?: unknown; version?: unknown; params?: unknown; key?: unknown };
  const version = Number.isFinite(Number(body.version)) ? Number(body.version) : 4;
  if (body.action === "requestPermission") return format(Math.max(version, 5), { permission: "granted", requireApikey: true, version: ANKICONNECT_VERSION }, null);
  const key = typeof body.key === "string" && body.key ? body.key : bearer;
  const uid = await userForToken(key);
  if (!uid) return format(Math.max(version, 5), null, "valid api key must be provided");
  return runOne(uid, body.action, (body.params as Params) ?? {}, version);
}
