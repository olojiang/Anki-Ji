/**
 * Deck sharing: read-only public links for a deck subtree + "copy to my collection".
 * Public reads go through an active (not revoked / not expired) slug only and expose
 * deck names, description, counts and note content of that subtree – never scheduling,
 * owner identity, or anything outside the subtree.
 */
import { q } from "../db";
import { BadRequestError, NotFoundError, getDeck, listDecks, createDeck, type Deck } from "../repo/decks";
import { addTags } from "../repo/tags";
import { buildTree, descendantIds, flattenTree } from "@/core/tree";
import { cardOrdinals, cleanFields, searchText, sortField } from "@/core/notes";
import { NOTE_TYPES, type NoteFields, type NoteType } from "@/core/types";
import { SLUG_RE, expiryFromDays, generateSlug, isShareActive, mediaUrlsIn } from "@/core/share";

type Row = Record<string, unknown>;
const statusError = (status: number, code: string) => Object.assign(new Error(code), { status });
const dateOrNull = (v: unknown) => (v == null ? null : v instanceof Date ? v : new Date(String(v)));

export interface ShareDTO {
  id: number; deckId: number; deckName: string; slug: string; description: string; expiresAt: Date | null; revokedAt: Date | null;
  viewCount: number; cloneCount: number; createdAt: Date; active: boolean;
}

function toShare(r: Row, now = new Date()): ShareDTO {
  const s = {
    id: Number(r.id), deckId: Number(r.deck_id), deckName: String(r.deck_name ?? ""), slug: String(r.slug), description: String(r.description ?? ""),
    expiresAt: dateOrNull(r.expires_at), revokedAt: dateOrNull(r.revoked_at), viewCount: Number(r.view_count ?? 0), cloneCount: Number(r.clone_count ?? 0),
    createdAt: dateOrNull(r.created_at) ?? now,
  };
  return { ...s, active: isShareActive(s, now) };
}

export const CLONE_LIMITS = { maxNotes: 5000, perHour: 10 };
export const SAMPLE_LIMIT = 8;
const MAX_DESCRIPTION = 2000;

export async function createShare(uid: number, deckId: number, opts: { description?: string; expiresInDays?: number | null }, now = new Date()): Promise<ShareDTO> {
  const deck = await getDeck(uid, deckId);
  if (!deck || deck.deletedAt) throw new NotFoundError("deck_not_found");
  if (deck.filtered) throw new BadRequestError("deck_is_filtered");
  const rows = await q("INSERT INTO ak_shares (user_id, deck_id, slug, description, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [uid, deckId, generateSlug(), String(opts.description ?? "").trim().slice(0, MAX_DESCRIPTION), expiryFromDays(opts.expiresInDays, now)]);
  return toShare({ ...rows[0], deck_name: deck.name }, now);
}

export async function listShares(uid: number, deckId?: number, now = new Date()): Promise<ShareDTO[]> {
  const rows = await q(`SELECT s.*, d.name AS deck_name FROM ak_shares s JOIN ak_decks d ON d.id = s.deck_id
    WHERE s.user_id = $1 AND ($2::int IS NULL OR s.deck_id = $2) ORDER BY s.created_at DESC, s.id DESC`, [uid, deckId ?? null]);
  return rows.map((r) => toShare(r, now));
}

export async function updateShare(uid: number, id: number, patch: { description?: string; expiresInDays?: number | null }, now = new Date()): Promise<boolean> {
  const sets: string[] = []; const params: unknown[] = [uid, id];
  if (patch.description !== undefined) { params.push(String(patch.description).trim().slice(0, MAX_DESCRIPTION)); sets.push(`description = $${params.length}`); }
  if ("expiresInDays" in patch) { params.push(expiryFromDays(patch.expiresInDays, now)); sets.push(`expires_at = $${params.length}`); }
  if (!sets.length) return (await q("SELECT id FROM ak_shares WHERE user_id = $1 AND id = $2", params)).length > 0;
  return (await q(`UPDATE ak_shares SET ${sets.join(", ")} WHERE user_id = $1 AND id = $2 RETURNING id`, params)).length > 0;
}

export async function revokeShare(uid: number, id: number): Promise<boolean> {
  return (await q("UPDATE ak_shares SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1 AND id = $2 RETURNING id", [uid, id])).length > 0;
}

interface ActiveShare { id: number; ownerId: number; deckId: number; description: string; expiresAt: Date | null }

async function activeShare(slug: string, now: Date): Promise<ActiveShare | null> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return null;
  const rows = await q(`SELECT s.id, s.user_id, s.deck_id, s.description, s.expires_at, s.revoked_at, d.deleted_at, d.filtered
    FROM ak_shares s JOIN ak_decks d ON d.id = s.deck_id AND d.user_id = s.user_id WHERE s.slug = $1`, [slug]);
  const r = rows[0];
  if (!r || r.deleted_at != null || r.filtered) return null;
  if (!isShareActive({ revokedAt: dateOrNull(r.revoked_at), expiresAt: dateOrNull(r.expires_at) }, now)) return null;
  return { id: Number(r.id), ownerId: Number(r.user_id), deckId: Number(r.deck_id), description: String(r.description ?? ""), expiresAt: dateOrNull(r.expires_at) };
}

