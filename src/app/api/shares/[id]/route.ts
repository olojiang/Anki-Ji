import { authed, body, intParam, HttpError } from "@/server/http";
import { revokeShare, updateShare } from "@/server/services/share";

export const PATCH = authed(async (req, { uid, params }) => {
  const id = intParam(params.id);
  const b = await body<{ description?: string; expiresInDays?: number | null; revoke?: boolean }>(req);
  if (b.revoke) { if (!(await revokeShare(uid, id))) throw new HttpError(404, "share_not_found"); return { ok: true }; }
  const patch: { description?: string; expiresInDays?: number | null } = {};
  if (b.description !== undefined) patch.description = b.description;
  if ("expiresInDays" in b) patch.expiresInDays = b.expiresInDays ?? null;
  if (!(await updateShare(uid, id, patch))) throw new HttpError(404, "share_not_found");
  return { ok: true };
});

/** Revoke (links are kept for their view/clone history; a revoked slug 404s forever). */
export const DELETE = authed(async (_req, { uid, params }) => {
  if (!(await revokeShare(uid, intParam(params.id)))) throw new HttpError(404, "share_not_found");
  return { ok: true };
});
