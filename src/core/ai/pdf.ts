/**
 * Minimal zero-dependency PDF text extractor (decision: pdf.js is ~3 MB, too heavy for one feature).
 * Handles uncompressed + FlateDecode content streams, per-font ToUnicode CMaps (bfchar / bfrange, Type0 two-byte
 * and simple one-byte fonts, so CJK PDFs from Chrome/Word/LaTeX generators work), Tj / TJ / ' / " operators and
 * Td / TD / Tm / T* line breaks. Scanned / image-only PDFs, encrypted PDFs and object-stream-only fonts are not
 * supported — the UI then asks the user to paste text instead.
 * The inflate function is injected so src/core stays platform-neutral.
 */
export type Inflate = (data: Uint8Array) => Uint8Array;

const latin1 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s; };

interface Obj { num: number; dict: string; data: Uint8Array | null }
interface Font { map: Map<number, string>; bytes: 1 | 2 }

function indexObjects(bytes: Uint8Array, src: string): Map<number, Obj> {
  const objs = new Map<number, Obj>();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const bodyStart = m.index + m[0].length;
    const endobj = src.indexOf("endobj", bodyStart);
    const streamKw = /(?<!end)stream\r?\n/g;
    streamKw.lastIndex = bodyStart;
    const sm = streamKw.exec(src);
    let dict: string, data: Uint8Array | null = null, next = endobj < 0 ? src.length : endobj;
    if (sm && (endobj < 0 || sm.index < endobj)) {
      dict = src.slice(bodyStart, sm.index);
      const start = sm.index + sm[0].length;
      let end = -1;
      const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      if (len && /^\s*endstream/.test(src.slice(start + Number(len[1]), start + Number(len[1]) + 12))) end = start + Number(len[1]);
      if (end < 0) end = src.indexOf("endstream", start);
      if (end < 0) break;
      let stop = end; while (stop > start && (src[stop - 1] === "\n" || src[stop - 1] === "\r")) stop--;
      data = bytes.subarray(start, stop);
      const eo = src.indexOf("endobj", end);
      next = eo < 0 ? src.length : eo;
    } else dict = src.slice(bodyStart, next);
    objs.set(Number(m[1]), { num: Number(m[1]), dict, data });
    re.lastIndex = next;
  }
  return objs;
}

function decodeStream(o: Obj, inflate: Inflate): string | null {
  if (!o.data) return null;
  if (/\/Filter\s*(\[\s*)?\/(DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode)/.test(o.dict) || /\/Subtype\s*\/Image/.test(o.dict)) return null;
  if (/\/FlateDecode/.test(o.dict)) { try { return latin1(inflate(o.data)); } catch { return null; } }
  if (/\/Filter/.test(o.dict)) return null;
  return latin1(o.data);
}

const hexToStr = (h: string) => { let s = ""; for (let i = 0; i < h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4).padEnd(4, "0"), 16)); return s; };

function parseCMap(src: string, map: Map<number, string>) {
  for (const block of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(m[1], 16), hexToStr(m[2]));
  for (const block of src.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
      if (hi < lo || hi - lo > 65535) continue;
      if (m[3]) {
        const base = hexToStr(m[3]);
        const head = base.slice(0, -1), last = base.charCodeAt(base.length - 1);
        for (let c = lo; c <= hi; c++) map.set(c, head + String.fromCharCode(last + (c - lo)));
      } else [...(m[4] ?? "").matchAll(/<([0-9a-fA-F]+)>/g)].forEach((x, k) => map.set(lo + k, hexToStr(x[1])));
    }
  }
}

function literal(s: string, i: number): [string, number] {
  let depth = 1, out = "";
  for (i++; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      const n = s[++i];
      if (n === "n") out += "\n"; else if (n === "r") out += "\r"; else if (n === "t") out += "\t"; else if (n === "b") out += "\b"; else if (n === "f") out += "\f";
      else if (n >= "0" && n <= "7") { let o = n; while (o.length < 3 && s[i + 1] >= "0" && s[i + 1] <= "7") o += s[++i]; out += String.fromCharCode(parseInt(o, 8) & 0xff); }
      else if (n === "\r" || n === "\n") { if (n === "\r" && s[i + 1] === "\n") i++; }
      else out += n ?? "";
    } else if (c === "(") { depth++; out += c; }
    else if (c === ")") { if (--depth === 0) return [out, i + 1]; out += c; }
    else out += c;
  }
  return [out, i];
}

