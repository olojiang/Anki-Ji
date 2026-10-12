"use client";
import { useState } from "react";
import { ClipboardPaste, Upload, CheckCircle2, Eye, Loader2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { Button, Card, CardHeader, Field, IconChip, Input, Select, Textarea, cx } from "@/components/ui";
import { importBackup, textToImport, withExisting } from "@/lib/transfer";
import { ti, importErrorMessage } from "@/lib/i18n-import";
import { PASTE_FORMATS, type PasteFormat } from "@/core/io/formats";
import type { ParsedImport } from "@/core/io/registry";
import { ImportPreview, PREVIEW_SLOT, PreviewPlaceholder } from "./ImportPreview";

/** Paste text → pick a preset (smart, Quizlet, SuperMemo, Markdown, RemNote, CSV) → preview → import. */
export function PasteImport({ className }: { className?: string }) {
  const { t, err, toast, locale } = useApp();
  const T = (k: string, v?: Record<string, string | number>) => ti(locale, k, v);
  const [format, setFormat] = useState<PasteFormat>("smart");
  const [text, setText] = useState("");
  const [deck, setDeck] = useState("Default");
  const [termSep, setTermSep] = useState("tab");
  const [termCustom, setTermCustom] = useState(" - ");
  const [rowSep, setRowSep] = useState("newline");
  const [rowCustom, setRowCustom] = useState("\\n\\n");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const fail = (e: unknown) => { const m = importErrorMessage(locale, e); if (m) toast(m, "error"); else err(e); };

  const parse = async () => {
    const p = await textToImport(format, text, { defaultDeck: deck, quizlet: { termSep: termSep === "custom" ? termCustom : termSep, rowSep: rowSep === "custom" ? rowCustom : rowSep } });
    if (!p.backup.notes.length) throw new Error("nothing");
    return p;
  };
  const preview = async () => {
    setBusy("preview"); setResult(null);
    try { setParsed(await withExisting(await parse())); } catch (e) { setParsed(null); fail(e); } finally { setBusy(null); }
  };
  const run = async () => {
    setBusy("import"); setResult(null);
    try {
      const p = await parse();
      const r = await importBackup(p.backup, (m) => setStatus(t(m.key, m.vars)));
      setResult(t("importDone", { notes: r.notes, cards: r.cards, skipped: r.skipped }));
      setParsed(null);
    } catch (e) { fail(e); } finally { setBusy(null); setStatus(""); }
  };
  const changed = (fn: () => void) => { fn(); setParsed(null); };

  return (
    <Card className={cx("p-5", className)}>
      <CardHeader className="mb-5" icon={<IconChip tone="teal"><ClipboardPaste /></IconChip>} title={T("pasteTitle")} description={T("pasteDesc")} />
      <div className="xl:grid xl:grid-cols-2 xl:content-start xl:gap-x-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={T("pasteFormat")}>
          <Select className="w-full" value={format} onChange={(e) => changed(() => setFormat(e.target.value as PasteFormat))}>
            {PASTE_FORMATS.map((f) => <option key={f} value={f}>{T(`fmt_${f}`)}</option>)}
          </Select>
        </Field>
        <Field label={T("rootDeck")}><Input value={deck} onChange={(e) => changed(() => setDeck(e.target.value))} /></Field>
        {format === "quizlet" && (
          <>
            <Field label={T("termSep")}>
              <div className="flex min-w-0 gap-2">
                <Select className="min-w-0 flex-1" value={termSep} onChange={(e) => changed(() => setTermSep(e.target.value))}><option value="tab">{T("sepTab")}</option><option value="comma">{T("sepComma")}</option><option value="custom">{T("sepCustom")}</option></Select>
                {termSep === "custom" && <Input className="flex-1" value={termCustom} onChange={(e) => changed(() => setTermCustom(e.target.value))} />}
              </div>
            </Field>
            <Field label={T("rowSep")}>
              <div className="flex min-w-0 gap-2">
                <Select className="min-w-0 flex-1" value={rowSep} onChange={(e) => changed(() => setRowSep(e.target.value))}><option value="newline">{T("sepNewline")}</option><option value="semicolon">{T("sepSemicolon")}</option><option value="custom">{T("sepCustom")}</option></Select>
                {rowSep === "custom" && <Input className="flex-1" value={rowCustom} onChange={(e) => changed(() => setRowCustom(e.target.value))} />}
              </div>
            </Field>
          </>
        )}
      </div>
      <div className="mt-3">
        <Textarea rows={8} value={text} placeholder={T("pastePh")} onChange={(e) => changed(() => setText(e.target.value))} className="font-mono text-[13px]" />
        {format === "smart" && <p className="mt-1.5 text-xs leading-relaxed text-faint">{T("smartHint")}</p>}
      </div>
      {parsed ? <ImportPreview preview={parsed.preview} className={PREVIEW_SLOT} /> : <PreviewPlaceholder label={T("previewTitle")} />}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-sub">{status && <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />{status}</span>}</span>
        <div className="ml-auto flex gap-2">
          <Button disabled={!text.trim() || !!busy} loading={busy === "preview"} onClick={preview}><Eye className="h-4 w-4" />{T("preview")}</Button>
          <Button variant="primary" disabled={!parsed || !!busy} loading={busy === "import"} onClick={run}><Upload className="h-4 w-4" />{t("startImport")}</Button>
        </div>
      </div>
      {result && <p className="mt-3 flex animate-rise-in items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-[13.5px] text-success"><CheckCircle2 className="h-4 w-4" />{result}</p>}
      </div>
    </Card>
  );
}
