import { authed, body } from "@/server/http";
import { listTags, addTags, renameTag, deleteTag } from "@/server/repo/tags";
import { q } from "@/server/db";

export const GET = authed(async (_req, { uid }) => {
  const counts = await q("SELECT t AS name, count(*)::int AS n FROM ak_notes, unnest(tags) t WHERE user_id = $1 AND deleted_at IS NULL GROUP BY t", [uid]);
  return { tags: await listTags(uid), counts: Object.fromEntries(counts.map((r) => [String(r.name), Number(r.n)])) };
});
export const POST = authed(async (req, { uid }) => { const b = await body<{ name: string }>(req); await addTags(uid, [b.name]); return { ok: true }; });
export const PATCH = authed(async (req, { uid }) => { const b = await body<{ from: string; to: string }>(req); await renameTag(uid, b.from, b.to); return { ok: true }; });
export const DELETE = authed(async (req, { uid }) => { await deleteTag(uid, req.nextUrl.searchParams.get("name") ?? ""); return { ok: true }; });
