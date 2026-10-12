import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Session cookie for route handlers (next/headers is only available inside a Next request).
let sessionToken: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (sessionToken ? { value: sessionToken } : undefined) }) }));

import { NextRequest } from "next/server";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import { q } from "@/server/db";
import { signSession } from "@/server/auth";
import { encryptSecret, decryptSecret, keyHint } from "@/server/crypto";
import { chatComplete, AiError } from "@/server/ai/llm";
import { isPrivateAddress, assertPublicUrl } from "@/server/net";
import { extractPdfText } from "@/core/ai/pdf";
import { getAiSettings, saveAiSettings, generateCards, deleteAiSettings } from "@/server/services/ai";
import * as settingsRoute from "@/app/api/ai/settings/route";
import * as generateRoute from "@/app/api/ai/generate/route";
import * as extractRoute from "@/app/api/ai/extract/route";

const okJson = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });

describe("secret encryption (AES-GCM)", () => {
  it("round-trips, uses a random IV and never contains the plaintext", () => {
    const a = encryptSecret("sk-live-1234567890abcd", "u1");
    const b = encryptSecret("sk-live-1234567890abcd", "u1");
    expect(a).not.toBe(b);
    expect(a).not.toContain("sk-live");
    expect(decryptSecret(a, "u1")).toBe("sk-live-1234567890abcd");
  });
  it("rejects tampering and ciphertext moved to another user", () => {
    const a = encryptSecret("secret-key-xyz", "u1");
    expect(() => decryptSecret(a, "u2")).toThrow();
    const parts = a.split(":");
    const ct = Buffer.from(parts[3], "base64"); ct[0] ^= 1; parts[3] = ct.toString("base64");
    expect(() => decryptSecret(parts.join(":"), "u1")).toThrow();
  });
  it("prefers AI_ENC_KEY over JWT_SECRET", () => {
    const old = process.env.AI_ENC_KEY;
    process.env.AI_ENC_KEY = "another-strong-key-for-tests-0001";
    const a = encryptSecret("k", "u1");
    process.env.AI_ENC_KEY = old;
    if (old === undefined) delete process.env.AI_ENC_KEY;
    expect(() => decryptSecret(a, "u1")).toThrow();
  });
  it("keyHint shows only the last 4 chars", () => {
    expect(keyHint("sk-abcdef1234")).toBe("1234");
    expect(keyHint("ab")).toBe("ab");
  });
});

describe("LLM client (fetch mocked)", () => {
  it("calls an OpenAI-compatible /chat/completions with bearer auth and JSON mode", async () => {
    const f = vi.fn(async () => okJson('{"cards":[]}'));
    const out = await chatComplete({ provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", apiKey: "sk-1" }, [{ role: "user", content: "hi" }], { fetchImpl: f as unknown as typeof fetch });
    expect(out).toBe('{"cards":[]}');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-1");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "deepseek-chat", messages: [{ role: "user", content: "hi" }], response_format: { type: "json_object" } });
  });
  it("omits Authorization when no key (local Ollama)", async () => {
    const f = vi.fn(async () => okJson("{}"));
    await chatComplete({ provider: "ollama", baseUrl: "http://localhost:11434/v1", model: "llama3.1", apiKey: "" }, [{ role: "user", content: "x" }], { fetchImpl: f as unknown as typeof fetch });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty("Authorization");
  });
  it("retries once without response_format when the provider rejects it", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "response_format is not supported" } }), { status: 400 }))
      .mockResolvedValueOnce(okJson("{}"));
    await chatComplete({ provider: "custom", baseUrl: "https://x.test/v1", model: "m", apiKey: "k" }, [{ role: "user", content: "x" }], { fetchImpl: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body))).not.toHaveProperty("response_format");
  });
  it("calls Anthropic /v1/messages with x-api-key and splits the system prompt", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"cards":[]}' }] }), { status: 200 }));
    const out = await chatComplete({ provider: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5", apiKey: "ak" }, [{ role: "system", content: "S" }, { role: "user", content: "U" }], { fetchImpl: f as unknown as typeof fetch });
    expect(out).toBe('{"cards":[]}');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("ak");
    const body = JSON.parse(String(init.body));
    expect(body.system).toBe("S");
    expect(body.messages).toEqual([{ role: "user", content: "U" }]);
  });
  it("maps provider errors to stable codes (never 401, which would log the user out)", async () => {
    const cfg = { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "m", apiKey: "bad" };
    const run = (r: Response | Error) => chatComplete(cfg, [{ role: "user", content: "x" }], { fetchImpl: (async () => { if (r instanceof Error) throw r; return r; }) as unknown as typeof fetch });
    await expect(run(new Response("{}", { status: 401 }))).rejects.toMatchObject({ message: "ai_bad_key", status: 400 });
    await expect(run(new Response("{}", { status: 429, headers: { "retry-after": "7" } }))).rejects.toMatchObject({ message: "ai_rate_limited", status: 429, retryAfter: 7 });
    await expect(run(new Response("{}", { status: 404 }))).rejects.toMatchObject({ message: "ai_model_not_found" });
    await expect(run(new Response(JSON.stringify({ error: { message: "maximum context length exceeded" } }), { status: 400 }))).rejects.toMatchObject({ message: "ai_input_too_long" });
    await expect(run(new Response("{}", { status: 503 }))).rejects.toMatchObject({ message: "ai_provider_error" });
    await expect(run(new TypeError("fetch failed"))).rejects.toMatchObject({ message: "ai_unreachable" });
    await expect(run(new Response(JSON.stringify({ choices: [] }), { status: 200 }))).rejects.toBeInstanceOf(AiError);
  });
});

