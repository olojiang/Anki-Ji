/**
 * Anki-compatible card template engine (pure, no DOM).
 *
 * Supported: {{Field}}, {{FrontSide}}, {{#Field}}…{{/Field}}, {{^Field}}…{{/Field}}, filter chains applied
 * right-to-left ({{text:hint:Field}}), filters type / cloze / cloze-only / hint / text / furigana / kana / kanji,
 * {{tts lang opts:Field}} passthrough, special fields (Tags, Type, Deck, Subdeck, Card).
 * Output is *unsanitised* HTML — callers must run it through DOMPurify before display.
 */
import { parseCloze, renderCloze } from "./cloze";

export type TplNode =
  | { t: "text"; v: string }
  | { t: "var"; key: string }
  | { t: "sec"; key: string; inv: boolean; kids: TplNode[] };

export interface TemplateIssue { code: "unclosed_section" | "unexpected_close" | "unknown_field" | "no_field" | "no_cloze" | "empty_name" | "duplicate_name" | "bad_name" | "reserved_name" | "no_fields" | "no_templates" | "cloze_one_template"; detail?: string; template?: string; side?: "front" | "back" }

/** Placeholder the UI replaces with the type-in input (front) or the comparison (back). Survives DOMPurify. */
export const TYPE_SLOT = '<span data-ak-type="1"></span>';
export const SPECIAL_FIELDS = ["FrontSide", "Tags", "Type", "Deck", "Subdeck", "Card", "CardFlag"] as const;

const TAG = /\{\{([\s\S]*?)\}\}/g;

export function parseTemplate(src: string): { nodes: TplNode[]; errors: TemplateIssue[] } {
  const errors: TemplateIssue[] = [];
  const root: TplNode[] = [];
  const stack: { key: string; kids: TplNode[] }[] = [];
  const cur = () => (stack.length ? stack[stack.length - 1].kids : root);
  let last = 0;
  for (const m of (src ?? "").matchAll(TAG)) {
    if (m.index! > last) cur().push({ t: "text", v: src.slice(last, m.index) });
    last = m.index! + m[0].length;
    const inner = m[1].trim();
    const op = inner[0];
    if (op === "#" || op === "^") {
      const key = inner.slice(1).trim();
      const node: TplNode = { t: "sec", key, inv: op === "^", kids: [] };
      cur().push(node);
      stack.push({ key, kids: node.kids });
    } else if (op === "/") {
      const key = inner.slice(1).trim();
      if (stack.length && stack[stack.length - 1].key === key) stack.pop();
      else errors.push({ code: "unexpected_close", detail: key });
    } else {
      cur().push({ t: "var", key: inner });
    }
  }
  if (last < (src ?? "").length) cur().push({ t: "text", v: src.slice(last) });
  for (const s of stack.reverse()) errors.push({ code: "unclosed_section", detail: s.key });
  return { nodes: root, errors };
}

export interface FieldRef { field: string; filters: string[]; section: boolean }

/** Split "a:b:Field" into field + filters (in source order). */
function splitKey(key: string): { field: string; filters: string[] } {
  const parts = key.split(":");
  const field = parts.pop()!.trim();
  return { field, filters: parts.map((p) => p.trim()) };
}

export function templateFieldRefs(src: string): FieldRef[] {
  const out: FieldRef[] = [];
  const walk = (nodes: TplNode[]) => {
    for (const n of nodes) {
      if (n.t === "var") out.push({ ...splitKey(n.key), section: false });
      else if (n.t === "sec") { out.push({ field: n.key, filters: [], section: true }); walk(n.kids); }
    }
  };
  walk(parseTemplate(src).nodes);
  return out;
}

const ENT: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Text content of an HTML fragment (block tags become spaces). */
export function stripHtml(html: string): string {
  return (html ?? "")
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?(br|div|p|li|tr|td|th|hr|h[1-6]|ul|ol|table|blockquote|pre)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (e) => ENT[e] ?? e)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

/** Anki's notion of an empty field: only whitespace, <br>, empty <div>s and &nbsp;. */
export function fieldIsEmpty(v: string | undefined | null): boolean {
  if (!v) return true;
  return v.replace(/<br\s*\/?>/gi, "").replace(/<\/?div>/gi, "").replace(/&nbsp;/gi, "").replace(/[\s\u00a0]/g, "") === "";
}

export interface RenderContext {
  values: Record<string, string>; // by field name
  ord: number; // card ordinal (template ord, or 1-based cloze number)
  side: "front" | "back";
  kind: "standard" | "cloze";
  frontSide?: string; // rendered front (back side only)
  specials?: Partial<Record<(typeof SPECIAL_FIELDS)[number], string>>;
  formatField?: (raw: string) => string; // e.g. markdown → HTML for plain {{Field}} substitutions
  hintLabel?: string;
}

export interface RenderResult { html: string; typeAnswer: string | null }

const clozeAnswers = (text: string, ord: number) => parseCloze(text).filter((n) => n.ord === ord).map((n) => stripHtml(n.content)).join(", ");

