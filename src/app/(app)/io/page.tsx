"use client";
import { useState } from "react";
import { Download, Upload, FileJson, FileSpreadsheet, Package, Loader2, CheckCircle2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { download } from "@/lib/api";
import { buildFullBackup, fileToBackup, importBackup } from "@/lib/transfer";
import { Button, Card, CardHeader, Field, IconChip, Input, PageHeader, Toggle } from "@/components/ui";
import type { Backup } from "@/core/io/backup";

export default function IOPage() {
  const { t, err } = useApp();
  const [withMedia, setWithMedia] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{ backup: Backup; errors: number } | null>(null);
  const [defaultDeck, setDefaultDeck] = useState("Default");
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
    try { setParsed(await fileToBackup(f, defaultDeck)); } catch (e) { err(e); setFile(null); } finally { setStatus(""); }
  };
  const run = async () => {
    if (!file) return;
    setBusy("import"); setResult(null);
    try {
      const p = parsed && !/\.(csv|tsv|txt)$/i.test(file.name) ? parsed : await fileToBackup(file, defaultDeck);
      const r = await importBackup(p.backup, (m) => setStatus(t(m.key === "importing" ? "importing" : m.key, m.vars)));
      setResult(t("importDone", { notes: r.notes, cards: r.cards, skipped: r.skipped }));
    } catch (e) { err(e); } finally { setBusy(null); setStatus(""); }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title={t("ioTitle")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader className="mb-5" icon={<IconChip tone="sky"><Download /></IconChip>} title={t("exportTitle")} />
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-subtle p-4 transition-colors hover:border-border-strong">
              <div className="flex items-start gap-3">
                <IconChip tone="teal" size="sm" className="mt-0.5"><FileJson /></IconChip>
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
            <div className="rounded-xl border border-border bg-subtle p-4 transition-colors hover:border-border-strong">
              <div className="flex items-start gap-3">
                <IconChip tone="emerald" size="sm" className="mt-0.5"><FileSpreadsheet /></IconChip>
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
          <CardHeader className="mb-5" icon={<IconChip tone="amber"><Upload /></IconChip>} title={t("importTitle")} description={t("importDesc")} />
          <label className="group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border-strong px-4 py-10 text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.04]"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files[0] ?? null); }}>
            <IconChip tone="neutral" size="lg" className="mb-3 transition-transform group-hover:-translate-y-0.5"><Package /></IconChip>
            <span className="text-sm font-medium">{file ? file.name : t("chooseFile")}</span>
            <span className="num mt-1 text-[11.5px] text-faint">.json · .csv · .tsv · .txt · .apkg</span>
            <input type="file" className="hidden" accept=".json,.csv,.tsv,.txt,.apkg,.colpkg" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
          </label>
          {parsed && <p className="mt-3 text-xs text-sub">{t("detected", { notes: parsed.backup.notes.length, decks: parsed.backup.decks.length, media: parsed.backup.media.length })}{parsed.errors ? ` · ${parsed.errors} ⚠` : ""}</p>}
          {file && /\.(csv|tsv|txt)$/i.test(file.name) && <Field className="mt-3" label={t("defaultDeck")} hint={t("csvFormat")}><Input value={defaultDeck} onChange={(e) => setDefaultDeck(e.target.value)} /></Field>}
          {file && /\.apkg$/i.test(file.name) && <p className="mt-3 text-xs text-faint">{t("apkgNote")}</p>}
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xs text-sub">{status && <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />{status}</span>}</span>
            <Button variant="primary" disabled={!file || !!busy} loading={busy === "import"} onClick={run}><Upload className="h-4 w-4" />{t("startImport")}</Button>
          </div>
          {result && <p className="mt-3 flex animate-rise-in items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-[13.5px] text-success"><CheckCircle2 className="h-4 w-4" />{result}</p>}
        </Card>
      </div>
    </div>
  );
}