describe("SSRF guard", () => {
  it("recognises private and loopback addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.5.4", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });
  it("rejects non-http schemes, localhost and hosts resolving to private IPs", async () => {
    const lookup = async (h: string) => (h === "evil.test" ? ["10.0.0.5"] : ["93.184.216.34"]);
    await expect(assertPublicUrl("file:///etc/passwd", { lookup })).rejects.toThrow("url_not_allowed");
    await expect(assertPublicUrl("http://localhost:3000/x", { lookup })).rejects.toThrow("url_not_allowed");
    await expect(assertPublicUrl("http://169.254.169.254/latest", { lookup })).rejects.toThrow("url_not_allowed");
    await expect(assertPublicUrl("https://evil.test/", { lookup })).rejects.toThrow("url_not_allowed");
    await expect(assertPublicUrl("https://example.com/a", { lookup })).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("http://localhost:11434/v1", { lookup, allowPrivate: true })).resolves.toBeInstanceOf(URL);
  });
});

function makePdf(streams: { content: string; compress?: boolean }[], extraObjs: string[] = []): Uint8Array {
  const parts: (string | Buffer)[] = ["%PDF-1.4\n"];
  streams.forEach((s, i) => {
    const data = s.compress ? deflateSync(Buffer.from(s.content, "latin1")) : Buffer.from(s.content, "latin1");
    parts.push(`${i + 10} 0 obj\n<< /Length ${data.length}${s.compress ? " /Filter /FlateDecode" : ""} >>\nstream\n`, data, "\nendstream\nendobj\n");
  });
  extraObjs.forEach((o) => parts.push(o));
  parts.push("trailer\n<<>>\n%%EOF");
  return new Uint8Array(Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : p))));
}

