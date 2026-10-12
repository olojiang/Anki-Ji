import { NextResponse, type NextRequest } from "next/server";
import { getPublicShare } from "@/server/services/share";

export const dynamic = "force-dynamic";

/** Public, read-only share view (no login). Unknown, revoked and expired links all 404. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const share = await getPublicShare((await ctx.params).slug);
    if (!share) return NextResponse.json({ error: "share_not_found" }, { status: 404 });
    return NextResponse.json({ share }, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
