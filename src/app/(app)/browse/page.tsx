"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronUp, ChevronDown, ChevronRight, HelpCircle, Flag, PauseCircle, PlayCircle, FolderInput, TagIcon, Tags, RotateCcw, Trash2, X, GripVertical } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Badge, Button, Card, Empty, Input, Kbd, Modal, PageHeader, Pill, Segmented, Select, Spinner, cx } from "@/components/ui";
import { DeckPicker } from "@/components/DeckPicker";
import type { BrowseRowDTO, DeckDTO } from "@/lib/types";

type Group = "none" | "deck" | "tag" | "type";

const SYNTAX: [string, string, string][] = [
  ["dog cat", "同时包含 dog 和 cat", "both words"], ["dog OR cat", "包含任一", "either"], ["-cat", "不包含 cat", "exclude"], ['"a phrase"', "精确短语", "exact phrase"],
  ["d*g", "通配符", "wildcard"], ["deck:日语", "牌组（含子牌组）", "deck incl. children"], ["deck:日语::N5", "子牌组", "sub-deck"], ["tag:动词", "标签（含子标签）", "tag incl. children"],
  ["tag:none", "无标签", "untagged"], ["is:new / is:learn / is:review", "卡片状态", "card state"], ["is:due", "今天到期", "due today"], ["is:suspended / is:buried / is:leech", "暂停 / 埋藏 / 顽固卡", "suspended / buried / leech"],
  ["flag:1 · is:flagged", "标记", "flagged"], ["type:cloze", "题型", "note type"], ["added:7", "7 天内添加", "added in last 7 days"], ["prop:ivl>=30 · prop:due<=3 · prop:lapses>2", "属性比较", "properties"],
  ["(a OR b) -c", "分组", "grouping"],
];

