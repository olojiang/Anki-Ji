/**
 * Anki .apkg export (legacy collection.anki2, schema 11 — the most widely importable format:
 * Anki 2.1.x/23.x/24.x/25.x desktop and AnkiDroid). Pure: give it a backup + media bytes + sql.js.
 */
import JSZip from "jszip";
import { Marked, type Tokens } from "marked";
import type { SqlJsStatic } from "sql.js";
import type { Backup, CardRecord, DeckRecord, NoteRecord } from "./backup";
import { base64ToBytes } from "./base64";
import { normalizeConfig } from "../config";
import { dayIndex, dayStart } from "../time";
import { stripMarkup } from "../notes";
import { descendantIds } from "../tree";
import type { NoteFields } from "../types";
import { MODEL_BASIC, STOCK_EXPORTERS, type ExportContext, type ModelDefinition, type NoteTypeExporter, type AnkiNotePart } from "../interop/models";

export interface ExportMedia { url: string; filename: string; bytes: Uint8Array }
export interface ApkgExportInput {
  backup: Backup;
  /** Root of the deck subtree to export; omit/null for the whole collection. */
  deckId?: number | null;
  includeScheduling: boolean;
  /** Media bytes keyed by the URL used in note fields. URLs without bytes stay as remote links. */
  media?: ExportMedia[];
  SQL: SqlJsStatic;
  now?: Date;
  /** Extra / overriding exporters by note type (custom note types plug in here). */
  exporters?: Record<string, NoteTypeExporter>;
  /** Skip media once the package would exceed this many bytes (default 200 MB). */
  maxMediaBytes?: number;
}
export interface ApkgExportStats { notes: number; cards: number; decks: number; media: number; revlog: number; skippedMedia: number; bytes: number }

/* ---------------- small helpers ---------------- */

