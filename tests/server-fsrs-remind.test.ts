import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import * as decks from "@/server/repo/decks";
import * as notes from "@/server/repo/notes";
import { q } from "@/server/db";
import { getPrefs, updatePrefs } from "@/server/services/prefs";
import { optimizeDeck, type Trainer } from "@/server/services/optimizer";
import { autoOptimizeUser, listParamVersions, revertParams } from "@/server/services/autoopt";
import { simulateDeck } from "@/server/services/simulate";
import { goalStatus } from "@/server/services/goal";
import { timingStats } from "@/server/services/timing";
import { saveSubscription, removeSubscription, runReminders } from "@/server/services/reminders";
import { dayIndex } from "@/core/time";

/** Fake trainer: deterministic weights + metrics so gating/adoption can be tested without the WASM optimizer. */
function fakeTrainer(candidate: { logLoss: number; rmse: number }, current: { logLoss: number; rmse: number }): Trainer & { calls: number } {
  const t = {
    calls: 0,
    async train() { t.calls++; return Array.from({ length: 21 }, (_, i) => 0.5 + i / 100); },
    evaluate(_items: unknown, w: number[] | null) { return w && w[0] === 0.5 ? candidate : current; },
  };
  return t;
}

async function seedReviews(uid: number, deckId: number, cardIds: number[], perCard: number, startDay: number, tz = "Asia/Shanghai") {
  const rows: string[] = [];
  cardIds.forEach((cid, idx) => {
    for (let i = 0; i < perCard; i++) {
      const at = Date.UTC(2026, 0, 1) + (startDay + i * 3) * 86400000 + idx * 60000;
      const day = dayIndex(new Date(at), tz, 4);
      rows.push(`(${uid}, ${cid}, ${deckId}, ${(cid + i) % 7 === 0 ? 1 : 3}, '${i === 0 ? "new" : "review"}', now(), to_timestamp(${at / 1000}), ${day}, ${4000 + ((cid * 37 + i * 101) % 9000)})`);
    }
  });
  for (let i = 0; i < rows.length; i += 500) await q(`INSERT INTO ak_revlog (user_id, card_id, deck_id, rating, state, due, reviewed_at, day, duration_ms) VALUES ${rows.slice(i, i + 500).join(",")}`);
}

