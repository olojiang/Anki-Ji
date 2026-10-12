import { authed, body, HttpError } from "@/server/http";
import { importNoteTypes } from "@/server/repo/notetypes";
import type { NoteTypeDef } from "@/core/notetypes";

/** POST { noteTypes } → { noteTypeMap }: source note type id → the user's (created or reused) note type id. */
export const POST = authed(async (req, { uid }) => {
  const b = await body<{ noteTypes?: Partial<NoteTypeDef>[] }>(req);
  if ((b.noteTypes?.length ?? 0) > 200) throw new HttpError(400, "chunk_too_large");
  return { noteTypeMap: await importNoteTypes(uid, Array.isArray(b.noteTypes) ? b.noteTypes : []) };
});
