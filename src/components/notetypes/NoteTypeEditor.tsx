"use client";
/** Editor for one note type: fields, card templates (live front/back preview) and CSS. Read-only for stock types. */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Lock, Plus, RotateCcw, Save, Trash2, TriangleAlert, Eye } from "lucide-react";
import { useApp } from "../providers";
import { Badge, Button, Card, IconButton, Input, Modal, Segmented, Textarea, Toggle, cx } from "../ui";
import { CardView } from "../CardView";
import {
  addField, addTemplate, moveField, moveTemplate, removeField, removeTemplate, renameField, renderNoteTypeCard, validateNoteType,
  type FieldValues, type NoteTypeDef,
} from "@/core/notetypes";
import type { TemplateIssue } from "@/core/template";
import { tn } from "@/lib/i18n-notetypes";

type Tab = "fields" | "cards" | "style";

export function issueText(locale: "zh" | "en", e: TemplateIssue): string {
  const msg = tn(locale, `v_${e.code}`, { d: e.detail ?? "" });
  return e.template ? `${e.template}${e.side ? ` · ${tn(locale, e.side === "front" ? "frontTpl" : "backTpl")}` : ""}: ${msg}` : msg;
}

function sampleFor(nt: NoteTypeDef): FieldValues {
  const out: FieldValues = {};
  nt.fields.forEach((f, i) => { out[f.id] = nt.kind === "cloze" && i === 0 ? `{{c1::${f.name}}} · {{c2::…}}` : f.name; });
  return out;
}

/** Text area + chips that insert {{Field}} at the cursor. */
function TemplateArea({ label, value, onChange, fields, readOnly, rows = 6, testId }: { label: string; value: string; onChange: (v: string) => void; fields: string[]; readOnly?: boolean; rows?: number; testId?: string }) {
  const { locale } = useApp();
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (text: string) => {
    const el = ref.current;
    const s = el ? el.selectionStart : value.length, e = el ? el.selectionEnd : value.length;
    onChange(value.slice(0, s) + text + value.slice(e));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + text.length, s + text.length); });
  };
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-sub">{label}</span>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1" aria-label={tn(locale, "insertField")}>
            {[...fields, "FrontSide"].map((f) => (
              <button key={f} type="button" onClick={() => insert(`{{${f}}}`)}
                className="inline-flex h-11 items-center rounded-md border border-border bg-subtle px-2 font-mono text-[11.5px] text-sub hover:border-border-strong hover:text-fg sm:h-7">{`{{${f}}}`}</button>
            ))}
          </div>
        )}
      </div>
      <Textarea ref={ref} rows={rows} value={value} readOnly={readOnly} spellCheck={false} data-testid={testId}
        onChange={(e) => onChange(e.target.value)} className="font-mono text-[13px] leading-relaxed" />
    </div>
  );
}

function FieldRow({ name, index, count, sort, rtl, readOnly, onRename, onSort, onRtl, onMove, onRemove }: {
  name: string; index: number; count: number; sort: boolean; rtl: boolean; readOnly?: boolean;
  onRename: (v: string) => void; onSort: () => void; onRtl: (v: boolean) => void; onMove: (d: number) => void; onRemove: () => void;
}) {
  const { locale } = useApp();
  const [v, setV] = useState(name);
  useEffect(() => setV(name), [name]);
  const commit = () => { if (v.trim() && v !== name) onRename(v); else setV(name); };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-subtle/60 p-2 sm:flex-nowrap" data-testid="nt-field-row">
      <span className="num w-6 shrink-0 text-center text-xs text-faint">{index + 1}</span>
      <Input value={v} readOnly={readOnly} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        className="min-w-0 flex-1 basis-40" aria-label={tn(locale, "name")} />
      <div className="flex items-center gap-1">
        <button type="button" disabled={readOnly} onClick={onSort} title={tn(locale, "sortBy")}
          className={cx("inline-flex h-11 items-center rounded-lg px-2.5 text-xs sm:h-8", sort ? "bg-primary/10 font-medium text-primary" : "text-faint hover:bg-muted hover:text-fg")}>{tn(locale, "sortBy")}</button>
        <button type="button" disabled={readOnly} onClick={() => onRtl(!rtl)} title={tn(locale, "rtl")}
          className={cx("inline-flex h-11 items-center rounded-lg px-2.5 font-mono text-xs sm:h-8", rtl ? "bg-primary/10 font-medium text-primary" : "text-faint hover:bg-muted hover:text-fg")}>RTL</button>
        {!readOnly && <>
          <IconButton label={tn(locale, "moveUp")} disabled={index === 0} onClick={() => onMove(-1)} className="disabled:opacity-30"><ArrowUp className="h-4 w-4" /></IconButton>
          <IconButton label={tn(locale, "moveDown")} disabled={index === count - 1} onClick={() => onMove(1)} className="disabled:opacity-30"><ArrowDown className="h-4 w-4" /></IconButton>
          <IconButton label={tn(locale, "delete")} disabled={count <= 1} onClick={onRemove} className="hover:text-danger disabled:opacity-30"><Trash2 className="h-4 w-4" /></IconButton>
        </>}
      </div>
    </div>
  );
}