function furigana(s: string, mode: "furigana" | "kana" | "kanji"): string {
  return s.replace(/ ?([^ >]+?)\[(.+?)\]/g, (_, base: string, ruby: string) => (mode === "kana" ? ruby : mode === "kanji" ? base : `<ruby><rb>${base}</rb><rt>${ruby}</rt></ruby>`));
}

export function renderTemplate(src: string, ctx: RenderContext): RenderResult {
  let typeAnswer: string | null = null;
  const lookup = (name: string): string | undefined => {
    if (Object.prototype.hasOwnProperty.call(ctx.values, name)) return ctx.values[name] ?? "";
    if (name === "FrontSide") return ctx.frontSide ?? "";
    if ((SPECIAL_FIELDS as readonly string[]).includes(name)) return (ctx.specials as Record<string, string> | undefined)?.[name] ?? "";
    return undefined;
  };
  const replace = (key: string): string => {
    const { field, filters } = splitKey(key);
    if (field === "FrontSide" && !Object.prototype.hasOwnProperty.call(ctx.values, "FrontSide")) {
      return (ctx.frontSide ?? "").split(TYPE_SLOT).join("");
    }
    const raw = lookup(field);
    if (raw === undefined) return `<span class="ak-tpl-error">{unknown field ${escapeHtml(field)}}</span>`;
    if (filters.includes("type")) {
      typeAnswer = filters.includes("cloze") ? clozeAnswers(raw, ctx.ord) : stripHtml(raw);
      return TYPE_SLOT;
    }
    let v = raw;
    let format = true;
    for (const f of [...filters].reverse()) {
      if (f === "cloze") v = ctx.kind === "cloze" ? renderCloze(v, ctx.ord, ctx.side) : v;
      else if (f === "cloze-only") v = clozeAnswers(v, ctx.ord);
      else if (f === "hint") {
        if (fieldIsEmpty(v)) { v = ""; format = false; continue; }
        const body = format && ctx.formatField ? ctx.formatField(v) : v;
        v = `<details class="ak-hint"><summary>${escapeHtml(ctx.hintLabel ?? "Hint")}</summary>${body}</details>`;
        format = false;
      } else if (f === "text") { v = escapeHtml(stripHtml(v)); format = false; }
      else if (f === "furigana" || f === "kana" || f === "kanji") v = furigana(v, f);
      else if (/^tts(\s|$)/.test(f)) {
        const [, lang = "", ...opts] = f.split(/\s+/);
        v = `<span class="ak-tts" data-tts-lang="${escapeHtml(lang)}"${opts.length ? ` data-tts-options="${escapeHtml(opts.join(" "))}"` : ""}>${escapeHtml(stripHtml(v))}</span>`;
        format = false;
      }
      // unknown filters (add-on specific) pass the value through unchanged, like Anki
    }
    return format && ctx.formatField ? ctx.formatField(v) : v;
  };
  const walk = (nodes: TplNode[]): string => {
    let out = "";
    for (const n of nodes) {
      if (n.t === "text") out += n.v;
      else if (n.t === "var") out += replace(n.key);
      else {
        const empty = fieldIsEmpty(lookup(n.key));
        if (empty === n.inv) out += walk(n.kids);
      }
    }
    return out;
  };
  const html = walk(parseTemplate(src).nodes);
  return { html, typeAnswer };
}

/** Rename references to a field inside a template ({{Old}}, {{#Old}}, {{/Old}}, {{text:Old}} …). */
export function renameFieldInTemplate(src: string, from: string, to: string): string {
  return (src ?? "").replace(TAG, (whole, inner: string) => {
    const t = inner.trim();
    const op = t[0] === "#" || t[0] === "^" || t[0] === "/" ? t[0] : "";
    const body = op ? t.slice(1).trim() : t;
    const parts = body.split(":");
    if (parts[parts.length - 1].trim() !== from) return whole;
    parts[parts.length - 1] = to;
    return `{{${op}${parts.map((p) => p.trim()).join(":")}}}`;
  });
}

// ───────────────────────────── CSS scoping ─────────────────────────────

