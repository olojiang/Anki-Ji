/**
 * "Smart paste": split free-form notes into cards by simple rules, in priority order:
 *  qa (Q:/A:, 问：/答：, numbered question + answer line) · numbered (numbered question + indented answer)
 *  · cloze ({{c1::}} / ==highlight==) · double_colon (`::`, `:::` reversed) · tab · colon (`：`, or `: ` with a short term)
 *  · dash (` - ` / ` – ` / ` — `) · equals (` = `). Headings become sub-decks. Unmatched lines are reported.
 */
import { newDraft, type DraftNote, type ImportDraft } from "./draft";
import { findSeparator, hasAnyCloze, highlightsToCloze } from "./text";

const Q_RE = /^(?:Q|Question|问|问题)\s*[:：]\s*(.+)$/i;
const A_RE = /^(?:A|Answer|答|答案)\s*[:：]\s*(.*)$/i;
const NUM_RE = /^\d+\s*[.)、．]\s*(.+)$/;
const PREFIX = /^(?:[-*+•]|\d+\s*[.)、．])\s*/;
const indented = (l: string) => /^(\s{2,}|\t)\S/.test(l);

type Pair = { rule: string; type: DraftNote["type"]; front: string; back: string };

export function splitPair(content: string): Pair | null {
  const mk = (rule: string, a: string, b: string, type: DraftNote["type"] = "basic"): Pair | null => (a.trim() && b.trim() ? { rule, type, front: a.trim(), back: b.trim() } : null);
  if (hasAnyCloze(content)) return { rule: "cloze", type: "cloze", front: highlightsToCloze(content.trim()), back: "" };
  const i3 = findSeparator(content, ":::");
  if (i3 > 0) return mk("double_colon", content.slice(0, i3), content.slice(i3 + 3), "basic_reverse");
  const i2 = findSeparator(content, "::");
  if (i2 > 0) return mk("double_colon", content.slice(0, i2), content.slice(i2 + 2));
  const tab = content.indexOf("\t");
  if (tab > 0) return mk("tab", content.slice(0, tab), content.slice(tab + 1));
  const cn = content.indexOf("：");
  if (cn > 0 && cn <= 80) return mk("colon", content.slice(0, cn), content.slice(cn + 1));
  const dash = / [-–—] /.exec(content);
  if (dash && dash.index > 0) return mk("dash", content.slice(0, dash.index), content.slice(dash.index + 3));
  const eq = content.indexOf(" = ");
  if (eq > 0) return mk("equals", content.slice(0, eq), content.slice(eq + 3));
  const colon = /:\s/.exec(content);
  if (colon && colon.index > 0 && colon.index <= 80 && !/:\/\//.test(content.slice(0, colon.index + 3))) return mk("colon", content.slice(0, colon.index), content.slice(colon.index + 1));
  return null;
}

export function smartPaste(text: string, opts: { deck: string }): ImportDraft {
  const draft = newDraft("smart");
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const headings: string[] = [];
  const deck = () => [opts.deck, ...headings.filter(Boolean)].filter(Boolean).join("::") || "Default";
  const push = (rule: string, type: DraftNote["type"], front: string, back: string) =>
    draft.notes.push({ deckPath: deck(), type, fields: type === "cloze" ? { text: front, extra: back } : { front, back }, tags: [], rule });
  const continuation = (from: number) => { const out: string[] = []; let j = from; while (j < lines.length && indented(lines[j])) out.push(lines[j++].trim()); return { out, next: j }; };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const t = line.trim();
    if (!t) continue;
    const h = /^(#{1,6})\s+(.+)$/.exec(t);
    if (h) { headings.length = h[1].length; headings[h[1].length - 1] = h[2].replace(/::/g, ":").trim(); continue; }
    const qm = Q_RE.exec(t) ?? NUM_RE.exec(t);
    if (qm) {
      const q = continuation(i + 1);
      const front = [qm[1], ...q.out].join("\n").trim();
      const am = q.next < lines.length ? A_RE.exec(lines[q.next].trim()) : null;
      if (am) {
        const a = continuation(q.next + 1);
        push("qa", "basic", front, [am[1], ...a.out].join("\n").trim());
        i = a.next - 1; continue;
      }
      if (NUM_RE.test(t) && q.out.length) { push("numbered", "basic", qm[1].trim(), q.out.join("\n")); i = q.next - 1; continue; }
    }
    const p = splitPair(t.replace(PREFIX, ""));
    if (p) { push(p.rule, p.type, p.front, p.back); continue; }
    draft.warnings.push(`unmatched line ${i + 1}: ${t}`);
  }
  return draft;
}
