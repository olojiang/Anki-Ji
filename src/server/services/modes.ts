/** Cram study modes (Test / Match / Spell). Read-only over notes; results go to ak_mode_records, never to ak_revlog or card scheduling. */
import { q } from "../db";
import { toNote } from "../repo/mappers";
import { listDecks, requireDeck, BadRequestError } from "../repo/decks";
import { searchNotes } from "./browse";
import { descendantIds } from "@/core/tree";
import { itemsFromNotes, type Direction, type StudyItem } from "@/core/modes";

export const MODES = ["test", "match", "spell"] as const;
export type ModeName = (typeof MODES)[number];

export interface ModeSource { deckId?: number; query?: string; noteIds?: number[]; direction?: Direction; limit?: number }

export async function getModeItems(uid: number, src: ModeSource): Promise<{ key: string; title: string; items: StudyItem[]; total: number }> {
  const limit = Math.max(1, Math.min(2000, src.limit ?? 1000));
  let rows: Record<string, unknown>[];
  let key: string, title: string;
  if (src.deckId != null) {
    const deck = await requireDeck(uid, src.deckId, { allowFiltered: true });
    const ids = descendantIds(await listDecks(uid), deck.id);
    // card-based so filtered decks (cards borrowed from home decks) work too
    rows = await q(`SELECT n.* FROM ak_notes n WHERE n.user_id = $1 AND n.deleted_at IS NULL
                    AND EXISTS (SELECT 1 FROM ak_cards c WHERE c.note_id = n.id AND c.user_id = $1 AND c.deck_id = ANY($2::int[])) ORDER BY n.position, n.id`, [uid, ids]);
    key = `deck:${deck.id}`; title = deck.name;
  } else if (Array.isArray(src.noteIds)) {
    const ids = src.noteIds.map(Number).filter(Number.isInteger);
    rows = ids.length ? await q("SELECT * FROM ak_notes WHERE user_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL ORDER BY position, id", [uid, ids]) : [];
    key = `notes:${hash([...ids].sort((a, b) => a - b).join(","))}`; title = "";
  } else if (typeof src.query === "string") {
    const ids = [...new Set((await searchNotes(uid, src.query)).map((r) => r.noteId))];
    rows = ids.length ? await q("SELECT * FROM ak_notes WHERE user_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL ORDER BY position, id", [uid, ids]) : [];
    key = `q:${src.query.trim().slice(0, 200)}`; title = src.query.trim();
  } else throw new BadRequestError("source_required");
  const items = itemsFromNotes(rows.map(toNote), { direction: src.direction });
  return { key, title, items: items.slice(0, limit), total: items.length };
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export interface ModeRecord { bestMs: number | null; bestScore: number | null; lastMs: number | null; lastScore: number | null; plays: number; updatedAt: string }
const toRecord = (r: Record<string, unknown>): ModeRecord => ({
  bestMs: r.best_ms == null ? null : Number(r.best_ms), bestScore: r.best_score == null ? null : Number(r.best_score),
  lastMs: r.last_ms == null ? null : Number(r.last_ms), lastScore: r.last_score == null ? null : Number(r.last_score), plays: Number(r.plays),
  updatedAt: new Date(String(r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at)).toISOString(),
});

export async function getModeRecords(uid: number, key: string): Promise<Partial<Record<ModeName, ModeRecord>>> {
  const rows = await q("SELECT * FROM ak_mode_records WHERE user_id = $1 AND scope_key = $2", [uid, String(key).slice(0, 220)]);
  return Object.fromEntries(rows.map((r) => [String(r.mode), toRecord(r)]));
}

/** Store a finished game. Match: lower time is better. Test / spell: higher score (percent) is better. */
export async function saveModeRecord(uid: number, input: { key: string; mode: string; ms?: number | null; score?: number | null }): Promise<{ best: boolean; record: ModeRecord }> {
  const mode = input.mode as ModeName;
  if (!MODES.includes(mode)) throw new BadRequestError("invalid_mode");
  const key = String(input.key ?? "").slice(0, 220);
  if (!key) throw new BadRequestError("key_required");
  const ms = input.ms == null || !Number.isFinite(Number(input.ms)) ? null : Math.max(0, Math.min(86_400_000, Math.round(Number(input.ms))));
  const score = input.score == null || !Number.isFinite(Number(input.score)) ? null : Math.max(0, Math.min(100, Number(input.score)));
  if (mode === "match" ? ms == null : score == null) throw new BadRequestError("result_required");
  const prev = (await q("SELECT best_ms, best_score FROM ak_mode_records WHERE user_id = $1 AND scope_key = $2 AND mode = $3", [uid, key, mode]))[0];
  const best = mode === "match"
    ? prev?.best_ms == null || ms! < Number(prev.best_ms)
    : prev?.best_score == null || score! > Number(prev.best_score);
  const rows = await q(
    `INSERT INTO ak_mode_records (user_id, scope_key, mode, best_ms, best_score, last_ms, last_score, plays, updated_at)
     VALUES ($1, $2, $3, $4, $5, $4, $5, 1, now())
     ON CONFLICT (user_id, scope_key, mode) DO UPDATE SET
       best_ms = CASE WHEN EXCLUDED.best_ms IS NOT NULL AND (ak_mode_records.best_ms IS NULL OR EXCLUDED.best_ms < ak_mode_records.best_ms) THEN EXCLUDED.best_ms ELSE ak_mode_records.best_ms END,
       best_score = CASE WHEN EXCLUDED.best_score IS NOT NULL AND (ak_mode_records.best_score IS NULL OR EXCLUDED.best_score > ak_mode_records.best_score) THEN EXCLUDED.best_score ELSE ak_mode_records.best_score END,
       last_ms = EXCLUDED.last_ms, last_score = EXCLUDED.last_score, plays = ak_mode_records.plays + 1, updated_at = now()
     RETURNING *`, [uid, key, mode, ms, score]);
  return { best, record: toRecord(rows[0]) };
}
