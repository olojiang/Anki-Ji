import { authed, body } from "@/server/http";
import { saveSubscription, removeSubscription, countSubscriptions, type IncomingSubscription } from "@/server/services/reminders";
import { vapidFromEnv } from "@/server/webpush";

/** Public VAPID key + whether push is configured on the server. */
export const GET = authed(async (_req, { uid }) => {
  const v = vapidFromEnv();
  return { configured: !!v, publicKey: v?.publicKey ?? null, subscriptions: await countSubscriptions(uid) };
});
export const POST = authed(async (req, { uid }) => {
  await saveSubscription(uid, await body<IncomingSubscription>(req), req.headers.get("user-agent") ?? "");
  return { ok: true, subscriptions: await countSubscriptions(uid) };
});
export const DELETE = authed(async (req, { uid }) => {
  const b = await body<{ endpoint: string }>(req);
  await removeSubscription(uid, String(b.endpoint ?? ""));
  return { ok: true, subscriptions: await countSubscriptions(uid) };
});
