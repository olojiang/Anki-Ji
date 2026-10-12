import { authed, body } from "@/server/http";
import { answer, getStudyState } from "@/server/services/study";
import type { Rating } from "@/core/types";

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ cardId: number; rating: Rating; durationMs?: number; deckId?: number }>(req);
  const res = await answer(uid, Number(b.cardId), Number(b.rating) as Rating, Number(b.durationMs) || 0);
  const next = b.deckId ? await getStudyState(uid, Number(b.deckId)) : null;
  return { leech: res.leech, next };
});
