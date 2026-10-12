"use client";
/**
 * AI card generation: source (text / PDF·TXT·MD / URL) → options → chunked LLM calls → tick & edit →
 * the shared ImportDraft → draftToBackup → ImportPreview → importBackup pipeline used by every importer.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, FileText, Link2, ClipboardPaste, Upload, Loader2, Square, CheckCircle2, Wand2, Settings2, ListChecks, AlertTriangle } from "lucide-react";
import { useApp } from "@/components/providers";
import { Button, Card, CardHeader, Field, IconChip, Input, PageHeader, Segmented, Textarea, Toggle } from "@/components/ui";
import { ImportPreview } from "@/components/io/ImportPreview";
import { api, ApiError } from "@/lib/api";
import { importBackup } from "@/lib/transfer";
import { aiErrorMessage, ta } from "@/lib/i18n-ai";
import { deckPath } from "@/core/tree";
import { chunkText, distributeCount } from "@/core/ai/chunk";
import { aiCardsToDraft } from "@/core/ai/draft";
import { MAX_CARDS_PER_REQUEST, type AiCard, type CardStyle } from "@/core/ai/types";
import { draftToBackup, previewImport } from "@/core/io/draft";
import type { DeckDTO } from "@/lib/types";
import { AiCardReview, itemValid, type ReviewItem } from "./AiCardReview";
import type { AiSettingsView } from "./AiSettingsCard";

type Source = "text" | "file" | "url";
const LANGS = ["auto", "中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español", "Русский"];
const FATAL = new Set(["ai_not_configured", "ai_key_required", "ai_bad_key", "ai_quota", "ai_model_not_found", "ai_unreachable", "ai_bad_request", "ai_key_unreadable", "unauthorized", "url_not_allowed"]);
const keyOf = (c: AiCard) => (c.kind === "qa" ? c.front : c.text).toLowerCase().replace(/\s+/g, " ").trim();

export function AiGenerator() {
  const { t, locale, err, toast } = useApp();
  const T = (k: string, v?: Record<string, string | number>) => ta(locale, k, v);
  const msg = (e: unknown) => aiErrorMessage(locale, e) ?? (e instanceof Error ? e.message : String(e));
  const fail = (e: unknown) => { const m = aiErrorMessage(locale, e); if (m) toast(m, "error"); else err(e); };

  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const [decks, setDecks] = useState<DeckDTO[]>([]);
  const [source, setSource] = useState<Source>("text");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [style, setStyle] = useState<CardStyle>("mixed");
  const [count, setCount] = useState(15);
  const [language, setLanguage] = useState("auto");
  const [deck, setDeck] = useState("AI");
  const [tags, setTags] = useState("ai");
  const [reverse, setReverse] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const stopRef = useRef(false);
  const nextId = useRef(1);

  useEffect(() => {
    api<AiSettingsView>("/api/ai/settings").then(setSettings).catch(() => setSettings(null));
    api<{ decks: DeckDTO[] }>("/api/decks").then((r) => setDecks(r.decks)).catch(() => {});
  }, []);
  const deckPaths = useMemo(() => decks.filter((d) => !d.filtered && !d.deletedAt).map((d) => deckPath(decks, d.id)).sort((a, b) => a.localeCompare(b)), [decks]);
  const chunks = useMemo(() => chunkText(text), [text]);
  const maxCount = Math.max(1, Math.min(200, chunks.length * MAX_CARDS_PER_REQUEST));

  const extract = async (input: { file?: File; url?: string }) => {
    setExtracting(true); setResult(null);
    try {
      let r: { title?: string; text: string };
      if (input.file) {
        if (input.file.size > 4 * 1024 * 1024) throw new Error("source_too_large");
        if (/\.(txt|md|markdown)$/i.test(input.file.name)) r = { title: input.file.name.replace(/\.[^.]+$/, ""), text: (await input.file.text()).replace(/^\uFEFF/, "") };
        else {
          const fd = new FormData(); fd.append("file", input.file, input.file.name);
          const res = await fetch("/api/ai/extract", { method: "POST", body: fd, credentials: "same-origin" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new ApiError(res.status, data.error ?? "error");
          r = data;
        }
      } else {
        r = await api<{ title: string; text: string }>("/api/ai/extract", { body: { url: input.url } });
      }
      setText(r.text); setTitle(r.title ?? "");
      if (r.title && (deck === "AI" || !deck)) setDeck(`AI::${r.title.replace(/::/g, " ").slice(0, 60)}`);
    } catch (e) { fail(e); } finally { setExtracting(false); }
  };

  const callPart = async (chunk: string, n: number, index: number, total: number): Promise<{ cards: AiCard[]; warnings: string[] }> => {
    const body = { text: chunk, style, count: n, language, title: title || undefined, instructions: instructions || undefined, part: { index, total } };
    for (let attempt = 0; ; attempt++) {
      try { return await api<{ cards: AiCard[]; warnings: string[] }>("/api/ai/generate", { body }); }
      catch (e) {
        if (e instanceof ApiError && e.code === "ai_rate_limited" && attempt < 3 && !stopRef.current) {
          const s = [4, 10, 20][attempt];
          for (let k = s; k > 0 && !stopRef.current; k--) { setStatus(T("retrying", { s: k })); await new Promise((r) => setTimeout(r, 1000)); }
          continue;
        }
        throw e;
      }
    }
  };

  const generate = async () => {
    if (!chunks.length) return;
    setRunning(true); setResult(null); setWarnings([]); stopRef.current = false;
    const counts = distributeCount(Math.min(count, maxCount), chunks.map((c) => c.length)).map((n) => Math.min(n, MAX_CARDS_PER_REQUEST));
    const jobs = chunks.map((c, i) => ({ c, n: counts[i], i })).filter((j) => j.n > 0);
    const seen = new Set(items.map((x) => keyOf(x.card)));
    const warn: string[] = [];
    try {
      for (const [k, j] of jobs.entries()) {
        if (stopRef.current) break;
        setStatus(T("generating", { i: k + 1, n: jobs.length }));
        try {
          const r = await callPart(j.c, j.n, j.i + 1, chunks.length);
          const fresh = r.cards.filter((c) => { const key = keyOf(c); if (seen.has(key)) return false; seen.add(key); return true; });
          setItems((prev) => [...prev, ...fresh.map((card) => ({ id: nextId.current++, card, selected: true }))]);
          warn.push(...r.warnings.map((w) => (jobs.length > 1 ? `[${j.i + 1}] ${w}` : w)));
        } catch (e) {
          const code = e instanceof Error ? e.message : "";
          if (FATAL.has(code) || jobs.length === 1) throw e;
          warn.push(T("partFailed", { i: j.i + 1, msg: msg(e) }));
        }
      }
    } catch (e) { fail(e); }
    finally { setWarnings(warn); setRunning(false); setStatus(""); }
  };

  const selected = items.filter((x) => x.selected && itemValid(x.card));
  const tagList = tags.split(/[\s,]+/).filter(Boolean);
  const parsed = useMemo(() => {
    if (!selected.length) return null;
    const draft = aiCardsToDraft(selected.map((x) => x.card), { deck: deck || "AI", tags: tagList, reverse });
    const { backup, duplicates } = draftToBackup(draft);
    return { backup, preview: previewImport(backup, { format: "ai", duplicates, warnings, samples: 6 }) };
  }, [items, deck, tags, reverse, warnings]);

  const runImport = async () => {
    if (!parsed) return;
    setImporting(true); setResult(null);
    try {
      const r = await importBackup(parsed.backup, (m) => setStatus(t(m.key, m.vars)));
      setResult(T("aiImportDone", { notes: r.notes, cards: r.cards, skipped: r.skipped }));
      setItems((prev) => prev.filter((x) => !x.selected || !itemValid(x.card)));
    } catch (e) { fail(e); } finally { setImporting(false); setStatus(""); }
  };

  const notReady = settings && !settings.configured;
  return (
    <div className="max-w-4xl xl:max-w-none">
      <PageHeader title={T("aiTitle")} subtitle={T("aiSubtitle")} />
      {notReady && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-warning/30 bg-warning/[0.05] p-4">
          <span className="inline-flex items-center gap-2 text-[13.5px] text-sub"><AlertTriangle className="h-4 w-4 text-warning" />{T("aiNotConfigured")}</span>
          <Link href="/settings#ai"><Button size="sm" variant="primary"><Settings2 className="h-3.5 w-3.5" />{T("aiGoSettings")}</Button></Link>
        </Card>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(380px,0.9fr)_minmax(0,1.1fr)] xl:gap-5">
        <Card className="p-5">
          <CardHeader className="mb-5" icon={<IconChip tone="primary"><Wand2 /></IconChip>} title={T("aiTitle")} description={settings?.configured ? `${settings.provider} · ${settings.model}` : undefined} />
          <Segmented<Source> value={source} onChange={setSource} className="w-full" options={[
            { value: "text", label: <span className="inline-flex items-center gap-1.5"><ClipboardPaste className="h-3.5 w-3.5" />{T("srcText")}</span> },
            { value: "file", label: <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{T("srcFile")}</span> },
            { value: "url", label: <span className="inline-flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" />{T("srcUrl")}</span> },
          ]} />
          {source === "file" && (
            <label className="group mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong px-4 py-7 text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.04]"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) extract({ file: f }); }}>
              {extracting ? <Loader2 className="mb-2 h-5 w-5 animate-spin text-primary" /> : <Upload className="mb-2 h-5 w-5 text-faint" />}
              <span className="text-sm font-medium">{extracting ? T("srcExtracting") : T("srcChoose")}</span>
              <span className="mt-1 text-[11.5px] leading-relaxed text-faint">{T("srcFileHint")}</span>
              <input type="file" className="hidden" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" onChange={(e) => { const f = e.target.files?.[0]; if (f) extract({ file: f }); e.target.value = ""; }} data-testid="ai-file" />
            </label>
          )}
          {source === "url" && (
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) extract({ url: url.trim() }); }}>
              <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={T("srcUrlPh")} data-testid="ai-url" />
              <Button type="submit" loading={extracting} disabled={!url.trim()}>{T("srcFetch")}</Button>
            </form>
          )}
          <div className="mt-3">
            {title && source !== "text" && <p className="mb-1.5 truncate text-xs text-sub">{T("srcExtracted", { title })}</p>}
            <Textarea rows={source === "text" ? 10 : 6} value={text} onChange={(e) => setText(e.target.value)} placeholder={T("srcTextPh")} className="text-[13.5px]" data-testid="ai-text" />
            <p className="num mt-1 text-[11.5px] text-faint">{T("srcChars", { n: text.length })}{chunks.length > 1 && <> · {T("srcParts", { n: chunks.length })}</>}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label={T("optStyle")} className="sm:col-span-2">
              <Segmented<CardStyle> value={style} onChange={setStyle} className="w-full" options={[{ value: "qa", label: T("styleQa") }, { value: "cloze", label: T("styleCloze") }, { value: "mixed", label: T("styleMixed") }]} />
            </Field>
            <Field label={T("optCount")}><Input type="number" min={1} max={maxCount} value={count} onChange={(e) => setCount(Math.max(1, Math.min(maxCount, Number(e.target.value) || 1)))} data-testid="ai-count" /></Field>
            <Field label={T("optLanguage")}>
              <Input list="ai-langs" value={language === "auto" ? "" : language} placeholder={T("langAuto")} onChange={(e) => setLanguage(e.target.value.trim() || "auto")} />
              <datalist id="ai-langs">{LANGS.filter((l) => l !== "auto").map((l) => <option key={l} value={l} />)}</datalist>
            </Field>
            <Field label={T("optDeck")}>
              <Input list="ai-decks" value={deck} onChange={(e) => setDeck(e.target.value)} data-testid="ai-deck" />
              <datalist id="ai-decks">{deckPaths.map((p) => <option key={p} value={p} />)}</datalist>
            </Field>
            <Field label={T("optTags")}><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tag1 tag2::sub" /></Field>
            <Field label={T("optInstructions")} className="sm:col-span-2"><Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={T("optInstructionsPh")} maxLength={500} /></Field>
            {style !== "cloze" && <div className="sm:col-span-2"><Toggle checked={reverse} onChange={setReverse} label={<span className="text-[13px]">{T("optReverse")}</span>} /></div>}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xs text-sub" aria-live="polite">{status && <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />{status}</span>}</span>
            <div className="ml-auto flex gap-2">
              {running && <Button onClick={() => { stopRef.current = true; }}><Square className="h-3.5 w-3.5 fill-current" />{T("stop")}</Button>}
              <Button variant="primary" loading={running} disabled={!chunks.length || running || extracting || !!notReady} onClick={generate} data-testid="ai-generate"><Sparkles className="h-4 w-4" />{T("generate")}</Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader className="mb-4" icon={<IconChip tone="amber"><ListChecks /></IconChip>} title={T("reviewTitle")} description={T("reviewDesc")}
            actions={items.length > 0 ? <span className="num whitespace-nowrap text-xs text-sub">{T("selected", { n: selected.length, total: items.length })}</span> : undefined} />
          {items.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-subtle/60 px-4 text-center text-xs text-faint">
              {running ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Sparkles className="h-5 w-5" />}{running ? status : T("aiSubtitle")}
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setItems(items.map((x) => ({ ...x, selected: true })))}>{T("selectAll")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setItems(items.map((x) => ({ ...x, selected: false })))}>{T("selectNone")}</Button>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setItems([]); setWarnings([]); }}>{T("discard")}</Button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto overscroll-contain pr-0.5 xl:max-h-[calc(100vh-26rem)]"><AiCardReview items={items} onChange={setItems} /></div>
            </>
          )}
          {parsed && <ImportPreview preview={parsed.preview} />}
          {!parsed && warnings.length > 0 && <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-sub">{warnings.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}</ul>}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <Button variant="primary" disabled={!parsed || importing || running} loading={importing} onClick={runImport} data-testid="ai-import"><Upload className="h-4 w-4" />{T("importSelected", { n: selected.length })}</Button>
          </div>
          {result && <p className="mt-3 flex animate-rise-in items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-[13.5px] text-success"><CheckCircle2 className="h-4 w-4 shrink-0" />{result}</p>}
        </Card>
      </div>
    </div>
  );
}
