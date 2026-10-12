import { authed, intParam } from "@/server/http";
import { emptyFiltered } from "@/server/services/filtered";
export const POST = authed(async (_req, { uid, params }) => { await emptyFiltered(uid, intParam(params.id)); return { ok: true }; });
