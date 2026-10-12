"use client";
import { useState } from "react";
import { Copy, Merge, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, Field, Modal, Pill, Select, Spinner, Toggle, cx } from "@/components/ui";
import { DeckPicker } from "@/components/DeckPicker";
import { useApp } from "@/components/providers";
import { useTm } from "@/components/modes/common";
import type { DeckDTO } from "@/lib/types";
import type { NoteType } from "@/core/types";

interface DupNote { id: number; deckPath: string; type: NoteType; sortField: string; tags: string[]; createdAt: string; cards: { id: number; ord: number; state: string; reps: number }[] }
interface Group { key: string; notes: DupNote[] }

export function DuplicatesModal({ open, onClose, decks, query, onDone }: {
  open: boolean; onClose: () => void; decks: DeckDTO[]; query: string; onDone: (r: { undoId: number | null; message: string }) => void;
}) {
  const { t, fail, locale } = useTm();
  const app = useApp();
  const [scope, setScope] = useState<"deck" | "type" | "collection">("collection");
  const [where, setWhere] = useState<"all" | "deck" | "results">("all");
  const [deckId, setDeckId] = useState<number | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [keep, setKeep] = useState<Record<string, number>>({});
  const [best, setBest] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const scan = async () => {
    setLoading(true);
    try {
      const r = await api<{ groups: Group[] }>("/api/batch/duplicates", { body: { scope, deckId: where === "deck" ? deckId : null, query: where === "results" ? query : undefined } });
      setGroups(r.groups);
      // default keep: the most reviewed note, then the oldest
      setKeep(Object.fromEntries(r.groups.map((g) => [g.key + g.notes[0].id, [...g.notes].sort((a, b) => reps(b) - reps(a) || a.createdAt.localeCompare(b.createdAt))[0].id])));
    } catch (e) { fail(e); } finally { setLoading(false); }
  };
  const gk = (g: Group) => g.key + g.notes[0].id;
  const merge = async (gs: Group[]) => {
    setBusy(gs.length === 1 ? gk(gs[0]) : "all");
    try {
      const r = await api<{ merged: number; undoId: number }>("/api/batch/merge", { body: { action: "merge", groups: gs.map((g) => ({ keepId: keep[gk(g)], removeIds: g.notes.map((n) => n.id).filter((id) => id !== keep[gk(g)]), scheduling: best ? "best" : "keep" })) } });
      setGroups((cur) => (cur ?? []).filter((g) => !gs.includes(g)));
      onDone({ undoId: r.undoId, message: t("mergedN", { n: r.merged }) });
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const del = async (g: Group) => {
    setBusy(gk(g));
    try {
      const ids = g.notes.map((n) => n.id).filter((id) => id !== keep[gk(g)]);
      const r = await api<{ deleted: number; undoId: number }>("/api/batch/merge", { body: { action: "delete", noteIds: ids } });
      setGroups((cur) => (cur ?? []).filter((x) => x !== g));
      onDone({ undoId: r.undoId, message: t("deletedN", { n: r.deleted }) });
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const fmt = (s: string) => new Date(s).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { year: "2-digit", month: "short", day: "numeric" });

  return (
    <Modal open={open} onClose={onClose} wide title={<span className="inline-flex items-center gap-2"><Copy className="h-4 w-4 text-primary" />{t("duplicates")}</span>}
      footer={groups && groups.length > 1 ? <><Button variant="ghost" onClick={onClose}>{t("close")}</Button><Button variant="primary" loading={busy === "all"} onClick={() => merge(groups)}><Merge className="h-4 w-4" />{t("mergeAll")} ({groups.length})</Button></> : undefined}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t("dupScope")}>
            <Select className="w-full" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="collection">{t("dupCollection")}</option><option value="deck">{t("dupDeck")}</option><option value="type">{t("dupType")}</option>
            </Select>
          </Field>
          <Field label={t("dupIn")}>
            <Select className="w-full" value={where} onChange={(e) => setWhere(e.target.value as typeof where)}>
              <option value="all">{t("dupAllDecks")}</option><option value="deck">{app.t("colDeck")}…</option>{query && <option value="results">{t("dupResults")}</option>}
            </Select>
          </Field>
          <Button variant="primary" onClick={scan} loading={loading} disabled={where === "deck" && !deckId}>{t("scan")}</Button>
        </div>
        {where === "deck" && <DeckPicker className="w-full" decks={decks.filter((d) => !d.filtered)} value={deckId} onChange={setDeckId} placeholder="—" />}
        {groups && groups.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-subtle px-3 py-2">
            <span className="text-[13px] font-medium">{t("dupGroups", { n: groups.length })}</span>
            <Toggle checked={best} onChange={setBest} label={<span className="text-[12.5px]">{best ? t("schedBest") : t("schedKeep")}</span>} />
          </div>
        )}
        {loading ? <div className="flex justify-center py-8"><Spinner /></div> : groups && (groups.length === 0 ? <p className="py-6 text-center text-[13px] text-faint">{t("dupNone")}</p> : (
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
            <p className="text-xs text-faint">{t("mergeHint")}</p>
            {groups.map((g) => (
              <div key={gk(g)} className="rounded-xl border border-border bg-surface">
                <div className="divide-y divide-border">
                  {g.notes.map((n) => {
                    const on = keep[gk(g)] === n.id;
                    return (
                      <label key={n.id} className={cx("flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors", on ? "bg-primary/[0.06]" : "hover:bg-subtle")}>
                        <input type="radio" name={`keep-${gk(g)}`} checked={on} onChange={() => setKeep({ ...keep, [gk(g)]: n.id })} className="mt-1 h-[18px] w-[18px] accent-primary" aria-label={t("keep")} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-fg">{n.sortField || "—"}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-faint">
                            <span className="max-w-[50%] truncate">{n.deckPath}</span><span>·</span><span>{app.t(`t_${n.type}`)}</span><span>·</span><span className="num">{fmt(n.createdAt)}</span><span>·</span>
                            <span className="num">{t("reps", { n: reps(n) })}</span>
                            {n.tags.slice(0, 3).map((x) => <Badge key={x} className="max-w-[110px] truncate">{x}</Badge>)}
                          </span>
                        </span>
                        {on && <Pill tone="primary">{t("keep")}</Pill>}
                      </label>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-1 border-t border-border bg-subtle/60 px-2 py-1.5">
                  <Button size="sm" variant="ghost" className="text-danger hover:text-danger" loading={busy === gk(g)} onClick={() => del(g)}><Trash2 className="h-3.5 w-3.5" />{t("deleteOthers")}</Button>
                  <Button size="sm" variant="secondary" loading={busy === gk(g)} onClick={() => merge([g])}><Merge className="h-3.5 w-3.5" />{t("merge")}</Button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}

const reps = (n: DupNote) => n.cards.reduce((a, c) => a + c.reps, 0);
