"use client";
/** Reading home: today's queue (priority → due, capped), all active items with their extracts, and done items. */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus, Play, Scissors, CheckCircle2, ListOrdered, Library, Settings2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, CardHeader, Empty, IconChip, PageHeader, Pill, Segmented, Spinner, cx } from "../ui";
import { useSi } from "./useSi";
import { ImportReading } from "./ImportReading";
import { PriorityPill, ReadBar, dueLabel, type ReadingListDTO, type ReadingSummaryDTO } from "./reading-shared";

type Tab = "queue" | "all" | "done";

export function ReadingList() {
  const { s, fail } = useSi();
  const [data, setData] = useState<ReadingListDTO | null>(null);
  const [tab, setTab] = useState<Tab>("queue");
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => { try { setData(await api<ReadingListDTO>("/api/reading")); } catch (e) { fail(e); } }, [fail]);
  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data]);
  const kids = useMemo(() => {
    const m = new Map<number, ReadingSummaryDTO[]>();
    for (const i of data?.items ?? []) if (i.parentId != null && byId.has(i.parentId)) m.set(i.parentId, [...(m.get(i.parentId) ?? []), i]);
    return m;
  }, [data, byId]);
  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>;

  const queue = data.queue.map((id) => byId.get(id)).filter(Boolean) as ReadingSummaryDTO[];
  const active = data.items.filter((i) => i.status === "active");
  const done = data.items.filter((i) => i.status === "done");
  const roots = active.filter((i) => i.parentId == null || !byId.has(i.parentId) || byId.get(i.parentId)!.status === "done");

  const Row = ({ it, depth = 0, index }: { it: ReadingSummaryDTO; depth?: number; index?: number }) => {
    const n = kids.get(it.id)?.length ?? 0;
    return (
      <Link href={`/reading/${it.id}`} data-testid="reading-row"
        className="group flex min-h-[60px] items-center gap-3 border-t border-border/80 px-3 py-2.5 transition-colors first:border-t-0 hover:bg-subtle sm:px-4"
        style={{ paddingLeft: depth ? 12 + depth * 20 : undefined }}>
        {index != null
          ? <span className="num inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[12px] font-semibold text-sub">{index + 1}</span>
          : depth > 0 ? <Scissors className="h-3.5 w-3.5 shrink-0 text-faint" /> : <BookOpen className="h-4 w-4 shrink-0 text-faint" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium tracking-[-0.01em] text-fg group-hover:text-primary">{it.title || "—"}</div>
          <div className="mt-1 flex items-center gap-2">
            <ReadBar value={it.length ? it.position / it.length : 0} className="max-w-[160px]" />
            <span className="num shrink-0 text-[11.5px] text-faint">{it.length ? Math.round((it.position / it.length) * 100) : 0}%</span>
            {n > 0 && <span className="hidden shrink-0 text-[11.5px] text-faint sm:inline">· {s("extractN", { n })}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
          <PriorityPill p={it.priority} label={s("priority")} />
          {it.status === "active"
            ? <span className={cx("num text-[11.5px]", it.dueDay < data.today ? "text-danger" : "text-faint")}>{dueLabel(s, it.dueDay, data.today)}</span>
            : <CheckCircle2 className="h-4 w-4 text-success" />}
        </div>
      </Link>
    );
  };
  const tree = (it: ReadingSummaryDTO, depth: number): React.ReactNode[] => [
    <Row key={it.id} it={it} depth={depth} />,
    ...(kids.get(it.id) ?? []).filter((k) => k.status === "active").flatMap((k) => tree(k, depth + 1)),
  ];

  return (
    <div>
      <PageHeader title={s("reading")} subtitle={s("readingSub")}
        actions={<>
          {queue.length > 0 && <Link href={`/reading/${queue[0].id}`}><Button><Play className="h-4 w-4" />{s("startReading")}</Button></Link>}
          <Button variant="primary" onClick={() => setImporting(true)} data-testid="reading-import"><Plus className="h-4 w-4" />{s("importArticle")}</Button>
        </>} />
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Segmented value={tab} onChange={setTab} className="mb-4 w-full sm:w-auto"
            options={[
              { value: "queue", label: <span className="inline-flex items-center gap-1.5"><ListOrdered className="hidden h-3.5 w-3.5 sm:inline" />{s("todayQueue")} <span className="num text-faint">{queue.length}</span></span> },
              { value: "all", label: <span className="inline-flex items-center gap-1.5"><Library className="hidden h-3.5 w-3.5 sm:inline" />{s("allItems")} <span className="num text-faint">{active.length}</span></span> },
              { value: "done", label: <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="hidden h-3.5 w-3.5 sm:inline" />{s("doneItems")} <span className="num text-faint">{done.length}</span></span> },
            ]} />
          {data.items.length === 0 ? (
            <Empty icon={<BookOpen />} title={s("noItems")}><Button variant="primary" onClick={() => setImporting(true)}><Plus className="h-4 w-4" />{s("importArticle")}</Button></Empty>
          ) : tab === "queue" ? (
            queue.length === 0 ? <Empty icon={<CheckCircle2 />} tone="emerald" title={s("queueEmpty")} /> : (
              <>
                <Card className="overflow-hidden" ><div data-testid="reading-queue">{queue.map((it, i) => <Row key={it.id} it={it} index={i} />)}</div></Card>
                <div className="mt-3 flex flex-wrap items-center gap-2 px-1 text-xs text-faint">
                  <Pill tone="neutral" mono>{s("queueCap", { n: data.cap })}</Pill>
                  {data.overflow > 0 && <span>{s("queueMore", { n: data.overflow })}</span>}
                  <Link href="/settings" className="ml-auto inline-flex h-11 items-center gap-1 rounded-md px-1 hover:text-fg sm:h-auto"><Settings2 className="h-3.5 w-3.5" />{s("dailyCap")}</Link>
                </div>
              </>
            )
          ) : tab === "all" ? (
            active.length === 0 ? <Empty icon={<Library />} title={s("queueEmpty")} /> : <Card className="overflow-hidden">{roots.flatMap((r) => tree(r, 0))}</Card>
          ) : (
            done.length === 0 ? <Empty icon={<CheckCircle2 />} title={s("doneItems")} /> : <Card className="overflow-hidden">{done.map((it) => <Row key={it.id} it={it} />)}</Card>
          )}
        </div>
        <aside className="hidden xl:sticky xl:top-10 xl:block">
          <Card className="p-5">
            <CardHeader icon={<IconChip tone="orange"><BookOpen /></IconChip>} title={s("todayQueue")} description={s("queueCap", { n: data.cap })} />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[[queue.length, s("statQueue")], [active.length, s("statActive")], [done.length, s("doneItems")]].map(([n, l]) => (
                <div key={String(l)} className="rounded-xl border border-border bg-subtle px-2 py-3"><div className="num text-[22px] font-semibold leading-none text-fg">{n}</div><div className="mt-1.5 truncate text-[11.5px] text-faint">{l}</div></div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-faint">{s("priorityHint")}</p>
            {queue.length > 0 && <Link href={`/reading/${queue[0].id}`} className="mt-4 block"><Button variant="primary" className="w-full min-w-0"><Play className="h-4 w-4" /><span className="truncate">{s("startReading")} · {queue[0].title}</span></Button></Link>}
          </Card>
        </aside>
      </div>
      <ImportReading open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
