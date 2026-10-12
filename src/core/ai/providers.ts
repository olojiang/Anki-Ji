/** Bring-your-own-key provider presets. Everything except Anthropic speaks the OpenAI chat-completions API. */
export type ProviderApi = "openai" | "anthropic";
export interface ProviderPreset { id: string; label: string; api: ProviderApi; baseUrl: string; model: string; keyRequired: boolean; keyUrl?: string }

export const AI_PROVIDERS: ProviderPreset[] = [
  { id: "openai", label: "OpenAI", api: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", keyRequired: true, keyUrl: "https://platform.openai.com/api-keys" },
  { id: "deepseek", label: "DeepSeek", api: "openai", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", keyRequired: true, keyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "moonshot", label: "Moonshot (Kimi)", api: "openai", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k", keyRequired: true, keyUrl: "https://platform.moonshot.cn/console/api-keys" },
  { id: "openrouter", label: "OpenRouter", api: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", keyRequired: true, keyUrl: "https://openrouter.ai/keys" },
  { id: "ollama", label: "Ollama (local)", api: "openai", baseUrl: "http://localhost:11434/v1", model: "llama3.1", keyRequired: false },
  { id: "anthropic", label: "Anthropic Claude", api: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5", keyRequired: true, keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "custom", label: "Custom (OpenAI-compatible)", api: "openai", baseUrl: "", model: "", keyRequired: false },
];

export function providerPreset(id: string): ProviderPreset {
  const p = AI_PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error("ai_invalid_provider");
  return p;
}

export interface AiSettingsInput { provider: string; baseUrl: string; model: string; apiKey?: string }

/** Validate user input; fills preset defaults for blank base URL / model. apiKey undefined = keep existing. */
export function normalizeAiInput(i: { provider?: unknown; baseUrl?: unknown; model?: unknown; apiKey?: unknown }): AiSettingsInput {
  const p = providerPreset(String(i.provider ?? ""));
  const rawUrl = typeof i.baseUrl === "string" && i.baseUrl.trim() ? i.baseUrl.trim() : p.baseUrl;
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("ai_invalid_base_url"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("ai_invalid_base_url");
  if (url.username || url.password) throw new Error("ai_invalid_base_url");
  const baseUrl = url.toString().replace(/\/+$/, "");
  const model = (typeof i.model === "string" && i.model.trim() ? i.model.trim() : p.model).slice(0, 200);
  if (!model) throw new Error("ai_model_required");
  const out: AiSettingsInput = { provider: p.id, baseUrl, model };
  if (typeof i.apiKey === "string" && i.apiKey.trim()) {
    const k = i.apiKey.trim();
    if (k.length > 500 || /\s/.test(k)) throw new Error("ai_invalid_key");
    out.apiKey = k;
  }
  return out;
}
