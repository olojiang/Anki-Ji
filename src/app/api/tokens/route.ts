import { authed, body } from "@/server/http";
import { createToken, listTokens } from "@/server/repo/tokens";

export const GET = authed(async (_req, { uid }) => ({ tokens: await listTokens(uid) }));

/** Creates a token; the plaintext is returned only in this response. */
export const POST = authed(async (req, { uid }) => {
  const b = await body<{ name?: string }>(req);
  return { token: await createToken(uid, String(b.name ?? "")) };
});
