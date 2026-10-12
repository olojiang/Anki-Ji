import JSZip from "jszip";
import { decompress } from "fzstd";
import type { SqlJsStatic, Database } from "sql.js";
import type { NoteFields, NoteType } from "../types";
import { createBackup, type Backup, type CardRecord, type DeckRecord, type MediaRecord, type NoteRecord } from "./backup";
import { bytesToBase64, mimeFromName } from "./base64";
import { splitPath } from "../tree";
import { ankiModelToNoteType, convertAnkiFieldHtml, isStockAnkiModel, protoNum, protoStr, readProto } from "./apkg-notetypes";
import type { NoteTypeRecord } from "./backup";

export interface AnkiModel {
  id: number; name: string; type: 0 | 1; fieldNames: string[]; templateCount: number;
  // full model (used to import custom models as note types)
  fields?: { name: string; font?: string; size?: number; rtl?: boolean }[];
  templates?: { name: string; qfmt: string; afmt: string }[];
  css?: string; sortf?: number;
}
export interface AnkiCollection {
  crt: number; // collection creation (seconds)
  decks: { id: number; name: string }[];
  models: Map<number, AnkiModel>;
  notes: { id: number; guid: string; mid: number; tags: string; flds: string }[];
  cards: { id: number; nid: number; did: number; ord: number; type: number; queue: number; due: number; ivl: number; factor: number; reps: number; lapses: number }[];
  media: Map<string, Uint8Array>;
}

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const isZstd = (b: Uint8Array) => ZSTD_MAGIC.every((m, i) => b[i] === m);
const maybeZstd = (b: Uint8Array) => (isZstd(b) ? decompress(b) : b);

function rows<T>(db: Database, sql: string): T[] {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])) as T);
}

function tableExists(db: Database, name: string) {
  return rows<{ n: number }>(db, `SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='${name}'`)[0]?.n > 0;
}

/** Minimal protobuf reader for the anki21b media manifest: entries(1) { name(1), size(2), sha1(3) }. */
function parseMediaProto(buf: Uint8Array): string[] {
  let p = 0;
  const varint = (b: Uint8Array) => { let x = 0, s = 0; for (;;) { const c = b[p++]; x += (c & 0x7f) * 2 ** s; if (c < 0x80) return x; s += 7; } };
  const names: string[] = [];
  const outerEnd = buf.length;
  while (p < outerEnd) {
    const key = varint(buf);
    const field = key >>> 3, wire = key & 7;
    if (wire !== 2) { if (wire === 0) varint(buf); else if (wire === 5) p += 4; else if (wire === 1) p += 8; continue; }
    const len = varint(buf);
    const end = p + len;
    if (field === 1) {
      let name = "";
      while (p < end) {
        const k = varint(buf); const f = k >>> 3, w = k & 7;
        if (w === 2) { const l = varint(buf); if (f === 1) name = new TextDecoder().decode(buf.subarray(p, p + l)); p += l; }
        else if (w === 0) varint(buf); else if (w === 5) p += 4; else if (w === 1) p += 8;
      }
      names.push(name);
    }
    p = end;
  }
  return names;
}

