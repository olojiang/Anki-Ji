"use client";
import { AudioLines } from "lucide-react";
import { useApp } from "@/components/providers";
import { Card, CardHeader, IconChip } from "@/components/ui";
import { ta } from "@/lib/i18n-ai";
import { TtsScopeEditor } from "./TtsScopeEditor";

/** Deck options page section: per-deck TTS override (auto-saved, independent of the deck config save). */
export function TtsDeckOptions({ deckId }: { deckId: number }) {
  const { locale } = useApp();
  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <CardHeader icon={<IconChip tone="teal"><AudioLines /></IconChip>} title={ta(locale, "ttsDeckTitle")} description={ta(locale, "ttsDesc")} />
      <TtsScopeEditor scope={`deck:${deckId}`} />
    </Card>
  );
}
