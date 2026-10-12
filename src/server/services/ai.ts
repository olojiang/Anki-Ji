/** Bring-your-own-key AI: per-user provider settings (key encrypted at rest) and card generation. */
import { inflateSync } from "node:zlib";
import { z } from "zod";
import { q } from "../db";
import { HttpError } from "../http";
import { decryptSecret, encryptSecret, keyHint } from "../crypto";
import { allowPrivateUrls, assertPublicUrl } from "../net";
import { chatComplete, AiError, type LlmConfig } from "../ai/llm";
import { normalizeAiInput, providerPreset } from "@/core/ai/providers";
import { buildGenerationMessages, clampCount } from "@/core/ai/prompt";
import { parseAiResponse } from "@/core/ai/parse";
import { htmlToText } from "@/core/ai/extract";
import { extractPdfText } from "@/core/ai/pdf";
import { normalizeSource } from "@/core/ai/chunk";
import { MAX_CHUNK_CHARS, type AiCard } from "@/core/ai/types";

export interface AiSettingsView { configured: boolean; provider: string; baseUrl: string; model: string; hasKey: boolean; keyLast4: string; keyRequired: boolean; updatedAt: string | null }

interface Row { provider: string; base_url: string; model: string; key_enc: string | null; key_last4: string; updated_at: Date | string }
const owner = (uid: number) => `user:${uid}`;
const bad = (code: string, status = 400) => new HttpError(status, code);
const wrap = (e: unknown): never => { if (e instanceof Error && /^[a-z_]+$/.test(e.message) && !(e as { status?: number }).status) throw bad(e.message); throw e; };

async function row(uid: number): Promise<Row | null> {
  return (await q<Row>("SELECT provider, base_url, model, key_enc, key_last4, updated_at FROM ak_ai_settings WHERE user_id = $1", [uid]))[0] ?? null;
}

function view(r: Row | null): AiSettingsView {
  if (!r) return { configured: false, provider: "", baseUrl: "", model: "", hasKey: false, keyLast4: "", keyRequired: false, updatedAt: null };
  let keyRequired = false;
  try { keyRequired = providerPreset(r.provider).keyRequired; } catch { /* unknown provider */ }
  return { configured: true, provider: r.provider, baseUrl: r.base_url, model: r.model, hasKey: !!r.key_enc, keyLast4: r.key_enc ? r.key_last4 : "", keyRequired, updatedAt: new Date(r.updated_at).toISOString() };
}

export async function getAiSettings(uid: number): Promise<AiSettingsView> { return view(await row(uid)); }

/** Save provider config. apiKey omitted/blank keeps the stored key; clearKey removes it. The key is never returned. */
export async function saveAiSettings(uid: number, input: { provider?: unknown; baseUrl?: unknown; model?: unknown; apiKey?: unknown; clearKey?: unknown }): Promise<AiSettingsView> {
  let s;
  try { s = normalizeAiInput(input); } catch (e) { return wrap(e); }
  await assertPublicUrl(s.baseUrl, { allowPrivate: allowPrivateUrls() });
  const prev = await row(uid);
  let enc = prev?.key_enc ?? null, last4 = prev?.key_last4 ?? "";
  if (input.clearKey === true) { enc = null; last4 = ""; }
  if (s.apiKey) { enc = encryptSecret(s.apiKey, owner(uid)); last4 = keyHint(s.apiKey); }
  await q(`INSERT INTO ak_ai_settings (user_id, provider, base_url, model, key_enc, key_last4, updated_at) VALUES ($1, $2, $3, $4, $5, $6, now())
    ON CONFLICT (user_id) DO UPDATE SET provider = EXCLUDED.provider, base_url = EXCLUDED.base_url, model = EXCLUDED.model, key_enc = EXCLUDED.key_enc, key_last4 = EXCLUDED.key_last4, updated_at = now()`,
  [uid, s.provider, s.baseUrl, s.model, enc, last4]);
  return getAiSettings(uid);
}

export async function deleteAiSettings(uid: number) { await q("DELETE FROM ak_ai_settings WHERE user_id = $1", [uid]); }

/** Server-internal: provider config with the decrypted key. Never send this to a client. */
async function llmConfig(uid: number): Promise<LlmConfig> {
  const r = await row(uid);
  if (!r) throw bad("ai_not_configured");
  let apiKey = "";
  if (r.key_enc) { try { apiKey = decryptSecret(r.key_enc, owner(uid)); } catch { throw bad("ai_key_unreadable"); } }
  if (!apiKey && view(r).keyRequired) throw bad("ai_key_required");
  await assertPublicUrl(r.base_url, { allowPrivate: allowPrivateUrls() });
  return { provider: r.provider, baseUrl: r.base_url, model: r.model, apiKey };
}

