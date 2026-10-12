import { describe, it, expect } from "vitest";
import { defaultDeckConfig, normalizeConfig } from "@/core/config";
import { answerCard } from "@/core/answer";
import { newCardState } from "@/core/scheduler";
import { dayIndex, dayStart } from "@/core/time";
import type { Rating, SchedState } from "@/core/types";
import { schedVersion, schedToJSON, schedFromJSON, sortReviews, mergeCardReviews, type IncomingReview, type AnswerFn } from "@/core/sync";
import { localStudyView, localAnswer, localUndo, extractMediaUrls, packCardSched, type OfflinePack, type PackCard } from "@/core/offline";

const tz = "Asia/Shanghai";
const now = new Date("2026-10-12T04:00:00Z"); // 12:00 local
const today = dayIndex(now, tz, 4);
const cfg = normalizeConfig({ ...defaultDeckConfig(), fuzz: false, loadBalance: false });
const answer: AnswerFn = (s, r, at) => answerCard(s, r, { cfg, now: at, tz, rollover: 4, loadOn: () => 0 });
const at = (min: number) => new Date(now.getTime() + min * 60000);

function reviewState(o: Partial<SchedState> = {}): SchedState {
  return { ...newCardState(), state: "review", due: dayStart(today, tz, 4), stability: 5, difficulty: 5, scheduledDays: 5, elapsedDays: 5, reps: 3, lastReview: dayStart(today - 5, tz, 4), ease: 2.5, box: 2, ...o };
}

/** Simulate the client: answer locally and build the outbox entry. */
function clientReview(id: string, prev: SchedState, rating: Rating, when: Date): IncomingReview {
  const next = answer(prev, rating, when).card;
  return { id, cardId: 1, rating, reviewedAt: when, durationMs: 1000, base: schedVersion(prev), next };
}

