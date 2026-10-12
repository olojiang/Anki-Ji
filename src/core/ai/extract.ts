/** Readability-ish HTML → plain text (no DOM needed; runs on the server). */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®", laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", middot: "·" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const DROP = ["script", "style", "noscript", "template", "svg", "nav", "header", "footer", "aside", "form", "iframe", "button", "select", "canvas", "figure"];

function pickMain(html: string): string {
  const grab = (tag: string) => {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    let best = "";
    for (let m = re.exec(html); m; m = re.exec(html)) if (m[1].length > best.length) best = m[1];
    return best;
  };
  const article = grab("article");
  if (article.replace(/<[^>]+>/g, "").trim().length > 200 || (article && !/<main\b/i.test(html))) return article;
  const main = grab("main");
  if (main) return main;
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return body ? body[1] : html;
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim());
  let h = html.replace(/<!--[\s\S]*?-->/g, "");
  h = h.replace(/<head\b[\s\S]*?<\/head>/i, "");
  for (const t of DROP) h = h.replace(new RegExp(`<${t}\\b[\\s\\S]*?<\\/${t}>`, "gi"), " ");
  h = h.replace(/<[^>]+(?:class|id)=["'][^"']*\b(?:cookie|banner|sidebar|share|comments?|related|advert|ads?|newsletter|breadcrumb)\b[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|ul)>/gi, " ");
  h = pickMain(h);
  h = h
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/(p|div|section|article|h[1-6]|ul|ol|tr|table|blockquote|pre|dd|dt)>/gi, "\n\n")
    .replace(/<(h[1-6]|p|div|section|blockquote|pre|tr|table)\b[^>]*>/gi, "\n\n")
    .replace(/<\/?(td|th)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "");
  const text = decodeEntities(h)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}
