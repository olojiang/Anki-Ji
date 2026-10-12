"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Undo2, PauseCircle, EyeOff, Flag, Pencil, PartyPopper, Clock, Info } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Button, Card, Spinner, Kbd, Pill, ProgressBar, IconChip, cx } from "@/components/ui";
import { CardView, type RenderedCardDTO } from "@/components/CardView";

interface StudyCard extends RenderedCardDTO { cardId: number; noteId: number; type: string; state: string; intervals: Record<string, string>; flag: number; leech: boolean; tags: string[]; retrievability: number | null; stability: number; difficulty: number; reps: number; lapses: number }
interface StudyState { deck: { id: number; name: string; filtered: boolean }; counts: { new: number; learning: number; review: number }; card: StudyCard | null; nextLearningAt: string | null }

const RATING = [
  { r: 1, key: "again", text: "text-again", dot: "bg-again", cls: "hover:border-again/45 hover:bg-again/[0.06] hover:shadow-[0_8px_24px_-10px_rgb(var(--again)/0.5)]" },
  { r: 2, key: "hard", text: "text-hard", dot: "bg-hard", cls: "hover:border-hard/45 hover:bg-hard/[0.06] hover:shadow-[0_8px_24px_-10px_rgb(var(--hard)/0.5)]" },
  { r: 3, key: "good", text: "text-good", dot: "bg-good", cls: "hover:border-good/45 hover:bg-good/[0.06] hover:shadow-[0_8px_24px_-10px_rgb(var(--good)/0.5)]" },
  { r: 4, key: "easy", text: "text-easy", dot: "bg-easy", cls: "hover:border-easy/45 hover:bg-easy/[0.06] hover:shadow-[0_8px_24px_-10px_rgb(var(--easy)/0.5)]" },
];

