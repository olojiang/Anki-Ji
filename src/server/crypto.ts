import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for secrets at rest (users' AI API keys). Key: AI_ENC_KEY if set, otherwise derived from JWT_SECRET
 * with HKDF (separate purpose label). The owner id is bound as AAD so a ciphertext copied to another row fails.
 * Format: v1:<iv b64>:<tag b64>:<ciphertext b64>
 */
function key(): Buffer {
  const material = process.env.AI_ENC_KEY || process.env.JWT_SECRET || "dev-only-secret-change-me-please-0000";
  return Buffer.from(hkdfSync("sha256", material, "anki-ji", process.env.AI_ENC_KEY ? "ai-key-enc:v1:dedicated" : "ai-key-enc:v1:jwt", 32));
}

export function encryptSecret(plain: string, owner: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(`owner:${owner}`));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(enc: string, owner: string): string {
  const [v, iv, tag, ct] = enc.split(":");
  if (v !== "v1" || !iv || !tag || ct === undefined) throw new Error("bad_ciphertext");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAAD(Buffer.from(`owner:${owner}`));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

export const keyHint = (k: string) => k.slice(-4);
