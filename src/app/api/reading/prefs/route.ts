import { authed, body } from "@/server/http";
import { getReadingPrefs, setReadingPrefs } from "@/server/services/reading";

export const GET = authed(async (_req, { uid }) => ({ prefs: await getReadingPrefs(uid) }));
export const PATCH = authed(async (req, { uid }) => ({ prefs: await setReadingPrefs(uid, await body<{ dailyCap?: number }>(req)) }));
