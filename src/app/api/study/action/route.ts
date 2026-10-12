import { authed, body, HttpError } from "@/server/http";
import { buryCard, getStudyState } from "@/server/services/study";
import { setSuspended, setFlag, getCard } from "@/server/repo/cards";

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ cardId: number; action: "suspend" | "bury" | "buryNote" | "flag"; flag?: number; deckId?: number }>(req);
  const id = Number(b.cardId);
  if (!(await getCard(uid, id))) throw new HttpError(404, "card_not_found");
  if (b.action === "suspend") await setSuspended(uid, [id], true);
  else if (b.action === "bury") await buryCard(uid, id, false);
  else if (b.action === "buryNote") await buryCard(uid, id, true);
  else if (b.action === "flag") await setFlag(uid, [id], Number(b.flag) || 0);
  else throw new HttpError(400, "unknown_action");
  return { next: b.deckId ? await getStudyState(uid, Number(b.deckId)) : null };
});
