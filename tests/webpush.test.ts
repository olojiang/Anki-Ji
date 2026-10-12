import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { encryptPayload, vapidAuthHeader, generateVapidKeys, b64u, fromB64u } from "@/server/webpush";

const clean = (s: string) => s.replace(/\s+/g, "");
// RFC 8291 Appendix A test vector
const V = {
  plaintext: clean("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24"),
  asPublic: clean("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"),
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: clean("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  header: clean("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8"),
  cipher: clean("8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ"),
};

describe("web push encryption (RFC 8291 aes128gcm)", () => {
  it("reproduces the RFC 8291 test vector byte for byte", () => {
    const body = encryptPayload(fromB64u(V.plaintext), { p256dh: V.uaPublic, auth: V.auth }, { salt: fromB64u(V.salt), asPrivate: fromB64u(V.asPrivate) });
    expect(b64u(body.subarray(0, 86))).toBe(V.header);
    expect(b64u(body.subarray(86))).toBe(V.cipher);
  });
  it("produces a fresh salt and key per message", () => {
    const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
    const sub = { p256dh: b64u(ua.getPublicKey()), auth: b64u(crypto.randomBytes(16)) };
    const a = encryptPayload(Buffer.from("hi"), sub), b = encryptPayload(Buffer.from("hi"), sub);
    expect(b64u(a.subarray(0, 16))).not.toBe(b64u(b.subarray(0, 16)));
  });
});

describe("VAPID", () => {
  it("generates P-256 keys and signs a verifiable ES256 JWT for the push service origin", () => {
    const keys = generateVapidKeys();
    expect(fromB64u(keys.publicKey)).toHaveLength(65);
    expect(fromB64u(keys.privateKey)).toHaveLength(32);
    const h = vapidAuthHeader("https://fcm.googleapis.com/fcm/send/abc", keys, "mailto:a@b.c", new Date("2026-10-12T00:00:00Z"));
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
    expect(m[2]).toBe(keys.publicKey);
    const [hd, pl, sig] = m[1].split(".");
    expect(JSON.parse(Buffer.from(hd, "base64url").toString())).toEqual({ typ: "JWT", alg: "ES256" });
    const payload = JSON.parse(Buffer.from(pl, "base64url").toString());
    expect(payload.aud).toBe("https://fcm.googleapis.com");
    expect(payload.sub).toBe("mailto:a@b.c");
    expect(payload.exp).toBe(Date.UTC(2026, 9, 12) / 1000 + 12 * 3600);
    const pub = fromB64u(keys.publicKey);
    const key = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: "jwk" });
    expect(crypto.verify("sha256", Buffer.from(`${hd}.${pl}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
  });
});