function mapBytes(raw: string, font: Font | undefined): string {
  if (font && font.map.size) {
    let out = "";
    for (let i = 0; i < raw.length; i += font.bytes) {
      const code = font.bytes === 2 ? (raw.charCodeAt(i) << 8) | (raw.charCodeAt(i + 1) || 0) : raw.charCodeAt(i);
      out += font.map.get(code) ?? (font.bytes === 1 ? raw[i] : "");
    }
    return out;
  }
  if (font?.bytes === 2) return ""; // CID font without ToUnicode: codes are glyph ids, not text
  if (raw.startsWith("\u00fe\u00ff")) { let o = ""; for (let i = 2; i + 1 < raw.length; i += 2) o += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1)); return o; }
  return raw;
}

type Tok = { t: "str"; s: string } | { t: "num"; n: number } | { t: "name"; s: string } | { t: "op"; s: string } | { t: "arr"; v: Tok[] };

function textFromContent(c: string, fonts: (name: string) => Font | undefined, fallback?: Font): string {
  if (!/\bBT\b/.test(c)) return "";
  let out = "", font: Font | undefined = fallback, lastY: number | null = null;
  const stack: Tok[] = [];
  let arr: Tok[] | null = null;
  const nl = () => { if (out && !out.endsWith("\n")) out += "\n"; };
  const show = (toks: Tok[]) => {
    for (const k of toks) {
      if (k.t === "str") out += mapBytes(k.s, font);
      else if (k.t === "num" && k.n < -180 && !out.endsWith(" ")) out += " ";
    }
  };
  let i = 0;
  while (i < c.length) {
    const ch = c[i];
    if (ch === "%") { const e = c.indexOf("\n", i); i = e < 0 ? c.length : e; continue; }
    if (ch === "(") { const [s, j] = literal(c, i); (arr ?? stack).push({ t: "str", s }); i = j; continue; }
    if (ch === "<" && c[i + 1] === "<") { const e = c.indexOf(">>", i); i = e < 0 ? c.length : e + 2; continue; }
    if (ch === "<") {
      const j = c.indexOf(">", i); const h = c.slice(i + 1, j < 0 ? c.length : j).replace(/\s+/g, "");
      let s = ""; for (let k = 0; k < h.length; k += 2) s += String.fromCharCode(parseInt(h.slice(k, k + 2).padEnd(2, "0"), 16));
      (arr ?? stack).push({ t: "str", s }); i = j < 0 ? c.length : j + 1; continue;
    }
    if (ch === "[") { arr = []; i++; continue; }
    if (ch === "]") { if (arr) stack.push({ t: "arr", v: arr }); arr = null; i++; continue; }
    if (/[-+\d.]/.test(ch)) {
      const m = /^[-+]?\d*\.?\d+/.exec(c.slice(i, i + 24));
      if (m) { (arr ?? stack).push({ t: "num", n: Number(m[0]) }); i += m[0].length; continue; }
    }
    if (ch === "/") { const m = /^\/[^\s/<>[\]()%{}]*/.exec(c.slice(i, i + 128))!; (arr ?? stack).push({ t: "name", s: m[0].slice(1) }); i += m[0].length; continue; }
    if (/[A-Za-z'"*]/.test(ch)) {
      const op = /^[A-Za-z'"*]+/.exec(c.slice(i, i + 8))![0];
      i += op.length;
      const nums = stack.filter((x): x is { t: "num"; n: number } => x.t === "num").map((x) => x.n);
      if (op === "Tf") { const n = stack.find((x) => x.t === "name") as { s: string } | undefined; if (n) font = fonts(n.s) ?? fallback; }
      else if (op === "Tj") show(stack);
      else if (op === "TJ") { const a = stack.find((x) => x.t === "arr") as { v: Tok[] } | undefined; if (a) show(a.v); }
      else if (op === "'" || op === '"') { nl(); show(stack.filter((x) => x.t === "str")); }
      else if (op === "Td" || op === "TD") { if (nums.length >= 2 && Math.abs(nums[nums.length - 1]) > 0.01) nl(); }
      else if (op === "Tm") { const y = nums[5]; if (y !== undefined) { if (lastY !== null && Math.abs(y - lastY) > 0.5) nl(); lastY = y; } }
      else if (op === "T*") nl();
      else if (op === "ET") lastY = lastY ?? null;
      stack.length = 0;
      continue;
    }
    i++;
  }
  return out;
}

const refs = (s: string) => [...s.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
/** Inner text of the `<< … >>` dictionary that follows `key` (balanced). */
function subDict(dict: string, key: string): string | null {
  const k = dict.indexOf(key);
  if (k < 0) return null;
  const open = dict.indexOf("<<", k);
  const ref = /^\s*(\d+)\s+\d+\s+R/.exec(dict.slice(k + key.length));
  if (ref && (open < 0 || open > k + key.length + ref[0].length)) return `@${ref[1]}`;
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < dict.length - 1; i++) {
    if (dict.startsWith("<<", i)) { depth++; i++; } else if (dict.startsWith(">>", i)) { depth--; i++; if (!depth) return dict.slice(open + 2, i - 1); }
  }
  return null;
}

export function extractPdfText(bytes: Uint8Array, inflate: Inflate): { text: string; pages: number } {
  const src = latin1(bytes);
  if (!src.startsWith("%PDF")) throw new Error("not_pdf");
  if (/\/Encrypt\s/.test(src)) throw new Error("pdf_encrypted");
  const objs = indexObjects(bytes, src);
  const decoded = new Map<number, string | null>();
  const dec = (n: number) => { if (!decoded.has(n)) { const o = objs.get(n); decoded.set(n, o ? decodeStream(o, inflate) : null); } return decoded.get(n) ?? null; };

  // fonts with their ToUnicode maps
  const fontCache = new Map<number, Font>();
  const fontObj = (n: number): Font | undefined => {
    if (fontCache.has(n)) return fontCache.get(n);
    const o = objs.get(n);
    if (!o || !/\/Font\b|\/ToUnicode/.test(o.dict)) return undefined;
    const f: Font = { map: new Map(), bytes: /\/Subtype\s*\/Type0/.test(o.dict) ? 2 : 1 };
    const tu = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(o.dict);
    if (tu) { const cm = dec(Number(tu[1])); if (cm) parseCMap(cm, f.map); }
    fontCache.set(n, f);
    return f;
  };
  const resolveDict = (d: string | null) => (d && d.startsWith("@") ? objs.get(Number(d.slice(1)))?.dict ?? null : d);
  const fontNames = (resources: string | null): Map<string, number> => {
    const m = new Map<string, number>();
    const fd = resolveDict(subDict(resolveDict(resources) ?? "", "/Font"));
    if (fd) for (const x of fd.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) m.set(x[1], Number(x[2]));
    return m;
  };
  const globalNames = new Map<string, number>();
  for (const o of objs.values()) if (o.dict.includes("/Font")) for (const [k, v] of fontNames(o.dict)) if (!globalNames.has(k)) globalNames.set(k, v);

  // pages in document order (Catalog → Pages → Kids), falling back to file order
  const pages: { o: Obj; res: string | null }[] = [];
  const seen = new Set<number>();
  const walk = (n: number, inheritedRes: string | null) => {
    if (seen.has(n)) return; seen.add(n);
    const o = objs.get(n); if (!o) return;
    const res = subDict(o.dict, "/Resources") ?? inheritedRes;
    if (/\/Type\s*\/Pages\b/.test(o.dict)) { const kids = /\/Kids\s*\[([^\]]*)\]/.exec(o.dict); for (const k of refs(kids?.[1] ?? "")) walk(k, res); }
    else if (/\/Type\s*\/Page\b/.test(o.dict)) pages.push({ o, res });
  };
  const root = [...objs.values()].find((o) => /\/Type\s*\/Catalog/.test(o.dict));
  const rootPages = root && /\/Pages\s+(\d+)\s+\d+\s+R/.exec(root.dict);
  if (rootPages) walk(Number(rootPages[1]), null);
  if (!pages.length) for (const o of objs.values()) if (/\/Type\s*\/Page\b/.test(o.dict)) pages.push({ o, res: subDict(o.dict, "/Resources") });

  const parts: string[] = [];
  if (pages.length) {
    for (const { o: p, res } of pages) {
      const names = fontNames(res);
      const lookup = (name: string) => { const n = names.get(name) ?? globalNames.get(name); return n != null ? fontObj(n) : undefined; };
      const contents = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(p.dict);
      const content = refs(contents?.[1] ?? "").map(dec).filter((x): x is string => x != null).join("\n");
      const t = textFromContent(content, lookup);
      if (t.trim()) parts.push(t);
    }
  } else {
    // no page tree (fragments / unusual generators): scan every stream with one merged CMap
    const merged: Font = { map: new Map(), bytes: 1 };
    let two = false;
    for (const o of objs.values()) { const d = dec(o.num); if (d && /begincmap/.test(d)) { parseCMap(d, merged.map); if (/<[0-9a-fA-F]{4}>\s*<[0-9a-fA-F]{4}>\s*endcodespacerange|beginbfchar\s*\n?\s*\d*\s*<[0-9a-fA-F]{4}>/.test(d)) two = true; } }
    merged.bytes = two ? 2 : 1;
    for (const o of objs.values()) { const d = dec(o.num); if (d && !/begincmap/.test(d)) { const t = textFromContent(d, () => undefined, merged.map.size ? merged : undefined); if (t.trim()) parts.push(t); } }
  }
  const text = parts.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[\u2f00-\u2fdf\uf900-\ufaff]/g, (ch) => ch.normalize("NFKC")) // Kangxi radicals / compat ideographs → standard Han
    .trim();
  if (!text) throw new Error("pdf_no_text");
  return { text, pages: pages.length || parts.length };
}
