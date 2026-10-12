import type { DeckConfig, Rating, SchedState } from "./types";
import { createScheduler } from "./scheduler";
import { pickInterval } from "./balance";
import { dayIndex, dayStart } from "./time";
import { isLeech } from "./leech";

export interface AnswerContext {
  cfg: DeckConfig;
  now: Date;
  tz: string;
  rollover: number;
  loadOn: (day: number) => number;
  rng?: () => number;
}

/** Apply fuzz/load-balancing and snap review cards to the start of their due study day. */
export function finalizeOutcome(out: SchedState, ctx: AnswerContext): SchedState {
  if (out.state !== "review") return out;
  const today = dayIndex(ctx.now, ctx.tz, ctx.rollover);
  const ivl = Math.max(1, Math.round(out.scheduledDays));
  const picked = pickInterval({
    interval: ivl, maxInterval: ctx.cfg.maxInterval, today, loadOn: ctx.loadOn, easyDays: ctx.cfg.easyDays,
    balance: ctx.cfg.loadBalance, fuzz: ctx.cfg.fuzz, rng: ctx.rng, elapsedDays: out.elapsedDays,
  });
  return { ...out, scheduledDays: picked, due: dayStart(today + picked, ctx.tz, ctx.rollover) };
}

export interface AnswerResult { card: SchedState; leech: boolean }

/** Full answer pipeline used by the study service: schedule → balance → leech check. */
export function answerCard(card: SchedState, rating: Rating, ctx: AnswerContext): AnswerResult {
  const s = createScheduler(ctx.cfg);
  const next = finalizeOutcome(s.next(card, rating, ctx.now), ctx);
  const lapsed = rating === 1 && card.state === "review";
  return { card: next, leech: lapsed && isLeech(next.lapses, ctx.cfg.leechThreshold) };
}

/** Interval previews for the four buttons (without load balancing noise). */
export function previewIntervals(card: SchedState, ctx: AnswerContext): Record<Rating, number> {
  const s = createScheduler(ctx.cfg);
  const p = s.preview(card, ctx.now);
  const out = {} as Record<Rating, number>;
  for (const r of [1, 2, 3, 4] as Rating[]) {
    const o = p[r];
    out[r] = o.state === "review" ? Math.max(1, Math.round(o.scheduledDays)) * 1440 : Math.max(1, Math.round((o.due.getTime() - ctx.now.getTime()) / 60000));
  }
  return out; // minutes
}

/** Human readable short interval ("10m", "3d", "2.1mo", "1.5y"). */
export function formatInterval(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  const d = minutes / 1440;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${(d / 30).toFixed(1).replace(/\.0$/, "")}mo`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, "")}y`;
}
