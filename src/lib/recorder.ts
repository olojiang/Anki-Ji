"use client";
/** MediaRecorder hook: record → Blob + object URL, auto-stop at a max duration, release the mic when done. */
import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_RECORDING_BYTES = 4 * 1024 * 1024; // same cap as the media pipeline

export const recordingSupported = () => typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

function pickMime(): string {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/aac"];
  for (const m of options) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  return "";
}
export const extForMime = (m: string) => (m.includes("mp4") || m.includes("aac") ? "m4a" : m.includes("ogg") ? "ogg" : "webm");

export type RecState = "idle" | "recording" | "ready" | "error";

export function useRecorder(opts: { maxMs?: number } = {}) {
  const maxMs = opts.maxMs ?? 120000;
  const [state, setState] = useState<RecState>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<"denied" | "unsupported" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);

  const release = () => {
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
    if (timer.current) clearInterval(timer.current); timer.current = null;
  };
  const setObjectUrl = (u: string | null) => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = u; setUrl(u); };

  const stop = useCallback(() => { if (rec.current && rec.current.state !== "inactive") rec.current.stop(); }, []);

  const start = useCallback(async () => {
    if (!recordingSupported()) { setError("unsupported"); setState("error"); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mime = pickMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      r.onstop = () => {
        release();
        const b = new Blob(parts, { type: r.mimeType || mime || "audio/webm" });
        setBlob(b); setObjectUrl(URL.createObjectURL(b)); setState("ready");
      };
      rec.current = r;
      setBlob(null); setObjectUrl(null); setError(null); setElapsed(0);
      r.start(250);
      setState("recording");
      const t0 = Date.now();
      timer.current = setInterval(() => { const ms = Date.now() - t0; setElapsed(Math.floor(ms / 1000)); if (ms >= maxMs) stop(); }, 250);
    } catch {
      release(); setError("denied"); setState("error");
    }
  }, [maxMs, stop]);

  const reset = useCallback(() => { stop(); release(); setBlob(null); setObjectUrl(null); setState("idle"); setElapsed(0); }, [stop]);

  useEffect(() => () => { if (rec.current && rec.current.state !== "inactive") { rec.current.onstop = null; rec.current.stop(); } release(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  return { state, blob, url, error, elapsed, start, stop, reset, mime: blob?.type ?? "" };
}

/** Play an audio URL; resolves when it ends (or fails). */
export function playUrl(src: string, el?: HTMLAudioElement | null): Promise<void> {
  return new Promise((resolve) => {
    const a = el ?? new Audio();
    a.src = src;
    a.onended = () => resolve();
    a.onerror = () => resolve();
    a.play().catch(() => resolve());
  });
}
