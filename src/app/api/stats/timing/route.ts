import { authed } from "@/server/http";
import { timingStats } from "@/server/services/timing";
export const GET = authed(async (req, { uid }) => {
  const d = req.nextUrl.searchParams.get("deckId");
  return timingStats(uid, d ? Number(d) : null);
});
