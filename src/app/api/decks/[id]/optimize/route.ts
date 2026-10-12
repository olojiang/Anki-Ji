import { authed, intParam } from "@/server/http";
import { optimizeDeck } from "@/server/services/optimizer";
export const maxDuration = 60;
export const POST = authed(async (_req, { uid, params }) => optimizeDeck(uid, intParam(params.id)));
