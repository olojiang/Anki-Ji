"use client";
/** Offline download controls for the deck list + the fallback list shown when the deck list can't load offline. */
import { useCallback } from "react";
import Link from "next/link";
import { CloudCheck, CloudOff, Play } from "lucide-react";
import { useApp } from "../providers";
import { Card, Empty, IconChip } from "../ui";
import { to } from "@/lib/i18n-offline";
import { downloadDeck, removeDeck, useOfflineStatus } from "@/lib/offline/client";

export function useOfflineDecks() {
  const { locale, toast } = useApp();
  const s = useOfflineStatus();
  const has = useCallback((id: number) => s.packs.some((p) => p.deckId === id), [s.packs]);
  const toggle = useCallback(async (id: number) => {
    try {
      if (has(id)) { await removeDeck(id); toast(to(locale, "removedOffline")); }
      else { const p = await downloadDeck(id); toast(to(locale, "downloaded", { n: p.cards.length })); }
    } catch { toast(to(locale, "downloadFailed"), "error"); }
  }, [has, locale, toast]);
  const label = (id: number) => to(locale, has(id) ? "removeOffline" : "downloadOffline");
  return { has, toggle, label };
}

export function OfflineMark() {
  const { locale } = useApp();
  return <span title={to(locale, "availableOffline")} aria-label={to(locale, "availableOffline")} className="inline-flex shrink-0 text-primary"><CloudCheck className="h-3.5 w-3.5" /></span>;
}

export function OfflineDeckList({ hideEmpty }: { hideEmpty?: boolean }) {
  const { locale } = useApp();
  const s = useOfflineStatus();
  if (!s.packs.length) return hideEmpty ? null : <Empty icon={<CloudOff />} tone="amber" title={to(locale, "offline")}>{to(locale, "offlineDecksEmpty")}</Empty>;
  return (
    <Card className="overflow-hidden" >
      <div className="flex h-10 items-center gap-2 border-b border-border bg-subtle/70 px-4 text-[11.5px] font-medium uppercase tracking-[0.04em] text-faint"><CloudOff className="h-3.5 w-3.5" />{to(locale, "offlineDecksTitle")}</div>
      {s.packs.map((p) => (
        <Link key={p.deckId} href={`/study/${p.deckId}`} data-testid="offline-deck" className="flex min-h-[56px] items-center gap-3 border-t border-border/80 px-4 transition-colors first:border-t-0 hover:bg-subtle">
          <IconChip tone="primary" size="sm"><CloudCheck /></IconChip>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium text-fg">{p.deckName}</span>
            <span className="block truncate text-[11.5px] text-faint">{to(locale, "offlineDeckMeta", { n: p.cards, t: new Date(p.savedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) })}</span>
          </span>
          <Play className="h-4 w-4 text-faint" />
        </Link>
      ))}
    </Card>
  );
}

/** Study page fallback: offline and this deck was never downloaded. */
export function OfflineUnavailable() {
  const { locale } = useApp();
  return (
    <div className="mx-auto max-w-xl space-y-4 py-6" data-testid="offline-unavailable">
      <Empty icon={<CloudOff />} tone="amber" title={to(locale, "offline")}>{to(locale, "e_offline_unavailable")}</Empty>
      <OfflineDeckList hideEmpty />
    </div>
  );
}
