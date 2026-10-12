import { authed, intParam } from "@/server/http";
import { purgeDeck } from "@/server/repo/decks";
export const POST = authed(async (_req, { uid, params }) => { await purgeDeck(uid, intParam(params.id)); return { ok: true }; });