export default function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const deckId = Number(id);
  const { t, err, toast } = useApp();
  const router = useRouter();
  const [st, setSt] = useState<StudyState | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(false);
  const [done, setDone] = useState(0);
  const shownAt = useRef(Date.now());

  const apply = useCallback((s: StudyState | null) => {
    if (!s) return;
    setSt(s); setRevealed(false); setTyped(""); setPicked([]); shownAt.current = Date.now();
  }, []);
  useEffect(() => { api<StudyState>(`/api/study/${deckId}`).then(apply).catch(err); }, [deckId, apply, err]);
  // refresh when learning cards become due
  useEffect(() => {
    if (!st || st.card || !st.nextLearningAt) return;
    const ms = new Date(st.nextLearningAt).getTime() - Date.now();
    if (ms > 30 * 60000) return;
    const h = setTimeout(() => api<StudyState>(`/api/study/${deckId}`).then(apply).catch(() => {}), Math.max(1000, ms - 20 * 60000 + 1000));
    return () => clearTimeout(h);
  }, [st, deckId, apply]);

  const rate = useCallback(async (rating: number) => {
    if (!st?.card || busy) return;
    setBusy(true);
    try {
      const r = await api<{ leech: boolean; next: StudyState }>("/api/study/answer", { body: { cardId: st.card.cardId, rating, durationMs: Date.now() - shownAt.current, deckId } });
      if (r.leech) toast(t("leechNotice"), "error");
      setDone((d) => d + 1);
      apply(r.next);
    } catch (e) { err(e); } finally { setBusy(false); }
  }, [st, busy, deckId, apply, err, toast, t]);

  const undo = useCallback(async () => {
    try { const r = await api<{ next: StudyState; undone: unknown }>("/api/study/undo", { body: { deckId } }); if (r.undone) { apply(r.next); setDone((d) => Math.max(0, d - 1)); } } catch (e) { err(e); }
  }, [deckId, apply, err]);

  const action = useCallback(async (a: "suspend" | "bury" | "buryNote" | "flag") => {
    if (!st?.card) return;
    try {
      const flag = a === "flag" ? (st.card.flag ? 0 : 1) : undefined;
      const r = await api<{ next: StudyState }>("/api/study/action", { body: { cardId: st.card.cardId, action: a, flag, deckId } });
      if (a === "flag") setSt({ ...st, card: { ...st.card, flag: flag! } }); else apply(r.next);
    } catch (e) { err(e); }
  }, [st, deckId, apply, err]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!st?.card) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!revealed) setRevealed(true); else rate(3); return; }
      if (revealed && ["1", "2", "3", "4"].includes(e.key)) { rate(Number(e.key)); return; }
      if (!revealed && st.card.kind === "mcq" && /^[a-h]$/i.test(e.key) && !e.metaKey && !e.ctrlKey) {
        const i = e.key.toLowerCase().charCodeAt(0) - 97;
        if (i < (st.card.options?.length ?? 0)) pick(i);
        return;
      }
      if (e.key === "z" || e.key === "u") undo();
      else if (e.key === "s") action("suspend");
      else if (e.key === "b") action("bury");
      else if (e.key === "f") action("flag");
      else if (e.key === "e") router.push(`/notes/${st.card.noteId}?back=/study/${deckId}`);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const pick = (i: number) => {
    if (!st?.card) return;
    const multi = (st.card.correct?.length ?? 0) > 1;
    setPicked((p) => (multi ? (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]) : [i]));
  };

  if (!st) return <div className="flex justify-center py-24"><Spinner /></div>;
  const c = st.counts;
  const card = st.card;
  const remaining = c.new + c.learning + c.review;
  const tool = "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 hover:bg-muted active:scale-95";
  const stateTone = card?.state === "new" ? "sky" : card?.state === "review" ? "emerald" : "rose";
  const stateLabel = card?.state === "new" ? t("stNew") : card?.state === "review" ? t("stReview") : card?.state === "learning" ? t("stLearning") : t("stRelearning");
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/" className={cx(tool, "text-sub hover:text-fg")} aria-label={t("back")}><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="min-w-[96px] flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">{st.deck.name}</h1>
        <div className="flex items-center gap-1">
          <Pill tone="sky" mono title={t("colNew")} className={cx(card?.state === "new" && "ring-2 ring-sky-500/40")}>{c.new}</Pill>
          <Pill tone="rose" mono title={t("colLearn")} className={cx((card?.state === "learning" || card?.state === "relearning") && "ring-2 ring-rose-500/40")}>{c.learning}</Pill>
          <Pill tone="emerald" mono title={t("colDue")} className={cx(card?.state === "review" && "ring-2 ring-emerald-500/40")}>{c.review}</Pill>
        </div>
        <div className="ml-auto flex items-center gap-0.5 rounded-xl border border-border bg-surface p-0.5 shadow-xs">
          <button onClick={undo} className={cx(tool, "text-sub hover:text-fg")} title={`${t("undo")} (Z)`}><Undo2 className="h-4 w-4" /></button>
          {card && <>
            <button onClick={() => router.push(`/notes/${card.noteId}?back=/study/${deckId}`)} className={cx(tool, "text-sub hover:text-fg")} title={`${t("edit")} (E)`}><Pencil className="h-4 w-4" /></button>
            <button onClick={() => action("flag")} className={cx(tool, card.flag ? "text-hard" : "text-sub hover:text-fg")} title={`${t("flag")} (F)`}><Flag className={cx("h-4 w-4", card.flag > 0 && "fill-current")} /></button>
            <button onClick={() => action("bury")} className={cx(tool, "text-sub hover:text-fg")} title={`${t("bury")} (B)`}><EyeOff className="h-4 w-4" /></button>
            <button onClick={() => action("suspend")} className={cx(tool, "text-sub hover:text-fg")} title={`${t("suspend")} (S)`}><PauseCircle className="h-4 w-4" /></button>
            <button onClick={() => setInfo(!info)} className={cx(tool, info ? "bg-muted text-primary" : "text-sub hover:text-fg")} title={t("cardInfo")}><Info className="h-4 w-4" /></button>
          </>}
        </div>
      </div>
      <div className="mb-6 flex items-center gap-3">
        <ProgressBar value={done + remaining ? done / (done + remaining) : 1} className="flex-1" />
        <span className="num shrink-0 text-[11.5px] text-faint">{done}<span className="opacity-50"> / </span>{done + remaining}</span>
      </div>

      {!card ? (
        <Card className="relative flex flex-1 animate-card-in flex-col items-center justify-center overflow-hidden px-6 py-20 text-center">
          <div className="bg-grid mask-radial pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute left-1/2 top-1/3 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <IconChip tone={st.nextLearningAt ? "amber" : "primary"} size="lg" className="relative mb-5 h-14 w-14 rounded-2xl shadow-md [&>svg]:h-7 [&>svg]:w-7">{st.nextLearningAt ? <Clock /> : <PartyPopper />}</IconChip>
          <p className="relative text-[20px] font-semibold tracking-[-0.02em]">{t("congrats")}</p>
          {done > 0 && <p className="relative mt-2 text-[13.5px] text-sub">{t("sessionDone", { n: done })}</p>}
          {st.nextLearningAt && <p className="relative mt-2 text-[13.5px] text-sub">{t("comeBack", { t: relTime(st.nextLearningAt) })}</p>}
          <div className="relative mt-7 flex gap-2"><Button onClick={undo}><Undo2 className="h-4 w-4" />{t("undo")}</Button><Link href="/"><Button variant="primary">{t("backToDecks")}</Button></Link></div>
        </Card>
      ) : (
        <>
          <div className="relative flex flex-1 flex-col">
            <div className="pointer-events-none absolute inset-x-8 -bottom-3 top-6 rounded-3xl border border-border/70 bg-surface/50 shadow-xs" />
            <div className="pointer-events-none absolute inset-x-4 -bottom-1.5 top-3 rounded-3xl border border-border/80 bg-surface/80 shadow-xs" />
            <Card key={card.cardId} className="relative flex flex-1 animate-card-in flex-col rounded-3xl px-5 pb-10 pt-5 shadow-hero sm:px-12 sm:pb-14">
              <div className="mb-6 flex items-center justify-between gap-2">
                <Pill tone={stateTone} dot>{stateLabel}</Pill>
                <span className="flex items-center gap-1.5">
                  {card.leech && <Pill tone="rose">leech</Pill>}
                  {card.tags.slice(0, 2).map((x) => <Pill key={x} className="hidden max-w-[140px] truncate sm:inline-flex">{x}</Pill>)}
                </span>
              </div>
              {info && (
                <div className="mb-6 grid animate-rise-in grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-xs sm:grid-cols-5">
                  {[
                    [t("retrievability"), card.retrievability == null ? "—" : `${Math.round(card.retrievability * 100)}%`],
                    [t("stability"), card.stability ? `${card.stability.toFixed(1)}d` : "—"],
                    [t("difficulty"), card.difficulty ? card.difficulty.toFixed(1) : "—"],
                    [t("reps"), String(card.reps)],
                    [t("lapses"), String(card.lapses)],
                  ].map(([k, v]) => <div key={k} className="bg-subtle px-3 py-2"><div className="text-faint">{k}</div><div className="num mt-0.5 text-[13px] font-semibold text-fg">{v}</div></div>)}
                </div>
              )}
              <div className="my-auto">
                <CardView card={card} revealed={revealed} typed={typed} onTyped={setTyped} onSubmitTyped={() => setRevealed(true)} picked={picked} onPick={pick} />
              </div>
            </Card>
          </div>
          <div className="sticky bottom-0 mt-6 bg-gradient-to-t from-bg via-bg/95 to-transparent pb-3 pt-3">
            {!revealed ? (
              <Button variant="primary" size="lg" className="h-12 w-full text-[15px]" onClick={() => setRevealed(true)}>{t("showAnswer")} <span className="ml-1 hidden sm:inline-flex"><Kbd>Space</Kbd></span></Button>
            ) : (
              <div className="grid animate-rise-in grid-cols-4 gap-2 sm:gap-3">
                {RATING.map((b) => (
                  <button key={b.r} disabled={busy} onClick={() => rate(b.r)}
                    className={cx("focus-ring group flex flex-col items-center rounded-xl border border-border bg-surface px-1 py-2.5 shadow-card transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] disabled:opacity-50 sm:py-3", b.cls)}>
                    <span className="num text-[11.5px] text-faint">{card.intervals[String(b.r)]}</span>
                    <span className={cx("mt-0.5 inline-flex items-center gap-1.5 text-[14.5px] font-semibold", b.text)}><span className={cx("hidden h-1.5 w-1.5 rounded-full sm:inline-block", b.dot)} />{t(b.key)}</span>
                    <span className="mt-1.5 hidden text-faint sm:block"><Kbd>{b.r}</Kbd></span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-3 hidden text-center text-[11.5px] text-faint sm:block">{t("shortcuts")}</p>
          </div>
        </>
      )}
    </div>
  );
}

function relTime(iso: string) {
  const m = Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
}
