import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "./http";

/** Loopback, private, link-local, CGNAT, unspecified, unique-local and mapped variants. */
export function isPrivateAddress(ip: string): boolean {
  let a = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) a = mapped[1];
  if (isIP(a) === 4) {
    const [p, q] = a.split(".").map(Number);
    return p === 10 || p === 127 || p === 0 || (p === 169 && q === 254) || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168) || (p === 100 && q >= 64 && q <= 127) || p >= 224;
  }
  if (isIP(a) === 6) return a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith("::ffff:");
  return true; // not an IP at all → treat as unsafe
}

export const allowPrivateUrls = () => process.env.AI_ALLOW_PRIVATE_URLS === "1" || (process.env.AI_ALLOW_PRIVATE_URLS !== "0" && process.env.NODE_ENV !== "production");

type Lookup = (host: string) => Promise<string[]>;
const defaultLookup: Lookup = async (h) => (await dnsLookup(h, { all: true })).map((r) => r.address);

/** Throws url_not_allowed unless the URL is http(s) and every resolved address is public. */
export async function assertPublicUrl(raw: string, opts: { allowPrivate?: boolean; lookup?: Lookup } = {}): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new HttpError(400, "invalid_url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new HttpError(400, "url_not_allowed");
  if (u.username || u.password) throw new HttpError(400, "url_not_allowed");
  if (opts.allowPrivate) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal") throw new HttpError(400, "url_not_allowed");
  if (isIP(host)) { if (isPrivateAddress(host)) throw new HttpError(400, "url_not_allowed"); return u; }
  let addrs: string[];
  try { addrs = await (opts.lookup ?? defaultLookup)(host); } catch { throw new HttpError(400, "url_unreachable"); }
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new HttpError(400, "url_not_allowed");
  return u;
}
