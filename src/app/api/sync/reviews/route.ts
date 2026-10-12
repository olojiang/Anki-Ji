import { authed, body } from "@/server/http";
import { syncReviews } from "@/server/services/sync";

/** Idempotent replay of reviews answered offline (client-generated ids; duplicates ignored). */
export const POST = authed(async (req, { uid }) => syncReviews(uid, await body(req)));
