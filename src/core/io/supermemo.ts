/** SuperMemo Q&A text (`Q:` / `A:` lines, also `问：` / `答：`). */
import { newDraft, type ImportDraft } from "./draft";
import { parseXml, child, childText, type XmlNode } from "./xml";

const Q = /^(?:Q|问)\s*[:：]\s?/i;
const A = /^(?:A|答)\s*[:：]\s?/i;

export function parseSuperMemoText(text: string, opts: { deck: string }, draft: ImportDraft = newDraft("supermemo")): ImportDraft {
  let q: string[] | null = null, a: string[] | null = null;
  const finish = () => {
    if (q && a && q.join("").trim()) draft.notes.push({ deckPath: opts.deck || "Default", type: "basic", fields: { front: q.join("\n").trim(), back: a.join("\n").trim() }, tags: [] });
    q = a = null;
  };
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (Q.test(line)) { finish(); q = [line.replace(Q, "")]; continue; }
    if (q && !a && A.test(line)) { a = [line.replace(A, "")]; continue; }
    if (!line.trim()) { if (a) finish(); continue; }
    if (a) a.push(line); else if (q) q.push(line);
  }
  finish();
  return draft;
}

/** SuperMemo XML export: nested <SuperMemoElement>s; Topics become decks, Items become basic notes. */
export function parseSuperMemoXml(text: string, opts: { rootDeck: string }): ImportDraft {
  const draft = newDraft("supermemo-xml");
  const doc = parseXml(text.replace(/^\uFEFF/, ""));
  if (doc.name !== "SuperMemoCollection") throw new Error("not_supermemo");
  const visit = (el: XmlNode, path: string[]) => {
    const type = childText(el, "Type").toLowerCase();
    const content = child(el, "Content");
    const q = content ? childText(content, "Question") : "";
    if (type !== "topic" && q) draft.notes.push({ deckPath: [...path].filter(Boolean).join("::") || "Default", type: "basic", fields: { front: q, back: content ? childText(content, "Answer") : "" }, tags: [] });
    const sub = type === "topic" ? [...path, childText(el, "Title").replace(/::/g, ":") || "Topic"] : path;
    el.children.filter((c) => c.name === "SuperMemoElement").forEach((c) => visit(c, sub));
  };
  doc.children.filter((c) => c.name === "SuperMemoElement").forEach((c) => visit(c, [opts.rootDeck]));
  return draft;
}
