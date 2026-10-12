import { authed } from "@/server/http";
import { cloneShare } from "@/server/services/share";

export const maxDuration = 60;

export const POST = authed(async (_req, { uid, params }) => cloneShare(uid, String(params.slug ?? "")));
