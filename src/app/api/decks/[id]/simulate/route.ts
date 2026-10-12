import { authed, body, intParam } from "@/server/http";
import { simulateDeck, type SimOverrides } from "@/server/services/simulate";

export const maxDuration = 30;
/** Simulate workload/knowledge for retention 0.70–0.97; body may override weights and limits (unsaved edits). */
export const POST = authed(async (req, { uid, params }) => simulateDeck(uid, intParam(params.id), await body<SimOverrides>(req)));
