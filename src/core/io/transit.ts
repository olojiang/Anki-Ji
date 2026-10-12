/** Transit-JSON decoder (Mochi data.json). Supports array maps ("^ "), the read cache (^N), keywords, tags. */
export type Decoded = null | boolean | number | string | Decoded[] | { [k: string]: Decoded };

const CACHE_BASE = 44, CACHE_MAX = CACHE_BASE * CACHE_BASE;

export function decodeTransit(input: unknown): Decoded {
  let cache: string[] = [];
  const isRef = (s: string) => s.length > 1 && s[0] === "^" && s !== "^ ";
  const fromCache = (s: string) => cache[s.length === 2 ? s.charCodeAt(1) - 48 : (s.charCodeAt(1) - 48) * CACHE_BASE + (s.charCodeAt(2) - 48)];
  const remember = (s: string, asKey: boolean) => {
    if (s.length > 3 && (asKey || s.startsWith("~:") || s.startsWith("~$") || s.startsWith("~#"))) {
      if (cache.length >= CACHE_MAX) cache = [];
      cache.push(s);
    }
  };
  /** Resolve cache refs and register cacheable strings; returns the raw transit string. */
  const raw = (s: string, asKey: boolean) => { if (isRef(s)) return fromCache(s) ?? s; remember(s, asKey); return s; };
  const scalar = (s: string): Decoded => {
    if (s[0] !== "~") return s;
    const tag = s[1], rest = s.slice(2);
    switch (tag) {
      case "~": case "^": case "`": return s.slice(1);
      case ":": case "$": return rest;
      case "m": return new Date(Number(rest)).toISOString();
      case "t": case "u": case "r": return rest;
      case "i": case "n": case "d": case "f": return Number(rest);
      case "?": return rest === "t";
      case "_": return null;
      default: return s;
    }
  };
  const tagged = (tag: string, v: unknown): Decoded => {
    const val = decode(v, false);
    if (tag === "dt" || tag === "inst") return typeof val === "number" ? new Date(val).toISOString() : val;
    if (tag === "cmap" && Array.isArray(val)) { const o: Record<string, Decoded> = {}; for (let k = 0; k + 1 < val.length; k += 2) o[String(val[k])] = val[k + 1]; return o; }
    return val; // list, set, uuid, …
  };
  function decode(v: unknown, asKey: boolean): Decoded {
    if (typeof v === "string") return scalar(raw(v, asKey));
    if (Array.isArray(v)) {
      if (v[0] === "^ ") {
        const o: Record<string, Decoded> = {};
        for (let k = 1; k + 1 < v.length; k += 2) { const key = decode(v[k], true); o[String(key)] = decode(v[k + 1], false); }
        return o;
      }
      if (v.length === 2 && typeof v[0] === "string") {
        const head = isRef(v[0]) ? fromCache(v[0]) : v[0];
        if (head?.startsWith("~#")) { if (!isRef(v[0])) remember(v[0], false); return tagged(head.slice(2), v[1]); }
      }
      return v.map((x) => decode(x, false));
    }
    if (v && typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length === 1) {
        const k = raw(entries[0][0], true);
        if (k.startsWith("~#")) return tagged(k.slice(2), entries[0][1]);
        return { [String(scalar(k))]: decode(entries[0][1], false) };
      }
      const o: Record<string, Decoded> = {};
      for (const [k, val] of entries) o[String(scalar(raw(k, true)))] = decode(val, false);
      return o;
    }
    return (v ?? null) as Decoded;
  }
  return decode(input, false);
}
