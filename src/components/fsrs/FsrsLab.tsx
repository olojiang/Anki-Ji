"use client";
/** Deck options → FSRS: retention simulator (workload vs retention, optimal retention) + parameter version history. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, History, Sparkles, Wand2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { tf, type FsrsKey } from "@/lib/i18n-fsrs";
import { Button, Pill, Segmented, Spinner, cx } from "@/components/ui";
import type { DeckConfig } from "@/core/types";

interface Point { retention: number; avgReviewsPerDay: number; avgMinutesPerDay: number; totalReviews: number; memorizedEnd: number; secondsPerMemorized: number | null; weekly: { reviews: number; minutes: number; memorized: number }[] }
interface SimResponse { current: number; optimal: number | null; params: { newPerDay: number }; costs: { learn: number; pass: number; fail: number }; fromHistory: { costs: boolean }; collection: { newCards: number; reviewCards: number }; points: Point[] }
interface Version { id: number; source: "manual" | "auto" | "revert"; adopted: boolean; weights: number[] | null; prevWeights: number[] | null; logLoss: number | null; rmse: number | null; prevLogLoss: number | null; prevRmse: number | null; items: number; createdAt: string }

const MIN_R = 0.7, MAX_R = 0.97;
const clampR = (r: number) => Math.min(MAX_R, Math.max(MIN_R, Math.round(r * 100) / 100));

export function FsrsLab({ deckId, config, onChange }: { deckId: string; config: DeckConfig; onChange: (p: Partial<DeckConfig>) => void }) {
  const { locale } = useApp();
  const t = (k: FsrsKey, v?: Record<string, string | number>) => tf(locale, k, v);
  return (
    <>
      <RetentionSimulator deckId={deckId} config={config} onChange={onChange} t={t} />
      <ParamHistory deckId={deckId} weights={config.fsrsWeights} onChange={onChange} t={t} />
    </>
  );
}

type T = (k: FsrsKey, v?: Record<string, string | number>) => string;

function RetentionSimulator({ deckId, config, onChange, t }: { deckId: string; config: DeckConfig; onChange: (p: Partial<DeckConfig>) => void; t: T }) {
  const { err } = useApp();
  const [sim, setSim] = useState<SimResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState<"reviews" | "minutes">("reviews");
  const key = JSON.stringify([config.fsrsWeights, config.newPerDay, config.reviewsPerDay, config.maxInterval]);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    const h = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api<SimResponse>(`/api/decks/${deckId}/simulate`, { body: { weights: config.fsrsWeights, newPerDay: config.newPerDay, reviewsPerDay: config.reviewsPerDay, maxInterval: config.maxInterval } });
        if (my === seq.current) setSim(r);
      } catch (e) { if (my === seq.current) err(e); } finally { if (my === seq.current) setLoading(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [deckId, key]);

  const r = clampR(config.desiredRetention);
  const point = sim?.points.find((p) => p.retention === r) ?? null;
  const empty = sim && sim.collection.newCards + sim.collection.reviewCards === 0;
  const unit = (v: number) => (metric === "reviews" ? v.toFixed(v < 10 ? 1 : 0) : v.toFixed(v < 10 ? 1 : 0));

  return (
    <div className="space-y-4 rounded-xl border border-border bg-subtle/60 p-4 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold"><Activity className="h-4 w-4 text-primary" />{t("simTitle")}{loading && <Spinner className="h-3.5 w-3.5" />}</div>
          <p className="mt-1 text-xs text-faint">{t("simDesc")}</p>
        </div>
        {sim?.optimal != null && (
          <div className="flex items-center gap-2" title={t("simOptimalHint")}>
            <Pill tone="emerald" mono><Sparkles className="h-3 w-3" />{t("simOptimal", { r: sim.optimal.toFixed(2) })}</Pill>
            {Math.abs(sim.optimal - config.desiredRetention) > 0.001 && <Button size="sm" variant="ghost" onClick={() => onChange({ desiredRetention: sim.optimal! })}>{t("simUse")}</Button>}
          </div>
        )}
      </div>

      {!sim ? <div className="flex h-40 items-center justify-center"><Spinner /></div> : empty ? <p className="py-6 text-center text-sm text-faint">{t("simEmpty")}</p> : (
        <>
          <Segmented value={metric} onChange={setMetric} options={[{ value: "reviews", label: t("simReviews") }, { value: "minutes", label: t("simMinutes") }]} />
          <RetentionChart points={sim.points} metric={metric} selected={r} optimal={sim.optimal} onPick={(x) => onChange({ desiredRetention: x })} labels={{ workload: t("simWorkload"), knowledge: t("simKnowledge") }} />
          <div>
            <div className="mb-1 flex items-center justify-between text-[12.5px] text-sub"><span>{t("simAt", { r: r.toFixed(2) })}</span><span className="num text-faint">0.70 – 0.97</span></div>
            <input type="range" min={MIN_R} max={MAX_R} step={0.01} value={r} onChange={(e) => onChange({ desiredRetention: Number(e.target.value) })} className="h-11 w-full accent-primary sm:h-6" aria-label={t("simTitle")} />
          </div>
          {point && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label={t("simReviews")} value={unit(point.avgReviewsPerDay)} />
              <Metric label={t("simMinutes")} value={point.avgMinutesPerDay.toFixed(1)} />
              <Metric label={t("simMemorized")} value={`${point.memorizedEnd}`} sub={t("simUnitCards")} />
              <Metric label={t("simCost")} value={point.secondsPerMemorized == null ? "—" : `${Math.round(point.secondsPerMemorized)}`} sub={t("simUnitSec")} />
            </div>
          )}
          {point && <WeeklySpark weekly={point.weekly} metric={metric} title={t("simYear")} />}
          <p className="text-[11.5px] leading-5 text-faint">
            {t(sim.fromHistory.costs ? "simCostsUser" : "simCostsDefault", { l: sim.costs.learn, p: sim.costs.pass, f: sim.costs.fail })}
            {" · "}{t("simCollection", { n: sim.collection.newCards, r: sim.collection.reviewCards, d: sim.params.newPerDay })}
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="truncate text-[11.5px] text-faint">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1"><span className="num text-[17px] font-semibold text-fg">{value}</span>{sub && <span className="text-[11px] text-faint">{sub}</span>}</div>
    </div>
  );
}

/** Workload (area) and knowledge (line) vs desired retention. Click/tap a column to pick it. */
function RetentionChart({ points, metric, selected, optimal, onPick, labels }: { points: Point[]; metric: "reviews" | "minutes"; selected: number; optimal: number | null; onPick: (r: number) => void; labels: { workload: string; knowledge: string } }) {
  const W = 600, H = 200, P = { l: 34, r: 12, t: 10, b: 22 };
  const vals = points.map((p) => (metric === "reviews" ? p.avgReviewsPerDay : p.avgMinutesPerDay));
  const max = Math.max(1, ...vals) * 1.08;
  const memMax = Math.max(1, ...points.map((p) => p.memorizedEnd)) * 1.05;
  const memMin = Math.min(...points.map((p) => p.memorizedEnd)) * 0.95;
  const x = (r: number) => P.l + ((r - MIN_R) / (MAX_R - MIN_R)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  const ym = (v: number) => H - P.b - ((v - memMin) / Math.max(1, memMax - memMin)) * (H - P.t - P.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.retention).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(" ");
  const area = `${line} L${x(MAX_R)},${H - P.b} L${x(MIN_R)},${H - P.b} Z`;
  const mem = points.map((p, i) => `${i ? "L" : "M"}${x(p.retention).toFixed(1)},${ym(p.memorizedEnd).toFixed(1)}`).join(" ");
  const sel = points.find((p) => p.retention === selected);
  const ticks = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full select-none sm:h-52" role="img" aria-label={labels.workload}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={P.l} x2={W - P.r} y1={y(max / 1.08 * f)} y2={y(max / 1.08 * f)} className={cx("stroke-border", f > 0 && "[stroke-dasharray:3_4]")} strokeWidth={1} />
            <text x={P.l - 6} y={y(max / 1.08 * f) + 3} textAnchor="end" className="fill-faint text-[10px] num">{Math.round((max / 1.08) * f)}</text>
          </g>
        ))}
        {ticks.map((r) => <text key={r} x={x(r)} y={H - 6} textAnchor="middle" className="fill-faint text-[10px] num">{r.toFixed(2)}</text>)}
        <path d={area} className="fill-primary/15" />
        <path d={line} fill="none" className="stroke-primary" strokeWidth={2.2} strokeLinejoin="round" />
        <path d={mem} fill="none" className="stroke-success" strokeWidth={1.6} strokeDasharray="5 4" />
        {optimal != null && <line x1={x(optimal)} x2={x(optimal)} y1={P.t} y2={H - P.b} className="stroke-success" strokeWidth={1} strokeDasharray="2 3" />}
        {sel && (
          <g>
            <line x1={x(sel.retention)} x2={x(sel.retention)} y1={P.t} y2={H - P.b} className="stroke-fg/40" strokeWidth={1} />
            <circle cx={x(sel.retention)} cy={y(metric === "reviews" ? sel.avgReviewsPerDay : sel.avgMinutesPerDay)} r={4.5} className="fill-primary stroke-surface" strokeWidth={2} />
            <circle cx={x(sel.retention)} cy={ym(sel.memorizedEnd)} r={3.5} className="fill-success stroke-surface" strokeWidth={2} />
          </g>
        )}
        {points.map((p) => (
          <rect key={p.retention} x={x(p.retention) - (W - P.l - P.r) / (points.length - 1) / 2} y={P.t} width={(W - P.l - P.r) / (points.length - 1)} height={H - P.t - P.b} fill="transparent" className="cursor-pointer" onClick={() => onPick(p.retention)}>
            <title>{`${p.retention.toFixed(2)} · ${(metric === "reviews" ? p.avgReviewsPerDay : p.avgMinutesPerDay).toFixed(1)} · ${p.memorizedEnd}`}</title>
          </rect>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-sub">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-primary" />{labels.workload}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded border-t-2 border-dashed border-success" />{labels.knowledge}</span>
      </div>
    </div>
  );
}

function WeeklySpark({ weekly, metric, title }: { weekly: Point["weekly"]; metric: "reviews" | "minutes"; title: string }) {
  const vals = weekly.map((w) => (metric === "reviews" ? w.reviews : w.minutes));
  const max = Math.max(1e-6, ...vals);
  return (
    <div>
      <div className="mb-1.5 text-[11.5px] text-faint">{title}</div>
      <div className="flex h-12 items-end gap-[2px]">
        {vals.map((v, i) => <div key={i} className="flex-1 rounded-t-[2px] bg-primary/50" style={{ height: `${Math.max(2, (v / max) * 100)}%` }} title={`W${i + 1}: ${v.toFixed(1)}`} />)}
      </div>
    </div>
  );
}

function ParamHistory({ deckId, weights, onChange, t }: { deckId: string; weights: number[] | null; onChange: (p: Partial<DeckConfig>) => void; t: T }) {
  const { err, toast, locale } = useApp();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [auto, setAuto] = useState<boolean | null>(null);
  const wkey = useMemo(() => JSON.stringify(weights), [weights]);
  useEffect(() => {
    api<{ versions: Version[] }>(`/api/decks/${deckId}/params`).then((r) => setVersions(r.versions)).catch(() => setVersions([]));
  }, [deckId, wkey]);
  useEffect(() => { api<{ prefs: { autoOptimize: boolean } }>("/api/prefs").then((r) => setAuto(r.prefs.autoOptimize)).catch(() => {}); }, []);
  const revert = async (v: Version, target: "weights" | "previous") => {
    try {
      const r = await api<{ weights: number[] | null }>(`/api/decks/${deckId}/params`, { body: { versionId: v.id, target } });
      onChange({ fsrsWeights: r.weights });
      toast(t("histApplied"));
    } catch (e) { err(e); }
  };
  const fmt = (x: number | null) => (x == null ? "—" : x.toFixed(4));
  const date = (s: string) => new Date(s).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-3 rounded-xl border border-border bg-subtle/60 p-4 sm:col-span-2">
      <div>
        <div className="flex items-center gap-2 text-[13.5px] font-semibold"><History className="h-4 w-4 text-primary" />{t("histTitle")}</div>
        <p className="mt-1 text-xs text-faint">{t("histDesc")}</p>
        {auto != null && <p className="mt-1.5 flex items-start gap-1.5 text-xs text-sub"><Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{t(auto ? "autoOptOn" : "autoOptOff")}</p>}
      </div>
      {!versions ? <Spinner /> : versions.length === 0 ? <p className="text-xs text-faint">{t("histEmpty")}</p> : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {versions.slice(0, 8).map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-[12.5px]">
              <span className="num text-faint">{date(v.createdAt)}</span>
              <Pill tone={v.source === "auto" ? "teal" : v.source === "revert" ? "amber" : "neutral"}>{t(v.source === "auto" ? "srcAuto" : v.source === "revert" ? "srcRevert" : "srcManual")}</Pill>
              {v.weights == null && v.source !== "revert" ? <Pill tone="neutral">{t("histSkipped")}</Pill>
                : v.adopted ? <Pill tone="emerald" dot>{t("histAdopted")}</Pill> : <Pill tone="hard" dot>{t("histRejected")}</Pill>}
              {v.logLoss != null && (
                <span className="num text-sub" title="log-loss · RMSE(bins)">
                  {v.prevLogLoss != null && v.source !== "revert" ? <>{fmt(v.prevLogLoss)} → </> : null}<b className="font-medium text-fg">{fmt(v.logLoss)}</b>
                  <span className="text-faint"> · </span>
                  {v.prevRmse != null && v.source !== "revert" ? <>{fmt(v.prevRmse)} → </> : null}<b className="font-medium text-fg">{fmt(v.rmse)}</b>
                </span>
              )}
              <span className="ml-auto flex gap-1">
                {v.weights && JSON.stringify(v.weights) !== wkey && <Button size="sm" variant="ghost" onClick={() => revert(v, "weights")}>{t("histUse")}</Button>}
                {v.source !== "revert" && v.adopted && JSON.stringify(v.prevWeights) !== wkey && <Button size="sm" variant="ghost" onClick={() => revert(v, "previous")} title={v.prevWeights ? undefined : t("histDefault")}>{t("histPrev")}</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
