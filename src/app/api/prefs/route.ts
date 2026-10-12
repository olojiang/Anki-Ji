import { authed, body } from "@/server/http";
import { getPrefs, updatePrefs } from "@/server/services/prefs";
import type { StudyPrefs } from "@/core/reminders";

export const GET = authed(async (_req, { uid }) => ({ prefs: await getPrefs(uid) }));
export const PATCH = authed(async (req, { uid }) => ({ prefs: await updatePrefs(uid, await body<Partial<StudyPrefs>>(req)) }));