const GenerateInput = z.object({
  text: z.string().max(MAX_CHUNK_CHARS * 2, "text_too_long"),
  style: z.enum(["qa", "cloze", "mixed"]).default("mixed"),
  count: z.coerce.number().default(10),
  language: z.string().max(40).default("auto"),
  title: z.string().max(300).optional(),
  instructions: z.string().max(1000).optional(),
  part: z.object({ index: z.coerce.number().int().min(1), total: z.coerce.number().int().min(1) }).optional(),
});
export type GenerateInput = z.input<typeof GenerateInput>;

/** One LLM call → validated cards. The client splits long documents (core/ai/chunk) and calls this per chunk. */
export async function generateCards(uid: number, input: GenerateInput, deps: { fetchImpl?: typeof fetch } = {}): Promise<{ cards: AiCard[]; warnings: string[] }> {
  const p = GenerateInput.safeParse(input);
  if (!p.success) throw bad(p.error.issues[0]?.message === "text_too_long" ? "text_too_long" : "invalid_input");
  const req = p.data;
  if (!req.text.trim()) throw bad("text_required");
  const cfg = await llmConfig(uid);
  const messages = buildGenerationMessages({ ...req, text: normalizeSource(req.text), count: clampCount(req.count) });
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chatComplete(cfg, attempt ? [...messages, { role: "user", content: "Your previous reply was not valid JSON. Reply again with only the JSON object." }] : messages, { fetchImpl: deps.fetchImpl });
    try { return parseAiResponse(raw, req.style); } catch (e) { lastErr = e; if ((e as Error).message !== "ai_bad_json") break; }
  }
  return wrap(lastErr);
}

/** Small round-trip to verify base URL, model and key. */
export async function testAi(uid: number, deps: { fetchImpl?: typeof fetch } = {}) {
  const cfg = await llmConfig(uid);
  const raw = await chatComplete(cfg, [{ role: "system", content: "Reply with JSON only." }, { role: "user", content: 'Reply with {"ok": true}' }], { maxTokens: 20, timeoutMs: 20000, fetchImpl: deps.fetchImpl });
  return { ok: true, model: cfg.model, reply: raw.slice(0, 80) };
}

export const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

export function textFromPdf(bytes: Uint8Array) {
  try { return extractPdfText(bytes, (b) => new Uint8Array(inflateSync(b))); } catch (e) { return wrap(e); }
}

/** Fetch a public web page / PDF / text file and return readable text (SSRF-guarded, size + time capped). */
export async function fetchUrlText(raw: string, deps: { fetchImpl?: typeof fetch } = {}): Promise<{ title: string; text: string; url: string }> {
  const f = deps.fetchImpl ?? fetch;
  let url = (await assertPublicUrl(raw)).toString();
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    try {
      res = await f(url, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Mozilla/5.0 (compatible; Anki-ji/1.0; +https://anki-ji.vercel.app)", Accept: "text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9,*/*;q=0.5" } });
    } catch { throw bad("url_unreachable"); }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = (await assertPublicUrl(new URL(res.headers.get("location")!, url).toString())).toString(); continue; }
    break;
  }
  if (!res || !res.ok) throw bad(res && (res.status === 401 || res.status === 403) ? "url_forbidden" : "url_fetch_failed");
  const len = Number(res.headers.get("content-length"));
  if (len > MAX_SOURCE_BYTES) throw bad("source_too_large", 413);
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_SOURCE_BYTES) { await reader.cancel(); throw bad("source_too_large", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let o = 0; for (const c of chunks) { bytes.set(c, o); o += c.length; }
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  if (type.includes("pdf") || /\.pdf(\?|$)/i.test(url)) { const r = textFromPdf(bytes); return { title: decodeURIComponent(url.split("/").pop() ?? ""), text: r.text, url }; }
  const charset = /charset=([\w-]+)/.exec(type)?.[1];
  let text: string;
  try { text = new TextDecoder(charset || "utf-8").decode(bytes); } catch { text = new TextDecoder("utf-8").decode(bytes); }
  if (type.includes("html") || /^\s*<(!doctype|html)/i.test(text)) {
    const h = htmlToText(text);
    if (!h.text.trim()) throw bad("url_no_text");
    return { ...h, url };
  }
  if (type.startsWith("text/") || type.includes("json") || type.includes("markdown") || !type) return { title: "", text: text.trim(), url };
  throw bad("unsupported_source");
}

export { AiError };
