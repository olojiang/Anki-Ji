"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, MoreHorizontal, Play, Settings2, Pencil, Trash2, FolderPlus, Filter, RefreshCw, Eraser, Flame, CheckCircle2, GripVertical, Layers, Sparkles } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Button, Card, Empty, Field, IconChip, Input, Modal, PageHeader, Pill, ProgressRing, Select, Spinner, cx, type Tone } from "@/components/ui";
import { buildTree, type TreeNode } from "@/core/tree";
import type { Counts, DeckDTO } from "@/lib/types";
import { DeckDashboard, type DashStats } from "@/components/DeckDashboard";
import { ShareDialog } from "@/components/share-ir/ShareDialog";
import { tsi } from "@/lib/i18n-share-ir";
import { Link2 } from "lucide-react";

type Node = TreeNode<DeckDTO>;
type DropZone = "before" | "after" | "inside";

export default function DecksPage() {
  const { t, err, toast, locale } = useApp();
  const router = useRouter();
  const [decks, setDecks] = useState<DeckDTO[] | null>(null);
  const [counts, setCounts] = useState<Counts>({});
  const [stats, setStats] = useState<DashStats | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<null | { kind: "new"; parentId: number | null } | { kind: "rename"; deck: DeckDTO } | { kind: "filtered" }>(null);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState({ query: "is:due", limit: 100, order: "due" });
  const [menu, setMenu] = useState<number | null>(null);
  const [sharing, setSharing] = useState<DeckDTO | null>(null);
  const [drag, setDrag] = useState<{ id: number; over: number | null; zone: DropZone | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ decks: DeckDTO[]; counts: Counts }>("/api/decks");
      setDecks(r.decks); setCounts(r.counts);
    } catch (e) { err(e); }
  }, [err]);
  useEffect(() => {
    load();
    api<DashStats>("/api/stats").then(setStats).catch(() => {});
    try { setCollapsed(new Set(JSON.parse(localStorage.getItem("ak-collapsed") ?? "[]"))); } catch { /* ignore */ }
  }, [load]);
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const tree = useMemo(() => buildTree(decks ?? []), [decks]);
  const due = useMemo(() => tree.reduce((a, n) => { const c = counts[n.id]; return c ? { new: a.new + c.new, learning: a.learning + c.learning, review: a.review + c.review } : a; }, { new: 0, learning: 0, review: 0 }), [tree, counts]);
  const nextDeck = useMemo(() => { const n = tree.find((x) => { const c = counts[x.id]; return c && c.new + c.learning + c.review > 0; }); return n ? { id: n.id, name: n.name } : null; }, [tree, counts]);
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
            "group relative flex h-14 items-center gap-1.5 border-t sm:h-[52px] sm:gap-2 border-border/80 px-3 transition-colors duration-150 hover:bg-subtle",
            drag?.id === n.id && "opacity-40",
            isOver && drag?.zone === "inside" && "bg-primary/10 ring-1 ring-inset ring-primary/40",
          )}
        >
          {isOver && drag?.zone === "before" && <div className="absolute inset-x-2 top-0 h-0.5 rounded bg-primary" />}
          {isOver && drag?.zone === "after" && <div className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-primary" />}
          <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-faint opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
          <div style={{ width: depth * 22 }} className="hidden shrink-0 sm:block" />
          <div style={{ width: depth * 12 }} className="shrink-0 sm:hidden" />
          <button onClick={() => hasKids && toggle(n.id)} className={cx("inline-flex h-10 w-7 shrink-0 sm:h-6 sm:w-6 items-center justify-center rounded-md text-faint transition-colors", hasKids ? "hover:bg-muted hover:text-fg" : "invisible")} aria-label="toggle">
            <ChevronRight className={cx("h-4 w-4 transition-transform duration-200", open && "rotate-90")} />
          </button>
          <ProgressRing value={c.total ? 1 - Math.min(1, (c.new + c.learning + c.review) / c.total) : 0} size={22} stroke={2.5} className="hidden sm:inline-flex"
            title={t("clearedPct", { p: c.total ? Math.round((1 - Math.min(1, (c.new + c.learning + c.review) / c.total)) * 100) : 0 })} />
          <Link href={`/study/${n.id}`} className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-[14px] font-medium tracking-[-0.01em] text-fg transition-colors hover:text-primary">
            {n.filtered && <Filter className="h-3.5 w-3.5 shrink-0 text-primary" />}
            <span className="truncate">{n.name}</span>
            <span className="num hidden shrink-0 text-[11.5px] font-normal text-faint sm:inline">{c.total}</span>
          </Link>
          <div className="flex shrink-0 items-center sm:gap-1">
            <CountPill n={c.new} tone="sky" />
            <CountPill n={c.learning} tone="rose" />
            <CountPill n={c.review} tone="emerald" />
          </div>
          <div className="relative flex shrink-0 items-center">
            <Link href={`/study/${n.id}`} className="hidden h-8 w-8 items-center justify-center rounded-lg text-faint transition-all hover:bg-primary/10 hover:text-primary group-hover:text-sub sm:inline-flex" title={t("study")}><Play className="h-4 w-4" /></Link>
            <button onClick={(e) => { e.stopPropagation(); setMenu(menu === n.id ? null : n.id); }} className="inline-flex h-11 w-10 items-center justify-center rounded-lg text-faint transition-colors hover:bg-muted hover:text-fg group-hover:text-sub sm:h-8 sm:w-8" aria-label={t("more")}><MoreHorizontal className="h-4 w-4" /></button>
            {menu === n.id && (
              <div className="absolute right-0 top-9 z-20 w-52 origin-top-right animate-scale-in overflow-hidden rounded-xl border border-border bg-elevated p-1 shadow-pop" onClick={(e) => e.stopPropagation()}>
                {!n.filtered && <MenuItem icon={FolderPlus} onClick={() => { setMenu(null); setName(""); setModal({ kind: "new", parentId: n.id }); }}>{t("newSubdeck")}</MenuItem>}
                <MenuItem icon={Pencil} onClick={() => { setMenu(null); setName(n.name); setModal({ kind: "rename", deck: n }); }}>{t("rename")}</MenuItem>
                <MenuItem icon={Settings2} onClick={() => router.push(`/decks/${n.id}`)}>{t("options")}</MenuItem>
                {!n.filtered && <MenuItem icon={Link2} onClick={() => { setMenu(null); setSharing(n); }}>{tsi(locale, "share")}</MenuItem>}
                {n.filtered && <MenuItem icon={RefreshCw} onClick={() => { setMenu(null); filteredAction(n, "rebuild"); }}>{t("rebuild")}</MenuItem>}
                {n.filtered && <MenuItem icon={Eraser} onClick={() => { setMenu(null); filteredAction(n, "empty"); }}>{t("emptyDeck")}</MenuItem>}
                {n.parentId != null && <MenuItem icon={Layers} onClick={async () => { setMenu(null); try { await api(`/api/decks/${n.id}/move`, { body: { parentId: null, index: 9999 } }); await load(); } catch (e) { err(e); } }}>{t("moveToRoot")}</MenuItem>}
                <div className="-mx-1 my-1 border-t border-border" />
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
        eyebrow={new Date().toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "long", day: "numeric", weekday: "long" })}
        title={t("decks")}
        actions={<>
          <Button onClick={() => { setName(""); setFilter({ query: "is:due", limit: 100, order: "due" }); setModal({ kind: "filtered" }); }}><Filter className="h-4 w-4" />{t("filteredDeck")}</Button>
          <Button variant="primary" onClick={() => { setName(""); setModal({ kind: "new", parentId: null }); }}><Plus className="h-4 w-4" />{t("newDeck")}</Button>
        </>}
      />
      <div className={cx(decks && decks.length > 0 && "xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-6 2xl:grid-cols-[minmax(0,1fr)_400px] 2xl:gap-8")}>
      <div className="min-w-0">
      {decks && decks.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
          <Card className="relative overflow-hidden p-3 sm:p-4">
            <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
            <div className="flex items-center gap-2.5 truncate text-[12px] font-medium text-sub sm:text-[12.5px]"><IconChip tone="primary" size="sm" className="hidden sm:inline-flex"><Sparkles /></IconChip>{t("dueToday")}</div>
            <div className="mt-2 flex items-end justify-between gap-3 sm:mt-3">
              <div className="num text-[24px] font-semibold leading-none text-fg sm:text-[30px]">{due.new + due.learning + due.review}</div>
              <div className="hidden gap-1 lg:flex">
                <Pill tone="sky" mono title={t("colNew")}>{due.new}</Pill>
                <Pill tone="rose" mono title={t("colLearn")}>{due.learning}</Pill>
                <Pill tone="emerald" mono title={t("colDue")}>{due.review}</Pill>
              </div>
            </div>
          </Card>
          <Card className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5 truncate text-[12px] font-medium text-sub sm:text-[12.5px]"><IconChip tone="emerald" size="sm" className="hidden sm:inline-flex"><CheckCircle2 /></IconChip>{t("reviewedToday")}</div>
            <div className="mt-2 flex items-end gap-1.5 sm:mt-3"><span className="num text-[24px] font-semibold leading-none text-fg sm:text-[30px]">{stats?.today.reviews ?? "—"}</span><span className="pb-0.5 text-xs text-faint">{t("cardsUnit")}</span></div>
          </Card>
          <Card className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5 truncate text-[12px] font-medium text-sub sm:text-[12.5px]"><IconChip tone="orange" size="sm" className="hidden sm:inline-flex"><Flame /></IconChip>{t("streak")}</div>
            <div className="mt-2 flex items-end gap-1.5 sm:mt-3"><span className="num text-[24px] font-semibold leading-none text-fg sm:text-[30px]">{stats?.streak ?? "—"}</span><span className="pb-0.5 text-xs text-faint">{t("days")}</span></div>
          </Card>
        </div>
      )}
      {decks === null ? <div className="flex justify-center py-20"><Spinner /></div> : decks.length === 0 ? (
        <Empty icon={<Layers />} title={t("noDecks")}><Button variant="primary" onClick={() => setModal({ kind: "new", parentId: null })}><Plus className="h-4 w-4" />{t("newDeck")}</Button></Empty>
      ) : (
        <Card className="overflow-visible">
          <div className="flex h-10 items-center gap-2 rounded-t-2xl border-b border-border bg-subtle/70 px-3 text-[11.5px] font-medium uppercase tracking-[0.04em] text-faint">
            <span className="flex-1 pl-8 sm:pl-[86px]">{t("deck")}</span>
            <span className="flex text-center sm:gap-1"><span className="w-11 sm:w-14">{t("colNew")}</span><span className="w-11 sm:w-14">{t("colLearn")}</span><span className="w-11 sm:w-14">{t("colDue")}</span></span>
            <span className="w-8 sm:w-16" />
          </div>
          <div className="[&>div:first-child>div:first-child]:border-t-0 [&>div:last-child>div:last-child]:rounded-b-2xl">{tree.map((n) => row(n, 0))}</div>
        </Card>
      )}
      {decks && decks.length > 1 && <p className="mt-3 hidden px-1 text-xs text-faint md:block">{t("dragHint")}</p>}
      </div>
      {decks && decks.length > 0 && <aside className="hidden xl:sticky xl:top-10 xl:block"><DeckDashboard due={due} next={nextDeck} stats={stats} /></aside>}
      </div>

      <ShareDialog deck={sharing} onClose={() => setSharing(null)} />
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
    <button onClick={onClick} className={cx("flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors", danger ? "text-danger hover:bg-rose-500/10" : "text-fg hover:bg-muted")}>
      <Icon className="h-4 w-4 opacity-70" />{children}
    </button>
  );
}

function CountPill({ n, tone }: { n: number; tone: Tone }) {
  return (
    <span className="flex w-11 justify-center sm:w-14">
      {n > 0 ? <Pill tone={tone} mono className="min-w-[30px] justify-center px-1.5 sm:min-w-[34px]">{n}</Pill> : <span className="num text-[12px] text-faint/50">0</span>}
    </span>
  );
}
