import { q } from "../db";
import { normalizeSettings, type UserSettings } from "@/core/settings";

export interface User { id: number; email: string; name: string; settings: UserSettings; createdAt: Date }
const toUser = (r: Record<string, unknown>): User => ({ id: Number(r.id), email: String(r.email), name: String(r.name ?? ""), settings: normalizeSettings(r.settings as Partial<UserSettings>), createdAt: new Date(String(r.created_at)) });

export async function createUser(email: string, passwordHash: string, name: string, settings: Partial<UserSettings> = {}): Promise<User> {
  const rows = await q("INSERT INTO ak_users (email, password_hash, name, settings) VALUES ($1, $2, $3, $4) RETURNING *", [email.trim(), passwordHash, name.trim(), JSON.stringify(normalizeSettings(settings))]);
  return toUser(rows[0]);
}

export async function findByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  const rows = await q("SELECT * FROM ak_users WHERE lower(email) = lower($1)", [email.trim()]);
  return rows[0] ? { ...toUser(rows[0]), passwordHash: String(rows[0].password_hash) } : null;
}

export async function getUser(id: number): Promise<User | null> {
  const rows = await q("SELECT * FROM ak_users WHERE id = $1", [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function updateUser(id: number, patch: { name?: string; settings?: Partial<UserSettings> }): Promise<User | null> {
  const cur = await getUser(id);
  if (!cur) return null;
  const settings = normalizeSettings({ ...cur.settings, ...(patch.settings ?? {}) });
  const rows = await q("UPDATE ak_users SET name = $2, settings = $3 WHERE id = $1 RETURNING *", [id, patch.name?.trim() ?? cur.name, JSON.stringify(settings)]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function setPassword(id: number, passwordHash: string) {
  await q("UPDATE ak_users SET password_hash = $2 WHERE id = $1", [id, passwordHash]);
}

export async function getPasswordHash(id: number): Promise<string | null> {
  const rows = await q("SELECT password_hash FROM ak_users WHERE id = $1", [id]);
  return rows[0] ? String(rows[0].password_hash) : null;
}

export async function deleteUser(id: number) {
  await q("DELETE FROM ak_users WHERE id = $1", [id]);
}
