"use client";
import { AlertTriangle, Copy, Eye, FolderTree, History } from "lucide-react";
import { useApp } from "@/components/providers";
import { Badge, Pill, cx } from "@/components/ui";
import { ti } from "@/lib/i18n-import";
import type { ImportPreview as Preview } from "@/core/io/draft";

/** On ≥xl the import cards split in two columns; the preview occupies the whole right column. */
export const PREVIEW_SLOT = "xl:col-start-2 xl:row-start-1 xl:row-span-6 xl:mt-0";

/** Empty right-hand slot shown on wide screens before anything has been parsed. */
export function PreviewPlaceholder({ label }: { label: string }) {
  return (
    <div className={cx("hidden min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-subtle/60 text-center text-xs text-faint xl:flex", PREVIEW_SLOT)}>
      <Eye className="h-5 w-5" />{label}
    </div>
  );
}

/** Preview of a parsed import (counts, decks, sample cards, issues) shown before committing. */
export function ImportPreview({ preview: p, className }: { preview: Preview; className?: string }) {
  const { locale } = useApp();
  const T = (k: string, v?: Record<string, string | number>) => ti(locale, k, v);
  const issues = [...p.errors.map((e) => (e.row ? `#${e.row} ${e.message}` : e.message)), ...p.warnings];
  const stat = (label: string, n: number) => (
    <div className="min-w-0 rounded-lg border border-border bg-surface px-3 py-2">
      <div className="num text-lg font-semibold leading-tight tracking-[-0.01em] text-fg">{n}</div>
      <div className="truncate text-[11.5px] text-sub">{label}</div>
    </div>
  );
  return (
    <div className={cx("mt-4 min-w-0 animate-rise-in space-y-3 rounded-xl border border-border bg-subtle p-3 sm:p-4", className)} data-testid="import-preview">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg"><Eye className="h-3.5 w-3.5 text-primary" />{T("previewTitle")}</span>
        <Badge tone="primary" className="num">{p.format}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{stat(T("pvNotes"), p.notes)}{stat(T("pvCards"), p.cards)}{stat(T("pvDecks"), p.decks.length)}{stat(T("pvMedia"), p.media)}</div>
      {(p.duplicates > 0 || p.existing > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {p.duplicates > 0 && <Pill tone="hard"><Copy className="h-3 w-3" />{T("pvDupes", { n: p.duplicates })}</Pill>}
          {p.existing > 0 && <Pill tone="easy"><History className="h-3 w-3" />{T("pvExisting", { n: p.existing })}</Pill>}
        </div>
      )}
      {p.decks.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" title={p.decks.join("\n")}>
          <FolderTree className="h-3.5 w-3.5 shrink-0 text-faint" />
          {p.decks.slice(0, 6).map((d) => <Pill key={d} className="max-w-full truncate" title={d}><span className="truncate">{d}</span></Pill>)}
          {p.decks.length > 6 && <span className="text-[11.5px] text-faint">{T("pvMore", { n: p.decks.length - 6 })}</span>}
        </div>
      )}
      {p.samples.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full table-fixed text-xs">
            <thead className="bg-muted text-left text-sub"><tr><th className="w-1/2 px-3 py-1.5 font-medium">{T("pvFront")}</th><th className="px-3 py-1.5 font-medium">{T("pvBack")}</th></tr></thead>
            <tbody>
              {p.samples.map((s, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="truncate px-3 py-1.5 text-fg" title={`${s.deck} · ${s.type}`}>{s.front}</td>
                  <td className="truncate px-3 py-1.5 text-sub">{s.back}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {issues.length > 0 && (
        <details className="rounded-lg border border-warning/25 bg-warning/[0.06] text-xs text-sub">
          <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 px-3 sm:min-h-8"><AlertTriangle className="h-3.5 w-3.5 text-warning" />{T("pvIssues", { n: issues.length })}</summary>
          <ul className="max-h-32 list-disc space-y-0.5 overflow-auto break-words px-3 pb-2 pl-7">{issues.slice(0, 50).map((m, i) => <li key={i}>{m}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
