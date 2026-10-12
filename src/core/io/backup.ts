import { z } from "zod";
import type { Algorithm, CardState, NoteFields, NoteType } from "../types";

export const BACKUP_FORMAT = "anki-ji-backup";
export const BACKUP_VERSION = 1;

export interface DeckRecord { id: number; parentId: number | null; name: string; position: number; config: Record<string, unknown>; filtered: boolean; filter: Record<string, unknown> | null; createdAt: string }
export interface NoteRecord { id: number; deckId: number; guid: string; type: NoteType; fields: NoteFields; tags: string[]; position: number; createdAt: string; updatedAt: string }
export interface CardRecord {
  id: number; noteId: number; deckId: number; homeDeckId: number | null; ord: number;
  state: CardState; due: string; stability: number; difficulty: number; elapsedDays: number; scheduledDays: number;
  reps: number; lapses: number; step: number; lastReview: string | null; ease: number; box: number;
  suspended: boolean; buriedDay: number | null; flag: number; leech: boolean; position: number; createdAt: string;
}
export interface RevlogRecord { id: number; cardId: number; deckId: number; rating: number; state: CardState; due: string; stability: number; difficulty: number; elapsedDays: number; scheduledDays: number; durationMs: number; reviewedAt: string; algorithm: Algorithm }
export interface MediaRecord { id: number; url: string; filename: string; contentType: string; size: number; data?: string /* base64 */ }

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  app: "anki-ji";
  exportedAt: string;
  settings: Record<string, unknown>;
  tags: string[];
  decks: DeckRecord[];
  notes: NoteRecord[];
  cards: CardRecord[];
  revlog: RevlogRecord[];
  media: MediaRecord[];
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === "string" ? v : new Date(Number(v) || 0).toISOString());
const isoOrNull = (v: unknown) => (v == null ? null : iso(v));
const n = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function toDeckRecord(d: Record<string, unknown>): DeckRecord {
  return { id: n(d.id), parentId: d.parentId == null ? null : n(d.parentId), name: String(d.name ?? ""), position: n(d.position), config: (d.config as Record<string, unknown>) ?? {}, filtered: !!d.filtered, filter: (d.filter as Record<string, unknown>) ?? null, createdAt: iso(d.createdAt) };
}
export function toNoteRecord(x: Record<string, unknown>): NoteRecord {
  return { id: n(x.id), deckId: n(x.deckId), guid: String(x.guid ?? ""), type: x.type as NoteType, fields: (x.fields as NoteFields) ?? {}, tags: (x.tags as string[]) ?? [], position: n(x.position), createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt ?? x.createdAt) };
}
export function toCardRecord(c: Record<string, unknown>): CardRecord {
  return {
    id: n(c.id), noteId: n(c.noteId), deckId: n(c.deckId), homeDeckId: c.homeDeckId == null ? null : n(c.homeDeckId), ord: n(c.ord),
    state: (c.state as CardState) ?? "new", due: iso(c.due), stability: n(c.stability), difficulty: n(c.difficulty), elapsedDays: n(c.elapsedDays), scheduledDays: n(c.scheduledDays),
    reps: n(c.reps), lapses: n(c.lapses), step: n(c.step), lastReview: isoOrNull(c.lastReview), ease: n(c.ease), box: n(c.box),
    suspended: !!c.suspended, buriedDay: c.buriedDay == null ? null : n(c.buriedDay), flag: n(c.flag), leech: !!c.leech, position: n(c.position), createdAt: iso(c.createdAt),
  };
}
export function toRevlogRecord(r: Record<string, unknown>): RevlogRecord {
  return { id: n(r.id), cardId: n(r.cardId), deckId: n(r.deckId), rating: n(r.rating), state: (r.state as CardState) ?? "new", due: iso(r.due), stability: n(r.stability), difficulty: n(r.difficulty), elapsedDays: n(r.elapsedDays), scheduledDays: n(r.scheduledDays), durationMs: n(r.durationMs), reviewedAt: iso(r.reviewedAt), algorithm: (r.algorithm as Algorithm) ?? "fsrs" };
}

export function createBackup(input: {
  exportedAt?: string; settings?: Record<string, unknown>; tags?: string[];
  decks: Record<string, unknown>[] | DeckRecord[]; notes: Record<string, unknown>[] | NoteRecord[]; cards: Record<string, unknown>[] | CardRecord[];
  revlog: Record<string, unknown>[] | RevlogRecord[]; media?: MediaRecord[];
}): Backup {
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, app: "anki-ji",
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    settings: input.settings ?? {},
    tags: [...new Set(input.tags ?? [])].sort(),
    decks: (input.decks as Record<string, unknown>[]).map(toDeckRecord),
    notes: (input.notes as Record<string, unknown>[]).map(toNoteRecord),
    cards: (input.cards as Record<string, unknown>[]).map(toCardRecord),
    revlog: (input.revlog as Record<string, unknown>[]).map(toRevlogRecord),
    media: input.media ?? [],
  };
}

const envelope = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  decks: z.array(z.object({ id: z.number(), name: z.string() }).passthrough()),
  notes: z.array(z.object({ id: z.number(), deckId: z.number(), type: z.string() }).passthrough()),
  cards: z.array(z.object({ id: z.number(), noteId: z.number() }).passthrough()),
}).passthrough();

