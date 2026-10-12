"use client";
/** Stats: answer-time insight (median/mean/total, by rating, histogram, slowest cards). Never affects scheduling. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Timer, AlertTriangle } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { tf, type FsrsKey } from "@/lib/i18n-fsrs";
import { Card, IconChip, Pill, cx } from "@/components/ui";

interface Timing {
  longAnswerMs: number;
  summary: { count: number; totalMs: number; meanMs: number; medianMs: number; longCount: number; byRating: Record<string, { count: number; medianMs: number }>; histogram: number[] };
  last30: { count: number; medianMs: number; totalMs: number };
  slow: { cardId: number; noteId: number; front: string; reviews: number; medianMs: number }[];
}
const sec = (ms: number) => (ms >= 10000 ? `${Math.round(ms / 1000)}s` : `${(ms / 1000).toFixed(1)}s`);
const HIST = ["<5s", "5–10s", "10–20s", "20–40s", "40–60s", ">60s"];

export function ResponseTimeCard({ deckId }: { deckId: number | null }) {
  const { locale, t: tMain } = useApp();
  const t = (k: FsrsKey, v?: Record<string, string | number>) => tf(locale, k, v);
  const [d, setD] = useState<Timing | null>(null);
  useEffect(() => { setD(null); api<Timing>(`/api/stats/timing${deckId ? `?deckId=${deckId}` : ""}`).then(setD).catch(() => {}); }, [deckId]);
  if (!d) return null;
  const s = d.summary;
  const hours = s.totalMs / 3600000;
  const hmax = Math.max(1, ...s.histogram);
  const ratings = [{ g: "1", k: "again", cls: "bg-again" }, { g: "2", k: "hard", cls: "bg-hard" }, { g: "3", k: "good", cls: "bg-good" }, { g: "4", k: "easy", cls: "bg-easy" }];
  const rmax = Math.max(1, ...ratings.map((r) => s.byRating[r.g]?.medianMs ?? 0));
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <IconChip tone="teal" size="sm"><Timer /></IconChip>
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold tracking-[-0.01em]">{t("rtTitle")}</h3>
          <p className="mt-0.5 text-xs text-faint">{t("rtDesc")}</p>
        </div>
      </div>
      {s.count === 0 ? <p className="py-4 text-center text-sm text-faint">{t("rtNone")}</p> : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-2 self-start">
            <Tile label={t("rtMedian")} value={sec(s.medianMs)} />
            <Tile label={t("rtMean")} value={sec(s.meanMs)} />
            <Tile label={t("rtTotal")} value={hours >= 1 ? `${hours.toFixed(1)}${t("rtHours")}` : `${Math.round(s.totalMs / 60000)}${tf(locale, "simUnitMin")}`} />
            <Tile label={t("rtLong")} value={String(s.longCount)} warn={s.longCount > 0} sub={`${((s.longCount / s.count) * 100).toFixed(1)}%`} />
            <div className="col-span-2 text-[11.5px] text-faint">{t("rtLast30")}: {t("rtReviews", { n: d.last30.count })} · {t("rtMedian")} {sec(d.last30.medianMs)}</div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-[12.5px] font-medium text-sub">{t("rtByRating")}</div>
              <div className="space-y-1.5">
                {ratings.map((r) => {
                  const v = s.byRating[r.g] ?? { count: 0, medianMs: 0 };
                  return (
                    <div key={r.g} className="flex items-center gap-2 text-xs">
                      <span className="w-12 shrink-0 truncate text-sub">{tMain(r.k)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={cx("h-full rounded-full", r.cls)} style={{ width: `${(v.medianMs / rmax) * 100}%` }} /></div>
                      <span className="num w-20 shrink-0 text-right text-faint">{v.count ? `${sec(v.medianMs)} · ${v.count}` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex h-20 items-end gap-1.5">
              {s.histogram.map((n, i) => (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${HIST[i]}: ${n}`}>
                  <div className={cx("w-full rounded-t-[3px]", i === s.histogram.length - 1 ? "bg-amber-400" : "bg-primary/70")} style={{ height: `${Math.max(n ? 4 : 0, (n / hmax) * 100)}%` }} />
                  <span className="num text-[9.5px] text-faint">{HIST[i]}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[12.5px] font-medium text-sub">{t("rtSlow")}</div>
            <p className="mb-2 text-[11.5px] text-faint">{t("rtSlowHint")}</p>
            {d.slow.length === 0 ? <p className="text-xs text-faint">—</p> : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {d.slow.slice(0, 6).map((c) => (
                  <li key={c.cardId}>
                    <Link href={`/notes/${c.noteId}`} className="flex min-h-11 items-center gap-2 px-3 py-2 text-[12.5px] hover:bg-subtle">
                      <span className="min-w-0 flex-1 truncate text-fg">{c.front || `#${c.cardId}`}</span>
                      <Pill tone="hard" mono>{sec(c.medianMs)}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-subtle px-3 py-2.5">
      <div className="flex items-center gap-1 truncate text-xs text-sub">{warn && <AlertTriangle className="h-3 w-3 text-warning" />}{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5"><span className="num text-[18px] font-semibold text-fg">{value}</span>{sub && <span className="num text-[11px] text-faint">{sub}</span>}</div>
    </div>
  );
}
