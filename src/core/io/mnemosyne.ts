/**
 * Mnemosyne: 1.x XML export (<mnemosyne><category/><item><cat/><Q/><A/></item>) and 2.x `.cards`
 * (zip with cards.xml in openSM2sync log format: type 10 = tag, 16 = fact, 6 = card) plus media files.
 */
import JSZip from "jszip";
import { newDraft, mediaRef, type DraftNote, type ImportDraft } from "./draft";
import { parseXml, childText } from "./xml";
import { zipEntries } from "./markdown";
import { normalizeTag } from "./text";

export interface MnemosyneOptions { rootDeck: string; resolveMedia?: (src: string) => string | null }

const deckOf = (...p: string[]) => p.filter(Boolean).join("::") || "Default";

function mediaIn(s: string, opts: MnemosyneOptions): string {
  if (!opts.resolveMedia) return s;
  return s.replace(/(<(?:img|audio|video|sound|source)\b[^>]*\ssrc=)(["'])([^"']+)\2/gi, (m, pre, q, src: string) => {
    if (/^(https?:|data:)/i.test(src)) return m;
    const name = opts.resolveMedia!(src);
    return name ? `${pre}${q}${mediaRef(name)}${q}` : m;
  });
}

/** `[word]` (Mnemosyne cloze) → `{{cN::word}}`. */
const bracketCloze = (s: string) => { let n = 0; return s.replace(/\[([^\]]+)\]/g, (_, w) => `{{c${++n}::${w}}}`); };

export function parseMnemosyneXml(text: string, opts: MnemosyneOptions): ImportDraft {
  const doc = parseXml(text.replace(/^\uFEFF/, ""));
  const draft = newDraft("mnemosyne");
  const f = (s: string) => mediaIn(s, opts);
  if (doc.name === "mnemosyne") {
    for (const it of doc.children.filter((c) => c.name === "item")) {
      const q = childText(it, "Q");
      if (!q) continue;
      draft.notes.push({ deckPath: deckOf(opts.rootDeck, childText(it, "cat").replace(/::/g, ":")), type: "basic", fields: { front: f(q), back: f(childText(it, "A")) }, tags: [], guid: it.attrs.id ? `mnemosyne-${it.attrs.id}` : undefined });
    }
    return draft;
  }
  if (doc.name !== "openSM2sync") throw new Error("not_mnemosyne");
  const tags = new Map<string, string>();
  const facts: { id: string; data: Record<string, string> }[] = [];
  const cardTypes = new Map<string, { type: string; tags: string[] }>();
  for (const log of doc.children.filter((c) => c.name === "log")) {
    const t = log.attrs.type, id = log.attrs.o_id;
    if (t === "10") tags.set(id, childText(log, "name"));
    else if (t === "16") facts.push({ id, data: Object.fromEntries(log.children.map((c) => [c.name, c.text.trim()])) });
    else if (t === "6" && log.attrs.fact && !cardTypes.has(log.attrs.fact)) cardTypes.set(log.attrs.fact, { type: (log.attrs.card_t ?? "1").split("::")[0], tags: (log.attrs.tags ?? "").split(",").filter(Boolean) });
  }
  for (const fact of facts) {
    const d = fact.data;
    const ct = cardTypes.get(fact.id);
    const tagNames = (ct?.tags ?? []).map((id) => tags.get(id) ?? "").filter((n) => n && n !== "__UNTAGGED__").map(normalizeTag);
    const type = ct?.type ?? (d.text ? "5" : "1");
    const deckPath = deckOf(opts.rootDeck, tagNames[0] ?? "");
    let note: DraftNote | null = null;
    const base = { deckPath, tags: tagNames, guid: `mnemosyne-${fact.id}` };
    if (type === "5" || (d.text && !d.f)) note = { ...base, type: "cloze", fields: { text: f(bracketCloze(d.text ?? "")), extra: "" } };
    else if (type === "3") note = { ...base, type: "basic_reverse", fields: { front: f(d.f ?? ""), back: f([d.p_1, d.m_1, d.n].filter(Boolean).join("\n")) } };
    else {
      const vals = Object.values(d).filter(Boolean);
      const front = d.f ?? d.loc ?? vals[0] ?? "", back = d.b ?? d.marked ?? vals.slice(1).join("\n");
      note = { ...base, type: type === "2" ? "basic_reverse" : "basic", fields: { front: f(front), back: f(back) } };
    }
    if (note && (note.fields.front || note.fields.text)) draft.notes.push(note);
  }
  return draft;
}

export async function parseMnemosyneCards(bytes: Uint8Array, opts: { rootDeck: string }): Promise<ImportDraft> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error("not_mnemosyne"); }
  const entries = zipEntries(zip);
  const xml = entries.find((e) => /(^|\/)cards\.xml$/i.test(e.path));
  if (!xml) throw new Error("not_mnemosyne");
  const files = new Map(entries.filter((e) => e !== xml).map((e) => [e.path.toLowerCase(), e]));
  const used = new Map<string, JSZip.JSZipObject>();
  const resolveMedia = (src: string) => {
    let p = src; try { p = decodeURI(src); } catch { /* keep */ }
    const e = files.get(p.replace(/^\.?\//, "").toLowerCase());
    if (!e) return null;
    used.set(e.path, e.file);
    return e.path;
  };
  const draft = parseMnemosyneXml(await xml.file.async("string"), { rootDeck: opts.rootDeck, resolveMedia });
  for (const [name, file] of used) draft.media.push({ name, data: await file.async("uint8array") });
  return draft;
}
