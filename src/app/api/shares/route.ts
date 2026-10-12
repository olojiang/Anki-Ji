import { authed, body } from "@/server/http";
import { createShare, listShares } from "@/server/services/share";

export const GET = authed(async (req, { uid }) => {
  const d = req.nextUrl.searchParams.get("deckId");
  return { shares: await listShares(uid, d ? Number(d) || -1 : undefined) };
});

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ deckId: number; description?: string; expiresInDays?: number | null }>(req);
  return { share: await createShare(uid, Number(b.deckId), { description: b.description, expiresInDays: b.expiresInDays ?? null }) };
});
