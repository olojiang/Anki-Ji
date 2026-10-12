import { q } from "../db";
import { normalizePrefs, type StudyPrefs } from "@/core/reminders";

export async function getPrefs(uid: number): Promise<StudyPrefs> {
  const rows = await q("SELECT prefs FROM ak_study_prefs WHERE user_id = $1", [uid]);
  return normalizePrefs((rows[0]?.prefs ?? {}) as Partial<StudyPrefs>);
}

export async function updatePrefs(uid: number, patch: Partial<StudyPrefs>): Promise<StudyPrefs> {
  const cur = await getPrefs(uid);
  const next = normalizePrefs({ ...cur, ...pickKnown(patch) });
  await q(
    `INSERT INTO ak_study_prefs (user_id, prefs, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`,
    [uid, JSON.stringify(next)]);
  return next;
}

const KEYS: (keyof StudyPrefs)[] = ["autoOptimize", "goalType", "goalTarget", "reminderEnabled", "reminderHour", "reminderQuiet"];
function pickKnown(p: Partial<StudyPrefs>) {
  const out: Partial<StudyPrefs> = {};
  for (const k of KEYS) if (p && k in p) (out as Record<string, unknown>)[k] = p[k];
  return out;
}
