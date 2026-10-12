import { authed, body } from "@/server/http";
import { findDuplicateGroups } from "@/server/services/batch";
import type { DupScope } from "@/core/batch";
import type { NoteType } from "@/core/types";

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ scope?: DupScope; deckId?: number | null; query?: string; type?: NoteType }>(req);
  const scope: DupScope = b.scope === "deck" || b.scope === "type" ? b.scope : "collection";
  const groups = await findDuplicateGroups(uid, { scope, deckId: b.deckId == null ? undefined : Number(b.deckId), query: b.query || undefined, type: b.type || undefined });
  return { groups };
});
