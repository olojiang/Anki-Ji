/**
 * Offline study engine. A "pack" is today's queue for one deck (cards + notes + the context the
 * queue builder needs), downloaded while online. Offline, the client builds the queue and schedules
 * answers with exactly the same core code the server uses (buildQueue / answerCard / renderCard).
 * Pure: no IndexedDB / fetch here.
 */
import type { NoteFields, NoteType, Rating, SchedState } from "./types";
import { buildQueue, type QueueCard, type QueueDeck } from "./queue";
import { answerCard, previewIntervals, formatInterval } from "./answer";
import { renderCard, type RenderedCard } from "./notes";
import type { NoteTypeDef } from "./notetypes";
import { createScheduler } from "./scheduler";
import { dayIndex } from "./time";
import { schedFromJSON, schedToJSON, schedVersion, type SchedJSON } from "./sync";

export interface PackCard extends SchedJSON {
  id: number; noteId: number; deckId: number; homeDeckId: number | null; ord: number;
  suspended: boolean; buriedDay: number | null; flag: number; leech: boolean; position: number; createdAt: string;
}
export interface PackNote { id: number; type: NoteType; fields: NoteFields; tags: string[]; notetypeId?: number | null }
export interface OfflinePack {
  v: 1; uid: number; deckId: number; deckName: string; filtered: boolean; generatedAt: string;
  tz: string; rollover: number; day: number; // study day the counters below belong to
  decks: QueueDeck[]; cards: PackCard[]; notes: PackNote[];
  studied: [number, { new: number; review: number }][]; notesReviewedToday: number[]; load: [number, number][];
  media: string[];
  /** Custom note types used by the pack's notes (feat/notetypes), so they render offline with their templates. */
  noteTypes?: (NoteTypeDef & { id: number })[];
}

/** One answered-offline review, as stored in the outbox and POSTed to /api/sync/reviews. */
export interface OfflineReview {
  id: string; deckId: number; cardId: number; rating: Rating; reviewedAt: string; durationMs: number;
  base: string; prev: SchedJSON; prevFlags: { leech: boolean; suspended: boolean }; next: SchedJSON; leech: boolean;
}

export interface StudyCardView extends RenderedCard {
  cardId: number; noteId: number; deckId: number; type: NoteType; ord: number; state: string;
  intervals: Record<string, string>; flag: number; leech: boolean; tags: string[];
  retrievability: number | null; stability: number; difficulty: number; reps: number; lapses: number;
}
export interface StudyView {
  deck: { id: number; name: string; filtered: boolean };
  counts: { new: number; learning: number; review: number };
  card: StudyCardView | null; nextLearningAt: string | null;
}

export function packCardSched(c: PackCard): SchedState {
  return schedFromJSON(c) ?? { state: "new", due: new Date(0), stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, step: 0, lastReview: null, ease: 0, box: 0 };
}
function toQueueCard(c: PackCard): QueueCard {
  return { ...packCardSched(c), id: c.id, noteId: c.noteId, deckId: c.deckId, homeDeckId: c.homeDeckId, suspended: c.suspended, buriedDay: c.buriedDay, position: c.position, createdAt: new Date(c.createdAt) };
}
const cfgFor = (p: OfflinePack, c: PackCard) => (p.decks.find((d) => d.id === (c.homeDeckId ?? c.deckId)) ?? p.decks.find((d) => d.id === p.deckId) ?? p.decks[0]).config;

/** Counters reset when the study day rolls over while offline. */
function current(p: OfflinePack, now: Date) {
  const today = dayIndex(now, p.tz, p.rollover);
  const fresh = today === p.day;
  return {
    today,
    studied: new Map(fresh ? p.studied : []),
    notes: new Set(fresh ? p.notesReviewedToday : []),
  };
}

export function localStudyView(p: OfflinePack, now: Date): StudyView {
  const cur = current(p, now);
  const queue = buildQueue({ decks: p.decks, rootId: p.deckId, cards: p.cards.map(toQueueCard), studied: cur.studied, notesReviewedToday: cur.notes, now, tz: p.tz, rollover: p.rollover });
  const first = queue.cards[0];
  let card: StudyCardView | null = null;
  if (first) {
    const pc = p.cards.find((c) => c.id === first.id)!;
    const note = p.notes.find((n) => n.id === pc.noteId);
    if (note) {
      const cfg = cfgFor(p, pc);
      const iv = previewIntervals(first, { cfg, now, tz: p.tz, rollover: p.rollover, loadOn: () => 0 });
      card = {
        cardId: pc.id, noteId: pc.noteId, deckId: pc.deckId, type: note.type, ord: pc.ord, state: first.state, ...renderCard(note.type, note.fields, pc.ord, note.type === "custom" ? p.noteTypes?.find((t) => t.id === note.notetypeId) ?? null : null, { tags: note.tags, deck: p.deckName }),
        intervals: Object.fromEntries(Object.entries(iv).map(([k, v]) => [k, formatInterval(v)])),
        flag: pc.flag, leech: pc.leech, tags: note.tags,
        retrievability: createScheduler(cfg).retrievability(first, now), stability: first.stability, difficulty: first.difficulty, reps: first.reps, lapses: first.lapses,
      };
    }
  }
  return { deck: { id: p.deckId, name: p.deckName, filtered: p.filtered }, counts: queue.counts, card, nextLearningAt: queue.nextLearningAt?.toISOString() ?? null };
}

