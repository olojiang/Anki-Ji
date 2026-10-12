"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X, RotateCcw, ListRestart, Trophy } from "lucide-react";
import { Button, Card, Input, Kbd, Pill, ProgressBar, ProgressRing, cx } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { generateTest, gradeQuestion, scoreTest, QUESTION_KINDS, type QuestionKind, type StudyItem, type TestQuestion, type TestResponse, type TestScore } from "@/core/modes";
import { DiffView, useTm, type ModeRecordDTO } from "./common";

const KIND_KEY: Record<QuestionKind, string> = { mc: "kindMc", tf: "kindTf", written: "kindWritten" };

export function TestMode({ items, record, onFinish }: { items: StudyItem[]; record?: ModeRecordDTO; onFinish: (score: number) => Promise<boolean> }) {
  const { t } = useTm();
  const [phase, setPhase] = useState<"setup" | "run" | "result">("setup");
  const [count, setCount] = useState(Math.min(20, items.length));
  const [kinds, setKinds] = useState<QuestionKind[]>([...QUESTION_KINDS]);
  const [qs, setQs] = useState<TestQuestion[]>([]);
  const [resp, setResp] = useState<(TestResponse | null)[]>([]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState<TestScore | null>(null);
  const [best, setBest] = useState(false);

  useEffect(() => { setCount((c) => Math.min(Math.max(c, 1), items.length) || Math.min(20, items.length)); }, [items.length]);

  const start = (pool: StudyItem[] = items, n = count) => {
    const q = generateTest(pool, { count: n, kinds, seed: Date.now() });
    setQs(q); setResp(q.map(() => null)); setI(0); setScore(null); setBest(false); setPhase("run");
  };
  const finish = async (r = resp) => {
    const s = scoreTest(qs, r);
    setScore(s); setPhase("result");
    try { setBest(await onFinish(s.percent)); } catch { /* record is optional */ }
  };
  const answer = (r: TestResponse) => {
    const next = resp.map((x, k) => (k === i ? r : x));
    setResp(next);
    if (i < qs.length - 1) setTimeout(() => setI((v) => Math.min(v + 1, qs.length - 1)), 160);
  };

  if (phase === "setup") {
    return (
      <Card className="mx-auto max-w-xl p-5 sm:p-6">
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-[12.5px] font-medium text-sub">{t("qCount")}</div>
            <div className="flex flex-wrap items-center gap-2">
              {[10, 20, 30].filter((n) => n < items.length).map((n) => (
                <Button key={n} size="sm" variant={count === n ? "primary" : "secondary"} onClick={() => setCount(n)}>{n}</Button>
              ))}
              <Button size="sm" variant={count === items.length ? "primary" : "secondary"} onClick={() => setCount(items.length)}>{items.length}</Button>
              <Input type="number" min={1} max={items.length} value={count} onChange={(e) => setCount(Math.max(1, Math.min(items.length, Number(e.target.value) || 1)))} className="w-24" aria-label={t("qCount")} />
            </div>
          </div>
          <div>
            <div className="mb-2 text-[12.5px] font-medium text-sub">{t("qKinds")}</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {QUESTION_KINDS.map((k) => {
                const on = kinds.includes(k);
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => setKinds(on ? (kinds.length > 1 ? kinds.filter((x) => x !== k) : kinds) : [...kinds, k])}
                    className={cx("focus-ring flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13.5px] transition-all", on ? "border-primary/60 bg-primary/[0.07] font-medium text-fg" : "border-border bg-surface text-sub hover:border-border-strong")}>
                    <span className={cx("inline-flex h-4 w-4 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-fg" : "border-border-strong")}>{on && <Check className="h-3 w-3" />}</span>
                    {t(KIND_KEY[k])}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-faint">{record?.bestScore != null ? <>{t("best")}: <span className="num font-medium text-sub">{Math.round(record.bestScore)}%</span> · {t("plays", { n: record.plays })}</> : t("modeTestDesc")}</span>
            <Button variant="primary" size="lg" onClick={() => start()}>{t("start")}</Button>
          </div>
        </div>
      </Card>
    );
  }

  if (phase === "result" && score) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Card className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
          <ProgressRing value={score.percent / 100} size={96} stroke={7}><span className="num text-[22px] font-semibold">{score.percent}%</span></ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h2 className="text-[18px] font-semibold">{t("correctOf", { c: score.correct, n: score.total })}</h2>
              {best && <Pill tone="amber"><Trophy className="h-3 w-3" />{t("newBest")}</Pill>}
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {(Object.entries(score.byKind) as [QuestionKind, { correct: number; total: number }][]).map(([k, v]) => <Pill key={k} mono>{t(KIND_KEY[k])} {v.correct}/{v.total}</Pill>)}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {score.mistakes.length > 0 && <Button onClick={() => { const ids = new Set(score.mistakes.map((m) => m.question.itemId)); const pool = items.filter((x) => ids.has(x.id)); start(pool, pool.length); }}><ListRestart className="h-4 w-4" />{t("retakeMistakes")}</Button>}
            <Button variant="primary" onClick={() => start()}><RotateCcw className="h-4 w-4" />{t("retake")}</Button>
            <Button variant="ghost" onClick={() => setPhase("setup")}>{t("newTest")}</Button>
          </div>
        </Card>
        <h3 className="px-1 text-[13px] font-semibold text-sub">{t("mistakes")}</h3>
        {score.mistakes.length === 0 ? <Card className="p-6 text-center text-sub">{t("noMistakes")}</Card> : score.mistakes.map((m) => <MistakeRow key={m.question.id} q={m.question} r={m.response} />)}
      </div>
    );
  }

  const q = qs[i];
  const answered = resp.filter(Boolean).length;
  return <RunQuestion key={q.id} q={q} i={i} n={qs.length} answered={answered} response={resp[i]} onAnswer={answer}
    onPrev={() => setI(Math.max(0, i - 1))} onNext={() => setI(Math.min(qs.length - 1, i + 1))}
    onFinish={() => { const left = resp.filter((x) => !x).length; if (!left || confirm(t("unanswered", { n: left }))) finish(); }} />;
}

function RunQuestion({ q, i, n, answered, response, onAnswer, onPrev, onNext, onFinish }: {
  q: TestQuestion; i: number; n: number; answered: number; response: TestResponse | null; onAnswer: (r: TestResponse) => void; onPrev: () => void; onNext: () => void; onFinish: () => void;
}) {
  const { t } = useTm();
  const [text, setText] = useState(response?.text ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") { onPrev(); return; }
      if (e.key === "ArrowRight") { onNext(); return; }
      if (q.kind === "mc" && /^[1-9]$/.test(e.key) && Number(e.key) <= (q.options?.length ?? 0)) onAnswer({ choice: Number(e.key) - 1 });
      if (q.kind === "tf" && (e.key === "t" || e.key === "1")) onAnswer({ value: true });
      if (q.kind === "tf" && (e.key === "f" || e.key === "2")) onAnswer({ value: false });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [q, onAnswer, onPrev, onNext]);
  const opt = (selected: boolean) => cx("focus-ring flex min-h-12 w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-[15px] transition-all duration-150",
    selected ? "border-primary/60 bg-primary/[0.07] shadow-[0_0_0_3px_rgb(var(--primary)/0.12)]" : "border-border bg-surface shadow-xs hover:-translate-y-px hover:border-border-strong hover:shadow-md");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center gap-3 text-xs text-faint">
        <span className="num shrink-0">{t("questionN", { i: i + 1, n })}</span>
        <ProgressBar value={answered / n} className="flex-1" />
        <Pill>{t(KIND_KEY[q.kind])}</Pill>
      </div>
      <Card className="animate-card-in p-5 sm:p-8">
        <Markdown text={q.prompt} className="text-center text-[19px] font-medium sm:text-[22px]" />
        <div className="mx-auto mt-6 max-w-xl">
          {q.kind === "mc" && (
            <div className="grid gap-2">
              {q.options!.map((o, k) => (
                <button key={k} className={opt(response?.choice === k)} onClick={() => onAnswer({ choice: k })}>
                  <span className={cx("mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10.5px] font-semibold", response?.choice === k ? "border-primary bg-primary text-primary-fg" : "border-border-strong bg-subtle text-faint")}>{k + 1}</span>
                  <Markdown text={o} className="min-w-0 flex-1 text-left [&_p]:m-0" />
                </button>
              ))}
            </div>
          )}
          {q.kind === "tf" && (
            <div>
              <div className="rounded-xl border border-dashed border-border-strong bg-subtle px-4 py-3"><Markdown text={q.statement ?? ""} className="text-center text-[16px] [&_p]:m-0" /></div>
              <p className="mt-3 text-center text-xs text-faint">{t("tfQ")}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className={cx(opt(response?.value === true), "justify-center")} onClick={() => onAnswer({ value: true })}><Check className="h-4 w-4 text-success" />{t("tfTrue")}</button>
                <button className={cx(opt(response?.value === false), "justify-center")} onClick={() => onAnswer({ value: false })}><X className="h-4 w-4 text-danger" />{t("tfFalse")}</button>
              </div>
            </div>
          )}
          {q.kind === "written" && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAnswer({ text }); }}>
              <Input ref={inputRef} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t("writtenPh")} className="h-12 text-center font-mono sm:h-11" autoComplete="off" autoCapitalize="off" spellCheck={false} />
              <Button type="submit" variant="primary" className="h-12 sm:h-11">{t("submit")}</Button>
            </form>
          )}
        </div>
      </Card>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onPrev} disabled={i === 0}><ArrowLeft className="h-4 w-4" />{t("prev")}</Button>
        <span className="hidden text-[11.5px] text-faint md:inline">{t("keysTest")} <Kbd>←</Kbd> <Kbd>→</Kbd></span>
        {i < n - 1
          ? <Button variant="ghost" onClick={onNext}>{response ? t("next") : t("skip")}<ArrowRight className="h-4 w-4" /></Button>
          : <Button variant="primary" onClick={onFinish}>{t("finish")}</Button>}
      </div>
      {i < n - 1 && answered === n && <div className="mt-3 flex justify-center"><Button variant="primary" onClick={onFinish}>{t("finish")}</Button></div>}
    </div>
  );
}

