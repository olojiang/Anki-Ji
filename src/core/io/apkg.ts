import JSZip from "jszip";
import { decompress } from "fzstd";
import type { SqlJsStatic, Database } from "sql.js";
import type { NoteFields, NoteType } from "../types";
import { createBackup, type Backup, type CardRecord, type DeckRecord, type MediaRecord, type NoteRecord } from "./backup";
import { bytesToBase64, mimeFromName } from "./base64";
import { splitPath } from "../tree";

export interface AnkiModel { id: number; name: string; type: 0 | 1; fieldNames: string[]; templateCount: number }
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
      const nts = rows<{ id: number; name: string }>(db, "SELECT id, name FROM notetypes");
      for (const nt of nts) {
        const fieldNames = rows<{ name: string }>(db, `SELECT name FROM fields WHERE ntid=${nt.id} ORDER BY ord`).map((f) => f.name);
        const tmpls = rows<{ config: Uint8Array }>(db, `SELECT config FROM templates WHERE ntid=${nt.id} ORDER BY ord`);
        const cloze = tmpls.some((t) => new TextDecoder().decode(t.config ?? new Uint8Array()).includes("{{cloze:"));
        models.set(Number(nt.id), { id: Number(nt.id), name: nt.name, type: cloze ? 1 : 0, fieldNames, templateCount: tmpls.length });
      }
      decks = rows<{ id: number; name: string }>(db, "SELECT id, name FROM decks").map((d) => ({ id: Number(d.id), name: String(d.name).split("\x1f").join("::") }));
    } else if (col) {
      for (const m of Object.values(JSON.parse(col.models || "{}")) as { id: number; name: string; type: number; flds: { name: string; ord: number }[]; tmpls: unknown[] }[]) {
        models.set(Number(m.id), { id: Number(m.id), name: m.name, type: m.type === 1 ? 1 : 0, fieldNames: [...m.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name), templateCount: m.tmpls?.length ?? 1 });
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
  let pos = 1;
  for (const n of col.notes) {
    const model = col.models.get(n.mid);
    const f = n.flds.split("\x1f").map(convertAnkiField);
    const ncards = (cardsByNote.get(n.id) ?? []).sort((a, b) => a.ord - b.ord);
    if (!ncards.length) continue;
    let type: NoteType;
    let fields: NoteFields;
    if (model?.type === 1) { type = "cloze"; fields = { text: f[0] ?? "", extra: f[1] ?? "" }; }
    else if ((model?.templateCount ?? 1) >= 2 && ncards.some((c) => c.ord === 1)) { type = "basic_reverse"; fields = { front: f[0] ?? "", back: f[1] ?? "" }; }
    else { type = "basic"; fields = { front: f[0] ?? "", back: f.slice(1).filter((x) => x.trim()).join("\n\n") }; }
    const deckId = didToDeck.get(ncards[0].did)!;
    const created = new Date(Math.min(n.id, Date.now())).toISOString();
    notes.push({ id: n.id, deckId, guid: n.guid || `anki-${n.id}`, type, fields, tags: n.tags.split(/\s+/).filter(Boolean), position: pos++, createdAt: created, updatedAt: created });
    for (const c of ncards) {
      if (type === "basic" && c.ord > 0) continue;
      const review = c.type === 2 && c.ivl > 0;
      const dueMs = col.crt ? (col.crt + c.due * 86400) * 1000 : Date.now();
      cards.push({
        id: c.id, noteId: n.id, deckId: didToDeck.get(c.did) ?? deckId, homeDeckId: null, ord: type === "cloze" ? c.ord + 1 : c.ord,
        state: review ? "review" : "new", due: new Date(review ? dueMs : 0).toISOString(),
        stability: review ? Math.max(0.5, c.ivl) : 0, difficulty: review ? 5 : 0, elapsedDays: 0, scheduledDays: review ? c.ivl : 0,
        reps: review ? c.reps : 0, lapses: review ? c.lapses : 0, step: 0, lastReview: review ? new Date(dueMs - c.ivl * 86400000).toISOString() : null,
        ease: review ? c.factor / 1000 : 0, box: 0, suspended: c.queue === -1, buriedDay: null, flag: 0, leech: false, position: pos, createdAt: created,
      });
    }
  }
  const media: MediaRecord[] = [...col.media.entries()].map(([name, data], i) => ({ id: i + 1, url: ANKI_MEDIA_PREFIX + name, filename: name, contentType: mimeFromName(name), size: data.length, data: bytesToBase64(data) }));
  const tags = [...new Set(notes.flatMap((n) => n.tags))];
  return createBackup({ exportedAt: now, settings: {}, tags, decks, notes, cards, revlog: [], media });
}
