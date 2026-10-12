"use client";
import { Play } from "lucide-react";
import { useApp } from "@/components/providers";
import { Button, Field, Select, Toggle } from "@/components/ui";
import { ta } from "@/lib/i18n-ai";
import { langLabel, langOptions, speakSegments, useVoices } from "@/lib/tts";
import { detectLang, type TtsOptions } from "@/core/tts";

/** Toggles, language + voice pickers and rate for one TTS scope. */
export function TtsOptionsForm({ value: v, onChange }: { value: TtsOptions; onChange: (v: TtsOptions) => void }) {
  const { locale } = useApp();
  const T = (k: string, vars?: Record<string, string | number>) => ta(locale, k, vars);
  const voices = useVoices();
  const langs = langOptions(voices);
  const set = (p: Partial<TtsOptions>) => onChange({ ...v, ...p });
  const voicesFor = (lang: string) => (lang === "auto" ? voices : voices.filter((x) => x.lang.toLowerCase().replace(/_/g, "-").split("-")[0] === lang.split("-")[0].toLowerCase()));
  const preview = (side: "front" | "back") => {
    const lang = side === "front" ? v.frontLang : v.backLang;
    const sample = T("ttsSample");
    const l = lang === "auto" ? detectLang(sample) : lang;
    const text = l.startsWith("zh") ? "这是一段朗读示例。" : l.startsWith("ja") ? "これは読み上げのサンプルです。" : l.startsWith("ko") ? "이것은 읽기 예시입니다." : "This is a sample sentence.";
    speakSegments([{ text, lang: l }], { rate: v.rate, voiceURI: side === "front" ? v.frontVoice : v.backVoice });
  };
  const side = (s: "front" | "back") => {
    const lang = s === "front" ? v.frontLang : v.backLang;
    const voice = s === "front" ? v.frontVoice : v.backVoice;
    return (
      <div className="space-y-3 rounded-xl border border-border bg-subtle p-3">
        <Toggle checked={s === "front" ? v.autoFront : v.autoBack} onChange={(x) => set(s === "front" ? { autoFront: x } : { autoBack: x })} label={T(s === "front" ? "ttsAutoFront" : "ttsAutoBack")} />
        <Field label={T(s === "front" ? "ttsFrontLang" : "ttsBackLang")}>
          <Select className="w-full" value={lang} onChange={(e) => set(s === "front" ? { frontLang: e.target.value, frontVoice: "" } : { backLang: e.target.value, backVoice: "" })}>
            <option value="auto">{T("langAuto")}</option>
            {langs.map((l) => <option key={l} value={l}>{langLabel(l, locale)}</option>)}
          </Select>
        </Field>
        <Field label={T(s === "front" ? "ttsFrontVoice" : "ttsBackVoice")}>
          <div className="flex gap-2">
            <Select className="min-w-0 flex-1" value={voice} onChange={(e) => set(s === "front" ? { frontVoice: e.target.value } : { backVoice: e.target.value })}>
              <option value="">{T("ttsVoiceAuto")}</option>
              {voicesFor(lang).map((x) => <option key={x.voiceURI} value={x.voiceURI}>{x.name} · {x.lang}</option>)}
            </Select>
            <Button size="sm" className="h-11 sm:h-9" onClick={() => preview(s)} aria-label={T("ttsPreview")} title={T("ttsPreview")}><Play className="h-3.5 w-3.5" /></Button>
          </div>
        </Field>
      </div>
    );
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">{side("front")}{side("back")}</div>
      <Field label={T("ttsRate", { r: v.rate.toFixed(2) })}>
        <input type="range" min={0.5} max={2} step={0.05} value={v.rate} onChange={(e) => set({ rate: Number(e.target.value) })} className="h-11 w-full accent-primary sm:h-6" />
      </Field>
    </div>
  );
}
