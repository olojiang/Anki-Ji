/** Incremental reading items: storage + scheduling actions (logic in core/reading). Every query is scoped by user_id. */
import { q } from "../db";
import { BadRequestError, NotFoundError } from "../repo/decks";
import {
  buildReadingQueue, clampPriority, extractSched, extractTitle, markDone, markReadEnough, newReadingSched, normalizeDailyCap, postponeReading, reopenReading,
  type ReadingSched, type ReadingStatus,
} from "@/core/reading";

type Row = Record<string, unknown>;
export const MAX_READING_CHARS = 500_000;
const MAX_TITLE = 300;

export interface ReadingSummary extends ReadingSched {
  id: number; parentId: number | null; title: string; sourceUrl: string; position: number; length: number; lastReadAt: string | null; createdAt: string; updatedAt: string;
}
export interface ReadingItem extends ReadingSummary { content: string; children: ReadingSummary[] }

const SUMMARY_COLS = "id, parent_id, title, source_url, priority, status, due_day, interval_days, reps, position, length(content) AS length, last_read_at, created_at, updated_at";
const iso = (v: unknown) => (v == null ? null : (v instanceof Date ? v : new Date(String(v))).toISOString());

function toSummary(r: Row): ReadingSummary {
  return {
    id: Number(r.id), parentId: r.parent_id == null ? null : Number(r.parent_id), title: String(r.title ?? ""), sourceUrl: String(r.source_url ?? ""),
    priority: Number(r.priority), status: (r.status === "done" ? "done" : "active") as ReadingStatus, dueDay: Number(r.due_day), intervalDays: Number(r.interval_days),
    reps: Number(r.reps), position: Number(r.position), length: Number(r.length ?? 0), lastReadAt: iso(r.last_read_at), createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
  };
}

function cleanContent(content: unknown): string {
  const c = String(content ?? "").replace(/\r\n?/g, "\n");
  if (!c.trim()) throw new BadRequestError("content_required");
  if (c.length > MAX_READING_CHARS) throw Object.assign(new Error("content_too_large"), { status: 413 });
  return c;
}

export interface ReadingInput { title?: string; content: string; priority?: number; sourceUrl?: string }

export async function createReadingItem(uid: number, input: ReadingInput, today: number, parentId: number | null = null): Promise<ReadingItem> {
  const content = cleanContent(input.content);
  const title = (String(input.title ?? "").trim() || extractTitle(content)).slice(0, MAX_TITLE);
  const s = newReadingSched(today, input.priority);
  return insertItem(uid, { title, content, sourceUrl: String(input.sourceUrl ?? "").slice(0, 2000), parentId }, s);
}

async function insertItem(uid: number, d: { title: string; content: string; sourceUrl: string; parentId: number | null }, s: ReadingSched): Promise<ReadingItem> {
  const rows = await q(`INSERT INTO ak_reading_items (user_id, parent_id, title, source_url, content, priority, status, due_day, interval_days, reps)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${SUMMARY_COLS}, content`,
  [uid, d.parentId, d.title, d.sourceUrl, d.content, s.priority, s.status, s.dueDay, s.intervalDays, s.reps]);
  return { ...toSummary(rows[0]), content: String(rows[0].content), children: [] };
}

export async function listReadingItems(uid: number): Promise<ReadingSummary[]> {
  return (await q(`SELECT ${SUMMARY_COLS} FROM ak_reading_items WHERE user_id = $1 ORDER BY status, priority DESC, due_day, id`, [uid])).map(toSummary);
}

export async function getReadingItem(uid: number, id: number): Promise<ReadingItem | null> {
  const rows = await q(`SELECT ${SUMMARY_COLS}, content FROM ak_reading_items WHERE user_id = $1 AND id = $2`, [uid, id]);
  if (!rows[0]) return null;
  const children = (await q(`SELECT ${SUMMARY_COLS} FROM ak_reading_items WHERE user_id = $1 AND parent_id = $2 ORDER BY id`, [uid, id])).map(toSummary);
  return { ...toSummary(rows[0]), content: String(rows[0].content), children };
}

