/** SuperMemo Q&A text (`Q:` / `A:` lines, also `问：` / `答：`). */
import { newDraft, type ImportDraft } from "./draft";

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
