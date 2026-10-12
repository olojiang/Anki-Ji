import { authed, body } from "@/server/http";
import { deleteAiSettings, getAiSettings, saveAiSettings } from "@/server/services/ai";

export const GET = authed(async (_req, { uid }) => getAiSettings(uid));
export const PUT = authed(async (req, { uid }) => saveAiSettings(uid, await body(req)));
export const DELETE = authed(async (_req, { uid }) => { await deleteAiSettings(uid); return getAiSettings(uid); });
