import { cronRoute } from "@/server/cron";
import { runReminders } from "@/server/services/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Vercel Cron (daily on Hobby; safe to run hourly): daily study reminders via Web Push. */
export const GET = cronRoute(async () => runReminders({ deadline: Date.now() + 50_000 }));
