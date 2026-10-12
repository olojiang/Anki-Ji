import type { Algorithm, DeckConfig, Rating, SchedState } from "../types";
import type { Scheduler } from "./index";

export abstract class BaseScheduler implements Scheduler {
  abstract readonly id: Algorithm;
  constructor(protected cfg: DeckConfig) {}
  abstract next(card: SchedState, rating: Rating, now: Date): SchedState;
  preview(card: SchedState, now: Date): Record<Rating, SchedState> {
    return { 1: this.next(card, 1, now), 2: this.next(card, 2, now), 3: this.next(card, 3, now), 4: this.next(card, 4, now) };
  }
  /** Exponential approximation used by interval-based schedulers (R = 0.9 at the due date). */
  retrievability(card: SchedState, now: Date): number | null {
    if (card.state === "new" || !card.lastReview) return null;
    const ivl = Math.max(card.scheduledDays, 1 / 1440);
    const elapsed = Math.max(0, (now.getTime() - card.lastReview.getTime()) / 86_400_000);
    return Math.pow(0.9, elapsed / ivl);
  }
}

export function newCardState(): SchedState {
  return { state: "new", due: new Date(0), stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, step: 0, lastReview: null, ease: 0, box: 0 };
}

export const minutesFrom = (now: Date, m: number) => new Date(now.getTime() + Math.round(m * 60000));
export const daysFrom = (now: Date, d: number) => new Date(now.getTime() + d * 86_400_000);
