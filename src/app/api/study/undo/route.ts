import { authed, body } from "@/server/http";
import { undoLast, getStudyState } from "@/server/services/study";

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ deckId?: number }>(req);
  const undone = await undoLast(uid);
  return { undone, next: b.deckId ? await getStudyState(uid, Number(b.deckId)) : null };
});
