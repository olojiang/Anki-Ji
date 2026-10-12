import { describe, it, expect } from "vitest";
import { generateSlug, isShareActive, expiryFromDays, mediaUrlsIn, SLUG_RE } from "@/core/share";

describe("share core", () => {
  it("generates unguessable url-safe slugs (≥128 bits)", () => {
    const s = generateSlug();
    expect(s).toMatch(SLUG_RE);
    expect(s.length).toBeGreaterThanOrEqual(22);
    const many = new Set(Array.from({ length: 500 }, () => generateSlug()));
    expect(many.size).toBe(500);
    expect(generateSlug(new Uint8Array(16))).toBe("AAAAAAAAAAAAAAAAAAAAAA");
    expect(SLUG_RE.test("../etc")).toBe(false);
    expect(SLUG_RE.test("short")).toBe(false);
  });
  it("active unless revoked or expired", () => {
    const now = new Date("2026-10-12T00:00:00Z");
    expect(isShareActive({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(isShareActive({ revokedAt: new Date("2026-10-11"), expiresAt: null }, now)).toBe(false);
    expect(isShareActive({ revokedAt: null, expiresAt: new Date("2026-10-11T23:59:59Z") }, now)).toBe(false);
    expect(isShareActive({ revokedAt: null, expiresAt: new Date("2026-10-12T00:00:01Z") }, now)).toBe(true);
  });
  it("expiry from days", () => {
    const now = new Date("2026-10-12T00:00:00Z");
    expect(expiryFromDays(null, now)).toBeNull();
    expect(expiryFromDays(0, now)).toBeNull();
    expect(expiryFromDays(7, now)!.toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(expiryFromDays(9999, now)!.toISOString()).toBe("2027-10-12T00:00:00.000Z"); // capped at 365
  });
  it("collects http(s) media urls from any note field", () => {
    const urls = mediaUrlsIn({
      front: "see ![img](https://x.public.blob.vercel-storage.com/u1/a.png) and <img src=\"https://cdn.example.com/b.jpg\">",
      back: "[sound:https://x.public.blob.vercel-storage.com/u1/c.mp3] data:image/png;base64,AAAA",
      image: "https://x.public.blob.vercel-storage.com/u1/a.png",
      options: ["https://e.com/o.png)"],
      masks: [{ x: 1 }],
    });
    expect(urls.sort()).toEqual([
      "https://cdn.example.com/b.jpg",
      "https://e.com/o.png",
      "https://x.public.blob.vercel-storage.com/u1/a.png",
      "https://x.public.blob.vercel-storage.com/u1/c.mp3",
    ]);
  });
});

describe("share/reading strings", () => {
  it("picks singular forms for n = 1 and interpolates", async () => {
    const { tsi } = await import("@/lib/i18n-share-ir");
    expect(tsi("en", "cardsN", { n: 1 })).toBe("1 card");
    expect(tsi("en", "cardsN", { n: 3 })).toBe("3 cards");
    expect(tsi("zh", "cardsN", { n: 3 })).toBe("3 张卡片");
    expect(tsi("en", "cloneDone", { added: 2, cards: 3, skipped: 0 })).toBe("Added 2 notes (3 cards); skipped 0 you already have");
  });
});
