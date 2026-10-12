import { authed } from "@/server/http";
import { getUser } from "@/server/repo/users";
import { sendTestReminder } from "@/server/services/reminders";

export const POST = authed(async (_req, { uid }) => sendTestReminder(uid, (await getUser(uid))?.settings.locale ?? "zh"));
