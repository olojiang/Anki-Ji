"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X, RotateCcw, Trophy, Eye } from "lucide-react";
import { Button, Card, Input, Pill, ProgressBar, ProgressRing, cx } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { matchAnswer, shuffle, rng, spellAnswer, spellFinished, spellInit, type AnswerMatch, type SpellState, type StudyItem } from "@/core/modes";
import { DiffView, useTm, type ModeRecordDTO } from "./common";

export function SpellMode({ items, record, onFinish }: { items: StudyItem[]; record?: ModeRecordDTO; onFinish: (score: number) => Promise<boolean> }) {
  const { t } = useTm();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [st, setSt] = useState<SpellState | null>(null);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<AnswerMatch | null>(null);
  const [best, setBest] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const contRef = useRef<HTMLButtonElement>(null);

  const start = (pool = items) => { setSt(spellInit(shuffle(pool.map((i) => i.id), rng(Date.now())))); setTyped(""); setResult(null); setBest(false); };
  const cur = st && st.queue.length ? byId.get(st.queue[0]) : null;
  const finished = st ? spellFinished(st) : false;

  useEffect(() => { if (result) contRef.current?.focus(); else inputRef.current?.focus(); }, [result, cur?.id]);
  useEffect(() => {
    if (!st || !finished) return;
    const firstTry = st.done.filter((id) => !st.missed.includes(id)).length;
    onFinish(Math.round((firstTry / Math.max(1, st.done.length)) * 100)).then(setBest).catch(() => {});
  }, [finished]);

  const check = (giveUp = false) => {
    if (!cur || result) return;
    const m = giveUp ? { ...matchAnswer("", cur.answerText), verdict: "wrong" as const, correct: false } : matchAnswer(typed, cur.answerText);
    setResult(m);
  };
  const advance = () => {
    if (!st || !cur || !result) return;
    setSt(spellAnswer(st, cur.id, result.verdict === "exact"));
    setResult(null); setTyped("");
  };
  // auto-advance on a perfect answer
  useEffect(() => {
    if (result?.verdict !== "exact") return;
    const h = setTimeout(advance, 650);
    return () => clearTimeout(h);
  });

  if (!st) {
    return (
      <Card className="mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center">
        <p className="text-[14px] text-sub">{t("modeSpellDesc")}</p>
        {record?.bestScore != null && <Pill tone="amber" mono><Trophy className="h-3 w-3" />{t("best")} {Math.round(record.bestScore)}% · {t("plays", { n: record.plays })}</Pill>}
        <Button variant="primary" size="lg" onClick={() => start()}>{t("start")}</Button>
      </Card>
    );
  }

  if (finished) {
    const firstTry = st.done.filter((id) => !st.missed.includes(id)).length;
    const pct = Math.round((firstTry / Math.max(1, st.done.length)) * 100);
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Card className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
          <ProgressRing value={pct / 100} size={96} stroke={7}><span className="num text-[22px] font-semibold">{pct}%</span></ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-sub">{t("firstTry")}</div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h2 className="text-[18px] font-semibold">{t("progress", { d: st.done.length, n: st.done.length })}</h2>
              {best && <Pill tone="amber"><Trophy className="h-3 w-3" />{t("newBest")}</Pill>}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {st.missed.length > 0 && <Button onClick={() => start(st.missed.map((id) => byId.get(id)!).filter(Boolean))}>{t("retakeMistakes")}</Button>}
            <Button variant="primary" onClick={() => start()}><RotateCcw className="h-4 w-4" />{t("restart")}</Button>
          </div>
        </Card>
        {st.missed.length > 0 && (
          <Card className="divide-y divide-border overflow-hidden">
            <div className="px-4 py-2.5 text-[13px] font-semibold text-sub">{t("missedList")}</div>
            {st.missed.map((id) => { const it = byId.get(id); return it && (
              <div key={id} className="flex items-start gap-3 px-4 py-3 text-[14px]">
                <Markdown text={it.prompt} className="min-w-0 flex-1 [&_p]:m-0" />
                <span className="min-w-0 flex-1 font-mono text-success">{it.answerText}</span>
                <Pill mono>{t("attempts", { n: st.attempts[id] ?? 0 })}</Pill>
              </div>
            ); })}
          </Card>
        )}
      </div>
    );
  }

  const total = st.done.length + new Set(st.queue).size;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center gap-3 text-xs text-faint">
        <span className="num shrink-0">{t("progress", { d: st.done.length, n: total })}</span>
        <ProgressBar value={st.done.length / Math.max(1, total)} className="flex-1" />
        {cur && st.missed.includes(cur.id) && <Pill tone="rose"><RotateCcw className="h-3 w-3" /></Pill>}
      </div>
      <Card key={`${cur!.id}-${st.attempts[cur!.id] ?? 0}`} className="animate-card-in p-5 sm:p-8">
        <Markdown text={cur!.prompt} className="text-center text-[19px] font-medium sm:text-[22px]" />
        <div className="mx-auto mt-6 max-w-xl">
          {!result ? (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) check(); }}>
              <Input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("spellPh")} className="h-12 text-center font-mono sm:h-11" autoComplete="off" autoCapitalize="off" spellCheck={false} />
              <Button type="submit" variant="primary" className="h-12 sm:h-11">{t("check")}</Button>
            </form>
          ) : (
            <div className={cx("animate-reveal rounded-xl border p-4 text-left", result.verdict === "exact" ? "border-success/40 bg-success/[0.07]" : result.verdict === "close" ? "border-warning/40 bg-warning/[0.07]" : "border-danger/40 bg-danger/[0.06]")}>
              <div className={cx("mb-2 flex items-center gap-1.5 text-[13.5px] font-medium", result.verdict === "exact" ? "text-success" : result.verdict === "close" ? "text-warning" : "text-danger")}>
                {result.verdict === "exact" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {t(result.verdict === "exact" ? "spellRight" : result.verdict === "close" ? "spellClose" : "spellWrong")}
              </div>
              {result.verdict !== "exact" && (
                <>
                  {typed.trim() && <><div className="text-[11px] uppercase tracking-wide text-faint">{t("yourAns")}</div><div className="text-[15px]"><DiffView segments={result.segments} /></div></>}
                  <div className="mt-2 text-[11px] uppercase tracking-wide text-faint">{t("rightAns")}</div>
                  <div className="break-all font-mono text-[15px] text-fg">{result.expected}</div>
                </>
              )}
            </div>
          )}
          <div className="mt-3 flex justify-center">
            {!result
              ? <Button variant="ghost" size="sm" onClick={() => check(true)}><Eye className="h-3.5 w-3.5" />{t("reveal")}</Button>
              : <Button ref={contRef} variant={result.verdict === "exact" ? "ghost" : "primary"} onClick={advance}>{t("continue")} ⏎</Button>}
          </div>
        </div>
      </Card>
    </div>
  );
}
