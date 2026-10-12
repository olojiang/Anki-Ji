import type { DeckConfig, SchedState } from "./types";
import { descendantIds, ancestorIds, buildTree, flattenTree } from "./tree";
import { dayIndex } from "./time";
import { createScheduler } from "./scheduler";

export interface QueueCard extends SchedState {
  id: number;
  noteId: number;
  deckId: number;
  homeDeckId?: number | null; // original deck when the card sits in a filtered deck
  suspended: boolean;
  buriedDay: number | null;
  position: number;
  createdAt: Date;
}

export interface QueueDeck { id: number; parentId: number | null; name: string; position: number; config: DeckConfig; filtered: boolean }

export interface QueueInput {
  decks: QueueDeck[];
  rootId: number;
  cards: QueueCard[];
  studied: Map<number, { new: number; review: number }>; // introduced / reviewed today per deck
  notesReviewedToday: Set<number>;
  now: Date;
  tz: string;
  rollover: number;
  rng?: () => number;
}

export interface Queue {
  cards: QueueCard[];
  counts: { new: number; learning: number; review: number };
  nextLearningAt: Date | null;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Interleave `b` evenly into `a` (new cards spread among reviews). */
export function interleave<T>(a: T[], b: T[]): T[] {
  if (!b.length) return a;
  if (!a.length) return b;
  const out: T[] = [];
  const step = (a.length + 1) / (b.length + 1);
  let bi = 0;
  for (let ai = 0; ai < a.length; ai++) {
    out.push(a[ai]);
    while (bi < b.length && Math.round(step * (bi + 1)) === ai + 1) out.push(b[bi++]);
  }
  while (bi < b.length) out.push(b[bi++]);
  return out;
}

/** Build today's study queue for a deck subtree. Pure: all state is passed in. */
export function buildQueue(input: QueueInput): Queue {
  const { decks, rootId, now, tz, rollover } = input;
  const rng = input.rng ?? Math.random;
  const today = dayIndex(now, tz, rollover);
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const root = deckById.get(rootId);
  if (!root) return { cards: [], counts: { new: 0, learning: 0, review: 0 }, nextLearningAt: null };
  const subtree = new Set(descendantIds(decks, rootId));
  const deckOrder = new Map(flattenTree(buildTree(decks)).map((d, i) => [d.id, i]));
  const cfgOf = (c: QueueCard) => (deckById.get(c.homeDeckId ?? c.deckId) ?? deckById.get(c.deckId) ?? root).config;
  const limited = !root.filtered;

  const eligible = input.cards.filter((c) => subtree.has(c.deckId) && !c.suspended && !(c.buriedDay != null && c.buriedDay >= today));
  const learnAheadMs = root.config.learnAheadMinutes * 60000;
  const learningAll = eligible.filter((c) => c.state === "learning" || c.state === "relearning").sort((a, b) => a.due.getTime() - b.due.getTime());
  const learningDue = learningAll.filter((c) => c.due.getTime() <= now.getTime());
  const learningAhead = learningAll.filter((c) => c.due.getTime() > now.getTime() && c.due.getTime() <= now.getTime() + learnAheadMs);
  const learningLater = learningAll.filter((c) => c.due.getTime() > now.getTime() + learnAheadMs);

  // reviews ---------------------------------------------------------------
  const retr = new Map<number, number>();
  const rOf = (c: QueueCard) => {
    if (!retr.has(c.id)) retr.set(c.id, createScheduler(cfgOf(c)).retrievability(c, now) ?? 1);
    return retr.get(c.id)!;
  };
  let reviews = eligible.filter((c) => c.state === "review" && dayIndex(c.due, tz, rollover) <= today);
  const ro = root.config.reviewOrder;
  if (ro === "random") reviews = shuffle(reviews, rng);
  else if (ro === "retrievability") reviews.sort((a, b) => rOf(a) - rOf(b) || a.id - b.id);
  else reviews.sort((a, b) => dayIndex(a.due, tz, rollover) - dayIndex(b.due, tz, rollover) || rOf(a) - rOf(b) || a.id - b.id);

  // new -------------------------------------------------------------------
  let news = eligible.filter((c) => c.state === "new");
  const no = root.config.newOrder;
  const byDeck = (a: QueueCard, b: QueueCard) => (deckOrder.get(a.deckId) ?? 0) - (deckOrder.get(b.deckId) ?? 0);
  if (no === "random") news = shuffle(news, rng);
  else if (no === "created") news.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
  else news.sort((a, b) => byDeck(a, b) || a.position - b.position || a.id - b.id);

  // limits (selected deck caps its children; filtered decks have no limits) --
  const remaining = new Map<number, { new: number; review: number }>();
  for (const id of subtree) {
    const d = deckById.get(id)!;
    const s = input.studied.get(id) ?? { new: 0, review: 0 };
    remaining.set(id, { new: Math.max(0, d.config.newPerDay - s.new), review: Math.max(0, d.config.reviewsPerDay - s.review) });
  }
  const chainOf = (deckId: number) => {
    const chain = [deckId];
    if (deckId !== rootId) for (const a of ancestorIds(decks, deckId)) { chain.push(a); if (a === rootId) break; }
    return chain.filter((x) => subtree.has(x));
  };
  const take = (c: QueueCard, kind: "new" | "review") => {
    if (!limited) return true;
    const chain = chainOf(c.deckId);
    if (!chain.every((d) => (remaining.get(d)?.[kind] ?? 0) > 0)) return false;
    chain.forEach((d) => remaining.get(d)![kind]--);
    return true;
  };

  // sibling burying -------------------------------------------------------
  const seenNotes = new Set<number>(learningAll.map((c) => c.noteId));
  const buriedByToday = (c: QueueCard, kind: "new" | "review") => {
    const cfg = cfgOf(c);
    const bury = kind === "new" ? cfg.buryNew : cfg.buryReview;
    if (!bury) return false;
    return input.notesReviewedToday.has(c.noteId) || seenNotes.has(c.noteId);
  };
  const pickedReviews: QueueCard[] = [];
  for (const c of reviews) {
    if (buriedByToday(c, "review")) continue;
    if (!take(c, "review")) continue;
    pickedReviews.push(c); seenNotes.add(c.noteId);
  }
  const pickedNew: QueueCard[] = [];
  for (const c of news) {
    if (buriedByToday(c, "new")) continue;
    if (!take(c, "new")) continue;
    pickedNew.push(c); seenNotes.add(c.noteId);
  }

  const mix = root.config.newReviewMix;
  const main = mix === "newFirst" ? [...pickedNew, ...pickedReviews] : mix === "reviewFirst" ? [...pickedReviews, ...pickedNew] : interleave(pickedReviews, pickedNew);
  let cards = [...learningDue, ...main];
  let learningCount = learningDue.length;
  if (cards.length === 0 && learningAhead.length) { cards = learningAhead; learningCount = learningAhead.length; }
  const future = [...(cards === learningAhead ? [] : learningAhead), ...learningLater];
  return {
    cards,
    counts: { new: pickedNew.length, learning: learningCount, review: pickedReviews.length },
    nextLearningAt: future.length ? future[0].due : null,
  };
}
