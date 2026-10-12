/** Deck sharing: pure helpers (slugs, expiry, media reference discovery). */

/** 16+ random bytes as base64url → ≥22 chars; nothing else may be used as a slug. */
export const SLUG_RE = /^[A-Za-z0-9_-]{22,64}$/;

export function generateSlug(bytes?: Uint8Array): string {
  const b = bytes ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isShareActive(s: { revokedAt: Date | null; expiresAt: Date | null }, now: Date = new Date()): boolean {
  if (s.revokedAt) return false;
  if (s.expiresAt && s.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export const MAX_SHARE_DAYS = 365;

/** null / 0 / negative → never expires; otherwise now + days (capped at a year). */
export function expiryFromDays(days: number | null | undefined, now: Date = new Date()): Date | null {
  const d = Number(days);
  if (days == null || !Number.isFinite(d) || d <= 0) return null;
  return new Date(now.getTime() + Math.min(d, MAX_SHARE_DAYS) * 86400000);
}

const URL_RE = /https?:\/\/[^\s"'<>()[\]{}|\\^`]+/g;

/** Every http(s) URL appearing in any string inside a note's fields (markdown images, <img>, [sound:…], image field). */
export function mediaUrlsIn(fields: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") { for (const m of v.match(URL_RE) ?? []) out.add(m.replace(/[.,;:!?]+$/, "")); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(fields);
  return [...out];
}
