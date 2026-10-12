"use client";
/** Study-screen voice tools: auto-read front/back per resolved TTS options, speaker button + R shortcut, record & compare. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX, Mic, X } from "lucide-react";
import { useApp } from "@/components/providers";
import { cx } from "@/components/ui";
import { api } from "@/lib/api";
import { ta } from "@/lib/i18n-ai";
import { speakSegments, stopSpeaking, ttsSupported } from "@/lib/tts";
import { deckChain, extractAudioUrls, parseTtsSegments, resolveTtsOptions, type TtsOptions } from "@/core/tts";
import { RecordPanel } from "./RecordPanel";

type TtsData = { scopes: Record<string, TtsOptions>; deckParents: Record<number, number | null> };
let cache: Promise<TtsData> | null = null;
export const loadTtsSettings = (fresh = false) => { if (!cache || fresh) cache = api<TtsData>("/api/tts/settings").catch(() => { cache = null; return { scopes: {}, deckParents: {} }; }); return cache; };

export interface VoiceCard { cardId: number; type: string; deckId?: number; kind: string; front: string; back: string; options?: string[]; showFrontOnBack?: boolean }

const frontText = (c: VoiceCard) => c.kind === "mcq" && c.options?.length ? `${c.front}\n\n${c.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}` : c.front;

export function StudyVoice({ deckId, card, revealed, toolClass }: { deckId: number; card: VoiceCard; revealed: boolean; toolClass: string }) {
  const { locale } = useApp();
  const T = (k: string) => ta(locale, k);
  const [data, setData] = useState<TtsData | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  const supported = typeof window !== "undefined" && ttsSupported();
  useEffect(() => { loadTtsSettings().then(setData); }, []);
  const opts = useMemo(() => {
    if (!data) return null;
    const chain = [...new Set([...deckChain(card.deckId, data.deckParents), ...deckChain(deckId, data.deckParents)])];
    return resolveTtsOptions(data.scopes, { decks: chain, noteType: card.type });
  }, [data, card.deckId, card.type, deckId]);

  const speak = useCallback(async (side: "front" | "back") => {
    if (!opts || !supported) return;
    const md = side === "front" ? frontText(card) : card.back;
    const segs = parseTtsSegments(md, side === "front" ? opts.frontLang : opts.backLang);
    if (!segs.length) return;
    setSpeaking(true);
    await speakSegments(segs, { rate: opts.rate, voiceURI: side === "front" ? opts.frontVoice : opts.backVoice });
    setSpeaking(false);
  }, [opts, supported, card]);
  const speakCurrent = useCallback(() => speak(revealed && card.back.trim() ? "back" : "front"), [speak, revealed, card.back]);

  // auto-read on card change / reveal
  const last = useRef("");
  useEffect(() => {
    if (!opts) return;
    const key = `${card.cardId}:${revealed}`;
    if (last.current === key) return;
    last.current = key;
    if (!revealed && opts.autoFront) speak("front");
    else if (revealed && opts.autoBack && card.back.trim()) speak("back");
    else if (revealed) stopSpeaking();
  }, [card.cardId, card.back, revealed, opts, speak]);
  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "r" || e.key === "R") { e.preventDefault(); if (speaking) { stopSpeaking(); setSpeaking(false); } else speakCurrent(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [speakCurrent, speaking]);

  const audioUrls = useMemo(() => extractAudioUrls(`${card.front}\n${card.back}`), [card.front, card.back]);
  return (
    <span className="relative inline-flex items-center gap-0.5">
      {supported && (
        <button onClick={() => { if (speaking) { stopSpeaking(); setSpeaking(false); } else speakCurrent(); }} className={cx(toolClass, speaking ? "bg-muted text-primary" : "text-sub hover:text-fg")}
          title={speaking ? T("stopSpeak") : T("speakFront")} aria-label={speaking ? T("stopSpeak") : T("speakFront")} data-testid="tts-speak">
          {speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      )}
      <button onClick={() => setRecOpen(!recOpen)} className={cx(toolClass, recOpen ? "bg-muted text-primary" : "text-sub hover:text-fg")} title={T("recTitle")} aria-label={T("recTitle")} aria-expanded={recOpen} data-testid="rec-toggle">
        <Mic className="h-4 w-4" />
      </button>
      {recOpen && (
        <div className="fixed inset-x-3 top-16 z-40 animate-rise-in rounded-2xl border border-border bg-elevated p-3 shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[420px]" onClick={(e) => e.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-fg">{T("recTitle")}</span>
            <button onClick={() => setRecOpen(false)} className="-m-1.5 inline-flex h-11 w-11 items-center justify-center rounded-lg text-faint hover:bg-muted hover:text-fg sm:h-8 sm:w-8" aria-label={T("recStop")} data-testid="rec-close"><X className="h-4 w-4" /></button>
          </div>
          <RecordPanel key={card.cardId} cardAudio={audioUrls} speakCard={supported ? () => speak(revealed ? "back" : "front") : undefined} />
        </div>
      )}
    </span>
  );
}