export async function updateReadingItem(uid: number, id: number, patch: { title?: string; priority?: number; position?: number; content?: string }): Promise<boolean> {
  const sets: string[] = []; const params: unknown[] = [uid, id];
  const add = (sql: string, v: unknown) => { params.push(v); sets.push(sql.replace("?", `$${params.length}`)); };
  if (patch.title !== undefined) add("title = ?", String(patch.title).trim().slice(0, MAX_TITLE));
  if (patch.priority !== undefined) add("priority = ?", clampPriority(patch.priority));
  if (patch.content !== undefined) add("content = ?", cleanContent(patch.content));
  if (patch.position !== undefined) add("position = LEAST(GREATEST(0, ?::int), length(content))", Math.max(0, Math.floor(Number(patch.position) || 0)));
  if (!sets.length) return (await q("SELECT id FROM ak_reading_items WHERE user_id = $1 AND id = $2", params)).length > 0;
  return (await q(`UPDATE ak_reading_items SET ${sets.join(", ")}, updated_at = now() WHERE user_id = $1 AND id = $2 RETURNING id`, params)).length > 0;
}

export async function deleteReadingItem(uid: number, id: number): Promise<boolean> {
  return (await q("DELETE FROM ak_reading_items WHERE user_id = $1 AND id = $2 RETURNING id", [uid, id])).length > 0;
}

export type ReadingAction = "read" | "postpone" | "done" | "reopen";

export async function readingAction(uid: number, id: number, action: ReadingAction, today: number, days?: number): Promise<ReadingSummary | null> {
  const rows = await q(`SELECT ${SUMMARY_COLS} FROM ak_reading_items WHERE user_id = $1 AND id = $2`, [uid, id]);
  if (!rows[0]) return null;
  const cur = toSummary(rows[0]);
  let next: ReadingSched;
  switch (action) {
    case "read": next = markReadEnough(cur, today); break;
    case "postpone": next = postponeReading(cur, today, days); break;
    case "done": next = markDone(cur); break;
    case "reopen": next = reopenReading(cur, today); break;
    default: throw new BadRequestError("invalid_action");
  }
  const out = await q(`UPDATE ak_reading_items SET status = $3, due_day = $4, interval_days = $5, reps = $6,
      last_read_at = CASE WHEN $7 THEN now() ELSE last_read_at END, updated_at = now()
    WHERE user_id = $1 AND id = $2 RETURNING ${SUMMARY_COLS}`, [uid, id, next.status, next.dueDay, next.intervalDays, next.reps, action === "read"]);
  return out[0] ? toSummary(out[0]) : null;
}

export async function createExtract(uid: number, parentId: number, text: string, today: number): Promise<ReadingItem> {
  const rows = await q("SELECT id, priority FROM ak_reading_items WHERE user_id = $1 AND id = $2", [uid, parentId]);
  if (!rows[0]) throw new NotFoundError("reading_not_found");
  const content = cleanContent(text);
  return insertItem(uid, { title: extractTitle(content), content, sourceUrl: "", parentId }, extractSched({ priority: Number(rows[0].priority) }, today));
}

export async function getReadingPrefs(uid: number): Promise<{ dailyCap: number }> {
  const rows = await q("SELECT daily_cap FROM ak_reading_prefs WHERE user_id = $1", [uid]);
  return { dailyCap: normalizeDailyCap(rows[0]?.daily_cap) };
}

export async function setReadingPrefs(uid: number, p: { dailyCap?: number }): Promise<{ dailyCap: number }> {
  const cap = normalizeDailyCap(p.dailyCap);
  await q("INSERT INTO ak_reading_prefs (user_id, daily_cap) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET daily_cap = EXCLUDED.daily_cap", [uid, cap]);
  return { dailyCap: cap };
}

export async function getReadingQueue(uid: number, today: number) {
  const [{ dailyCap }, rows] = await Promise.all([
    getReadingPrefs(uid),
    q(`SELECT ${SUMMARY_COLS} FROM ak_reading_items WHERE user_id = $1 AND status = 'active' AND due_day <= $2`, [uid, today]),
  ]);
  const r = buildReadingQueue(rows.map(toSummary), today, dailyCap);
  return { ...r, cap: dailyCap, today };
}
