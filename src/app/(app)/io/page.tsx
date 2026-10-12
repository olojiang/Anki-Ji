"use client";
import { useState } from "react";
import { Download, Upload, FileJson, FileSpreadsheet, Package, Loader2, CheckCircle2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { download } from "@/lib/api";
import { buildFullBackup, fileToImport, importBackup, withExisting } from "@/lib/transfer";
import { Button, Card, Field, Input, PageHeader, Toggle } from "@/components/ui";
import type { ParsedImport } from "@/core/io/registry";
import { FILE_ACCEPT, FILE_HINT, SELF_DECKED } from "@/core/io/formats";
import { ImportPreview } from "@/components/io/ImportPreview";
import { PasteImport } from "@/components/io/PasteImport";
import { ti, importErrorMessage } from "@/lib/i18n-import";

export default function IOPage() {
  const { t, err, toast, locale } = useApp();
  const fail = (e: unknown) => { const m = importErrorMessage(locale, e); if (m) toast(m, "error"); else err(e); };
  const [withMedia, setWithMedia] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [defaultDeck, setDefaultDeck] = useState("Default");
  const [parsedDeck, setParsedDeck] = useState("");
  const [deckTouched, setDeckTouched] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const stamp = () => new Date().toISOString().slice(0, 10);

  const exportJson = async () => {
    setBusy("json");
    try {
      const b = await buildFullBackup(withMedia, (m) => setStatus(t(m.key, m.vars)));
      download(`anki-ji-backup-${stamp()}.json`, JSON.stringify(b));
    } catch (e) { err(e); } finally { setBusy(null); setStatus(""); }
  };
  const exportTable = async (fmt: "csv" | "tsv") => {
    setBusy(fmt);
    try {
      const res = await fetch(`/api/export?format=${fmt}`);
      download(`anki-ji-notes-${stamp()}.${fmt}`, await res.blob());
    } catch (e) { err(e); } finally { setBusy(null); }
  };
  const choose = async (f: File | null) => {
    setFile(f); setParsed(null); setResult(null);
    if (!f) return;
    setStatus(t("parsing"));
    const deck = deckTouched ? defaultDeck : f.name.replace(/\.[^.]+$/, "") || "Default";
    setDefaultDeck(deck);
    try { setParsed(await withExisting(await fileToImport(f, { defaultDeck: deck }))); setParsedDeck(deck); } catch (e) { fail(e); setFile(null); } finally { setStatus(""); }
  };
  const reparse = async () => {
    if (!file || !parsed || parsedDeck === defaultDeck) return;
    try { setParsed(await withExisting(await fileToImport(file, { defaultDeck }))); setParsedDeck(defaultDeck); } catch (e) { fail(e); }
  };
  const run = async () => {
    if (!file) return;
    setBusy("import"); setResult(null);
    try {
      const p = parsed && parsedDeck === defaultDeck ? parsed : await fileToImport(file, { defaultDeck });
      const r = await importBackup(p.backup, (m) => setStatus(t(m.key === "importing" ? "importing" : m.key, m.vars)));
      setResult(t("importDone", { notes: r.notes, cards: r.cards, skipped: r.skipped }));
    } catch (e) { fail(e); } finally { setBusy(null); setStatus(""); }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title={t("ioTitle")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold"><Download className="h-4 w-4 text-primary" />{t("exportTitle")}</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-start gap-3">
                <FileJson className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{t("exportJson")}</div>
                  <p className="mt-1 text-xs leading-relaxed text-sub">{t("exportJsonDesc")}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <Toggle checked={withMedia} onChange={setWithMedia} label={<span className="text-xs text-sub">{t("includeMedia")}</span>} />
                    <Button size="sm" variant="primary" loading={busy === "json"} onClick={exportJson}><Download className="h-3.5 w-3.5" />JSON</Button>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-easy" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">CSV / TSV</div>
                  <p className="mt-1 text-xs leading-relaxed text-sub">{t("exportCsvDesc")}</p>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" loading={busy === "csv"} onClick={() => exportTable("csv")}>CSV</Button>
                    <Button size="sm" loading={busy === "tsv"} onClick={() => exportTable("tsv")}>TSV</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><Upload className="h-4 w-4 text-primary" />{t("importTitle")}</h2>
          <p className="mb-4 text-xs text-sub">{ti(locale, "importDescAll")}</p>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files[0] ?? null); }}>
            <Package className="mb-2 h-7 w-7 text-faint" />
            <span className="text-sm font-medium">{file ? file.name : t("chooseFile")}</span>
            <span className="mt-1 text-xs text-faint">{FILE_HINT}</span>
            <input type="file" className="hidden" accept={FILE_ACCEPT} onChange={(e) => choose(e.target.files?.[0] ?? null)} />
          </label>
          {parsed && <ImportPreview preview={parsed.preview} />}
          {parsed && !SELF_DECKED.includes(parsed.format) && <Field className="mt-3" label={ti(locale, "rootDeck")} hint={parsed.format === "csv" ? t("csvFormat") : ti(locale, "rootDeckHint")}><Input value={defaultDeck} onChange={(e) => { setDefaultDeck(e.target.value); setDeckTouched(true); }} onBlur={reparse} /></Field>}
          {file && /\.apkg$/i.test(file.name) && <p className="mt-3 text-xs text-faint">{t("apkgNote")}</p>}
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xs text-sub">{status && <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />{status}</span>}</span>
            <Button variant="primary" disabled={!file || !!busy} loading={busy === "import"} onClick={run}><Upload className="h-4 w-4" />{t("startImport")}</Button>
          </div>
          {result && <p className="mt-3 flex items-center gap-2 rounded-lg bg-easy/10 px-3 py-2 text-sm text-easy"><CheckCircle2 className="h-4 w-4" />{result}</p>}
        </Card>
      </div>
      <PasteImport className="mt-4" />
    </div>
  );
}
