"use client";
import { api, uploadFile } from "./api";
import { chunk, parseBackup, rewriteBackupMedia, type Backup } from "@/core/io/backup";
import { base64ToBytes, bytesToBase64, mimeFromName } from "@/core/io/base64";
import { detectDelimiter, flatToBackup, parseDelimited, rowsToNotes } from "@/core/io/csv";

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

/** Parse any supported file into the common backup shape. */
export async function fileToBackup(file: File, defaultDeck: string): Promise<{ backup: Backup; errors: number }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".apkg") || name.endsWith(".colpkg")) {
    const [{ default: initSqlJs }, { readApkg, apkgToBackup }] = await Promise.all([import("sql.js"), import("@/core/io/apkg")]);
    const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
    const col = await readApkg(new Uint8Array(await file.arrayBuffer()), SQL);
    return { backup: apkgToBackup(col), errors: 0 };
  }
  const text = await file.text();
  if (name.endsWith(".json")) return { backup: parseBackup(text), errors: 0 };
  const delim = name.endsWith(".tsv") ? "\t" : name.endsWith(".csv") ? (detectDelimiter(text) === ";" ? ";" : ",") : detectDelimiter(text);
  const { notes, errors } = rowsToNotes(parseDelimited(text, delim), { defaultDeck });
  return { backup: flatToBackup(notes), errors: errors.length };
}

/** Upload media → rewrite URLs → create decks → import notes in chunks. */
export async function importBackup(b: Backup, progress: Progress) {
  const urlMap: Record<string, string> = {};
  const withData = b.media.filter((m) => m.data);
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
