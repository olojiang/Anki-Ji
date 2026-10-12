"use client";
/** Browser speech synthesis (Web Speech API) helpers. */
import { useEffect, useState } from "react";
import type { TtsSegment } from "@/core/tts";

export const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** Voices load asynchronously in Chrome; re-render when they arrive. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

/** Explicit voice if available, else best match by full language, then by base language. */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: string, voiceURI?: string): SpeechSynthesisVoice | undefined {
  if (voiceURI) { const v = voices.find((x) => x.voiceURI === voiceURI); if (v && (!lang || v.lang.toLowerCase().startsWith(lang.split("-")[0].toLowerCase()))) return v; }
  const l = lang.toLowerCase().replace(/_/g, "-");
  const base = l.split("-")[0];
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace(/_/g, "-");
  return voices.find((v) => norm(v) === l && v.localService) ?? voices.find((v) => norm(v) === l) ?? voices.find((v) => norm(v).split("-")[0] === base);
}

let token = 0;
export function stopSpeaking() { token++; if (ttsSupported()) window.speechSynthesis.cancel(); }

/** Speak segments in order. Resolves when finished (or interrupted by a newer call / stopSpeaking). */
export function speakSegments(segments: TtsSegment[], opts: { rate?: number; voiceURI?: string } = {}): Promise<void> {
  if (!ttsSupported() || !segments.length) return Promise.resolve();
  stopSpeaking();
  const my = token;
  const voices = window.speechSynthesis.getVoices();
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (my !== token || i >= segments.length) return resolve();
      const s = segments[i++];
      const u = new SpeechSynthesisUtterance(s.text);
      u.lang = s.lang;
      const v = pickVoice(voices, s.lang, opts.voiceURI);
      if (v) u.voice = v;
      u.rate = opts.rate ?? 1;
      u.onend = next;
      u.onerror = next;
      window.speechSynthesis.speak(u);
    };
    next();
  });
}

/** Common languages offered in pickers (plus whatever voices the device has). */
export const COMMON_LANGS = ["zh-CN", "zh-TW", "zh-HK", "en-US", "en-GB", "ja-JP", "ko-KR", "fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR", "ru-RU", "ar-SA", "th-TH", "vi-VN"];
export function langOptions(voices: SpeechSynthesisVoice[]): string[] {
  const set = new Set(COMMON_LANGS);
  for (const v of voices) set.add(v.lang.replace(/_/g, "-"));
  return [...set].sort((a, b) => a.localeCompare(b));
}
export function langLabel(lang: string, locale: "zh" | "en"): string {
  try { const n = new Intl.DisplayNames([locale === "zh" ? "zh-CN" : "en"], { type: "language" }).of(lang); return n ? `${n} · ${lang}` : lang; } catch { return lang; }
}
