/** Minimal EDN reader (enough for Mochi's data.edn). Keywords and symbols become strings (without the colon),
 * maps become plain objects, vectors / lists / sets become arrays, tagged literals (#inst, #uuid…) yield their value. */
export type Edn = null | boolean | number | string | Edn[] | { [k: string]: Edn };

export function parseEdn(src: string): Edn {
  let i = 0;
  const ws = () => {
    for (;;) {
      while (i < src.length && /[\s,]/.test(src[i])) i++;
      if (src[i] === ";") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (src[i] === "#" && src[i + 1] === "_") { i += 2; read(); continue; }
      return;
    }
  };
  const DELIM = /[\s,()[\]{}"\\;]/;
  const token = () => { const s = i; while (i < src.length && !DELIM.test(src[i])) i++; return src.slice(s, i); };
  const seq = (close: string): Edn[] => {
    const out: Edn[] = [];
    for (;;) { ws(); if (i >= src.length) throw new Error("edn_eof"); if (src[i] === close) { i++; return out; } out.push(read()); }
  };
  function read(): Edn {
    ws();
    const c = src[i];
    if (c === undefined) throw new Error("edn_eof");
    if (c === "{") { i++; const items = seq("}"); const o: Record<string, Edn> = {}; for (let k = 0; k + 1 < items.length; k += 2) o[String(items[k])] = items[k + 1]; return o; }
    if (c === "[") { i++; return seq("]"); }
    if (c === "(") { i++; return seq(")"); }
    if (c === "#") {
      if (src[i + 1] === "{") { i += 2; return seq("}"); }
      i++; token(); return read(); // tagged literal: #inst "…" → "…"
    }
    if (c === '"') {
      i++; let s = "";
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") {
          const e = src[++i];
          if (e === "u") { s += String.fromCharCode(parseInt(src.slice(i + 1, i + 5), 16)); i += 5; continue; }
          s += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[e] ?? e; i++; continue;
        }
        s += src[i++];
      }
      i++; return s;
    }
    if (c === "\\") { i++; const t = token() || src[i++]; const named: Record<string, string> = { newline: "\n", space: " ", tab: "\t", return: "\r" }; return named[t] ?? t[0]; }
    const t = token();
    if (!t) throw new Error(`edn_unexpected:${c}`);
    if (t === "nil") return null;
    if (t === "true") return true;
    if (t === "false") return false;
    if (t[0] === ":") return t.slice(1);
    if (/^[+-]?\d/.test(t)) { const n = Number(t.replace(/[NM]$/, "")); if (Number.isFinite(n)) return n; }
    return t;
  }
  return read();
}