/** Live subtree (non-deleted, non-filtered decks) in display order with paths relative to the shared root. */
async function subtree(ownerId: number, rootId: number) {
  const decks = (await listDecks(ownerId)).filter((d) => !d.filtered);
  const ids = new Set(descendantIds(decks, rootId));
  const sub = decks.filter((d) => ids.has(d.id)).map((d) => (d.id === rootId ? { ...d, parentId: null } : d));
  const flat = flattenTree(buildTree(sub));
  const byId = new Map(flat.map((d) => [d.id, d]));
  const pathOf = (d: Deck): string => (d.parentId == null || !byId.has(d.parentId) ? d.name : `${pathOf(byId.get(d.parentId)!)}::${d.name}`);
  return flat.map((d) => ({ id: d.id, parentId: d.parentId, name: d.name, depth: d.depth, path: pathOf(d) }));
}

export interface PublicShare {
  slug: string; name: string; description: string; expiresAt: string | null; noteCount: number; cardCount: number;
  decks: { name: string; path: string; depth: number; notes: number; cards: number }[];
  samples: { type: NoteType; fields: NoteFields; ord: number; tags: string[] }[];
}

export async function getPublicShare(slug: string, opts: { now?: Date; countView?: boolean; sampleLimit?: number } = {}): Promise<PublicShare | null> {
  const now = opts.now ?? new Date();
  const s = await activeShare(slug, now);
  if (!s) return null;
  const decks = await subtree(s.ownerId, s.deckId);
  if (!decks.length) return null;
  const ids = decks.map((d) => d.id);
  const counts = await q(`SELECT n.deck_id, count(DISTINCT n.id)::int AS notes, count(c.id)::int AS cards FROM ak_notes n LEFT JOIN ak_cards c ON c.note_id = n.id
    WHERE n.user_id = $1 AND n.deck_id = ANY($2::int[]) AND n.deleted_at IS NULL GROUP BY n.deck_id`, [s.ownerId, ids]);
  const byDeck = new Map(counts.map((r) => [Number(r.deck_id), { notes: Number(r.notes), cards: Number(r.cards) }]));
  const sampleRows = await q(`SELECT type, fields, tags FROM ak_notes WHERE user_id = $1 AND deck_id = ANY($2::int[]) AND deleted_at IS NULL
    ORDER BY array_position($2::int[], deck_id), position, id LIMIT $3`, [s.ownerId, ids, Math.max(0, Math.min(20, opts.sampleLimit ?? SAMPLE_LIMIT))]);
  if (opts.countView !== false) await q("UPDATE ak_shares SET view_count = view_count + 1 WHERE id = $1", [s.id]);
  const deckOut = decks.map((d) => ({ name: d.name, path: d.path, depth: d.depth, notes: byDeck.get(d.id)?.notes ?? 0, cards: byDeck.get(d.id)?.cards ?? 0 }));
  return {
    slug, name: decks[0].name, description: s.description, expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    noteCount: deckOut.reduce((a, d) => a + d.notes, 0), cardCount: deckOut.reduce((a, d) => a + d.cards, 0), decks: deckOut,
    samples: sampleRows.map((r) => {
      const type = (NOTE_TYPES.includes(r.type as NoteType) ? r.type : "basic") as NoteType;
      const fields = (r.fields ?? {}) as NoteFields;
      return { type, fields, ord: cardOrdinals(type, fields)[0] ?? 0, tags: (r.tags as string[]) ?? [] };
    }),
  };
}

export interface CloneResult { rootDeckId: number | null; added: number; skipped: number; cards: number; own: boolean }

