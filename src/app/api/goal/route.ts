import { authed } from "@/server/http";
import { goalStatus } from "@/server/services/goal";
export const GET = authed(async (_req, { uid }) => goalStatus(uid));
