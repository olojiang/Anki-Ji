import { authed, body, HttpError } from "@/server/http";
import { getPasswordHash, setPassword } from "@/server/repo/users";
import { hashPassword, verifyPassword } from "@/server/auth";

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ current?: string; next?: string }>(req);
  const hash = await getPasswordHash(uid);
  if (!hash || !(await verifyPassword(b.current ?? "", hash))) throw new HttpError(401, "invalid_credentials");
  if ((b.next ?? "").length < 8) throw new HttpError(400, "password_too_short");
  await setPassword(uid, await hashPassword(b.next!));
  return { ok: true };
});
