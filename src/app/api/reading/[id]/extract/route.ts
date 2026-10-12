import { authed, body, intParam } from "@/server/http";
import { createExtract } from "@/server/services/reading";
import { userContext } from "@/server/services/context";

export const POST = authed(async (req, { uid, params }) => {
  const b = await body<{ text: string }>(req);
  const { today } = await userContext(uid);
  return { item: await createExtract(uid, intParam(params.id), String(b.text ?? ""), today) };
});
