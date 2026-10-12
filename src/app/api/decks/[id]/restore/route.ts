import { authed, intParam } from "@/server/http";
import { restoreDeck } from "@/server/repo/decks";
export const POST = authed(async (_req, { uid, params }) => { await restoreDeck(uid, intParam(params.id)); return { ok: true }; });
