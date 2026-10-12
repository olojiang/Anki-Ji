import { NextResponse, type NextRequest } from "next/server";
import { authed, body, HttpError } from "@/server/http";
import { deleteUser, getPasswordHash } from "@/server/repo/users";
import { verifyPassword, SESSION_COOKIE } from "@/server/auth";
import { q } from "@/server/db";
import { deleteMediaUrls } from "@/server/media";

export const DELETE = authed(async (req: NextRequest, { uid }) => {
  const b = await body<{ password?: string }>(req);
  const hash = await getPasswordHash(uid);
  if (!hash || !(await verifyPassword(b.password ?? "", hash))) throw new HttpError(401, "invalid_credentials");
  const media = await q("SELECT url FROM ak_media WHERE user_id = $1", [uid]);
  await deleteMediaUrls(media.map((m) => String(m.url)));
  await deleteUser(uid);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
});
