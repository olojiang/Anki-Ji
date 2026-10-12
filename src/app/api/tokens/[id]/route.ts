import { authed, intParam, HttpError } from "@/server/http";
import { revokeToken } from "@/server/repo/tokens";

export const DELETE = authed(async (_req, { uid, params }) => {
  if (!(await revokeToken(uid, intParam(params.id)))) throw new HttpError(404, "not_found");
  return { ok: true };
});
