import { authed, body } from "@/server/http";
import { getTtsSettings, setTtsScope } from "@/server/services/tts";
import type { TtsOptions } from "@/core/tts";

export const GET = authed(async (_req, { uid }) => getTtsSettings(uid));
export const PUT = authed(async (req, { uid }) => {
  const b = await body<{ scope: string; opts: Partial<TtsOptions> | null }>(req);
  return { scope: b.scope, opts: await setTtsScope(uid, b.scope, b.opts ?? null) };
});
