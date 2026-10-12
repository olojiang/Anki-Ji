"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, LayoutTemplate, Lock, Plus } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Button, Card, Field, IconChip, Input, Modal, PageHeader, Select, Spinner, cx } from "@/components/ui";
import { NoteTypeEditor } from "@/components/notetypes/NoteTypeEditor";
import { blankNoteType, type NoteTypeDef } from "@/core/notetypes";
import { noteTypeErrorMessage, tn } from "@/lib/i18n-notetypes";

type Id = number | string;

export default function NoteTypesPage() {
  const { locale, toast, err } = useApp();
  const [list, setList] = useState<NoteTypeDef[] | null>(null);
  const [sel, setSel] = useState<Id | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [base, setBase] = useState("stock:basic");
  const [del, setDel] = useState<NoteTypeDef | null>(null);
  const fail = useCallback((e: unknown) => { const m = noteTypeErrorMessage(locale, e); if (m) toast(m, "error"); else err(e); }, [locale, toast, err]);

  const load = useCallback(async (select?: Id) => {
    const r = await api<{ noteTypes: NoteTypeDef[] }>("/api/notetypes");
    setList(r.noteTypes);
    if (select != null) setSel(select);
    return r.noteTypes;
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("id");
    load(q ? (q.startsWith("stock:") ? q : Number(q)) : undefined).then((l) => {
      if (!q && window.matchMedia("(min-width: 1024px)").matches) setSel(l.find((x) => !x.readOnly)?.id ?? l[0]?.id ?? null);
    }).catch(fail);
  }, [load, fail]);
  useEffect(() => {
    if (sel == null) return;
    const u = new URL(window.location.href);
    u.searchParams.set("id", String(sel));
    window.history.replaceState(null, "", u.toString());
  }, [sel]);

  const current = list?.find((x) => x.id === sel) ?? null;
  const stock = list?.filter((x) => x.readOnly) ?? [];
  const custom = list?.filter((x) => !x.readOnly) ?? [];

  const create = async () => {
    try {
      const name = newName.trim() || tn(locale, "newType");
      const r = base.startsWith("blank:")
        ? await api<{ noteType: NoteTypeDef }>("/api/notetypes", { body: { noteType: blankNoteType(name, base === "blank:cloze" ? "cloze" : "standard") } })
        : await api<{ noteType: NoteTypeDef }>("/api/notetypes", { body: { cloneOf: base.startsWith("stock:") ? base : Number(base), name } });
      setCreating(false); setNewName("");
      await load(r.noteType.id);
    } catch (e) { fail(e); }
  };
  const openClone = (src: NoteTypeDef) => { setBase(String(src.id)); setNewName(`${src.name} ${locale === "en" ? "copy" : "副本"}`); setCreating(true); };
  const save = async (nt: NoteTypeDef) => {
    setSaving(true);
    try {
      const r = await api<{ noteType: NoteTypeDef; added: number; removed: number }>(`/api/notetypes/${nt.id}`, { method: "PUT", body: { noteType: nt } });
      toast(r.added || r.removed ? tn(locale, "savedCards", { a: r.added, r: r.removed }) : tn(locale, "saved"));
      await load(nt.id);
    } catch (e) { fail(e); throw e; } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!del) return;
    try { await api(`/api/notetypes/${del.id}`, { method: "DELETE" }); setDel(null); setSel(null); await load(); } catch (e) { fail(e); }
  };

  const item = (nt: NoteTypeDef) => (
    <button key={String(nt.id)} type="button" onClick={() => setSel(nt.id)} data-testid="nt-item"
      className={cx("group flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors", nt.id === sel ? "bg-primary/[0.08] ring-1 ring-primary/30" : "hover:bg-muted")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-[14px] font-medium text-fg">{nt.readOnly && <Lock className="h-3 w-3 shrink-0 text-faint" />}<span className="truncate">{nt.name}</span></div>
        <div className="mt-0.5 truncate text-xs text-faint">
          {tn(locale, nt.kind === "cloze" ? "kindCloze" : "kindStandard")} · {tn(locale, "fieldsN", { n: nt.fields.length })} · {tn(locale, "cardsN", { n: nt.templates.length })} · {tn(locale, "notesN", { n: nt.noteCount ?? 0 })}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-faint lg:hidden" />
    </button>
  );

  if (!list) return <div className="flex justify-center py-24"><Spinner /></div>;
  return (
    <div>
      <PageHeader title={tn(locale, "title")} subtitle={tn(locale, "subtitle")}
        actions={<Button variant="primary" onClick={() => { setBase("stock:basic"); setNewName(""); setCreating(true); }} data-testid="nt-new"><Plus className="h-4 w-4" />{tn(locale, "newType")}</Button>} />
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className={cx("space-y-4", current && "max-lg:hidden")}>
          <Card className="p-2">
            <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-faint">{tn(locale, "custom")}</div>
            {custom.length ? custom.map(item) : (
              <button type="button" onClick={() => setCreating(true)} className="m-1 flex min-h-11 w-[calc(100%-0.5rem)] items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong text-[13px] text-sub hover:text-fg">
                <Plus className="h-4 w-4" />{tn(locale, "newType")}
              </button>
            )}
          </Card>
          <Card className="p-2">
            <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-faint">{tn(locale, "builtIn")}</div>
            {stock.map(item)}
          </Card>
        </div>
        <div className={cx("min-w-0", !current && "max-lg:hidden")}>
          {current ? <>
            <Button variant="ghost" size="sm" className="mb-3 lg:hidden" onClick={() => setSel(null)}><ArrowLeft className="h-4 w-4" />{tn(locale, "back")}</Button>
            <NoteTypeEditor value={current} saving={saving} onSave={save} onClone={() => openClone(current)}
              onDelete={() => setDel(current)} />
          </> : (
            <Card className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <IconChip tone="neutral" size="lg" className="mb-3"><LayoutTemplate /></IconChip>
              <p className="text-[13.5px] text-sub">{tn(locale, "selectType")}</p>
            </Card>
          )}
        </div>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title={tn(locale, "newType")}
        footer={<><Button variant="ghost" onClick={() => setCreating(false)}>{locale === "en" ? "Cancel" : "取消"}</Button><Button variant="primary" onClick={create} data-testid="nt-create">{locale === "en" ? "Create" : "创建"}</Button></>}>
        <div className="space-y-4">
          <Field label={tn(locale, "name")}><Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} data-testid="nt-create-name" /></Field>
          <Field label={tn(locale, "basedOn")}>
            <Select className="w-full" value={base} onChange={(e) => setBase(e.target.value)} data-testid="nt-create-base">
              <optgroup label={tn(locale, "builtIn")}>
                {stock.filter((s) => s.clonable).map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                <option value="blank:standard">{tn(locale, "blankStandard")}</option>
                <option value="blank:cloze">{tn(locale, "blankCloze")}</option>
              </optgroup>
              {custom.length > 0 && <optgroup label={tn(locale, "custom")}>{custom.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}</optgroup>}
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} title={tn(locale, "delete")}
        footer={<><Button variant="ghost" onClick={() => setDel(null)}>{locale === "en" ? "Cancel" : "取消"}</Button><Button variant="danger" disabled={(del?.noteCount ?? 0) > 0} onClick={remove}>{tn(locale, "delete")}</Button></>}>
        <p className="text-[13.5px] text-sub">{del && ((del.noteCount ?? 0) > 0 ? tn(locale, "deleteInUse", { n: del.noteCount ?? 0 }) : tn(locale, "deleteQ", { name: del.name }))}</p>
      </Modal>
    </div>
  );
}
