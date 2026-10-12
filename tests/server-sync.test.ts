import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import * as decks from "@/server/repo/decks";
import * as notes from "@/server/repo/notes";
import * as cards from "@/server/repo/cards";
import { q } from "@/server/db";
import { answer } from "@/server/services/study";
import { buildOfflinePack, syncReviews } from "@/server/services/sync";
import { localAnswer, localStudyView, type OfflinePack, type OfflineReview } from "@/core/offline";
import { schedVersion } from "@/core/sync";

const revlogFor = (uid: number, cardId?: number) =>
  q(`SELECT id, card_id, rating, state, client_id, reviewed_at, day FROM ak_revlog WHERE user_id = $1 ${cardId ? "AND card_id = $2" : ""} ORDER BY reviewed_at, id`, cardId ? [uid, cardId] : [uid]);

const toDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));
let n = 0;
const rid = () => `rev-${Date.now().toString(36)}-${(n++).toString(36)}-abcdef`;

/** Answer the current card of a pack offline, like the browser does. */
function offlineAnswer(p: OfflinePack, rating: 1 | 2 | 3 | 4, when: Date, cardId?: number) {
  const v = localStudyView(p, when);
  const id = cardId ?? v.card!.cardId;
  return localAnswer(p, id, rating, { now: when, durationMs: 1500, id: rid() });
}

describe("offline pack + review sync on real Postgres (PGlite)", () => {
  let u: number, other: number, deck: number, child: number;
  beforeAll(async () => {
    await usePglite();
    u = (await users.createUser("off@test.dev", "h", "Off")).id;
    other = (await users.createUser("other@test.dev", "h", "Other")).id;
    deck = (await decks.createDeck(u, { name: "Offline", config: { fuzz: false, loadBalance: false, newPerDay: 5 } })).id;
    child = (await decks.createDeck(u, { name: "Child", parentId: deck, config: { fuzz: false, loadBalance: false, newPerDay: 5 } })).id;
    for (let i = 0; i < 4; i++) await notes.createNote(u, { deckId: i < 2 ? deck : child, type: "basic", fields: { front: `Q${i} ![i](https://blob.example/q${i}.png)`, back: `A${i}` }, tags: [] });
    for (let i = 0; i < 3; i++) await notes.createNote(u, { deckId: deck, type: "basic", fields: { front: `Extra${i}`, back: "x" }, tags: [] });
  });

  it("builds a pack with today's queue (respecting limits), notes, config and media", async () => {
    const p = (await buildOfflinePack(u, deck))!;
    expect(p.uid).toBe(u);
    expect(p.deckId).toBe(deck);
    expect(p.cards.length).toBe(5); // newPerDay = 5 of 7
    expect(new Set(p.cards.map((c) => c.noteId)).size).toBe(p.notes.length);
    expect(p.decks.map((d) => d.id).sort()).toEqual([deck, child].sort());
    expect(p.media.length).toBeGreaterThan(0);
    expect(p.media.every((m) => m.startsWith("https://blob.example/"))).toBe(true);
    const v = localStudyView(p, new Date());
    expect(v.counts.new).toBe(5);
    expect(await buildOfflinePack(other, deck)).toBeNull();
  });

  it("replays offline reviews into the revlog with client ids and timestamps, and accepts the client schedule", async () => {
    let p = (await buildOfflinePack(u, deck))!;
    const t0 = new Date(Date.now() - 5 * 60000);
    const reviews: OfflineReview[] = [];
    for (let i = 0; i < 3; i++) {
      const r = offlineAnswer(p, 3, new Date(t0.getTime() + i * 1000));
      p = r.pack; reviews.push(r.review);
    }
    const res = await syncReviews(u, { reviews: [...reviews].reverse() });
    expect(res.counts.applied).toBe(3);
    expect(res.results.every((x) => x.status === "applied")).toBe(true);
    const log = await revlogFor(u);
    expect(log.map((r) => r.client_id)).toEqual(reviews.map((r) => r.id));
    expect(toDate(log[0].reviewed_at).toISOString()).toBe(reviews[0].reviewedAt);
    expect(log[0].state).toBe("new");
    for (const r of reviews) {
      const c = (await cards.getCard(u, r.cardId))!;
      const local = p.cards.find((x) => x.id === r.cardId)!;
      expect(c.state).toBe(local.state);
      expect(c.due.toISOString()).toBe(local.due);
    }
    // idempotent: replaying the same batch is a no-op
    const again = await syncReviews(u, { reviews });
    expect(again.counts.duplicate).toBe(3);
    expect((await revlogFor(u)).length).toBe(3);
  });

  it("re-schedules from the server state when the card changed after the pack's base version", async () => {
    const p = (await buildOfflinePack(u, deck))!;
    const target = localStudyView(p, new Date()).card!.cardId;
    // answered online first (another device)…
    await answer(u, target, 1, 1000);
    const serverAfterOnline = (await cards.getCard(u, target))!;
    // …then the stale offline copy answers it too
    const off = offlineAnswer(p, 3, new Date(Date.now() + 1000), target);
    expect(off.review.base).not.toBe(schedVersion(serverAfterOnline));
    const res = await syncReviews(u, { reviews: [off.review] });
    expect(res.results[0].status).toBe("rescheduled");
    const log = await revlogFor(u, target);
    expect(log.map((r) => Number(r.rating))).toEqual([1, 3]); // revlog complete
    expect(log[1].state).toBe(serverAfterOnline.state); // replayed from the server state
    const c = (await cards.getCard(u, target))!;
    expect(c.reps).toBe(2);
  });

  it("replays in timestamp order when a server review is newer than the offline one", async () => {
    const p = (await buildOfflinePack(u, deck))!;
    const target = localStudyView(p, new Date()).card!.cardId;
    const off = offlineAnswer(p, 1, new Date(Date.now() - 10 * 60000), target); // 10 min ago, offline: Again
    await answer(u, target, 4, 1000); // now, online: Easy
    const res = await syncReviews(u, { reviews: [off.review] });
    expect(res.results[0].status).toBe("rescheduled");
    const log = await revlogFor(u, target);
    expect(log.map((r) => Number(r.rating))).toEqual([1, 4]); // ordered by reviewed_at
    const c = (await cards.getCard(u, target))!;
    expect(c.reps).toBe(2);
  });

  it("ignores reviews for missing/foreign cards and invalid payloads", async () => {
    const p = (await buildOfflinePack(u, deck))!;
    const off = offlineAnswer(p, 3, new Date());
    const foreign = await syncReviews(other, { reviews: [off.review] });
    expect(foreign.results[0].status).toBe("missing");
    const bad = await syncReviews(u, { reviews: [{ id: "x", cardId: "nope" }, { ...off.review, rating: 9 }] });
    expect(bad.results.map((r) => r.status)).toEqual(["invalid", "invalid"]);
    await expect(syncReviews(u, { reviews: "nope" })).rejects.toThrow();
    expect((await revlogFor(other)).length).toBe(0);
  });

  it("clamps future timestamps to now and stores the study day of the review", async () => {
    const p = (await buildOfflinePack(u, deck))!;
    const off = offlineAnswer(p, 3, new Date());
    const future = { ...off.review, id: rid(), reviewedAt: new Date(Date.now() + 86400000 * 3).toISOString() };
    const res = await syncReviews(u, { reviews: [future] });
    expect(["applied", "rescheduled"]).toContain(res.results[0].status);
    const row = (await q("SELECT reviewed_at FROM ak_revlog WHERE client_id = $1", [future.id]))[0];
    expect(toDate(row.reviewed_at).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
