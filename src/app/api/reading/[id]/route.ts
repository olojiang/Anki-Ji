import { authed, body, intParam, HttpError } from "@/server/http";
import { deleteReadingItem, getReadingItem, updateReadingItem } from "@/server/services/reading";
import { userContext } from "@/server/services/context";

export const GET = authed(async (_req, { uid, params }) => {
  const item = await getReadingItem(uid, intParam(params.id));
  if (!item) throw new HttpError(404, "reading_not_found");
  const { today } = await userContext(uid);
  return { item, today };
});

export const PATCH = authed(async (req, { uid, params }) => {
  const b = await body<{ title?: string; priority?: number; position?: number; content?: string }>(req);
  if (!(await updateReadingItem(uid, intParam(params.id), b))) throw new HttpError(404, "reading_not_found");
  return { ok: true };
});

export const DELETE = authed(async (_req, { uid, params }) => {
  if (!(await deleteReadingItem(uid, intParam(params.id)))) throw new HttpError(404, "reading_not_found");
  return { ok: true };
});
