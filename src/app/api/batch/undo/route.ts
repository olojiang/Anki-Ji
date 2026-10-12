import { authed, body } from "@/server/http";
import { undoBatch, listUndo } from "@/server/services/batch";

export const GET = authed(async (_req, { uid }) => ({ items: await listUndo(uid) }));
export const POST = authed(async (req, { uid }) => {
  const b = await body<{ id: number }>(req);
  return undoBatch(uid, Number(b.id));
});
