import { authed, body, intParam, HttpError } from "@/server/http";
import { deleteNoteType, getNoteType, renameNoteType, updateNoteType } from "@/server/repo/notetypes";
import type { NoteTypeDef } from "@/core/notetypes";

export const GET = authed(async (_req, { uid, params }) => {
  const nt = await getNoteType(uid, intParam(params.id));
  if (!nt) throw new HttpError(404, "notetype_not_found");
  return { noteType: nt };
});

/** PUT { noteType } saves the whole definition and syncs the cards of every note of this type. */
export const PUT = authed(async (req, { uid, params }) => {
  const b = await body<{ noteType: Partial<NoteTypeDef> }>(req);
  return updateNoteType(uid, intParam(params.id), b.noteType ?? {});
});

/** PATCH { name } renames. */
export const PATCH = authed(async (req, { uid, params }) => {
  const b = await body<{ name?: string }>(req);
  await renameNoteType(uid, intParam(params.id), String(b.name ?? ""));
  return { noteType: await getNoteType(uid, intParam(params.id)) };
});

export const DELETE = authed(async (_req, { uid, params }) => {
  await deleteNoteType(uid, intParam(params.id));
  return { ok: true };
});
