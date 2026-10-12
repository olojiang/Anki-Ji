import { authed, intParam, HttpError } from "@/server/http";
import { getStudyState } from "@/server/services/study";

export const GET = authed(async (_req, { uid, params }) => {
  const s = await getStudyState(uid, intParam(params.deckId));
  if (!s) throw new HttpError(404, "deck_not_found");
  return s;
});