/** SHA-1 (hex). Tiny pure implementation so the exporter runs the same in Node and the browser. */
export function sha1Hex(data: Uint8Array): string {
  const ml = data.length * 8;
  const withPad = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  withPad.set(data); withPad[data.length] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, ml >>> 0); dv.setUint32(withPad.length - 8, Math.floor(ml / 2 ** 32));
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** Anki's duplicate-check checksum: first 8 hex digits of sha1(stripped first field). */
export function fieldChecksum(text: string): number {
  return parseInt(sha1Hex(new TextEncoder().encode(text)).slice(0, 8), 16);
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => escHtml(s).replace(/"/g, "&quot;");
const AUDIO_EXT = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus)(\?|#|$)/i;
const MD_HINT = /(\*\*|__|`|~~|!\[|\[[^\]\n]*\]\([^)\n]*\)|\$[^$\n]+\$|\$\$|^\s{0,3}#{1,6}\s|^\s*[-*+]\s|^\s*\d+[.)]\s|^\s*>\s|^\s*\|.*\|\s*$|(^|\s)[*_][^*_\s][^*_\n]*[*_](\s|$))/m;
const HTML_TAG = /<\/?[a-zA-Z][\w-]*(\s[^>]*)?\/?>/;

const ankiMarked = new Marked({
  gfm: true,
  breaks: true,
  extensions: [
    {
      name: "blockMath", level: "block",
      start: (src: string) => src.indexOf("$$"),
      tokenizer(src: string) { const m = /^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src); return m ? { type: "blockMath", raw: m[0], text: m[1] } : undefined; },
      renderer: (t: Tokens.Generic) => `\\[${t.text}\\]`,
    },
    {
      name: "inlineMath", level: "inline",
      start: (src: string) => src.indexOf("$"),
      tokenizer(src: string) { const m = /^\$(?!\s)([^$\n]+?)(?<!\s)\$/.exec(src); return m ? { type: "inlineMath", raw: m[0], text: m[1] } : undefined; },
      renderer: (t: Tokens.Generic) => `\\(${t.text}\\)`,
    },
  ],
  renderer: {
    image({ href, text }: Tokens.Image) {
      if (!href) return "";
      if (text === "audio" || AUDIO_EXT.test(href)) return `[sound:${href}]`;
      if (text === "video") return `<a href="${escAttr(href)}">${escHtml(href)}</a>`;
      return `<img src="${escAttr(href)}"${text ? ` alt="${escAttr(text)}"` : ""}>`;
    },
  },
});

/**
 * Our fields are Markdown (+ inline HTML). Anki fields are HTML with [sound:x] and bare media filenames.
 * Plain text stays plain (escaped, newlines → <br>), existing HTML is kept, Markdown is rendered.
 */
export function markdownToAnkiHtml(md: string, ctx: Pick<ExportContext, "media">): string {
  if (!md) return "";
  // swap media URLs for opaque tokens so Markdown autolinking/escaping cannot touch them
  const tokens: string[] = [];
  const tok = (url: string) => { tokens.push(url); return `akmedia${tokens.length - 1}x`; };
  let src = md.replace(/(!\[[^\]]*\]\()\s*<?([^)\s>]+)>?(\s*(?:"[^"]*")?\))/g, (_m, pre, url, post) => `${pre}${tok(url)}${post}`)
    .replace(/(<(?:img|audio|video|source)\b[^>]*\ssrc=)(["'])([^"']+)\2/gi, (_m, pre, q, url) => `${pre}${q}${tok(url)}${q}`)
    .replace(/\[sound:([^\]]+)\]/g, (_m, url) => `[sound:${tok(url.trim())}]`);
  let html: string;
  if (MD_HINT.test(src)) {
    // audio images must not depend on the (now tokenised) URL extension
    src = src.replace(/!\[([^\]]*)\]\((akmedia(\d+)x)\)/g, (m, alt, t, i) => (alt === "audio" || AUDIO_EXT.test(tokens[Number(i)]) ? `[sound:${t}]` : m));
    html = String(ankiMarked.parse(src, { async: false })).trim();
    const single = /^<p>([\s\S]*)<\/p>$/.exec(html);
    if (single && !single[1].includes("<p>")) html = single[1];
    html = html.replace(/\n/g, "");
  } else if (HTML_TAG.test(src)) {
    html = src;
  } else {
    html = escHtml(src).replace(/\r?\n/g, "<br>");
  }
  return html.replace(/akmedia(\d+)x/g, (_m, i) => ctx.media(tokens[Number(i)]));
}

/* ---------------- MCQ / image occlusion → Basic ---------------- */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MCQ_EXPORTER: NoteTypeExporter = {
  model: MODEL_BASIC,
  toAnki(f, _ords, ctx) {
    const opts = f.options ?? [];
    const correct = (f.correct ?? []).filter((i) => i >= 0 && i < opts.length);
    const front = `${ctx.html(f.question ?? "")}<br><ol type="A" class="ak-opts">${opts.map((o) => `<li>${ctx.html(o)}</li>`).join("")}</ol>`;
    const back = `<b>${correct.map((i) => `${LETTERS[i] ?? i + 1}. ${ctx.html(opts[i])}`).join("<br>")}</b>${f.explanation ? `<br><br>${ctx.html(f.explanation)}` : ""}`;
    return [{ guidSuffix: "", fields: [front, back], cards: [{ ord: 0, ankiOrd: 0 }] }];
  },
};
const OCCLUSION_EXPORTER: NoteTypeExporter = {
  model: MODEL_BASIC,
  toAnki(f, ords, ctx) {
    const masks = f.masks ?? [];
    const img = ctx.media(f.image ?? "");
    const box = (i: number, active: number, reveal: boolean, hideAll: boolean) => {
      const m = masks[i];
      const cls = i === active ? (reveal ? "ak-mask reveal" : "ak-mask on") : "ak-mask";
      if (i !== active && !hideAll) return "";
      return `<div class="${cls}" style="left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%"></div>`;
    };
    const hideAll = f.occlusionMode === "hideAll";
    const header = f.header ? `${ctx.html(f.header)}<br>` : "";
    return ords.filter((o) => o >= 0 && o < masks.length).map((o) => {
      const view = (reveal: boolean) => `<div class="ak-io"><img src="${escAttr(img)}">${masks.map((_, i) => box(i, o, reveal, hideAll)).join("")}</div>`;
      const label = masks[o].label ? `<br><b>${escHtml(masks[o].label!)}</b>` : "";
      return { guidSuffix: `#io${o}`, fields: [header + view(false), view(true) + label + (f.extra ? `<br>${ctx.html(f.extra)}` : "")], cards: [{ ord: o, ankiOrd: 0 }] } satisfies AnkiNotePart;
    });
  },
};

