/**
 * Anki-compatible cloze deletions: {{c1::answer}} / {{c1::answer::hint}}, nested clozes allowed.
 */
export interface ClozeNode {
  ord: number;
  start: number; // index of "{{"
  contentStart: number;
  contentEnd: number; // end of answer (before ::hint or }})
  end: number; // index after "}}"
  content: string;
  hint: string | null;
  children: ClozeNode[];
}

const OPEN = /\{\{c(\d+)::/y;

function parseTree(text: string): ClozeNode[] {
  const roots: ClozeNode[] = [];
  const stack: { ord: number; start: number; contentStart: number; children: ClozeNode[] }[] = [];
  let i = 0;
  while (i < text.length) {
    OPEN.lastIndex = i;
    const m = OPEN.exec(text);
    if (m) {
      stack.push({ ord: Number(m[1]), start: i, contentStart: i + m[0].length, children: [] });
      i += m[0].length;
      continue;
    }
    if (text.startsWith("}}", i) && stack.length) {
      const open = stack.pop()!;
      const closeStart = i;
      // first top-level "::" (outside nested children) starts the hint
      let sep = -1;
      let j = open.contentStart;
      while (j < closeStart - 1) {
        const child = open.children.find((c) => c.start === j);
        if (child) { j = child.end; continue; }
        if (text.startsWith("::", j)) { sep = j; break; }
        j++;
      }
      const contentEnd = sep >= 0 ? sep : closeStart;
      const node: ClozeNode = {
        ord: open.ord, start: open.start, contentStart: open.contentStart, contentEnd, end: closeStart + 2,
        content: "", hint: sep >= 0 ? text.slice(sep + 2, closeStart) : null,
        children: open.children.filter((c) => c.end <= contentEnd),
      };
      node.content = renderRange(text, node.contentStart, node.contentEnd, node.children, -1, "back", false);
      (stack.length ? stack[stack.length - 1].children : roots).push(node);
      i += 2;
      continue;
    }
    i++;
  }
  // unmatched openers are literal text; their completed children bubble up
  for (const s of stack) roots.push(...s.children);
  return roots.sort((a, b) => a.start - b.start);
}

function renderRange(text: string, from: number, to: number, nodes: ClozeNode[], active: number, side: "front" | "back", markup = true): string {
  let out = "";
  let pos = from;
  for (const n of nodes) {
    if (n.start < from || n.end > to) continue;
    out += text.slice(pos, n.start);
    if (n.ord === active && markup) {
      out += side === "front"
        ? `<span class="cloze">[${n.hint ?? "..."}]</span>`
        : `<span class="cloze">${renderRange(text, n.contentStart, n.contentEnd, n.children, -1, side, false)}</span>`;
    } else {
      out += renderRange(text, n.contentStart, n.contentEnd, n.children, active, side, markup);
    }
    pos = n.end;
  }
  return out + text.slice(pos, to);
}

function flatten(nodes: ClozeNode[], out: ClozeNode[] = []): ClozeNode[] {
  for (const n of nodes) { out.push(n); flatten(n.children, out); }
  return out;
}

export function parseCloze(text: string): ClozeNode[] {
  return flatten(parseTree(text)).sort((a, b) => a.start - b.start);
}

export function clozeOrdinals(text: string): number[] {
  return [...new Set(parseCloze(text).map((n) => n.ord))].filter((n) => n > 0).sort((a, b) => a - b);
}

export function hasCloze(text: string): boolean {
  return clozeOrdinals(text).length > 0;
}

export function renderCloze(text: string, ord: number, side: "front" | "back"): string {
  return renderRange(text, 0, text.length, parseTree(text), ord, side);
}

/** Plain text with cloze markup removed (answers kept). */
export function stripCloze(text: string): string {
  return renderRange(text, 0, text.length, parseTree(text), -1, "back", false);
}
