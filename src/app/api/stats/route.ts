import { authed } from "@/server/http";
import { getStats } from "@/server/services/stats";

export const GET = authed(async (req, { uid }) => {
  const d = req.nextUrl.searchParams.get("deckId");
  return getStats(uid, d ? Number(d) : null);
});
