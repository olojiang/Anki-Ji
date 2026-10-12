import { q } from "../db";
import { listDecks, NotFoundError } from "../repo/decks";
import { userContext } from "./context";
import { descendantIds } from "@/core/tree";
import { dayIndex } from "@/core/time";
import { capDuration } from "@/core/response-time";
import { sweepRetention, DEFAULT_COSTS, DEFAULT_FIRST_RATING_PROB, DEFAULT_REVIEW_RATING_PROB, type SimCard } from "@/core/simulator";

const toDate = (v: unknown) => new Date(String(v instanceof Date ? v.toISOString() : v));

/** Per-user answer-time costs and rating probabilities from the review log (falls back to FSRS defaults). */
async function learnedBehaviour(uid: number, ids: number[], since: number) {
  const rows = await q(
    `SELECT state, rating, count(*)::int AS n, sum(LEAST(duration_ms, 60000))::float AS ms, count(*) FILTER (WHERE duration_ms > 0)::int AS timed
     FROM ak_revlog WHERE user_id = $1 AND deck_id = ANY($2::int[]) AND day > $3 GROUP BY state, rating`, [uid, ids, since]);
  const g = (state: string[], rating?: (r: number) => boolean) => rows.filter((r) => state.includes(String(r.state)) && (!rating || rating(Number(r.rating))))
    .reduce((a, r) => ({ n: a.n + Number(r.n), ms: a.ms + Number(r.ms ?? 0), timed: a.timed + Number(r.timed) }), { n: 0, ms: 0, timed: 0 });
  const firstReviews = g(["new"]);
  const learning = g(["new", "learning"]);
  const pass = g(["review"], (r) => r > 1);
  const fail = g(["review"], (r) => r === 1);
  const relearn = g(["relearning"]);
  const costs = { ...DEFAULT_COSTS };
  if (firstReviews.n >= 10 && learning.timed >= 10) costs.learn = learning.ms / 1000 / firstReviews.n;
  if (pass.timed >= 20) costs.pass = pass.ms / 1000 / pass.timed;
  if (fail.n >= 10 && fail.timed >= 5) costs.fail = (fail.ms + relearn.ms) / 1000 / fail.n;
  const count = (state: string, r: number) => rows.filter((x) => x.state === state && Number(x.rating) === r).reduce((a, x) => a + Number(x.n), 0);
  const first = [1, 2, 3, 4].map((r) => count("new", r));
  const review = [2, 3, 4].map((r) => count("review", r));
  return {
    costs: { learn: round1(costs.learn), pass: round1(costs.pass), fail: round1(costs.fail) },
    firstRatingProb: first.reduce((a, b) => a + b, 0) >= 50 ? first : DEFAULT_FIRST_RATING_PROB,
    reviewRatingProb: review.reduce((a, b) => a + b, 0) >= 50 ? review : DEFAULT_REVIEW_RATING_PROB,
    fromHistory: { costs: pass.timed >= 20, ratings: first.reduce((a, b) => a + b, 0) >= 50 },
  };
}
const round1 = (x: number) => Math.round(x * 10) / 10;

export interface SimOverrides { weights?: number[] | null; newPerDay?: number; reviewsPerDay?: number; maxInterval?: number; days?: number }

/** Workload / knowledge for desired retention 0.70–0.97 over the next year for a deck subtree. */
export async function simulateDeck(uid: number, deckId: number, o: SimOverrides) {
  const decks = await listDecks(uid);
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) throw new NotFoundError("deck_not_found");
  const ids = descendantIds(decks, deckId);
  const ctx = await userContext(uid);
  const rows = await q(
    `SELECT c.state, c.stability, c.difficulty, c.last_review, c.due FROM ak_cards c JOIN ak_notes n ON n.id = c.note_id
     WHERE c.user_id = $1 AND n.deleted_at IS NULL AND c.suspended = false AND (c.deck_id = ANY($2::int[]) OR c.home_deck_id = ANY($2::int[]))`, [uid, ids]);
  let newCards = 0;
  const cards: SimCard[] = [];
  for (const r of rows) {
    const s = Number(r.stability);
    if (r.state === "new" || !(s > 0) || !r.last_review) { if (r.state === "new") newCards++; continue; }
    cards.push({
      s, d: Number(r.difficulty) || 5,
      lastDay: Math.min(0, dayIndex(toDate(r.last_review), ctx.tz, ctx.rollover) - ctx.today),
      dueDay: dayIndex(toDate(r.due), ctx.tz, ctx.rollover) - ctx.today,
    });
  }
  const beh = await learnedBehaviour(uid, ids, ctx.today - 365);
  const cfg = deck.config;
  const weights = Array.isArray(o.weights) && o.weights.length >= 17 && o.weights.every(Number.isFinite) ? o.weights : cfg.fsrsWeights;
  const clampInt = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) && v !== null && v !== undefined ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
  const params = {
    newPerDay: clampInt(o.newPerDay, cfg.newPerDay, 0, 9999),
    reviewsPerDay: clampInt(o.reviewsPerDay, cfg.reviewsPerDay, 0, 99999),
    maxInterval: clampInt(o.maxInterval, cfg.maxInterval, 1, 36500),
    days: clampInt(o.days, 365, 30, 730),
  };
  const sw = sweepRetention({
    w: weights, days: params.days, newLimit: params.newPerDay, reviewLimit: params.reviewsPerDay, maxInterval: params.maxInterval,
    newCards, cards, costs: beh.costs, firstRatingProb: beh.firstRatingProb, reviewRatingProb: beh.reviewRatingProb, seed: 20261012,
  });
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    current: cfg.desiredRetention,
    optimal: sw.optimal,
    params,
    costs: beh.costs,
    fromHistory: beh.fromHistory,
    collection: { newCards, reviewCards: cards.length },
    points: sw.points.map((p) => ({
      retention: p.retention, avgReviewsPerDay: r2(p.avgReviewsPerDay), avgMinutesPerDay: r2(p.avgMinutesPerDay), totalReviews: Math.round(p.totalReviews),
      memorizedEnd: Math.round(p.memorizedEnd), secondsPerMemorized: p.secondsPerMemorized == null ? null : r2(p.secondsPerMemorized),
      weekly: p.weekly.map((w) => ({ reviews: r2(w.reviews), minutes: r2(w.minutes), memorized: Math.round(w.memorized) })),
    })),
  };
}
