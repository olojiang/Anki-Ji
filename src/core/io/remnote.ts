/**
 * RemNote Markdown / text export. Each bullet is a Rem; indentation is the hierarchy.
 *  `A >> B` forward, `A << B` backward, `A :: B` / `A <> B` both ways, `A ;; B` descriptor (forward),
 *  `A >>>` multi-line (children are the answer), `{{cloze}}` → cloze. Non-card parents become (sub-)decks.
 */
import { newDraft, type DraftNote, type ImportDraft } from "./draft";
import { curlyToCloze, extractTags, findSeparator } from "./text";

interface Rem { text: string; indent: number; children: Rem[] }

function parseTree(text: string): Rem[] {
  const root: Rem = { text: "", indent: -1, children: [] };
  const stack: Rem[] = [root];
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const ws = /^[ \t]*/.exec(raw)![0];
    const indent = [...ws].reduce((n, c) => n + (c === "\t" ? 4 : 1), 0);
    const t = raw.slice(ws.length).replace(/^([-*+•]|\d+\.)\s+/, "").replace(/\s+$/, "");
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const rem: Rem = { text: t, indent, children: [] };
    stack[stack.length - 1].children.push(rem);
    stack.push(rem);
  }
  return root.children;
}

const clean = (s: string) => s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b ?? a).trim();

type Kind = { type: DraftNote["type"]; front: string; back: string; multi?: boolean };
function classify(text: string): Kind | null {
  const t = text.trimEnd();
  if (/>>>$/.test(t) && findSeparator(t, ">>>") === t.length - 3) return { type: "basic", front: t.slice(0, -3), back: "", multi: true };
  const seps: [string, (a: string, b: string) => Kind][] = [
    ["<>", (a, b) => ({ type: "basic_reverse", front: a, back: b })],
    ["::", (a, b) => ({ type: "basic_reverse", front: a, back: b })],
    [";;", (a, b) => ({ type: "basic", front: a, back: b })],
    [">>", (a, b) => ({ type: "basic", front: a, back: b })],
    ["<<", (a, b) => ({ type: "basic", front: b, back: a })],
  ];
  let best: { i: number; sep: string; make: (a: string, b: string) => Kind } | null = null;
  for (const [sep, make] of seps) { const i = findSeparator(t, sep); if (i > 0 && (!best || i < best.i)) best = { i, sep, make }; }
  if (best) return best.make(t.slice(0, best.i), t.slice(best.i + best.sep.length));
  if (/\{\{.+?\}\}/.test(t)) return { type: "cloze", front: t, back: "" };
  return null;
}

const flatten = (rems: Rem[], depth = 0): string[] => rems.flatMap((r) => [`${"  ".repeat(depth)}- ${clean(r.text)}`, ...flatten(r.children, depth + 1)]);

export function parseRemNote(text: string, opts: { rootDeck: string }): ImportDraft {
  const draft = newDraft("remnote");
  const deckOf = (path: string[]) => [opts.rootDeck, ...path].filter(Boolean).join("::") || "Default";
  const visit = (rem: Rem, path: string[]) => {
    const k = classify(rem.text);
    if (!k) { if (rem.children.length) rem.children.forEach((c) => visit(c, [...path, clean(extractTags(rem.text).text).replace(/::/g, ":")])); return; }
    const f = extractTags(clean(k.front)), b = extractTags(k.multi ? flatten(rem.children).join("\n") : clean(k.back));
    if (k.type === "cloze") draft.notes.push({ deckPath: deckOf(path), type: "cloze", fields: { text: curlyToCloze(f.text), extra: "" }, tags: f.tags });
    else if (f.text) draft.notes.push({ deckPath: deckOf(path), type: k.type, fields: { front: f.text, back: b.text }, tags: [...new Set([...f.tags, ...b.tags])] });
    if (!k.multi) rem.children.forEach((c) => visit(c, path));
  };
  parseTree(text).forEach((r) => visit(r, []));
  return draft;
}
