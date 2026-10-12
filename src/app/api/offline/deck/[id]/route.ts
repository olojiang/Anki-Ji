import { authed, intParam, HttpError } from "@/server/http";
import { buildOfflinePack } from "@/server/services/sync";

/** Today's queue of a deck (cards, notes, configs, counters, media urls) for offline study. */
export const GET = authed(async (_req, { uid, params }) => {
  const p = await buildOfflinePack(uid, intParam(params.id));
  if (!p) throw new HttpError(404, "deck_not_found");
  return p;
});
