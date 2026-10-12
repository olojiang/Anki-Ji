"use client";
/** Small dependency-free charts shared by Stats and the Decks dashboard. Colors come from theme tokens.
 *  Motion: bars grow up from the baseline (scaleY, staggered); heatmap weeks fade in left → right. */
import { cx } from "./ui";

export function Bars({ values, labels, stacks, highlightFirst, barCls = "bg-gradient-to-t from-primary to-primary/60", heightCls = "h-44" }: { values: number[]; labels?: string[]; stacks?: { v: number[]; cls: string }[]; highlightFirst?: boolean; barCls?: string; heightCls?: string }) {
  const totals = stacks ? values.map((_, i) => stacks.reduce((s, x) => s + x.v[i], 0)) : values;
  const max = Math.max(1, ...totals);
  const nice = max <= 4 ? max : Math.ceil(max / 4) * 4;
  return (
    <div>
      <div className={cx("relative", heightCls)}>
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
            const grow = { animationDelay: `${Math.min(i, 30) * 12}ms` };
            return (
              <div key={i} className="group relative flex h-full flex-1 flex-col justify-end" title={label}>
                {stacks ? (
                  <div className="flex w-full origin-bottom animate-grow-y flex-col-reverse overflow-hidden rounded-t-[3px] transition-opacity group-hover:opacity-80" style={{ height: `${(tot / nice) * 100}%`, minHeight: tot ? 3 : 0, ...grow }}>
                    {stacks.map((s, k) => <div key={k} className={s.cls} style={{ height: `${tot ? (s.v[i] / tot) * 100 : 0}%` }} />)}
                  </div>
                ) : (
                  <div className={cx("w-full origin-bottom animate-grow-y rounded-t-[3px] transition-opacity group-hover:opacity-80", highlightFirst && i === 0 ? "bg-gradient-to-t from-amber-500 to-amber-300" : barCls)} style={{ height: `${(v / nice) * 100}%`, minHeight: v ? 3 : 0, ...grow }} />
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

export function Heatmap({ data, today, locale, weekdays, less, more, weeks = 53 }: { data: Record<string, number>; today: number; locale: string; weekdays: string[]; less: string; more: string; weeks?: number }) {
  const cell = 11, gap = 3, step = cell + gap, left = 26, top = 16;
  const end = today + (6 - ((today + 4) % 7));
  const start = end - weeks * 7 + 1;
  const max = Math.max(1, ...Object.values(data));
  const lvl = (n: number) => (n === 0 ? "fill-muted" : n < max * 0.25 ? "fill-primary/30" : n < max * 0.5 ? "fill-primary/55" : n < max * 0.75 ? "fill-primary/80" : "fill-primary");
  const months: { x: number; label: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    const d0 = new Date((start + w * 7) * 86400000);
    const d6 = new Date((start + w * 7 + 6) * 86400000);
    if (d6.getUTCDate() <= 7 && (w === 0 || d0.getUTCMonth() !== d6.getUTCMonth() || d0.getUTCDate() === 1)) {
      if (w < weeks - 2 && (months.length === 0 || w * step - (months[months.length - 1].x - left) > 30)) months.push({ x: left + w * step, label: d6.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", timeZone: "UTC" }) });
    }
  }
  return (
    <div>
      <div>
        <svg viewBox={`0 0 ${left + weeks * step} ${top + 7 * step}`} className="w-full">
          {months.map((m) => <text key={m.x} x={m.x} y={10} className="fill-faint text-[9px]">{m.label}</text>)}
          {[1, 3, 5].map((r) => <text key={r} x={0} y={top + r * step + 9} className="fill-faint text-[9px]">{weekdays[r]}</text>)}
          {Array.from({ length: weeks * 7 }, (_, i) => {
            const d = start + i; if (d > today) return null;
            const n = data[d] ?? 0;
            return <rect key={i} x={left + Math.floor(i / 7) * step} y={top + (i % 7) * step} width={cell} height={cell} rx={2.5} className={cx(lvl(n), d === today && "stroke-fg/40")} strokeWidth={d === today ? 1 : 0}
              style={{ animation: "m-fade var(--dur-slow) var(--ease-standard) both", animationDelay: `${Math.floor((i / 7 / weeks) * 400)}ms` }}><title>{`${new Date(d * 86400000).toISOString().slice(0, 10)}: ${n}`}</title></rect>;
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

export const Legend = ({ cls, label }: { cls: string; label: string }) => <span className="inline-flex items-center gap-1.5"><span className={cx("h-2 w-2 rounded-full", cls)} />{label}</span>;
