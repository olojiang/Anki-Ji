/**
 * Offline review sync: pure merge logic shared by the client (outbox) and the server (replay endpoint).
 *
 * Every offline review carries `base` – the version of the card's scheduling state it was answered from.
 * The server compares it with the card's current version:
 *  - unchanged → the client's result is accepted as-is (it was computed by the same core scheduler);
 *  - changed   → the card is re-scheduled by replaying the review log in timestamp order
 *                (offline reviews merged with any server reviews that happened after them).
 * Review ids are generated on the client, so a replayed batch is idempotent.
 */
import type { CardState, Rating, SchedState } from "./types";
import { isLeech } from "./leech";

export interface SchedJSON {
  state: CardState; due: string; stability: number; difficulty: number; elapsedDays: number; scheduledDays: number;
  reps: number; lapses: number; step: number; lastReview: string | null; ease: number; box: number;
}

const STATES: CardState[] = ["new", "learning", "review", "relearning"];

/** Stable fingerprint of a card's scheduling state (the "base version" of an offline review). */
export function schedVersion(s: SchedState): string {
  const f = (n: number) => Math.round(n * 1e6);
  return [s.state, s.due.getTime(), s.reps, s.lapses, s.step, s.lastReview ? s.lastReview.getTime() : 0,
    f(s.stability), f(s.difficulty), f(s.scheduledDays), f(s.ease), s.box].join(":");
}

export function schedToJSON(s: SchedState): SchedJSON {
  return {
    state: s.state, due: s.due.toISOString(), stability: s.stability, difficulty: s.difficulty, elapsedDays: s.elapsedDays, scheduledDays: s.scheduledDays,
    reps: s.reps, lapses: s.lapses, step: s.step, lastReview: s.lastReview ? s.lastReview.toISOString() : null, ease: s.ease, box: s.box,
  };
}

const finite = (v: unknown, min = -Infinity): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min ? n : null;
};
const toDate = (v: unknown): Date | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Parse/validate a scheduling state coming from JSON (client payloads, revlog snapshots). */
export function schedFromJSON(x: unknown): SchedState | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!STATES.includes(o.state as CardState)) return null;
  const due = toDate(o.due);
  const lastReview = o.lastReview == null ? null : toDate(o.lastReview);
  if (!due || (o.lastReview != null && !lastReview)) return null;
  const nums = {
    stability: finite(o.stability, 0), difficulty: finite(o.difficulty, 0), elapsedDays: finite(o.elapsedDays ?? 0, 0), scheduledDays: finite(o.scheduledDays, 0),
    reps: finite(o.reps, 0), lapses: finite(o.lapses, 0), step: finite(o.step ?? 0, 0), ease: finite(o.ease ?? 0, 0), box: finite(o.box ?? 0, 0),
  };
  if (Object.values(nums).some((v) => v === null)) return null;
  const n = nums as Record<keyof typeof nums, number>;
  return { state: o.state as CardState, due, lastReview, ...n, reps: Math.round(n.reps), lapses: Math.round(n.lapses), step: Math.round(n.step), box: Math.round(n.box) };
}

/** Timestamp order (ties broken by id), first occurrence of an id wins. */
export function sortReviews<T extends { id: string; reviewedAt: Date }>(reviews: T[]): T[] {
  const seen = new Set<string>();
  const uniq = reviews.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  return uniq.sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface IncomingReview {
  id: string; cardId: number; rating: Rating; reviewedAt: Date; durationMs: number;
  base: string; // schedVersion of the state the client answered from
  next: SchedState | null; // client's computed result (null = invalid → server recomputes)
}
/** A review already in the server's log (used for replay). `snapshot` is the card state before it. */
export interface HistoryEntry { reviewedAt: Date; rating: Rating; snapshot: SchedState | null }
export type AnswerFn = (card: SchedState, rating: Rating, at: Date) => { card: SchedState; leech: boolean };

export interface MergeStep { review: IncomingReview; prev: SchedState; next: SchedState; leech: boolean; mode: "client" | "server" }
export interface MergeResult { conflict: boolean; steps: MergeStep[]; final: SchedState; leech: boolean; replayedServer: number }

/**
 * Merge a batch of offline reviews of ONE card into the server state.
 * `later` = server log entries of this card newer than the earliest incoming review (oldest first).
 */
export function mergeCardReviews(current: SchedState, incoming: IncomingReview[], later: HistoryEntry[], opts: { answer: AnswerFn; leechThreshold: number }): MergeResult {
  const reviews = sortReviews(incoming);
  const steps: MergeStep[] = [];
  if (!reviews.length) return { conflict: false, steps, final: current, leech: false, replayedServer: 0 };
  const conflict = schedVersion(current) !== reviews[0].base;

  if (!conflict) {
    let s = current;
    for (const r of reviews) {
      const prev = s;
      const useClient = !!r.next && schedVersion(prev) === r.base;
      const next = useClient ? r.next! : opts.answer(prev, r.rating, r.reviewedAt).card;
      const leech = r.rating === 1 && prev.state === "review" && isLeech(next.lapses, opts.leechThreshold);
      steps.push({ review: r, prev, next, leech, mode: useClient ? "client" : "server" });
      s = next;
    }
    return { conflict, steps, final: s, leech: steps.some((x) => x.leech), replayedServer: 0 };
  }

  // Conflict: rebuild the card from the review log in timestamp order.
  const t0 = reviews[0].reviewedAt.getTime();
  const after = later.filter((h) => h.reviewedAt.getTime() > t0).sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
  const start = after.length && after[0].snapshot ? after[0].snapshot : current;
  const replayServer = after.length && after[0].snapshot ? after : [];
  type Ev = { at: number; kind: 0 | 1; rating: Rating; review?: IncomingReview };
  const events: Ev[] = [
    ...replayServer.map((h) => ({ at: h.reviewedAt.getTime(), kind: 0 as const, rating: h.rating })),
    ...reviews.map((r) => ({ at: r.reviewedAt.getTime(), kind: 1 as const, rating: r.rating, review: r })),
  ].sort((a, b) => a.at - b.at || b.kind - a.kind);
  let s = start;
  let leechAny = false;
  for (const e of events) {
    const res = opts.answer(s, e.rating, new Date(e.at));
    const leech = e.rating === 1 && s.state === "review" && isLeech(res.card.lapses, opts.leechThreshold);
    if (e.review) steps.push({ review: e.review, prev: s, next: res.card, leech, mode: "server" });
    leechAny ||= leech;
    s = res.card;
  }
  return { conflict, steps, final: s, leech: leechAny, replayedServer: replayServer.length };
}
