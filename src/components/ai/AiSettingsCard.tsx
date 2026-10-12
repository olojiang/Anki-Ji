"use client";
/** Settings page section: bring-your-own-key AI provider. The stored key is never sent back — only its last 4 chars. */
import { useEffect, useState } from "react";
import { Sparkles, ExternalLink, PlugZap, Trash2, KeyRound } from "lucide-react";
import { useApp } from "@/components/providers";
import { Button, Card, CardHeader, Field, IconChip, Input, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { aiErrorMessage, ta } from "@/lib/i18n-ai";
import { AI_PROVIDERS, providerPreset } from "@/core/ai/providers";

export interface AiSettingsView { configured: boolean; provider: string; baseUrl: string; model: string; hasKey: boolean; keyLast4: string; keyRequired: boolean; updatedAt: string | null }

export function AiSettingsCard() {
  const { t, locale, err, toast } = useApp();
  const T = (k: string, v?: Record<string, string | number>) => ta(locale, k, v);
  const fail = (e: unknown) => { const m = aiErrorMessage(locale, e); if (m) toast(m, "error"); else err(e); };
  const [s, setS] = useState<AiSettingsView | null>(null);
  const [form, setForm] = useState({ provider: "openai", baseUrl: "", model: "", apiKey: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const load = (v: AiSettingsView) => {
    setS(v);
    const p = v.configured ? v.provider : "openai";
    const pre = providerPreset(p);
    setForm({ provider: p, baseUrl: v.configured ? v.baseUrl : pre.baseUrl, model: v.configured ? v.model : pre.model, apiKey: "" });
  };
  useEffect(() => { api<AiSettingsView>("/api/ai/settings").then(load).catch(err); }, [err]);
  if (!s) return <Card className="flex justify-center p-8"><Spinner /></Card>;
  const pre = providerPreset(form.provider);
  const pick = (id: string) => { const p = providerPreset(id); setForm({ ...form, provider: id, baseUrl: p.baseUrl, model: p.model }); };
  const save = async () => {
    setBusy("save");
    try { load(await api<AiSettingsView>("/api/ai/settings", { method: "PUT", body: { ...form, apiKey: form.apiKey || undefined } })); toast(t("saved")); }
    catch (e) { fail(e); } finally { setBusy(null); }
  };
  const test = async () => {
    setBusy("test");
    try {
      if (form.apiKey || form.provider !== s.provider || form.baseUrl !== s.baseUrl || form.model !== s.model) load(await api<AiSettingsView>("/api/ai/settings", { method: "PUT", body: { ...form, apiKey: form.apiKey || undefined } }));
      const r = await api<{ model: string }>("/api/ai/test", { body: {} });
      toast(T("aiTestOk", { model: r.model }));
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const removeKey = async () => {
    setBusy("rm");
    try { load(await api<AiSettingsView>("/api/ai/settings", { method: "PUT", body: { provider: s.provider, baseUrl: s.baseUrl, model: s.model, clearKey: true } })); } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const reset = async () => { setBusy("reset"); try { load(await api<AiSettingsView>("/api/ai/settings", { method: "DELETE" })); } catch (e) { fail(e); } finally { setBusy(null); } };
  const sameProvider = s.configured && s.provider === form.provider;
  return (
    <Card className="space-y-5 p-5" >
      <CardHeader icon={<IconChip tone="primary"><Sparkles /></IconChip>} title={T("aiSettingsTitle")} description={T("aiSettingsDesc")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={T("aiProvider")}>
          <Select className="w-full" value={form.provider} onChange={(e) => pick(e.target.value)} data-testid="ai-provider">
            {AI_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label={T("aiModel")}><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={pre.model || "model-name"} data-testid="ai-model" /></Field>
        <Field label={T("aiBaseUrl")} className="sm:col-span-2"><Input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder={pre.baseUrl || "https://…/v1"} inputMode="url" autoCapitalize="off" spellCheck={false} data-testid="ai-base-url" /></Field>
        <Field className="sm:col-span-2" label={<span className="inline-flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" />{T("aiKey")}</span>}
          hint={<>{sameProvider && s.hasKey ? T("aiKeySaved", { last4: s.keyLast4 }) : pre.keyRequired ? T("aiKeyNone") : T("aiKeyOptional")}{pre.keyUrl && <> · <a href={pre.keyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary-strong underline-offset-2 hover:underline">{T("aiGetKey")}<ExternalLink className="h-3 w-3" /></a></>}</>}>
          <Input type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={sameProvider && s.hasKey ? `••••••••${s.keyLast4}` : T("aiKeyPh")} data-testid="ai-key" />
        </Field>
      </div>
      {form.provider === "ollama" && <p className="rounded-lg border border-border bg-subtle px-3 py-2 text-xs leading-relaxed text-sub">{T("aiOllamaHint")}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {s.configured && <Button variant="ghost" size="sm" loading={busy === "reset"} onClick={reset}>{T("aiReset")}</Button>}
        {s.hasKey && <Button variant="ghost" size="sm" loading={busy === "rm"} onClick={removeKey}><Trash2 className="h-3.5 w-3.5" />{T("aiRemoveKey")}</Button>}
        <Button loading={busy === "test"} disabled={!!busy} onClick={test}><PlugZap className="h-4 w-4" />{T("aiTest")}</Button>
        <Button variant="primary" loading={busy === "save"} disabled={!!busy} onClick={save} data-testid="ai-save">{T("aiSave")}</Button>
      </div>
    </Card>
  );
}
