import { authed, intParam } from "@/server/http";
import { rebuildFiltered } from "@/server/services/filtered";
export const POST = authed(async (_req, { uid, params }) => ({ count: await rebuildFiltered(uid, intParam(params.id)) }));
