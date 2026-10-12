import { authed, body, intParam, HttpError } from "@/server/http";
import { getNote, updateNote, softDeleteNotes } from "@/server/repo/notes";
import { revlogForCards } from "@/server/repo/revlog";
import type { NoteFields, NoteType } from "@/core/types";

export const GET = authed(async (_req, { uid, params }) => {
  const note = await getNote(uid, intParam(params.id));
  if (!note) throw new HttpError(404, "note_not_found");
  const history = await revlogForCards(uid, note.cards.map((c) => c.id));
  return { note, history };
});

export const PATCH = authed(async (req, { uid, params }) => {
  const b = await body<{ fields?: NoteFields; tags?: string[]; deckId?: number; type?: NoteType }>(req);
  const ok = await updateNote(uid, intParam(params.id), b);
  if (!ok) throw new HttpError(404, "note_not_found");
  return { note: await getNote(uid, intParam(params.id)) };
});

export const DELETE = authed(async (_req, { uid, params }) => {
  await softDeleteNotes(uid, [intParam(params.id)]);
  return { ok: true };
});
