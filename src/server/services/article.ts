/** Server-side article fetch for incremental reading imports, with SSRF guards (public hosts only, redirects re-checked, size/time limits). */
import { lookup } from "node:dns/promises";
import { checkFetchUrl, isPrivateHost } from "@/core/safeurl";
import { htmlToText, extractTitle } from "@/core/reading";
import { MAX_READING_CHARS } from "./reading";

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const fail = (code: string, status = 400) => Object.assign(new Error(code), { status });

type Resolver = (host: string) => Promise<string[]>;
const dnsResolve: Resolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

async function assertPublic(u: URL, resolve: Resolver) {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateHost(host)) throw fail("blocked_url");
  if (/^[\d.]+$/.test(host) || host.includes(":")) return; // IP literal already checked
  let addrs: string[];
  try { addrs = await resolve(host); } catch { throw fail("fetch_failed"); }
  if (!addrs.length || addrs.some((a) => isPrivateHost(a))) throw fail("blocked_url");
}

async function readCapped(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel().catch(() => {}); throw fail("content_too_large", 413); }
    parts.push(value);
  }
  const out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}

export async function fetchArticle(raw: string, opts: { fetchImpl?: typeof fetch; resolve?: Resolver; timeoutMs?: number } = {}): Promise<{ title: string; content: string; sourceUrl: string }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const resolve = opts.resolve ?? dnsResolve;
  let url: URL;
  try { url = checkFetchUrl(raw); } catch (e) { throw fail((e as Error).message); }
  let res: Response | null = null;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublic(url, resolve);
    try {
      res = await doFetch(url.toString(), {
        redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; Anki-ji reader)", accept: "text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9,*/*;q=0.1" },
      });
    } catch { throw fail("fetch_failed"); }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      try { url = checkFetchUrl(new URL(res.headers.get("location")!, url).toString()); } catch (e) { throw fail((e as Error).message); }
      res = null;
      continue;
    }
    break;
  }
  if (!res) throw fail("fetch_failed");
  if (!res.ok) throw fail("fetch_failed");
  const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
  const isHtml = /text\/html|application\/xhtml/.test(ctype);
  const isText = /text\/(plain|markdown|x-markdown)/.test(ctype);
  if (!isHtml && !isText) throw fail("unsupported_content");
  const bytes = await readCapped(res);
  const charset = /charset=([\w-]+)/.exec(ctype)?.[1] ?? "utf-8";
  let body: string;
  try { body = new TextDecoder(charset).decode(bytes); } catch { body = new TextDecoder("utf-8").decode(bytes); }
  let title: string, content: string;
  if (isHtml) ({ title, text: content } = htmlToText(body));
  else {
    content = body.replace(/\r\n?/g, "\n").trim();
    const h = /^#\s+(.+)$/m.exec(content);
    title = h ? h[1].trim() : extractTitle(content);
  }
  if (!content.trim()) throw fail("nothing_extracted");
  return { title: title || url.hostname, content: content.slice(0, MAX_READING_CHARS), sourceUrl: url.toString() };
}