describe("PDF text extraction (zero-dependency)", () => {
  const inflate = (b: Uint8Array) => new Uint8Array(inflateSync(b));
  it("extracts Tj/TJ text from plain and Flate streams with line breaks", () => {
    const pdf = makePdf([
      { content: "BT /F1 12 Tf 72 720 Td (Hello \\(PDF\\) world) Tj 0 -14 Td [(Sec) -250 (ond line)] TJ ET" },
      { content: "BT (Compressed page) Tj T* (with escape \\134 and \\101) Tj ET", compress: true },
    ]);
    const r = extractPdfText(pdf, inflate);
    expect(r.text).toContain("Hello (PDF) world");
    expect(r.text).toMatch(/Hello \(PDF\) world\nSec ond line|Hello \(PDF\) world\nSecond line/);
    expect(r.text).toContain("Compressed page");
    expect(r.text).toContain("with escape \\ and A");
  });
  it("maps hex strings through a ToUnicode CMap (CJK)", () => {
    const cmap = "/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n2 beginbfchar\n<0001> <4F60>\n<0002> <597D>\nendbfchar\n1 beginbfrange\n<0003> <0004> <0041>\nendbfrange\nendcmap end end";
    const pdf = makePdf([{ content: "BT /F1 12 Tf <00010002> Tj ( ) Tj <00030004> Tj ET", compress: true }, { content: cmap, compress: true }]);
    expect(extractPdfText(pdf, inflate).text).toContain("你好");
    expect(extractPdfText(pdf, inflate).text).toContain("AB");
  });
  it("reads a real Chrome-generated PDF with per-font CMaps (Latin + CJK Type3 fonts)", () => {
    const bytes = new Uint8Array(readFileSync(join(__dirname, "fixtures/ai/chrome-sample.pdf")));
    const r = extractPdfText(bytes, inflate);
    expect(r.pages).toBe(1);
    expect(r.text).toContain("Photosynthesis is the process by which green plants convert light energy into chemical energy.");
    expect(r.text).toContain("光合作用是植物利用光能，把二氧化碳和水转化为葡萄糖并释放氧气的过程。");
    expect(r.text).toContain("The light-dependent reactions occur in the thylakoid membranes.");
  });
  it("throws pdf_no_text for image-only or non-PDF input", () => {
    expect(() => extractPdfText(new TextEncoder().encode("not a pdf"), inflate)).toThrow("not_pdf");
    expect(() => extractPdfText(makePdf([{ content: "q 100 0 0 100 0 0 cm /Im1 Do Q" }]), inflate)).toThrow("pdf_no_text");
  });
});

