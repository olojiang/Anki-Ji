import { authed, body, HttpError } from "@/server/http";
import { importBackupNotes } from "@/server/services/backup";
import { nestNotes, toCardRecord, toNoteRecord, toRevlogRecord } from "@/core/io/backup";

export const maxDuration = 60;

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ notes: Record<string, unknown>[]; cards: Record<string, unknown>[]; revlog: Record<string, unknown>[]; deckMap: Record<string, number>; tags?: string[] }>(req);
  if ((b.notes?.length ?? 0) > 1000) throw new HttpError(400, "chunk_too_large");
  const nested = nestNotes({ notes: (b.notes ?? []).map(toNoteRecord), cards: (b.cards ?? []).map(toCardRecord), revlog: (b.revlog ?? []).map(toRevlogRecord) });
  const map: Record<number, number> = {};
  for (const [k, v] of Object.entries(b.deckMap ?? {})) map[Number(k)] = Number(v);
  return importBackupNotes(uid, nested, map);
});
