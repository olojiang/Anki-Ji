import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function currentUserId(): Promise<number | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (req: NextRequest, ctx: { uid: number; params: Record<string, string> }) => Promise<unknown>;

function errorResponse(e: unknown) {
  const status = (e as { status?: number }).status;
  const message = e instanceof Error ? e.message : "error";
  if (status && status >= 400 && status < 500) return NextResponse.json({ error: message }, { status });
  if (message && /^[a-z_]+$/.test(message)) return NextResponse.json({ error: message }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "server_error" }, { status: 500 });
}

/** Route wrapper: requires a session, parses params, maps errors to JSON. */
export function authed(fn: Handler) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      const uid = await currentUserId();
      if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      const out = await fn(req, { uid, params: (await ctx.params) ?? {} });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function open(fn: (req: NextRequest) => Promise<unknown>) {
  return async (req: NextRequest) => {
    try {
      const out = await fn(req);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new HttpError(400, "invalid_json"); }
}

export const intParam = (v: string | undefined | null) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new HttpError(400, "invalid_id");
  return n;
};
export const ids = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : []);
