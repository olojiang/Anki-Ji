"use client";
/** Decks dashboard: daily goal progress ring + goal streak + last 7 days. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Target, Check } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { tf, type FsrsKey } from "@/lib/i18n-fsrs";
import { Card, ProgressRing, cx } from "@/components/ui";

interface Goal { goal: { type: "cards" | "minutes"; target: number }; today: { done: number; target: number; ratio: number; met: boolean }; streak: number; last7: { day: number; ratio: number; met: boolean; done: number }[] }

export function DailyGoalCard({ reloadKey }: { reloadKey?: unknown }) {
  const { locale, t: tMain } = useApp();
  const t = (k: FsrsKey, v?: Record<string, string | number>) => tf(locale, k, v);
  const [g, setG] = useState<Goal | null>(null);
  useEffect(() => { api<Goal>("/api/goal").then(setG).catch(() => {}); }, [reloadKey]);
  if (!g) return null;
  const off = g.goal.target <= 0;
  const unit = g.goal.type === "minutes" ? tf(locale, "simUnitMin") : tMain("cardsUnit");
  const wd = tMain("weekdays").split(",");
  return (
    <Card className="mb-3 flex items-center gap-4 p-3 sm:mb-4 sm:p-4">
      <ProgressRing value={off ? 0 : g.today.ratio} size={56} stroke={5} title={off ? t("goalOff") : `${g.today.done}/${g.today.target}`}>
        {g.today.met && !off ? <Check className="h-5 w-5 text-primary" strokeWidth={2.6} /> : <Target className="h-5 w-5 text-faint" />}
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-sub">{t("goalToday")}</div>
        {off ? (
          <Link href="/settings" className="mt-0.5 inline-flex min-h-11 items-center text-[14px] font-medium text-primary hover:underline sm:min-h-0">{t("goalSet")}</Link>
        ) : (
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className="num text-[22px] font-semibold leading-none text-fg">{g.today.done}<span className="text-[14px] font-normal text-faint"> / {g.today.target}</span></span>
            <span className="text-xs text-faint">{unit}</span>
            <span className={cx("text-xs", g.today.met ? "text-success" : "text-faint")}>{g.today.met ? t("goalDone") : t("goalLeft", { n: g.today.target - g.today.done })}</span>
          </div>
        )}
        {!off && <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-sub"><Flame className={cx("h-3.5 w-3.5", g.streak > 0 ? "text-orange-500" : "text-faint")} />{t("goalStreak", { n: g.streak })}</div>}
      </div>
      {!off && (
        <div className="hidden shrink-0 items-end gap-1.5 sm:flex" aria-hidden>
          {g.last7.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1">
              <div className="relative h-9 w-2.5 overflow-hidden rounded-full bg-muted">
                <div className={cx("absolute inset-x-0 bottom-0 rounded-full", d.met ? "bg-primary" : "bg-primary/40")} style={{ height: `${Math.round(d.ratio * 100)}%` }} />
              </div>
              <span className="text-[10px] text-faint">{wd[(((d.day + 4) % 7) + 7) % 7]}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
