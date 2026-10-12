/** Daily goal progress + goal streak (pure). */
export interface Goal { type: "cards" | "minutes"; target: number }
export interface DayWork { reviews: number; ms: number }

export function goalProgress(goal: Goal, work: DayWork) {
  const done = goal.type === "minutes" ? Math.floor(work.ms / 60000) : work.reviews;
  const target = Math.max(0, goal.target);
  return { done, target, ratio: target > 0 ? Math.min(1, done / target) : 1, met: done >= target };
}

/** Consecutive days meeting the goal, ending today (if met) or yesterday (if today is still in progress). */
export function goalStreak(days: Map<number, DayWork>, today: number, goal: Goal): number {
  const met = (d: number) => { const w = days.get(d); return !!w && (w.reviews > 0 || w.ms > 0) && goalProgress(goal, w).met; };
  let d = met(today) ? today : today - 1;
  let n = 0;
  while (met(d)) { n++; d--; }
  return n;
}
