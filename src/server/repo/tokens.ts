import { createHash, randomBytes } from "node:crypto";
import { q } from "../db";

/** Personal API tokens: random 192-bit secrets, only their SHA-256 is stored. Shown once at creation. */
export const TOKEN_PREFIX = "akj_";
export const MAX_TOKENS_PER_USER = 20;

export const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

export interface ApiToken { id: number; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }
const iso = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const toToken = (r: Record<string, unknown>): ApiToken => ({ id: Number(r.id), name: String(r.name ?? ""), prefix: String(r.prefix ?? ""), createdAt: iso(r.created_at)!, lastUsedAt: iso(r.last_used_at) });

export async function createToken(uid: number, name: string): Promise<ApiToken & { token: string }> {
  const count = Number((await q("SELECT count(*)::int AS n FROM ak_api_tokens WHERE user_id = $1", [uid]))[0]?.n ?? 0);
  if (count >= MAX_TOKENS_PER_USER) throw Object.assign(new Error("too_many_tokens"), { status: 400 });
  const token = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  const prefix = token.slice(0, TOKEN_PREFIX.length + 6);
  const clean = String(name ?? "").trim().slice(0, 60) || "token";
  const rows = await q("INSERT INTO ak_api_tokens (user_id, name, token_hash, prefix) VALUES ($1, $2, $3, $4) RETURNING *", [uid, clean, hashToken(token), prefix]);
  return { ...toToken(rows[0]), token };
}

export async function listTokens(uid: number): Promise<ApiToken[]> {
  return (await q("SELECT id, name, prefix, created_at, last_used_at FROM ak_api_tokens WHERE user_id = $1 ORDER BY id DESC", [uid])).map(toToken);
}

export async function revokeToken(uid: number, id: number): Promise<boolean> {
  return (await q("DELETE FROM ak_api_tokens WHERE user_id = $1 AND id = $2 RETURNING id", [uid, id])).length > 0;
}

/** Resolve a presented token to its user (null when unknown/revoked). Touches last_used_at at most once a minute. */
export async function userForToken(token: string | null | undefined): Promise<number | null> {
  if (!token || typeof token !== "string" || !token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const rows = await q("SELECT id, user_id, last_used_at FROM ak_api_tokens WHERE token_hash = $1", [hashToken(token)]);
  if (!rows[0]) return null;
  const last = rows[0].last_used_at ? new Date(String(rows[0].last_used_at instanceof Date ? (rows[0].last_used_at as Date).toISOString() : rows[0].last_used_at)).getTime() : 0;
  if (Date.now() - last > 60_000) await q("UPDATE ak_api_tokens SET last_used_at = now() WHERE id = $1", [rows[0].id]);
  return rows[0] ? Number(rows[0].user_id) : null;
}
