/** Small text helpers shared by the plain-text importers (Markdown/Obsidian, RemNote, Mochi, smart paste). */

const TAG_RE = /(^|[ \t])#(\[\[([^\]]+)\]\]|[\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

export const normalizeTag = (t: string) => t.trim().replace(/^#/, "").replace(/\s+/g, "_").split("/").filter(Boolean).join("::");

/** Pull `#tag`, `#a/b` (→ `a::b`) and `#[[multi word]]` out of a text; inline code is left alone. */
export function extractTags(text: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const parts = text.split(/(`[^`\n]*`)/);
  const out = parts.map((p, i) => (i % 2 ? p : p.replace(TAG_RE, (m, _pre, raw, multi) => { tags.push(normalizeTag(multi ?? raw)); return ""; }))).join("");
  return { text: out.split("\n").map((l) => l.replace(/[ \t]+$/, "")).join("\n").trim(), tags: [...new Set(tags.filter(Boolean))] };
}

export function maxClozeNumber(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\{\{c?(\d+)::/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/** `==highlight==` → `{{cN::highlight}}`, numbered after existing clozes. */
export function highlightsToCloze(text: string): string {
  let n = maxClozeNumber(text);
  return text.replace(/==([^=\n](?:[^=\n]|=(?!=))*?)==/g, (_, inner) => `{{c${++n}::${inner}}}`);
}

/** Mochi / RemNote style `{{text}}` and `{{2::text}}` → Anki `{{cN::text}}`. Existing `{{cN::…}}` are kept. */
export function curlyToCloze(text: string): string {
  let n = maxClozeNumber(text);
  return text.replace(/\{\{(?!c\d+::)(?:(\d+)::)?((?:(?!\{\{|\}\}).)+?)\}\}/gs, (_, num, inner) => `{{c${num ? Number(num) : ++n}::${inner}}}`);
}

export const hasAnyCloze = (s: string) => /\{\{c\d+::/.test(s) || /==[^=\n]+==/.test(s);

/** Find a separator outside `{{…}}` and inline code. Returns its index or -1. */
export function findSeparator(line: string, sep: string): number {
  let depth = 0, code = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "`") { code = !code; continue; }
    if (code) continue;
    if (line.startsWith("{{", i)) { depth++; i++; continue; }
    if (line.startsWith("}}", i) && depth) { depth--; i++; continue; }
    if (!depth && line.startsWith(sep, i)) return i;
  }
  return -1;
}

export const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const stripExt = (p: string) => p.replace(/\.[^./\\]+$/, "");
