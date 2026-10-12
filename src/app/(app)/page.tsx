"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, MoreHorizontal, Play, Settings2, Pencil, Trash2, FolderPlus, Filter, RefreshCw, Eraser, Flame, CheckCircle2, GripVertical, Layers } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, cx } from "@/components/ui";
import { buildTree, type TreeNode } from "@/core/tree";
import type { Counts, DeckDTO } from "@/lib/types";

type Node = TreeNode<DeckDTO>;
type DropZone = "before" | "after" | "inside";

export default function DecksPage() {
  const { t, err, toast } = useApp();
  const router = useRouter();
  const [decks, setDecks] = useState<DeckDTO[] | null>(null);
  const [counts, setCounts] = useState<Counts>({});
  const [stats, setStats] = useState<{ today: { reviews: number }; streak: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<null | { kind: "new"; parentId: number | null } | { kind: "rename"; deck: DeckDTO } | { kind: "filtered" }>(null);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState({ query: "is:due", limit: 100, order: "due" });
  const [menu, setMenu] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ id: number; over: number | null; zone: DropZone | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ decks: DeckDTO[]; counts: Counts }>("/api/decks");
      setDecks(r.decks); setCounts(r.counts);
    } catch (e) { err(e); }
  }, [err]);
  useEffect(() => {
    load();
    api<{ today: { reviews: number }; streak: number }>("/api/stats").then(setStats).catch(() => {});
    try { setCollapsed(new Set(JSON.parse(localStorage.getItem("ak-collapsed") ?? "[]"))); } catch { /* ignore */ }
  }, [load]);
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const tree = useMemo(() => buildTree(decks ?? []), [decks]);
  const toggle = (id: number) => {
    const n = new Set(collapsed);
    if (n.has(id)) n.delete(id); else n.add(id);
    setCollapsed(n);
    localStorage.setItem("ak-collapsed", JSON.stringify([...n]));
  };

  const submit = async () => {
    try {
      if (modal?.kind === "new") await api("/api/decks", { body: { name, parentId: modal.parentId } });
      else if (modal?.kind === "rename") await api(`/api/decks/${modal.deck.id}`, { method: "PATCH", body: { name } });
      else if (modal?.kind === "filtered") await api("/api/decks", { body: { name: name || t("filteredDeck"), filtered: true, filter } });
      setModal(null); setName("");
      await load();
    } catch (e) { err(e); }
  };

  const remove = async (d: DeckDTO) => {
    if (!confirm(t("deleteDeckQ", { name: d.name }))) return;
    try { await api(`/api/decks/${d.id}`, { method: "DELETE" }); await load(); } catch (e) { err(e); }
  };
  const filteredAction = async (d: DeckDTO, action: "rebuild" | "empty") => {
    try { await api(`/api/decks/${d.id}/${action}`, { body: {} }); await load(); toast(t("done")); } catch (e) { err(e); }
  };

  const onDrop = async (target: Node, zone: DropZone) => {
    if (!drag || !decks || drag.id === target.id) { setDrag(null); return; }
    let parentId: number | null, index: number;
    if (zone === "inside" && !target.filtered) {
      parentId = target.id; index = decks.filter((d) => d.parentId === target.id).length;
    } else {
      parentId = target.parentId;
      const sibs = decks.filter((d) => d.parentId === parentId && d.id !== drag.id).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
      const i = sibs.findIndex((s) => s.id === target.id);
      index = zone === "before" ? i : i + 1;
    }
    setDrag(null);
    try { await api(`/api/decks/${drag.id}/move`, { body: { parentId, index } }); await load(); } catch (e) { err(e); }
  };

  const row = (n: Node, depth: number) => {
    const c = counts[n.id] ?? { new: 0, learning: 0, review: 0, total: 0 };
    const isOver = drag?.over === n.id;
    const hasKids = n.children.length > 0;
    const open = !collapsed.has(n.id);
    return (
      <div key={n.id}>
        <div
          draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ id: n.id, over: null, zone: null }); }}
          onDragEnd={() => setDrag(null)}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const y = (e.clientY - r.top) / r.height;
            const zone: DropZone = y < 0.28 ? "before" : y > 0.72 ? "after" : "inside";
            if (drag.over !== n.id || drag.zone !== zone) setDrag({ ...drag, over: n.id, zone });
          }}
          onDrop={(e) => { e.preventDefault(); onDrop(n, drag?.zone ?? "inside"); }}
          className={cx(
            "group relative flex items-center gap-2 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50",
            drag?.id === n.id && "opacity-40",
            isOver && drag?.zone === "inside" && "bg-primary/10 ring-1 ring-inset ring-primary/40",
          )}
        >
          {isOver && drag?.zone === "before" && <div className="absolute inset-x-2 top-0 h-0.5 rounded bg-primary" />}
          {isOver && drag?.zone === "after" && <div className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-primary" />}
          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-faint opacity-0 transition-opacity group-hover:opacity-100" />
          <div style={{ width: depth * 20 }} className="shrink-0" />
          <button onClick={() => hasKids && toggle(n.id)} className={cx("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint", hasKids ? "hover:bg-muted" : "invisible")} aria-label="toggle">
            <ChevronRight className={cx("h-4 w-4 transition-transform", open && "rotate-90")} />
          </button>
          <Link href={`/study/${n.id}`} className="flex min-w-0 flex-1 items-center gap-2 text-[14.5px] font-medium text-fg hover:text-primary">
            {n.filtered && <Filter className="h-3.5 w-3.5 shrink-0 text-primary" />}
            <span className="truncate">{n.name}</span>
            <span className="hidden shrink-0 text-xs font-normal text-faint sm:inline">{c.total}</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1 text-right font-mono text-[13px] tabular-nums">
            <span className={cx("w-10", c.new ? "text-primary" : "text-faint/60")}>{c.new}</span>
            <span className={cx("w-10", c.learning ? "text-again" : "text-faint/60")}>{c.learning}</span>
            <span className={cx("w-10", c.review ? "text-easy" : "text-faint/60")}>{c.review}</span>
          </div>
          <div className="relative flex shrink-0 items-center">
            <Link href={`/study/${n.id}`} className="hidden h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-muted hover:text-primary sm:inline-flex" title={t("study")}><Play className="h-4 w-4" /></Link>
            <button onClick={(e) => { e.stopPropagation(); setMenu(menu === n.id ? null : n.id); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-muted" aria-label={t("more")}><MoreHorizontal className="h-4 w-4" /></button>
            {menu === n.id && (
              <div className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-pop" onClick={(e) => e.stopPropagation()}>
                {!n.filtered && <MenuItem icon={FolderPlus} onClick={() => { setMenu(null); setName(""); setModal({ kind: "new", parentId: n.id }); }}>{t("newSubdeck")}</MenuItem>}
                <MenuItem icon={Pencil} onClick={() => { setMenu(null); setName(n.name); setModal({ kind: "rename", deck: n }); }}>{t("rename")}</MenuItem>
                <MenuItem icon={Settings2} onClick={() => router.push(`/decks/${n.id}`)}>{t("options")}</MenuItem>
                {n.filtered && <MenuItem icon={RefreshCw} onClick={() => { setMenu(null); filteredAction(n, "rebuild"); }}>{t("rebuild")}</MenuItem>}
                {n.filtered && <MenuItem icon={Eraser} onClick={() => { setMenu(null); filteredAction(n, "empty"); }}>{t("emptyDeck")}</MenuItem>}
                {n.parentId != null && <MenuItem icon={Layers} onClick={async () => { setMenu(null); try { await api(`/api/decks/${n.id}/move`, { body: { parentId: null, index: 9999 } }); await load(); } catch (e) { err(e); } }}>{t("moveToRoot")}</MenuItem>}
                <div className="my-1 border-t border-border" />
                <MenuItem icon={Trash2} danger onClick={() => { setMenu(null); remove(n); }}>{t("delete")}</MenuItem>
              </div>
            )}
          </div>
        </div>
        {hasKids && open && n.children.map((ch) => row(ch, depth + 1))}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title={t("decks")}
        subtitle={stats ? (
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" />{t("todayDone", { n: stats.today.reviews })}</span>
            <span className="inline-flex items-center gap-1.5"><Flame className="h-4 w-4 text-hard" />{t("streakDays", { n: stats.streak })}</span>
          </span>
        ) : undefined}
        actions={<>
          <Button onClick={() => { setName(""); setFilter({ query: "is:due", limit: 100, order: "due" }); setModal({ kind: "filtered" }); }}><Filter className="h-4 w-4" />{t("filteredDeck")}</Button>
          <Button variant="primary" onClick={() => { setName(""); setModal({ kind: "new", parentId: null }); }}><Plus className="h-4 w-4" />{t("newDeck")}</Button>
        </>}
      />
      {decks === null ? <div className="flex justify-center py-20"><Spinner /></div> : decks.length === 0 ? (
        <Empty icon={<Layers className="h-8 w-8" />} title={t("noDecks")}><Button variant="primary" onClick={() => setModal({ kind: "new", parentId: null })}><Plus className="h-4 w-4" />{t("newDeck")}</Button></Empty>
      ) : (
        <Card className="overflow-visible">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-medium text-faint">
            <span className="flex-1 pl-11">{t("deck")}</span>
            <span className="flex gap-1 text-right font-mono"><span className="w-10">{t("colNew")}</span><span className="w-10">{t("colLearn")}</span><span className="w-10">{t("colDue")}</span></span>
            <span className="w-8 sm:w-16" />
          </div>
          <div>{tree.map((n) => row(n, 0))}</div>
        </Card>
      )}
      {decks && decks.length > 1 && <p className="mt-3 text-xs text-faint">{t("dragHint")}</p>}

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal?.kind === "rename" ? t("rename") : modal?.kind === "filtered" ? t("newFilteredDeck") : modal?.kind === "new" && modal.parentId ? t("newSubdeck") : t("newDeck")}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>{t("cancel")}</Button><Button variant="primary" onClick={submit}>{modal?.kind === "rename" ? t("save") : t("create")}</Button></>}>
        <div className="space-y-4">
          <Field label={t("deckName")}><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && modal?.kind !== "filtered" && submit()} placeholder={modal?.kind === "filtered" ? t("filteredDeck") : ""} /></Field>
          {modal?.kind === "filtered" && <>
            <Field label={t("filterQuery")} hint={t("filterExamples")}><Input value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("filterLimit")}><Input type="number" min={1} value={filter.limit} onChange={(e) => setFilter({ ...filter, limit: Number(e.target.value) })} /></Field>
              <Field label={t("filterOrder")}>
                <Select className="w-full" value={filter.order} onChange={(e) => setFilter({ ...filter, order: e.target.value })}>
                  <option value="due">{t("orderDue")}</option><option value="retrievability">{t("orderRetr")}</option><option value="added">{t("orderAdded")}</option><option value="random">{t("orderRandom")}</option>
                </Select>
              </Field>
            </div>
          </>}
        </div>
      </Modal>
    </div>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger }: { icon: typeof Plus; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted", danger ? "text-again" : "text-fg")}>
      <Icon className="h-4 w-4 opacity-70" />{children}
    </button>
  );
}