export async function cloneShare(uid: number, slug: string, opts: { now?: Date; limits?: { maxNotes: number; perHour: number } } = {}): Promise<CloneResult> {
  const now = opts.now ?? new Date();
  const limits = opts.limits ?? CLONE_LIMITS;
  const s = await activeShare(slug, now);
  if (!s) throw new NotFoundError("share_not_found");
  if (s.ownerId === uid) return { rootDeckId: s.deckId, added: 0, skipped: 0, cards: 0, own: true };
  const recent = await q("SELECT count(*)::int AS n FROM ak_share_clones WHERE user_id = $1 AND created_at > $2", [uid, new Date(now.getTime() - 3600_000)]);
  if (Number(recent[0].n) >= limits.perHour) throw statusError(429, "rate_limited");

  const decks = await subtree(s.ownerId, s.deckId);
  const ids = decks.map((d) => d.id);
  const notes = await q(`SELECT deck_id, guid, type, fields, tags, position FROM ak_notes WHERE user_id = $1 AND deck_id = ANY($2::int[]) AND deleted_at IS NULL
    ORDER BY position, id LIMIT $3`, [s.ownerId, ids, limits.maxNotes + 1]);
  if (notes.length > limits.maxNotes) throw statusError(413, "share_too_large");

  const guids = notes.map((n) => String(n.guid));
  const have = new Set((guids.length ? await q("SELECT guid FROM ak_notes WHERE user_id = $1 AND guid = ANY($2::text[])", [uid, guids]) : []).map((r) => String(r.guid)));
  const fresh = notes.filter((n) => !have.has(String(n.guid)));

  // previous clone root (re-clone reuses it while it still exists)
  const prior = await q("SELECT root_deck_id FROM ak_share_clones WHERE user_id = $1 AND share_id = $2 AND root_deck_id IS NOT NULL ORDER BY id DESC LIMIT 1", [uid, s.id]);
  let rootMine: number | null = null;
  if (prior[0]) {
    const d = await getDeck(uid, Number(prior[0].root_deck_id));
    if (d && !d.deletedAt && !d.filtered) rootMine = d.id;
  }

  let added = 0, cardCount = 0;
  if (fresh.length) {
    const map = new Map<number, number>();
    const mine = (await listDecks(uid)).filter((d) => !d.filtered);
    for (const d of decks) {
      if (d.parentId == null) {
        rootMine ??= (await createDeck(uid, { name: d.name })).id;
        map.set(d.id, rootMine);
        continue;
      }
      const parent = map.get(d.parentId)!;
      const existing = mine.find((x) => x.parentId === parent && x.name === d.name);
      map.set(d.id, existing ? existing.id : (await createDeck(uid, { name: d.name, parentId: parent })).id);
    }
    for (let i = 0; i < fresh.length; i += 500) {
      const chunk = fresh.slice(i, i + 500).map((n) => {
        const type = (NOTE_TYPES.includes(n.type as NoteType) ? n.type : "basic") as NoteType;
        const fields = cleanFields(type, (n.fields ?? {}) as NoteFields);
        return { deck_id: map.get(Number(n.deck_id))!, guid: String(n.guid), type, fields, tags: (n.tags as string[]) ?? [], position: Number(n.position), sort_field: sortField(type, fields), search_text: searchText(type, fields) };
      });
      const rows = await q(`INSERT INTO ak_notes (user_id, deck_id, guid, type, fields, tags, position, sort_field, search_text)
        SELECT $1, x.deck_id, x.guid, x.type, x.fields, ARRAY(SELECT jsonb_array_elements_text(x.tags)), x.position, x.sort_field, x.search_text
        FROM jsonb_to_recordset($2::jsonb) AS x(deck_id int, guid text, type text, fields jsonb, tags jsonb, position float8, sort_field text, search_text text)
        ON CONFLICT (user_id, guid) DO NOTHING RETURNING id, guid`, [uid, JSON.stringify(chunk)]);
      const byGuid = new Map(rows.map((r) => [String(r.guid), Number(r.id)]));
      const cardPayload = chunk.flatMap((n) => {
        const noteId = byGuid.get(n.guid);
        return noteId ? cardOrdinals(n.type, n.fields).map((ord) => ({ note_id: noteId, deck_id: n.deck_id, ord, position: n.position })) : [];
      });
      added += rows.length;
      if (cardPayload.length) {
        const c = await q(`INSERT INTO ak_cards (user_id, note_id, deck_id, ord, position)
          SELECT $1, x.note_id, x.deck_id, x.ord, x.position FROM jsonb_to_recordset($2::jsonb) AS x(note_id int, deck_id int, ord int, position float8)
          ON CONFLICT (note_id, ord) DO NOTHING RETURNING id`, [uid, JSON.stringify(cardPayload)]);
        cardCount += c.length;
      }
    }
    await addTags(uid, [...new Set(fresh.flatMap((n) => (n.tags as string[]) ?? []))]);
    // media references: keep the owner's blobs reachable for the clone and visible in the cloner's backups
    const urls = [...new Set(fresh.flatMap((n) => mediaUrlsIn(n.fields)))];
    if (urls.length) {
      await q(`INSERT INTO ak_media (user_id, url, pathname, filename, content_type, size)
        SELECT DISTINCT ON (m.url) $1, m.url, m.pathname, m.filename, m.content_type, m.size FROM ak_media m
        WHERE m.user_id = $2 AND m.url = ANY($3::text[]) AND NOT EXISTS (SELECT 1 FROM ak_media x WHERE x.user_id = $1 AND x.url = m.url)
        ORDER BY m.url, m.id`, [uid, s.ownerId, urls]);
    }
  }
  await q("INSERT INTO ak_share_clones (user_id, share_id, root_deck_id, notes_added) VALUES ($1, $2, $3, $4)", [uid, s.id, rootMine, added]);
  await q("UPDATE ak_shares SET clone_count = clone_count + 1 WHERE id = $1", [s.id]);
  return { rootDeckId: rootMine, added, skipped: notes.length - added, cards: cardCount, own: false };
}

/** Media URLs of this user that no other account references (safe to delete from Blob storage). */
export async function mediaUrlsSafeToDelete(uid: number): Promise<string[]> {
  const rows = await q(`SELECT DISTINCT m.url FROM ak_media m WHERE m.user_id = $1
    AND NOT EXISTS (SELECT 1 FROM ak_media o WHERE o.url = m.url AND o.user_id <> $1) ORDER BY m.url`, [uid]);
  return rows.map((r) => String(r.url));
}
