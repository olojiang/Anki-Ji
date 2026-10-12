import { authed, body, HttpError } from "@/server/http";
import { existingNoteGuids } from "@/server/services/backup";

/** POST { guids } → { existing }: which notes of an import are already in the collection (preview + skip their media). */
export const POST = authed(async (req, { uid }) => {
  const b = await body<{ guids: unknown[] }>(req);
  const guids = (Array.isArray(b.guids) ? b.guids : []).filter((g): g is string => typeof g === "string" && g.length > 0 && g.length < 200);
  if (guids.length > 5000) throw new HttpError(400, "chunk_too_large");
  return { existing: await existingNoteGuids(uid, guids) };
});
