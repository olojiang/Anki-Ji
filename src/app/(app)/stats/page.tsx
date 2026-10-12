"use client";
import { useEffect, useState } from "react";
import { Flame, Clock, Target, Layers } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Card, IconChip, PageHeader, ProgressRing, Spinner, cx, type Tone } from "@/components/ui";
import { DeckPicker } from "@/components/DeckPicker";
import type { DeckDTO } from "@/lib/types";

interface Stats {
  today: { reviews: number; minutes: number; again: number; newCards: number }; streak: number; todayIndex: number; heatmap: Record<string, number>;
  reviewsByDay: { day: number; learn: number; review: number; relearn: number; again: number }[]; forecast: number[];
  retention: { actual: number | null; target: number; sample: number }; distribution: { new: number; learning: number; young: number; mature: number; suspended: number }; totalCards: number; totalReviews: number;
}

function Stat({ icon: Icon, label, value, sub, tone, extra }: { icon: typeof Flame; label: string; value: string; sub?: string; tone: Tone; extra?: React.ReactNode }) {
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

function Bars({ values, labels, stacks, highlightFirst, barCls = "bg-gradient-to-t from-primary to-primary/60" }: { values: number[]; labels?: string[]; stacks?: { v: number[]; cls: string }[]; highlightFirst?: boolean; barCls?: string }) {
  const totals = stacks ? values.map((_, i) => stacks.reduce((s, x) => s + x.v[i], 0)) : values;
  const max = Math.max(1, ...totals);
  const nice = max <= 4 ? max : Math.ceil(max / 4) * 4;
  return (
    <div>
      <div className="relative h-44">
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${f * 100}%` }}>
            <span className="num w-6 -translate-y-0 text-right text-[10px] text-faint">{f === 0 ? 0 : Math.round(nice * f)}</span>
            <span className={cx("h-px flex-1", f === 0 ? "bg-border" : "border-t border-dashed border-border/80")} />
          </div>
        ))}
        <div className="absolute inset-y-0 left-8 right-0 flex items-end gap-[3px]">
          {values.map((v, i) => {
            const tot = totals[i];
            const label = `${labels?.[i] ?? i}: ${tot}`;
            return (
              <div key={i} className="group relative flex h-full flex-1 flex-col justify-end" title={label}>
                {stacks ? (
                  <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-[3px] transition-opacity group-hover:opacity-80" style={{ height: `${(tot / nice) * 100}%`, minHeight: tot ? 3 : 0 }}>
                    {stacks.map((s, k) => <div key={k} className={s.cls} style={{ height: `${tot ? (s.v[i] / tot) * 100 : 0}%` }} />)}
                  </div>
                ) : (
                  <div className={cx("w-full rounded-t-[3px] transition-opacity group-hover:opacity-80", highlightFirst && i === 0 ? "bg-gradient-to-t from-amber-500 to-amber-300" : barCls)} style={{ height: `${(v / nice) * 100}%`, minHeight: v ? 3 : 0 }} />
                )}
                {tot > 0 && <span className="num pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded bg-fg px-1 text-[10px] text-bg group-hover:block">{tot}</span>}
              </div>
            );
          })}
        </div>
      </div>
      {labels && <div className="ml-8 mt-2 flex justify-between text-[10.5px] text-faint"><span className="num">{labels[0]}</span><span className="num">{labels[Math.floor(labels.length / 2)]}</span><span className="num">{labels[labels.length - 1]}</span></div>}
    </div>
  );
}

function Heatmap({ data, today, locale, weekdays, less, more }: { data: Record<string, number>; today: number; locale: string; weekdays: string[]; less: string; more: string }) {
  const weeks = 53, cell = 11, gap = 3, step = cell + gap, left = 26, top = 16;
  const end = today + (6 - ((today + 4) % 7));
  const start = end - weeks * 7 + 1;
  const max = Math.max(1, ...Object.values(data));
  const lvl = (n: number) => (n === 0 ? "fill-muted" : n < max * 0.25 ? "fill-primary/30" : n < max * 0.5 ? "fill-primary/55" : n < max * 0.75 ? "fill-primary/80" : "fill-primary");
  const months: { x: number; label: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    const d0 = new Date((start + w * 7) * 86400000);
    const d6 = new Date((start + w * 7 + 6) * 86400000);
    if (d6.getUTCDate() <= 7 && (w === 0 || d0.getUTCMonth() !== d6.getUTCMonth() || d0.getUTCDate() === 1)) {
      if (w < weeks - 2) months.push({ x: left + w * step, label: d6.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", timeZone: "UTC" }) });
    }
  }
  return (
    <div>
      <div className="overflow-x-auto scrollbar-thin">
        <svg viewBox={`0 0 ${left + weeks * step} ${top + 7 * step}`} className="min-w-[640px] w-full">
          {months.map((m) => <text key={m.x} x={m.x} y={10} className="fill-faint text-[9px]">{m.label}</text>)}
          {[1, 3, 5].map((r) => <text key={r} x={0} y={top + r * step + 9} className="fill-faint text-[9px]">{weekdays[r]}</text>)}
          {Array.from({ length: weeks * 7 }, (_, i) => {
            const d = start + i; if (d > today) return null;
            const n = data[d] ?? 0;
            return <rect key={i} x={left + Math.floor(i / 7) * step} y={top + (i % 7) * step} width={cell} height={cell} rx={2.5} className={cx(lvl(n), d === today && "stroke-fg/40")} strokeWidth={d === today ? 1 : 0}><title>{`${new Date(d * 86400000).toISOString().slice(0, 10)}: ${n}`}</title></rect>;
          })}
        </svg>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-faint">
        {less}
        {["bg-muted", "bg-primary/30", "bg-primary/55", "bg-primary/80", "bg-primary"].map((c) => <span key={c} className={cx("h-[11px] w-[11px] rounded-[3px]", c)} />)}
        {more}
      </div>
    </div>
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
        <div className="flex items-center gap-2">
          <button onClick={() => setDeckId(null)} className={cx("h-9 whitespace-nowrap rounded-lg px-3 text-[13px] transition-colors", deckId == null ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-border" : "text-sub hover:bg-muted hover:text-fg")}>{t("allDecks")}</button>
          <DeckPicker decks={decks} value={deckId} onChange={setDeckId} placeholder={t("deck")} />
        </div>} />
      {!s ? <div className="flex justify-center py-20"><Spinner /></div> : (
        <div className="animate-rise-in space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Clock} tone="teal" label={t("reviewsToday")} value={String(s.today.reviews)} sub={`${s.today.minutes} ${t("minutes")} · ${t("again")} ${s.today.again}`} />
            <Stat icon={Flame} tone="orange" label={t("streak")} value={String(s.streak)} sub={t("days")} />
            <Stat icon={Target} tone="emerald" label={t("trueRetention")} value={s.retention.actual == null ? "—" : `${(s.retention.actual * 100).toFixed(1)}%`} sub={`${t("target")} ${(s.retention.target * 100).toFixed(0)}% · n=${s.retention.sample}`}
              extra={<ProgressRing value={s.retention.actual ?? 0} size={36} stroke={3.5} className="hidden sm:inline-flex" />} />
            <Stat icon={Layers} tone="sky" label={t("totalCards")} value={String(s.totalCards)} sub={`${t("reps")} ${s.totalReviews}`} />
          </div>
          <ChartCard title={t("heatmap")}><Heatmap data={s.heatmap} today={s.todayIndex} locale={locale} weekdays={t("weekdays").split(",")} less={t("less")} more={t("more_")} /></ChartCard>
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
          <ChartCard title={t("cardStates")} right={<span className="num text-xs text-faint">{t("total")} {s.totalCards}</span>}>
            <Distribution d={s.distribution} labels={{ new: t("stNew"), learning: t("stLearning"), young: t("young"), mature: t("mature"), suspended: t("suspended") }} />
          </ChartCard>
        </div>
      )}
    </div>
  );
}

const Legend = ({ cls, label }: { cls: string; label: string }) => <span className="inline-flex items-center gap-1.5"><span className={cx("h-2 w-2 rounded-full", cls)} />{label}</span>;

function Distribution({ d, labels }: { d: Stats["distribution"]; labels: Record<string, string> }) {
  const parts = [{ k: "new", cls: "bg-sky-500 dark:bg-sky-400" }, { k: "learning", cls: "bg-rose-500 dark:bg-rose-400" }, { k: "young", cls: "bg-emerald-400/70" }, { k: "mature", cls: "bg-emerald-600 dark:bg-emerald-400" }, { k: "suspended", cls: "bg-amber-400" }] as const;
  const total = Math.max(1, parts.reduce((s, p) => s + d[p.k], 0));
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full bg-muted">{parts.filter((p) => d[p.k] > 0).map((p) => <div key={p.k} className={cx("h-full rounded-full transition-[width] duration-700", p.cls)} style={{ width: `${(d[p.k] / total) * 100}%` }} />)}</div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
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
