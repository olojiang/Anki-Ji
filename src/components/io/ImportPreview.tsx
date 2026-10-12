"use client";
import { AlertTriangle } from "lucide-react";
import { useApp } from "@/components/providers";
import { ti } from "@/lib/i18n-import";
import type { ImportPreview as Preview } from "@/core/io/draft";

/** Preview of a parsed import (counts, decks, sample cards, issues) shown before committing. */
export function ImportPreview({ preview: p }: { preview: Preview }) {
  const { locale } = useApp();
  const T = (k: string, v?: Record<string, string | number>) => ti(locale, k, v);
  const issues = [...p.errors.map((e) => (e.row ? `#${e.row} ${e.message}` : e.message)), ...p.warnings];
  const stat = (label: string, n: number) => <div className="min-w-0"><div className="text-lg font-semibold tabular-nums">{n}</div><div className="text-xs text-sub">{label}</div></div>;
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border p-3 text-sm" data-testid="import-preview">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium">{T("previewTitle")}</span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11.5px] text-sub">{p.format}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">{stat(T("pvNotes"), p.notes)}{stat(T("pvCards"), p.cards)}{stat(T("pvDecks"), p.decks.length)}{stat(T("pvMedia"), p.media)}</div>
      {(p.duplicates > 0 || p.existing > 0) && (
        <p className="text-xs text-sub">{[p.duplicates > 0 && T("pvDupes", { n: p.duplicates }), p.existing > 0 && T("pvExisting", { n: p.existing })].filter(Boolean).join(" · ")}</p>
      )}
      {p.decks.length > 0 && (
        <p className="truncate text-xs text-sub" title={p.decks.join("\n")}>{p.decks.slice(0, 6).join(" · ")}{p.decks.length > 6 ? ` ${T("pvMore", { n: p.decks.length - 6 })}` : ""}</p>
      )}
      {p.samples.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full table-fixed text-xs">
            <thead className="bg-muted text-left text-sub"><tr><th className="w-1/2 px-2 py-1 font-medium">{T("pvFront")}</th><th className="px-2 py-1 font-medium">{T("pvBack")}</th></tr></thead>
            <tbody>
              {p.samples.map((s, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="truncate px-2 py-1" title={`${s.deck} · ${s.type}`}>{s.front}</td>
                  <td className="truncate px-2 py-1 text-sub">{s.back}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {issues.length > 0 && (
        <details className="text-xs text-sub">
          <summary className="flex cursor-pointer items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-hard" />{T("pvIssues", { n: issues.length })}</summary>
          <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-auto pl-5">{issues.slice(0, 50).map((m, i) => <li key={i}>{m}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
