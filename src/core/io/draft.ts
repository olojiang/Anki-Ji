/**
 * Normalized intermediate format shared by every "flat" importer (CSV, Excel, Markdown/Obsidian, Mochi, RemNote,
 * Quizlet, SuperMemo, Mnemosyne, smart paste). Parsers produce an ImportDraft; draftToBackup turns it into the
 * backup envelope so all formats reuse the one batch import pipeline (decks → notes → cards, media upload).
 */
import type { NoteFields, NoteType } from "../types";
import { cardOrdinals, stripMarkup } from "../notes";
import { splitPath } from "../tree";
import { createBackup, type Backup, type DeckRecord, type MediaRecord, type NoteRecord } from "./backup";
import { bytesToBase64, mimeFromName } from "./base64";

export interface DraftNote { deckPath: string; type: NoteType; fields: NoteFields; tags: string[]; guid?: string; rule?: string }
export interface DraftMedia { name: string; data: Uint8Array; contentType?: string }
export interface DraftIssue { row?: number; message: string }
export interface ImportDraft { format: string; notes: DraftNote[]; media: DraftMedia[]; errors: DraftIssue[]; warnings: string[] }

export const newDraft = (format: string): ImportDraft => ({ format, notes: [], media: [], errors: [], warnings: [] });

/** Placeholder URL for a bundled media file; rewritten to the uploaded URL at import time. */
export const IMPORT_MEDIA_PREFIX = "import-media:";
export const mediaRef = (name: string) => IMPORT_MEDIA_PREFIX + name.replace(/[\s()]/g, (c) => encodeURIComponent(c));

/** 2×32-bit cyrb53-style hash → short base36 string (sync, works in browser and node). */
export function hashString(s: string): string {
  const h = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  return h(0) + h(7);
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(typeof v === "string" ? v.trim() : v ?? null);
}

/** Content identity of a note (type + fields), so re-importing the same material is skipped by guid. */
export function noteGuid(n: DraftNote): string {
  return n.guid || `imp-${hashString(`${n.type}|${canonical(n.fields)}`)}`;
}

function fieldStrings(f: NoteFields): string[] {
  return Object.values(f).flatMap((v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string")
    : v && typeof v === "object" ? Object.values(v).filter((x): x is string => typeof x === "string") : []));
}

export function draftToBackup(d: ImportDraft, now = new Date().toISOString()): { backup: Backup; duplicates: number } {
  const decks: DeckRecord[] = [];
  const pathId = new Map<string, number>();
  const ensure = (path: string) => {
    let parent: number | null = null, acc = "";
    for (const s of splitPath(path || "Default")) {
      acc = acc ? `${acc}::${s.toLowerCase()}` : s.toLowerCase();
      let id = pathId.get(acc);
      if (id == null) { id = decks.length + 1; pathId.set(acc, id); decks.push({ id, parentId: parent, name: s, position: id, config: {}, filtered: false, filter: null, createdAt: now }); }
      parent = id;
    }
    return parent!;
  };
  const seen = new Set<string>();
  const notes: NoteRecord[] = [];
  let duplicates = 0;
  for (const n of d.notes) {
    const guid = noteGuid(n);
    if (seen.has(guid)) { duplicates++; continue; }
    seen.add(guid);
    const i = notes.length + 1;
    notes.push({ id: i, deckId: ensure(n.deckPath), guid, type: n.type, fields: n.fields, tags: [...new Set(n.tags)], position: i, createdAt: now, updatedAt: now });
  }
  const text = notes.flatMap((n) => fieldStrings(n.fields)).join("\n");
  const media: MediaRecord[] = [];
  const names = new Set<string>();
  for (const m of d.media) {
    const url = mediaRef(m.name);
    if (names.has(url) || !text.includes(url)) continue;
    names.add(url);
    media.push({ id: media.length + 1, url, filename: m.name.split("/").pop() || m.name, contentType: m.contentType || mimeFromName(m.name), size: m.data.length, data: bytesToBase64(m.data) });
  }
  return { backup: createBackup({ exportedAt: now, decks, notes, cards: [], revlog: [], tags: notes.flatMap((n) => n.tags), media }), duplicates };
}

