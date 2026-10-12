import { authed, body } from "@/server/http";
import { getModeRecords, saveModeRecord } from "@/server/services/modes";

export const GET = authed(async (req, { uid }) => ({ records: await getModeRecords(uid, req.nextUrl.searchParams.get("key") ?? "") }));

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ key: string; mode: string; ms?: number; score?: number }>(req);
  return saveModeRecord(uid, b);
});