export async function readApkg(bytes: Uint8Array, SQL: SqlJsStatic): Promise<AnkiCollection> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error("not_apkg"); }
  const pick = zip.file("collection.anki21b") ?? zip.file("collection.anki21") ?? zip.file("collection.anki2");
  if (!pick) throw new Error("not_apkg");
  const dbBytes = maybeZstd(await pick.async("uint8array"));
  const db = new SQL.Database(dbBytes);
  try {
    const models = new Map<number, AnkiModel>();
    let decks: { id: number; name: string }[] = [];
    const col = rows<{ crt: number; models: string; decks: string }>(db, "SELECT crt, models, decks FROM col")[0];
    if (tableExists(db, "notetypes")) {
      // schema 18 (anki21b)
      const nts = rows<{ id: number; name: string; config: Uint8Array | null }>(db, "SELECT id, name, config FROM notetypes");
      for (const nt of nts) {
        const fl = rows<{ name: string; config: Uint8Array | null }>(db, `SELECT name, config FROM fields WHERE ntid=${nt.id} ORDER BY ord`);
        const fieldNames = fl.map((f) => f.name);
        const tmpls = rows<{ name: string; config: Uint8Array }>(db, `SELECT name, config FROM templates WHERE ntid=${nt.id} ORDER BY ord`);
        // protobuf configs: Notetype.Config{kind=1, sort_field_idx=2, css=3}, Field.Config{rtl=2, font_name=3, font_size=4}, Template.Config{q_format=1, a_format=2}
        const ntc = readProto(nt.config ?? new Uint8Array());
        const templates = tmpls.map((t) => { const c = readProto(t.config ?? new Uint8Array()); return { name: String(t.name ?? ""), qfmt: protoStr(c, 1) ?? "", afmt: protoStr(c, 2) ?? "" }; });
        const fields = fl.map((f) => { const c = readProto(f.config ?? new Uint8Array()); return { name: f.name, ...(protoStr(c, 3) ? { font: protoStr(c, 3) } : {}), ...(protoNum(c, 4) ? { size: protoNum(c, 4) } : {}), ...(protoNum(c, 2) ? { rtl: true } : {}) }; });
        const cloze = protoNum(ntc, 1) === 1 || tmpls.some((t) => new TextDecoder().decode(t.config ?? new Uint8Array()).includes("{{cloze:"));
        models.set(Number(nt.id), { id: Number(nt.id), name: nt.name, type: cloze ? 1 : 0, fieldNames, templateCount: tmpls.length, fields, templates, css: protoStr(ntc, 3) ?? "", sortf: protoNum(ntc, 2) ?? 0 });
      }
      decks = rows<{ id: number; name: string }>(db, "SELECT id, name FROM decks").map((d) => ({ id: Number(d.id), name: String(d.name).split("\x1f").join("::") }));
    } else if (col) {
      type LegacyModel = { id: number; name: string; type: number; css?: string; sortf?: number; flds: { name: string; ord: number; font?: string; size?: number; rtl?: boolean }[]; tmpls: { name?: string; ord?: number; qfmt?: string; afmt?: string }[] };
      for (const m of Object.values(JSON.parse(col.models || "{}")) as LegacyModel[]) {
        const flds = [...m.flds].sort((a, b) => a.ord - b.ord);
        const tmpls = [...(m.tmpls ?? [])].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
        models.set(Number(m.id), {
          id: Number(m.id), name: m.name, type: m.type === 1 ? 1 : 0, fieldNames: flds.map((f) => f.name), templateCount: m.tmpls?.length ?? 1,
          fields: flds.map((f) => ({ name: f.name, ...(f.font ? { font: f.font } : {}), ...(f.size ? { size: Number(f.size) } : {}), ...(f.rtl ? { rtl: true } : {}) })),
          templates: tmpls.some((t) => t.qfmt != null) ? tmpls.map((t, i) => ({ name: t.name ?? `Card ${i + 1}`, qfmt: t.qfmt ?? "", afmt: t.afmt ?? "" })) : undefined,
          css: m.css ?? "", sortf: Number(m.sortf ?? 0),
        });
      }
      decks = (Object.values(JSON.parse(col.decks || "{}")) as { id: number; name: string }[]).map((d) => ({ id: Number(d.id), name: d.name }));
    }
    const notes = rows<{ id: number; guid: string; mid: number; tags: string; flds: string }>(db, "SELECT id, guid, mid, tags, flds FROM notes");
    const cards = rows<AnkiCollection["cards"][number]>(db, "SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards");

    const media = new Map<string, Uint8Array>();
    const mf = zip.file("media");
    if (mf) {
      const raw = await mf.async("uint8array");
      let names: Record<string, string> = {};
      try { names = JSON.parse(new TextDecoder().decode(raw)); }
      catch { parseMediaProto(maybeZstd(raw)).forEach((n, i) => { names[String(i)] = n; }); }
      for (const [idx, name] of Object.entries(names)) {
        const f = zip.file(idx);
        if (f && name) media.set(name, maybeZstd(await f.async("uint8array")));
      }
    }
    return { crt: Number(col?.crt ?? 0), decks, models, notes: notes.map((n) => ({ ...n, id: Number(n.id), mid: Number(n.mid) })), cards: cards.map((c) => ({ ...c, id: Number(c.id), nid: Number(c.nid), did: Number(c.did) })), media };
  } finally {
    db.close();
  }
}

export const ANKI_MEDIA_PREFIX = "anki-media:";

