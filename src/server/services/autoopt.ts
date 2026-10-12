import { q } from "../db";
import { listDecks, updateDeck, NotFoundError } from "../repo/decks";
import { descendantIds } from "@/core/tree";
import { shouldAutoOptimize, AUTO_OPT_DEFAULTS, type AutoOptOptions } from "@/core/autoopt";
import { getPrefs } from "./prefs";
import { optimizeDeck, type Trainer } from "./optimizer";

export interface ParamVersion {
  id: number; deckId: number; source: "manual" | "auto" | "revert"; adopted: boolean;
  weights: number[] | null; prevWeights: number[] | null;
  logLoss: number | null; rmse: number | null; prevLogLoss: number | null; prevRmse: number | null;
  items: number; reviewCount: number; createdAt: string;
}
const nn = (v: unknown) => (v == null ? null : Number(v));
const toVersion = (r: Record<string, unknown>): ParamVersion => ({
  id: Number(r.id), deckId: Number(r.deck_id), source: r.source as ParamVersion["source"], adopted: !!r.adopted,
  weights: (r.weights as number[] | null) ?? null, prevWeights: (r.prev_weights as number[] | null) ?? null,
  logLoss: nn(r.log_loss), rmse: nn(r.rmse), prevLogLoss: nn(r.prev_log_loss), prevRmse: nn(r.prev_rmse),
  items: Number(r.items), reviewCount: Number(r.review_count), createdAt: new Date(String(r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at)).toISOString(),
});

export async function listParamVersions(uid: number, deckId: number, limit = 20): Promise<ParamVersion[]> {
  const rows = await q("SELECT * FROM ak_fsrs_params WHERE user_id = $1 AND deck_id = $2 ORDER BY created_at DESC, id DESC LIMIT $3", [uid, deckId, limit]);
  return rows.map(toVersion);
}

async function reviewCount(uid: number, ids: number[]) {
  return Number((await q("SELECT count(*)::int AS n FROM ak_revlog WHERE user_id = $1 AND deck_id = ANY($2::int[])", [uid, ids]))[0]?.n ?? 0);
}

/** Apply a stored version's weights ("weights") or the weights it replaced ("previous") to the deck subtree. */
export async function revertParams(uid: number, deckId: number, versionId: number, target: "weights" | "previous") {
  const rows = await q("SELECT * FROM ak_fsrs_params WHERE user_id = $1 AND deck_id = $2 AND id = $3", [uid, deckId, versionId]);
  if (!rows[0]) throw new NotFoundError("version_not_found");
  const v = toVersion(rows[0]);
  const weights = target === "previous" ? v.prevWeights : v.weights;
  if (target === "weights" && !weights) throw new NotFoundError("version_has_no_weights");
  const decks = await listDecks(uid);
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) throw new NotFoundError("deck_not_found");
  const ids = descendantIds(decks, deckId);
  for (const id of ids) await updateDeck(uid, id, { config: { fsrsWeights: weights } });
  await q(`INSERT INTO ak_fsrs_params (user_id, deck_id, source, adopted, weights, prev_weights, log_loss, rmse, items, review_count)
           VALUES ($1, $2, 'revert', true, $3, $4, $5, $6, $7, $8)`,
  [uid, deckId, weights ? JSON.stringify(weights) : null, deck.config.fsrsWeights ? JSON.stringify(deck.config.fsrsWeights) : null,
    target === "previous" ? v.prevLogLoss : v.logLoss, target === "previous" ? v.prevRmse : v.rmse, v.items, await reviewCount(uid, ids)]);
  return { weights };
}

export interface AutoResult { deckId: number; ran: boolean; reason: string; adopted?: boolean; error?: string }

/**
 * Re-train each top-level FSRS deck (a "preset": config is applied to its whole subtree) when it has
 * gathered ≥N new reviews and ≥7 days since its last optimization. Adopts only better parameters.
 */
export async function autoOptimizeUser(uid: number, opts: { now?: Date; trainer?: Trainer; options?: AutoOptOptions; deadline?: number } = {}): Promise<AutoResult[]> {
  const prefs = await getPrefs(uid);
  if (!prefs.autoOptimize) return [];
  const now = opts.now ?? new Date();
  const decks = await listDecks(uid);
  const roots = decks.filter((d) => d.parentId == null && !d.filtered);
  const out: AutoResult[] = [];
  for (const root of roots) {
    if (opts.deadline && Date.now() > opts.deadline) { out.push({ deckId: root.id, ran: false, reason: "time_budget" }); continue; }
    const ids = descendantIds(decks, root.id);
    const last = (await q("SELECT review_count, created_at FROM ak_fsrs_params WHERE user_id = $1 AND deck_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1", [uid, root.id]))[0];
    const count = await reviewCount(uid, ids);
    const gate = shouldAutoOptimize({
      enabled: true, algorithm: root.config.algorithm, now,
      reviewsSinceLast: count - (last ? Number(last.review_count) : 0),
      lastAt: last ? new Date(String(last.created_at instanceof Date ? last.created_at.toISOString() : last.created_at)) : null,
    }, opts.options ?? AUTO_OPT_DEFAULTS);
    if (!gate.run) { out.push({ deckId: root.id, ran: false, reason: gate.reason }); continue; }
    try {
      const res = await optimizeDeck(uid, root.id, { source: "auto", adoptOnlyIfBetter: true, trainer: opts.trainer });
      out.push(res.ok ? { deckId: root.id, ran: true, reason: "ok", adopted: res.metrics.adopted } : { deckId: root.id, ran: false, reason: res.reason });
    } catch (e) {
      out.push({ deckId: root.id, ran: false, reason: "error", error: String(e).slice(0, 200) });
    }
  }
  return out;
}

/** Users with recent reviews and auto-optimize not disabled (for the daily cron). */
export async function autoOptimizeCandidates(sinceDays = 8): Promise<number[]> {
  const rows = await q(
    `SELECT DISTINCT r.user_id FROM ak_revlog r LEFT JOIN ak_study_prefs p ON p.user_id = r.user_id
     WHERE r.reviewed_at > now() - ($1::int * interval '1 day') AND COALESCE((p.prefs->>'autoOptimize')::boolean, true)`, [sinceDays]);
  return rows.map((r) => Number(r.user_id));
}