const DEFAULT_EXPORTERS: Record<string, NoteTypeExporter> = { ...(STOCK_EXPORTERS as Record<string, NoteTypeExporter>), mcq: MCQ_EXPORTER, image_occlusion: OCCLUSION_EXPORTER };

/* ---------------- Anki JSON blobs ---------------- */

/** Stock models get a suffix so Anki does not rename them to "Basic+" next to its own stock "Basic". */
export const exportModelName = (m: ModelDefinition) => (STOCK_MODEL_IDS.has(m.id) ? `${m.name} (Anki-ji)` : m.name);
const STOCK_MODEL_IDS = new Set(Object.values(STOCK_EXPORTERS).map((e) => e!.model.id));

function modelJson(m: ModelDefinition, mod: number) {
  return {
    id: m.id, name: exportModelName(m), type: m.kind === "cloze" ? 1 : 0, mod, usn: -1, sortf: 0, did: 1, vers: [], tags: [],
    tmpls: m.templates.map((t, ord) => ({ name: t.name, ord, qfmt: t.qfmt, afmt: t.afmt, bqfmt: "", bafmt: "", did: null, bfont: "", bsize: 0 })),
    flds: m.fields.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: "Arial", size: 20, media: [], description: "" })),
    css: m.css,
    latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    latexPost: "\\end{document}", latexsvg: false,
    req: m.kind === "cloze" ? [[0, "any", [0]]] : m.templates.map((_, i) => [i, "any", [Math.min(i, m.fields.length - 1)]]),
  };
}

function deckJson(id: number, name: string, conf: number, mod: number, desc = "") {
  return { id, name, mod, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, browserCollapsed: false, desc, dyn: 0, conf, extendNew: 0, extendRev: 0 };
}

function dconfJson(id: number, name: string, cfgIn: Record<string, unknown>, mod: number) {
  const c = normalizeConfig(cfgIn);
  return {
    id, name, mod, usn: -1, maxTaken: 60, autoplay: true, timer: 0, replayq: true, dyn: false,
    new: { bury: c.buryNew, delays: c.learningSteps, initialFactor: Math.round(c.startingEase * 1000), ints: [c.graduatingInterval, c.easyInterval, 0], order: c.newOrder === "random" ? 0 : 1, perDay: c.newPerDay },
    rev: { bury: c.buryReview, ease4: c.easyBonus, ivlFct: c.intervalModifier, maxIvl: c.maxInterval, perDay: c.reviewsPerDay, hardFactor: c.hardInterval },
    lapse: { delays: c.relearningSteps, leechAction: c.leechAction === "suspend" ? 0 : 1, leechFails: c.leechThreshold, minInt: 1, mult: c.lapseNewInterval },
    desiredRetention: c.desiredRetention, fsrsWeights: c.fsrsWeights ?? [], fsrsParams5: c.fsrsWeights ?? [],
    newMix: c.newReviewMix === "newFirst" ? 2 : c.newReviewMix === "reviewFirst" ? 1 : 0,
  };
}

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

