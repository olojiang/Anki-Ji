import { authed } from "@/server/http";
import { testAi } from "@/server/services/ai";

export const maxDuration = 30;
export const POST = authed(async (_req, { uid }) => testAi(uid));
