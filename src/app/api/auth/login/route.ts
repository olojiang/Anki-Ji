import { NextResponse } from "next/server";
import { open, body, HttpError } from "@/server/http";
import { findByEmail } from "@/server/repo/users";
import { verifyPassword, signSession, SESSION_COOKIE } from "@/server/auth";

export const POST = open(async (req) => {
  const b = await body<{ email?: string; password?: string }>(req);
  const user = await findByEmail(b.email ?? "");
  if (!user || !(await verifyPassword(b.password ?? "", user.passwordHash))) throw new HttpError(401, "invalid_credentials");
  const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, settings: user.settings } });
  res.cookies.set(SESSION_COOKIE, await signSession(user.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
});
