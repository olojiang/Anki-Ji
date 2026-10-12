"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bold, Italic, Code, Sigma, ImagePlus, Music, Brackets, Eye, Plus, Trash2, Check, Upload, Eraser } from "lucide-react";
import { useApp } from "./providers";
import { uploadFile } from "@/lib/api";
import { Button, Field, Input, Select, Textarea, Toggle, cx } from "./ui";
import { DeckPicker } from "./DeckPicker";
import { CardView } from "./CardView";
import { Markdown } from "./Markdown";
import type { DeckDTO } from "@/lib/types";
import { NOTE_TYPES, type NoteFields, type NoteType, type OcclusionMask } from "@/core/types";
import { cardOrdinals, renderCard } from "@/core/notes";
import { clozeOrdinals } from "@/core/cloze";
import { api } from "@/lib/api";
import { tn } from "@/lib/i18n-notetypes";
import type { NoteTypeDef } from "@/core/notetypes";

export interface NoteDraft { deckId: number | null; type: NoteType; fields: NoteFields; tags: string; notetypeId?: number | null }

export function emptyFields(type: NoteType): NoteFields {
  switch (type) {
    case "cloze": return { text: "", extra: "" };
    case "mcq": return { question: "", options: ["", "", "", ""], correct: [], explanation: "" };
    case "image_occlusion": return { image: "", masks: [], header: "", extra: "", occlusionMode: "hideOne" };
    case "basic_optional_reverse": return { front: "", back: "", addReverse: false };
    case "custom": return { custom: {} };
    default: return { front: "", back: "" };
  }
}

/** The user's custom note types (fetched once per editor). */
function useCustomNoteTypes(): NoteTypeDef[] | null {
  const [list, setList] = useState<NoteTypeDef[] | null>(null);
  useEffect(() => {
    let live = true;
    api<{ noteTypes: NoteTypeDef[] }>("/api/notetypes").then((r) => { if (live) setList(r.noteTypes.filter((x) => !x.readOnly)); }).catch(() => live && setList([]));
    return () => { live = false; };
  }, []);
  return list;
}

function MdField({ label, value, onChange, rows = 4, cloze, autoFocus, rtl }: { label: string; value: string; onChange: (v: string) => void; rows?: number; cloze?: boolean; autoFocus?: boolean; rtl?: boolean }) {
  const { t, err } = useApp();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = (before: string, after = before) => {
    const el = ref.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = value.slice(s, e);
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
  };
  const insert = (text: string) => {
    const el = ref.current;
    const pos = el ? el.selectionStart : value.length;
    onChange(value.slice(0, pos) + text + value.slice(pos));
  };
  const addCloze = () => {
    const n = Math.max(0, ...clozeOrdinals(value)) + 1;
    wrap(`{{c${n}::`, "}}");
  };
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const r = await uploadFile(file);
      insert(file.type.startsWith("audio") ? `![audio](${r.url})` : file.type.startsWith("video") ? `![video](${r.url})` : `![](${r.url})`);
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const pickFile = (accept: string) => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = accept;
    i.onchange = () => i.files?.[0] && upload(i.files[0]);
    i.click();
  };
  const tools = [
    { icon: Bold, label: "Bold", on: () => wrap("**") },
    { icon: Italic, label: "Italic", on: () => wrap("*") },
    { icon: Code, label: "Code", on: () => wrap("`") },
    { icon: Sigma, label: "Math", on: () => wrap("$") },
    ...(cloze ? [{ icon: Brackets, label: t("clozeBtn"), on: addCloze }] : []),
    { icon: ImagePlus, label: t("uploadImage"), on: () => pickFile("image/*") },
    { icon: Music, label: t("uploadAudio"), on: () => pickFile("audio/*,video/*") },
  ];
  return (
    <div>
      <div className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <span className="text-[13px] font-medium text-sub">{label}</span>
        <div className="-mx-1 flex items-center justify-between gap-0.5 sm:mx-0 sm:-mr-1 sm:justify-start">
          {tools.map((x) => <button key={x.label} type="button" onClick={x.on} title={x.label} className={cx("inline-flex h-11 min-w-10 items-center justify-center gap-1 rounded-lg px-1.5 text-faint hover:bg-muted hover:text-fg sm:h-7 sm:min-w-0 sm:rounded-md", x.label === t("clozeBtn") && "text-primary")}><x.icon className="h-3.5 w-3.5" />{x.label === t("clozeBtn") && <span className="text-xs">{x.label}</span>}</button>)}
          <button type="button" onClick={() => setPreview(!preview)} title={t("preview")} className={cx("inline-flex h-11 w-10 items-center justify-center rounded-lg hover:bg-muted sm:h-7 sm:w-7 sm:rounded-md", preview ? "text-primary" : "text-faint")}><Eye className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-[88px] rounded-lg border border-border bg-muted/40 px-3 py-2"><Markdown text={value} /></div>
      ) : (
        <Textarea ref={ref} rows={rows} value={value} autoFocus={autoFocus} disabled={busy} dir={rtl ? "rtl" : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (cloze && e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) { e.preventDefault(); addCloze(); } }}
          onPaste={(e) => { const f = [...e.clipboardData.files][0]; if (f) { e.preventDefault(); upload(f); } }}
          onDrop={(e) => { const f = [...e.dataTransfer.files][0]; if (f) { e.preventDefault(); upload(f); } }}
          className="font-mono text-[13.5px]" />
      )}
    </div>
  );
}

