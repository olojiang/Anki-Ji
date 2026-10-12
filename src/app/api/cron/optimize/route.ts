import { cronRoute } from "@/server/cron";
import { autoOptimizeCandidates, autoOptimizeUser } from "@/server/services/autoopt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Vercel Cron (daily): re-train FSRS parameters for decks that qualify (≥400 new reviews and ≥7 days). */
export const GET = cronRoute(async () => {
  const deadline = Date.now() + 50_000;
  const out: { uid: number; ran: number; adopted: number }[] = [];
  for (const uid of await autoOptimizeCandidates()) {
    if (Date.now() > deadline) break;
    const r = await autoOptimizeUser(uid, { deadline });
    out.push({ uid, ran: r.filter((x) => x.ran).length, adopted: r.filter((x) => x.adopted).length });
  }
  return { users: out.length, results: out };
});
