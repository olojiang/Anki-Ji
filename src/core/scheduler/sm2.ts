import type { Rating, SchedState } from "../types";
import { BaseScheduler, daysFrom, minutesFrom } from "./base";

/** Anki's legacy SM-2 variant (learning steps, ease factor, hard/easy multipliers, lapses). */
export class Sm2Scheduler extends BaseScheduler {
  readonly id = "sm2" as const;

  next(card: SchedState, rating: Rating, now: Date): SchedState {
    const c = this.cfg;
    const base: SchedState = { ...card, reps: card.reps + 1, lastReview: now };
    const cap = (d: number) => Math.max(1, Math.min(c.maxInterval, Math.round(d)));
    const graduate = (ivl: number, ease: number): SchedState => {
      const i = cap(ivl);
      return { ...base, state: "review", step: 0, scheduledDays: i, ease, due: daysFrom(now, i) };
    };

    if (card.state === "new" || card.state === "learning" || card.state === "relearning") {
      const relearn = card.state === "relearning";
      const steps = relearn ? c.relearningSteps : c.learningSteps;
      const ease = card.ease || c.startingEase;
      const gradIvl = relearn ? Math.max(1, card.scheduledDays) : c.graduatingInterval;
      const easyIvl = relearn ? Math.max(1, card.scheduledDays) + 1 : c.easyInterval;
      const stay = (step: number, delay: number): SchedState => ({ ...base, state: relearn ? "relearning" : "learning", step, ease, due: minutesFrom(now, delay) });
      if (rating === 4 || steps.length === 0) return rating === 4 ? graduate(easyIvl, ease) : rating === 1 && steps.length === 0 && !relearn ? graduate(gradIvl, ease) : graduate(gradIvl, ease);
      const step = card.state === "new" ? 0 : Math.min(card.step, steps.length - 1);
      if (rating === 1) return stay(0, steps[0]);
      if (rating === 2) {
        const delay = step === 0 && steps.length > 1 ? (steps[0] + steps[1]) / 2 : step === 0 ? steps[0] * 1.5 : steps[step];
        return stay(step, delay);
      }
      // Good
      const nextStep = card.state === "new" ? 1 : step + 1;
      if (nextStep >= steps.length) return graduate(gradIvl, ease);
      return stay(nextStep, steps[nextStep]);
    }

    // review
    const ivl = Math.max(1, card.scheduledDays);
    const ease = card.ease || c.startingEase;
    const elapsed = card.lastReview ? (now.getTime() - card.lastReview.getTime()) / 86_400_000 : ivl;
    const delay = Math.max(0, Math.floor(elapsed) - ivl);
    if (rating === 1) {
      const newEase = Math.max(1.3, ease - 0.2);
      const newIvl = cap(ivl * c.lapseNewInterval);
      if (c.relearningSteps.length === 0) return { ...base, lapses: card.lapses + 1, state: "review", ease: newEase, scheduledDays: newIvl, due: daysFrom(now, newIvl) };
      return { ...base, lapses: card.lapses + 1, state: "relearning", step: 0, ease: newEase, scheduledDays: newIvl, due: minutesFrom(now, c.relearningSteps[0]) };
    }
    const hard = Math.min(c.maxInterval, Math.max(ivl + 1, Math.round(ivl * c.hardInterval * c.intervalModifier)));
    if (rating === 2) return graduate(hard, Math.max(1.3, ease - 0.15));
    const good = Math.min(c.maxInterval, Math.max(hard + 1, Math.round((ivl + delay / 2) * ease * c.intervalModifier)));
    if (rating === 3) return graduate(good, ease);
    const easy = Math.max(good + 1, Math.round((ivl + delay) * ease * c.easyBonus * c.intervalModifier));
    return graduate(easy, ease + 0.15);
  }
}
