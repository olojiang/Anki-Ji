import { authed, body, ids, HttpError } from "@/server/http";
import { mergeDuplicates, deleteDuplicates, type MergeGroup } from "@/server/services/batch";

/** { action: "merge", groups: [{ keepId, removeIds, scheduling }] } | { action: "delete", noteIds } */
export const POST = authed(async (req, { uid }) => {
  const b = await body<{ action?: string; groups?: MergeGroup[]; noteIds?: number[] }>(req);
  if (b.action === "delete") return deleteDuplicates(uid, ids(b.noteIds));
  if (b.action !== "merge" && b.action !== undefined) throw new HttpError(400, "unknown_action");
  const groups = (Array.isArray(b.groups) ? b.groups : []).map((g) => ({
    keepId: Number(g.keepId), removeIds: ids(g.removeIds), scheduling: g.scheduling === "best" ? "best" as const : "keep" as const,
  })).filter((g) => Number.isInteger(g.keepId));
  return mergeDuplicates(uid, groups);
});
