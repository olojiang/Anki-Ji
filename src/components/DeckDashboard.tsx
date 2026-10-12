"use client";
/** Right-hand dashboard column on the Decks page (≥xl only): today's plan, 14-day forecast, recent activity. */
import Link from "next/link";
import { BarChart3, CalendarClock, CheckCircle2, Flame, Play, Target } from "lucide-react";
import { useApp } from "./providers";
import { Button, Card, CardHeader, IconChip, Pill, ProgressBar, Skeleton } from "./ui";
import { Bars, Heatmap } from "./charts";

export interface DashStats {
  today: { reviews: number; minutes: number; again: number; newCards: number };
  streak: number; todayIndex: number; heatmap: Record<string, number>; forecast: number[];
  retention: { actual: number | null; target: number; sample: number };
}

export function DeckDashboard({ due, next, stats }: { due: { new: number; learning: number; review: number }; next: { id: number; name: string } | null; stats: DashStats | null }) {
  const { t, locale } = useApp();
  const total = due.new + due.learning + due.review;
  const done = stats?.today.reviews ?? 0;
  const fmt = (d: number) => new Date(d * 86400000).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });
  const fc = stats?.forecast.slice(0, 14) ?? [];
  const row = (label: string, n: number, tone: "sky" | "rose" | "emerald") => (
    <div className="flex items-center justify-between py-1.5 text-[13px]"><span className="text-sub">{label}</span><Pill tone={tone} mono className="min-w-[34px] justify-center">{n}</Pill></div>
  );
  return (
    <div className="m-stagger space-y-4" data-testid="deck-dashboard">
      <Card className="p-5">
        <CardHeader className="mb-4" icon={<IconChip tone="primary"><Target /></IconChip>} title={t("todayPlan")}
          description={stats ? t("studiedMin", { n: stats.today.minutes }) : undefined} />
        <div className="divide-y divide-border/70">
          {row(t("colNew"), due.new, "sky")}
          {row(t("colLearn"), due.learning, "rose")}
          {row(t("colDue"), due.review, "emerald")}
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11.5px] text-faint"><span>{t("reviewedToday")}</span><span className="num">{done} / {done + total}</span></div>
          <ProgressBar value={done + total ? done / (done + total) : 1} />
        </div>
        {next && total > 0 ? (
          <Link href={`/study/${next.id}`} className="mt-4 block"><Button variant="primary" className="w-full"><Play className="h-4 w-4" /><span className="truncate">{t("studyNext", { name: next.name })}</span></Button></Link>
        ) : (
          <p className="mt-4 flex items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-[13px] text-success"><CheckCircle2 className="h-4 w-4 shrink-0" />{t("allClear")}</p>
        )}
      </Card>

      <Card className="p-5">
        <CardHeader className="mb-4" icon={<IconChip tone="sky"><CalendarClock /></IconChip>} title={t("next14")}
          actions={<span className="num text-xs text-faint">{t("total")} {fc.reduce((a, b) => a + b, 0)}</span>} />
        {stats ? <Bars values={fc} labels={fc.map((_, i) => fmt(stats.todayIndex + i))} highlightFirst heightCls="h-28" /> : <Skeleton className="h-28 w-full" />}
      </Card>

      <Card className="p-5">
        <CardHeader className="mb-4" icon={<IconChip tone="orange"><Flame /></IconChip>} title={t("heatmap")} description={t("last20w")}
          actions={<Link href="/stats" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-sub transition-colors hover:bg-muted hover:text-fg"><BarChart3 className="h-3.5 w-3.5" />{t("openStats")}</Link>} />
        {stats ? <Heatmap weeks={20} data={stats.heatmap} today={stats.todayIndex} locale={locale} weekdays={t("weekdays").split(",")} less={t("less")} more={t("more_")} /> : <Skeleton className="h-28 w-full" />}
        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-subtle px-3 py-2"><div className="text-[11.5px] text-faint">{t("streak")}</div><div className="num text-[17px] font-semibold text-fg">{stats.streak} <span className="text-xs font-normal text-faint">{t("days")}</span></div></div>
            <div className="rounded-xl border border-border bg-subtle px-3 py-2"><div className="text-[11.5px] text-faint">{t("heroRetention")}</div><div className="num text-[17px] font-semibold text-fg">{stats.retention.actual == null ? "—" : `${(stats.retention.actual * 100).toFixed(1)}%`}</div></div>
          </div>
        )}
      </Card>
    </div>
  );
}
