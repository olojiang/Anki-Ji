"use client";
import { useState } from "react";
import { ClipboardPaste, Upload, CheckCircle2, Eye } from "lucide-react";
import { useApp } from "@/components/providers";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { importBackup, textToImport, withExisting } from "@/lib/transfer";
import { ti, importErrorMessage } from "@/lib/i18n-import";
import { PASTE_FORMATS, type PasteFormat } from "@/core/io/formats";
import type { ParsedImport } from "@/core/io/registry";
import { ImportPreview } from "./ImportPreview";

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
    <Card className={`p-5 ${className ?? ""}`}>
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><ClipboardPaste className="h-4 w-4 text-primary" />{T("pasteTitle")}</h2>
      <p className="mb-4 text-xs text-sub">{T("pasteDesc")}</p>
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
              <div className="flex gap-2">
                <Select value={termSep} onChange={(e) => changed(() => setTermSep(e.target.value))}><option value="tab">{T("sepTab")}</option><option value="comma">{T("sepComma")}</option><option value="custom">{T("sepCustom")}</option></Select>
                {termSep === "custom" && <Input value={termCustom} onChange={(e) => changed(() => setTermCustom(e.target.value))} />}
              </div>
            </Field>
            <Field label={T("rowSep")}>
              <div className="flex gap-2">
                <Select value={rowSep} onChange={(e) => changed(() => setRowSep(e.target.value))}><option value="newline">{T("sepNewline")}</option><option value="semicolon">{T("sepSemicolon")}</option><option value="custom">{T("sepCustom")}</option></Select>
                {rowSep === "custom" && <Input value={rowCustom} onChange={(e) => changed(() => setRowCustom(e.target.value))} />}
              </div>
            </Field>
          </>
        )}
      </div>
      <div className="mt-3">
        <Textarea rows={8} value={text} placeholder={T("pastePh")} onChange={(e) => changed(() => setText(e.target.value))} className="font-mono text-[13px]" />
        {format === "smart" && <p className="mt-1 text-xs text-faint">{T("smartHint")}</p>}
      </div>
      {parsed && <ImportPreview preview={parsed.preview} />}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-sub">{status}</span>
        <div className="flex gap-2">
          <Button disabled={!text.trim() || !!busy} loading={busy === "preview"} onClick={preview}><Eye className="h-4 w-4" />{T("preview")}</Button>
          <Button variant="primary" disabled={!parsed || !!busy} loading={busy === "import"} onClick={run}><Upload className="h-4 w-4" />{t("startImport")}</Button>
        </div>
      </div>
      {result && <p className="mt-3 flex items-center gap-2 rounded-lg bg-easy/10 px-3 py-2 text-sm text-easy"><CheckCircle2 className="h-4 w-4" />{result}</p>}
    </Card>
  );
}
