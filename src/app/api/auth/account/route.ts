import { NextResponse, type NextRequest } from "next/server";
import { authed, body, HttpError } from "@/server/http";
import { deleteUser, getPasswordHash } from "@/server/repo/users";
import { verifyPassword, SESSION_COOKIE } from "@/server/auth";
import { deleteMediaUrls } from "@/server/media";
import { mediaUrlsSafeToDelete } from "@/server/services/share";

export const DELETE = authed(async (req: NextRequest, { uid }) => {
  const b = await body<{ password?: string }>(req);
  const hash = await getPasswordHash(uid);
  if (!hash || !(await verifyPassword(b.password ?? "", hash))) throw new HttpError(401, "invalid_credentials");
  // blobs still referenced by another account (shared-deck clones) are kept
  await deleteMediaUrls(await mediaUrlsSafeToDelete(uid));
  await deleteUser(uid);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
});
