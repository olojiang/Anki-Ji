"use client";
import { useEffect, useState } from "react";
import { Flame, Clock, Target, Layers } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Card, IconChip, PageHeader, ProgressRing, SkeletonCards, cx, type Tone } from "@/components/ui";
import { CountUp } from "@/components/motion";
import { DeckPicker } from "@/components/DeckPicker";
import { Bars, Heatmap, Legend } from "@/components/charts";
import type { DeckDTO } from "@/lib/types";

interface Stats {
  today: { reviews: number; minutes: number; again: number; newCards: number }; streak: number; todayIndex: number; heatmap: Record<string, number>;
  reviewsByDay: { day: number; learn: number; review: number; relearn: number; again: number }[]; forecast: number[];
  retention: { actual: number | null; target: number; sample: number }; distribution: { new: number; learning: number; young: number; mature: number; suspended: number }; totalCards: number; totalReviews: number;
}

function Stat({ icon: Icon, label, value, sub, tone, extra }: { icon: typeof Flame; label: string; value: React.ReactNode; sub?: string; tone: Tone; extra?: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2.5 text-[12.5px] font-medium text-sub"><IconChip tone={tone} size="sm"><Icon /></IconChip><span className="truncate">{label}</span></div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="num text-[28px] font-semibold leading-none text-fg">{value}</div>
          {sub && <div className="mt-2 truncate text-xs text-faint">{sub}</div>}
        </div>
        {extra}
      </div>
    </Card>
  );
}

function ChartCard({ title, right, children, className }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cx("p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h3>
        {right}
      </div>
      {children}
    </Card>
  );
}

export default function StatsPage() {
  const { t, locale } = useApp();
  const [decks, setDecks] = useState<DeckDTO[]>([]);
  const [deckId, setDeckId] = useState<number | null>(null);
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { api<{ decks: DeckDTO[] }>("/api/decks").then((r) => setDecks(r.decks)).catch(() => {}); }, []);
  useEffect(() => { setS(null); api<Stats>(`/api/stats${deckId ? `?deckId=${deckId}` : ""}`).then(setS).catch(() => {}); }, [deckId]);
  const fmt = (d: number) => new Date(d * 86400000).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric" });
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return (
    <div>
      <PageHeader title={t("stats")} actions={
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button onClick={() => setDeckId(null)} className={cx("h-11 whitespace-nowrap rounded-lg px-3 text-[13px] sm:h-9 transition-colors", deckId == null ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-border" : "text-sub hover:bg-muted hover:text-fg")}>{t("allDecks")}</button>
          <DeckPicker className="min-w-0 flex-1 sm:flex-none" decks={decks} value={deckId} onChange={setDeckId} placeholder={t("deck")} />
        </div>} />
      {!s ? <SkeletonCards /> : (
        <div className="animate-rise-in space-y-4">
          <div className="m-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Clock} tone="teal" label={t("reviewsToday")} value={<CountUp value={s.today.reviews} />} sub={`${s.today.minutes} ${t("minutes")} · ${t("again")} ${s.today.again}`} />
            <Stat icon={Flame} tone="orange" label={t("streak")} value={<CountUp value={s.streak} />} sub={t("days")} />
            <Stat icon={Target} tone="emerald" label={t("trueRetention")} value={s.retention.actual == null ? "—" : <CountUp value={Math.round(s.retention.actual * 1000)} format={(n) => `${(n / 10).toFixed(1)}%`} />} sub={`${t("target")} ${(s.retention.target * 100).toFixed(0)}% · n=${s.retention.sample}`}
              extra={<ProgressRing value={s.retention.actual ?? 0} size={36} stroke={3.5} className="hidden sm:inline-flex" />} />
            <Stat icon={Layers} tone="sky" label={t("totalCards")} value={<CountUp value={s.totalCards} />} sub={`${t("reps")} ${s.totalReviews}`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard title={t("heatmap")} className="xl:col-span-2">
            <div className="hidden sm:block"><Heatmap data={s.heatmap} today={s.todayIndex} locale={locale} weekdays={t("weekdays").split(",")} less={t("less")} more={t("more_")} /></div>
            <div className="sm:hidden"><Heatmap weeks={18} data={s.heatmap} today={s.todayIndex} locale={locale} weekdays={t("weekdays").split(",")} less={t("less")} more={t("more_")} /></div>
          </ChartCard>
          <ChartCard title={t("cardStates")} right={<span className="num text-xs text-faint">{t("total")} {s.totalCards}</span>}>
            <Distribution d={s.distribution} labels={{ new: t("stNew"), learning: t("stLearning"), young: t("young"), mature: t("mature"), suspended: t("suspended") }} />
          </ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={t("forecast")} right={<span className="num text-xs text-faint">{t("total")} {sum(s.forecast)}</span>}>
              <Bars values={s.forecast} labels={s.forecast.map((_, i) => fmt(s.todayIndex + i))} highlightFirst />
              <div className="mt-3 flex gap-4 text-xs text-sub"><Legend cls="bg-amber-400" label={t("today")} /><Legend cls="bg-primary" label={t("colDue")} /></div>
            </ChartCard>
            <ChartCard title={t("reviewsLast30")} right={<span className="num text-xs text-faint">{t("total")} {sum(s.reviewsByDay.map((d) => d.learn + d.review + d.relearn))}</span>}>
              <Bars values={s.reviewsByDay.map((d) => d.learn + d.review + d.relearn)} labels={s.reviewsByDay.map((d) => fmt(d.day))}
                stacks={[{ v: s.reviewsByDay.map((d) => d.learn), cls: "bg-sky-500 dark:bg-sky-400" }, { v: s.reviewsByDay.map((d) => d.review), cls: "bg-emerald-500 dark:bg-emerald-400" }, { v: s.reviewsByDay.map((d) => d.relearn), cls: "bg-rose-500 dark:bg-rose-400" }]} />
              <div className="mt-3 flex gap-4 text-xs text-sub"><Legend cls="bg-sky-500" label={t("stLearning")} /><Legend cls="bg-emerald-500" label={t("stReview")} /><Legend cls="bg-rose-500" label={t("stRelearning")} /></div>
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}

function Distribution({ d, labels }: { d: Stats["distribution"]; labels: Record<string, string> }) {
  const parts = [{ k: "new", cls: "bg-sky-500 dark:bg-sky-400" }, { k: "learning", cls: "bg-rose-500 dark:bg-rose-400" }, { k: "young", cls: "bg-emerald-400/70" }, { k: "mature", cls: "bg-emerald-600 dark:bg-emerald-400" }, { k: "suspended", cls: "bg-amber-400" }] as const;
  const total = Math.max(1, parts.reduce((s, p) => s + d[p.k], 0));
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full bg-muted">{parts.filter((p) => d[p.k] > 0).map((p) => <div key={p.k} className={cx("h-full rounded-full transition-[width] duration-700", p.cls)} style={{ width: `${(d[p.k] / total) * 100}%` }} />)}</div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5 xl:grid-cols-2">
        {parts.map((p) => (
          <div key={p.k} className="rounded-xl border border-border bg-subtle px-3 py-2.5">
            <div className="flex items-center gap-1.5 truncate text-xs text-sub"><span className={cx("h-2 w-2 shrink-0 rounded-full", p.cls)} />{labels[p.k]}</div>
            <div className="mt-1 flex items-baseline gap-1.5"><span className="num text-[18px] font-semibold text-fg">{d[p.k]}</span><span className="num text-[11px] text-faint">{Math.round((d[p.k] / total) * 100)}%</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
