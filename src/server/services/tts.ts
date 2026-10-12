/** Per-user TTS preferences by scope: "default", "type:<noteType>", "deck:<id>". */
import { q } from "../db";
import { HttpError } from "../http";
import { normalizeTtsOptions, ttsScopeValid, type TtsOptions } from "@/core/tts";

export async function getTtsSettings(uid: number): Promise<{ scopes: Record<string, TtsOptions>; deckParents: Record<number, number | null> }> {
  const rows = await q<{ scope: string; opts: Partial<TtsOptions> }>("SELECT scope, opts FROM ak_tts_settings WHERE user_id = $1", [uid]);
  const decks = await q<{ id: number; parent_id: number | null }>("SELECT id, parent_id FROM ak_decks WHERE user_id = $1 AND deleted_at IS NULL", [uid]);
  return {
    scopes: Object.fromEntries(rows.map((r) => [r.scope, normalizeTtsOptions(r.opts)])),
    deckParents: Object.fromEntries(decks.map((d) => [Number(d.id), d.parent_id == null ? null : Number(d.parent_id)])),
  };
}

/** opts null removes the scope (inherit). */
export async function setTtsScope(uid: number, scope: string, opts: Partial<TtsOptions> | null) {
  if (typeof scope !== "string" || !ttsScopeValid(scope)) throw new HttpError(400, "invalid_scope");
  if (scope.startsWith("deck:")) {
    const own = await q("SELECT 1 FROM ak_decks WHERE user_id = $1 AND id = $2", [uid, Number(scope.slice(5))]);
    if (!own.length) throw new HttpError(404, "deck_not_found");
  }
  if (opts === null) { await q("DELETE FROM ak_tts_settings WHERE user_id = $1 AND scope = $2", [uid, scope]); return null; }
  const n = normalizeTtsOptions(opts);
  await q(`INSERT INTO ak_tts_settings (user_id, scope, opts, updated_at) VALUES ($1, $2, $3::jsonb, now())
    ON CONFLICT (user_id, scope) DO UPDATE SET opts = EXCLUDED.opts, updated_at = now()`, [uid, scope, JSON.stringify(n)]);
  return n;
}
