"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Button, Card, PageHeader, Spinner, Badge } from "@/components/ui";
import { NoteEditor, parseTags, type NoteDraft } from "@/components/NoteEditor";
import type { DeckDTO, NoteDTO } from "@/lib/types";
import { noteTypeErrorMessage } from "@/lib/i18n-notetypes";

interface Rev { id: number; cardId: number; rating: number; state: string; reviewedAt: string; scheduledDays: number; stability: number; difficulty: number; durationMs: number }

export default function EditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, err, toast, locale } = useApp();
  const router = useRouter();
  const [decks, setDecks] = useState<DeckDTO[] | null>(null);
  const [note, setNote] = useState<NoteDTO | null>(null);
  const [history, setHistory] = useState<Rev[]>([]);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const back = () => { const b = new URLSearchParams(window.location.search).get("back"); router.push(b && b.startsWith("/") ? b : "/browse"); };

  useEffect(() => {
    Promise.all([api<{ decks: DeckDTO[] }>("/api/decks"), api<{ note: NoteDTO; history: Rev[] }>(`/api/notes/${id}`)]).then(([d, n]) => {
      setDecks(d.decks); setNote(n.note); setHistory(n.history);
      setDraft({ deckId: n.note.deckId, type: n.note.type, fields: n.note.fields, tags: n.note.tags.join(" "), notetypeId: n.note.notetypeId ?? null });
    }).catch(err);
  }, [id, err]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await api(`/api/notes/${id}`, { method: "PATCH", body: { deckId: draft.deckId, type: draft.type, fields: draft.fields, tags: parseTags(draft.tags) } });
      toast(t("saved")); back();
    } catch (e) { const m = noteTypeErrorMessage(locale, e); if (m) toast(m, "error"); else err(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    try { await api(`/api/notes/${id}`, { method: "DELETE" }); back(); } catch (e) { err(e); }
  };
  if (!decks || !draft || !note) return <div className="flex justify-center py-24"><Spinner /></div>;
  const rl = ["", t("again"), t("hard"), t("good"), t("easy")];
  return (
    <div>
      <PageHeader title={<span className="inline-flex items-center gap-2"><button onClick={back} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-sub hover:bg-muted sm:h-8 sm:w-8"><ArrowLeft className="h-4 w-4" /></button>{t("editNote")}</span>}
        actions={<><Button variant="ghost" onClick={remove}><Trash2 className="h-4 w-4" />{t("delete")}</Button><Button variant="primary" loading={busy} onClick={save}><Save className="h-4 w-4" />{t("save")}</Button></>} />
      <NoteEditor decks={decks} draft={draft} setDraft={setDraft} editing />
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">{t("cardInfo")}</h3>
          <div className="space-y-2 text-sm">
            {note.cards.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-2">
                <Badge tone="primary">#{note.type === "cloze" || note.noteType?.kind === "cloze" ? `c${c.ord}` : note.noteType ? note.noteType.templates.find((x) => x.ord === c.ord)?.name ?? c.ord + 1 : c.ord + 1}</Badge>
                <span className="text-sub">{c.state}</span>
                <span className="text-sub">{t("stability")} <b className="text-fg">{c.stability ? c.stability.toFixed(1) + "d" : "—"}</b></span>
                <span className="text-sub">{t("difficulty")} <b className="text-fg">{c.difficulty ? c.difficulty.toFixed(1) : "—"}</b></span>
                <span className="text-sub">{t("reps")} <b className="text-fg">{c.reps}</b></span>
                <span className="text-sub">{t("lapses")} <b className="text-fg">{c.lapses}</b></span>
                {c.state !== "new" && <span className="text-sub">{t("colDueAt")} <b className="text-fg">{new Date(c.due).toLocaleDateString()}</b></span>}
                {c.suspended && <Badge tone="hard">{t("suspended")}</Badge>}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">{t("history")}</h3>
          {history.length === 0 ? <p className="text-sm text-faint">—</p> : (
            <div className="max-h-72 overflow-y-auto scrollbar-thin">
              <table className="w-full text-left text-[13px]">
                <tbody>
                  {[...history].reverse().map((h) => (
                    <tr key={h.id} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-2 text-sub">{new Date(h.reviewedAt).toLocaleString()}</td>
                      <td className={`py-1.5 pr-2 font-medium text-${["", "again", "hard", "good", "easy"][h.rating]}`}>{rl[h.rating]}</td>
                      <td className="py-1.5 pr-2 text-faint">{h.state}</td>
                      <td className="py-1.5 text-right text-faint">{h.scheduledDays ? `${Math.round(h.scheduledDays)}d` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
