"use client";
/** Tick / edit / remove generated cards before they go to the shared import preview. */
import { Check, Trash2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { Badge, Textarea, cx } from "@/components/ui";
import { ta } from "@/lib/i18n-ai";
import { hasCloze } from "@/core/cloze";
import type { AiCard } from "@/core/ai/types";

export interface ReviewItem { id: number; card: AiCard; selected: boolean }

export const itemValid = (c: AiCard) => (c.kind === "qa" ? !!c.front.trim() : hasCloze(c.text));

export function AiCardReview({ items, onChange }: { items: ReviewItem[]; onChange: (items: ReviewItem[]) => void }) {
  const { locale } = useApp();
  const T = (k: string, v?: Record<string, string | number>) => ta(locale, k, v);
  const update = (id: number, p: Partial<ReviewItem>) => onChange(items.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const edit = (it: ReviewItem, p: Partial<AiCard>) => update(it.id, { card: { ...it.card, ...p } as AiCard });
  return (
    <ol className="space-y-2" data-testid="ai-review">
      {items.map((it, i) => {
        const c = it.card;
        const valid = itemValid(c);
        return (
          <li key={it.id} className={cx("rounded-xl border bg-surface p-2.5 transition-colors sm:p-3", it.selected ? "border-border-strong shadow-xs" : "border-border opacity-60")}>
            <div className="flex items-start gap-2">
              <button type="button" role="checkbox" aria-checked={it.selected} aria-label={`#${i + 1}`} onClick={() => update(it.id, { selected: !it.selected })}
                className="-m-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9">
                <span className={cx("inline-flex h-5 w-5 items-center justify-center rounded-md border transition-colors", it.selected ? "border-primary bg-primary text-primary-fg" : "border-border-strong bg-subtle")}>{it.selected && <Check className="h-3.5 w-3.5" />}</span>
              </button>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="num text-[11.5px] text-faint">#{i + 1}</span>
                  <Badge tone={c.kind === "cloze" ? "amber" : "teal"}>{T(c.kind === "cloze" ? "kindCloze" : "kindQa")}</Badge>
                  {c.tags.length > 0 && <span className="min-w-0 truncate text-[11.5px] text-faint">{c.tags.join(" ")}</span>}
                </div>
                {c.kind === "qa" ? (
                  <div className="grid gap-1.5 md:grid-cols-2">
                    <Textarea rows={2} aria-label={T("qaFront")} placeholder={T("qaFront")} value={c.front} onChange={(e) => edit(it, { front: e.target.value })} className="text-[13.5px]" />
                    <Textarea rows={2} aria-label={T("qaBack")} placeholder={T("qaBack")} value={c.back} onChange={(e) => edit(it, { back: e.target.value })} className="text-[13.5px]" />
                  </div>
                ) : (
                  <div className="grid gap-1.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <Textarea rows={2} aria-label={T("clozeText")} placeholder={T("clozeText")} value={c.text} onChange={(e) => edit(it, { text: e.target.value })} className="font-mono text-[13px]" />
                    <Textarea rows={2} aria-label={T("clozeExtra")} placeholder={T("clozeExtra")} value={c.extra} onChange={(e) => edit(it, { extra: e.target.value })} className="text-[13.5px]" />
                  </div>
                )}
                {!valid && <p className="text-[11.5px] text-danger">{c.kind === "cloze" ? T("noClozeWarn") : T("e_text_required")}</p>}
              </div>
              <button type="button" onClick={() => onChange(items.filter((x) => x.id !== it.id))} aria-label={T("removeCard")} title={T("removeCard")}
                className="-m-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-muted hover:text-again sm:h-9 sm:w-9"><Trash2 className="h-4 w-4" /></button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