function bump(map: Map<number, number>, key: number, by: number) {
  const v = (map.get(key) ?? 0) + by;
  if (v > 0) map.set(key, v); else map.delete(key);
}

/** Answer a card locally. Returns a new pack (input untouched) and the outbox entry. */
export function localAnswer(p: OfflinePack, cardId: number, rating: Rating, opts: { now: Date; durationMs: number; id: string; rng?: () => number }): { pack: OfflinePack; review: OfflineReview; leech: boolean } {
  const pc = p.cards.find((c) => c.id === cardId);
  if (!pc) throw new Error("card_not_found");
  const cfg = cfgFor(p, pc);
  const cur = current(p, opts.now);
  const load = new Map(p.load);
  const prev = packCardSched(pc);
  const res = answerCard(prev, rating, { cfg, now: opts.now, tz: p.tz, rollover: p.rollover, loadOn: (d) => load.get(d) ?? 0, rng: opts.rng });
  const next = res.card;
  const nextCard: PackCard = {
    ...pc, ...schedToJSON(next),
    ...(res.leech ? { leech: true, ...(cfg.leechAction === "suspend" ? { suspended: true } : {}) } : {}),
  };
  const home = pc.homeDeckId ?? pc.deckId;
  const s = { ...(cur.studied.get(home) ?? { new: 0, review: 0 }) };
  if (prev.state === "new") s.new++;
  if (prev.state === "review") s.review++;
  cur.studied.set(home, s);
  cur.notes.add(pc.noteId);
  if (prev.state === "review") bump(load, dayIndex(prev.due, p.tz, p.rollover), -1);
  if (next.state === "review") bump(load, dayIndex(next.due, p.tz, p.rollover), 1);
  const review: OfflineReview = {
    id: opts.id, deckId: p.deckId, cardId, rating, reviewedAt: opts.now.toISOString(), durationMs: Math.max(0, Math.round(opts.durationMs)),
    base: schedVersion(prev), prev: schedToJSON(prev), prevFlags: { leech: pc.leech, suspended: pc.suspended }, next: schedToJSON(next), leech: res.leech,
  };
  const pack: OfflinePack = {
    ...p, day: cur.today, cards: p.cards.map((c) => (c.id === cardId ? nextCard : c)),
    studied: [...cur.studied.entries()], notesReviewedToday: [...cur.notes], load: [...load.entries()],
  };
  return { pack, review, leech: res.leech };
}

/** Revert a local answer (offline undo, before it was synced). */
export function localUndo(p: OfflinePack, r: OfflineReview): OfflinePack {
  const pc = p.cards.find((c) => c.id === r.cardId);
  if (!pc) return p;
  const restored: PackCard = { ...pc, ...r.prev, leech: r.prevFlags.leech, suspended: r.prevFlags.suspended };
  const studied = new Map(p.studied);
  const home = pc.homeDeckId ?? pc.deckId;
  const reviewDay = dayIndex(new Date(r.reviewedAt), p.tz, p.rollover);
  const notes = new Set(p.notesReviewedToday);
  if (reviewDay === p.day) {
    const s = studied.get(home);
    if (s) {
      const ns = { new: Math.max(0, s.new - (r.prev.state === "new" ? 1 : 0)), review: Math.max(0, s.review - (r.prev.state === "review" ? 1 : 0)) };
      if (ns.new || ns.review) studied.set(home, ns); else studied.delete(home);
    }
    const otherToday = p.cards.some((c) => c.noteId === pc.noteId && c.id !== pc.id && c.lastReview && dayIndex(new Date(c.lastReview), p.tz, p.rollover) === p.day);
    if (!otherToday) notes.delete(pc.noteId);
  }
  const load = new Map(p.load);
  if (r.next.state === "review") bump(load, dayIndex(new Date(r.next.due), p.tz, p.rollover), -1);
  if (r.prev.state === "review") bump(load, dayIndex(new Date(r.prev.due), p.tz, p.rollover), 1);
  return { ...p, cards: p.cards.map((c) => (c.id === r.cardId ? restored : c)), studied: [...studied.entries()], notesReviewedToday: [...notes], load: [...load.entries()] };
}

const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|mp3|m4a|aac|ogg|oga|wav|flac|opus|mp4|webm|mov)(\?[^\s"')]*)?$/i;
const isMediaUrl = (u: string) => /^(https?:\/\/|\/)/.test(u) && (MEDIA_EXT.test(u) || u.startsWith("/api/media"));

/** Image/audio/video urls referenced by a note (markdown, html src, links to media, occlusion image). */
export function extractMediaUrls(f: NoteFields): string[] {
  const out = new Set<string>();
  const texts = [f.front, f.back, f.text, f.extra, f.question, f.explanation, f.header, ...(f.options ?? [])].filter((x): x is string => typeof x === "string");
  for (const t of texts) {
    for (const m of t.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const u = m[1];
      if (m[0].startsWith("!") ? /^(https?:\/\/|\/)/.test(u) : isMediaUrl(u)) out.add(u);
    }
    for (const m of t.matchAll(/\b(?:src|poster)\s*=\s*["']([^"']+)["']/gi)) if (/^(https?:\/\/|\/)/.test(m[1])) out.add(m[1]);
  }
  if (f.image && /^(https?:\/\/|\/)/.test(f.image)) out.add(f.image);
  return [...out];
}