describe("fsrs-remind server features", () => {
  let u: number, root: number, child: number, cardIds: number[];
  beforeAll(async () => {
    await usePglite();
    u = (await users.createUser("fr@test.dev", "h", "FR")).id;
    root = (await decks.createDeck(u, { name: "Lang" })).id;
    child = (await decks.createDeck(u, { name: "Verbs", parentId: root })).id;
    for (let i = 0; i < 60; i++) await notes.createNote(u, { deckId: child, type: "basic", fields: { front: `q${i}`, back: "a" }, tags: [] });
    cardIds = (await q("SELECT id FROM ak_cards WHERE user_id = $1 ORDER BY id", [u])).map((r) => Number(r.id));
  });

  it("study prefs have defaults and validate updates", async () => {
    expect(await getPrefs(u)).toMatchObject({ autoOptimize: true, goalType: "cards", goalTarget: 30, reminderEnabled: false });
    const p = await updatePrefs(u, { goalType: "minutes", goalTarget: 15, reminderHour: 7, bogus: 1 } as never);
    expect(p).toMatchObject({ goalType: "minutes", goalTarget: 15, reminderHour: 7 });
    expect((await getPrefs(u)).goalTarget).toBe(15);
    await updatePrefs(u, { goalType: "cards", goalTarget: 30 });
  });

  it("auto-optimize waits for enough reviews, then trains and adopts only better parameters", async () => {
    const better = fakeTrainer({ logLoss: 0.3, rmse: 0.03 }, { logLoss: 0.4, rmse: 0.05 });
    expect((await autoOptimizeUser(u, { trainer: better })).filter((r) => r.ran)).toHaveLength(0); // no reviews yet
    await seedReviews(u, child, cardIds, 7, 0); // 420 reviews ≥ 400
    const res = await autoOptimizeUser(u, { trainer: better });
    expect(better.calls).toBe(1);
    expect(res.find((r) => r.deckId === root)).toMatchObject({ ran: true, adopted: true });
    expect((await decks.getDeck(u, child))!.config.fsrsWeights![0]).toBe(0.5);
    // immediately again: gated (too soon / too few new reviews)
    await autoOptimizeUser(u, { trainer: better });
    expect(better.calls).toBe(1);
    // 8 days later, but only a handful of new reviews → still gated
    expect((await autoOptimizeUser(u, { trainer: better, now: new Date(Date.now() + 8 * 86400000) }))[0].reason).toBe("too_few_reviews");
  });

  it("rejects worse parameters but keeps the attempt in history; manual optimize always records metrics", async () => {
    await q("UPDATE ak_fsrs_params SET created_at = now() - interval '10 days' WHERE user_id = $1", [u]);
    await seedReviews(u, child, cardIds, 7, 100);
    const worse = fakeTrainer({ logLoss: 0.5, rmse: 0.06 }, { logLoss: 0.4, rmse: 0.05 });
    // current weights start with 0.5 too → make current evaluate differently by resetting to defaults first
    await decks.applyConfigToSubtree(u, root, { fsrsWeights: null });
    const res = await autoOptimizeUser(u, { trainer: worse });
    expect(res[0]).toMatchObject({ ran: true, adopted: false });
    expect((await decks.getDeck(u, child))!.config.fsrsWeights).toBeNull();
    const hist = await listParamVersions(u, root);
    expect(hist.length).toBe(2);
    expect(hist[0]).toMatchObject({ source: "auto", adopted: false, logLoss: 0.5, prevLogLoss: 0.4 });
    const manual = await optimizeDeck(u, root, { trainer: worse });
    expect(manual.ok).toBe(true);
    if (manual.ok) expect(manual.metrics).toMatchObject({ logLoss: 0.5, prevLogLoss: 0.4, adopted: true });
  });

  it("can revert to the previous parameters or re-apply any version", async () => {
    const hist = await listParamVersions(u, root);
    const latest = hist[0];
    await revertParams(u, root, latest.id, "previous");
    expect((await decks.getDeck(u, child))!.config.fsrsWeights).toEqual(latest.prevWeights);
    const firstAdopted = hist.find((h) => h.adopted && h.source === "auto")!;
    await revertParams(u, root, firstAdopted.id, "weights");
    expect((await decks.getDeck(u, child))!.config.fsrsWeights).toEqual(firstAdopted.weights);
    expect((await listParamVersions(u, root))[0].source).toBe("revert");
    await expect(revertParams(u, root, 999999, "weights")).rejects.toThrow();
  });

  it("auto-optimize is off when the user disables it", async () => {
    await updatePrefs(u, { autoOptimize: false });
    const t = fakeTrainer({ logLoss: 0.1, rmse: 0.01 }, { logLoss: 0.4, rmse: 0.05 });
    expect(await autoOptimizeUser(u, { trainer: t, now: new Date(Date.now() + 30 * 86400000) })).toEqual([]);
    await updatePrefs(u, { autoOptimize: true });
  });

  it("simulates the deck's workload across retentions with costs from the user's answer times", async () => {
    const sim = await simulateDeck(u, root, {});
    expect(sim.points).toHaveLength(28);
    expect(sim.collection.newCards + sim.collection.reviewCards).toBeGreaterThan(0);
    expect(sim.costs.pass).toBeGreaterThan(0);
    expect(sim.optimal === null || (sim.optimal >= 0.7 && sim.optimal <= 0.97)).toBe(true);
    const overridden = await simulateDeck(u, root, { newPerDay: 0, weights: Array.from({ length: 21 }, (_, i) => [0.2, 1.2, 3.2, 15.7, 7.2, 0.53, 1.46, 0.005, 1.55, 0.12, 1.01, 1.93, 0.11, 0.3, 2.3, 0.23, 2.99, 0.52, 0.66, 0.15, 0.15][i]) });
    expect(overridden.points[0].weekly[0].reviews).toBeGreaterThanOrEqual(0);
  });

  it("reports goal progress and the goal streak", async () => {
    const g = await goalStatus(u);
    expect(g.goal).toEqual({ type: "cards", target: 30 });
    expect(g.today.done).toBe(0);
    expect(g.streak).toBe(0);
    expect(g.today.ratio).toBe(0);
  });

  it("summarizes response times and lists slow cards", async () => {
    await q("UPDATE ak_revlog SET duration_ms = 45000 WHERE user_id = $1 AND card_id = $2", [u, cardIds[0]]);
    const s = await timingStats(u, null);
    expect(s.summary.count).toBeGreaterThan(400);
    expect(s.summary.medianMs).toBeGreaterThan(3000);
    expect(s.slow[0]).toMatchObject({ cardId: cardIds[0] });
    expect(s.slow[0].front).toContain("q0");
  });

  it("sends reminders once per reminder moment to subscribed users and prunes dead subscriptions", async () => {
    await saveSubscription(u, { endpoint: "https://push.example/a", keys: { p256dh: "x", auth: "y" } }, "test");
    await saveSubscription(u, { endpoint: "https://push.example/gone", keys: { p256dh: "x", auth: "y" } }, "test");
    await updatePrefs(u, { reminderEnabled: true, reminderHour: 0, reminderQuiet: false });
    const sent: string[] = [];
    const sender = async (sub: { endpoint: string }) => { sent.push(sub.endpoint); return { status: sub.endpoint.endsWith("gone") ? 410 : 201, gone: sub.endpoint.endsWith("gone") }; };
    const r1 = await runReminders({ sender });
    expect(r1.users).toBe(1);
    expect(sent.sort()).toEqual(["https://push.example/a", "https://push.example/gone"]);
    expect((await q("SELECT endpoint FROM ak_push_subs WHERE user_id = $1", [u])).map((r) => r.endpoint)).toEqual(["https://push.example/a"]);
    const r2 = await runReminders({ sender });
    expect(r2.users).toBe(0); // already sent for this reminder moment
    await removeSubscription(u, "https://push.example/a");
    expect((await q("SELECT count(*)::int AS n FROM ak_push_subs WHERE user_id = $1", [u]))[0].n).toBe(0);
  });

  it("quiet reminders skip users with nothing due", async () => {
    const v = (await users.createUser("quiet@test.dev", "h", "Q")).id;
    await saveSubscription(v, { endpoint: "https://push.example/q", keys: { p256dh: "x", auth: "y" } }, "");
    await updatePrefs(v, { reminderEnabled: true, reminderHour: 0, reminderQuiet: true });
    const sent: string[] = [];
    await runReminders({ sender: async (s) => { sent.push(s.endpoint); return { status: 201, gone: false }; } });
    expect(sent).not.toContain("https://push.example/q");
  });
});
