/**
 * Minimal, dependency-free Web Push sender: RFC 8291 message encryption (aes128gcm, RFC 8188)
 * + RFC 8292 VAPID authentication, on Node's crypto.
 */
import crypto from "node:crypto";

export const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
export const fromB64u = (s: string) => Buffer.from(s.replace(/=+$/, ""), "base64url");

export interface PushKeys { p256dh: string; auth: string }
export interface VapidKeys { publicKey: string; privateKey: string }

/** Encrypt a push payload for a subscription. `opts` exists only to reproduce the RFC test vector. */
export function encryptPayload(plaintext: Uint8Array, keys: PushKeys, opts: { salt?: Uint8Array; asPrivate?: Uint8Array } = {}): Buffer {
  const uaPublic = fromB64u(keys.p256dh);
  const authSecret = fromB64u(keys.auth);
  const ecdh = crypto.createECDH("prime256v1");
  if (opts.asPrivate) ecdh.setPrivateKey(Buffer.from(opts.asPrivate)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ? Buffer.from(opts.salt) : crypto.randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

export function generateVapidKeys(): VapidKeys {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

function vapidPrivateKey(keys: VapidKeys) {
  const pub = fromB64u(keys.publicKey);
  return crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: keys.privateKey.replace(/=+$/, ""), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
}

/** `Authorization` header value for a push endpoint (JWT valid 12 h). */
export function vapidAuthHeader(endpoint: string, keys: VapidKeys, subject: string, now = new Date()): string {
  const aud = new URL(endpoint).origin;
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const data = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: subject })}`;
  const sig = crypto.sign("sha256", Buffer.from(data), { key: vapidPrivateKey(keys), dsaEncoding: "ieee-p1363" });
  return `vapid t=${data}.${b64u(sig)}, k=${keys.publicKey}`;
}

export function vapidFromEnv(): (VapidKeys & { subject: string }) | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "mailto:noreply@anki-ji.vercel.app" };
}

export interface PushSubscriptionRow { endpoint: string; p256dh: string; auth: string }

/** Send one notification. Returns the push service status; 404/410 mean the subscription is gone. */
export async function sendPush(sub: PushSubscriptionRow, payload: unknown, vapid: VapidKeys & { subject: string }, fetchImpl: typeof fetch = fetch): Promise<{ status: number; gone: boolean }> {
  const body = encryptPayload(Buffer.from(JSON.stringify(payload)), { p256dh: sub.p256dh, auth: sub.auth });
  const res = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthHeader(sub.endpoint, vapid, vapid.subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "43200",
      Urgency: "normal",
    },
    body: new Uint8Array(body),
  });
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}
