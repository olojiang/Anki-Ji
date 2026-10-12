"use client";
import { useEffect, useRef, useState } from "react";
import { Timer, Trophy, RotateCcw } from "lucide-react";
import { Button, Card, Pill, cx } from "@/components/ui";
import { generateMatch, matchFinalTime, rng, MATCH_PENALTY_MS, type MatchTile, type StudyItem } from "@/core/modes";
import { fmtMs, useTm, type ModeRecordDTO } from "./common";

const PAIRS = 6;

export function MatchGame({ items, record, onFinish }: { items: StudyItem[]; record?: ModeRecordDTO; onFinish: (ms: number) => Promise<boolean> }) {
  const { t } = useTm();
  const [phase, setPhase] = useState<"ready" | "play" | "done">("ready");
  const [tiles, setTiles] = useState<MatchTile[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const [misses, setMisses] = useState(0);
  const [now, setNow] = useState(0);
  const [final, setFinal] = useState<number | null>(null);
  const [best, setBest] = useState(false);
  const startAt = useRef(0);

  useEffect(() => {
    if (phase !== "play") return;
    const h = setInterval(() => setNow(Date.now() - startAt.current), 100);
    return () => clearInterval(h);
  }, [phase]);

  const start = () => {
    setTiles(generateMatch(items, PAIRS, rng(Date.now())));
    setGone(new Set()); setSel(null); setBad([]); setMisses(0); setFinal(null); setBest(false); setNow(0);
    startAt.current = Date.now(); setPhase("play");
  };
  const tap = async (tile: MatchTile) => {
    if (gone.has(tile.id) || bad.length) return;
    if (!sel) { setSel(tile.id); return; }
    if (sel === tile.id) { setSel(null); return; }
    const a = tiles.find((x) => x.id === sel)!;
    if (a.pairId === tile.pairId && a.side !== tile.side) {
      const g = new Set(gone); g.add(a.id); g.add(tile.id);
      setGone(g); setSel(null);
      if (g.size === tiles.length) {
        const ms = matchFinalTime(Date.now() - startAt.current, misses);
        setFinal(ms); setPhase("done");
        try { setBest(await onFinish(ms)); } catch { /* optional */ }
      }
    } else {
      setMisses((m) => m + 1); setBad([a.id, tile.id]); setSel(null);
      setTimeout(() => setBad([]), 450);
    }
  };

  const usable = generateMatch(items, PAIRS, rng(1)).length / 2;
  if (phase !== "play") {
    return (
      <Card className="mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center">
        {phase === "done" && final != null ? (
          <>
            <div className="text-[12.5px] font-medium text-sub">{t("matchDone")}</div>
            <div className="num text-[44px] font-semibold leading-none tracking-tight">{fmtMs(final)}</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {best && <Pill tone="amber"><Trophy className="h-3 w-3" />{t("newBest")}</Pill>}
              <Pill mono>{t("misses", { n: misses })}</Pill>
              {record?.bestMs != null && !best && <Pill mono>{t("best")} {fmtMs(record.bestMs)}</Pill>}
            </div>
            <Button variant="primary" size="lg" onClick={start}><RotateCcw className="h-4 w-4" />{t("restart")}</Button>
          </>
        ) : (
          <>
            <Timer className="h-8 w-8 text-primary" />
            <p className="text-[14px] text-sub">{t("modeMatchDesc")}</p>
            <div className="flex flex-wrap justify-center gap-1.5 text-xs">
              <Pill mono>{t("pairsN", { n: Math.min(PAIRS, usable) })}</Pill><Pill>{t("penalty")}</Pill>
              {record?.bestMs != null && <Pill tone="amber" mono><Trophy className="h-3 w-3" />{t("best")} {fmtMs(record.bestMs)}</Pill>}
            </div>
            <Button variant="primary" size="lg" onClick={start} disabled={usable < 2}>{t("start")}</Button>
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-faint">{t("matchHint")}</span>
        <span className="flex items-center gap-2">
          {misses > 0 && <Pill tone="rose" mono>+{(misses * MATCH_PENALTY_MS) / 1000}s</Pill>}
          <Pill tone="primary" mono><Timer className="h-3 w-3" />{fmtMs(now)}</Pill>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const isGone = gone.has(tile.id), isSel = sel === tile.id, isBad = bad.includes(tile.id);
          return (
            <button key={tile.id} disabled={isGone} onClick={() => tap(tile)} aria-pressed={isSel}
              className={cx("focus-ring flex min-h-[84px] items-center justify-center rounded-2xl border p-2 text-center text-[13.5px] leading-snug sm:p-3 transition-all duration-200 sm:min-h-[112px] sm:text-[15px]",
                isGone ? "pointer-events-none scale-90 border-transparent bg-transparent opacity-0" :
                  isBad ? "border-danger/60 bg-danger/10 text-danger" :
                    isSel ? "border-primary/70 bg-primary/[0.08] text-fg shadow-[0_0_0_3px_rgb(var(--primary)/0.15)]" :
                      "border-border bg-surface text-fg shadow-card hover:-translate-y-px hover:border-border-strong hover:shadow-md active:scale-[0.98]",
                tile.side === "answer" && !isSel && !isBad && !isGone && "bg-subtle")}>
              <span className="line-clamp-5 break-words">{tile.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
