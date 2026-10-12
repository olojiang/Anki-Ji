/**
 * Markdown / Obsidian importer (Obsidian Spaced Repetition plugin syntax):
 *  - `Q::A` basic, `Q:::A` basic + reverse
 *  - multi-line: question lines, a line `?` (or `??` for reversed), answer lines; a blank line ends the card
 *  - `==highlight==` and `{{c1::…}}` paragraphs → cloze
 *  - headings → nested decks, `#tags` → tags (front-matter tags apply to the whole file)
 *  - `![[img.png]]` / `![](path)` resolved against a zipped vault's attachments
 */
import JSZip from "jszip";
import { newDraft, mediaRef, type DraftNote, type ImportDraft } from "./draft";
import { basename, extractTags, findSeparator, hasAnyCloze, highlightsToCloze, normalizeTag, stripExt } from "./text";

export interface MarkdownOptions {
  rootDeck: string;
  headingsAsDecks?: boolean;
  /** Map an embed path to a media name (key into the draft's media), or null when the file is not available. */
  resolveMedia?: (ref: string) => string | null;
}

function frontMatter(text: string): { body: string; tags: string[] } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { body: text, tags: [] };
  const tags: string[] = [];
  const lines = m[1].split(/\r?\n/);
  lines.forEach((l, i) => {
    const t = /^(tags?)\s*:\s*(.*)$/i.exec(l);
    if (!t) return;
    const v = t[2].trim();
    if (v) tags.push(...v.replace(/^\[|\]$/g, "").split(/[,\s]+/).map((x) => x.replace(/^["']|["']$/g, "")));
    else for (let j = i + 1; j < lines.length && /^\s*-\s+/.test(lines[j]); j++) tags.push(lines[j].replace(/^\s*-\s+/, "").replace(/^["']|["']$/g, ""));
  });
  return { body: text.slice(m[0].length), tags: tags.map(normalizeTag).filter(Boolean) };
}

export function parseMarkdown(text: string, opts: MarkdownOptions, draft: ImportDraft = newDraft("markdown")): ImportDraft {
  const { body, tags: fmTags } = frontMatter(text.replace(/^\uFEFF/, ""));
  const fileTags = new Set(fmTags);
  const cards: DraftNote[] = [];
  const headings: string[] = [];
  const deck = () => [opts.rootDeck, ...(opts.headingsAsDecks === false ? [] : headings.filter(Boolean))].filter(Boolean).join("::") || "Default";

  const embed = (s: string) => s
    .replace(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, (m, ref: string) => {
      const name = opts.resolveMedia?.(ref.trim()) ?? null;
      if (!name) { draft.warnings.push(`media not found: ${ref.trim()}`); return m; }
      return `![${basename(name)}](${mediaRef(name)})`;
    })
    .replace(/!\[([^\]]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g, (m, alt: string, url: string) => {
      if (/^(https?:|data:|import-media:)/i.test(url)) return m;
      let ref = url;
      try { ref = decodeURI(url); } catch { /* keep raw */ }
      const name = opts.resolveMedia?.(ref) ?? null;
      if (!name) { draft.warnings.push(`media not found: ${ref}`); return m; }
      return `![${alt || basename(name)}](${mediaRef(name)})`;
    });
  const side = (s: string) => { const r = extractTags(s); return { text: embed(r.text), tags: r.tags }; };
  const push = (type: DraftNote["type"], q: string, a: string) => {
    const f = side(q), b = side(a);
    if (!f.text) return;
    cards.push({ deckPath: deck(), type, fields: { front: f.text, back: b.text }, tags: [...f.tags, ...b.tags] });
  };

  const flush = (block: { text: string; code: boolean }[]) => {
    if (!block.length) return;
    const qi = block.findIndex((l) => !l.code && /^\?\??$/.test(l.text.trim()));
    if (qi > 0) {
      push(block[qi].text.trim() === "??" ? "basic_reverse" : "basic", block.slice(0, qi).map((l) => l.text).join("\n"), block.slice(qi + 1).map((l) => l.text).join("\n"));
      return;
    }
    let found = false;
    const rest: string[] = [];
    for (const l of block) {
      if (!l.code) {
        const i3 = findSeparator(l.text, ":::");
        const i2 = i3 < 0 ? findSeparator(l.text, "::") : -1;
        if (i3 > 0 || i2 > 0) {
          found = true;
          const i = i3 > 0 ? i3 : i2;
          push(i3 > 0 ? "basic_reverse" : "basic", l.text.slice(0, i), l.text.slice(i + (i3 > 0 ? 3 : 2)));
          continue;
        }
      }
      rest.push(l.text);
    }
    const all = block.filter((l) => !l.code).map((l) => l.text).join("\n");
    if (!found && hasAnyCloze(all)) {
      const r = side(block.map((l) => l.text).join("\n"));
      cards.push({ deckPath: deck(), type: "cloze", fields: { text: highlightsToCloze(r.text), extra: "" }, tags: r.tags });
      return;
    }
    for (const t of extractTags(rest.join("\n")).tags) fileTags.add(t);
  };

  let block: { text: string; code: boolean }[] = [];
  let fence = false;
  for (const raw of body.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; block.push({ text: line, code: true }); continue; }
    if (fence) { block.push({ text: line, code: true }); continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (h) {
      flush(block); block = [];
      const level = h[1].length;
      headings.length = level;
      headings[level - 1] = extractTags(h[2]).text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b ?? a).replace(/::/g, ":").trim();
      continue;
    }
    if (!line.trim()) { flush(block); block = []; continue; }
    block.push({ text: line, code: false });
  }
  flush(block);
  fileTags.delete("flashcards");
  for (const c of cards) c.tags = [...new Set([...fileTags, ...c.tags])];
  draft.notes.push(...cards);
  return draft;
}

const IGNORED = (p: string) => p.startsWith("__MACOSX/") || p.split("/").some((s) => s.startsWith("."));

/** Strip a single shared top-level folder (zips of a folder usually have one). */
export function zipEntries(zip: JSZip): { path: string; file: JSZip.JSZipObject }[] {
  const files = Object.values(zip.files).filter((f) => !f.dir && !IGNORED(f.name)).map((f) => ({ path: f.name, file: f }));
  const tops = new Set(files.map((f) => (f.path.includes("/") ? f.path.split("/")[0] : "")));
  if (tops.size === 1 && !tops.has("")) { const top = [...tops][0] + "/"; return files.map((f) => ({ ...f, path: f.path.slice(top.length) })); }
  return files;
}

export async function parseObsidianVault(bytes: Uint8Array, opts: { rootDeck: string; headingsAsDecks?: boolean }): Promise<ImportDraft> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error("not_zip"); }
  const entries = zipEntries(zip).sort((a, b) => a.path.localeCompare(b.path));
  const isMd = (p: string) => /\.(md|markdown)$/i.test(p);
  const attachments = new Map<string, { path: string; file: JSZip.JSZipObject }[]>();
  for (const e of entries) if (!isMd(e.path)) { const k = basename(e.path).toLowerCase(); attachments.set(k, [...(attachments.get(k) ?? []), e]); }
  const used = new Map<string, JSZip.JSZipObject>();
  const resolveMedia = (ref: string) => {
    const hits = attachments.get(basename(ref).toLowerCase());
    if (!hits?.length) return null;
    const exact = hits.find((h) => h.path.endsWith(ref.replace(/^(\.\.\/|\.\/)+/, ""))) ?? hits[0];
    const name = hits.length > 1 ? exact.path : basename(exact.path);
    used.set(name, exact.file);
    return name;
  };
  const draft = newDraft("obsidian");
  for (const e of entries.filter((x) => isMd(x.path))) {
    const segs = stripExt(e.path).split("/");
    parseMarkdown(await e.file.async("string"), { rootDeck: [opts.rootDeck, ...segs].filter(Boolean).join("::"), headingsAsDecks: opts.headingsAsDecks, resolveMedia }, draft);
  }
  for (const [name, file] of used) draft.media.push({ name, data: await file.async("uint8array") });
  return draft;
}
