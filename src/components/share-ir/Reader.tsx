"use client";
/**
 * Incremental reading view: one chunk at a time (position remembered), select text to extract or make a card,
 * then "read enough for now" (interval grows), postpone or done → next item in today's queue.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Scissors, Brackets, SquareStack, Check, Clock, Trash2, RotateCcw, ExternalLink, X, BookOpenCheck, CornerLeftUp, AlignJustify, Rows3 } from "lucide-react";
import { api } from "@/lib/api";
import { chunkBounds, readingProgress } from "@/core/reading";
import { Markdown } from "../Markdown";
import { Button, Card, CardHeader, IconButton, IconChip, Input, Loading, Pill, cx } from "../ui";
import { useSi } from "./useSi";
import { CardFromSelection, type CardSeed } from "./CardFromSelection";
import { PriorityPill, ReadBar, dueLabel, type ReadingItemDTO, type ReadingListDTO, type ReadingSummaryDTO } from "./reading-shared";

export function Reader({ id }: { id: number }) {
  const { s, toast, fail } = useSi();
  const router = useRouter();
  const [item, setItem] = useState<ReadingItemDTO | null>(null);
  const [today, setToday] = useState(0);
  const [pos, setPos] = useState(0);
  const [full, setFull] = useState(false);
  const [sel, setSel] = useState("");
  const selRef = useRef("");
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [seed, setSeed] = useState<CardSeed | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [prio, setPrio] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<{ item: ReadingItemDTO; today: number }>(`/api/reading/${id}`);
      setItem(r.item); setToday(r.today); setPos(r.item.position); setPrio(String(r.item.priority));
    } catch (e) { fail(e); router.push("/reading"); }
  }, [id, fail, router]);
  useEffect(() => { load(); }, [load]);

  // track the current text selection inside the reading pane (kept briefly after collapse so taps on the action bar still see it)
  useEffect(() => {
    const onSel = () => {
      const sl = window.getSelection();
      const txt = sl?.toString().trim() ?? "";
      const inside = !!sl && sl.rangeCount > 0 && !!contentRef.current?.contains(sl.getRangeAt(0).commonAncestorContainer);
      if (txt && inside) {
        if (clearTimer.current) clearTimeout(clearTimer.current);
        selRef.current = txt; setSel(txt);
      } else if (selRef.current) {
        if (clearTimer.current) clearTimeout(clearTimer.current);
        clearTimer.current = setTimeout(() => { selRef.current = ""; setSel(""); }, 700);
      }
    };
    document.addEventListener("selectionchange", onSel);
    return () => { document.removeEventListener("selectionchange", onSel); if (clearTimer.current) clearTimeout(clearTimer.current); };
  }, []);

  const text = item?.content ?? "";
  const chunk = useMemo(() => chunkBounds(text, pos), [text, pos]);
  const shown = full ? text : text.slice(chunk.start, chunk.end);
  const progress = readingProgress(text, full ? text.length : chunk.end);

  const savePos = (p: number) => { setPos(p); api(`/api/reading/${id}`, { method: "PATCH", body: { position: p } }).catch(() => {}); };
  const next = () => { if (!chunk.last) { savePos(chunk.end); window.scrollTo({ top: 0, behavior: "smooth" }); } };
  const prev = () => {
    let p = 0, last = 0;
    for (let b = chunkBounds(text, 0); b.start < chunk.start && b.end > p; b = chunkBounds(text, b.end)) { last = b.start; p = b.end; }
    savePos(last); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const dropSelection = () => { selRef.current = ""; setSel(""); window.getSelection()?.removeAllRanges(); };

  const goNextInQueue = async () => {
    try {
      const r = await api<ReadingListDTO>("/api/reading");
      const nextId = r.queue.find((x) => x !== id);
      router.push(nextId ? `/reading/${nextId}` : "/reading");
    } catch { router.push("/reading"); }
  };
  const act = async (action: "read" | "postpone" | "done" | "reopen") => {
    if (!item) return;
    setBusy(action);
    try {
      if (action === "read" && !full) await api(`/api/reading/${id}`, { method: "PATCH", body: { position: chunk.end } });
      const r = await api<{ item: ReadingSummaryDTO }>(`/api/reading/${id}/action`, { body: { action } });
      if (action === "read") toast(s("scheduledIn", { n: r.item.intervalDays }));
      else if (action === "postpone") toast(s("postponedTo", { n: r.item.dueDay - today }));
      else if (action === "done") toast(s("doneToast"));
      if (action === "reopen") { await load(); return; }
      await goNextInQueue();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const extract = async () => {
    const txt = selRef.current;
    if (!txt) return;
    try { await api(`/api/reading/${id}/extract`, { body: { text: txt } }); toast(s("extracted")); dropSelection(); await load(); } catch (e) { fail(e); }
  };
  const makeCard = (kind: "basic" | "cloze") => {
    const txt = selRef.current;
    if (!txt || !item) return;
    setSeed({ kind, selection: txt, context: shown, title: item.title });
  };
  const savePriority = async () => {
    if (!item) return;
    const p = Math.max(0, Math.min(100, Math.round(Number(prio))));
    if (!Number.isFinite(p) || p === item.priority) { setPrio(String(item.priority)); return; }
    try { await api(`/api/reading/${id}`, { method: "PATCH", body: { priority: p } }); setItem({ ...item, priority: p }); setPrio(String(p)); } catch (e) { fail(e); }
  };
  const remove = async () => {
    if (!confirm(s("deleteItemQ"))) return;
    try { await api(`/api/reading/${id}`, { method: "DELETE" }); router.push("/reading"); } catch (e) { fail(e); }
  };

  if (!item) return <Loading />;
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault(); // keep the selection when pressing action buttons

  const info = (
    <Card className="p-5">
      <CardHeader icon={<IconChip tone="orange"><BookOpenCheck /></IconChip>} title={s("reading")} description={item.status === "done" ? s("doneItems") : dueLabel(s, item.dueDay, today)} />
      <div className="mt-4 space-y-3 text-[13px]">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sub">{s("priority")}</span>
          <Input type="number" min={0} max={100} value={prio} onChange={(e) => setPrio(e.target.value)} onBlur={savePriority} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="w-20 text-right" aria-label={s("priority")} data-testid="reading-priority" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="neutral" mono>{s("reps", { n: item.reps })}</Pill>
          <Pill tone="neutral" mono>{s("interval", { n: item.intervalDays })}</Pill>
        </div>
        {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener" className="flex min-h-11 items-center gap-1.5 truncate text-primary hover:underline sm:min-h-0"><ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.sourceUrl.replace(/^https?:\/\//, "")}</span></a>}
        {item.parentId && <Link href={`/reading/${item.parentId}`} className="flex min-h-11 items-center gap-1.5 text-sub hover:text-fg sm:min-h-0"><CornerLeftUp className="h-3.5 w-3.5" />{s("parent")}</Link>}
      </div>
      {item.children.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-1.5 text-[12px] font-medium text-faint">{s("extractN", { n: item.children.length })}</div>
          <ul className="space-y-0.5">
            {item.children.map((c) => (
              <li key={c.id}><Link href={`/reading/${c.id}`} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-[13px] text-fg hover:bg-subtle sm:min-h-9">
                <Scissors className="h-3.5 w-3.5 shrink-0 text-faint" /><span className="min-w-0 flex-1 truncate">{c.title}</span><PriorityPill p={c.priority} label={s("priority")} />
              </Link></li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex justify-end border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={remove} className="text-danger hover:bg-rose-500/10 hover:text-danger"><Trash2 className="h-3.5 w-3.5" />{s("deleteItem")}</Button>
      </div>
    </Card>
  );

  return (
    <div>
      <div className="mb-5 flex items-start gap-2">
        <Link href="/reading" className="focus-ring mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sub hover:bg-muted sm:h-9 sm:w-9" aria-label={s("backToReading")} title={s("backToReading")}><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[26px]" data-testid="reader-title">{item.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            <PriorityPill p={item.priority} label={s("priority")} />
            {item.status === "done" && <Pill tone="emerald"><Check className="h-3 w-3" />{s("doneItems")}</Pill>}
            <ReadBar value={progress} className="max-w-[220px]" />
            <span className="num shrink-0 text-xs text-faint">{s("progress", { p: Math.round(progress * 100) })}</span>
          </div>
        </div>
        <IconButton label={full ? s("showChunks") : s("showFull")} onClick={() => setFull(!full)} className="mt-0.5">{full ? <Rows3 className="h-4 w-4" /> : <AlignJustify className="h-4 w-4" />}</IconButton>
      </div>

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <Card className="px-5 py-6 sm:px-8 sm:py-8">
            <div ref={contentRef} className="mx-auto max-w-[72ch] select-text" data-testid="reader-content">
              {shown.trim()
                ? <Markdown text={shown} className="text-left text-[16px] leading-[1.85] sm:text-[17px] " />
                : <p className="py-10 text-center text-sm text-faint">{s("endReached")}</p>}
            </div>
            {!full && (
              <div className="mx-auto mt-8 flex max-w-[72ch] items-center justify-between gap-2 border-t border-border pt-4">
                <Button variant="ghost" onClick={prev} disabled={chunk.start === 0}><ChevronLeft className="h-4 w-4" />{s("prevChunk")}</Button>
                {chunk.last
                  ? <span className="inline-flex items-center gap-2 text-xs text-faint">{s("endReached")}<Button size="sm" variant="ghost" onClick={() => savePos(0)}><RotateCcw className="h-3.5 w-3.5" />{s("startOver")}</Button></span>
                  : <Button onClick={next} data-testid="reader-next">{s("nextChunk")}<ChevronRight className="h-4 w-4" /></Button>}
              </div>
            )}
          </Card>

          {/* action bar: selection tools while text is selected, otherwise scheduling actions */}
          <Card className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mt-4 bg-elevated/95 p-2.5 shadow-pop backdrop-blur-xl md:bottom-3">
            {sel ? (
              <div className="flex items-center gap-2" data-testid="selection-bar">
                <span className="hidden min-w-0 flex-1 truncate px-1 text-xs text-faint sm:block">“{sel}”</span>
                <div className="grid flex-1 grid-cols-3 gap-2 sm:flex sm:flex-none">
                  <Button onPointerDown={keep} onMouseDown={keep} onClick={extract} data-testid="sel-extract"><Scissors className="h-4 w-4" />{s("extract")}</Button>
                  <Button onPointerDown={keep} onMouseDown={keep} onClick={() => makeCard("cloze")} data-testid="sel-cloze"><Brackets className="h-4 w-4" />{s("makeCloze")}</Button>
                  <Button onPointerDown={keep} onMouseDown={keep} onClick={() => makeCard("basic")} data-testid="sel-basic"><SquareStack className="h-4 w-4" />{s("makeBasic")}</Button>
                </div>
                <IconButton label="close" onClick={dropSelection}><X className="h-4 w-4" /></IconButton>
              </div>
            ) : item.status === "done" ? (
              <div className="flex items-center justify-between gap-2">
                <span className="px-1 text-xs text-faint">{s("selectHint")}</span>
                <Button variant="primary" loading={busy === "reopen"} onClick={() => act("reopen")}><RotateCcw className="h-4 w-4" />{s("reopen")}</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="hidden flex-1 px-1 text-xs text-faint lg:block">{s("selectHint")}</span>
                <div className="grid w-full grid-cols-[1fr_auto_auto] gap-2 lg:flex lg:w-auto">
                  <Button variant="primary" loading={busy === "read"} onClick={() => act("read")} data-testid="reader-read-enough"><BookOpenCheck className="h-4 w-4" />{s("readEnough")}</Button>
                  <Button loading={busy === "postpone"} onClick={() => act("postpone")} data-testid="reader-postpone" aria-label={s("postpone")} title={s("postpone")}><Clock className="h-4 w-4" /><span className="max-sm:hidden">{s("postpone")}</span></Button>
                  <Button loading={busy === "done"} onClick={() => act("done")} data-testid="reader-done" aria-label={s("markDone")} title={s("markDone")}><Check className="h-4 w-4" /><span className="max-sm:hidden">{s("markDone")}</span></Button>
                </div>
              </div>
            )}
          </Card>
          <div className={cx("mt-4 xl:hidden")}>{info}</div>
        </div>
        <aside className="hidden xl:sticky xl:top-10 xl:block">{info}</aside>
      </div>
      <CardFromSelection seed={seed} onClose={() => { setSeed(null); dropSelection(); }} />
    </div>
  );
}
