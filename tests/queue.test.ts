import { describe, it, expect } from "vitest";
import { buildQueue, type QueueCard, type QueueDeck } from "@/core/queue";
import { defaultDeckConfig, normalizeConfig } from "@/core/config";
import { dayIndex, dayStart } from "@/core/time";

const tz = "Asia/Shanghai";
const now = new Date("2026-10-12T04:00:00Z"); // 12:00 local
const today = dayIndex(now, tz, 4);
const cfg = (o = {}) => normalizeConfig({ ...defaultDeckConfig(), ...o });
let seq = 0;
const card = (o: Partial<QueueCard>): QueueCard => {
  seq++;
  return { id: seq, noteId: seq, deckId: 1, state: "new", due: new Date(0), suspended: false, buriedDay: null, position: seq, createdAt: new Date(now.getTime() - (1000 - seq) * 1000), stability: 0, difficulty: 0, scheduledDays: 0, lastReview: null, reps: 0, lapses: 0, step: 0, elapsedDays: 0, ease: 0, box: 0, ...o };
};
const review = (dueDay: number, o: Partial<QueueCard> = {}) => card({ state: "review", due: dayStart(dueDay, tz, 4), scheduledDays: 5, stability: 5, difficulty: 5, reps: 3, lastReview: dayStart(dueDay - 5, tz, 4), ...o });
const decks = (o: Partial<QueueDeck>[] = []): QueueDeck[] => (o.length ? o : [{}]).map((d, i) => ({ id: i + 1, parentId: null, name: `D${i + 1}`, position: i, config: cfg(), filtered: false, ...d }));
const base = { now, tz, rollover: 4, studied: new Map(), notesReviewedToday: new Set<number>() };