/** Media that still has to be uploaded: referenced by a note that is not already in the collection (or by no note at all). */
export function mediaNeededFor(b: Backup, existingGuids: Set<string>): MediaRecord[] {
  const texts = b.notes.map((n) => ({ fresh: !existingGuids.has(n.guid), text: fieldStrings(n.fields).join("\n") }));
  return b.media.filter((m) => {
    const users = texts.filter((t) => t.text.includes(m.url));
    return !users.length || users.some((t) => t.fresh);
  });
}

export interface ImportPreview {
  format: string; notes: number; cards: number; decks: string[]; media: number; duplicates: number; existing: number;
  errors: DraftIssue[]; warnings: string[];
  samples: { deck: string; type: NoteType; front: string; back: string; tags: string[] }[];
}

const plain = (s: string) => stripMarkup(s.replace(/\{\{c\d+::((?:(?!\{\{|\}\}).)*?)(?:::(?:(?!\{\{|\}\}).)*?)?\}\}/g, "[$1]")).replace(/\s+/g, " ").trim();
const plainDeep = (s: string) => { let prev = ""; let cur = s; while (cur !== prev) { prev = cur; cur = cur.replace(/\{\{c\d+::((?:(?!\{\{|\}\}).)*?)(?:::(?:(?!\{\{|\}\}).)*?)?\}\}/g, "[$1]"); } return plain(cur); };

export function sampleSides(type: NoteType, f: NoteFields): { front: string; back: string } {
  switch (type) {
    case "cloze": return { front: plainDeep(f.text ?? ""), back: plain(f.extra ?? "") };
    case "mcq": return { front: plain(f.question ?? ""), back: (f.options ?? []).map(plain).join(" | ") };
    case "image_occlusion": return { front: plain(f.header ?? ""), back: plain(f.extra ?? "") };
    case "custom": { const v = Object.values(f.custom ?? {}); return { front: plainDeep(v[0] ?? ""), back: plain(v.slice(1).join(" · ")) }; }
    default: return { front: plain(f.front ?? ""), back: plain(f.back ?? "") };
  }
}

export function previewImport(b: Backup, extra: { format?: string; duplicates?: number; errors?: DraftIssue[]; warnings?: string[]; existingGuids?: Set<string>; samples?: number } = {}): ImportPreview {
  const byId = new Map(b.decks.map((d) => [d.id, d]));
  const path = (id: number) => { const parts: string[] = []; let cur = byId.get(id); const g = new Set<number>(); while (cur && !g.has(cur.id)) { g.add(cur.id); parts.unshift(cur.name); cur = cur.parentId != null ? byId.get(cur.parentId) : undefined; } return parts.join("::"); };
  const cardsByNote = new Map<number, number>();
  for (const c of b.cards) cardsByNote.set(c.noteId, (cardsByNote.get(c.noteId) ?? 0) + 1);
  const cards = b.notes.reduce((s, n) => s + (cardsByNote.get(n.id) ?? cardOrdinals(n.type, n.fields).length), 0);
  return {
    format: extra.format ?? "backup", notes: b.notes.length, cards, decks: b.decks.map((d) => path(d.id)).sort((a, c) => a.localeCompare(c)), media: b.media.length,
    duplicates: extra.duplicates ?? 0, existing: extra.existingGuids ? b.notes.filter((n) => extra.existingGuids!.has(n.guid)).length : 0,
    errors: extra.errors ?? [], warnings: extra.warnings ?? [],
    samples: b.notes.slice(0, extra.samples ?? 6).map((n) => ({ deck: path(n.deckId), type: n.type, ...sampleSides(n.type, n.fields), tags: n.tags })),
  };
}
