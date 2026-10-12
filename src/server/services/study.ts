import { listDecks, getDeck, NotFoundError } from "../repo/decks";
import { getCardsInDecks, getCard, updateSched, reviewLoadByDay } from "../repo/cards";
import { getNote, bulkTags } from "../repo/notes";
import { insertRevlog, studiedToday, notesReviewedToday, lastRevlog, deleteRevlog } from "../repo/revlog";
import { q } from "../db";
import { userContext } from "./context";
import { schedSnapshot, type Card, type Deck } from "../repo/mappers";
import { buildQueue, type QueueDeck } from "@/core/queue";
import { descendantIds } from "@/core/tree";
import { answerCard, previewIntervals, formatInterval } from "@/core/answer";
import { renderCard } from "@/core/notes";
import { createScheduler } from "@/core/scheduler";
import type { Rating, SchedState } from "@/core/types";

const toQueueDecks = (decks: Deck[]): QueueDeck[] => decks.map((d) => ({ id: d.id, parentId: d.parentId, name: d.name, position: d.position, config: d.config, filtered: d.filtered }));

/** Counts for every deck (used on the deck list). */
export async function deckCounts(uid: number) {
  const ctx = await userContext(uid);
  const decks = await listDecks(uid);
  const qd = toQueueDecks(decks);
  const cards = await getCardsInDecks(uid, decks.map((d) => d.id));
  const studied = await studiedToday(uid, ctx.today);
  const reviewedNotes = await notesReviewedToday(uid, ctx.today);
  const out: Record<number, { new: number; learning: number; review: number; total: number }> = {};
  for (const d of decks) {
    const ids = new Set(descendantIds(decks, d.id));
    const sub = cards.filter((c) => ids.has(c.deckId));
    const qq = buildQueue({ decks: qd, rootId: d.id, cards: sub, studied, notesReviewedToday: reviewedNotes, now: ctx.now, tz: ctx.tz, rollover: ctx.rollover });
    out[d.id] = { ...qq.counts, total: sub.length };
  }
  return out;
}

export async function getStudyState(uid: number, deckId: number) {
  const deck = await getDeck(uid, deckId);
  if (!deck || deck.deletedAt) return null;
  const ctx = await userContext(uid);
  const decks = await listDecks(uid);
  const ids = descendantIds(decks, deckId);
  const cards = await getCardsInDecks(uid, ids);
  const queue = buildQueue({
    decks: toQueueDecks(decks), rootId: deckId, cards, studied: await studiedToday(uid, ctx.today),
    notesReviewedToday: await notesReviewedToday(uid, ctx.today), now: ctx.now, tz: ctx.tz, rollover: ctx.rollover,
  });
  const first = queue.cards[0] as Card | undefined;
  let card = null;
  if (first) {
    const note = await getNote(uid, first.noteId);
    const cfg = (decks.find((d) => d.id === (first.homeDeckId ?? first.deckId)) ?? deck).config;
    const actx = { cfg, now: ctx.now, tz: ctx.tz, rollover: ctx.rollover, loadOn: () => 0 };
    const iv = previewIntervals(first, actx);
    const r = renderCard(note!.type, note!.fields, first.ord);
    card = {
      cardId: first.id, noteId: first.noteId, deckId: first.deckId, type: note!.type, ord: first.ord, state: first.state, ...r,
      intervals: Object.fromEntries(Object.entries(iv).map(([k, v]) => [k, formatInterval(v)])) as Record<string, string>,
      flag: first.flag, leech: first.leech, tags: note!.tags,
      retrievability: createScheduler(cfg).retrievability(first, ctx.now), stability: first.stability, difficulty: first.difficulty, reps: first.reps, lapses: first.lapses,
    };
  }
  return { deck: { id: deck.id, name: deck.name, filtered: deck.filtered }, counts: queue.counts, card, nextLearningAt: queue.nextLearningAt?.toISOString() ?? null };
}

export async function answer(uid: number, cardId: number, rating: Rating, durationMs: number) {
  if (![1, 2, 3, 4].includes(rating)) throw new Error("invalid_rating");
  const card = await getCard(uid, cardId);
  if (!card) throw new NotFoundError("card_not_found");
  const ctx = await userContext(uid);
  const configDeckId = card.homeDeckId ?? card.deckId;
  const deck = await getDeck(uid, configDeckId);
  if (!deck) throw new NotFoundError("deck_not_found");
  const load = await reviewLoadByDay(uid, ctx.offset, ctx.rollover);
  const res = answerCard(card, rating, { cfg: deck.config, now: ctx.now, tz: ctx.tz, rollover: ctx.rollover, loadOn: (d) => load.get(d) ?? 0 });
  const leech = res.leech;
  await updateSched(uid, cardId, res.card, leech ? { leech: true, ...(deck.config.leechAction === "suspend" ? { suspended: true } : {}) } : {});
  if (leech) await bulkTags(uid, [card.noteId], ["leech"], []);
  await insertRevlog(uid, {
    cardId, deckId: configDeckId, noteId: card.noteId, rating, prevState: card.state, next: res.card, durationMs, day: ctx.today,
    algorithm: deck.config.algorithm, snapshot: schedSnapshot(card), reviewedAt: ctx.now,
  });
  return { card: res.card, leech };
}

/** Undo the most recent answer: restore the card's previous scheduling and drop the log entry. */
export async function undoLast(uid: number) {
  const last = await lastRevlog(uid);
  if (!last) return null;
  const s = last.snapshot;
  const sched: SchedState = {
    state: s.state as SchedState["state"], due: new Date(String(s.due)), stability: Number(s.stability), difficulty: Number(s.difficulty),
    elapsedDays: Number(s.elapsedDays), scheduledDays: Number(s.scheduledDays), reps: Number(s.reps), lapses: Number(s.lapses), step: Number(s.step),
    lastReview: s.lastReview ? new Date(String(s.lastReview)) : null, ease: Number(s.ease), box: Number(s.box),
  };
  await updateSched(uid, last.cardId, sched, { leech: !!s.leech, suspended: !!s.suspended, buriedDay: (s.buriedDay as number | null) ?? null });
  await deleteRevlog(uid, last.id);
  return { cardId: last.cardId };
}

/** Bury (until tomorrow) – a card or the whole note. */
export async function buryCard(uid: number, cardId: number, wholeNote: boolean) {
  const ctx = await userContext(uid);
  const card = await getCard(uid, cardId);
  if (!card) return;
  if (wholeNote) await q("UPDATE ak_cards SET buried_day = $3 WHERE user_id = $1 AND note_id = $2", [uid, card.noteId, ctx.today]);
  else await q("UPDATE ak_cards SET buried_day = $3 WHERE user_id = $1 AND id = $2", [uid, cardId, ctx.today]);
}