describe("queue builder", () => {
  it("applies the daily new card limit minus what was already introduced today", () => {
    const cards = Array.from({ length: 5 }, () => card({}));
    const ds = decks([{ config: cfg({ newPerDay: 2 }) }]);
    expect(buildQueue({ ...base, decks: ds, rootId: 1, cards }).counts.new).toBe(2);
    expect(buildQueue({ ...base, decks: ds, rootId: 1, cards, studied: new Map([[1, { new: 1, review: 0 }]]) }).counts.new).toBe(1);
  });

  it("caps child decks by the selected parent's limit", () => {
    const ds = decks([{ id: 1, config: cfg({ newPerDay: 3 }) }, { id: 2, parentId: 1, config: cfg({ newPerDay: 5 }) }, { id: 3, parentId: 1, config: cfg({ newPerDay: 1 }) }]);
    const cards = [...Array.from({ length: 4 }, () => card({ deckId: 2 })), ...Array.from({ length: 4 }, () => card({ deckId: 3 }))];
    const q = buildQueue({ ...base, decks: ds, rootId: 1, cards });
    expect(q.counts.new).toBe(3);
    expect(q.cards.filter((c) => c.deckId === 3).length).toBeLessThanOrEqual(1);
    expect(buildQueue({ ...base, decks: ds, rootId: 2, cards }).counts.new).toBe(4);
  });

  it("includes only reviews due today or earlier, honouring the review limit", () => {
    const cards = [review(today - 3), review(today), review(today + 1), review(today - 1)];
    const q = buildQueue({ ...base, decks: decks(), rootId: 1, cards });
    expect(q.counts.review).toBe(3);
    const limited = buildQueue({ ...base, decks: decks([{ config: cfg({ reviewsPerDay: 2 }) }]), rootId: 1, cards });
    expect(limited.counts.review).toBe(2);
  });

  it("orders reviews by due date (most overdue first)", () => {
    const a = review(today), b = review(today - 5), c = review(today - 2);
    const q = buildQueue({ ...base, decks: decks([{ config: cfg({ newPerDay: 0 }) }]), rootId: 1, cards: [a, b, c] });
    expect(q.cards.map((x) => x.id)).toEqual([b.id, c.id, a.id]);
  });

  it("orders by lowest retrievability when configured", () => {
    const weak = review(today, { stability: 1, lastReview: dayStart(today - 10, tz, 4) });
    const strong = review(today - 1, { stability: 100, lastReview: dayStart(today - 10, tz, 4) });
    const q = buildQueue({ ...base, decks: decks([{ config: cfg({ reviewOrder: "retrievability", newPerDay: 0 }) }]), rootId: 1, cards: [strong, weak] });
    expect(q.cards[0].id).toBe(weak.id);
  });

  it("excludes suspended and buried cards", () => {
    const cards = [review(today, { suspended: true }), review(today, { buriedDay: today }), review(today, { buriedDay: today - 1 })];
    expect(buildQueue({ ...base, decks: decks(), rootId: 1, cards }).counts.review).toBe(1);
  });

  it("buries siblings: one card per note per day", () => {
    const n = 999;
    const cards = [card({ noteId: n }), card({ noteId: n }), review(today, { noteId: n })];
    const q = buildQueue({ ...base, decks: decks(), rootId: 1, cards });
    expect(q.cards.length).toBe(1);
    const reviewed = buildQueue({ ...base, decks: decks(), rootId: 1, cards: [card({ noteId: 5 })], notesReviewedToday: new Set([5]) });
    expect(reviewed.cards.length).toBe(0);
    const off = buildQueue({ ...base, decks: decks([{ config: cfg({ buryNew: false, buryReview: false }) }]), rootId: 1, cards });
    expect(off.cards.length).toBe(3);
  });

  it("shows due learning cards first and learns ahead only when nothing else is left", () => {
    const l1 = card({ state: "learning", due: new Date(now.getTime() - 60000), reps: 1 });
    const l2 = card({ state: "learning", due: new Date(now.getTime() + 5 * 60000), reps: 1 });
    const r = review(today);
    const q = buildQueue({ ...base, decks: decks(), rootId: 1, cards: [r, l2, l1] });
    expect(q.cards[0].id).toBe(l1.id);
    expect(q.cards.map((c) => c.id)).not.toContain(l2.id);
    expect(q.counts.learning).toBe(1);
    const only = buildQueue({ ...base, decks: decks(), rootId: 1, cards: [l2] });
    expect(only.cards[0].id).toBe(l2.id);
    const far = card({ state: "learning", due: new Date(now.getTime() + 60 * 60000), reps: 1 });
    const none = buildQueue({ ...base, decks: decks(), rootId: 1, cards: [far] });
    expect(none.cards.length).toBe(0);
    expect(none.nextLearningAt?.getTime()).toBe(far.due.getTime());
  });

  it("new card order: manual position, created, random", () => {
    const a = card({ position: 3 }), b = card({ position: 1 }), c = card({ position: 2 });
    const manual = buildQueue({ ...base, decks: decks(), rootId: 1, cards: [a, b, c] });
    expect(manual.cards.map((x) => x.id)).toEqual([b.id, c.id, a.id]);
    const created = buildQueue({ ...base, decks: decks([{ config: cfg({ newOrder: "created" }) }]), rootId: 1, cards: [c, a, b] });
    expect(created.cards.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    const r = buildQueue({ ...base, decks: decks([{ config: cfg({ newOrder: "random" }) }]), rootId: 1, cards: [a, b, c], rng: () => 0 });
    expect(r.cards).toHaveLength(3);
  });

  it("mixes new cards among reviews", () => {
    const reviews = Array.from({ length: 6 }, () => review(today));
    const news = Array.from({ length: 2 }, () => card({}));
    const q = buildQueue({ ...base, decks: decks(), rootId: 1, cards: [...news, ...reviews] });
    const kinds = q.cards.map((c) => c.state);
    expect(kinds[0]).toBe("review");
    expect(kinds[kinds.length - 1]).toBe("review");
    expect(kinds.filter((k) => k === "new")).toHaveLength(2);
    const nf = buildQueue({ ...base, decks: decks([{ config: cfg({ newReviewMix: "newFirst" }) }]), rootId: 1, cards: [...reviews, ...news] });
    expect(nf.cards[0].state).toBe("new");
  });

  it("filtered decks ignore daily limits", () => {
    const cards = Array.from({ length: 5 }, () => card({}));
    const q = buildQueue({ ...base, decks: decks([{ filtered: true, config: cfg({ newPerDay: 1 }) }]), rootId: 1, cards });
    expect(q.counts.new).toBe(5);
  });
});
