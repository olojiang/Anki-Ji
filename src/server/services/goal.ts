import { q } from "../db";
import { userContext } from "./context";
import { getPrefs } from "./prefs";
import { goalProgress, goalStreak, type DayWork } from "@/core/goal";

/** Today's progress toward the daily goal + consecutive days the goal was met. */
export async function goalStatus(uid: number) {
  const ctx = await userContext(uid);
  const prefs = await getPrefs(uid);
  const rows = await q(
    `SELECT day, count(*)::int AS n, COALESCE(sum(LEAST(GREATEST(duration_ms, 0), 60000)), 0)::float AS ms
     FROM ak_revlog WHERE user_id = $1 AND day > $2 GROUP BY day`, [uid, ctx.today - 400]);
  const days = new Map<number, DayWork>(rows.map((r) => [Number(r.day), { reviews: Number(r.n), ms: Number(r.ms) }]));
  const goal = { type: prefs.goalType, target: prefs.goalTarget };
  const today = days.get(ctx.today) ?? { reviews: 0, ms: 0 };
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = ctx.today - 6 + i;
    const w = days.get(d) ?? { reviews: 0, ms: 0 };
    return { day: d, ...goalProgress(goal, w) };
  });
  return { goal, today: { ...goalProgress(goal, today), reviews: today.reviews, minutes: Math.floor(today.ms / 60000) }, streak: goalStreak(days, ctx.today, goal), last7, todayIndex: ctx.today };
}