describe("sync core: versions and serialization", () => {
  it("schedVersion changes with any scheduling field and survives a JSON round trip", () => {
    const s = reviewState();
    const v = schedVersion(s);
    expect(schedVersion({ ...s })).toBe(v);
    expect(schedVersion({ ...s, reps: 4 })).not.toBe(v);
    expect(schedVersion({ ...s, due: new Date(s.due.getTime() + 1) })).not.toBe(v);
    expect(schedVersion({ ...s, stability: s.stability + 0.001 })).not.toBe(v);
    const round = schedFromJSON(JSON.parse(JSON.stringify(schedToJSON(s))));
    expect(round).not.toBeNull();
    expect(schedVersion(round!)).toBe(v);
  });

  it("rejects malformed scheduling payloads", () => {
    expect(schedFromJSON(null)).toBeNull();
    expect(schedFromJSON({ state: "bogus", due: "2026-01-01" })).toBeNull();
    expect(schedFromJSON({ ...schedToJSON(reviewState()), due: "not a date" })).toBeNull();
    expect(schedFromJSON({ ...schedToJSON(reviewState()), stability: "NaN" })).toBeNull();
    expect(schedFromJSON({ ...schedToJSON(reviewState()), reps: -1 })).toBeNull();
  });

  it("sorts reviews by timestamp, then id, and drops duplicate ids", () => {
    const mk = (id: string, m: number) => ({ id, reviewedAt: at(m) });
    const out = sortReviews([mk("c", 5), mk("a", 1), mk("b", 1), mk("a", 9)]);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("sync core: mergeCardReviews", () => {
  it("applies the client's results when the server card is unchanged since the base version", () => {
    const cur = reviewState();
    const r1 = clientReview("r1", cur, 3, at(1));
    const m = mergeCardReviews(cur, [r1], [], { answer, leechThreshold: 8 });
    expect(m.conflict).toBe(false);
    expect(m.steps).toHaveLength(1);
    expect(m.steps[0].mode).toBe("client");
    expect(schedVersion(m.final)).toBe(schedVersion(r1.next!));
  });

  it("chains several offline reviews of the same card (learning steps)", () => {
    const cur = newCardState();
    const r1 = clientReview("r1", cur, 1, at(1));
    const r2 = clientReview("r2", r1.next!, 3, at(3));
    const r3 = clientReview("r3", r2.next!, 3, at(15));
    const m = mergeCardReviews(cur, [r3, r1, r2], [], { answer, leechThreshold: 8 });
    expect(m.conflict).toBe(false);
    expect(m.steps.map((s) => s.review.id)).toEqual(["r1", "r2", "r3"]);
    expect(m.steps[0].prev.state).toBe("new");
    expect(schedVersion(m.final)).toBe(schedVersion(r3.next!));
  });

  it("recomputes on the server when the client's next state is invalid", () => {
    const cur = reviewState();
    const r1 = { ...clientReview("r1", cur, 3, at(1)), next: null };
    const m = mergeCardReviews(cur, [r1], [], { answer, leechThreshold: 8 });
    expect(m.conflict).toBe(false);
    expect(m.steps[0].mode).toBe("server");
    expect(m.final.reps).toBe(cur.reps + 1);
  });

  it("re-schedules from the current server state when the card changed before the offline review", () => {
    const base = reviewState();
    const r1 = clientReview("r1", base, 3, at(60));
    // meanwhile on another device (earlier in time) the card was answered "Again"
    const server = answer(base, 1, at(10)).card;
    const m = mergeCardReviews(server, [r1], [], { answer, leechThreshold: 8 });
    expect(m.conflict).toBe(true);
    expect(m.steps[0].mode).toBe("server");
    expect(m.steps[0].prev.state).toBe(server.state);
    const expected = answer(server, 3, at(60)).card;
    expect(schedVersion(m.final)).toBe(schedVersion(expected));
  });

  it("replays in timestamp order when server reviews happened after the offline review", () => {
    const base = reviewState();
    const r1 = clientReview("r1", base, 1, at(5)); // offline: forgot it at +5m
    const serverAfter = answer(base, 3, at(30)).card; // online at +30m (without knowing about the lapse)
    const later = [{ reviewedAt: at(30), rating: 3 as Rating, snapshot: base }];
    const m = mergeCardReviews(serverAfter, [r1], later, { answer, leechThreshold: 8 });
    expect(m.conflict).toBe(true);
    expect(m.replayedServer).toBe(1);
    const expected = answer(answer(base, 1, at(5)).card, 3, at(30)).card;
    expect(schedVersion(m.final)).toBe(schedVersion(expected));
    expect(m.final.lapses).toBe(base.lapses + 1);
    expect(m.steps).toHaveLength(1);
    expect(m.steps[0].prev.state).toBe("review");
  });

  it("flags a leech when a replayed lapse crosses the threshold", () => {
    const cur = reviewState({ lapses: 7 });
    const r1 = clientReview("r1", cur, 1, at(1));
    const m = mergeCardReviews(cur, [r1], [], { answer, leechThreshold: 8 });
    expect(m.leech).toBe(true);
    expect(m.steps[0].leech).toBe(true);
  });
});

// ---------------------------------------------------------------------------
const deckCfg = normalizeConfig({ ...defaultDeckConfig(), newPerDay: 2 });
function packCard(id: number, o: Partial<PackCard> = {}): PackCard {
  return { id, noteId: id, deckId: 1, homeDeckId: null, ord: 0, suspended: false, buriedDay: null, flag: 0, leech: false, position: id, createdAt: new Date(0).toISOString(), ...schedToJSON(newCardState()), ...o };
}
function makePack(): OfflinePack {
  return {
    v: 1, uid: 7, deckId: 1, deckName: "Kanji", filtered: false, generatedAt: now.toISOString(), tz, rollover: 4, day: today,
    decks: [{ id: 1, parentId: null, name: "Kanji", position: 0, config: deckCfg, filtered: false }],
    cards: [packCard(1), packCard(2), packCard(3), packCard(4, { ...schedToJSON(reviewState()) })],
    notes: [1, 2, 3, 4].map((id) => ({ id, type: "basic" as const, fields: { front: `F${id} ![](https://blob.example/img${id}.png)`, back: `B${id}` }, tags: ["t"] })),
    studied: [], notesReviewedToday: [], load: [], media: [],
  };
}

describe("offline core: local study engine", () => {
  it("builds the same queue/limits locally and renders the first card", () => {
    const v = localStudyView(makePack(), now);
    expect(v.counts).toEqual({ new: 2, learning: 0, review: 1 });
    expect(v.card).not.toBeNull();
    expect(v.card!.front).toMatch(/^F\d/);
    expect(Object.keys(v.card!.intervals)).toEqual(["1", "2", "3", "4"]);
    expect(v.deck).toEqual({ id: 1, name: "Kanji", filtered: false });
  });

  it("answers locally with the shared scheduler, writes an outbox review and updates counts", () => {
    const p = makePack();
    const first = localStudyView(p, now).card!;
    const res = localAnswer(p, first.cardId, 3, { now, durationMs: 1200, id: "abc12345" });
    expect(res.review.id).toBe("abc12345");
    expect(res.review.cardId).toBe(first.cardId);
    expect(res.review.base).toBe(schedVersion(packCardSched(p.cards.find((c) => c.id === first.cardId)!)));
    const expected = answerCard(packCardSched(p.cards.find((c) => c.id === first.cardId)!), 3, { cfg: deckCfg, now, tz, rollover: 4, loadOn: () => 0, rng: () => 0.5 });
    expect(res.review.next.state).toBe(expected.card.state);
    const updated = res.pack.cards.find((c) => c.id === first.cardId)!;
    expect(schedVersion(packCardSched(updated))).toBe(schedVersion(schedFromJSON(res.review.next)!));
    // the original pack is not mutated
    expect(p.cards.find((c) => c.id === first.cardId)!.reps).toBe(packCardSched(p.cards.find((c) => c.id === first.cardId)!).reps);
    const v2 = localStudyView(res.pack, now);
    expect(v2.counts.new + v2.counts.learning + v2.counts.review).toBeGreaterThanOrEqual(2);
    expect(res.pack.notesReviewedToday).toContain(updated.noteId);
  });

  it("works through the whole local queue and ends empty", () => {
    let p = makePack();
    let t = now;
    for (let i = 0; i < 20; i++) {
      const v = localStudyView(p, t);
      if (!v.card) break;
      p = localAnswer(p, v.card.cardId, 4, { now: t, durationMs: 0, id: `id-${i}-xxxx` }).pack;
      t = new Date(t.getTime() + 60000);
    }
    const end = localStudyView(p, t);
    expect(end.card).toBeNull();
    expect(end.counts).toEqual({ new: 0, learning: 0, review: 0 });
  });

  it("resets 'studied today' counters when the study day rolls over", () => {
    let p = makePack();
    for (let i = 0; i < 10 && localStudyView(p, now).card; i++) {
      p = localAnswer(p, localStudyView(p, now).card!.cardId, 4, { now, durationMs: 0, id: `x${i}-12345678` }).pack;
    }
    expect(localStudyView(p, now).counts.new).toBe(0);
    expect(new Map(p.studied).get(1)?.new).toBe(2);
    const tomorrow = new Date(now.getTime() + 86400000);
    expect(localStudyView(p, tomorrow).counts.new).toBeGreaterThan(0);
  });

  it("undoes the last local answer", () => {
    const p = makePack();
    const c = localStudyView(p, now).card!;
    const res = localAnswer(p, c.cardId, 1, { now, durationMs: 0, id: "undo-1234" });
    const back = localUndo(res.pack, res.review);
    expect(back.cards.find((x) => x.id === c.cardId)).toEqual(p.cards.find((x) => x.id === c.cardId));
    expect(localStudyView(back, now).counts).toEqual(localStudyView(p, now).counts);
  });

  it("extracts media urls from note fields", () => {
    const urls = extractMediaUrls({ front: "a ![x](https://b.example/a.png) <img src=\"/api/media/1.jpg\">", back: "<audio src='https://b.example/s.mp3'></audio> [snd](https://b.example/t.ogg) [link](https://example.com)", image: "https://b.example/occ.webp" });
    expect(urls.sort()).toEqual(["/api/media/1.jpg", "https://b.example/a.png", "https://b.example/occ.webp", "https://b.example/s.mp3", "https://b.example/t.ogg"].sort());
  });
});
