"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Tag as TagIcon, ChevronRight } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Button, Card, Empty, Input, PageHeader, Spinner, cx } from "@/components/ui";

interface TagNode { name: string; full: string; children: TagNode[] }
function buildTagTree(tags: string[]): TagNode[] {
  const root: TagNode[] = [];
  for (const tag of tags) {
    let level = root, acc = "";
    for (const seg of tag.split("::")) {
      acc = acc ? `${acc}::${seg}` : seg;
      let n = level.find((x) => x.name === seg);
      if (!n) { n = { name: seg, full: acc, children: [] }; level.push(n); }
      level = n.children;
    }
  }
  const sort = (l: TagNode[]) => { l.sort((a, b) => a.name.localeCompare(b.name)); l.forEach((x) => sort(x.children)); };
  sort(root);
  return root;
}

export default function TagsPage() {
  const { t, err } = useApp();
  const [tags, setTags] = useState<string[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const load = useCallback(() => api<{ tags: string[]; counts: Record<string, number> }>("/api/tags").then((r) => { setTags(r.tags); setCounts(r.counts); }).catch(err), [err]);
  useEffect(() => { load(); }, [load]);
  const tree = useMemo(() => buildTagTree(tags ?? []), [tags]);
  const total = (n: TagNode): number => (counts[n.full] ?? 0) + n.children.reduce((s, c) => s + total(c), 0);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { err(e); } };

  const row = (n: TagNode, depth: number): React.ReactNode => (
    <div key={n.full}>
      <div className="group flex min-h-12 items-center gap-2 border-b border-border px-3 py-1 last:border-0 hover:bg-muted/40 sm:min-h-0 sm:py-2">
        <div style={{ width: depth * 16 }} className="shrink-0" />
        <button onClick={() => { const s = new Set(closed); if (s.has(n.full)) s.delete(n.full); else s.add(n.full); setClosed(s); }} className={cx("inline-flex h-10 w-8 items-center justify-center text-faint sm:h-5 sm:w-5", !n.children.length && "invisible")}><ChevronRight className={cx("h-4 w-4 transition-transform", !closed.has(n.full) && "rotate-90")} /></button>
        <TagIcon className="h-3.5 w-3.5 text-primary" />
        <Link href={`/browse?q=${encodeURIComponent(`tag:${n.full}`)}`} className="flex min-w-0 flex-1 items-center self-stretch truncate text-sm font-medium hover:text-primary">{n.name}</Link>
        <span className="shrink-0 text-xs text-faint">{t("notesCount", { n: total(n) })}</span>
        <button onClick={() => { const to = prompt(t("renameTagTo"), n.full); if (to && to !== n.full) act(() => api("/api/tags", { method: "PATCH", body: { from: n.full, to } })); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint opacity-0 hover:bg-muted hover:text-fg group-hover:opacity-100 max-md:h-10 max-md:w-10 max-md:opacity-100" title={t("rename")}><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => { if (confirm(t("deleteTagQ", { name: n.full }))) act(() => api(`/api/tags?name=${encodeURIComponent(n.full)}`, { method: "DELETE" })); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint opacity-0 hover:bg-muted hover:text-again group-hover:opacity-100 max-md:h-10 max-md:w-10 max-md:opacity-100" title={t("delete")}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {!closed.has(n.full) && n.children.map((c) => row(c, depth + 1))}
    </div>
  );

  return (
    <div className="max-w-3xl xl:max-w-5xl">
      <PageHeader title={t("tagsTitle")} subtitle={t("tagsPh")} />
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) act(async () => { await api("/api/tags", { body: { name } }); setName(""); }); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="日语::N5" />
        <Button variant="primary" type="submit"><Plus className="h-4 w-4" />{t("newTag")}</Button>
      </form>
      {tags === null ? <div className="flex justify-center py-16"><Spinner /></div> : tags.length === 0 ? <Empty icon={<TagIcon />} title={t("noTags")} /> : <Card className="overflow-hidden">{tree.map((n) => row(n, 0))}</Card>}
    </div>
  );
}
