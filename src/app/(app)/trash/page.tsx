"use client";
import { useCallback, useEffect, useState } from "react";
import { Trash2, RotateCcw, Layers, FileText } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Button, Card, Empty, PageHeader, Spinner } from "@/components/ui";
import type { DeckDTO } from "@/lib/types";

interface DelNote { id: number; sortField: string; type: string; deletedAt: string }

export default function TrashPage() {
  const { t, err } = useApp();
  const [data, setData] = useState<{ decks: DeckDTO[]; notes: DelNote[] } | null>(null);
  const load = useCallback(() => api<{ decks: DeckDTO[]; notes: DelNote[] }>("/api/decks/trash").then(setData).catch(err), [err]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { err(e); } };
  const topDecks = data?.decks.filter((d) => !data.decks.some((p) => p.id === d.parentId)) ?? [];
  return (
    <div className="max-w-3xl">
      <PageHeader title={t("trashTitle")} />
      {!data ? <div className="flex justify-center py-16"><Spinner /></div> : !topDecks.length && !data.notes.length ? <Empty icon={<Trash2 className="h-8 w-8" />} title={t("trashEmpty")} /> : (
        <div className="space-y-6">
          {topDecks.length > 0 && <section>
            <h2 className="mb-2 text-sm font-semibold text-sub">{t("deletedDecks")}</h2>
            <Card className="overflow-hidden">{topDecks.map((d) => (
              <div key={d.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <Layers className="h-4 w-4 text-faint" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                <span className="text-xs text-faint">{d.deletedAt ? new Date(d.deletedAt).toLocaleString() : ""}</span>
                <Button size="sm" onClick={() => act(() => api(`/api/decks/${d.id}/restore`, { body: {} }))}><RotateCcw className="h-3.5 w-3.5" />{t("restore")}</Button>
                <Button size="sm" variant="ghost" className="text-again" onClick={() => confirm(`${t("purge")}?`) && act(() => api(`/api/decks/${d.id}/purge`, { body: {} }))}>{t("purge")}</Button>
              </div>))}
            </Card>
          </section>}
          {data.notes.length > 0 && <section>
            <h2 className="mb-2 text-sm font-semibold text-sub">{t("deletedNotes")}</h2>
            <Card className="overflow-hidden">{data.notes.map((n) => (
              <div key={n.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <FileText className="h-4 w-4 text-faint" /><span className="min-w-0 flex-1 truncate text-sm">{n.sortField || "—"}</span>
                <Button size="sm" onClick={() => act(() => api("/api/notes/bulk", { body: { action: "restore", noteIds: [n.id] } }))}><RotateCcw className="h-3.5 w-3.5" />{t("restore")}</Button>
                <Button size="sm" variant="ghost" className="text-again" onClick={() => act(() => api("/api/notes/bulk", { body: { action: "purge", noteIds: [n.id] } }))}>{t("purge")}</Button>
              </div>))}
            </Card>
          </section>}
        </div>
      )}
    </div>
  );
}
