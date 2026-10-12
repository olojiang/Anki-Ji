import { fsrs, generatorParameters, State, type Card, type FSRS, type Grade, type StepUnit } from "ts-fsrs";
import type { CardState, Rating, SchedState } from "../types";
import { BaseScheduler } from "./base";

const toFsrsState: Record<CardState, State> = { new: State.New, learning: State.Learning, review: State.Review, relearning: State.Relearning };
const fromFsrsState: Record<number, CardState> = { 0: "new", 1: "learning", 2: "review", 3: "relearning" };
const toSteps = (m: number[]) => m.map((x) => (x >= 1440 && x % 1440 === 0 ? `${x / 1440}d` : x >= 60 && x % 60 === 0 ? `${x / 60}h` : `${Math.round(x)}m`)) as StepUnit[];

/** FSRS-6 via the official open-spaced-repetition `ts-fsrs` package. Fuzz is applied later (load balancer). */
export class FsrsScheduler extends BaseScheduler {
  readonly id = "fsrs" as const;
  private _f: FSRS | null = null;
  private get f(): FSRS {
    if (!this._f) {
      const c = this.cfg;
      this._f = fsrs(generatorParameters({
        request_retention: c.desiredRetention,
        maximum_interval: c.maxInterval,
        enable_fuzz: false,
        enable_short_term: c.enableShortTerm,
        learning_steps: toSteps(c.learningSteps),
        relearning_steps: toSteps(c.relearningSteps),
        ...(c.fsrsWeights ? { w: c.fsrsWeights } : {}),
      }));
    }
    return this._f;
  }

  toCard(s: SchedState, now: Date): Card {
    return {
      due: s.state === "new" ? now : s.due,
      stability: s.stability, difficulty: s.difficulty, elapsed_days: s.elapsedDays, scheduled_days: s.scheduledDays,
      learning_steps: s.step, reps: s.reps, lapses: s.lapses, state: toFsrsState[s.state],
      last_review: s.lastReview ?? undefined,
    };
  }

  next(card: SchedState, rating: Rating, now: Date): SchedState {
    const c = this.f.next(this.toCard(card, now), now, rating as Grade).card;
    if (c.state === State.Review && c.scheduled_days > this.cfg.maxInterval) {
      // ts-fsrs keeps hard<good<easy ordering even past maximum_interval; enforce the hard cap.
      c.scheduled_days = this.cfg.maxInterval;
      c.due = new Date(now.getTime() + c.scheduled_days * 86_400_000);
    }
    return {
      ...card,
      state: fromFsrsState[c.state], due: c.due, stability: c.stability, difficulty: c.difficulty,
      elapsedDays: c.elapsed_days, scheduledDays: c.scheduled_days, step: c.learning_steps,
      reps: c.reps, lapses: c.lapses, lastReview: c.last_review ?? now,
    };
  }

  retrievability(card: SchedState, now: Date): number | null {
    if (card.state === "new" || !card.lastReview || card.stability <= 0) return null;
    return this.f.get_retrievability(this.toCard(card, now), now, false) as number;
  }
}