const ROOT_SIMPLE = new Set(["html", "body", ":root", ".card", ".mobile", ".android", ".iphone", ".ipad", ".linux", ".mac", ".win", ".isMac", ".isWin"]);
const NIGHT_SIMPLE = new Set([".nightMode", ".night_mode", ".night-mode"]);
const BAD_DECL = /(expression\s*\(|javascript:|vbscript:|-moz-binding|^\s*behavior\s*:)/i;

/** Read from `i` (just after an opening "{") to its matching "}", honouring strings and comments. Returns index after "}". */
function blockEnd(css: string, i: number): number {
  let depth = 1;
  while (i < css.length) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") { const e = css.indexOf("*/", i + 2); i = e < 0 ? css.length : e + 2; continue; }
    if (c === '"' || c === "'") { i = stringEnd(css, i); continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
    i++;
  }
  return css.length;
}
function stringEnd(css: string, i: number): number {
  const q = css[i];
  i++;
  while (i < css.length && css[i] !== q) { if (css[i] === "\\") i++; i++; }
  return i + 1;
}
/** Split at top-level delimiters (outside strings, parens, brackets). */
function splitTop(s: string, delim: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") { i = stringEnd(s, i) - 1; continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === delim && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out;
}

function scopeSelector(sel: string, scope: string): string {
  const s = sel.trim();
  if (!s) return "";
  // tokens: compounds and combinators
  const tokens = s.split(/(\s*[>+~]\s*|\s+)/).filter((x) => x !== "");
  let night = false;
  let attached = "";
  let i = 0;
  for (; i < tokens.length; i++) {
    const tok = tokens[i];
    if (/^\s*[>+~]?\s*$/.test(tok)) continue; // combinator between leading root compounds
    const simples = tok.match(/(\.[\w-]+|#[\w-]+|::?[\w-]+(\([^)]*\))?|\[[^\]]*\]|\*|[\w-]+)/g) ?? [tok];
    const rootish = simples.filter((x) => ROOT_SIMPLE.has(x) || NIGHT_SIMPLE.has(x));
    if (!rootish.length) break;
    if (simples.some((x) => NIGHT_SIMPLE.has(x))) night = true;
    const rest = simples.filter((x) => !ROOT_SIMPLE.has(x) && !NIGHT_SIMPLE.has(x));
    if (rest.length) { attached = rest.join(""); i++; break; }
  }
  // drop the combinator that followed the consumed root compounds
  while (i < tokens.length && /^\s*$/.test(tokens[i])) i++;
  let rest = tokens.slice(i).join("").trim();
  const head = scope + (night ? ".ak-night" : "") + attached;
  if (!rest) return head;
  if (/^[>+~]/.test(rest)) return `${head} ${rest}`;
  // leading combinator token (e.g. " > ") was consumed by the root walk: recover it
  const comb = tokens[i - 1] && /[>+~]/.test(tokens[i - 1]) ? tokens[i - 1].trim() : "";
  rest = comb ? `${comb} ${rest}` : rest;
  return `${head} ${rest}`;
}

function cleanDecls(body: string, root: boolean, adapt: boolean): string {
  const decls = splitTop(body, ";");
  const keep = decls.filter((d) => {
    if (!d.trim()) return false;
    if (BAD_DECL.test(d)) return false;
    if (adapt && root) {
      const m = /^\s*(color|background-color|background)\s*:\s*(.+?)\s*(!important)?\s*$/i.exec(d);
      if (m && /^(black|white|#000|#000000|#fff|#ffffff)$/i.test(m[2])) return false;
    }
    return true;
  });
  return keep.join(";") + (keep.length && /;\s*$/.test(body) ? ";" : "");
}

function scopeBlock(css: string, scope: string, adapt: boolean): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    // skip whitespace + comments
    if (/\s/.test(css[i])) { i++; continue; }
    if (css[i] === "/" && css[i + 1] === "*") { const e = css.indexOf("*/", i + 2); i = e < 0 ? css.length : e + 2; continue; }
    if (css[i] === "}") { i++; continue; }
    if (css[i] === "@") {
      const nameM = /^@([\w-]+)/.exec(css.slice(i));
      const name = (nameM?.[1] ?? "").toLowerCase();
      // prelude until ";" or "{"
      let j = i;
      while (j < css.length && css[j] !== "{" && css[j] !== ";") { if (css[j] === '"' || css[j] === "'") { j = stringEnd(css, j); continue; } j++; }
      if (css[j] !== "{") { // statement at-rule (@import, @charset, @namespace) → dropped
        i = j + 1; continue;
      }
      const end = blockEnd(css, j + 1);
      const prelude = css.slice(i, j).trim();
      const inner = css.slice(j + 1, end - 1);
      if (["media", "supports", "container", "layer", "document"].includes(name)) out += `${prelude}{${scopeBlock(inner, scope, adapt)}}`;
      else if (BAD_DECL.test(inner)) { /* drop */ }
      else out += css.slice(i, end).trim();
      i = end;
      continue;
    }
    let j = i;
    while (j < css.length && css[j] !== "{") { if (css[j] === '"' || css[j] === "'") { j = stringEnd(css, j); continue; } j++; }
    if (j >= css.length) break;
    const end = blockEnd(css, j + 1);
    const selectors = splitTop(css.slice(i, j), ",").map((s) => scopeSelector(s, scope)).filter(Boolean);
    const root = selectors.some((s) => s === scope || s === `${scope}.ak-night`);
    const body = cleanDecls(css.slice(j + 1, end - 1).trim(), root, adapt);
    if (selectors.length) out += `${selectors.join(",")}{${body}}`;
    i = end;
  }
  return out;
}

/**
 * Scope note-type CSS to one container: `.card`/`body`/`html` become the container itself, every other selector
 * becomes a descendant of it, Anki night-mode selectors map to `.ak-night` on the container. Drops @import and
 * script-like declarations. `adaptColors` removes plain black/white colours on the root rule (Anki's default),
 * so app themes show through.
 */
export function scopeCss(css: string, scope: string, opts: { adaptColors?: boolean } = {}): string {
  try { return scopeBlock(css ?? "", scope, !!opts.adaptColors); } catch { return ""; }
}
