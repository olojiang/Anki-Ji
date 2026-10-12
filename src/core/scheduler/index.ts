import type { Algorithm, DeckConfig, Rating, SchedState } from "../types";
export { BaseScheduler, newCardState, minutesFrom, daysFrom } from "./base";
import { FsrsScheduler } from "./fsrs";
import { Sm2Scheduler } from "./sm2";
import { LeitnerScheduler } from "./leitner";

/**
 * One interface for every algorithm. Schedulers are pure: they never touch the DB,
 * the clock or randomness (fuzz / load balancing are applied afterwards by core/answer).
 */
export interface Scheduler {
  readonly id: Algorithm;
  next(card: SchedState, rating: Rating, now: Date): SchedState;
  preview(card: SchedState, now: Date): Record<Rating, SchedState>;
  /** Probability of recall right now, or null for unseen cards. */
  retrievability(card: SchedState, now: Date): number | null;
}

export function createScheduler(cfg: DeckConfig): Scheduler {
  switch (cfg.algorithm) {
    case "sm2": return new Sm2Scheduler(cfg);
    case "leitner": return new LeitnerScheduler(cfg);
    default: return new FsrsScheduler(cfg);
  }
}

