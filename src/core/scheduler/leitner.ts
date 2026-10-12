import type { Rating, SchedState } from "../types";
import { BaseScheduler, daysFrom } from "./base";

/** Classic Leitner boxes: Again → box 1, Hard stays, Good +1 box, Easy +2 boxes. */
export class LeitnerScheduler extends BaseScheduler {
  readonly id = "leitner" as const;
  next(card: SchedState, rating: Rating, now: Date): SchedState {
    const boxes = this.cfg.leitnerIntervals;
    const cur = Math.max(0, card.box);
    let box: number;
    let lapses = card.lapses;
    if (rating === 1) { box = 1; if (card.state !== "new") lapses += 1; }
    else if (rating === 2) box = Math.max(1, cur);
    else if (rating === 3) box = cur + 1;
    else box = cur + 2;
    box = Math.min(box, boxes.length);
    const ivl = Math.min(this.cfg.maxInterval, boxes[box - 1]);
    return { ...card, box, lapses, reps: card.reps + 1, state: "review", step: 0, scheduledDays: ivl, lastReview: now, due: daysFrom(now, ivl) };
  }
}
