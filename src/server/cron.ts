import { NextResponse, type NextRequest } from "next/server";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Refuse everything when the secret is not configured. */
export function cronAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  const expected = `Bearer ${secret}`;
  if (!authHeader || authHeader.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ authHeader.charCodeAt(i);
  return diff === 0;
}

export function cronRoute(fn: (req: NextRequest) => Promise<unknown>) {
  return async (req: NextRequest) => {
    if (!process.env.CRON_SECRET) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
    if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    try {
      return NextResponse.json(await fn(req));
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      console.error(e);
      return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status });
    }
  };
}
