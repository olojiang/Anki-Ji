import { NextResponse, type NextRequest } from "next/server";
import { handleAnkiConnect, ANKICONNECT_VERSION } from "@/server/services/ankiconnect";

// AnkiConnect-compatible endpoint (token auth, no cookies) — callable from extensions and other origins.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};
const MAX_BODY = 6 * 1024 * 1024;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export function GET() {
  return NextResponse.json({ apiVersion: `AnkiConnect v.${ANKICONNECT_VERSION}`, server: "Anki-ji" }, { headers: CORS });
}

export async function POST(req: NextRequest) {
  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ result: null, error: "request too large" }, { status: 413, headers: CORS });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ result: null, error: "invalid JSON" }, { status: 400, headers: CORS }); }
  const auth = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() ?? null;
  try {
    return NextResponse.json(await handleAnkiConnect(body, bearer), { headers: CORS });
  } catch (e) {
    console.error("ankiconnect", e);
    return NextResponse.json({ result: null, error: "internal error" }, { status: 500, headers: CORS });
  }
}