function OcclusionEditor({ fields, set }: { fields: NoteFields; set: (f: Partial<NoteFields>) => void }) {
  const { t, err } = useApp();
  const box = useRef<HTMLDivElement>(null);
  const [draw, setDraw] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const masks = fields.masks ?? [];
  const pt = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)), y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)) };
  };
  const finish = () => {
    if (!draw) return;
    const m: OcclusionMask = { x: Math.min(draw.x0, draw.x), y: Math.min(draw.y0, draw.y), w: Math.abs(draw.x - draw.x0), h: Math.abs(draw.y - draw.y0) };
    setDraw(null);
    if (m.w > 1 && m.h > 1) set({ masks: [...masks, { x: +m.x.toFixed(2), y: +m.y.toFixed(2), w: +m.w.toFixed(2), h: +m.h.toFixed(2) }] });
  };
  const upload = () => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = "image/*";
    i.onchange = async () => { const f = i.files?.[0]; if (!f) return; try { set({ image: (await uploadFile(f)).url, masks: [] }); } catch (e) { err(e); } };
    i.click();
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-faint">{t("occlusionHelp")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={upload}><Upload className="h-3.5 w-3.5" />{t("uploadImage")}</Button>
        {fields.image && <Button size="sm" variant="ghost" onClick={() => set({ masks: [] })}><Eraser className="h-3.5 w-3.5" />{t("clearMasks")}</Button>}
        <Select className="h-8 text-[13px]" value={fields.occlusionMode ?? "hideOne"} onChange={(e) => set({ occlusionMode: e.target.value as "hideOne" | "hideAll" })}>
          <option value="hideOne">{t("hideOne")}</option><option value="hideAll">{t("hideAll")}</option>
        </Select>
        <span className="text-xs text-faint">{masks.length} masks</span>
      </div>
      {fields.image && (
        <div ref={box} className="relative inline-block max-w-full cursor-crosshair select-none touch-none"
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); const p = pt(e); setDraw({ x0: p.x, y0: p.y, x: p.x, y: p.y }); }}
          onPointerMove={(e) => draw && setDraw({ ...draw, ...pt(e) })}
          onPointerUp={finish}>
          <img src={fields.image} alt="" draggable={false} className="block max-h-[480px] max-w-full rounded-lg" />
          {masks.map((m, i) => (
            <div key={i} className="group absolute flex items-center justify-center rounded-md border-2 border-primary bg-primary/35 text-xs font-semibold text-white" style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%` }}>
              {i + 1}
              <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => set({ masks: masks.filter((_, j) => j !== i) })} className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-again text-white group-hover:flex"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          {draw && <div className="absolute rounded-md border-2 border-dashed border-primary bg-primary/20" style={{ left: `${Math.min(draw.x0, draw.x)}%`, top: `${Math.min(draw.y0, draw.y)}%`, width: `${Math.abs(draw.x - draw.x0)}%`, height: `${Math.abs(draw.y - draw.y0)}%` }} />}
        </div>
      )}
    </div>
  );
}

export function NoteEditor({ decks, draft, setDraft, lockType, editing }: { decks: DeckDTO[]; draft: NoteDraft; setDraft: (d: NoteDraft) => void; lockType?: boolean; editing?: boolean }) {
  const { t, locale } = useApp();
  const f = draft.fields;
  const set = (p: Partial<NoteFields>) => setDraft({ ...draft, fields: { ...f, ...p } });
  const customTypes = useCustomNoteTypes();
  const nt = draft.type === "custom" ? customTypes?.find((x) => x.id === draft.notetypeId) ?? null : null;
  // a remembered custom type that no longer exists → fall back to Basic
  useEffect(() => {
    if (draft.type === "custom" && customTypes && !nt && !editing) setDraft({ ...draft, type: "basic", notetypeId: null, fields: emptyFields("basic") });
  }, [draft, customTypes, nt, editing, setDraft]);
  const setCustom = (id: string, v: string) => set({ custom: { ...(f.custom ?? {}), [id]: v } });
  const ords = useMemo(() => cardOrdinals(draft.type, f, nt), [draft.type, f, nt]);
  const [previewOrd, setPreviewOrd] = useState(0);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { if (!ords.includes(previewOrd)) setPreviewOrd(ords[0] ?? 0); }, [ords, previewOrd]);
  const tags = parseTags(draft.tags);
  const rendered = ords.length ? renderCard(draft.type, f, ords.includes(previewOrd) ? previewOrd : ords[0], nt, { tags, deck: decks.find((d) => d.id === draft.deckId)?.name ?? "" }) : null;
  const typeValue = draft.type === "custom" ? `nt:${draft.notetypeId ?? ""}` : draft.type;
  const pickType = (v: string) => {
    if (v.startsWith("nt:")) { setDraft({ ...draft, type: "custom", notetypeId: Number(v.slice(3)), fields: { custom: carryCustom(f, customTypes?.find((x) => x.id === Number(v.slice(3)))) } }); return; }
    const type = v as NoteType;
    setDraft({ ...draft, type, notetypeId: null, fields: { ...emptyFields(type), ...carry(draft.type === "custom" ? fromCustom(f) : f, type) } });
  };
  const ordLabel = (o: number) => (draft.type === "cloze" || nt?.kind === "cloze" ? `c${o}` : nt ? nt.templates.find((x) => x.ord === o)?.name ?? String(o + 1) : String(o + 1));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("noteType")} hint={<Link href="/notetypes" className="inline-flex min-h-11 items-center text-primary hover:underline sm:min-h-0">{tn(locale, "manage")}</Link>}>
            <Select className="w-full" disabled={lockType || (editing && draft.type === "custom")} value={typeValue} onChange={(e) => pickType(e.target.value)}>
              <optgroup label={tn(locale, "builtIn")}>
                {NOTE_TYPES.map((x) => <option key={x} value={x}>{t(`t_${x}`)}</option>)}
              </optgroup>
              {!!customTypes?.length && !(editing && draft.type !== "custom") && (
                <optgroup label={tn(locale, "custom")}>
                  {customTypes.map((x) => <option key={x.id} value={`nt:${x.id}`}>{x.name}</option>)}
                </optgroup>
              )}
              {draft.type === "custom" && !nt && <option value={typeValue}>…</option>}
            </Select>
          </Field>
          <Field label={t("deck")}><DeckPicker className="w-full" decks={decks} value={draft.deckId} onChange={(id) => setDraft({ ...draft, deckId: id })} /></Field>
        </div>

        {(draft.type === "basic" || draft.type === "basic_reverse" || draft.type === "basic_optional_reverse" || draft.type === "type_in") && <>
          <MdField label={t("front")} value={f.front ?? ""} onChange={(v) => set({ front: v })} autoFocus />
          <MdField label={t("backSide")} value={f.back ?? ""} onChange={(v) => set({ back: v })} rows={draft.type === "type_in" ? 2 : 4} />
          {draft.type === "basic_optional_reverse" && <Toggle checked={!!f.addReverse} onChange={(v) => set({ addReverse: v })} label={t("addReverse")} />}
        </>}

        {nt && nt.fields.map((x, i) => (
          <MdField key={x.id} label={x.name} value={f.custom?.[x.id] ?? ""} onChange={(v) => setCustom(x.id, v)} rows={i === 0 ? 3 : 2} cloze={nt.kind === "cloze"} autoFocus={i === 0} rtl={x.rtl} />
        ))}

        {draft.type === "cloze" && <>
          <MdField label={t("text")} value={f.text ?? ""} onChange={(v) => set({ text: v })} rows={5} cloze autoFocus />
          <p className="-mt-2 text-xs text-faint">{t("clozeHelp")}</p>
          <MdField label={t("extra")} value={f.extra ?? ""} onChange={(v) => set({ extra: v })} rows={2} />
        </>}

        {draft.type === "mcq" && <>
          <MdField label={t("question")} value={f.question ?? ""} onChange={(v) => set({ question: v })} rows={3} autoFocus />
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-sub">{t("options_")}</span>
            <div className="space-y-2">
              {(f.options ?? []).map((o, i) => {
                const ok = (f.correct ?? []).includes(i);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <button type="button" onClick={() => set({ correct: ok ? (f.correct ?? []).filter((x) => x !== i) : [...(f.correct ?? []), i] })}
                      title={t("correctMark")} className={cx("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold", ok ? "border-easy bg-easy/10 text-easy" : "border-border text-faint hover:bg-muted")}>
                      {ok ? <Check className="h-4 w-4" /> : String.fromCharCode(65 + i)}
                    </button>
                    <Input value={o} onChange={(e) => set({ options: (f.options ?? []).map((x, j) => (j === i ? e.target.value : x)) })} />
                    <button type="button" onClick={() => set({ options: (f.options ?? []).filter((_, j) => j !== i), correct: (f.correct ?? []).filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)) })} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-muted hover:text-again"><Trash2 className="h-4 w-4" /></button>
                  </div>
                );
              })}
              <Button size="sm" variant="ghost" onClick={() => set({ options: [...(f.options ?? []), ""] })}><Plus className="h-3.5 w-3.5" />{t("addOption")}</Button>
            </div>
          </div>
          <MdField label={t("explanation")} value={f.explanation ?? ""} onChange={(v) => set({ explanation: v })} rows={2} />
        </>}

        {draft.type === "image_occlusion" && <>
          <Field label={t("header")}><Input value={f.header ?? ""} onChange={(e) => set({ header: e.target.value })} /></Field>
          <OcclusionEditor fields={f} set={set} />
          <MdField label={t("extra")} value={f.extra ?? ""} onChange={(v) => set({ extra: v })} rows={2} />
        </>}

        <Field label={t("tags")} hint={t("tagsPh")}><Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="tag1 tag2::sub" /></Field>
        <p className="text-xs text-faint">{t("mdHelp")}</p>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-sub">{t("preview")} · {ords.length} {ords.length === 1 ? "card" : "cards"}</span>
          <div className="flex items-center gap-1">
            {ords.length > 1 && ords.map((o) => <button key={o} onClick={() => setPreviewOrd(o)} className={cx("h-10 min-w-10 max-w-[9rem] truncate rounded-md px-2 text-xs sm:h-7 sm:min-w-7", o === previewOrd ? "bg-primary text-primary-fg" : "text-sub hover:bg-muted")}>{ordLabel(o)}</button>)}
            <Button size="sm" variant="ghost" onClick={() => setRevealed(!revealed)}>{revealed ? t("front") : t("showAnswer")}</Button>
          </div>
        </div>
        <div className="min-h-[220px] rounded-xl border border-border bg-surface px-5 py-8 shadow-card">
          {rendered ? <CardView card={rendered} revealed={revealed} picked={[]} /> : <p className="text-center text-sm text-faint">—</p>}
        </div>
      </div>
    </div>
  );
}

/** Built-in fields → values of a custom type (first two fields get the main / secondary text). */
function carryCustom(f: NoteFields, nt?: NoteTypeDef): Record<string, string> {
  if (!nt) return {};
  const src = f.custom ? Object.values(f.custom) : [f.front || f.text || f.question || "", f.back || f.extra || f.explanation || ""];
  return Object.fromEntries(nt.fields.map((x, i) => [x.id, src[i] ?? ""]));
}
const fromCustom = (f: NoteFields): NoteFields => { const v = Object.values(f.custom ?? {}); return { front: v[0] ?? "", back: v[1] ?? "" }; };

/** Keep content when switching types. */
function carry(f: NoteFields, type: NoteType): NoteFields {
  const main = f.front || f.text || f.question || "";
  const second = f.back || f.extra || f.explanation || "";
  switch (type) {
    case "cloze": return { text: main, extra: second };
    case "mcq": return { question: main, explanation: second };
    case "image_occlusion": return { header: main, extra: second };
    default: return { front: main, back: second };
  }
}

export function parseTags(s: string) { return s.split(/\s+/).map((x) => x.trim()).filter(Boolean); }
