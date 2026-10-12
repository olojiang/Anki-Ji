"use client";
/** Prefilled Basic / Cloze note from a reading selection, saved through the existing note API into a chosen deck. */
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { basicFromSelection, clozeFromSelection } from "@/core/reading";
import { renderCard, cardOrdinals } from "@/core/notes";
import type { DeckDTO } from "@/lib/types";
import { DeckPicker } from "../DeckPicker";
import { CardView } from "../CardView";
import { Button, Field, Input, Modal, Segmented, Textarea } from "../ui";
import { useSi } from "./useSi";

export interface CardSeed { kind: "basic" | "cloze"; selection: string; context: string; title: string }

export function CardFromSelection({ seed, onClose }: { seed: CardSeed | null; onClose: () => void }) {
  const { s, t, toast, fail } = useSi();
  const [decks, setDecks] = useState<DeckDTO[] | null>(null);
  const [deckId, setDeckId] = useState<number | null>(null);
  const [kind, setKind] = useState<"basic" | "cloze">("basic");
  const [front, setFront] = useState(""); const [back, setBack] = useState("");
  const [text, setText] = useState(""); const [extra, setExtra] = useState("");
  const [tags, setTags] = useState("reading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!seed) return;
    setKind(seed.kind);
    const b = basicFromSelection(seed.selection);
    setFront(b.front); setBack(b.back);
    setText(clozeFromSelection(seed.context, seed.selection).text);
    setExtra(seed.title ? `*${seed.title.replace(/\*/g, "")}*` : "");
    if (!decks) {
      api<{ decks: DeckDTO[] }>("/api/decks").then((r) => {
        setDecks(r.decks);
        const usable = r.decks.filter((d) => !d.filtered);
        const last = Number(localStorage.getItem("ak-last-deck"));
        setDeckId(usable.find((d) => d.id === last)?.id ?? usable[0]?.id ?? null);
      }).catch(fail);
    }
  }, [seed, decks, fail]);

  const fields = kind === "basic" ? { front, back } : { text, extra };
  let preview = null;
  try { const ords = cardOrdinals(kind, fields); preview = ords.length ? renderCard(kind, fields, ords[0]) : null; } catch { preview = null; }

  const save = async () => {
    if (!deckId) return;
    setBusy(true);
    try {
      await api("/api/notes", { body: { deckId, type: kind, fields, tags: tags.split(/[\s,，]+/).filter(Boolean) } });
      localStorage.setItem("ak-last-deck", String(deckId));
      toast(s("cardAdded"));
      onClose();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!seed} onClose={onClose} wide title={s("newCard")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} disabled={!deckId} onClick={save} data-testid="reading-card-save"><Plus className="h-4 w-4" />{s("addCard")}</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Segmented value={kind} onChange={setKind} className="w-full" options={[{ value: "basic", label: s("makeBasic") }, { value: "cloze", label: s("makeCloze") }]} />
          <Field label={s("deck")}>{decks ? <DeckPicker decks={decks} value={deckId} onChange={setDeckId} className="w-full" /> : <Input disabled />}</Field>
          {kind === "basic" ? <>
            <Field label={s("front")}><Textarea rows={3} value={front} onChange={(e) => setFront(e.target.value)} data-testid="reading-card-front" /></Field>
            <Field label={s("back")}><Textarea rows={3} value={back} onChange={(e) => setBack(e.target.value)} autoFocus /></Field>
          </> : <>
            <Field label={s("clozeText")}><Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} data-testid="reading-card-cloze" /></Field>
            <Field label={s("extra")}><Input value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>
          </>}
          <Field label={s("tags")}><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
        </div>
        <div className="hidden min-h-[200px] items-center justify-center rounded-xl border border-border bg-subtle/60 p-4 md:flex [&_.prose-card]:!text-[16px]">
          {preview ? <div className="w-full"><CardView card={preview} revealed picked={[]} /></div> : <span className="text-sm text-faint">—</span>}
        </div>
      </div>
    </Modal>
  );
}