/** Anki fields are HTML; keep the HTML (sanitised at render time) but point media at placeholders. */
export function convertAnkiField(html: string): string {
  return html
    .replace(/\[sound:([^\]]+)\]/g, (_, f) => `![audio](${ANKI_MEDIA_PREFIX}${f.trim()})`)
    .replace(/(<img[^>]*\ssrc=)(["']?)([^"'\s>]+)\2/gi, (m, pre, q, src) => (/^(https?:|data:)/i.test(src) ? m : `${pre}"${ANKI_MEDIA_PREFIX}${src}"`));
}

/** Convert an Anki collection into our backup format, so it reuses the normal import pipeline. */
export function apkgToBackup(col: AnkiCollection, opts: { exportedAt?: string } = {}): Backup {
  const ankiDeckName = new Map(col.decks.map((d) => [d.id, d.name]));
  const usedDids = new Set(col.cards.map((c) => c.did));
  // build deck records for every used path and its ancestors
  const pathId = new Map<string, number>();
  const decks: DeckRecord[] = [];
  let nextDeckId = 1;
  const now = opts.exportedAt ?? new Date().toISOString();
  const ensure = (path: string): number => {
    const segs = splitPath(path);
    let parent: number | null = null;
    let acc = "";
    for (const s of segs) {
      acc = acc ? `${acc}::${s}` : s;
      let id = pathId.get(acc.toLowerCase());
      if (id == null) {
        id = nextDeckId++;
        pathId.set(acc.toLowerCase(), id);
        decks.push({ id, parentId: parent, name: s, position: id, config: {}, filtered: false, filter: null, createdAt: now });
      }
      parent = id;
    }
    return parent!;
  };
  const didToDeck = new Map<number, number>();
  for (const did of usedDids) didToDeck.set(did, ensure(ankiDeckName.get(did) ?? "Default"));

  const cardsByNote = new Map<number, AnkiCollection["cards"]>();
  for (const c of col.cards) (cardsByNote.get(c.nid) ?? cardsByNote.set(c.nid, []).get(c.nid)!).push(c);

  const notes: NoteRecord[] = [];
  const cards: CardRecord[] = [];
  const noteTypes = new Map<number, NoteTypeRecord>();
  let pos = 1;
  for (const n of col.notes) {
    const model = col.models.get(n.mid);
    const ncards = (cardsByNote.get(n.id) ?? []).sort((a, b) => a.ord - b.ord);
    if (!ncards.length) continue;
    const custom = model && !isStockAnkiModel(model) ? (noteTypes.get(model.id) ?? noteTypes.set(model.id, ankiModelToNoteType(model)).get(model.id)!) : null;
    const f = n.flds.split("\x1f").map(custom ? convertAnkiFieldHtml : convertAnkiField);
    let type: NoteType;
    let fields: NoteFields;
    if (custom) { type = "custom"; fields = { custom: Object.fromEntries(custom.fields.map((x, i) => [x.id, f[i] ?? ""])) }; }
    else if (model?.type === 1) { type = "cloze"; fields = { text: f[0] ?? "", extra: f[1] ?? "" }; }
    else if ((model?.templateCount ?? 1) >= 2 && ncards.some((c) => c.ord === 1)) { type = "basic_reverse"; fields = { front: f[0] ?? "", back: f[1] ?? "" }; }
    else { type = "basic"; fields = { front: f[0] ?? "", back: f.slice(1).filter((x) => x.trim()).join("\n\n") }; }
    const deckId = didToDeck.get(ncards[0].did)!;
    const created = new Date(Math.min(n.id, Date.now())).toISOString();
    notes.push({ id: n.id, deckId, guid: n.guid || `anki-${n.id}`, type, fields, tags: n.tags.split(/\s+/).filter(Boolean), position: pos++, createdAt: created, updatedAt: created, ...(custom ? { notetypeId: custom.id } : {}) });
    for (const c of ncards) {
      if (type === "basic" && c.ord > 0) continue;
      if (custom && custom.kind === "standard" && c.ord >= custom.templates.length) continue;
      const review = c.type === 2 && c.ivl > 0;
      const dueMs = col.crt ? (col.crt + c.due * 86400) * 1000 : Date.now();
      cards.push({
        id: c.id, noteId: n.id, deckId: didToDeck.get(c.did) ?? deckId, homeDeckId: null, ord: type === "cloze" || custom?.kind === "cloze" ? c.ord + 1 : c.ord,
        state: review ? "review" : "new", due: new Date(review ? dueMs : 0).toISOString(),
        stability: review ? Math.max(0.5, c.ivl) : 0, difficulty: review ? 5 : 0, elapsedDays: 0, scheduledDays: review ? c.ivl : 0,
        reps: review ? c.reps : 0, lapses: review ? c.lapses : 0, step: 0, lastReview: review ? new Date(dueMs - c.ivl * 86400000).toISOString() : null,
        ease: review ? c.factor / 1000 : 0, box: 0, suspended: c.queue === -1, buriedDay: null, flag: 0, leech: false, position: pos, createdAt: created,
      });
    }
  }
  const media: MediaRecord[] = [...col.media.entries()].map(([name, data], i) => ({ id: i + 1, url: ANKI_MEDIA_PREFIX + name, filename: name, contentType: mimeFromName(name), size: data.length, data: bytesToBase64(data) }));
  const tags = [...new Set(notes.flatMap((n) => n.tags))];
  return createBackup({ exportedAt: now, settings: {}, tags, decks, notes, cards, revlog: [], media, noteTypes: [...noteTypes.values()] });
}
