/**
 * .apkg import of Anki models as note types. Stock-shaped models (Basic / reversed / type-in / Cloze, in any UI
 * language) keep using the built-in types exactly as before; every other model becomes a custom note type with
 * its real fields, templates and CSS.
 */
import type { AnkiModel } from "./apkg";
import type { NoteTypeRecord } from "./backup";

const ANKI_MEDIA_PREFIX = "anki-media:"; // same as apkg.ts (kept local to avoid an import cycle)

/** Generic protobuf reader: field number → values (varints as numbers, length-delimited as bytes). */
export function readProto(buf: Uint8Array): Map<number, (number | Uint8Array)[]> {
  const out = new Map<number, (number | Uint8Array)[]>();
  let p = 0;
  const varint = () => { let x = 0, s = 0; for (;;) { if (p >= buf.length) return x; const c = buf[p++]; x += (c & 0x7f) * 2 ** s; if (c < 0x80) return x; s += 7; } };
  try {
    while (p < buf.length) {
      const key = varint();
      const field = Math.floor(key / 8), wire = key & 7;
      let v: number | Uint8Array;
      if (wire === 0) v = varint();
      else if (wire === 2) { const len = varint(); v = buf.subarray(p, p + len); p += len; }
      else if (wire === 5) { p += 4; continue; }
      else if (wire === 1) { p += 8; continue; }
      else break;
      (out.get(field) ?? out.set(field, []).get(field)!).push(v);
    }
  } catch { /* truncated config: keep what was read */ }
  return out;
}
const dec = new TextDecoder();
export const protoStr = (m: Map<number, (number | Uint8Array)[]>, f: number): string | undefined => { const v = m.get(f)?.[0]; return v instanceof Uint8Array ? dec.decode(v) : undefined; };
export const protoNum = (m: Map<number, (number | Uint8Array)[]>, f: number): number | undefined => { const v = m.get(f)?.[0]; return typeof v === "number" ? v : undefined; };

const norm = (s: string | undefined) => (s ?? "").replace(/<br\s*\/?>/gi, "").replace(/\s+/g, "");

/** True when the model is one of Anki's stock types (judged by structure, so localised field names still match). */
export function isStockAnkiModel(m: AnkiModel): boolean {
  const t = m.templates ?? [];
  if (!t.length || t.every((x) => !x.qfmt)) return true;
  const f = m.fieldNames.map((x) => x.replace(/\s+/g, ""));
  const q = t.map((x) => norm(x.qfmt));
  if (m.type === 1) return f.length <= 2 && t.length === 1 && q[0] === `{{cloze:${f[0]}}}`;
  if (f.length === 2) {
    if (t.length > 2) return false;
    if (q[0] !== `{{${f[0]}}}` && q[0] !== `{{${f[0]}}}{{type:${f[1]}}}`) return false;
    return t.length === 1 || q[1] === `{{${f[1]}}}`;
  }
  if (f.length === 3 && t.length === 2) return q[0] === `{{${f[0]}}}` && q[1] === `{{#${f[2]}}}{{${f[1]}}}{{/${f[2]}}}`; // optional reversed
  return false;
}

export function ankiModelToNoteType(m: AnkiModel): NoteTypeRecord {
  const fields = (m.fields ?? m.fieldNames.map((name) => ({ name }))).map((f, i) => ({
    id: `f${i}`, name: f.name,
    ...(f.font ? { font: f.font } : {}), ...(f.size ? { size: f.size } : {}), ...(f.rtl ? { rtl: true } : {}),
  }));
  const tpls = m.templates ?? [];
  return {
    id: m.id, name: m.name || "Anki", kind: m.type === 1 ? "cloze" : "standard",
    fields,
    templates: (m.type === 1 ? tpls.slice(0, 1) : tpls).map((t, i) => ({ ord: i, name: t.name || `Card ${i + 1}`, front: t.qfmt ?? "", back: t.afmt ?? "" })),
    css: m.css ?? "", sortField: Math.max(0, Math.min(fields.length - 1, m.sortf ?? 0)), markdown: false, sourceKey: `anki:${m.id}`,
  };
}

/** Anki field HTML for a custom note type: media → placeholders, [sound:] → <audio>. */
export function convertAnkiFieldHtml(html: string): string {
  return html
    .replace(/\[sound:([^\]]+)\]/g, (_, f: string) => `<audio controls preload="none" src="${ANKI_MEDIA_PREFIX}${f.trim()}"></audio>`)
    .replace(/(<img[^>]*\ssrc=)(["']?)([^"'\s>]+)\2/gi, (m, pre, _q, src) => (/^(https?:|data:)/i.test(src) ? m : `${pre}"${ANKI_MEDIA_PREFIX}${src}"`));
}
