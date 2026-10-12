/**
 * Anki-style search syntax: implicit AND, OR, -negation, (groups), "quoted phrases",
 * deck:, tag:, is:, flag:, type:/note:, added:, prop:, card:. Never throws.
 */
export type SearchNode =
  | { type: "all" }
  | { type: "text"; value: string }
  | { type: "field"; key: string; value: string }
  | { type: "and"; items: SearchNode[] }
  | { type: "or"; items: SearchNode[] }
  | { type: "not"; item: SearchNode };

export interface SearchItem {
  text: string;
  deckPath: string;
  tags: string[];
  noteType: string;
  state: "new" | "learning" | "review" | "relearning";
  dueDay: number | null; // study-day index the card is due (null for new)
  suspended: boolean;
  buried: boolean;
  flag: number;
  leech: boolean;
  createdDay: number;
  interval: number;
  lapses: number;
  reps: number;
  ord: number; // 0-based card index within the note
}

const KEYS = new Set(["deck", "tag", "is", "flag", "type", "note", "added", "prop", "card"]);
type Tok = { t: "(" | ")" | "or" | "-" } | { t: "word"; v: string; quoted: boolean };

function tokenize(q: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "(" || c === ")") { out.push({ t: c }); i++; continue; }
    if (c === "-" && i + 1 < q.length && !/\s/.test(q[i + 1])) { out.push({ t: "-" }); i++; continue; }
    let v = "";
    let quoted = false;
    while (i < q.length && !/\s/.test(q[i]) && q[i] !== "(" && q[i] !== ")") {
      if (q[i] === '"') {
        quoted = true;
        const end = q.indexOf('"', i + 1);
        const stop = end < 0 ? q.length : end;
        v += q.slice(i + 1, stop);
        i = stop + 1;
      } else v += q[i++];
    }
    if (!quoted && v.toLowerCase() === "or") out.push({ t: "or" });
    else if (v || quoted) out.push({ t: "word", v, quoted });
  }
  return out;
}

export function parseSearch(query: string): SearchNode {
  const toks = tokenize(query ?? "");
  let p = 0;
  const simplify = (type: "and" | "or", items: SearchNode[]): SearchNode =>
    items.length === 0 ? { type: "all" } : items.length === 1 ? items[0] : { type, items };

  function parseOr(): SearchNode {
    const items = [parseAnd()];
    while (p < toks.length && toks[p].t === "or") { p++; items.push(parseAnd()); }
    return simplify("or", items.filter((x) => x.type !== "all").length ? items.filter((x) => x.type !== "all") : items);
  }
  function parseAnd(): SearchNode {
    const items: SearchNode[] = [];
    while (p < toks.length && toks[p].t !== ")" && toks[p].t !== "or") {
      const u = parseUnary();
      if (u) items.push(u);
    }
    return simplify("and", items);
  }
  function parseUnary(): SearchNode | null {
    const tok = toks[p++];
    if (tok.t === "-") {
      if (p >= toks.length) return null;
      const inner = parseUnary();
      return inner ? { type: "not", item: inner } : null;
    }
    if (tok.t === "(") {
      const inner = parseOr();
      if (p < toks.length && toks[p].t === ")") p++;
      return inner;
    }
    if (tok.t === "word") {
      const idx = tok.v.indexOf(":");
      if (idx > 0) {
        const key = tok.v.slice(0, idx).toLowerCase();
        if (KEYS.has(key)) return { type: "field", key, value: tok.v.slice(idx + 1) };
      }
      return { type: "text", value: tok.v };
    }
    return null;
  }
  let root = parseOr();
  // tolerate stray ")" by continuing
  while (p < toks.length) { p++; const more = parseOr(); if (more.type !== "all") root = root.type === "all" ? more : { type: "and", items: [root, more] }; }
  return root;
}

const escapeRe = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
const wild = (s: string) => escapeRe(s.toLowerCase()).replace(/\*/g, ".*").replace(/_/g, ".");

function hierMatch(value: string, pattern: string): boolean {
  const re = new RegExp(`^${wild(pattern)}(::.*)?$`, "i");
  return re.test(value);
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case "<": return a < b; case ">": return a > b; case "<=": return a <= b; case ">=": return a >= b;
    case "!=": return a !== b; default: return a === b;
  }
}

export interface MatchContext { today: number }

function matchField(key: string, raw: string, it: SearchItem, ctx: MatchContext): boolean {
  const v = raw.toLowerCase();
  switch (key) {
    case "deck": return v === "*" || hierMatch(it.deckPath, raw);
    case "tag": return v === "none" ? it.tags.length === 0 : it.tags.some((t) => hierMatch(t, raw));
    case "is":
      switch (v) {
        case "new": return it.state === "new";
        case "learn": return it.state === "learning" || it.state === "relearning";
        case "review": return it.state === "review" || it.state === "relearning";
        case "due": return it.state !== "new" && it.dueDay != null && it.dueDay <= ctx.today && !it.suspended && !it.buried;
        case "suspended": return it.suspended;
        case "buried": return it.buried;
        case "leech": return it.leech;
        case "flagged": return it.flag > 0;
        default: return false;
      }
    case "flag": return Number(v) === it.flag;
    case "type": case "note": return it.noteType.toLowerCase() === v;
    case "added": { const n = Number(v); return Number.isFinite(n) && it.createdDay > ctx.today - n; }
    case "card": return Number(v) === it.ord + 1;
    case "prop": {
      const m = /^(ivl|due|lapses|reps)(<=|>=|!=|<|>|=)(-?\d+(?:\.\d+)?)$/.exec(v);
      if (!m) return false;
      const n = Number(m[3]);
      if (m[1] === "due") return it.dueDay != null && it.state !== "new" && compare(it.dueDay - ctx.today, m[2], n);
      const val = m[1] === "ivl" ? it.interval : m[1] === "lapses" ? it.lapses : it.reps;
      return compare(val, m[2], n);
    }
  }
  return false;
}

export function matches(node: SearchNode, it: SearchItem, ctx: MatchContext): boolean {
  switch (node.type) {
    case "all": return true;
    case "text": return node.value === "" || new RegExp(wild(node.value), "i").test(it.text);
    case "field": return matchField(node.key, node.value, it, ctx);
    case "and": return node.items.every((n) => matches(n, it, ctx));
    case "or": return node.items.some((n) => matches(n, it, ctx));
    case "not": return !matches(node.item, it, ctx);
  }
}
