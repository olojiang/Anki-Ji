/**
 * Incremental reading (SuperMemo-style, simplified). Pure logic only:
 *  - priority 0–100 (higher = more important)
 *  - each "read enough for now" grows the interval; high priority grows slower so it comes back sooner
 *  - daily queue: due items ordered by priority, then most overdue, capped
 *  - chunking of long texts at paragraph boundaries (never inside code fences)
 *  - card / extract helpers from a text selection; HTML → readable text for URL imports
 * Days are integer day indexes (see core/time dayIndex) so time zones and rollover stay in the caller.
 */

export type ReadingStatus = "active" | "done";
export interface ReadingSched { status: ReadingStatus; dueDay: number; intervalDays: number; reps: number; priority: number }

export const DEFAULT_READING_PRIORITY = 50;
export const DEFAULT_DAILY_CAP = 20;
export const MAX_READING_INTERVAL = 365;

export function clampPriority(p: unknown): number {
  const n = Number(p);
  if (p == null || p === "" || !Number.isFinite(n)) return DEFAULT_READING_PRIORITY;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeDailyCap(v: unknown): number {
  const n = Number(v);
  if (v == null || v === "" || !Number.isFinite(n)) return DEFAULT_DAILY_CAP;
  return Math.max(1, Math.min(500, Math.round(n)));
}

/** Interval multiplier: 1.5 at priority 100 … 2.5 at priority 0. */
export function readingFactor(priority: number): number {
  return 1.5 + (1 - clampPriority(priority) / 100);
}

export function nextReadingInterval(prev: number, priority: number, maxInterval = MAX_READING_INTERVAL): number {
  if (!(prev > 0)) return 1;
  return Math.min(maxInterval, Math.max(Math.round(prev) + 1, Math.round(prev * readingFactor(priority))));
}

export function newReadingSched(today: number, priority: unknown): ReadingSched {
  return { status: "active", dueDay: today, intervalDays: 0, reps: 0, priority: clampPriority(priority) };
}

/** Extracts inherit the parent's priority and show up from tomorrow. */
export function extractSched(parent: Pick<ReadingSched, "priority">, today: number): ReadingSched {
  return { status: "active", dueDay: today + 1, intervalDays: 0, reps: 0, priority: clampPriority(parent.priority) };
}

export function markReadEnough(s: ReadingSched, today: number): ReadingSched {
  const intervalDays = nextReadingInterval(s.intervalDays, s.priority);
  return { ...s, status: "active", intervalDays, dueDay: today + intervalDays, reps: s.reps + 1 };
}

/** Push the item back (default ≈ half the current interval, at least a day). Interval and reps unchanged. */
export function postponeReading(s: ReadingSched, today: number, days?: number): ReadingSched {
  const d = days == null || !Number.isFinite(Number(days)) ? Math.max(1, Math.ceil(s.intervalDays * 0.5)) : Math.max(1, Math.round(Number(days)));
  return { ...s, dueDay: today + d };
}

export function markDone(s: ReadingSched): ReadingSched { return { ...s, status: "done" }; }
export function reopenReading(s: ReadingSched, today: number): ReadingSched { return { ...s, status: "active", dueDay: today }; }

export interface QueueEntry { id: number; priority: number; dueDay: number; status: ReadingStatus }

export function buildReadingQueue<T extends QueueEntry>(items: T[], today: number, cap: number): { queue: T[]; due: number; overflow: number } {
  const due = items.filter((i) => i.status === "active" && i.dueDay <= today)
    .sort((a, b) => b.priority - a.priority || a.dueDay - b.dueDay || a.id - b.id);
  const n = Math.max(0, cap);
  return { queue: due.slice(0, n), due: due.length, overflow: Math.max(0, due.length - n) };
}

/* ───────── chunking ───────── */

function fenceRanges(text: string): [number, number][] {
  const marks = [...text.matchAll(/^(```|~~~)/gm)].map((m) => m.index!);
  const out: [number, number][] = [];
  for (let i = 0; i < marks.length; i += 2) out.push([marks[i], marks[i + 1] ?? text.length]);
  return out;
}

export const DEFAULT_CHUNK = 1500;

/** The chunk starting at `pos`: ends at the first paragraph break past `target` chars that is outside a code fence. */
export function chunkBounds(text: string, pos: number, target = DEFAULT_CHUNK): { start: number; end: number; last: boolean } {
  const len = text.length;
  let start = Math.max(0, Math.min(len, Math.floor(pos) || 0));
  while (start < len && /\s/.test(text[start])) start++;
  if (start >= len) return { start: len, end: len, last: true };
  const fences = fenceRanges(text);
  const inFence = (i: number) => fences.some(([a, b]) => i > a && i < b);
  const re = /\n[ \t]*\n/g;
  re.lastIndex = start + target;
  let end = len;
  for (let m = re.exec(text); m; m = re.exec(text)) { if (!inFence(m.index)) { end = m.index; break; } }
  if (text.slice(end).trim().length < target * 0.3) end = len;
  return { start, end, last: end >= len || text.slice(end).trim() === "" };
}

export function readingProgress(text: string, pos: number): number {
  if (!text.length) return 1;
  return Math.max(0, Math.min(1, pos / text.length));
}

/* ───────── selection → card / extract ───────── */

const isTerminator = (s: string, i: number) => {
  const ch = s[i];
  if (ch === "\n" || "。！？；".includes(ch)) return true;
  if (".!?".includes(ch)) return i + 1 >= s.length || /\s/.test(s[i + 1]);
  return false;
};

/** Cloze note text: the sentence containing the selection with the selection as {{c1::…}}. */
export function clozeFromSelection(source: string, selection: string): { text: string; found: boolean } {
  const sel = selection.trim();
  const wrapped = `{{c1::${sel.replace(/\}\}/g, "} }")}}}`;
  const idx = sel ? source.indexOf(sel) : -1;
  if (idx < 0) return { text: wrapped, found: false };
  const LIMIT = 400;
  let a = idx;
  while (a > 0 && idx - a < LIMIT && !isTerminator(source, a - 1)) a--;
  let b = idx + sel.length;
  while (b < source.length && b - (idx + sel.length) < LIMIT && !isTerminator(source, b)) b++;
  if (b < source.length && source[b] !== "\n" && isTerminator(source, b)) b++;
  const before = source.slice(a, idx).replace(/^\s+/, "");
  const after = source.slice(idx + sel.length, b).replace(/\s+$/, "");
  return { text: before + wrapped + after, found: true };
}

export function basicFromSelection(selection: string): { front: string; back: string } {
  return { front: selection.trim(), back: "" };
}

export function extractTitle(text: string, max = 60): string {
  const s = text.replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`|~~)/g, "").replace(/(^|\s)[*_](\S)/g, "$1$2").replace(/(\S)[*_](\s|$)/g, "$1$2")
    .replace(/^\s*(#+|>|[-*+]|\d+\.)\s+/gm, "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}

/* ───────── HTML → text ───────── */

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", copy: "©", middot: "·", laquo: "«", raquo: "»" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return Number.isFinite(cp) ? String.fromCodePoint(cp) : m; } catch { return m; }
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const dropTags = (html: string, tags: string[]) => tags.reduce((h, t) => h.replace(new RegExp(`<${t}\\b[\\s\\S]*?<\\/${t}>`, "gi"), " "), html);

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  let h = html.replace(/<!--[\s\S]*?-->/g, " ");
  h = dropTags(h, ["head", "script", "style", "noscript", "svg", "template", "iframe"]);
  const pick = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(h) ?? /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(h);
  if (pick) h = pick[1];
  else h = dropTags((/<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(h)?.[1] ?? h), ["header"]);
  h = dropTags(h, ["nav", "footer", "aside", "form", "button", "select"]);
  // protect preformatted blocks from whitespace collapsing
  const pres: string[] = [];
  h = h.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner: string) => {
    pres.push(decodeEntities(inner.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\n+$/, ""));
    return `\u0000${pres.length - 1}\u0000`;
  });
  h = h.replace(/\s+/g, " ");
  h = h.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n: string, inner: string) => `\n\n${"#".repeat(Number(n))} ${inner.replace(/<[^>]+>/g, "").trim()}\n\n`);
  h = h.replace(/<li\b[^>]*>/gi, "\n- ").replace(/<\/li>/gi, "");
  h = h.replace(/<br\s*\/?>/gi, "\n");
  h = h.replace(/<\/?(p|div|ul|ol|blockquote|section|table|tr|figure|figcaption|dl|dt|dd|hr)\b[^>]*>/gi, "\n\n");
  h = h.replace(/<\/?(td|th)\b[^>]*>/gi, " ");
  h = h.replace(/<[^>]+>/g, "");
  h = decodeEntities(h).replace(/\u00a0/g, " ");
  h = h.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/[ \t]{2,}/g, " ");
  h = h.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `\n\n\`\`\`\n${pres[Number(i)]}\n\`\`\`\n\n`);
  h = h.replace(/\n{3,}/g, "\n\n").trim();
  return { title, text: h };
}
