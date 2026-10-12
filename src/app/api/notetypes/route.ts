import { authed, body } from "@/server/http";
import { cloneNoteType, createNoteType, listAllNoteTypes } from "@/server/repo/notetypes";
import type { NoteTypeDef } from "@/core/notetypes";

/** GET → { noteTypes }: stock (read-only) types first, then the user's custom types. */
export const GET = authed(async (_req, { uid }) => ({ noteTypes: await listAllNoteTypes(uid) }));

/** POST { cloneOf, name } clones a stock ("stock:basic") or custom type; POST { noteType } creates one. */
export const POST = authed(async (req, { uid }) => {
  const b = await body<{ cloneOf?: number | string; name?: string; noteType?: Partial<NoteTypeDef> }>(req);
  if (b.cloneOf != null) return { noteType: await cloneNoteType(uid, b.cloneOf, String(b.name ?? "")) };
  return { noteType: await createNoteType(uid, b.noteType ?? {}) };
});
