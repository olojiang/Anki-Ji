import { authed } from "@/server/http";
import { autoOptimizeUser } from "@/server/services/autoopt";

export const maxDuration = 60;
const lastCheck = new Map<number, number>();
const THROTTLE_MS = 30 * 60_000;

/** Lazy trigger after a study session: cheap gating check, trains only when a deck qualifies. */
export const POST = authed(async (_req, { uid }) => {
  const now = Date.now();
  if (now - (lastCheck.get(uid) ?? 0) < THROTTLE_MS) return { throttled: true, results: [] };
  lastCheck.set(uid, now);
  const results = await autoOptimizeUser(uid, { deadline: now + 50_000 });
  return { throttled: false, results };
});
