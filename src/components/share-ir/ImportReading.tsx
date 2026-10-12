"use client";
/** Import an article for incremental reading: paste text/markdown or a URL fetched server-side. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Globe, Download } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Field, Input, Modal, Segmented, Textarea } from "../ui";
import { useSi } from "./useSi";
import type { ReadingItemDTO } from "./reading-shared";

export function PrioritySlider({ value, onChange, label, hint }: { value: number; onChange: (v: number) => void; label: string; hint?: string }) {
  return (
    <Field label={<span className="flex items-center justify-between gap-2"><span>{label}</span><span className="num text-fg">{value}</span></span>} hint={hint}>
      <input type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-11 w-full accent-primary sm:h-6" aria-label={label} />
    </Field>
  );
}

export function ImportReading({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, t, fail } = useSi();
  const router = useRouter();
  const [mode, setMode] = useState<"paste" | "url">("paste");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [priority, setPriority] = useState(50);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ item: ReadingItemDTO }>("/api/reading", { body: mode === "url" ? { url, title, priority } : { content, title, priority } });
      setTitle(""); setContent(""); setUrl("");
      onClose();
      router.push(`/reading/${r.item.id}`);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} wide title={s("importArticle")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} onClick={submit} disabled={mode === "url" ? !url.trim() : !content.trim()} data-testid="reading-import-submit"><Download className="h-4 w-4" />{busy && mode === "url" ? s("fetching") : s("importBtn")}</Button></>}>
      <div className="space-y-4">
        <Segmented value={mode} onChange={setMode} className="w-full sm:w-auto"
          options={[{ value: "paste", label: <span className="inline-flex items-center gap-1.5"><ClipboardPaste className="h-3.5 w-3.5" />{s("paste")}</span> }, { value: "url", label: <span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{s("fromUrl")}</span> }]} />
        <Field label={s("title")}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={s("titlePh")} maxLength={300} /></Field>
        {mode === "paste"
          ? <Field label={s("textLabel")}><Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} className="max-h-[45dvh] font-[inherit]" data-testid="reading-import-text" /></Field>
          : <Field label={s("urlLabel")} hint={s("urlHint")}><Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" onKeyDown={(e) => e.key === "Enter" && url.trim() && submit()} /></Field>}
        <PrioritySlider value={priority} onChange={setPriority} label={s("priority")} hint={s("priorityHint")} />
      </div>
    </Modal>
  );
}
