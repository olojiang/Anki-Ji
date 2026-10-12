/** Split long source text into LLM-sized chunks on paragraph → sentence → hard boundaries. */
import { MAX_CHUNK_CHARS } from "./types";

const SENTENCE = /(?<=[.!?。！？；;])\s*/;

function pieces(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= max) { out.push(p); continue; }
    for (const s of p.split(SENTENCE)) {
      const t = s.trim();
      if (!t) continue;
      if (t.length <= max) { out.push(t); continue; }
      for (let i = 0; i < t.length; i += max) out.push(t.slice(i, i + max));
    }
  }
  return out;
}

export function normalizeSource(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t\f\v]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function chunkText(text: string, opts: { maxChars?: number; overlap?: number } = {}): string[] {
  const max = Math.max(50, opts.maxChars ?? MAX_CHUNK_CHARS);
  const overlap = Math.max(0, Math.min(opts.overlap ?? 300, Math.floor(max / 4)));
  const src = normalizeSource(text);
  if (src.length <= max) return src ? [src] : [];
  const body = max - (overlap ? overlap + 2 : 0);
  const chunks: string[] = [];
  let cur = "";
  for (const p of pieces(src, body)) {
    const sep = cur ? (p.length && /[.!?。！？；;]$/.test(cur) && !cur.endsWith("\n") ? " " : "\n\n") : "";
    if (cur && cur.length + sep.length + p.length > body) { chunks.push(cur); cur = p; } else cur += sep + p;
  }
  if (cur) chunks.push(cur);
  if (!overlap) return chunks;
  return chunks.map((c, i) => {
    if (!i) return c;
    const prev = chunks[i - 1];
    const tail = prev.slice(-overlap).replace(/^\S*\s/, "");
    return `…${tail}\n${c}`;
  });
}

/** Split `total` cards across chunks proportionally to their length (largest remainder). */
export function distributeCount(total: number, lengths: number[]): number[] {
  const n = lengths.length;
  if (!n) return [];
  const t = Math.max(0, Math.round(total));
  const sum = lengths.reduce((a, b) => a + Math.max(1, b), 0);
  const base = t >= n ? 1 : 0;
  const rest = t - base * n;
  const exact = lengths.map((l) => (Math.max(1, l) / sum) * rest);
  const out = exact.map((x) => base + Math.floor(x));
  let left = t - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left--; }
  return out;
}
