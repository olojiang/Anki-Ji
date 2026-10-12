/**
 * Extra fidelity for .apkg import, kept separate from apkg.ts: learning/relearning state, FSRS memory
 * state (card.data JSON), flags, review history (revlog), and the type-in / optional-reverse stock models.
 * Works on the Backup produced by apkgToBackup, which keeps Anki note & card ids as record ids.
 */
import JSZip from "jszip";
import { decompress } from "fzstd";
import type { SqlJsStatic, Database } from "sql.js";
import type { Backup, RevlogRecord } from "./backup";
import type { CardState, NoteFields, NoteType } from "../types";
import { convertAnkiField } from "./apkg";

export interface ApkgExtras {
  crt: number;
  models: Map<number, { name: string; fieldNames: string[]; typeIn: boolean }>;
  notes: Map<number, { mid: number; flds: string }>;
  cards: Map<number, { type: number; queue: number; due: number; ivl: number; factor: number; reps: number; lapses: number; flags: number; data: string }>;
  revlog: { id: number; cid: number; ease: number; ivl: number; time: number; type: number }[];
}

const isZstd = (b: Uint8Array) => b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;
function rows<T>(db: Database, sql: string): T[] {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])) as T);
}
const hasColumn = (db: Database, table: string, col: string) => rows<{ name: string }>(db, `PRAGMA table_info(${table})`).some((r) => r.name === col);
const hasTable = (db: Database, name: string) => rows<{ n: number }>(db, `SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='${name}'`)[0]?.n > 0;

export async function readApkgExtras(bytes: Uint8Array, SQL: SqlJsStatic): Promise<ApkgExtras> {
  const zip = await JSZip.loadAsync(bytes);
  const pick = zip.file("collection.anki21b") ?? zip.file("collection.anki21") ?? zip.file("collection.anki2");
  if (!pick) throw new Error("not_apkg");
  let raw = await pick.async("uint8array");
  if (isZstd(raw)) raw = decompress(raw);
  const db = new SQL.Database(raw);
  try {
    const col = rows<{ crt: number; models: string }>(db, "SELECT crt, models FROM col")[0];
    const models: ApkgExtras["models"] = new Map();
    if (hasTable(db, "notetypes")) {
      for (const nt of rows<{ id: number; name: string }>(db, "SELECT id, name FROM notetypes")) {
        const fieldNames = rows<{ name: string }>(db, `SELECT name FROM fields WHERE ntid=${nt.id} ORDER BY ord`).map((f) => f.name);
        const tmpls = rows<{ config: Uint8Array }>(db, `SELECT config FROM templates WHERE ntid=${nt.id} ORDER BY ord`);
        const typeIn = tmpls.some((t) => new TextDecoder().decode(t.config ?? new Uint8Array()).includes("{{type:"));
        models.set(Number(nt.id), { name: String(nt.name), fieldNames, typeIn });
      }
    } else if (col?.models) {
      for (const m of Object.values(JSON.parse(col.models || "{}")) as { id: number; name: string; flds: { name: string; ord: number }[]; tmpls: { qfmt?: string }[] }[]) {
        models.set(Number(m.id), { name: m.name, fieldNames: [...(m.flds ?? [])].sort((a, b) => a.ord - b.ord).map((f) => f.name), typeIn: (m.tmpls ?? []).some((t) => String(t.qfmt ?? "").includes("{{type:")) });
      }
    }
    const notes: ApkgExtras["notes"] = new Map(rows<{ id: number; mid: number; flds: string }>(db, "SELECT id, mid, flds FROM notes").map((n) => [Number(n.id), { mid: Number(n.mid), flds: String(n.flds) }]));
    const dataCol = hasColumn(db, "cards", "data") ? "data" : "'' AS data";
    const cards: ApkgExtras["cards"] = new Map(
      rows<{ id: number; type: number; queue: number; due: number; ivl: number; factor: number; reps: number; lapses: number; flags: number; data: string }>(db, `SELECT id, type, queue, due, ivl, factor, reps, lapses, flags, ${dataCol} FROM cards`)
        .map((c) => [Number(c.id), { type: Number(c.type), queue: Number(c.queue), due: Number(c.due), ivl: Number(c.ivl), factor: Number(c.factor), reps: Number(c.reps), lapses: Number(c.lapses), flags: Number(c.flags), data: String(c.data ?? "") }]),
    );
    const revlog = hasTable(db, "revlog")
      ? rows<{ id: number; cid: number; ease: number; ivl: number; time: number; type: number }>(db, "SELECT id, cid, ease, ivl, time, type FROM revlog ORDER BY id").map((r) => ({ id: Number(r.id), cid: Number(r.cid), ease: Number(r.ease), ivl: Number(r.ivl), time: Number(r.time), type: Number(r.type) }))
      : [];
    return { crt: Number(col?.crt ?? 0), models, notes, cards, revlog };
  } finally {
    db.close();
  }
}

