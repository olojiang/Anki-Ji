"use client";
import { api, uploadFile } from "./api";
import { chunk, rewriteBackupMedia, type Backup } from "@/core/io/backup";
import { base64ToBytes, bytesToBase64, mimeFromName } from "@/core/io/base64";
import { mediaNeededFor, previewImport } from "@/core/io/draft";
import type { ImportOptions, ParsedImport, PasteFormat } from "@/core/io/registry";

export type Progress = (msg: { key: string; vars?: Record<string, string | number> }) => void;

/** Download a full JSON backup; media bytes are fetched by the browser and embedded as base64. */
export async function buildFullBackup(withMedia: boolean, progress: Progress): Promise<Backup> {
  const b = await api<Backup>("/api/export?format=json");
  if (withMedia) {
    for (const [i, m] of b.media.entries()) {
      progress({ key: "uploadingMedia", vars: { i: i + 1, n: b.media.length } });
      try {
        if (m.url.startsWith("data:")) { m.data = m.url.split(",")[1]; continue; }
        const res = await fetch(m.url);
        if (res.ok) m.data = bytesToBase64(new Uint8Array(await res.arrayBuffer()));
      } catch { /* keep URL only */ }
    }
  }
  return b;
}

const loadSqlJs = async () => {
  const { default: initSqlJs } = await import("sql.js");
  return initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
};

/** Parse any supported file (format detected by extension + content) into the common backup shape + preview. */
export async function fileToImport(file: File, opts: Omit<ImportOptions, "loadSqlJs">): Promise<ParsedImport> {
  const { parseImportFile } = await import("@/core/io/registry");
  return parseImportFile(file.name, new Uint8Array(await file.arrayBuffer()), { ...opts, loadSqlJs });
}

/** Parse pasted text with a paste preset. */
export async function textToImport(format: PasteFormat, text: string, opts: Omit<ImportOptions, "loadSqlJs">): Promise<ParsedImport> {
  const { parseImportText } = await import("@/core/io/registry");
  return parseImportText(format, text, opts);
}

/** Back-compat wrapper. */
export async function fileToBackup(file: File, defaultDeck: string): Promise<{ backup: Backup; errors: number }> {
  const p = await fileToImport(file, { defaultDeck });
  return { backup: p.backup, errors: p.errors.length };
}

/** Which of the backup's notes the user already has (server-side, chunked). */
export async function existingGuids(b: Backup): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunk(b.notes.map((n) => n.guid).filter(Boolean), 5000)) {
    const r = await api<{ existing: string[] }>("/api/import/guids", { body: { guids: part } });
    r.existing.forEach((g) => out.add(g));
  }
  return out;
}

/** Recompute the preview including how many notes are already in the collection. */
export async function withExisting(p: ParsedImport): Promise<ParsedImport> {
  try {
    const existing = await existingGuids(p.backup);
    return { ...p, preview: previewImport(p.backup, { format: p.format, duplicates: p.duplicates, errors: p.errors, warnings: p.warnings, existingGuids: existing }) };
  } catch { return p; }
}

/** Upload media → rewrite URLs → create decks → import notes in chunks. */
export async function importBackup(b: Backup, progress: Progress) {
  const urlMap: Record<string, string> = {};
  // skip media that only already-imported notes use (re-import does not upload twice)
  let existing = new Set<string>();
  try { existing = await existingGuids(b); } catch { /* older server: upload everything */ }
  const withData = mediaNeededFor(b, existing).filter((m) => m.data);
  for (const [i, m] of withData.entries()) {
    progress({ key: "uploadingMedia", vars: { i: i + 1, n: withData.length } });
    try {
      const blob = new Blob([base64ToBytes(m.data!) as BlobPart], { type: m.contentType || mimeFromName(m.filename) });
      urlMap[m.url] = (await uploadFile(blob, m.filename)).url;
    } catch { /* skip broken media */ }
  }
  const backup = rewriteBackupMedia(b, urlMap);
  progress({ key: "importing" });
  const { deckMap } = await api<{ deckMap: Record<string, number> }>("/api/import/decks", { body: { decks: backup.decks } });
  const cardsByNote = new Map<number, typeof backup.cards>();
  for (const c of backup.cards) (cardsByNote.get(c.noteId) ?? cardsByNote.set(c.noteId, []).get(c.noteId)!).push(c);
  const revByCard = new Map<number, typeof backup.revlog>();
  for (const r of backup.revlog) (revByCard.get(r.cardId) ?? revByCard.set(r.cardId, []).get(r.cardId)!).push(r);
  const total = { notes: 0, cards: 0, revlog: 0, skipped: 0 };
  const parts = chunk(backup.notes, 250);
  for (const [i, notes] of parts.entries()) {
    progress({ key: "importing", vars: { i: i + 1, n: parts.length } });
    const cards = notes.flatMap((n) => cardsByNote.get(n.id) ?? []);
    const revlog = cards.flatMap((c) => revByCard.get(c.id) ?? []);
    const r = await api<typeof total>("/api/import/notes", { body: { notes, cards, revlog, deckMap } });
    total.notes += r.notes; total.cards += r.cards; total.revlog += r.revlog; total.skipped += r.skipped;
  }
  return total;
}
