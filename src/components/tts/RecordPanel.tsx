"use client";
/** Record yourself, play it back and compare with the card's audio (or TTS). Optionally attach to a field. */
import { useRef, useState } from "react";
import { Mic, Square, Play, Volume2, ArrowLeftRight, Paperclip, Trash2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { Button, cx } from "@/components/ui";
import { ta } from "@/lib/i18n-ai";
import { MAX_RECORDING_BYTES, extForMime, playUrl, recordingSupported, useRecorder } from "@/lib/recorder";

export function RecordPanel({ cardAudio = [], speakCard, onAttach, className }: {
  cardAudio?: string[]; speakCard?: () => Promise<void>; onAttach?: (blob: Blob, filename: string) => Promise<void>; className?: string;
}) {
  const { locale, toast } = useApp();
  const T = (k: string, v?: Record<string, string | number>) => ta(locale, k, v);
  const r = useRecorder({ maxMs: 120000 });
  const audio = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const tooBig = !!r.blob && r.blob.size > MAX_RECORDING_BYTES;

  if (!recordingSupported()) return <p className={cx("text-xs text-faint", className)}>{T("recUnsupported")}</p>;
  const playCard = async () => {
    if (cardAudio[0]) await playUrl(cardAudio[0]);
    else if (speakCard) await speakCard();
  };
  const run = (key: string, fn: () => Promise<void>) => async () => { setBusy(key); try { await fn(); } finally { setBusy(null); } };
  const attach = async () => {
    if (!r.blob || !onAttach) return;
    if (tooBig) { toast(T("recTooLarge"), "error"); return; }
    await onAttach(r.blob, `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.${extForMime(r.mime)}`);
    r.reset();
  };
  const btn = "h-11 sm:h-9";
  return (
    <div className={cx("space-y-2", className)} data-testid="record-panel">
      <div className="flex flex-wrap items-center gap-2">
        {r.state === "recording" ? (
          <Button variant="danger" className={btn} onClick={r.stop} aria-label={T("recStop")}>
            <Square className="h-4 w-4 fill-current" /><span className="num">{T("recording", { s: r.elapsed })}</span>
          </Button>
        ) : (
          <Button variant="primary" className={btn} onClick={r.start}><Mic className="h-4 w-4" />{T("record")}</Button>
        )}
        <Button className={btn} disabled={!r.url || !!busy} loading={busy === "mine"} onClick={run("mine", () => playUrl(r.url!, audio.current))}><Play className="h-4 w-4" />{T("recPlayMine")}</Button>
        {(cardAudio.length > 0 || speakCard) && (
          <Button className={btn} disabled={!!busy || r.state === "recording"} loading={busy === "card"} onClick={run("card", playCard)}>
            <Volume2 className="h-4 w-4" />{cardAudio.length ? T("recPlayCard") : T("recSpeakCard")}
          </Button>
        )}
        {(cardAudio.length > 0 || speakCard) && (
          <Button className={btn} disabled={!r.url || !!busy} loading={busy === "cmp"} onClick={run("cmp", async () => { await playCard(); await new Promise((x) => setTimeout(x, 350)); await playUrl(r.url!, audio.current); })}>
            <ArrowLeftRight className="h-4 w-4" />{T("recCompare")}
          </Button>
        )}
        {onAttach && r.blob && <Button variant="primary" className={btn} disabled={tooBig} loading={busy === "attach"} onClick={run("attach", attach)}><Paperclip className="h-4 w-4" />{T("recAttach")}</Button>}
        {r.blob && <Button variant="ghost" className={btn} onClick={r.reset} aria-label={T("recDiscard")}><Trash2 className="h-4 w-4" /></Button>}
      </div>
      {r.error && <p className="text-xs text-danger">{T(r.error === "denied" ? "recDenied" : "recUnsupported")}</p>}
      {tooBig && <p className="text-xs text-danger">{T("recTooLarge")}</p>}
      {!cardAudio.length && speakCard && r.state === "idle" && <p className="text-[11.5px] text-faint">{T("recNoCardAudio")}</p>}
      {r.url && <audio ref={audio} controls src={r.url} className="h-10 w-full max-w-md" />}
      {!r.url && <audio ref={audio} className="hidden" />}
    </div>
  );
}