function MistakeRow({ q, r }: { q: TestQuestion; r: TestResponse | null }) {
  const { t } = useTm();
  const g = useMemo(() => gradeQuestion(q, r), [q, r]);
  const yours = !r ? <span className="text-faint">{t("noAnswer")}</span>
    : q.kind === "mc" ? <Markdown text={q.options![r.choice!] ?? ""} className="[&_p]:m-0" />
    : q.kind === "tf" ? <span>{r.value ? t("tfTrue") : t("tfFalse")} <span className="text-faint">— {q.statementTrue ? t("tfTrue") : t("tfFalse")}</span></span>
    : g.match ? <DiffView segments={g.match.segments} /> : <span>{r.text}</span>;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger"><X className="h-3.5 w-3.5" /></span>
        <div className="min-w-0 flex-1 space-y-2">
          <Markdown text={q.prompt} className="font-medium [&_p]:m-0" />
          {q.kind === "tf" && <div className="text-[13px] text-sub"><Markdown text={q.statement ?? ""} className="[&_p]:m-0" /></div>}
          <div className="grid gap-2 text-[13.5px] sm:grid-cols-2">
            <div><div className="text-[11px] uppercase tracking-wide text-faint">{t("yourAns")}</div><div className="text-danger/90">{yours}</div></div>
            <div><div className="text-[11px] uppercase tracking-wide text-faint">{t("rightAns")}</div><Markdown text={q.answer} className="text-success [&_p]:m-0" /></div>
          </div>
        </div>
      </div>
    </Card>
  );
}
