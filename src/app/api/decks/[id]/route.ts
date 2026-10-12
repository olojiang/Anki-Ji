import { authed, body, intParam, HttpError } from "@/server/http";
import { getDeck, updateDeck, softDeleteDeck, applyConfigToSubtree } from "@/server/repo/decks";
import type { DeckConfig } from "@/core/types";
import type { FilterSpec } from "@/server/repo/mappers";

export const GET = authed(async (_req, { uid, params }) => {
  const deck = await getDeck(uid, intParam(params.id));
  if (!deck) throw new HttpError(404, "deck_not_found");
  return { deck };
});

export const PATCH = authed(async (req, { uid, params }) => {
  const id = intParam(params.id);
  const b = await body<{ name?: string; config?: Partial<DeckConfig>; filter?: FilterSpec; applyToChildren?: boolean }>(req);
  const ok = await updateDeck(uid, id, { name: b.name, config: b.config, filter: b.filter });
  if (!ok) throw new HttpError(404, "deck_not_found");
  if (b.applyToChildren && b.config) await applyConfigToSubtree(uid, id, (await getDeck(uid, id))!.config);
  return { deck: await getDeck(uid, id) };
});

export const DELETE = authed(async (_req, { uid, params }) => {
  await softDeleteDeck(uid, intParam(params.id));
  return { ok: true };
});
