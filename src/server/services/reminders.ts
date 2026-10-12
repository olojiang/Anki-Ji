import { q } from "../db";
import { deckCounts } from "./study";
import { listDecks } from "../repo/decks";
import { normalizeSettings } from "@/core/settings";
import { normalizePrefs, reminderPayload, shouldSendReminder, type StudyPrefs } from "@/core/reminders";
import { sendPush, vapidFromEnv, type PushSubscriptionRow } from "../webpush";
import { HttpError } from "../http";

export interface IncomingSubscription { endpoint: string; keys: { p256dh: string; auth: string } }

export async function saveSubscription(uid: number, sub: IncomingSubscription, userAgent = "") {
  const ok = typeof sub?.endpoint === "string" && /^https:\/\//.test(sub.endpoint) && sub.endpoint.length < 2048 && typeof sub.keys?.p256dh === "string" && typeof sub.keys?.auth === "string";
  if (!ok) throw new HttpError(400, "invalid_subscription");
  await q(
    `INSERT INTO ak_push_subs (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
    [uid, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent.slice(0, 200)]);
}

export async function removeSubscription(uid: number, endpoint: string) {
  await q("DELETE FROM ak_push_subs WHERE user_id = $1 AND endpoint = $2", [uid, endpoint]);
}

export async function countSubscriptions(uid: number) {
  return Number((await q("SELECT count(*)::int AS n FROM ak_push_subs WHERE user_id = $1", [uid]))[0]?.n ?? 0);
}

/** Cards due now across all top-level decks (respecting daily limits). */
export async function dueNow(uid: number) {
  const [counts, decks] = await Promise.all([deckCounts(uid), listDecks(uid)]);
  return decks.filter((d) => d.parentId == null).reduce((a, d) => { const c = counts[d.id]; return c ? a + c.new + c.learning + c.review : a; }, 0);
}

type Sender = (sub: PushSubscriptionRow, payload: unknown) => Promise<{ status: number; gone: boolean }>;

async function deliver(uid: number, payload: unknown, sender: Sender) {
  const subs = await q("SELECT endpoint, p256dh, auth FROM ak_push_subs WHERE user_id = $1", [uid]);
  let delivered = 0;
  for (const s of subs) {
    const sub = { endpoint: String(s.endpoint), p256dh: String(s.p256dh), auth: String(s.auth) };
    try {
      const r = await sender(sub, payload);
      if (r.gone) await q("DELETE FROM ak_push_subs WHERE endpoint = $1", [sub.endpoint]);
      else if (r.status >= 200 && r.status < 300) delivered++;
    } catch { /* transient network error: try again next run */ }
  }
  return delivered;
}

function envSender(): Sender {
  const vapid = vapidFromEnv();
  if (!vapid) throw new HttpError(503, "push_not_configured");
  return (sub, payload) => sendPush(sub, payload, vapid);
}

/** Cron: send the daily reminder to every user whose reminder moment has passed and who hasn't had it yet. */
export async function runReminders(opts: { now?: Date; sender?: Sender; deadline?: number } = {}) {
  const now = opts.now ?? new Date();
  const sender = opts.sender ?? envSender();
  const rows = await q(
    `SELECT p.user_id, p.prefs, p.reminder_last_sent_at, u.settings, (SELECT count(*)::int FROM ak_push_subs s WHERE s.user_id = p.user_id) AS subs
     FROM ak_study_prefs p JOIN ak_users u ON u.id = p.user_id
     WHERE (p.prefs->>'reminderEnabled')::boolean = true`);
  let users = 0, delivered = 0, skipped = 0;
  for (const r of rows) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    const uid = Number(r.user_id);
    const prefs = normalizePrefs(r.prefs as Partial<StudyPrefs>);
    const settings = normalizeSettings(r.settings as never);
    const lastSentAt = r.reminder_last_sent_at ? new Date(String(r.reminder_last_sent_at instanceof Date ? r.reminder_last_sent_at.toISOString() : r.reminder_last_sent_at)) : null;
    const base = { enabled: prefs.reminderEnabled, hour: prefs.reminderHour, tz: settings.timezone, lastSentAt, now, quietIfNothingDue: prefs.reminderQuiet, subscriptions: Number(r.subs) };
    // cheap pre-check before counting due cards
    if (!shouldSendReminder({ ...base, dueCount: 1, quietIfNothingDue: false })) { skipped++; continue; }
    const due = await dueNow(uid);
    if (!shouldSendReminder({ ...base, dueCount: due })) { skipped++; continue; }
    const n = await deliver(uid, reminderPayload(settings.locale, due), sender);
    // mark as handled for this reminder moment even if every endpoint failed, so a broken endpoint can't cause spam
    await q("UPDATE ak_study_prefs SET reminder_last_sent_at = $2 WHERE user_id = $1", [uid, now.toISOString()]);
    users++; delivered += n;
  }
  return { users, delivered, skipped, checked: rows.length };
}

/** Settings → "send test notification". */
export async function sendTestReminder(uid: number, locale: "zh" | "en", sender?: Sender) {
  const due = await dueNow(uid);
  const delivered = await deliver(uid, { ...reminderPayload(locale, due), tag: "anki-ji-test" }, sender ?? envSender());
  return { delivered, due };
}
