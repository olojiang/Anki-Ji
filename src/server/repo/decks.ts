import { q } from "../db";
import { toDeck, type Deck, type FilterSpec } from "./mappers";
import { normalizeConfig } from "@/core/config";
import type { DeckConfig } from "@/core/types";
import { descendantIds, planMove, planEnsurePath, ancestorIds } from "@/core/tree";

export class NotFoundError extends Error { status = 404; constructor(what = "not_found") { super(what); } }
export class BadRequestError extends Error { status = 400; }

export async function listDecks(uid: number, opts: { deleted?: boolean } = {}): Promise<Deck[]> {
  const rows = await q(`SELECT * FROM ak_decks WHERE user_id = $1 AND deleted_at IS ${opts.deleted ? "NOT NULL" : "NULL"} ORDER BY position, id`, [uid]);
  return rows.map(toDeck);
}

export async function listAllDecks(uid: number): Promise<Deck[]> {
  return (await q("SELECT * FROM ak_decks WHERE user_id = $1 ORDER BY position, id", [uid])).map(toDeck);
}

export async function getDeck(uid: number, id: number): Promise<Deck | null> {
  const rows = await q("SELECT * FROM ak_decks WHERE user_id = $1 AND id = $2", [uid, id]);
  return rows[0] ? toDeck(rows[0]) : null;
}

export async function requireDeck(uid: number, id: number, opts: { allowFiltered?: boolean } = {}): Promise<Deck> {
  const d = await getDeck(uid, id);
  if (!d || d.deletedAt) throw new NotFoundError("deck_not_found");
  if (d.filtered && !opts.allowFiltered) throw new BadRequestError("deck_is_filtered");
  return d;
}

export async function createDeck(uid: number, input: { name: string; parentId?: number | null; config?: Partial<DeckConfig>; filtered?: boolean; filter?: FilterSpec | null; position?: number; createdAt?: string }): Promise<Deck> {
  const name = input.name.replace(/::/g, ":").trim();
  if (!name) throw new BadRequestError("name_required");
  let parentConfig: DeckConfig | undefined;
  if (input.parentId != null) {
    const parent = await requireDeck(uid, input.parentId);
    parentConfig = parent.config;
  }
  const config = normalizeConfig({ ...(parentConfig ?? {}), ...(input.config ?? {}) });
  const pos = input.position ?? Number((await q("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM ak_decks WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $2", [uid, input.parentId ?? null]))[0].p);
  const rows = await q(
    "INSERT INTO ak_decks (user_id, parent_id, name, position, config, filtered, filter, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now())) RETURNING *",
    [uid, input.parentId ?? null, name, pos, JSON.stringify(config), !!input.filtered, input.filter ? JSON.stringify(input.filter) : null, input.createdAt ?? null],
  );
  return toDeck(rows[0]);
}

export async function updateDeck(uid: number, id: number, patch: { name?: string; config?: Partial<DeckConfig>; filter?: FilterSpec }): Promise<boolean> {
  const d = await getDeck(uid, id);
  if (!d) return false;
  const name = patch.name !== undefined ? patch.name.replace(/::/g, ":").trim() || d.name : d.name;
  const config = patch.config ? normalizeConfig({ ...d.config, ...patch.config }) : d.config;
  const filter = patch.filter ?? d.filter;
  const rows = await q("UPDATE ak_decks SET name = $3, config = $4, filter = $5 WHERE user_id = $1 AND id = $2 RETURNING id", [uid, id, name, JSON.stringify(config), filter ? JSON.stringify(filter) : null]);
  return rows.length > 0;
}

/** Apply the same config to a deck and all of its sub-decks. */
export async function applyConfigToSubtree(uid: number, id: number, config: Partial<DeckConfig>) {
  const decks = await listDecks(uid);
  for (const did of descendantIds(decks, id)) await updateDeck(uid, did, { config });
}

export async function moveDeck(uid: number, id: number, parentId: number | null, index: number): Promise<void> {
  const decks = await listDecks(uid);
  if (!decks.some((d) => d.id === id)) throw new NotFoundError("deck_not_found");
  if (parentId != null && !decks.some((d) => d.id === parentId && !d.filtered)) throw new NotFoundError("deck_not_found");
  let plan;
  try { plan = planMove(decks, id, parentId, index); } catch { throw new BadRequestError("invalid_move"); }
  for (const r of plan.renumber) await q("UPDATE ak_decks SET position = $3 WHERE user_id = $1 AND id = $2", [uid, r.id, r.position]);
  await q("UPDATE ak_decks SET parent_id = $3, position = $4 WHERE user_id = $1 AND id = $2", [uid, id, plan.parentId, plan.position]);
}

/** Move a deck (and its sub-decks) to the trash. Filtered decks return their cards first. */
export async function softDeleteDeck(uid: number, id: number) {
  const decks = await listDecks(uid);
  if (!decks.some((d) => d.id === id)) return;
  const ids = descendantIds(decks, id);
  await q("UPDATE ak_cards SET deck_id = home_deck_id, home_deck_id = NULL WHERE user_id = $1 AND deck_id = ANY($2::int[]) AND home_deck_id IS NOT NULL", [uid, ids]);
  // cards from these decks sitting in filtered decks elsewhere go home too
  await q("UPDATE ak_cards SET deck_id = home_deck_id, home_deck_id = NULL WHERE user_id = $1 AND home_deck_id = ANY($2::int[])", [uid, ids]);
  await q("UPDATE ak_decks SET deleted_at = now() WHERE user_id = $1 AND id = ANY($2::int[])", [uid, ids]);
}

export async function restoreDeck(uid: number, id: number) {
  const all = await listAllDecks(uid);
  if (!all.some((d) => d.id === id)) return;
  const ids = [...descendantIds(all, id), ...ancestorIds(all, id)];
  await q("UPDATE ak_decks SET deleted_at = NULL WHERE user_id = $1 AND id = ANY($2::int[])", [uid, ids]);
}

export async function purgeDeck(uid: number, id: number) {
  const all = await listAllDecks(uid);
  const d = all.find((x) => x.id === id);
  if (!d || !d.deletedAt) return;
  const ids = descendantIds(all, id);
  await q("DELETE FROM ak_decks WHERE user_id = $1 AND id = ANY($2::int[])", [uid, ids]);
}

/** Find or create "a::b::c" (used by CSV import and the editor). */
export async function ensureDeckPath(uid: number, path: string): Promise<number> {
  const decks = (await listDecks(uid)).filter((d) => !d.filtered);
  const plan = planEnsurePath(decks, path || "Default");
  let parent = plan.existingId;
  for (const name of plan.create) parent = (await createDeck(uid, { name, parentId: parent })).id;
  return parent!;
}
