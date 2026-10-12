import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicShare } from "@/server/services/share";
import { currentUserId } from "@/server/http";
import { SharePublic } from "@/components/share-ir/SharePublic";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const share = await getPublicShare((await params).slug, { countView: false, sampleLimit: 0 });
  return { title: share ? `${share.name} · Anki-ji` : "Anki-ji", description: share?.description || undefined, robots: { index: false, follow: false } };
}

/** Public read-only page for a shared deck. No login needed; unknown / revoked / expired links 404. */
export default async function SharedDeckPage({ params }: { params: Promise<{ slug: string }> }) {
  const share = await getPublicShare((await params).slug);
  if (!share) notFound();
  const uid = await currentUserId();
  return <SharePublic share={share} loggedIn={!!uid} />;
}
