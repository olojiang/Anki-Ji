"use client";
/** Side preview panel for Browse on wide screens (≥xl): renders the selected card and its scheduling facts. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, MousePointerClick, Pencil, X } from "lucide-react";
import { useApp } from "./providers";
import { api } from "@/lib/api";
import { Badge, Button, Card, CardHeader, IconButton, IconChip, Pill, Spinner } from "./ui";
import { CardView } from "./CardView";
import { renderCard } from "@/core/notes";
import type { BrowseRowDTO, NoteDTO } from "@/lib/types";

export function BrowsePreview({ row, onClose }: { row: BrowseRowDTO | null; onClose: () => void }) {
  const { t, err } = useApp();
  const [note, setNote] = useState<NoteDTO | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setNote(null); setRevealed(false);
    if (!row) return;
    let live = true;
    api<{ note: NoteDTO }>(`/api/notes/${row.noteId}`).then((r) => { if (live) setNote(r.note); }).catch(err);
    return () => { live = false; };
  }, [row, err]);

  if (!row) {
    return (
      <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <IconChip tone="neutral" size="lg" className="mb-3"><MousePointerClick /></IconChip>
        <p className="text-[13.5px] font-medium text-fg">{t("cardPreview")}</p>
        <p className="mt-1 text-xs text-faint">{t("selectToPreview")}</p>
      </Card>
    );
  }
  const rendered = note ? (() => { try { return renderCard(note.type, note.fields, row.ord, note.noteType, { tags: note.tags, deck: row.deckPath }); } catch { return null; } })() : null;
  const facts: [string, string][] = [
    [t("colDeck"), row.deckPath],
    [t("colType"), row.noteTypeName ?? t(`t_${row.type}`)],
    [t("colIvl"), row.state === "review" ? `${Math.round(row.interval)}d` : "—"],
    [t("stability"), row.stability ? `${row.stability.toFixed(1)}d` : "—"],
    [t("difficulty"), row.difficulty ? row.difficulty.toFixed(1) : "—"],
    [t("retrievability"), row.retrievability == null ? "—" : `${Math.round(row.retrievability * 100)}%`],
    [t("reps"), String(row.reps)],
    [t("lapses"), String(row.lapses)],
  ];
  return (
    <Card className="p-5" >
      <CardHeader className="mb-4" icon={<IconChip tone="teal"><Eye /></IconChip>} title={t("cardPreview")}
        actions={<IconButton label={t("cancel")} onClick={onClose}><X className="h-4 w-4" /></IconButton>} />
      <div className="relative min-h-[220px] rounded-xl border border-border bg-surface px-5 py-8 shadow-card" data-testid="browse-preview">
        {!note ? <div className="flex justify-center py-10"><Spinner /></div> : rendered ? <CardView card={rendered} revealed={revealed} picked={[]} /> : <p className="text-center text-sm text-faint">—</p>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1">{row.tags.slice(0, 4).map((x) => <Badge key={x} className="max-w-[120px] truncate">{x}</Badge>)}{row.leech && <Pill tone="again">leech</Pill>}</div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" onClick={() => setRevealed(!revealed)}>{revealed ? t("front") : t("showAnswer")}</Button>
          <Link href={`/notes/${row.noteId}`}><Button size="sm"><Pencil className="h-3.5 w-3.5" />{t("openEditor")}</Button></Link>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-xs">
        {facts.map(([k, v]) => <div key={k} className="min-w-0 bg-subtle px-3 py-2"><dt className="text-faint">{k}</dt><dd className="num mt-0.5 truncate text-[13px] font-medium text-fg" title={v}>{v}</dd></div>)}
      </dl>
    </Card>
  );
}
