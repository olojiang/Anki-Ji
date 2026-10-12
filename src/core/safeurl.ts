/** Guards for server-side URL fetching (SSRF): only public http(s) hosts. Pure – DNS resolution happens in the caller. */

function ipv4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

const isV4 = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);

/** True for loopback, private, link-local, CGNAT, multicast, unique-local and obviously-internal names. */
export function isPrivateHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa")) return true;
  if (isV4(h)) return ipv4Private(h);
  if (h.includes(":")) {
    const mapped = /^(?:0*:)*:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h) ?? /^::(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
    if (mapped) return ipv4Private(mapped[1]);
    if (h === "::" || h === "::1" || /^0*(:0*)*:0*1$/.test(h)) return true;
    const first = parseInt(h.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((first & 0xff00) === 0xff00) return true; // multicast
    return false;
  }
  return false;
}

/** Parse + validate a user-supplied URL. Throws "invalid_url" / "blocked_url". */
export function checkFetchUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(String(raw).trim()); } catch { throw new Error("invalid_url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("invalid_url");
  if (u.username || u.password) throw new Error("invalid_url");
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) throw new Error("blocked_url");
  if (isPrivateHost(u.hostname)) throw new Error("blocked_url");
  return u;
}
