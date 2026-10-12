/** Minimal LLM client: OpenAI-compatible chat completions + Anthropic messages. Errors map to stable codes. */
import { providerPreset } from "@/core/ai/providers";
import type { ChatMessage } from "@/core/ai/types";

export interface LlmConfig { provider: string; baseUrl: string; model: string; apiKey: string }
export class AiError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number, public detail?: string) { super(message); }
}

async function errorFrom(res: Response): Promise<AiError> {
  let detail = "";
  try { const j = await res.clone().json(); detail = String(j?.error?.message ?? j?.error ?? j?.message ?? ""); } catch { try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ } }
  const ra = Number(res.headers.get("retry-after"));
  if (res.status === 401 || res.status === 403) return new AiError(400, "ai_bad_key", undefined, detail);
  if (res.status === 402) return new AiError(400, "ai_quota", undefined, detail);
  if (res.status === 429) return /quota|balance|billing|insufficient/i.test(detail) ? new AiError(400, "ai_quota", undefined, detail) : new AiError(429, "ai_rate_limited", Number.isFinite(ra) && ra > 0 ? ra : undefined, detail);
  if (res.status === 404) return new AiError(400, "ai_model_not_found", undefined, detail);
  if (res.status === 400 || res.status === 413 || res.status === 422) {
    if (/context|too long|maximum.*tokens|token limit|too large/i.test(detail)) return new AiError(400, "ai_input_too_long", undefined, detail);
    if (/model/i.test(detail) && /not|invalid|exist|support/i.test(detail)) return new AiError(400, "ai_model_not_found", undefined, detail);
    return new AiError(400, "ai_bad_request", undefined, detail);
  }
  return new AiError(502, "ai_provider_error", undefined, detail || `HTTP ${res.status}`);
}

export async function chatComplete(cfg: LlmConfig, messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<string> {
  const f = opts.fetchImpl ?? fetch;
  const api = (() => { try { return providerPreset(cfg.provider).api; } catch { return "openai"; } })();
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 55000);
  const send = async (url: string, headers: Record<string, string>, body: unknown) => {
    try { return await f(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal, redirect: "error" }); }
    catch (e) {
      const name = (e as Error)?.name;
      throw new AiError(name === "TimeoutError" || name === "AbortError" ? 504 : 502, name === "TimeoutError" || name === "AbortError" ? "ai_timeout" : "ai_unreachable");
    }
  };

  if (api === "anthropic") {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const body = { model: cfg.model, max_tokens: opts.maxTokens ?? 8000, ...(system ? { system } : {}), messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })) };
    const res = await send(`${base.replace(/\/v1$/, "")}/v1/messages`, { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" }, body);
    if (!res.ok) throw await errorFrom(res);
    const j = await res.json().catch(() => null);
    const text = Array.isArray(j?.content) ? j.content.filter((c: { type?: string }) => c?.type === "text").map((c: { text?: string }) => c.text ?? "").join("") : "";
    if (!text) throw new AiError(502, "ai_empty_response");
    return text;
  }

  const headers: Record<string, string> = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};
  if (cfg.provider === "openrouter") { headers["HTTP-Referer"] = "https://anki-ji.vercel.app"; headers["X-Title"] = "Anki-ji"; }
  const body: Record<string, unknown> = { model: cfg.model, messages, temperature: 0.3, max_tokens: opts.maxTokens ?? 8000 };
  if (opts.json !== false) body.response_format = { type: "json_object" };
  let res = await send(`${base}/chat/completions`, headers, body);
  if (!res.ok && res.status === 400 && body.response_format) {
    const err = await errorFrom(res);
    if (/response_format|json_object|json mode/i.test(err.detail ?? "")) {
      delete body.response_format;
      res = await send(`${base}/chat/completions`, headers, body);
    } else throw err;
  }
  if (!res.ok) throw await errorFrom(res);
  const j = await res.json().catch(() => null);
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AiError(502, "ai_empty_response");
  return text;
}
