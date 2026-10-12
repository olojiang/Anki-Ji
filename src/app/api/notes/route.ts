import { authed, body } from "@/server/http";
import { createNote } from "@/server/repo/notes";
import { searchNotes, type BrowseSort } from "@/server/services/browse";
import type { NoteFields, NoteType } from "@/core/types";

export const GET = authed(async (req, { uid }) => {
  const sp = req.nextUrl.searchParams;
  const rows = await searchNotes(uid, sp.get("q") ?? "", { sort: (sp.get("sort") as BrowseSort) ?? "manual", limit: Math.min(5000, Number(sp.get("limit")) || 2000) });
  return { rows };
});

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ deckId: number; type: NoteType; fields: NoteFields; tags?: string[]; notetypeId?: number | null }>(req);
  const note = await createNote(uid, { deckId: Number(b.deckId), type: b.type, fields: b.fields, tags: b.tags ?? [], notetypeId: b.notetypeId ?? null });
  return { note };
});
