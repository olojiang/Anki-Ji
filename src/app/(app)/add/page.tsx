"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Button, PageHeader, Spinner, Kbd } from "@/components/ui";
import { NoteEditor, emptyFields, parseTags, type NoteDraft } from "@/components/NoteEditor";
import type { DeckDTO } from "@/lib/types";
import type { NoteType } from "@/core/types";
import { noteTypeErrorMessage } from "@/lib/i18n-notetypes";

export default function AddPage() {
  const { t, err, toast, locale } = useApp();
  const [decks, setDecks] = useState<DeckDTO[] | null>(null);
  const [draft, setDraft] = useState<NoteDraft>({ deckId: null, type: "basic", fields: emptyFields("basic"), tags: "" });
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    api<{ decks: DeckDTO[] }>("/api/decks").then((r) => {
      setDecks(r.decks);
      const last = Number(localStorage.getItem("ak-last-deck"));
      const type = (localStorage.getItem("ak-last-type") as NoteType) || "basic";
      const usable = r.decks.filter((d) => !d.filtered);
      const deckFromUrl = Number(new URLSearchParams(window.location.search).get("deck"));
      const deckId = usable.find((d) => d.id === deckFromUrl)?.id ?? usable.find((d) => d.id === last)?.id ?? usable[0]?.id ?? null;
      const notetypeId = type === "custom" ? Number(localStorage.getItem("ak-last-notetype")) || null : null;
      setDraft((d) => ({ ...d, deckId, type, notetypeId, fields: emptyFields(type) }));
    }).catch(err);
  }, [err]);

  const save = async () => {
    if (!draft.deckId) return;
    setBusy(true);
    try {
      await api("/api/notes", { body: { deckId: draft.deckId, type: draft.type, fields: draft.fields, tags: parseTags(draft.tags), notetypeId: draft.type === "custom" ? draft.notetypeId : null } });
      localStorage.setItem("ak-last-deck", String(draft.deckId));
      localStorage.setItem("ak-last-type", draft.type);
      if (draft.type === "custom" && draft.notetypeId) localStorage.setItem("ak-last-notetype", String(draft.notetypeId));
      setCount((c) => c + 1);
      toast(t("added"));
      setDraft({ ...draft, fields: draft.type === "image_occlusion" ? emptyFields(draft.type) : emptyFields(draft.type) });
    } catch (e) { const m = noteTypeErrorMessage(locale, e); if (m) toast(m, "error"); else err(e); } finally { setBusy(false); }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (!decks) return <div className="flex justify-center py-24"><Spinner /></div>;
  return (
    <div>
      <PageHeader title={t("addNote")} subtitle={count ? `${t("added")} ${count}` : undefined}
        actions={<Button variant="primary" loading={busy} onClick={save} disabled={!draft.deckId}><Plus className="h-4 w-4" />{t("addAndNext")} <span className="hidden md:inline-flex"><Kbd>Ctrl ⏎</Kbd></span></Button>} />
      <NoteEditor decks={decks} draft={draft} setDraft={setDraft} />
      <Button variant="primary" size="lg" className="mt-6 w-full md:hidden" loading={busy} onClick={save} disabled={!draft.deckId}><Plus className="h-4 w-4" />{t("addAndNext")}</Button>
    </div>
  );
}
