import { q } from "../db";
import { listDecks, getDeck } from "../repo/decks";
import { getCardsInDecks, getCard, updateSched, reviewLoadByDay } from "../repo/cards";
import { bulkTags } from "../repo/notes";
import { studiedToday, notesReviewedToday } from "../repo/revlog";
import { schedSnapshot, type Card } from "../repo/mappers";
import { userContext } from "./context";
import { buildQueue, type QueueDeck } from "@/core/queue";
import { descendantIds } from "@/core/tree";
import { answerCard } from "@/core/answer";
import { dayIndex } from "@/core/time";
import { extractMediaUrls, type OfflinePack, type PackCard, type PackNote } from "@/core/offline";
import { mergeCardReviews, schedFromJSON, schedToJSON, sortReviews, type HistoryEntry, type IncomingReview } from "@/core/sync";
import type { NoteFields, NoteType, Rating } from "@/core/types";
import { getNoteTypesByIds } from "../repo/notetypes";

const MAX_BATCH = 500;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function packCard(c: Card): PackCard {
  return {
    id: c.id, noteId: c.noteId, deckId: c.deckId, homeDeckId: c.homeDeckId, ord: c.ord, suspended: c.suspended, buriedDay: c.buriedDay,
    flag: c.flag, leech: c.leech, position: c.position, createdAt: c.createdAt.toISOString(), ...schedToJSON(c),
  };
}

/** Today's study queue for a deck subtree, packaged for offline use (cards, notes, configs, counters, media urls). */
export async function buildOfflinePack(uid: number, deckId: number): Promise<OfflinePack | null> {
  const deck = await getDeck(uid, deckId);
  if (!deck || deck.deletedAt) return null;
  const ctx = await userContext(uid);
  const all = await listDecks(uid);
  const ids = descendantIds(all, deckId);
  const cards = await getCardsInDecks(uid, ids);
  const toQD = (d: (typeof all)[number]): QueueDeck => ({ id: d.id, parentId: d.parentId, name: d.name, position: d.position, config: d.config, filtered: d.filtered });
  const studied = await studiedToday(uid, ctx.today);
  const reviewedNotes = await notesReviewedToday(uid, ctx.today);
  const queue = buildQueue({ decks: all.map(toQD), rootId: deckId, cards, studied, notesReviewedToday: reviewedNotes, now: ctx.now, tz: ctx.tz, rollover: ctx.rollover });
  const picked = new Map<number, Card>();
  for (const c of queue.cards as Card[]) picked.set(c.id, c);
  for (const c of cards) if (!c.suspended && (c.state === "learning" || c.state === "relearning")) picked.set(c.id, c);
  const packCards = [...picked.values()];
  const deckIds = new Set<number>(ids);
  for (const c of packCards) if (c.homeDeckId) deckIds.add(c.homeDeckId);
  const noteIds = [...new Set(packCards.map((c) => c.noteId))];
  const noteRows = noteIds.length
    ? await q("SELECT id, type, notetype_id, fields, tags FROM ak_notes WHERE user_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL", [uid, noteIds]) : [];
  const notes: PackNote[] = noteRows.map((r) => ({ id: Number(r.id), type: r.type as NoteType, fields: (r.fields ?? {}) as NoteFields, tags: (r.tags as string[]) ?? [], ...(r.notetype_id != null ? { notetypeId: Number(r.notetype_id) } : {}) }));
  const ntIds = [...new Set(notes.map((n) => n.notetypeId).filter((x): x is number => x != null))];
  const noteTypes = ntIds.length ? [...(await getNoteTypesByIds(uid, ntIds)).values()] : [];
  const media = [...new Set(notes.flatMap((n) => extractMediaUrls(n.fields)))];
  const load = await reviewLoadByDay(uid, ctx.offset, ctx.rollover);
  return {
    v: 1, uid, deckId, deckName: deck.name, filtered: deck.filtered, generatedAt: ctx.now.toISOString(), tz: ctx.tz, rollover: ctx.rollover, day: ctx.today,
    decks: all.filter((d) => deckIds.has(d.id)).map(toQD), cards: packCards.map(packCard), notes,
    studied: [...studied.entries()], notesReviewedToday: [...reviewedNotes], load: [...load.entries()], media, ...(noteTypes.length ? { noteTypes } : {}),
  };
}

export type SyncStatus = "applied" | "rescheduled" | "duplicate" | "missing" | "invalid";
export interface SyncResult { results: { id: string; status: SyncStatus }[]; counts: Record<SyncStatus, number> }

function parseReview(x: unknown, now: Date): IncomingReview | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const cardId = Number(o.cardId);
  const rating = Number(o.rating);
  const at = new Date(typeof o.reviewedAt === "string" || typeof o.reviewedAt === "number" ? o.reviewedAt : NaN);
  if (!ID_RE.test(id) || !Number.isInteger(cardId) || cardId <= 0 || ![1, 2, 3, 4].includes(rating) || Number.isNaN(at.getTime()) || typeof o.base !== "string") return null;
  // never trust a clock that is ahead of the server; very old reviews are fine (revlog keeps them)
  const reviewedAt = at.getTime() > now.getTime() ? now : at;
  return { id, cardId, rating: rating as Rating, reviewedAt, durationMs: Math.max(0, Math.min(3_600_000, Number(o.durationMs) || 0)), base: o.base, next: schedFromJSON(o.next) };
}