const EXT_FROM_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a", "video/mp4": "mp4", "video/webm": "webm" };
const safeName = (n: string) => (n.replace(/[\\/:*?"<>|\x00-\x1f\s]+/g, "_").replace(/^\.+/, "").slice(-100) || "file");

/** Unique-id allocator around a preferred millisecond value. */
function idAllocator() {
  const used = new Set<number>();
  return (preferred: number) => { let id = Math.max(1, Math.floor(preferred)); while (used.has(id)) id++; used.add(id); return id; };
}

/* ---------------- main ---------------- */

export async function exportApkg(input: ApkgExportInput): Promise<{ bytes: Uint8Array; stats: ApkgExportStats }> {
  const { backup, includeScheduling, SQL } = input;
  const now = input.now ?? new Date();
  const nowS = Math.floor(now.getTime() / 1000);
  const settings = (backup.settings ?? {}) as { timezone?: string; rolloverHour?: number };
  const tz = typeof settings.timezone === "string" && settings.timezone ? settings.timezone : "UTC";
  const rollover = Number.isInteger(settings.rolloverHour) ? Number(settings.rolloverHour) : 4;
  const exporters = { ...DEFAULT_EXPORTERS, ...(input.exporters ?? {}) };

  // --- which decks / notes / cards ---
  const liveDecks = backup.decks.filter((d) => !d.filtered);
  const deckById = new Map(backup.decks.map((d) => [d.id, d]));
  const inScope = new Set(input.deckId != null ? descendantIds(liveDecks, input.deckId) : liveDecks.map((d) => d.id));
  const pathOf = (id: number): string => {
    const parts: string[] = []; const guard = new Set<number>();
    let cur: DeckRecord | undefined = deckById.get(id);
    while (cur && !guard.has(cur.id)) { guard.add(cur.id); parts.unshift(cur.name.replace(/::/g, ":")); cur = cur.parentId != null ? deckById.get(cur.parentId) : undefined; }
    return parts.join("::");
  };
  const homeOf = (c: CardRecord) => (c.homeDeckId != null ? c.homeDeckId : c.deckId);
  const notes = backup.notes.filter((n) => inScope.has(n.deckId));
  const cardsByNote = new Map<number, CardRecord[]>();
  for (const c of backup.cards) (cardsByNote.get(c.noteId) ?? cardsByNote.set(c.noteId, []).get(c.noteId)!).push(c);

  // --- media ---
  const mediaBytes = new Map((input.media ?? []).map((m) => [m.url, m]));
  const mediaOut: { name: string; bytes: Uint8Array }[] = [];
  const urlToName = new Map<string, string>();
  const takenNames = new Set<string>();
  const maxMedia = input.maxMediaBytes ?? 200 * 1024 * 1024;
  let mediaTotal = 0, skippedMedia = 0;
  const addMedia = (key: string, wantName: string, bytes: Uint8Array): string | null => {
    if (urlToName.has(key)) return urlToName.get(key)!;
    if (mediaTotal + bytes.length > maxMedia) { skippedMedia++; return null; }
    let name = safeName(wantName);
    if (takenNames.has(name)) { const dot = name.lastIndexOf("."); const base = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : ""; let i = 2; while (takenNames.has(`${base}-${i}${ext}`)) i++; name = `${base}-${i}${ext}`; }
    takenNames.add(name); urlToName.set(key, name); mediaOut.push({ name, bytes }); mediaTotal += bytes.length;
    return name;
  };
  const media = (url: string): string => {
    if (!url) return url;
    if (urlToName.has(url)) return urlToName.get(url)!;
    const dm = /^data:([\w.+-]+\/[\w.+-]+)(?:;[\w=.+-]+)*;base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
    if (dm) {
      let bytes: Uint8Array;
      try { bytes = base64ToBytes(dm[2].replace(/\s+/g, "")); } catch { return url; }
      return addMedia(url, `ak-${sha1Hex(bytes).slice(0, 12)}.${EXT_FROM_MIME[dm[1]] ?? "bin"}`, bytes) ?? url;
    }
    const m = mediaBytes.get(url);
    if (m) return addMedia(url, m.filename || url.split("/").pop() || "file", m.bytes) ?? url;
    if (url.startsWith("anki-media:")) return url.slice("anki-media:".length);
    return url;
  };
  const ctx: ExportContext = { media, html: (md) => markdownToAnkiHtml(md, { media }) };

  // --- day math: crt = start of the study day of the earliest relevant time ---
  const relevant = [now.getTime(), ...notes.map((n) => Date.parse(n.createdAt) || now.getTime())];
  if (includeScheduling) for (const n of notes) for (const c of cardsByNote.get(n.id) ?? []) if (c.state !== "new") relevant.push(Date.parse(c.due) || now.getTime());
  const crtDay = dayIndex(new Date(Math.min(...relevant)), tz, rollover);
  const crtS = Math.floor(dayStart(crtDay, tz, rollover).getTime() / 1000);
  const dayNum = (iso: string) => dayIndex(new Date(iso), tz, rollover) - crtDay;

  // --- decks ---
  const ANKI_DECK_BASE = 1_000_000_000;
  const ankiDeckId = (id: number) => ANKI_DECK_BASE + id;
  const decksJson: Record<string, unknown> = { "1": deckJson(1, "Default", 1, nowS) };
  const dconf: Record<string, unknown> = { "1": dconfJson(1, "Default", {}, nowS) };
  const exportDecks = liveDecks.filter((d) => inScope.has(d.id));
  // when exporting a subtree, keep the full path so it lands in the same place in Anki
  for (const d of exportDecks) {
    const did = ankiDeckId(d.id);
    decksJson[String(did)] = deckJson(did, pathOf(d.id), did, nowS);
    dconf[String(did)] = dconfJson(did, pathOf(d.id), (d.config ?? {}) as Record<string, unknown>, nowS);
  }
  // make ancestor decks of a subtree root exist too (Anki creates them, but be explicit)
  if (input.deckId != null) {
    let p = deckById.get(input.deckId)?.parentId ?? null;
    while (p != null && deckById.has(p)) { const did = ankiDeckId(p); decksJson[String(did)] ??= deckJson(did, pathOf(p), 1, nowS); p = deckById.get(p)!.parentId; }
  }
  const deckCfg = (deckId: number) => normalizeConfig(deckById.get(deckId)?.config ?? {});

  // --- database ---
  const db = new SQL.Database();
  let revCount = 0, cardCount = 0, noteCount = 0;
  const usedModels = new Map<number, ModelDefinition>();
  try {
    db.run(SCHEMA);
    db.run("BEGIN");
    const insNote = db.prepare("INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    const insCard = db.prepare("INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const insRev = db.prepare("INSERT INTO revlog VALUES (?,?,?,?,?,?,?,?,?)");
    const noteId = idAllocator(), cardId = idAllocator(), revId = idAllocator();
    const revByCard = new Map<number, Backup["revlog"]>();
    if (includeScheduling) for (const r of backup.revlog) (revByCard.get(r.cardId) ?? revByCard.set(r.cardId, []).get(r.cardId)!).push(r);
    let newPos = 0;

    for (const n of [...notes].sort((a, b) => a.position - b.position || a.id - b.id)) {
      const exporter = exporters[n.type] ?? exporters.basic;
      const ncards = (cardsByNote.get(n.id) ?? []).sort((a, b) => a.ord - b.ord);
      if (!ncards.length) continue;
      const parts = exporter.toAnki(n.fields as NoteFields, ncards.map((c) => c.ord), ctx);
      const leech = ncards.some((c) => c.leech);
      const tags = [...new Set([...n.tags, ...(leech && includeScheduling ? ["leech"] : [])])].map((t) => t.replace(/\s+/g, "_"));
      const created = Date.parse(n.createdAt) || now.getTime();
      const modS = Math.floor((Date.parse(n.updatedAt) || created) / 1000);
      usedModels.set(exporter.model.id, exporter.model);
      for (const part of parts) {
        const cardsHere = part.cards.map((pc) => ({ pc, card: ncards.find((c) => c.ord === pc.ord) })).filter((x) => x.card) as { pc: { ord: number; ankiOrd: number }; card: CardRecord }[];
        if (!cardsHere.length) continue;
        const nid = noteId(created);
        const flds = part.fields.map((f) => f.replace(/\x1f/g, " "));
        const sfld = stripMarkup(flds[0] ?? "");
        insNote.run([nid, n.guid + part.guidSuffix, exporter.model.id, modS, -1, tags.length ? ` ${tags.join(" ")} ` : "", flds.join("\x1f"), sfld, fieldChecksum(sfld), 0, ""]);
        noteCount++;
        for (const { pc, card: c } of cardsHere) {
          const home = homeOf(c);
          const did = inScope.has(home) ? ankiDeckId(home) : ankiDeckId(n.deckId);
          const cid = cardId(Date.parse(c.createdAt) || created);
          const pos = ++newPos;
          let type = 0, queue = 0, due = pos, ivl = 0, factor = 0, reps = 0, lapses = 0, left = 0, data = "";
          if (includeScheduling && c.state !== "new") {
            const cfg = deckCfg(home);
            reps = c.reps; lapses = c.lapses;
            factor = Math.round((c.ease > 0 ? c.ease : cfg.startingEase) * 1000);
            ivl = Math.max(0, Math.round(c.scheduledDays));
            if (c.state === "review") { type = 2; queue = 2; ivl = Math.max(1, ivl); due = dayNum(c.due); }
            else {
              type = c.state === "learning" ? 1 : 3;
              const steps = c.state === "learning" ? cfg.learningSteps : cfg.relearningSteps;
              const remaining = Math.max(1, steps.length - c.step);
              left = remaining * 1000 + remaining;
              const dueMs = Date.parse(c.due);
              if (dueMs - now.getTime() >= 86400000 || dayNum(c.due) > dayNum(now.toISOString())) { queue = 3; due = dayNum(c.due); }
              else { queue = 1; due = Math.floor(dueMs / 1000); }
            }
            if (c.stability > 0 && c.difficulty >= 1 && c.difficulty <= 10) {
              data = JSON.stringify({ s: Math.round(c.stability * 10000) / 10000, d: Math.round(c.difficulty * 10000) / 10000, dr: cfg.desiredRetention, ...(c.lastReview ? { lrt: Math.floor(Date.parse(c.lastReview) / 1000) } : {}) });
            }
          }
          if (includeScheduling && c.suspended) queue = -1;
          const flags = includeScheduling ? c.flag & 7 : 0;
          insCard.run([cid, nid, did, pc.ankiOrd, modS, -1, type, queue, due, ivl, factor, reps, lapses, left, 0, 0, flags, data]);
          cardCount++;
          let lastIvl = 0;
          for (const r of (revByCard.get(c.id) ?? []).sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt))) {
            const at = Date.parse(r.reviewedAt);
            const rivl = r.scheduledDays >= 1 ? Math.round(r.scheduledDays) : -Math.max(0, Math.round((Date.parse(r.due) - at) / 1000));
            const rtype = r.state === "review" ? 1 : r.state === "relearning" ? 2 : 0;
            insRev.run([revId(at), cid, -1, Math.min(4, Math.max(1, r.rating)), rivl, lastIvl, factor || 2500, Math.max(0, Math.min(60000, Math.round(r.durationMs))), rtype]);
            lastIvl = rivl; revCount++;
          }
        }
      }
    }
    insNote.free(); insCard.free(); insRev.free();

    const models: Record<string, unknown> = {};
    for (const m of usedModels.values()) models[String(m.id)] = modelJson(m, nowS);
    if (!usedModels.size) models[String(MODEL_BASIC.id)] = modelJson(MODEL_BASIC, nowS);
    const firstModel = [...usedModels.keys()][0] ?? MODEL_BASIC.id;
    const conf = { nextPos: newPos + 1, estTimes: true, activeDecks: [1], sortType: "noteFld", timeLim: 0, sortBackwards: false, addToCur: true, curDeck: 1, newBury: true, newSpread: 0, dueCounts: true, curModel: String(firstModel), collapseTime: 1200 };
    const allTags = [...new Set(notes.flatMap((n) => n.tags))];
    db.run("INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)", [crtS, nowS * 1000, nowS * 1000, JSON.stringify(conf), JSON.stringify(models), JSON.stringify(decksJson), JSON.stringify(dconf), JSON.stringify(Object.fromEntries(allTags.map((t) => [t, 0])))]);
    db.run("COMMIT");

    const zip = new JSZip();
    zip.file("collection.anki2", db.export());
    const map: Record<string, string> = {};
    mediaOut.forEach((m, i) => { map[String(i)] = m.name; zip.file(String(i), m.bytes, { compression: "STORE" }); });
    zip.file("media", JSON.stringify(map));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return { bytes, stats: { notes: noteCount, cards: cardCount, decks: exportDecks.length, media: mediaOut.length, revlog: revCount, skippedMedia, bytes: bytes.length } };
  } finally {
    db.close();
  }
}

/** Media URLs referenced by the notes of a deck subtree (so the client only downloads what it needs). */
export function referencedMedia(backup: Backup, deckId?: number | null): string[] {
  const live = backup.decks.filter((d) => !d.filtered);
  const scope = new Set(deckId != null ? descendantIds(live, deckId) : live.map((d) => d.id));
  const blob = JSON.stringify(backup.notes.filter((n: NoteRecord) => scope.has(n.deckId)).map((n) => n.fields));
  return backup.media.filter((m) => blob.includes(JSON.stringify(m.url).slice(1, -1))).map((m) => m.url);
}