function parseData(s: string): { s?: number; d?: number } {
  if (!s || s[0] !== "{") return {};
  try { const o = JSON.parse(s); return { s: Number.isFinite(o.s) ? Number(o.s) : undefined, d: Number.isFinite(o.d) ? Number(o.d) : undefined }; } catch { return {}; }
}

/** Apply the extras to the backup built by apkgToBackup (mutates a copy). */
export function enrichApkgBackup(input: Backup, x: ApkgExtras): Backup {
  const b: Backup = { ...input, notes: input.notes.map((n) => ({ ...n })), cards: input.cards.map((c) => ({ ...c })), revlog: [...input.revlog] };
  const dayMs = (day: number) => (x.crt + day * 86400) * 1000;

  // note types the base importer flattens to Basic
  const cardOrds = new Map<number, number[]>();
  for (const c of b.cards) (cardOrds.get(c.noteId) ?? cardOrds.set(c.noteId, []).get(c.noteId)!).push(c.ord);
  for (const n of b.notes) {
    const an = x.notes.get(n.id); const m = an ? x.models.get(an.mid) : undefined;
    if (!an || !m) continue;
    const f = an.flds.split("\x1f").map(convertAnkiField);
    let type: NoteType | null = null; let fields: NoteFields | null = null;
    if (m.fieldNames.length === 3 && /^add reverse$/i.test(m.fieldNames[2])) {
      type = "basic_optional_reverse";
      fields = { front: f[0] ?? "", back: f[1] ?? "", addReverse: !!(f[2] ?? "").trim() || (cardOrds.get(n.id) ?? []).includes(1) };
    } else if (m.typeIn && n.type === "basic") {
      type = "type_in"; fields = { front: f[0] ?? "", back: f[1] ?? "" };
    }
    if (type && fields) { n.type = type; n.fields = fields; }
  }

  // review history
  const cardById = new Map(b.cards.map((c) => [c.id, c]));
  const seen = new Set<number>();
  const lastAt = new Map<number, number>();
  let rid = 1;
  for (const r of x.revlog) {
    const card = cardById.get(r.cid);
    if (!card || r.type === 4 || r.ease < 1 || r.ease > 4) continue; // manual reschedules carry no rating
    const at = r.id;
    const state: CardState = r.type === 0 ? (seen.has(r.cid) ? "learning" : "new") : r.type === 2 ? "relearning" : "review";
    seen.add(r.cid);
    lastAt.set(r.cid, at);
    const scheduledDays = r.ivl > 0 ? r.ivl : 0;
    const rec: RevlogRecord = {
      id: rid++, cardId: r.cid, deckId: card.homeDeckId ?? card.deckId, rating: r.ease, state, due: new Date(at + (r.ivl > 0 ? r.ivl * 86400000 : -r.ivl * 1000)).toISOString(),
      stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays, durationMs: Math.max(0, r.time), reviewedAt: new Date(at).toISOString(), algorithm: "fsrs",
    };
    b.revlog.push(rec);
  }

  // card scheduling details
  for (const c of b.cards) {
    const ac = x.cards.get(c.id);
    if (!ac) continue;
    c.flag = ac.flags & 7;
    if (ac.type === 1 || ac.type === 3) {
      c.state = ac.type === 1 ? "learning" : "relearning";
      c.due = new Date(ac.queue === 3 || ac.due < 1_000_000_000 ? dayMs(ac.due) : ac.due * 1000).toISOString();
      c.reps = ac.reps; c.lapses = ac.lapses; c.scheduledDays = ac.type === 3 ? Math.max(0, ac.ivl) : 0;
      c.ease = ac.factor > 0 ? ac.factor / 1000 : 0;
    }
    if (c.state !== "new") {
      const mem = parseData(ac.data);
      if (mem.s != null && mem.s > 0) c.stability = mem.s;
      if (mem.d != null && mem.d >= 1 && mem.d <= 10) c.difficulty = mem.d;
      const last = lastAt.get(c.id);
      if (last) c.lastReview = new Date(last).toISOString();
    }
  }
  return b;
}
