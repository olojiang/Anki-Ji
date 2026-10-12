import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/register"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("ak_session")?.value;
  let ok = false;
  if (token) {
    try { await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET || "dev-only-secret-change-me-please-0000")); ok = true; } catch { ok = false; }
  }
  if (PUBLIC.includes(pathname)) return ok ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  if (!ok) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next|favicon|icon|manifest|sw\\.js|sw-push|sql-wasm|.*\\.(?:png|svg|ico|wasm|txt)$).*)"] };
