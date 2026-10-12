"use client";
import { useEffect, useState } from "react";
import { Package, Download, Loader2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { api, download } from "@/lib/api";
import { buildApkg } from "@/lib/apkg-export-client";
import { tx } from "@/lib/i18n-interop";
import { deckOptions } from "@/components/DeckPicker";
import { Button, IconChip, Select, Toggle } from "@/components/ui";
import type { DeckDTO } from "@/lib/types";

/** Export card for the Import/Export page: deck subtree or whole collection → Anki .apkg. */
export function ApkgExport() {
  const { locale, err, toast } = useApp();
  const [decks, setDecks] = useState<DeckDTO[]>([]);
  const [deckId, setDeckId] = useState<number | null>(null);
  const [sched, setSched] = useState(true);
  const [media, setMedia] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => { api<{ decks: DeckDTO[] }>("/api/decks").then((r) => setDecks(r.decks)).catch(() => {}); }, []);

  const run = async () => {
    setBusy(true);
    try {
      const { blob, stats } = await buildApkg({ deckId, includeScheduling: sched, withMedia: media }, (step, v) =>
        setStatus(step === "media" ? tx(locale, "apkgMediaProgress", v) : tx(locale, step === "building" ? "apkgBuilding" : "apkgPreparing")));
      if (!stats.cards) { toast(tx(locale, "apkgEmpty"), "error"); return; }
      const name = deckId != null ? decks.find((d) => d.id === deckId)?.name ?? "deck" : "anki-ji";
      download(`${name.replace(/[\\/:*?"<>|]+/g, "_")}-${new Date().toISOString().slice(0, 10)}.apkg`, blob);
      toast(tx(locale, "apkgDone", { notes: stats.notes, cards: stats.cards, media: stats.media }) + (stats.skippedMedia ? tx(locale, "apkgSkipped", { n: stats.skippedMedia }) : ""));
    } catch (e) { err(e); } finally { setBusy(false); setStatus(""); }
  };

  return (
    <div className="rounded-xl border border-border bg-subtle p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start gap-3">
        <IconChip tone="amber" size="sm" className="mt-0.5"><Package /></IconChip>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{tx(locale, "apkgTitle")}</div>
          <p className="mt-1 text-xs leading-relaxed text-sub">{tx(locale, "apkgDesc")}</p>
          <label className="mt-3 block">
            <span className="mb-1 block text-[12px] font-medium text-sub">{tx(locale, "apkgScope")}</span>
            <Select className="w-full" value={deckId ?? ""} onChange={(e) => setDeckId(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">{tx(locale, "apkgWhole")}</option>
              {deckOptions(decks).map((d) => <option key={d.id} value={d.id}>{"\u00A0\u00A0".repeat(d.depth) + (d.depth ? "└ " : "") + d.name}</option>)}
            </Select>
          </label>
          <div className="mt-2 flex flex-col">
            <Toggle checked={sched} onChange={setSched} label={<span className="text-xs text-sub">{tx(locale, "apkgScheduling")}</span>} />
            <Toggle checked={media} onChange={setMedia} label={<span className="text-xs text-sub">{tx(locale, "apkgMedia")}</span>} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-sub">{status && <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />{status}</span>}</span>
            <Button size="sm" variant="primary" loading={busy} onClick={run}><Download className="h-3.5 w-3.5" />{tx(locale, "apkgExport")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
