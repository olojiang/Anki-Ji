import { authed, body, ids } from "@/server/http";
import { findReplace } from "@/server/services/batch";

/** Find & replace across selected notes (noteIds) or all search results (query). preview=true only counts. */
export const POST = authed(async (req, { uid }) => {
  const b = await body<{ noteIds?: number[]; query?: string; find: string; replace?: string; regex?: boolean; caseSensitive?: boolean; fields?: string[] | "all"; preview?: boolean }>(req);
  const target = Array.isArray(b.noteIds) ? { noteIds: ids(b.noteIds) } : { query: String(b.query ?? "") };
  const fields = Array.isArray(b.fields) ? b.fields.map(String) : "all";
  return findReplace(uid, target, { find: String(b.find ?? ""), replace: String(b.replace ?? ""), regex: !!b.regex, caseSensitive: !!b.caseSensitive, fields }, !!b.preview);
});
