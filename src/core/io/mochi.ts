/** Mochi `.mochi` export: a zip with data.edn or data.json (Transit) plus media files. */
import JSZip from "jszip";
import { newDraft, mediaRef, type ImportDraft } from "./draft";
import { parseEdn } from "./edn";
import { decodeTransit } from "./transit";
import { zipEntries } from "./markdown";
import { basename, curlyToCloze, normalizeTag } from "./text";

type Obj = Record<string, unknown>;
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const str = (v: unknown) => (v == null ? "" : String(v));

export async function parseMochi(bytes: Uint8Array): Promise<ImportDraft> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error("not_mochi"); }
  const entries = zipEntries(zip);
  const dataFile = entries.find((e) => /(^|\/)data\.json$/i.test(e.path)) ?? entries.find((e) => /(^|\/)data\.edn$/i.test(e.path));
  if (!dataFile) throw new Error("not_mochi");
  const text = await dataFile.file.async("string");
  let data: Obj;
  try { data = (dataFile.path.toLowerCase().endsWith(".json") ? decodeTransit(JSON.parse(text)) : parseEdn(text)) as Obj; } catch { throw new Error("not_mochi"); }
  if (!data || typeof data !== "object") throw new Error("not_mochi");

  const draft = newDraft("mochi");
  const files = new Map(entries.filter((e) => e !== dataFile).map((e) => [basename(e.path).toLowerCase(), e]));
  const used = new Map<string, JSZip.JSZipObject>();

  const templates = new Map(arr(data.templates).map((t) => [str(t.id), t]));
  const decks = arr(data.decks);
  const byId = new Map(decks.map((d) => [str(d.id), d]));
  const pathOf = (d: Obj | undefined): string => {
    const parts: string[] = []; const seen = new Set<string>();
    while (d && !seen.has(str(d.id))) { seen.add(str(d.id)); parts.unshift(str(d.name).replace(/::/g, ":") || "Mochi"); d = d["parent-id"] != null ? byId.get(str(d["parent-id"])) : undefined; }
    return parts.join("::") || "Mochi";
  };

  const render = (c: Obj) => {
    const tpl = c["template-id"] != null ? templates.get(str(c["template-id"])) : undefined;
    const fields = (c.fields ?? {}) as Record<string, Obj>;
    if (tpl && Object.keys(fields).length) {
      const defs = (tpl.fields ?? {}) as Record<string, Obj>;
      const byName = new Map(Object.entries(defs).map(([id, f]) => [str(f.name).trim().toLowerCase(), str(f.id ?? id)]));
      return str(tpl.content).replace(/<<\s*([^>]+?)\s*>>/g, (_, name: string) => { const id = byName.get(name.trim().toLowerCase()); return id ? str(fields[id]?.value) : ""; });
    }
    return str(c.content);
  };
  const media = (s: string) => s.replace(/!\[([^\]]*)\]\(@media\/([^)\s]+)\)/g, (m, alt: string, name: string) => {
    let n = name; try { n = decodeURIComponent(name); } catch { /* keep */ }
    const e = files.get(basename(n).toLowerCase());
    if (!e) { draft.warnings.push(`media not found: ${n}`); return m; }
    used.set(basename(e.path), e.file);
    return `![${alt || basename(e.path)}](${mediaRef(basename(e.path))})`;
  });

  const add = (c: Obj, deckPath: string) => {
    if (c["trashed?"]) return;
    const content = media(render(c)).replace(/\r\n?/g, "\n");
    const tags = [...new Set([...arr(c.tags), ...arr(c["manual-tags"])].map((t) => normalizeTag(str(t))).filter(Boolean))];
    const guid = c.id != null ? `mochi-${str(c.id)}` : undefined;
    const sep = /^---[ \t]*$/m.exec(content);
    if (sep) {
      const front = content.slice(0, sep.index).trim(), back = content.slice(sep.index + sep[0].length).trim();
      if (front) draft.notes.push({ deckPath, type: "basic", fields: { front, back }, tags, guid });
      return;
    }
    if (/\{\{.+?\}\}/s.test(content)) { draft.notes.push({ deckPath, type: "cloze", fields: { text: curlyToCloze(content.trim()), extra: "" }, tags, guid }); return; }
    if (content.trim()) draft.notes.push({ deckPath, type: "basic", fields: { front: content.trim(), back: "" }, tags, guid });
  };
  const byPos = (a: Obj, b: Obj) => str(a.pos).localeCompare(str(b.pos));
  for (const d of decks) [...arr(d.cards)].sort(byPos).forEach((c) => add(c, pathOf(d)));
  [...arr(data.cards)].sort(byPos).forEach((c) => add(c, pathOf(byId.get(str(c["deck-id"])))));
  for (const [name, file] of used) draft.media.push({ name, data: await file.async("uint8array") });
  return draft;
}
