import { authed, body, intParam } from "@/server/http";
import { moveDeck } from "@/server/repo/decks";

export const POST = authed(async (req, { uid, params }) => {
  const b = await body<{ parentId: number | null; index: number }>(req);
  await moveDeck(uid, intParam(params.id), b.parentId ?? null, Number(b.index) || 0);
  return { ok: true };
});