export default function BrowsePage() {
  const { t, err, toast, locale } = useApp();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [sort, setSort] = useState("manual");
  const [group, setGroup] = useState<Group>("deck");
  const [mode, setMode] = useState<"notes" | "cards">("notes");
  const [rows, setRows] = useState<BrowseRowDTO[] | null>(null);
  const [decks, setDecks] = useState<DeckDTO[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [help, setHelp] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDeck, setMoveDeck] = useState<number | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [dragNote, setDragNote] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    const init = new URLSearchParams(window.location.search).get("q");
    if (init) { setQ(init); setApplied(init); }
    api<{ decks: DeckDTO[] }>("/api/decks").then((r) => setDecks(r.decks)).catch(() => {});
  }, []);
  const load = useCallback(async () => {
    try { const r = await api<{ rows: BrowseRowDTO[] }>(`/api/notes?q=${encodeURIComponent(applied)}&sort=${sort}`); setRows(r.rows); } catch (e) { err(e); }
  }, [applied, sort, err]);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => {
    if (!rows) return [];
    if (mode === "cards") return rows;
    const seen = new Set<number>();
    return rows.filter((r) => (seen.has(r.noteId) ? false : (seen.add(r.noteId), true)));
  }, [rows, mode]);
  const key = (r: BrowseRowDTO) => (mode === "notes" ? r.noteId : r.cardId);
  const groups = useMemo(() => {
    const m = new Map<string, BrowseRowDTO[]>();
    for (const r of list) {
      const ks = group === "none" ? [""] : group === "deck" ? [r.deckPath] : group === "type" ? [t(`t_${r.type}`)] : r.tags.length ? r.tags : ["—"];
      for (const k of ks) (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list, group, t]);

  const selectedNoteIds = () => (mode === "notes" ? [...sel] : [...new Set(list.filter((r) => sel.has(r.cardId)).map((r) => r.noteId))]);
  const selectedCardIds = () => (mode === "cards" ? [...sel] : undefined);
  const bulk = async (action: string, extra: Record<string, unknown> = {}) => {
    try {
      await api("/api/notes/bulk", { body: { action, noteIds: selectedNoteIds(), cardIds: selectedCardIds(), ...extra } });
      if (action === "delete") setSel(new Set());
      toast(t("done")); await load();
    } catch (e) { err(e); }
  };
  const reorder = async (noteId: number, index: number) => {
    try { await api("/api/notes/bulk", { body: { action: "reorder", noteIds: [noteId], index } }); await load(); } catch (e) { err(e); }
  };

  const manual = sort === "manual";
  const stateBadge = (r: BrowseRowDTO) => r.suspended ? <Pill tone="amber" dot>{t("suspended")}</Pill> : r.buried ? <Pill dot>{t("buried")}</Pill> :
    r.state === "new" ? <Pill tone="sky" dot>{t("stNew")}</Pill> : r.state === "review" ? <Pill tone="emerald" dot>{t("stReview")}</Pill> : <Pill tone="rose" dot>{r.state === "learning" ? t("stLearning") : t("stRelearning")}</Pill>;
  const dueText = (r: BrowseRowDTO) => r.state === "new" ? "—" : new Date(r.due).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
  const allChecked = list.length > 0 && list.every((r) => sel.has(key(r)));

  return (
    <div>
      <PageHeader title={t("browse")} subtitle={rows ? t("results", { n: list.length }) : undefined} />
      <div className="mb-4 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
        <form className="relative col-span-2 md:min-w-[260px] md:flex-1" onSubmit={(e) => { e.preventDefault(); setApplied(q); setSel(new Set()); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} className="pl-9 pr-9 font-mono md:pr-16 sm:h-10 text-[12.5px] placeholder:font-sans placeholder:text-[13px]" />
          <button type="button" onClick={() => setHelp(true)} className="absolute right-0 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-faint transition-colors hover:bg-muted hover:text-fg sm:right-2 sm:h-7 sm:w-7" title={t("syntaxHelp")}><HelpCircle className="h-4 w-4" /></button>
          <span className="pointer-events-none absolute right-10 top-1/2 hidden -translate-y-1/2 text-faint md:block"><Kbd>/</Kbd></span>
        </form>
        <Select className="w-full min-w-0 sm:h-10 md:w-auto" value={sort} onChange={(e) => setSort(e.target.value)} title={t("sort")}>
          <option value="manual">{t("sort")}: {t("sortManual")}</option><option value="created">{t("sortCreated")}</option><option value="due">{t("sortDue")}</option>
          <option value="sortField">{t("sortField")}</option><option value="interval">{t("sortInterval")}</option><option value="lapses">{t("sortLapses")}</option><option value="difficulty">{t("sortDifficulty")}</option>
        </Select>
        <Select className="w-full min-w-0 sm:h-10 md:w-auto" value={group} onChange={(e) => setGroup(e.target.value as Group)} title={t("groupBy")}>
          <option value="deck">{t("groupBy")}: {t("groupDeck")}</option><option value="tag">{t("groupTag")}</option><option value="type">{t("groupType")}</option><option value="none">{t("groupNone")}</option>
        </Select>
        <Segmented className="col-span-2 items-center sm:h-10 md:col-span-1" value={mode} onChange={(m) => { setMode(m); setSel(new Set()); }} options={[{ value: "notes", label: t("notesMode") }, { value: "cards", label: t("cardsMode") }]} />
      </div>

      {sel.size > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex animate-scale-in flex-wrap items-center gap-1 rounded-xl border border-border bg-elevated/95 px-2 py-1.5 shadow-pop backdrop-blur-xl lg:top-3">
          <span className="mr-2 inline-flex items-center gap-2 pl-1.5 text-[13px] font-medium"><span className="h-2 w-2 rounded-full bg-primary" />{t("selected", { n: sel.size })}</span>
          <Button size="sm" variant="ghost" onClick={() => { setMoveDeck(null); setMoveOpen(true); }}><FolderInput className="h-3.5 w-3.5" />{t("moveTo")}</Button>
          <Button size="sm" variant="ghost" onClick={() => { const v = prompt(t("addTagsQ")); if (v) bulk("addTags", { tags: v.split(/\s+/) }); }}><TagIcon className="h-3.5 w-3.5" />+{t("tags")}</Button>
          <Button size="sm" variant="ghost" onClick={() => { const v = prompt(t("removeTagsQ")); if (v) bulk("removeTags", { tags: v.split(/\s+/) }); }}><Tags className="h-3.5 w-3.5" />−{t("tags")}</Button>
          <Button size="sm" variant="ghost" onClick={() => bulk("suspend")}><PauseCircle className="h-3.5 w-3.5" />{t("suspend")}</Button>
          <Button size="sm" variant="ghost" onClick={() => bulk("unsuspend")}><PlayCircle className="h-3.5 w-3.5" />{t("unsuspend")}</Button>
          <Button size="sm" variant="ghost" onClick={() => bulk("flag", { flag: 1 })}><Flag className="h-3.5 w-3.5" />{t("flag")}</Button>
          <Button size="sm" variant="ghost" onClick={() => bulk("reset")}><RotateCcw className="h-3.5 w-3.5" />{t("reset")}</Button>
          <Button size="sm" variant="ghost" className="text-danger hover:bg-rose-500/10 hover:text-danger" onClick={() => bulk("delete")}><Trash2 className="h-3.5 w-3.5" />{t("delete")}</Button>
          <button onClick={() => setSel(new Set())} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
      )}

      {rows === null ? <div className="flex justify-center py-20"><Spinner /></div> : list.length === 0 ? <Empty icon={<Search />} title="—" /> : (
        <>
        <div className="space-y-4 lg:hidden">
          {groups.map(([g, items]) => (
            <section key={`m-${g}`}>
              {group !== "none" && (
                <button onClick={() => { const n = new Set(closed); if (n.has(g)) n.delete(g); else n.add(g); setClosed(n); }} className="mb-1 flex h-11 max-w-full items-center gap-1.5 text-xs font-semibold text-sub">
                  <ChevronRight className={cx("h-3.5 w-3.5 shrink-0 transition-transform", !closed.has(g) && "rotate-90")} /><span className="truncate">{g}</span><span className="num rounded-full bg-muted px-1.5 text-[10.5px] font-normal text-faint">{items.length}</span>
                </button>
              )}
              {!closed.has(g) && (
                <Card className="divide-y divide-border overflow-hidden">
                  {items.map((r) => {
                    const deckItems = items.filter((x) => x.deckId === r.deckId);
                    const idx = deckItems.findIndex((x) => x.noteId === r.noteId);
                    return (
                      <div key={`m-${g}-${key(r)}`} className={cx("flex items-start gap-1 py-2 pr-3 transition-colors active:bg-subtle", sel.has(key(r)) && "bg-primary/[0.06]")}>
                        <label className="flex h-11 w-11 shrink-0 items-center justify-center"><input type="checkbox" className="h-[18px] w-[18px]" checked={sel.has(key(r))} onChange={() => { const n = new Set(sel); if (n.has(key(r))) n.delete(key(r)); else n.add(key(r)); setSel(n); }} /></label>
                        <button className="min-w-0 flex-1 py-1.5 text-left" onClick={() => router.push(`/notes/${r.noteId}`)}>
                          <div className="line-clamp-2 break-words text-[15px] font-medium leading-snug text-fg">{r.sortField || "—"}{mode === "cards" && <span className="ml-1.5 text-xs font-normal text-faint">#{r.type === "cloze" ? `c${r.ord}` : r.ord + 1}</span>}</div>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-faint">
                            <span className="max-w-[60%] truncate">{r.deckPath}</span><span>·</span><span>{t(`t_${r.type}`)}</span>
                            {r.state !== "new" && <><span>·</span><span className="num">{dueText(r)}</span></>}
                            {r.state === "review" && <><span>·</span><span className="num">{Math.round(r.interval)}d</span></>}
                          </div>
                          {r.tags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{r.tags.slice(0, 3).map((x) => <Badge key={x} className="max-w-[140px] truncate">{x}</Badge>)}</div>}
                        </button>
                        <div className="flex shrink-0 flex-col items-end gap-1 pt-2">
                          <span className="inline-flex items-center gap-1">{r.flag > 0 && <Flag className="h-3.5 w-3.5 text-hard" />}{r.leech && <Badge tone="again">leech</Badge>}{stateBadge(r)}</span>
                          {manual && (
                            <span className="-mr-2 inline-flex text-faint">
                              <button disabled={idx <= 0} onClick={() => reorder(r.noteId, idx - 1)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg active:bg-muted disabled:opacity-30" aria-label={t("moveUp")}><ChevronUp className="h-4 w-4" /></button>
                              <button disabled={idx >= deckItems.length - 1} onClick={() => reorder(r.noteId, idx + 1)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg active:bg-muted disabled:opacity-30" aria-label={t("moveDown")}><ChevronDown className="h-4 w-4" /></button>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}
            </section>
          ))}
        </div>
        <Card className="hidden overflow-hidden lg:block">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full table-fixed text-left text-[13.5px]">
              <thead className="border-b border-border bg-subtle/80 text-[11px] uppercase tracking-[0.04em] text-faint">
                <tr>
                  <th className="w-10 px-3 py-2"><input type="checkbox" className="accent-primary" checked={allChecked} onChange={() => setSel(allChecked ? new Set() : new Set(list.map(key)))} /></th>
                  {manual && <th className="w-16" />}
                  <th className="px-2 py-2.5 font-medium">{t("colQuestion")}</th>
                  <th className="w-[18%] px-2 py-2.5 font-medium">{t("colDeck")}</th>
                  <th className="hidden w-28 px-2 py-2.5 font-medium xl:table-cell">{t("colType")}</th>
                  <th className="w-24 px-2 py-2.5 font-medium">{t("colDueAt")}</th>
                  <th className="w-16 px-2 py-2.5 text-right font-medium">{t("colIvl")}</th>
                  <th className="hidden w-[16%] px-2 py-2.5 font-medium xl:table-cell">{t("colTags")}</th>
                  <th className="w-28 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {groups.map(([g, items]) => {
                  const isClosed = closed.has(g);
                  return [
                    group !== "none" && (
                      <tr key={`g-${g}`} className="border-b border-border bg-subtle/60">
                        <td colSpan={manual ? 9 : 8} className="px-3 py-1.5">
                          <button onClick={() => { const n = new Set(closed); if (n.has(g)) n.delete(g); else n.add(g); setClosed(n); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg/80 hover:text-fg">
                            <ChevronRight className={cx("h-3.5 w-3.5 transition-transform", !isClosed && "rotate-90")} />{g}<span className="num rounded-full bg-muted px-1.5 text-[10.5px] font-normal text-faint">{items.length}</span>
                          </button>
                        </td>
                      </tr>
                    ),
                    ...(isClosed ? [] : items.map((r) => {
                      const deckItems = items.filter((x) => x.deckId === r.deckId);
                      const idx = deckItems.findIndex((x) => x.noteId === r.noteId);
                      return (
                        <tr key={`${g}-${key(r)}`} className={cx("group h-11 border-b border-border/70 transition-colors last:border-0 hover:bg-subtle", sel.has(key(r)) && "bg-primary/[0.06] hover:bg-primary/[0.08]", dragNote === r.noteId && "opacity-40")}
                          draggable={manual && mode === "notes"}
                          onDragStart={() => setDragNote(r.noteId)} onDragEnd={() => setDragNote(null)}
                          onDragOver={(e) => { if (dragNote && manual) e.preventDefault(); }}
                          onDrop={(e) => { e.preventDefault(); if (dragNote && dragNote !== r.noteId) { const src = list.find((x) => x.noteId === dragNote); if (src && src.deckId === r.deckId) reorder(dragNote, idx); } setDragNote(null); }}>
                          <td className="px-3 py-2"><input type="checkbox" className="accent-primary" checked={sel.has(key(r))} onChange={() => { const n = new Set(sel); if (n.has(key(r))) n.delete(key(r)); else n.add(key(r)); setSel(n); }} /></td>
                          {manual && (
                            <td className="whitespace-nowrap px-0 py-1 text-faint">
                              <span className="inline-flex items-center opacity-40 group-hover:opacity-100">
                                {mode === "notes" && <GripVertical className="h-3.5 w-3.5 cursor-grab" />}
                                <button disabled={idx <= 0} onClick={() => reorder(r.noteId, idx - 1)} className="rounded p-0.5 hover:bg-muted disabled:opacity-30" title={t("moveUp")}><ChevronUp className="h-3.5 w-3.5" /></button>
                                <button disabled={idx >= deckItems.length - 1} onClick={() => reorder(r.noteId, idx + 1)} className="rounded p-0.5 hover:bg-muted disabled:opacity-30" title={t("moveDown")}><ChevronDown className="h-3.5 w-3.5" /></button>
                              </span>
                            </td>
                          )}
                          <td className="cursor-pointer truncate px-2 py-2" onClick={() => router.push(`/notes/${r.noteId}`)}>
                            <div className="truncate font-medium text-fg transition-colors group-hover:text-primary">{r.sortField || "—"}</div>
                            {mode === "cards" && <div className="text-xs text-faint">#{r.type === "cloze" ? `c${r.ord}` : r.ord + 1}</div>}
                          </td>
                          <td className="truncate px-2 py-2 text-sub" title={r.deckPath}>{r.deckPath}</td>
                          <td className="hidden truncate px-2 py-2 text-sub xl:table-cell">{t(`t_${r.type}`)}</td>
                          <td className="num whitespace-nowrap px-2 py-2 text-[12px] text-sub">{dueText(r)}</td>
                          <td className="num whitespace-nowrap px-2 py-2 text-right text-[12px] text-sub">{r.state === "review" ? `${Math.round(r.interval)}d` : "—"}</td>
                          <td className="hidden px-2 py-2 xl:table-cell"><div className="flex gap-1 overflow-hidden">{r.tags.slice(0, 3).map((x) => <Badge key={x} className="max-w-[110px] truncate">{x}</Badge>)}</div></td>
                          <td className="whitespace-nowrap px-3 py-2 text-right"><span className="inline-flex items-center gap-1">{r.flag > 0 && <Flag className="h-3.5 w-3.5 text-hard" />}{r.leech && <Badge tone="again">leech</Badge>}{stateBadge(r)}</span></td>
                        </tr>
                      );
                    })),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </Card>
        </>
      )}
      {manual && rows && rows.length > 0 && <p className="mt-3 text-xs text-faint">{t("dragRows")}</p>}

      <Modal open={help} onClose={() => setHelp(false)} title={t("syntaxHelp")} wide>
        <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {SYNTAX.map(([code, zh, en]) => (
            <button key={code} onClick={() => { setQ(code.split(" · ")[0].split(" / ")[0]); setHelp(false); }} className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1 text-left hover:bg-muted">
              <code className="font-mono text-[12.5px] text-primary">{code}</code><span className="text-right text-xs text-sub">{locale === "zh" ? zh : en}</span>
            </button>
          ))}
        </div>
      </Modal>
      <Modal open={moveOpen} onClose={() => setMoveOpen(false)} title={t("moveTo")}
        footer={<><Button variant="ghost" onClick={() => setMoveOpen(false)}>{t("cancel")}</Button><Button variant="primary" disabled={!moveDeck} onClick={async () => { setMoveOpen(false); await bulk("move", { deckId: moveDeck }); }}>{t("apply")}</Button></>}>
        <DeckPicker className="w-full" decks={decks} value={moveDeck} onChange={setMoveDeck} placeholder="—" />
      </Modal>
    </div>
  );
}
