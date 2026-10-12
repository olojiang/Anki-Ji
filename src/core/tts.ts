/**
 * Text-to-speech helpers (pure): per-scope options (default → note type → deck chain), turning card markdown into
 * speakable text, {{tts lang:text}} / [anki:tts lang=xx]…[/anki:tts] markers, language guessing and audio URL discovery.
 */
export interface TtsOptions {
  autoFront: boolean; autoBack: boolean;
  frontLang: string; backLang: string; // "auto" or BCP-47 (en-US)
  frontVoice: string; backVoice: string; // SpeechSynthesisVoice.voiceURI, "" = best match for the language
  rate: number; // 0.5 – 2
}
export type TtsScopes = Record<string, Partial<TtsOptions> | null | undefined>;

export const defaultTtsOptions = (): TtsOptions => ({ autoFront: false, autoBack: false, frontLang: "auto", backLang: "auto", frontVoice: "", backVoice: "", rate: 1 });

const LANG_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
export function normalizeLang(v: unknown): string {
  if (typeof v !== "string") return "auto";
  const s = v.trim().replace(/_/g, "-");
  if (!s || s === "auto") return "auto";
  const parts = s.split("-");
  const out = [parts[0].toLowerCase(), ...parts.slice(1).map((p) => (p.length === 2 ? p.toUpperCase() : p))].join("-");
  return LANG_RE.test(out) ? out : "auto";
}

export function normalizeTtsOptions(i: Partial<TtsOptions> | null | undefined): TtsOptions {
  const d = defaultTtsOptions();
  const x = (i ?? {}) as Record<string, unknown>;
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const voice = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : "");
  const rate = Number(x.rate);
  return {
    autoFront: bool(x.autoFront, d.autoFront), autoBack: bool(x.autoBack, d.autoBack),
    frontLang: normalizeLang(x.frontLang), backLang: normalizeLang(x.backLang),
    frontVoice: voice(x.frontVoice), backVoice: voice(x.backVoice),
    rate: Number.isFinite(rate) && x.rate !== null && x.rate !== "" ? Math.min(2, Math.max(0.5, Math.round(rate * 100) / 100)) : d.rate,
  };
}

export const ttsScopeValid = (s: string) => s === "default" || /^deck:\d{1,10}$/.test(s) || /^type:[A-Za-z0-9_-]{1,64}$/.test(s);

/** Deck id followed by its ancestors (cycle-safe). */
export function deckChain(deckId: number | null | undefined, parents: Record<number, number | null | undefined>): number[] {
  const out: number[] = [];
  for (let cur = deckId ?? null; cur != null && !out.includes(cur); cur = parents[cur] ?? null) out.push(cur);
  return out;
}

/** Most specific scope wins: the card's deck (then its parents) → note type → user default → built-in. */
export function resolveTtsOptions(scopes: TtsScopes, ctx: { decks: number[]; noteType?: string }): TtsOptions {
  for (const d of ctx.decks) { const s = scopes[`deck:${d}`]; if (s) return normalizeTtsOptions(s); }
  if (ctx.noteType) { const s = scopes[`type:${ctx.noteType}`]; if (s) return normalizeTtsOptions(s); }
  return normalizeTtsOptions(scopes.default ?? null);
}

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** Card markdown → what a speech synthesizer should read. */
export function speakableText(md: string): string {
  let s = (md ?? "")
    .replace(/<span class="cloze">\[(\.\.\.|…)\]<\/span>/g, " … ")
    .replace(/<span class="cloze">\[([^\]]*)\]<\/span>/g, " … ($1) ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]+?\$\$/g, " ")
    .replace(/\$(?!\s)[^$\n]+?\$/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[sound:[^\]]*\]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<(audio|video|iframe|script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decode(s)
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+[.)]|>)\s+/gm, "")
    .replace(/(\*\*|__|`|~~|==)/g, "")
    .replace(/(^|\s)[*_](\S)/g, "$1$2").replace(/(\S)[*_](\s|$)/g, "$1$2");
  const lines = s.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  return lines.map((l, i) => (i < lines.length - 1 && !/[.!?。！？…:：;；,，]$/.test(l) ? `${l}.` : l)).join(" ").replace(/\s+([.,!?])/g, "$1").trim();
}

/** Guess a BCP-47 language from the dominant script. */
export function detectLang(text: string): string {
  if (/[\u3040-\u30ff]/.test(text)) return "ja-JP";
  if (/[\uac00-\ud7af]/.test(text)) return "ko-KR";
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return "zh-CN";
  if (/[\u0400-\u04ff]/.test(text)) return "ru-RU";
  if (/[\u0600-\u06ff]/.test(text)) return "ar-SA";
  if (/[\u0e00-\u0e7f]/.test(text)) return "th-TH";
  if (/[\u0590-\u05ff]/.test(text)) return "he-IL";
  if (/[\u0370-\u03ff]/.test(text)) return "el-GR";
  return "en-US";
}

const MARKER = /\{\{tts\s+([A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{2,8})*)(?:\s+[^:}]*)?:((?:(?!\}\}).)*)\}\}|\[anki:tts\s+lang=([A-Za-z_-]+)[^\]]*\]([\s\S]*?)\[\/anki:tts\]/g;

/** Visible text for markers (used before markdown rendering). Cloze syntax is left untouched. */
export function stripTtsMarkers(md: string): string {
  return (md ?? "").replace(MARKER, (_, _l1, t1, _l2, t2) => (t1 ?? t2 ?? ""));
}
export const hasTtsMarkers = (md: string) => { MARKER.lastIndex = 0; const r = MARKER.test(md ?? ""); MARKER.lastIndex = 0; return r; };

export interface TtsSegment { text: string; lang: string }
/** Split into speakable segments; marker segments carry their own language, the rest use `lang` (or auto-detect). */
export function parseTtsSegments(md: string, lang: string): TtsSegment[] {
  const out: TtsSegment[] = [];
  const plain = (s: string) => { const t = speakableText(s); if (t) out.push({ text: t, lang: lang === "auto" || !lang ? detectLang(t) : normalizeLang(lang) }); };
  let pos = 0;
  const src = md ?? "";
  MARKER.lastIndex = 0;
  for (let m = MARKER.exec(src); m; m = MARKER.exec(src)) {
    plain(src.slice(pos, m.index));
    const t = speakableText(m[2] ?? m[4] ?? "");
    if (t) out.push({ text: t, lang: normalizeLang(m[1] ?? m[3]) === "auto" ? detectLang(t) : normalizeLang(m[1] ?? m[3]) });
    pos = m.index + m[0].length;
  }
  plain(src.slice(pos));
  return out;
}

const AUDIO_EXT = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm|weba)(\?|#|$)/i;
/** Audio files embedded in a card (markdown ![audio](url), audio extensions, <audio>/<source> tags). */
export function extractAudioUrls(md: string): string[] {
  const found: { i: number; url: string }[] = [];
  for (const m of (md ?? "").matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)) if (m[1] === "audio" || AUDIO_EXT.test(m[2])) found.push({ i: m.index!, url: m[2] });
  for (const m of (md ?? "").matchAll(/<(?:audio|source)\b[^>]*\ssrc=["']([^"']+)["']/gi)) found.push({ i: m.index!, url: m[1] });
  return [...new Set(found.sort((a, b) => a.i - b.i).map((f) => f.url))];
}