describe("AI settings + generation on real Postgres", () => {
  let a: number, b: number;
  const fetchSpy = vi.fn();
  beforeAll(async () => {
    await usePglite();
    a = (await users.createUser("ai-a@test.dev", "h", "A")).id;
    b = (await users.createUser("ai-b@test.dev", "h", "B")).id;
  });
  beforeEach(() => { fetchSpy.mockReset(); vi.stubGlobal("fetch", fetchSpy); });
  afterEach(() => vi.unstubAllGlobals());

  it("stores the key encrypted and never returns it", async () => {
    const s = await saveAiSettings(a, { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "sk-user-a-secret-9876" });
    expect(s).toEqual(expect.objectContaining({ configured: true, provider: "openai", model: "gpt-4o-mini", hasKey: true, keyLast4: "9876" }));
    expect(JSON.stringify(s)).not.toContain("sk-user-a");
    const rows = await q("SELECT * FROM ak_ai_settings WHERE user_id = $1", [a]);
    expect(JSON.stringify(rows)).not.toContain("sk-user-a-secret");
    // saving without a key keeps the old one
    const s2 = await saveAiSettings(a, { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" });
    expect(s2).toMatchObject({ model: "gpt-4.1-mini", keyLast4: "9876" });
    expect(await getAiSettings(b)).toMatchObject({ configured: false, hasKey: false });
  });

  it("generates with the caller's own key only", async () => {
    await saveAiSettings(b, { provider: "deepseek", model: "deepseek-chat", apiKey: "sk-user-b-0000" });
    fetchSpy.mockResolvedValue(okJson(JSON.stringify({ cards: [{ type: "qa", front: "Q?", back: "A" }] })));
    const r = await generateCards(b, { text: "Some study text.", style: "qa", count: 1, language: "auto" });
    expect(r.cards).toEqual([{ kind: "qa", front: "Q?", back: "A", tags: [] }]);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-user-b-0000");
  });

  it("errors when not configured or the key is missing for a provider that needs one", async () => {
    const c = (await users.createUser("ai-c@test.dev", "h", "C")).id;
    await expect(generateCards(c, { text: "x", style: "qa", count: 1, language: "auto" })).rejects.toThrow("ai_not_configured");
    await saveAiSettings(c, { provider: "openai", model: "gpt-4o-mini" });
    await expect(generateCards(c, { text: "x", style: "qa", count: 1, language: "auto" })).rejects.toThrow("ai_key_required");
    await deleteAiSettings(c);
    expect(await getAiSettings(c)).toMatchObject({ configured: false });
  });

  it("rejects empty text and private base URLs in production-like mode", async () => {
    await expect(generateCards(a, { text: "   ", style: "qa", count: 1, language: "auto" })).rejects.toThrow("text_required");
    const prev = process.env.AI_ALLOW_PRIVATE_URLS;
    process.env.AI_ALLOW_PRIVATE_URLS = "0";
    await expect(saveAiSettings(a, { provider: "custom", baseUrl: "http://169.254.169.254/v1", model: "m" })).rejects.toThrow("url_not_allowed");
    process.env.AI_ALLOW_PRIVATE_URLS = prev;
    if (prev === undefined) delete process.env.AI_ALLOW_PRIVATE_URLS;
  });

  describe("route handlers: auth + isolation", () => {
    const req = (url: string, init?: { method?: string; body?: unknown }) =>
      new NextRequest(`http://localhost${url}`, { method: init?.method ?? "GET", ...(init?.body !== undefined ? { body: JSON.stringify(init.body), headers: { "content-type": "application/json" } } : {}) });
    const ctx = { params: Promise.resolve({}) };

    it("401 without a session", async () => {
      sessionToken = undefined;
      expect((await settingsRoute.GET(req("/api/ai/settings"), ctx)).status).toBe(401);
      expect((await generateRoute.POST(req("/api/ai/generate", { method: "POST", body: { text: "x" } }), ctx)).status).toBe(401);
      expect((await extractRoute.POST(req("/api/ai/extract", { method: "POST", body: { url: "https://example.com" } }), ctx)).status).toBe(401);
    });

    it("each user sees only their own settings, never the key", async () => {
      sessionToken = await signSession(a);
      const ra = await (await settingsRoute.GET(req("/api/ai/settings"), ctx)).json();
      expect(ra).toMatchObject({ provider: "openai", keyLast4: "9876" });
      expect(JSON.stringify(ra)).not.toMatch(/sk-user/);
      sessionToken = await signSession(b);
      const rb = await (await settingsRoute.GET(req("/api/ai/settings"), ctx)).json();
      expect(rb).toMatchObject({ provider: "deepseek", keyLast4: "0000" });
      const put = await settingsRoute.PUT(req("/api/ai/settings", { method: "PUT", body: { provider: "moonshot", model: "moonshot-v1-8k" } }), ctx);
      expect(await put.json()).toMatchObject({ provider: "moonshot", baseUrl: "https://api.moonshot.cn/v1", keyLast4: "0000" });
      sessionToken = await signSession(a);
      expect(await (await settingsRoute.GET(req("/api/ai/settings"), ctx)).json()).toMatchObject({ provider: "openai" });
    });

    it("generate maps a bad key to 400 ai_bad_key and rate limits to 429", async () => {
      sessionToken = await signSession(a);
      fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 401 }));
      const r1 = await generateRoute.POST(req("/api/ai/generate", { method: "POST", body: { text: "hello", style: "qa", count: 2 } }), ctx);
      expect(r1.status).toBe(400);
      expect(await r1.json()).toEqual({ error: "ai_bad_key" });
      fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 429 }));
      const r2 = await generateRoute.POST(req("/api/ai/generate", { method: "POST", body: { text: "hello", style: "qa", count: 2 } }), ctx);
      expect(r2.status).toBe(429);
      fetchSpy.mockResolvedValueOnce(okJson('{"cards":[{"type":"cloze","text":"{{c1::H2O}} is water"}]}'));
      const r3 = await generateRoute.POST(req("/api/ai/generate", { method: "POST", body: { text: "hello", style: "cloze", count: 2 } }), ctx);
      expect(await r3.json()).toMatchObject({ cards: [{ kind: "cloze", text: "{{c1::H2O}} is water" }] });
    });

    it("extract refuses private URLs", async () => {
      sessionToken = await signSession(a);
      const r = await extractRoute.POST(req("/api/ai/extract", { method: "POST", body: { url: "http://127.0.0.1:4555/sql" } }), ctx);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "url_not_allowed" });
    });
  });
});
