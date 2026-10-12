/**
 * Translate an Anki search query (as sent by AnkiConnect clients) into Anki-ji search syntax.
 * - `nid:1,2` / `cid:3` → id filters returned separately
 * - `note:<Anki model name>` → `note:<our note type>`
 * - `<Field>:value` (field-specific search) → plain text search for value
 * - `deck:current` → any deck
 */
const OUR_KEYS = new Set(["deck", "tag", "is", "flag", "type", "note", "added", "prop", "card"]);

export interface TranslatedQuery { query: string; nids: number[] | null; cids: number[] | null }

const quote = (s: string) => (/[\s()"]/.test(s) || s === "" ? `"${s.replace(/"/g, "")}"` : s);

export function translateAnkiQuery(query: string, modelToType: (name: string) => string | undefined): TranslatedQuery {
  const toks = String(query ?? "").match(/-?"[^"]*"|-?[^\s"()]+(?:"[^"]*")?[^\s()]*|[()]/g) ?? [];
  const out: string[] = [];
  let nids = null as number[] | null, cids = null as number[] | null;
  for (const raw of toks) {
    if (raw === "(" || raw === ")") { out.push(raw); continue; }
    const neg = raw.startsWith("-");
    const body = (neg ? raw.slice(1) : raw).replace(/"/g, "");
    if (/^or$/i.test(body) || /^and$/i.test(body)) { if (/^or$/i.test(body)) out.push("or"); continue; }
    const idx = body.indexOf(":");
    if (idx <= 0) { out.push((neg ? "-" : "") + quote(body)); continue; }
    const key = body.slice(0, idx).toLowerCase();
    const value = body.slice(idx + 1);
    if (key === "nid" || key === "cid") {
      const ids = value.split(",").map((x) => Number(x.trim())).filter(Number.isInteger);
      if (!neg) { if (key === "nid") nids = [...(nids ?? []), ...ids]; else cids = [...(cids ?? []), ...ids]; }
      continue;
    }
    if (key === "note" || key === "mid") {
      const t = modelToType(value);
      out.push((neg ? "-" : "") + quote(`note:${t ?? "__no_such_model__"}`));
      continue;
    }
    if (key === "deck" && value.toLowerCase() === "current") continue;
    if (OUR_KEYS.has(key)) { out.push((neg ? "-" : "") + quote(`${key}:${value}`)); continue; }
    // field-specific search: Front:foo → foo ; Front:* / Front:_* → anything
    if (value === "" || value === "*" || value === "_*") { if (neg && value === "") out.push(""); continue; }
    out.push((neg ? "-" : "") + quote(value));
  }
  return { query: out.filter((x) => x !== "").join(" "), nids, cids };
}
