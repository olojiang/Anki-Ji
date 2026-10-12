"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Replace, Copy, Shapes, GraduationCap, Undo2, X, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { Button, cx } from "@/components/ui";
import { useApp } from "@/components/providers";
import { useTm } from "@/components/modes/common";
import { FindReplaceModal } from "./FindReplaceModal";
import { DuplicatesModal } from "./DuplicatesModal";
import { ChangeTypeModal } from "./ChangeTypeModal";
import type { DeckDTO } from "@/lib/types";
import type { NoteType } from "@/core/types";

/** Browse toolbar entry for batch editing + cram modes. Owns its modals and the undo bar. */
export function BatchMenu({ selected, query, resultCount, decks, onChanged, className }: {
  selected: { id: number; type: NoteType }[]; query: string; resultCount: number; decks: DeckDTO[]; onChanged: () => void | Promise<void>; className?: string;
}) {
  const { t, fail } = useTm();
  const { toast } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"replace" | "dups" | "type" | null>(null);
  const [undo, setUndo] = useState<{ id: number; message: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", h); window.addEventListener("keydown", k);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open]);
  useEffect(() => {
    if (!undo) return;
    const h = setTimeout(() => setUndo(null), 20000);
    return () => clearTimeout(h);
  }, [undo]);

  const done = async (r: { undoId: number | null; message: string }) => {
    toast(r.message);
    if (r.undoId) setUndo({ id: r.undoId, message: r.message });
    await onChanged();
  };
  const doUndo = async () => {
    if (!undo) return;
    try { await api("/api/batch/undo", { body: { id: undo.id } }); setUndo(null); toast(t("undone")); await onChanged(); } catch (e) { fail(e); }
  };
  const cram = () => {
    const p = selected.length ? `notes=${selected.map((n) => n.id).join(",")}` : `q=${encodeURIComponent(query)}`;
    router.push(`/modes?${p}`);
  };
  const item = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] text-fg transition-colors hover:bg-muted disabled:opacity-40 sm:min-h-9";

  return (
    <>
      <div ref={ref} className={cx("relative", className)}>
        <Button className="w-full sm:h-10 md:w-auto" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
          <Wand2 className="h-4 w-4" />{t("batch")}<ChevronDown className="h-3.5 w-3.5 text-faint" />
        </Button>
        {open && (
          <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-64 origin-top-right animate-scale-in rounded-xl border border-border bg-elevated p-1 shadow-pop">
            <button role="menuitem" className={item} onClick={() => { setOpen(false); setModal("replace"); }}><Replace className="h-4 w-4 text-sub" />{t("findReplace")}</button>
            <button role="menuitem" className={item} onClick={() => { setOpen(false); setModal("dups"); }}><Copy className="h-4 w-4 text-sub" />{t("duplicates")}</button>
            <button role="menuitem" className={item} disabled={!selected.length} onClick={() => { setOpen(false); setModal("type"); }}>
              <Shapes className="h-4 w-4 text-sub" /><span className="flex-1">{t("changeType")}</span>{!selected.length && <span className="text-[11px] text-faint">{t("selectFirst")}</span>}
            </button>
            <div className="-mx-1 my-1 border-t border-border" />
            <button role="menuitem" className={item} disabled={!selected.length && !resultCount} onClick={() => { setOpen(false); cram(); }}>
              <GraduationCap className="h-4 w-4 text-sub" /><span className="flex-1">{t("modes")}</span>
              <span className="text-[11px] text-faint">{selected.length ? t("scopeSelected", { n: selected.length }) : resultCount}</span>
            </button>
          </div>
        )}
      </div>
      <FindReplaceModal open={modal === "replace"} onClose={() => setModal(null)} selectedIds={selected.map((n) => n.id)} query={query} resultCount={resultCount} onDone={done} />
      <DuplicatesModal open={modal === "dups"} onClose={() => setModal(null)} decks={decks} query={query} onDone={done} />
      <ChangeTypeModal open={modal === "type"} onClose={() => setModal(null)} notes={selected} onDone={done} />
      {undo && (
        <div className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md animate-rise-in items-center gap-2 rounded-xl border border-border bg-elevated px-3 py-2 shadow-pop md:bottom-6">
          <span className="min-w-0 flex-1 truncate text-[13px]">{undo.message}</span>
          <Button size="sm" variant="primary" onClick={doUndo}><Undo2 className="h-3.5 w-3.5" />{t("undoLast")}</Button>
          <button onClick={() => setUndo(null)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-faint hover:bg-muted sm:h-8 sm:w-8" aria-label={t("close")}><X className="h-4 w-4" /></button>
        </div>
      )}
    </>
  );
}
