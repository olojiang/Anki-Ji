import { authed, body, intParam, HttpError } from "@/server/http";
import { readingAction, type ReadingAction } from "@/server/services/reading";
import { userContext } from "@/server/services/context";

const ACTIONS: ReadingAction[] = ["read", "postpone", "done", "reopen"];

export const POST = authed(async (req, { uid, params }) => {
  const b = await body<{ action: ReadingAction; days?: number }>(req);
  if (!ACTIONS.includes(b.action)) throw new HttpError(400, "invalid_action");
  const { today } = await userContext(uid);
  const item = await readingAction(uid, intParam(params.id), b.action, today, b.days);
  if (!item) throw new HttpError(404, "reading_not_found");
  return { item };
});