/** Parse and validate a backup file (string or object). Throws with a readable message. */
export function parseBackup(input: string | unknown): Backup {
  let obj: unknown = input;
  if (typeof input === "string") {
    try { obj = JSON.parse(input); } catch { throw new Error("invalid_json"); }
  }
  const r = envelope.safeParse(obj);
  if (!r.success) throw new Error("invalid_backup");
  const o = r.data as Record<string, unknown>;
  return createBackup({
    exportedAt: String(o.exportedAt ?? ""), settings: (o.settings as Record<string, unknown>) ?? {}, tags: (o.tags as string[]) ?? [],
    decks: o.decks as Record<string, unknown>[], notes: o.notes as Record<string, unknown>[], cards: o.cards as Record<string, unknown>[],
    revlog: (o.revlog as Record<string, unknown>[]) ?? [], media: (o.media as MediaRecord[]) ?? [],
  });
}

/** Parents before children (so parent ids can be remapped first). Orphans become roots. */
export function orderDecks(decks: DeckRecord[]): DeckRecord[] {
  const ids = new Set(decks.map((d) => d.id));
  const out: DeckRecord[] = [];
  const done = new Set<number>();
  const visit = (d: DeckRecord, guard: Set<number>) => {
    if (done.has(d.id) || guard.has(d.id)) return;
    guard.add(d.id);
    if (d.parentId != null && ids.has(d.parentId)) visit(decks.find((x) => x.id === d.parentId)!, guard);
    done.add(d.id);
    out.push(d.parentId != null && !ids.has(d.parentId) ? { ...d, parentId: null } : d);
  };
  [...decks].sort((a, b) => a.position - b.position || a.id - b.id).forEach((d) => visit(d, new Set()));
  return out;
}

export type NestedNote = NoteRecord & { cards: (CardRecord & { revlog: RevlogRecord[] })[] };

export function nestNotes(b: Pick<Backup, "notes" | "cards" | "revlog">): NestedNote[] {
  const revByCard = new Map<number, RevlogRecord[]>();
  for (const r of b.revlog) (revByCard.get(r.cardId) ?? revByCard.set(r.cardId, []).get(r.cardId)!).push(r);
  const cardsByNote = new Map<number, (CardRecord & { revlog: RevlogRecord[] })[]>();
  for (const c of b.cards) (cardsByNote.get(c.noteId) ?? cardsByNote.set(c.noteId, []).get(c.noteId)!).push({ ...c, revlog: revByCard.get(c.id) ?? [] });
  return b.notes.map((nt) => ({ ...nt, cards: (cardsByNote.get(nt.id) ?? []).sort((a, b2) => a.ord - b2.ord) }));
}

/** Replace media URLs (exact string match) in every string field of a note. */
export function rewriteMediaInFields(fields: NoteFields, map: Record<string, string>): NoteFields {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  if (!keys.length) return fields;
  const rw = (s: string) => keys.reduce((acc, k) => acc.split(k).join(map[k]), s);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = typeof v === "string" ? rw(v) : Array.isArray(v) ? v.map((x) => (typeof x === "string" ? rw(x) : x)) : v;
  return out as NoteFields;
}

export function rewriteBackupMedia(b: Backup, map: Record<string, string>): Backup {
  return { ...b, notes: b.notes.map((nt) => ({ ...nt, fields: rewriteMediaInFields(nt.fields, map) })), media: b.media.map((m) => ({ ...m, url: map[m.url] ?? m.url, data: undefined })) };
}

/** Id-free canonical form, used to verify round-trips. */
export function normalizeForCompare(b: Backup) {
  const byId = new Map(b.decks.map((d) => [d.id, d]));
  const path = (id: number | null): string | null => {
    if (id == null) return null;
    const parts: string[] = [];
    let cur: DeckRecord | undefined = byId.get(id);
    const guard = new Set<number>();
    while (cur && !guard.has(cur.id)) { guard.add(cur.id); parts.unshift(cur.name); cur = cur.parentId != null ? byId.get(cur.parentId) : undefined; }
    return parts.join("::");
  };
  const guid = new Map(b.notes.map((nt) => [nt.id, nt.guid]));
  const cardKey = new Map(b.cards.map((c) => [c.id, `${guid.get(c.noteId)}#${c.ord}`]));
  const strip = <T extends object>(o: T, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
  const sortBy = <T>(arr: T[], f: (x: T) => string) => [...arr].sort((a, c) => f(a).localeCompare(f(c)));
  return {
    settings: b.settings, tags: [...b.tags].sort(),
    decks: sortBy(b.decks.map((d) => ({ ...strip(d, ["id", "parentId"]), path: path(d.id) })), (d) => String(d.path)),
    notes: sortBy(b.notes.map((nt) => ({ ...strip(nt, ["id", "deckId"]), deck: path(nt.deckId) })), (x) => String(x.guid)),
    cards: sortBy(b.cards.map((c) => ({ ...strip(c, ["id", "noteId", "deckId", "homeDeckId"]), key: cardKey.get(c.id), deck: path(c.deckId), home: path(c.homeDeckId) })), (x) => String(x.key)),
    revlog: sortBy(b.revlog.map((r) => ({ ...strip(r, ["id", "cardId", "deckId"]), card: cardKey.get(r.cardId), deck: path(r.deckId) })), (x) => `${x.card}${x.reviewedAt}`),
    media: sortBy(b.media.map((m) => strip(m, ["id"])), (m) => String(m.filename)),
  };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
