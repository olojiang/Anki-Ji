import { authed, body } from "@/server/http";
import { getUser, updateUser } from "@/server/repo/users";

export const GET = authed(async (_req, { uid }) => ({ user: await getUser(uid) }));
export const PATCH = authed(async (req, { uid }) => {
  const b = await body<{ name?: string; settings?: Record<string, unknown> }>(req);
  return { user: await updateUser(uid, { name: b.name, settings: b.settings }) };
});