/**
 * Idempotent replay of reviews answered offline. Reviews are processed per card in timestamp order;
 * see core/sync.mergeCardReviews for the conflict rule. Duplicate ids are ignored.
 */
export async function syncReviews(uid: number, payload: unknown): Promise<SyncResult> {
  const raw = (payload as { reviews?: unknown })?.reviews;
  if (!Array.isArray(raw)) throw Object.assign(new Error("invalid_payload"), { status: 400 });
  if (raw.length > MAX_BATCH) throw Object.assign(new Error("batch_too_large"), { status: 413 });
  const now = new Date();
  const status = new Map<string, SyncStatus>();
  const parsed = raw.map((x) => {
    const r = parseReview(x, now);
    const rawId = (x as { id?: unknown })?.id;
    return { id: r?.id ?? (typeof rawId === "string" ? rawId.slice(0, 64) : ""), review: r };
  });
  const valid = parsed.flatMap((p) => (p.review ? [p.review] : []));
  const reviews = sortReviews(valid);
  if (reviews.length) {
    const existing = await q("SELECT client_id FROM ak_revlog WHERE user_id = $1 AND client_id = ANY($2::text[])", [uid, reviews.map((r) => r.id)]);
    for (const e of existing) status.set(String(e.client_id), "duplicate");
  }
  const todo = reviews.filter((r) => !status.has(r.id));
  const byCard = new Map<number, IncomingReview[]>();
  for (const r of todo) byCard.set(r.cardId, [...(byCard.get(r.cardId) ?? []), r]);

  if (byCard.size) {
    const ctx = await userContext(uid);
    const load = await reviewLoadByDay(uid, ctx.offset, ctx.rollover);
    for (const [cardId, list] of byCard) {
      const card = await getCard(uid, cardId);
      const configDeckId = card ? card.homeDeckId ?? card.deckId : 0;
      const deck = card ? await getDeck(uid, configDeckId) : null;
      if (!card || !deck) { list.forEach((r) => status.set(r.id, "missing")); continue; }
      const laterRows = await q(
        "SELECT reviewed_at, rating, snapshot FROM ak_revlog WHERE user_id = $1 AND card_id = $2 AND reviewed_at > $3 ORDER BY reviewed_at, id",
        [uid, cardId, list[0].reviewedAt]);
      const later: HistoryEntry[] = laterRows.map((r) => ({ reviewedAt: new Date(String(r.reviewed_at instanceof Date ? r.reviewed_at.toISOString() : r.reviewed_at)), rating: Number(r.rating) as Rating, snapshot: schedFromJSON(r.snapshot) }));
      const cfg = deck.config;
      const merged = mergeCardReviews(card, list, later, {
        leechThreshold: cfg.leechThreshold,
        answer: (s, rating, at) => answerCard(s, rating, { cfg, now: at, tz: ctx.tz, rollover: ctx.rollover, loadOn: (d) => load.get(d) ?? 0 }),
      });
      let inserted = 0;
      for (const st of merged.steps) {
        const r = st.review;
        const snapshot = { ...schedSnapshot({ ...card, ...st.prev }), suspended: card.suspended, buriedDay: card.buriedDay, leech: card.leech };
        const rows = await q(
          `INSERT INTO ak_revlog (user_id, card_id, deck_id, note_id, rating, state, due, stability, difficulty, elapsed_days, scheduled_days, duration_ms, reviewed_at, day, algorithm, snapshot, client_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (user_id, client_id) DO NOTHING RETURNING id`,
          [uid, cardId, configDeckId, card.noteId, r.rating, st.prev.state, st.next.due, st.next.stability, st.next.difficulty, st.next.elapsedDays, st.next.scheduledDays,
            Math.round(r.durationMs), r.reviewedAt, dayIndex(r.reviewedAt, ctx.tz, ctx.rollover), cfg.algorithm, JSON.stringify(snapshot), r.id]);
        if (rows.length) { inserted++; status.set(r.id, merged.conflict ? "rescheduled" : "applied"); } else status.set(r.id, "duplicate");
      }
      if (!inserted) continue;
      const oldDay = card.state === "review" ? dayIndex(card.due, ctx.tz, ctx.rollover) : null;
      await updateSched(uid, cardId, merged.final, merged.leech ? { leech: true, ...(cfg.leechAction === "suspend" ? { suspended: true } : {}) } : {});
      if (merged.leech) await bulkTags(uid, [card.noteId], ["leech"], []);
      if (oldDay != null) load.set(oldDay, Math.max(0, (load.get(oldDay) ?? 1) - 1));
      if (merged.final.state === "review") { const d = dayIndex(merged.final.due, ctx.tz, ctx.rollover); load.set(d, (load.get(d) ?? 0) + 1); }
    }
  }
  const counts: Record<SyncStatus, number> = { applied: 0, rescheduled: 0, duplicate: 0, missing: 0, invalid: 0 };
  const results = parsed.map((p) => {
    const st: SyncStatus = p.review ? status.get(p.id) ?? "invalid" : "invalid";
    counts[st]++;
    return { id: p.id, status: st };
  });
  return { results, counts };
}
