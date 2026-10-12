import { listDecks, updateDeck, NotFoundError } from "../repo/decks";
import { q } from "../db";
import { userContext } from "./context";
import { descendantIds } from "@/core/tree";
import { revlogToTrainingItems, type TrainingReview } from "@/core/optimizer";
import { fsrs6Weights } from "@/core/fsrs-math";
import { shouldAdopt, type Metrics } from "@/core/autoopt";
import type { CardState } from "@/core/types";

export const MIN_TRAINING_ITEMS = 32;

/** Training + evaluation backend. Production uses the official fsrs-rs binding; tests inject a fake. */
export interface Trainer {
  train(items: TrainingReview[][], enableShortTerm: boolean): Promise<number[]>;
  /** Log-loss / RMSE(bins) of `weights` on `items`, or null when it cannot be evaluated. */
  evaluate(items: TrainingReview[][], weights: number[]): Metrics | null;
}

export async function bindingTrainer(): Promise<Trainer> {
  const binding = await import("@open-spaced-repetition/binding");
  const toItems = (items: TrainingReview[][]) => items.map((it) => new binding.FSRSBindingItem(it.map((r) => new binding.FSRSBindingReview(r.rating, r.deltaT))));
  return {
    async train(items, enableShortTerm) {
      return binding.computeParameters(toItems(items), { enableShortTerm, timeout: 20000 });
    },
    evaluate(items, weights) {
      try {
        const e = new binding.FSRSBinding(weights).evaluate(toItems(items));
        return { logLoss: e.logLoss, rmse: e.rmseBins };
      } catch { return null; }
    },
  };
}

export async function deckTrainingData(uid: number, deckId: number) {
  const decks = await listDecks(uid);
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) throw new NotFoundError("deck_not_found");
  const ids = descendantIds(decks, deckId);
  const ctx = await userContext(uid);
  const rows = await q("SELECT card_id, rating, state, reviewed_at FROM ak_revlog WHERE user_id = $1 AND deck_id = ANY($2::int[]) ORDER BY reviewed_at", [uid, ids]);
  const items = revlogToTrainingItems(rows.map((r) => ({ cardId: Number(r.card_id), rating: Number(r.rating), state: r.state as CardState, reviewedAt: new Date(String(r.reviewed_at instanceof Date ? r.reviewed_at.toISOString() : r.reviewed_at)) })), ctx.tz, ctx.rollover);
  return { deck, ids, items, reviewCount: rows.length };
}

const round4 = (w: number[]) => w.map((x) => Math.round(x * 10000) / 10000);

/**
 * Train FSRS-6 parameters from the user's own review log using the official fsrs-rs binding.
 * Every run is recorded in ak_fsrs_params with before/after log-loss and RMSE.
 * Manual runs always adopt (the user asked); auto runs (`adoptOnlyIfBetter`) adopt only on improvement.
 */
export async function optimizeDeck(uid: number, deckId: number, opts: { source?: "manual" | "auto"; adoptOnlyIfBetter?: boolean; trainer?: Trainer } = {}) {
  const source = opts.source ?? "manual";
  const { deck, ids, items, reviewCount } = await deckTrainingData(uid, deckId);
  const record = (r: { adopted: boolean; weights: number[] | null; metrics: Metrics | null; prev: Metrics | null }) =>
    q(`INSERT INTO ak_fsrs_params (user_id, deck_id, source, adopted, weights, prev_weights, log_loss, rmse, prev_log_loss, prev_rmse, items, review_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [uid, deckId, source, r.adopted, r.weights ? JSON.stringify(r.weights) : null, deck.config.fsrsWeights ? JSON.stringify(deck.config.fsrsWeights) : null,
      r.metrics?.logLoss ?? null, r.metrics?.rmse ?? null, r.prev?.logLoss ?? null, r.prev?.rmse ?? null, items.length, reviewCount]);
  if (items.length < MIN_TRAINING_ITEMS) {
    if (source === "auto") await record({ adopted: false, weights: null, metrics: null, prev: null }); // counts as an attempt for gating
    return { ok: false as const, reason: "not_enough_reviews", items: items.length, needed: MIN_TRAINING_ITEMS };
  }
  let trainer = opts.trainer;
  if (!trainer) {
    try { trainer = await bindingTrainer(); } catch (e) {
      return { ok: false as const, reason: "optimizer_unavailable", detail: String(e).slice(0, 200), items: items.length };
    }
  }
  const weights = await trainer.train(items, deck.config.enableShortTerm);
  if (!Array.isArray(weights) || weights.length < 19 || !weights.every(Number.isFinite)) return { ok: false as const, reason: "optimizer_failed", items: items.length };
  const rounded = round4(weights);
  const prev = trainer.evaluate(items, fsrs6Weights(deck.config.fsrsWeights));
  const metrics = trainer.evaluate(items, rounded);
  const adopted = opts.adoptOnlyIfBetter ? !!metrics && shouldAdopt(prev, metrics) : true;
  if (adopted) for (const id of ids) await updateDeck(uid, id, { config: { fsrsWeights: rounded } });
  const [row] = await record({ adopted, weights: rounded, metrics, prev });
  return {
    ok: true as const, weights: rounded, items: items.length, decks: ids.length,
    metrics: { logLoss: metrics?.logLoss ?? null, rmse: metrics?.rmse ?? null, prevLogLoss: prev?.logLoss ?? null, prevRmse: prev?.rmse ?? null, adopted, versionId: Number(row.id) },
  };
}
