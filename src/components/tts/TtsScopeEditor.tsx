"use client";
/** Load / auto-save one TTS scope. Non-default scopes can be switched off to inherit. */
import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { ta } from "@/lib/i18n-ai";
import { defaultTtsOptions, normalizeTtsOptions, type TtsOptions } from "@/core/tts";
import { TtsOptionsForm } from "./TtsOptionsForm";
import { loadTtsSettings } from "./StudyVoice";

export function TtsScopeEditor({ scope, fallback }: { scope: string; fallback?: TtsOptions }) {
  const { locale, err } = useApp();
  const T = (k: string) => ta(locale, k);
  const [opts, setOpts] = useState<TtsOptions | null>(null);
  const [custom, setCustom] = useState(scope === "default");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let live = true;
    loadTtsSettings(true).then((d) => {
      if (!live) return;
      const s = d.scopes[scope];
      setCustom(scope === "default" || !!s);
      setOpts(s ? normalizeTtsOptions(s) : fallback ?? normalizeTtsOptions(d.scopes.default ?? defaultTtsOptions()));
    });
    return () => { live = false; };
  }, [scope, fallback]);
  const persist = (o: TtsOptions | null) => {
    if (timer.current) clearTimeout(timer.current);
    setState("saving");
    timer.current = setTimeout(async () => {
      try { await api("/api/tts/settings", { method: "PUT", body: { scope, opts: o } }); loadTtsSettings(true); setState("saved"); }
      catch (e) { err(e); setState("idle"); }
    }, 500);
  };
  if (!opts) return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-faint" /></div>;
  return (
    <div className="space-y-3">
      <div className="flex min-h-6 items-center justify-between gap-3">
        {scope !== "default" ? <Toggle checked={custom} onChange={(v) => { setCustom(v); persist(v ? opts : null); }} label={T("ttsCustom")} /> : <span />}
        <span className="inline-flex items-center gap-1 text-[11.5px] text-faint" aria-live="polite">
          {state === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}{state === "saved" && <><Check className="h-3 w-3 text-success" />{T("ttsSaved")}</>}
        </span>
      </div>
      {custom ? <TtsOptionsForm value={opts} onChange={(o) => { setOpts(o); persist(o); }} /> : <p className="text-xs leading-relaxed text-faint">{T("ttsInherit")}</p>}
    </div>
  );
}
