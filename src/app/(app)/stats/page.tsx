"use client";
import { useEffect, useState } from "react";
import { Flame, Clock, Target, Layers } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Card, PageHeader, Spinner, cx } from "@/components/ui";
import { DeckPicker } from "@/components/DeckPicker";
import type { DeckDTO } from "@/lib/types";

interface Stats {
  today: { reviews: number; minutes: number; again: number; newCards: number }; streak: number; todayIndex: number; heatmap: Record<string, number>;
  reviewsByDay: { day: number; learn: number; review: number; relearn: number; again: number }[]; forecast: number[];
  retention: { actual: number | null; target: number; sample: number }; distribution: { new: number; learning: number; young: number; mature: number; suspended: number }; totalCards: number; totalReviews: number;
}

function Stat({ icon: Icon, label, value, sub, tone }: { icon: typeof Flame; label: string; value: string; sub?: string; tone: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-faint"><span className={cx("inline-flex h-6 w-6 items-center justify-center rounded-md", tone)}><Icon className="h-3.5 w-3.5" /></span>{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </Card>
  );
}

function Bars({ values, labels, color = "fill-primary", stacks }: { values: number[]; labels?: string[]; color?: string; stacks?: { v: number[]; cls: string }[] }) {
  const totals = stacks ? values.map((_, i) => stacks.reduce((s, x) => s + x.v[i], 0)) : values;
  const max = Math.max(1, ...totals);
  const w = 100 / values.length;
  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full">
        {values.map((v, i) => {
          if (!stacks) { const h = (v / max) * 38; return <rect key={i} x={i * w + w * 0.15} y={40 - h} width={w * 0.7} height={h} rx={0.6} className={color}><title>{`${labels?.[i] ?? i}: ${v}`}</title></rect>; }
          let y = 40;
          return <g key={i}>{stacks.map((s, k) => { const h = (s.v[i] / max) * 38; y -= h; return <rect key={k} x={i * w + w * 0.15} y={y} width={w * 0.7} height={h} className={s.cls}><title>{`${labels?.[i] ?? i}: ${s.v[i]}`}</title></rect>; })}</g>;
        })}
      </svg>
      {labels && <div className="mt-1 flex justify-between text-[10.5px] text-faint"><span>{labels[0]}</span><span>{labels[Math.floor(labels.length / 2)]}</span><span>{labels[labels.length - 1]}</span></div>}
    </div>
  );
}

function Heatmap({ data, today }: { data: Record<string, number>; today: number }) {
  const weeks = 53;
  const end = today + (6 - ((today + 4) % 7));
  const start = end - weeks * 7 + 1;
  const max = Math.max(1, ...Object.values(data));
  const lvl = (n: number) => (n === 0 ? "fill-muted" : n < max * 0.25 ? "fill-primary/30" : n < max * 0.5 ? "fill-primary/55" : n < max * 0.75 ? "fill-primary/80" : "fill-primary");
  return (
    <svg viewBox={`0 0 ${weeks * 12} ${7 * 12}`} className="w-full">
      {Array.from({ length: weeks * 7 }, (_, i) => {
        const d = start + i; if (d > today) return null;
        const n = data[d] ?? 0;
        return <rect key={i} x={Math.floor(i / 7) * 12} y={(i % 7) * 12} width={10} height={10} rx={2} className={lvl(n)}><title>{`${new Date(d * 86400000).toISOString().slice(0, 10)}: ${n}`}</title></rect>;
      })}
    </svg>
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
  return (
    <div>
      <PageHeader title={t("stats")} actions={
        <div className="flex items-center gap-2">
          <button onClick={() => setDeckId(null)} className={cx("h-9 rounded-lg px-3 text-sm", deckId == null ? "bg-muted font-medium" : "text-sub hover:bg-muted")}>{t("allDecks")}</button>
          <DeckPicker decks={decks} value={deckId} onChange={setDeckId} placeholder={t("deck")} />
        </div>} />
      {!s ? <div className="flex justify-center py-20"><Spinner /></div> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Clock} tone="bg-primary/10 text-primary" label={t("reviewsToday")} value={String(s.today.reviews)} sub={`${s.today.minutes} ${t("minutes")} · ${t("again")} ${s.today.again}`} />
            <Stat icon={Flame} tone="bg-hard/10 text-hard" label={t("streak")} value={String(s.streak)} />
            <Stat icon={Target} tone="bg-easy/10 text-easy" label={t("trueRetention")} value={s.retention.actual == null ? "—" : `${(s.retention.actual * 100).toFixed(1)}%`} sub={`${t("target")} ${(s.retention.target * 100).toFixed(0)}% · n=${s.retention.sample}`} />
            <Stat icon={Layers} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" label={t("totalCards")} value={String(s.totalCards)} />
          </div>
          <Card className="p-5"><h3 className="mb-3 text-sm font-semibold">{t("heatmap")}</h3><Heatmap data={s.heatmap} today={s.todayIndex} /></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5"><h3 className="mb-3 text-sm font-semibold">{t("forecast")}</h3><Bars values={s.forecast} labels={s.forecast.map((_, i) => fmt(s.todayIndex + i))} color="fill-easy" /></Card>
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold">{t("reviewsPerDay")}</h3>
              <Bars values={s.reviewsByDay.map((d) => d.learn + d.review + d.relearn)} labels={s.reviewsByDay.map((d) => fmt(d.day))}
                stacks={[{ v: s.reviewsByDay.map((d) => d.learn), cls: "fill-primary" }, { v: s.reviewsByDay.map((d) => d.review), cls: "fill-easy" }, { v: s.reviewsByDay.map((d) => d.relearn), cls: "fill-again" }]} />
              <div className="mt-2 flex gap-4 text-xs text-sub"><Legend cls="bg-primary" label={t("stLearning")} /><Legend cls="bg-easy" label={t("stReview")} /><Legend cls="bg-again" label={t("stRelearning")} /></div>
            </Card>
          </div>
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold">{t("cardStates")}</h3>
            <Distribution d={s.distribution} labels={{ new: t("stNew"), learning: t("stLearning"), young: t("young"), mature: t("mature"), suspended: t("suspended") }} />
          </Card>
        </div>
      )}
    </div>
  );
}

const Legend = ({ cls, label }: { cls: string; label: string }) => <span className="inline-flex items-center gap-1.5"><span className={cx("h-2.5 w-2.5 rounded-sm", cls)} />{label}</span>;

function Distribution({ d, labels }: { d: Stats["distribution"]; labels: Record<string, string> }) {
  const parts = [{ k: "new", cls: "bg-primary" }, { k: "learning", cls: "bg-again" }, { k: "young", cls: "bg-easy/60" }, { k: "mature", cls: "bg-easy" }, { k: "suspended", cls: "bg-hard" }] as const;
  const total = Math.max(1, parts.reduce((s, p) => s + d[p.k], 0));
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">{parts.map((p) => <div key={p.k} className={p.cls} style={{ width: `${(d[p.k] / total) * 100}%` }} />)}</div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">{parts.map((p) => <span key={p.k} className="inline-flex items-center gap-2 text-sub"><span className={cx("h-2.5 w-2.5 rounded-sm", p.cls)} />{labels[p.k]} <b className="font-semibold tabular-nums text-fg">{d[p.k]}</b></span>)}</div>
    </div>
  );
}
