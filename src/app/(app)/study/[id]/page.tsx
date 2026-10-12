"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Undo2, PauseCircle, EyeOff, Flag, Pencil, PartyPopper, Clock, Info } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Button, Card, Spinner, Kbd, cx } from "@/components/ui";
import { CardView, type RenderedCardDTO } from "@/components/CardView";

interface StudyCard extends RenderedCardDTO { cardId: number; noteId: number; type: string; state: string; intervals: Record<string, string>; flag: number; leech: boolean; tags: string[]; retrievability: number | null; stability: number; difficulty: number; reps: number; lapses: number }
interface StudyState { deck: { id: number; name: string; filtered: boolean }; counts: { new: number; learning: number; review: number }; card: StudyCard | null; nextLearningAt: string | null }

const RATING = [
  { r: 1, key: "again", cls: "text-again hover:bg-again/10 border-again/30" },
  { r: 2, key: "hard", cls: "text-hard hover:bg-hard/10 border-hard/30" },
  { r: 3, key: "good", cls: "text-good hover:bg-good/10 border-good/30" },
  { r: 4, key: "easy", cls: "text-easy hover:bg-easy/10 border-easy/30" },
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
      apply(r.next);
    } catch (e) { err(e); } finally { setBusy(false); }
  }, [st, busy, deckId, apply, err, toast, t]);

  const undo = useCallback(async () => {
    try { const r = await api<{ next: StudyState; undone: unknown }>("/api/study/undo", { body: { deckId } }); if (r.undone) apply(r.next); } catch (e) { err(e); }
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
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-5 flex items-center gap-2">
        <Link href="/" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-muted" aria-label={t("back")}><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{st.deck.name}</h1>
        <div className="flex items-center gap-3 font-mono text-sm tabular-nums">
          <span className={cx("text-primary", card?.state === "new" && "underline underline-offset-4")} title={t("colNew")}>{c.new}</span>
          <span className={cx("text-again", (card?.state === "learning" || card?.state === "relearning") && "underline underline-offset-4")} title={t("colLearn")}>{c.learning}</span>
          <span className={cx("text-easy", card?.state === "review" && "underline underline-offset-4")} title={t("colDue")}>{c.review}</span>
        </div>
        <div className="ml-2 flex items-center gap-0.5 border-l border-border pl-2">
          <button onClick={undo} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-muted" title={`${t("undo")} (Z)`}><Undo2 className="h-4 w-4" /></button>
          {card && <>
            <button onClick={() => router.push(`/notes/${card.noteId}?back=/study/${deckId}`)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-muted" title={`${t("edit")} (E)`}><Pencil className="h-4 w-4" /></button>
            <button onClick={() => action("flag")} className={cx("inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted", card.flag ? "text-hard" : "text-sub")} title={`${t("flag")} (F)`}><Flag className="h-4 w-4" /></button>
            <button onClick={() => action("bury")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-muted" title={`${t("bury")} (B)`}><EyeOff className="h-4 w-4" /></button>
            <button onClick={() => action("suspend")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-muted" title={`${t("suspend")} (S)`}><PauseCircle className="h-4 w-4" /></button>
            <button onClick={() => setInfo(!info)} className={cx("inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted", info ? "text-primary" : "text-sub")} title={t("cardInfo")}><Info className="h-4 w-4" /></button>
          </>}
        </div>
      </div>

      {!card ? (
        <Card className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
          <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">{st.nextLearningAt ? <Clock className="h-7 w-7" /> : <PartyPopper className="h-7 w-7" />}</span>
          <p className="text-lg font-semibold">{t("congrats")}</p>
          {st.nextLearningAt && <p className="mt-2 text-sm text-sub">{t("comeBack", { t: relTime(st.nextLearningAt) })}</p>}
          <div className="mt-6 flex gap-2"><Button onClick={undo}><Undo2 className="h-4 w-4" />{t("undo")}</Button><Link href="/"><Button variant="primary">{t("backToDecks")}</Button></Link></div>
        </Card>
      ) : (
        <>
          <Card className="relative flex flex-1 flex-col px-5 py-8 sm:px-10 sm:py-12">
            {card.leech && <span className="absolute right-4 top-3 text-[11px] font-medium text-again">leech</span>}
            {info && (
              <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-3 text-xs text-sub sm:grid-cols-5">
                <span>{t("retrievability")}: <b className="text-fg">{card.retrievability == null ? "—" : `${Math.round(card.retrievability * 100)}%`}</b></span>
                <span>{t("stability")}: <b className="text-fg">{card.stability ? `${card.stability.toFixed(1)}d` : "—"}</b></span>
                <span>{t("difficulty")}: <b className="text-fg">{card.difficulty ? card.difficulty.toFixed(1) : "—"}</b></span>
                <span>{t("reps")}: <b className="text-fg">{card.reps}</b></span>
                <span>{t("lapses")}: <b className="text-fg">{card.lapses}</b></span>
              </div>
            )}
            <div className="my-auto">
              <CardView card={card} revealed={revealed} typed={typed} onTyped={setTyped} onSubmitTyped={() => setRevealed(true)} picked={picked} onPick={pick} />
            </div>
          </Card>
          <div className="sticky bottom-0 mt-4 bg-gradient-to-t from-bg via-bg to-transparent pb-3 pt-2">
            {!revealed ? (
              <Button variant="primary" size="lg" className="w-full" onClick={() => setRevealed(true)}>{t("showAnswer")} <span className="hidden sm:inline"><Kbd>Space</Kbd></span></Button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {RATING.map((b) => (
                  <button key={b.r} disabled={busy} onClick={() => rate(b.r)} className={cx("focus-ring flex flex-col items-center rounded-xl border bg-surface py-2.5 shadow-card transition-colors disabled:opacity-50", b.cls)}>
                    <span className="text-[11.5px] text-faint">{card.intervals[String(b.r)]}</span>
                    <span className="text-[15px] font-semibold">{t(b.key)}</span>
                    <span className="mt-0.5 hidden sm:block"><Kbd>{b.r}</Kbd></span>
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