export function NoteTypeEditor({ value, onSave, onClone, onDelete, saving }: {
  value: NoteTypeDef; saving?: boolean;
  onSave: (nt: NoteTypeDef) => Promise<void>; onClone: () => void; onDelete: () => void;
}) {
  const { locale, t } = useApp();
  const readOnly = !!value.readOnly;
  const [draft, setDraft] = useState<NoteTypeDef>(value);
  const [tab, setTab] = useState<Tab>("cards");
  const [tplOrd, setTplOrd] = useState<number>(value.templates[0]?.ord ?? 0);
  const [sample, setSample] = useState<FieldValues>(() => sampleFor(value));
  const [newField, setNewField] = useState("");
  const [confirm, setConfirm] = useState<null | { text: string; run: () => void }>(null);
  useEffect(() => { setDraft(value); setTplOrd(value.templates[0]?.ord ?? 0); setSample(sampleFor(value)); }, [value]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const issues = useMemo(() => (readOnly ? [] : validateNoteType(draft)), [draft, readOnly]);
  const tpl = draft.templates.find((x) => x.ord === tplOrd) ?? draft.templates[0];
  const fieldNames = draft.fields.map((f) => f.name);
  const notes = value.noteCount ?? 0;

  const previewOrd = draft.kind === "cloze" ? 1 : tpl?.ord ?? 0;
  const rendered = useMemo(() => (tpl ? renderNoteTypeCard(draft, sample, previewOrd, { tags: ["tag"], deck: "Deck" }) : null), [draft, sample, previewOrd, tpl]);

  const ask = (text: string, run: () => void) => (notes > 0 ? setConfirm({ text, run }) : run());
  const save = () => {
    const removed = value.templates.filter((x) => !draft.templates.some((y) => y.ord === x.ord));
    const go = () => { onSave(draft).catch(() => {}); };
    if (removed.length && notes > 0) setConfirm({ text: tn(locale, "saveRemovesQ", { n: removed.length }), run: go });
    else go();
  };
  const setTpl = (patch: Partial<NonNullable<typeof tpl>>) => setDraft({ ...draft, templates: draft.templates.map((x) => (x.ord === tpl?.ord ? { ...x, ...patch } : x)) });

  const preview = (
    <Card className="p-4 sm:p-5" >
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-sub"><Eye className="h-4 w-4 text-faint" />{tn(locale, "preview")}{tpl && <Badge className="max-w-[12rem] truncate">{tpl.name}</Badge>}</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {(["front", "back"] as const).map((side) => (
          <div key={side} className="min-w-0">
            <div className="mb-1.5 text-xs text-faint">{tn(locale, side === "front" ? "front" : "backSide")}</div>
            <div className="min-h-[140px] overflow-hidden rounded-xl border border-border bg-surface px-4 py-6 shadow-xs" data-testid={`nt-preview-${side}`}>
              {rendered ? <CardView card={rendered} revealed={side === "back"} picked={[]} /> : <p className="text-center text-sm text-faint">—</p>}
            </div>
          </div>
        ))}
      </div>
      <details className="mt-4 group">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-[12.5px] font-medium text-sub hover:text-fg sm:min-h-0">{tn(locale, "sampleValues")}</summary>
        <div className="mt-2 grid gap-2">
          {draft.fields.map((f) => (
            <label key={f.id} className="grid gap-1 text-xs text-faint sm:grid-cols-[8rem_1fr] sm:items-center">
              <span className="truncate">{f.name}</span>
              <Input value={sample[f.id] ?? ""} onChange={(e) => setSample({ ...sample, [f.id]: e.target.value })} />
            </label>
          ))}
        </div>
      </details>
    </Card>
  );

  return (
    <div className="space-y-4" data-testid="nt-editor">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 basis-56">
            {readOnly ? (
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.01em]"><Lock className="h-4 w-4 text-faint" />{draft.name}</h2>
            ) : (
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="text-base font-semibold sm:text-[15px]" aria-label={tn(locale, "name")} data-testid="nt-name" />
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
              <Badge tone={draft.kind === "cloze" ? "primary" : "neutral"}>{tn(locale, draft.kind === "cloze" ? "kindCloze" : "kindStandard")}</Badge>
              {readOnly && <Badge>{tn(locale, "readOnly")}</Badge>}
              <span>{tn(locale, "notesN", { n: notes })}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(!readOnly || value.clonable) && <Button size="sm" onClick={onClone}><Copy className="h-3.5 w-3.5" />{tn(locale, readOnly ? "cloneToEdit" : "clone")}</Button>}
            {!readOnly && <Button size="sm" variant="ghost" onClick={onDelete} className="hover:text-danger"><Trash2 className="h-3.5 w-3.5" />{tn(locale, "delete")}</Button>}
            {!readOnly && dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(value)}><RotateCcw className="h-3.5 w-3.5" />{tn(locale, "discard")}</Button>}
            {!readOnly && <Button size="sm" variant="primary" loading={saving} disabled={!dirty || issues.length > 0} onClick={save} data-testid="nt-save"><Save className="h-3.5 w-3.5" />{tn(locale, "save")}</Button>}
          </div>
        </div>
        {readOnly && <p className="mt-3 text-[13px] leading-relaxed text-sub">{tn(locale, "stockHelp")}</p>}
        {!readOnly && dirty && issues.length === 0 && <p className="mt-3 text-xs text-warning">{tn(locale, "unsaved")}</p>}
        {issues.length > 0 && (
          <div className="mt-3 rounded-xl border border-danger/30 bg-danger/[0.06] px-3 py-2 text-[13px] text-danger" data-testid="nt-issues">
            <div className="mb-1 flex items-center gap-1.5 font-medium"><TriangleAlert className="h-4 w-4" />{tn(locale, "issues")}</div>
            <ul className="list-disc space-y-0.5 pl-5">{issues.slice(0, 6).map((e, i) => <li key={i}>{issueText(locale, e)}</li>)}</ul>
          </div>
        )}
      </Card>

      <Segmented<Tab> value={tab} onChange={setTab} className="w-full sm:w-auto" options={[
        { value: "fields", label: `${tn(locale, "tabFields")} · ${draft.fields.length}` },
        { value: "cards", label: `${tn(locale, "tabCards")} · ${draft.templates.length}` },
        { value: "style", label: tn(locale, "tabStyle") },
      ]} />

      {tab === "fields" && (
        <Card className="space-y-2 p-4 sm:p-5">
          {draft.fields.map((f, i) => (
            <FieldRow key={f.id} name={f.name} index={i} count={draft.fields.length} sort={draft.sortField === i} rtl={!!f.rtl} readOnly={readOnly}
              onRename={(v) => setDraft(renameField(draft, f.id, v))}
              onSort={() => setDraft({ ...draft, sortField: i })}
              onRtl={(on) => setDraft({ ...draft, fields: draft.fields.map((x) => (x.id === f.id ? { ...x, rtl: on || undefined } : x)) })}
              onMove={(d) => setDraft(moveField(draft, f.id, d))}
              onRemove={() => ask(tn(locale, "removeFieldQ", { name: f.name, n: notes }), () => setDraft((cur) => removeField(cur, f.id)))} />
          ))}
          {!readOnly && (
            <form className="flex gap-2 pt-2" onSubmit={(e) => { e.preventDefault(); if (!newField.trim()) return; setDraft(addField(draft, newField)); setNewField(""); }}>
              <Input value={newField} onChange={(e) => setNewField(e.target.value)} placeholder={tn(locale, "newFieldPh")} data-testid="nt-new-field" />
              <Button type="submit" disabled={!newField.trim()}><Plus className="h-4 w-4" />{tn(locale, "addField")}</Button>
            </form>
          )}
          <p className="pt-1 text-xs leading-relaxed text-faint">{tn(locale, "fieldRenameNote")}</p>
        </Card>
      )}

      {(tab === "cards" || tab === "style") && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Card className="min-w-0 space-y-4 p-4 sm:p-5">
            {tab === "cards" ? <>
              <div className="flex flex-wrap items-center gap-1.5">
                {draft.templates.map((x) => (
                  <button key={x.ord} type="button" onClick={() => setTplOrd(x.ord)}
                    className={cx("inline-flex h-11 max-w-[14rem] items-center truncate rounded-lg px-3 text-[13px] sm:h-8", x.ord === tpl?.ord ? "bg-primary text-primary-fg" : "border border-border bg-surface text-sub hover:text-fg")}>{x.name || "—"}</button>
                ))}
                {!readOnly && draft.kind === "standard" && (
                  <Button size="sm" variant="ghost" onClick={() => { const next = addTemplate(draft, tn(locale, "cardLabel", { n: draft.templates.length + 1 })); setDraft(next); setTplOrd(next.templates[next.templates.length - 1].ord); }} data-testid="nt-add-template">
                    <Plus className="h-3.5 w-3.5" />{tn(locale, "addTemplate")}
                  </Button>
                )}
              </div>
              {tpl && <>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 basis-48">
                    <span className="mb-1.5 block text-[12.5px] font-medium text-sub">{tn(locale, "templateName")}</span>
                    <Input value={tpl.name} readOnly={readOnly} onChange={(e) => setTpl({ name: e.target.value })} />
                  </label>
                  {!readOnly && draft.kind === "standard" && <div className="flex items-center gap-1">
                    <IconButton label={tn(locale, "moveUp")} onClick={() => setDraft(moveTemplate(draft, tpl.ord, -1))}><ArrowUp className="h-4 w-4" /></IconButton>
                    <IconButton label={tn(locale, "moveDown")} onClick={() => setDraft(moveTemplate(draft, tpl.ord, 1))}><ArrowDown className="h-4 w-4" /></IconButton>
                    <IconButton label={tn(locale, "delete")} disabled={draft.templates.length <= 1} className="hover:text-danger disabled:opacity-30"
                      onClick={() => ask(tn(locale, "removeTemplateQ", { name: tpl.name }), () => { setDraft((cur) => removeTemplate(cur, tpl.ord)); setTplOrd(draft.templates.find((x) => x.ord !== tpl.ord)?.ord ?? 0); })}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>}
                </div>
                <TemplateArea label={tn(locale, "frontTpl")} value={tpl.front} onChange={(v) => setTpl({ front: v })} fields={fieldNames} readOnly={readOnly} testId="nt-front" />
                <TemplateArea label={tn(locale, "backTpl")} value={tpl.back} onChange={(v) => setTpl({ back: v })} fields={fieldNames} readOnly={readOnly} testId="nt-back" />
                <p className="text-xs leading-relaxed text-faint">{tn(locale, "tplHelp")}</p>
              </>}
            </> : <>
              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-sub">{tn(locale, "css")}</span>
                <Textarea rows={16} value={draft.css} readOnly={readOnly} spellCheck={false} onChange={(e) => setDraft({ ...draft, css: e.target.value })} className="font-mono text-[13px] leading-relaxed" data-testid="nt-css" />
                <p className="mt-1.5 text-xs leading-relaxed text-faint">{tn(locale, "cssHelp")}</p>
              </div>
              <div>
                {readOnly ? <p className="text-[13px] text-sub">{tn(locale, "markdownFields")}: {draft.markdown ? "✓" : "—"}</p>
                  : <Toggle checked={draft.markdown} onChange={(v) => setDraft({ ...draft, markdown: v })} label={tn(locale, "markdownFields")} />}
                <p className="mt-1 text-xs text-faint">{tn(locale, "markdownHint")}</p>
              </div>
            </>}
          </Card>
          <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">{preview}</div>
        </div>
      )}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={t("confirm")}
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>{t("cancel")}</Button><Button variant="danger" onClick={() => { confirm?.run(); setConfirm(null); }}>{t("confirm")}</Button></>}>
        <p className="text-[13.5px] leading-relaxed text-sub">{confirm?.text}</p>
      </Modal>
    </div>
  );
}
